import assert from "node:assert/strict";
import test from "node:test";
import { portalSearchQuerySchema } from "./portal.contracts";

test("portal search trims query and applies the all type by default", () => {
  assert.deepEqual(portalSearchQuerySchema.parse({ query: "  传统纹样  " }), {
    query: "传统纹样",
    type: "all",
  });
});

test("portal search rejects empty and unsupported queries", () => {
  assert.equal(portalSearchQuerySchema.safeParse({ query: "   " }).success, false);
  assert.equal(portalSearchQuerySchema.safeParse({ query: "AI", type: "book" }).success, false);
});
