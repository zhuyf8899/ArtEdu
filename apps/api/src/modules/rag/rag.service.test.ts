import assert from "node:assert/strict";
import test from "node:test";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { RagService } from "./rag.service";

const student: Actor = { id: "student-1", username: "student-1", displayName: "测试学生", accountStatus: "active", roles: ["student"] };

test("课程 RAG 优先返回已授权课程转写文本中的可追溯证据", async () => {
  let calls = 0;
  const database = {
    async query() {
      calls += 1;
      if (calls === 1) return { rows: [{ status: "published", created_by: "teacher-1" }], rowCount: 1 };
      if (calls === 2) return { rows: [{ exists: 1 }], rowCount: 1 };
      return {
        rows: [{
          id: "resource-1", title: "宋锦纹样课程转写", resource_type: "video",
          transcript_text: "宋锦的配色规律强调综合色彩层次，并以低饱和色建立稳定的视觉节奏。",
          match_position: 1,
        }],
        rowCount: 1,
      };
    },
  } as unknown as DatabaseService;

  const service = new RagService(database);
  const result = await service.query(student, "course-1", { query: "宋锦的配色规律", scope: "course", allowWebFallback: false });

  assert.equal(result.retrievalState, "local_text_evidence");
  assert.equal(result.localEvidence.length, 1);
  assert.equal(result.localEvidence[0].resourceId, "resource-1");
  assert.match(result.localEvidence[0].excerpt, /低饱和色/);
  assert.equal(result.webFallbackEligible, false);
});

test("课程 RAG 没有本地文本命中时如实等待 embedding Provider", async () => {
  let calls = 0;
  const database = {
    async query() {
      calls += 1;
      if (calls === 1) return { rows: [{ status: "published", created_by: "teacher-1" }], rowCount: 1 };
      if (calls === 2) return { rows: [{ exists: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as DatabaseService;

  const service = new RagService(database);
  const result = await service.query(student, "course-1", { query: "未出现的概念", scope: "course", allowWebFallback: true });

  assert.equal(result.retrievalState, "awaiting_embedding_provider");
  assert.deepEqual(result.localEvidence, []);
  assert.equal(result.webFallbackEligible, true);
});
