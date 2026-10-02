import assert from "node:assert/strict";
import test from "node:test";
import { calculateCapabilityMenuPlacement } from "../src/capabilityMenuPlacement.js";
import { adminSectionFromPath } from "../src/routing.js";

test("学习问答菜单向上展开时，首项不会被顶部导航遮挡，末项可滚动到", () => {
  const placement = calculateCapabilityMenuPlacement({
    triggerBounds: { top: 570, bottom: 608, left: 180, right: 218 },
    headerBottom: 90,
    viewportWidth: 772,
    viewportHeight: 772,
    desiredHeight: 430,
  });
  assert.equal(placement.top, 132);
  assert.equal(placement.maxHeight, 464);
  assert.ok(placement.maxHeight >= 54, "至少有一项完整可见");
});

test("靠近顶部时菜单改向下展开，并保持在视口内", () => {
  const placement = calculateCapabilityMenuPlacement({
    triggerBounds: { top: 110, bottom: 148, left: 740, right: 772 },
    headerBottom: 90,
    viewportWidth: 772,
    viewportHeight: 772,
    desiredHeight: 430,
    align: "end",
  });
  assert.equal(placement.top, 156);
  assert.ok(placement.left >= 12);
  assert.ok(placement.left + placement.width <= 760);
});

test("举报处理有独立路由，点击后不会退回总览", () => {
  assert.equal(adminSectionFromPath("/admin/reports"), "reports");
});
