import { BadRequestException, Injectable } from "@nestjs/common";
import type { Actor } from "../auth/auth.service";
import type { ExecuteAgentRunInput } from "./agent.contracts";
import { AgentService } from "./agent.service";
import { runModelLoop } from "./agent-runtime";
import type { ModelAdapter, ModelRequest, ModelToolDefinition } from "../generation/model-adapter";
import { ModelRegistry } from "../generation/model-registry";
import { executePlatformTool, platformToolDefinitions } from "./agent-tools";
import { portalSearchQuerySchema } from "../portal/portal.contracts";
import { PortalService } from "../portal/portal.service";

const scenarioInstruction = {
  ui_design: "输出可实施的 UI 设计说明：目标用户、信息层级、视觉方向、组件与交互建议。",
  webpage_generation: "输出可实施的网页构建说明：页面结构、组件树、状态、响应式与验收标准。不要输出未经验证的部署链接。",
  pattern_generation: "输出可实施的图案生成说明：视觉主题、构图、色彩、材质、节点/提示词和迭代方案。",
} as const;

function mockResult(scenario: keyof typeof scenarioInstruction, prompt: string) {
  return [
    "这是基础 Harness 的模拟结果，已完整走过 Agent Run 审计链路。",
    `场景：${scenario}。`,
    `需求摘要：${prompt.slice(0, 500)}`,
    scenarioInstruction[scenario],
    "下一步：确认风格与目标受众后，再调用对应图像、网页或节点工作流模型。",
  ].join("\n");
}

const harnessProbeTool: ModelToolDefinition = {
  type: "function",
  function: {
    name: "harness_probe",
    description: "基础循环探针，仅用于验证工具调用和多轮回传。",
    parameters: { type: "object", properties: { round: { type: "integer" } }, required: ["round"] },
  },
};

const toolUsePolicy = [
  "你是 ArtEdu 平台的 AI 设计助教。",
  "涉及平台课程、课时、案例、工作流、学习进度或平台内容时，必须先调用可用工具获取事实，再回答。",
  "不得凭记忆编造课程、案例、作者、工作流、链接或执行结果。",
  "需求不明确时先搜索；获得明确 ID 后再读取详情。",
  "涉及保存成果或启动工作流时，必须先向用户说明并等待明确确认。",
  "工具返回 not_implemented 时，必须如实说明接口已预留但当前尚未实现。",
].join("\n");

function createMockLoopAdapter(scenario: keyof typeof scenarioInstruction, prompt: string): ModelAdapter {
  let calls = 0;
  return {
    id: "harness-mock",
    capabilities: ["chat"],
    async execute(request: ModelRequest) {
      calls += 1;
      const toolMessages = request.messages?.filter((message) => message.role === "tool").length ?? 0;
      if (calls === 1) {
        return { kind: "text", content: "", toolCalls: [{ id: "harness-probe-1", type: "function", function: { name: "harness_probe", arguments: JSON.stringify({ round: calls }) } }] };
      }
      return { kind: "text", content: mockResult(scenario, `${prompt}\n已完成工具轮次：${toolMessages}`), finishReason: "stop" };
    },
  };
}

@Injectable()
export class AgentHarnessService {
  constructor(private readonly agents: AgentService, private readonly models: ModelRegistry, private readonly portal: PortalService) {}

  async execute(actor: Actor, runId: string, input: ExecuteAgentRunInput) {
    const run = await this.agents.claimForExecution(actor, runId);
    const prompt = typeof run.input.prompt === "string" ? run.input.prompt : "";
    if (!prompt) throw new BadRequestException("Agent Run 缺少创作需求");

    const scenario = run.scenario as keyof typeof scenarioInstruction;
    const systemPrompt = input.systemPrompt ?? `${toolUsePolicy}\n${scenarioInstruction[scenario]}\n输出应清晰、可执行，并避免编造文件、链接或已完成的生成结果。`;
    await this.agents.appendAgentMessage(runId, "正在整理创作需求并准备调用模型。");

    try {
      if (input.mode === "local") {
        await this.agents.attachExecutionInput(runId, {
          providerId: input.providerId ?? null,
          systemPrompt,
          context: input.context,
          model: input.model,
        });
        await this.agents.appendToolCall(runId, "local_bridge.dispatch", {
          scenario, providerId: input.providerId ?? null, systemPrompt, contextMessageCount: input.context.length, model: input.model,
        }, { state: "waiting_local_bridge", secretTransferred: false });
        await this.agents.appendAgentMessage(runId, "任务已派发至本地 Model Bridge；云端不会接收模型密钥。请保持本地 Bridge 在线。 ");
        return this.agents.waitForLocalBridge(runId);
      }
      const result = input.mode === "mock"
        ? await runModelLoop({
          adapter: createMockLoopAdapter(scenario, prompt),
          request: {
            jobType: "chat",
            messages: [
              { role: "system", content: systemPrompt },
              ...input.context,
              { role: "user", content: prompt },
            ],
            parameters: { ...input.model, tools: [harnessProbeTool] },
          },
          tools: [harnessProbeTool],
          executeTool: {
            execute: async (call, context) => {
              if (call.function.name !== harnessProbeTool.function.name) throw new Error(`未注册的 harness 工具: ${call.function.name}`);
              const parsed = JSON.parse(call.function.arguments) as { round?: number };
              await this.agents.appendToolCall(runId, call.function.name, { round: context.round, arguments: parsed }, { accepted: true });
              return { accepted: true, round: context.round };
            },
          },
          maxRounds: 4,
        })
        : input.mode === "server"
          ? await runModelLoop({
            adapter: this.models.getForJob({ jobType: "chat", providerId: input.providerId }),
            request: {
              jobType: "chat",
              providerId: input.providerId,
              messages: [
                { role: "system", content: systemPrompt },
                ...input.context,
                { role: "user", content: prompt },
              ],
              parameters: {
                ...input.model,
                toolChoice: input.model.toolChoice ?? "auto",
                tools: [harnessProbeTool, ...platformToolDefinitions, ...(input.model.tools ?? [])],
              },
            },
            tools: [harnessProbeTool, ...platformToolDefinitions, ...(input.model.tools ?? [])],
            executeTool: {
              execute: async (call, context) => {
                if (call.function.name !== harnessProbeTool.function.name) {
                  if (call.function.name === "search_platform") {
                    const args = portalSearchQuerySchema.parse(JSON.parse(call.function.arguments));
                    const searchResult = await this.portal.search(actor, args);
                    await this.agents.appendToolCall(runId, call.function.name, { round: context.round, query: args.query, type: args.type }, { status: "succeeded", resultCount: searchResult.items.length });
                    return searchResult;
                  }
                  const placeholder = await executePlatformTool(call, context);
                  await this.agents.appendToolCall(runId, call.function.name, { round: context.round }, placeholder);
                  return placeholder;
                }
                const parsed = JSON.parse(call.function.arguments) as { round?: number };
                await this.agents.appendToolCall(runId, call.function.name, { round: context.round, arguments: parsed }, { accepted: true, mode: "server" });
                return { accepted: true, round: context.round };
              },
            },
            maxRounds: 8,
          })
        : (() => { throw new BadRequestException("不支持的执行模式"); })();

      const resultProviderId = input.mode === "server"
        ? String(result.metadata?.providerId ?? input.providerId ?? "server")
        : "harness-mock";

      await this.agents.appendToolCall(runId, "model.invoke", {
        mode: input.mode,
        providerId: resultProviderId,
        scenario,
        systemPrompt,
        contextMessageCount: input.context.length,
        model: input.model,
      }, { content: result.content, providerId: resultProviderId, rounds: "rounds" in result ? result.rounds : 1, toolCallCount: "toolCallCount" in result ? result.toolCallCount : 0 });
      const artifactType = scenario === "webpage_generation" ? "webpage" : scenario === "pattern_generation" ? "pattern" : "brief";
      await this.agents.appendArtifact(runId, artifactType, { content: result.content, providerId: resultProviderId, scenario, generatedBy: "agent-harness", rounds: "rounds" in result ? result.rounds : 1 });
      await this.agents.appendAgentMessage(runId, result.content);
      return this.agents.completeRun(runId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Agent Harness 执行失败";
      await this.agents.appendToolCall(runId, "model.invoke", { mode: input.mode, scenario }, { failed: true, reason });
      await this.agents.appendArtifact(runId, "preview", { failed: true, reason, scenario }, { externalUrl: "/assets/generation-failure.png" });
      await this.agents.appendAgentMessage(runId, `生成未完成：${reason}`);
      return this.agents.failRun(runId, reason);
    }
  }

}
