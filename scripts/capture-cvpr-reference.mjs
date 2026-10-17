// Read-only source capture. No uploads, login, cookies or source assets are copied.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT, 'package.json'));
const { chromium } = require('playwright');
const output = path.resolve('apps/api/data/qa/cvpr-art/reference');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  for (const [width, height, name] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.goto('https://thecvf-art.com/project.php?year=2025&artist=pindar-van-arman&id=1043', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('.project-featured-image').waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    const layout = await page.locator('.project-card').evaluate(el => {
      const style = getComputedStyle(el);
      return { title: document.title, width: el.getBoundingClientRect().width, background: style.backgroundColor, borderRadius: style.borderRadius,
        children: [...el.querySelectorAll('.project-featured-image,.project-content,.project-artist,.project-abstract,.video-wrapper,.block-button')].map(item => { const s = getComputedStyle(item), r = item.getBoundingClientRect(); return { className: item.className, x: r.x, y: r.y, width: r.width, height: r.height, font: s.font, padding: s.padding, margin: s.margin }; }) };
    });
    await writeFile(path.join(output, `${name}.json`), JSON.stringify(layout, null, 2));
    console.log(name, JSON.stringify(layout));
  }
} finally { await browser.close(); }
