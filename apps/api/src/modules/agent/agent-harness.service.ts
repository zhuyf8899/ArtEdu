import { BadRequestException, Injectable } from "@nestjs/common";
import type { Actor } from "../auth/auth.service";
import type { ExecuteAgentRunInput } from "./agent.contracts";
import { AgentService } from "./agent.service";

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

@Injectable()
export class AgentHarnessService {
  constructor(private readonly agents: AgentService) {}

  async execute(actor: Actor, runId: string, input: ExecuteAgentRunInput) {
    const run = await this.agents.claimForExecution(actor, runId);
    const prompt = typeof run.input.prompt === "string" ? run.input.prompt : "";
    if (!prompt) throw new BadRequestException("Agent Run 缺少创作需求");

    const scenario = run.scenario as keyof typeof scenarioInstruction;
    const systemPrompt = input.systemPrompt ?? `你是美院设计创作助手。${scenarioInstruction[scenario]} 输出应清晰、可执行，并避免编造文件、链接或已完成的生成结果。`;
    await this.agents.appendAgentMessage(runId, "正在整理创作需求并准备调用模型。");

    try {
      if (input.mode === "local") {
        await this.agents.appendToolCall(runId, "local_bridge.dispatch", {
          scenario, providerId: input.providerId ?? null, systemPrompt, contextMessageCount: input.context.length, model: input.model,
        }, { state: "waiting_local_bridge", secretTransferred: false });
        await this.agents.appendAgentMessage(runId, "任务已派发至本地 Model Bridge；云端不会接收模型密钥。请保持本地 Bridge 在线。 ");
        return this.agents.waitForLocalBridge(runId);
      }
      const result = input.mode === "mock"
        ? { content: mockResult(scenario, prompt), providerId: "harness-mock" }
        : (() => { throw new BadRequestException("不支持的执行模式"); })();

      await this.agents.appendToolCall(runId, "model.invoke", {
        mode: input.mode,
        providerId: result.providerId,
        scenario,
        systemPrompt,
        contextMessageCount: input.context.length,
        model: input.model,
      }, { content: result.content, providerId: result.providerId });
      const artifactType = scenario === "webpage_generation" ? "webpage" : scenario === "pattern_generation" ? "pattern" : "brief";
      await this.agents.appendArtifact(runId, artifactType, { content: result.content, providerId: result.providerId, scenario, generatedBy: "agent-harness" });
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
