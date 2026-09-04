import assert from "node:assert/strict";
import test from "node:test";
import { bulkQuotaSchema } from "./admin.contracts";

const quota = { dailyLimit: 30, monthlyLimit: 600, concurrentLimit: 2 };

test("bulk quota accepts a bounded, unique user selection", () => {
  assert.equal(bulkQuotaSchema.safeParse({ userIds: ["user-a", "user-b"], quota }).success, true);
});

test("bulk quota rejects an empty or duplicated selection", () => {
  assert.equal(bulkQuotaSchema.safeParse({ userIds: [], quota }).success, false);
  assert.equal(bulkQuotaSchema.safeParse({ userIds: ["user-a", "user-a"], quota }).success, false);
});
