// Read-only browser regression. Uses local demo sessions; never uploads, reviews or changes cases.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
assert.ok(process.env.ARTEDU_PLAYWRIGHT_ROOT && process.env.ARTEDU_DEMO_PASSWORD, "Playwright runtime and demo password required");
const require = createRequire(path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT, "package.json"));
const { chromium } = require("playwright");
const base = process.env.ARTEDU_BASE_URL ?? "http://localhost:4173";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local QA only");
const output = path.resolve("apps/api/data/qa/case-image-viewer");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const context = await browser.newContext();
  const response = await context.request.post(`${base}/api/auth/login`, { data: { username: "student.demo", password: process.env.ARTEDU_DEMO_PASSWORD } });
  assert.ok(response.ok(), `Login: ${response.status()}`);
  const catalog = await (await context.request.get(`${base}/api/works`)).json();
  const candidates = [...catalog.items].sort((a,b) => Number(b.title === "Fertile Matrices") - Number(a.title === "Fertile Matrices"));
  let work;
  for (const item of candidates) {
    const detail = await (await context.request.get(`${base}/api/works/${item.id}`)).json();
    if (detail.assets?.filter(asset => asset.asset_type === "image").length >= 2) { work = detail; break; }
  }
  assert.ok(work, "Need one published case with multiple images");
  const imageCount = work.assets.filter(asset => asset.asset_type === "image").length;
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/community?work=${encodeURIComponent(work.id)}`, { waitUntil: "networkidle" });
  await page.locator(".community-detail").waitFor();
  const dialog = page.locator(".image-lightbox--gallery");
  for (const [width,height,name] of [[1440,900,"desktop"],[768,1024,"tablet"],[390,844,"mobile"],[844,390,"landscape"]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(async () => { await document.fonts.ready; });
    const hero = await page.locator(".community-detail__hero").boundingBox();
    assert.ok(hero.height <= Math.max(180, Math.min(height * .38, 360)) + 2, "Cover height is bounded");
    const thumbnails = await page.locator(".case-gallery .case-image-button").evaluateAll(els => els.map(el => { const r=el.getBoundingClientRect();return {width:r.width,height:r.height}; }));
    assert.ok(thumbnails.every(r=>Math.abs(r.width/r.height - 4/3) < .03), "Compact 4:3 previews");
    const thumbnail = page.locator(".case-gallery .case-image-button").first();
    await thumbnail.scrollIntoViewIfNeeded(); const scrollBefore = await page.evaluate(()=>scrollY);
    await thumbnail.click(); await dialog.waitFor();
    assert.equal(await dialog.evaluate(el=>el.parentElement.tagName), "BODY", "Portal escapes route transform");
    const frame = await dialog.boundingBox();
    assert.ok(Math.abs(frame.x)<1 && Math.abs(frame.y)<1 && Math.abs(frame.width-width)<2 && Math.abs(frame.height-height)<2, "Viewer fits actual viewport at current scroll");
    await dialog.locator(".image-lightbox__stage img").evaluate(img=>img.decode());
    const stage = await dialog.locator(".image-lightbox__stage").boundingBox();
    assert.ok(stage.height>70 && stage.y>=0 && stage.y+stage.height<=height, "Picture stays on screen");
    assert.equal(await dialog.locator(".image-lightbox__stage img").evaluate(img=>getComputedStyle(img).objectFit), "contain");
    const picture = await dialog.locator(".image-lightbox__stage img").boundingBox();
    assert.ok(Math.abs(picture.x+picture.width/2-width/2)<2 && Math.abs(picture.y+picture.height/2-height/2)<24,"Original image is centered, not pushed down by navigation");
    assert.match(await dialog.locator(".image-lightbox__navigation span").innerText(),new RegExp(`2 / ${imageCount}`));
    assert.equal(await dialog.locator(".image-lightbox__name").count(),0,"No filename in image preview");
    assert.equal(await page.locator(".case-gallery figcaption").count(),0,"No gallery filenames");
    const tools = dialog.locator(".image-lightbox__tools");
    for (const action of await tools.locator("button,a").all()) { const r=await action.boundingBox();assert.ok(r.y>=0 && r.y+r.height<=height+1 && r.x>=0 && r.x+r.width<=width+1,"Controls visible without scrolling");assert.ok(r.height>=44); }
    await tools.getByRole("button",{name:"放大",exact:true}).click();assert.equal(await tools.locator("b").innerText(),"125%");
    if(imageCount>2){await page.keyboard.press("ArrowRight");assert.match(await dialog.locator(".image-lightbox__navigation span").innerText(),/^3 \/ /);await tools.getByText("100%",{exact:true}).waitFor();await page.keyboard.press("ArrowLeft");}
    await dialog.locator(".image-lightbox__close").focus();
    for(let i=0;i<14;i++){await page.keyboard.press("Tab");assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)),"Keyboard focus remains in viewer");}
    assert.equal(await tools.getByRole("link",{name:"下载原图",exact:true}).getAttribute("href"),await dialog.locator(".image-lightbox__stage img").getAttribute("src"));
    assert.equal(await tools.getByRole("link",{name:"在新窗口打开原图",exact:true}).getAttribute("rel"),"noopener noreferrer");
    await page.screenshot({path:path.join(output,`${name}-viewer.png`)});
    await page.keyboard.press("Escape");assert.equal(await dialog.count(),0);assert.ok(await thumbnail.evaluate(el=>el===document.activeElement));
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scrollBefore)<2,"Closing restores original page position");
    assert.notEqual(await page.evaluate(()=>document.body.style.overflow),"hidden");
    await thumbnail.click();await page.locator(".image-lightbox__scrim").click({position:{x:2,y:2}});assert.equal(await dialog.count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator(".case-gallery").first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${name}-gallery.png`)});
    console.log(`${name}: viewport Portal, bounded previews, controls, navigation, zoom, focus/scroll restoration, Esc and backdrop passed`);
  }
  // The cover enters the same gallery and navigates to process images, without duplicate assets.
  await page.setViewportSize({width:1440,height:900});
  await page.locator(".case-image-button--hero").click();await dialog.waitFor();
  assert.match(await dialog.locator(".image-lightbox__navigation span").innerText(),/^1 \/ /);
  assert.ok(await dialog.locator(".image-lightbox__previous").isDisabled());
  await dialog.getByRole("button",{name:"下一张图片"}).click();assert.match(await dialog.locator(".image-lightbox__navigation span").innerText(),/^2 \/ /);
  await page.keyboard.press("Escape");assert.deepEqual(errors,[]);
  console.log("PASS: no case or media writes, original files/links retained, no page runtime errors");
  await context.close();
} finally { await browser.close(); }
