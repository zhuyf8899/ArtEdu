// 回归护栏：
// 1) 举报处理与课程发布审核原本没有任何待办提示，管理台只给作品审核挂了角标；
// 2) 浅色主题里 --lime 曾被重定义成与 --ink 相同的 #111，于是所有
//    「深色文字 + 强调色底」的按钮、页签、角标全部变成黑底黑字。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("待办角标覆盖所有栏目，举报与课程审核也计入通知", async () => {
  const dashboard = await read("../src/AdminDashboard.jsx");
  assert.ok(dashboard.includes("const pendingCounts = useMemo"), "待办数量应按栏目统计");
  assert.ok(dashboard.includes('reports: reports.filter((item) => item.status === "pending").length'));
  assert.ok(dashboard.includes('courses: courseReviews.filter((item) => item.status === "pending").length'));
  assert.ok(dashboard.includes("const pending = pendingCounts[item.id] ?? 0"), "角标必须对所有栏目生效");
  assert.ok(!dashboard.includes('item.id === "reviews" && <b>{pendingCount}</b>'), "角标不能只挂在作品审核上");
  assert.ok(dashboard.includes("pendingCounts={pendingCounts}"));
  assert.ok(dashboard.includes('if (pendingReports) items.push({ id: "reports"'), "通知中心要提醒待处理举报");
  assert.ok(dashboard.includes('if (pendingCourses) items.push({ id: "courses"'), "通知中心要提醒待发布课程");
  assert.ok(dashboard.includes("reports={reports} courseReviews={courseReviews}"), "通知所需的举报与课程审核数据要传进 Topbar");
});

test("强调色不能与文字同色，否则黑底黑字会让按钮和标签整片消失", async () => {
  const css = await read("../src/styles.css");
  const variables = new Map();
  // 注释里也会出现冒号，先去掉注释再逐条解析声明。
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of source.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const declaration of block[1].split(";")) {
      const [name, value] = declaration.split(":").map((part) => part?.trim());
      if (name?.startsWith("--") && value) variables.set(name, value);
    }
  }
  // 浏览器取最后一个 :root 定义，这里保持一致。
  const rgb = (value) => {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value ?? "");
    if (!hex) return null;
    const digits = hex[1].length === 3 ? [...hex[1]].map((character) => character + character).join("") : hex[1];
    return [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
  };
  const luminance = (values) => values
    .map((value) => { const channel = value / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; })
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

  const ink = rgb(variables.get("--ink"));
  const accent = rgb(variables.get("--lime"));
  assert.ok(ink && accent, "必须能解析出 --ink 与 --lime");
  assert.notDeepEqual(accent, ink, "--lime 不能等于 --ink，否则深色文字压在强调色底上不可见");
  // 强调色同时承担三种角色：深色文字的底色、深色底上的文字、浅色底上的文字。
  assert.ok(contrast(ink, accent) >= 3, `深色文字压在强调色上对比度不足：${contrast(ink, accent).toFixed(2)}`);
  assert.ok(contrast(accent, [255, 255, 255]) >= 3, `强调色作为浅色底上的文字对比度不足：${contrast(accent, [255, 255, 255]).toFixed(2)}`);
  assert.ok(contrast(accent, ink) >= 3, `强调色作为深色底上的文字对比度不足：${contrast(accent, ink).toFixed(2)}`);
});
