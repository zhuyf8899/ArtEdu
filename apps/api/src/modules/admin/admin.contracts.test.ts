import assert from "node:assert/strict";
import test from "node:test";
import { bulkQuotaSchema, reviewDecisionSchema } from "./admin.contracts";
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
