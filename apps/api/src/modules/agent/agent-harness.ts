import "dotenv/config";
import assert from "node:assert/strict";
import { executeAgentRunSchema } from "./agent.contracts";

function main() {
  const input = executeAgentRunSchema.parse({
    mode: "mock",
    context: [{ role: "assistant", content: "已确认用户希望现代、简洁的视觉方向。" }],
    model: {
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 1200,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      seed: 42,
      stop: ["<END>"],
      responseFormat: "json_object",
      stream: false,
      tools: [{ type: "function", function: { name: "create_design_brief", parameters: { type: "object" } } }],
      toolChoice: "auto",
      metadata: { source: "agent-harness" },
      providerOptions: { reasoning_effort: "medium" },
    },
  });
  assert.equal(input.mode, "mock");
  assert.equal(input.model.maxTokens, 1200);
  assert.equal(input.context.length, 1);
  console.log(JSON.stringify({ ok: true, mode: input.mode, supportedFields: Object.keys(input.model).sort() }, null, 2));
}

main();
