import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface CompletionLearningInput {
  runId: string;
  scenario: "ui_design" | "webpage_generation" | "pattern_generation";
  completedAt: string;
  result: string;
}

function redactSecrets(value: string) {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|AIza[\w-]{12,}|AKIA[0-9A-Z]{16})\b/g, "[REDACTED_SECRET]")
    .replace(/(api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED_SECRET]");
}

/** Local-only completion hook; candidates are never auto-installed or synced. */
export async function recordCompletionLearning(root: string, input: CompletionLearningInput) {
  const directory = path.resolve(root, "agent-learning");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const safeResult = redactSecrets(input.result).slice(0, 4000);
  const memoryCandidate = { type: "memory_candidate", runId: input.runId, scenario: input.scenario, createdAt: input.completedAt, value: safeResult, reviewRequired: true };
  const skillCandidate = { type: "skill_candidate", runId: input.runId, scenario: input.scenario, createdAt: input.completedAt, suggestion: `评估是否应沉淀「${input.scenario}」的可复用工作流；需人工确认范围、触发条件与安全边界。`, evidence: safeResult.slice(0, 1200), reviewRequired: true };
  await Promise.all([
    appendFile(path.join(directory, "memory-candidates.jsonl"), `${JSON.stringify(memoryCandidate)}\n`, { mode: 0o600 }),
    appendFile(path.join(directory, "skill-candidates.jsonl"), `${JSON.stringify(skillCandidate)}\n`, { mode: 0o600 }),
  ]);
}
