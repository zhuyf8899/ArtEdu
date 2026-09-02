# ArtEdu Local Model Bridge

Local Bridge runs on the user's device. It owns provider selection and API keys, invokes models locally, then returns only permitted results and progress to the cloud.

## Security boundary

- API keys are entered and stored only on the local device; the cloud receives neither keys nor authorization headers.
- The Bridge connects outward to the cloud. The cloud must not open inbound connections to a user device.
- Output is scanned locally before upload. Blocked output uploads only a redacted alert summary.

## Local two-step setup

1. Select a provider preset (or an OpenAI-compatible custom endpoint), then choose a model.
2. Prompt for the key separately, persist it in the local encrypted vault, then run a local connectivity test.

## Completion learning journal

After each completed task, call `recordCompletionLearning` from `src/completion-learning.ts`. It writes local-only candidate files under `<bridge-data>/agent-learning/`:

- `memory-candidates.jsonl`: possible reusable knowledge.
- `skill-candidates.jsonl`: possible reusable skills with evidence.

Both files require human review. Do not auto-install a suggested skill, alter future prompts automatically, or sync either file to cloud. Provider config and raw secrets must never reach this hook.
