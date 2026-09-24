import assert from "node:assert/strict";
import test from "node:test";
import { bulkQuotaSchema, reviewDecisionSchema } from "./admin.contracts";
import { getEditorialIssues } from "./admin.repository";

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
