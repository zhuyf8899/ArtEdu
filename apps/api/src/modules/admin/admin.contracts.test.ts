import assert from "node:assert/strict";
import test from "node:test";
import { bulkQuotaSchema, reviewDecisionSchema, workCollectionSchema } from "./admin.contracts";
import { AdminRepository, getEditorialIssues } from "./admin.repository";

const quota = { dailyLimit: 30, monthlyLimit: 600, concurrentLimit: 2 };

test("bulk quota accepts a bounded, unique user selection", () => {
  assert.equal(bulkQuotaSchema.safeParse({ userIds: ["user-a", "user-b"], quota }).success, true);
});

test("bulk quota rejects an empty or duplicated selection", () => {
  assert.equal(bulkQuotaSchema.safeParse({ userIds: [], quota }).success, false);
  assert.equal(bulkQuotaSchema.safeParse({ userIds: ["user-a", "user-a"], quota }).success, false);
});

test("审核资料提示识别来源、署名、授权、标签与图片缺项，但不影响决策", () => {
  assert.deepEqual(getEditorialIssues({}, 0, 0), ["未标明案例来源", "未添加检索标签", "缺少图片封面"]);
  assert.deepEqual(getEditorialIssues({ origin: "collected", creators: [], authorization: "pending" }, 2, 1), ["未填写原作者／团队", "缺少展示授权确认或授权说明"]);
  assert.deepEqual(getEditorialIssues({ origin: "collected", creators: ["作者"], authorization: "confirmed", authorizationNote: "校内展示授权" }, 2, 1), []);
});

test("驳回审核必须写明修改原因，通过备注仍可选", () => {
  assert.equal(reviewDecisionSchema.safeParse({ status: "rejected", note: "  " }).success, false);
  assert.equal(reviewDecisionSchema.safeParse({ status: "rejected", note: "请补充来源和封面" }).success, true);
  assert.equal(reviewDecisionSchema.safeParse({ status: "approved" }).success, true);
});

test("审核列表提示混入正文的编辑说明，旧待审记录也不能直接通过", async () => {
  assert.match(getEditorialIssues({ origin: "platform" }, 1, 1, "本次导入中未复核资料").join("；"), /项目简介/);
  const calls: string[] = [];
  const client = { query: async (sql: string) => { calls.push(sql); return { rowCount: 1, rows: [{ title: "作品", summary: "资料整理说明：等待上传图片", story_json: { origin: "platform" } }] }; } };
  const repository = new AdminRepository({} as any);
  await assert.rejects(repository.decideReview(client as any, "work-a", "admin-a", { status: "approved", note: "" }), /项目简介/);
  assert.equal(calls.length, 1);
  assert.ok(!calls.some(sql => sql.includes("UPDATE works")));
});

test("策展模块只允许两个值，写入只更新JSON归属并留下审计", async () => {
  assert.equal(workCollectionSchema.safeParse({ collection: "art-selection" }).success, true);
  assert.equal(workCollectionSchema.safeParse({ collection: "community", status: "approved" }).success, false);
  assert.equal(workCollectionSchema.safeParse({ collection: "private" }).success, false);
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = { query: async (sql: string, values: unknown[]) => { calls.push({sql,values}); return sql.startsWith("SELECT") ? {rowCount:1,rows:[{status:"approved",story_json:{collection:"community",reflection:"作者反思"}}]} : {rowCount:1,rows:[]}; } };
  const repository = new AdminRepository({} as any);
  assert.deepEqual(await repository.setWorkCollection(client as any,"work-a","admin-a","art-selection"),{id:"work-a",collection:"art-selection"});
  assert.equal(calls.length,3);
  assert.match(calls[1].sql,/jsonb_set/);
  assert.ok(!calls[1].sql.includes("status="));
  assert.match(calls[2].sql,/audit_records/);
  const pending = { query: async () => ({rowCount:1,rows:[{status:"draft",story_json:{}}]}) };
  await assert.rejects(repository.setWorkCollection(pending as any,"work-a","admin-a","art-selection"),/已发布/);
});
