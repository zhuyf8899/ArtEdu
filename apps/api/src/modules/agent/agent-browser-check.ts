import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { pdfBrowserPath } from '../generation/pdf-export';
let queue: Promise<unknown> = Promise.resolve();
/** Dedicated browser, in-memory assets, no outbound network or reused user profile. */
export function checkRenderedPage(entry: string, read: (file: string) => Promise<string | Buffer>) {
    const task = queue.then(() => check(entry, read));
    queue = task.catch(() => undefined);
    return task;
}
async function check(entry: string, read: (file: string) => Promise<string | Buffer>) {
    const executablePath = process.env.AGENT_BROWSER_EXECUTABLE || pdfBrowserPath() || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
    if (!executablePath)
        return { available: false, passed: false, checks: {}, issues: ['浏览器未配置，仅进行了静态检查。'] };
    const server = http.createServer((req, res) => {
        void (async () => {
            try {
                const name = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname).slice(1);
                if (!name || name.includes('\\') || name.split('/').includes('..') || name.startsWith('/'))
                    throw Error('Invalid path');
                const mime: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.avif':'image/avif' };
                if (!mime[path.extname(name)])
                    throw Error('Unsupported asset');
                res.setHeader('Content-Type', mime[path.extname(name)]);
                res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'");
                res.end(await read(name));
            }
            catch {
                res.statusCode = 404;
                res.end('Asset unavailable');
            }
        })();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port;
    let browser;
    const issues: string[] = [], checks: Record<string, boolean> = {};
    try {
        browser = await puppeteer.launch({ executablePath, headless: true, timeout: 15000, args: ['--disable-background-networking', '--disable-extensions'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setRequestInterception(true);
        page.on('request', r => { void (r.url().startsWith(origin + '/') ? r.continue() : r.abort()); });
        page.on('pageerror', e => issues.push(String(e)));
        page.on('response', r=>{if(r.status()>=400&&new URL(r.url()).pathname!=='/favicon.ico')issues.push('页面资源加载失败：'+new URL(r.url()).pathname);});
        await page.goto(origin + '/' + entry.split('/').map(encodeURIComponent).join('/'), { waitUntil: 'load', timeout: 15000 });
        checks.imagesLoaded=await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
        if(!checks.imagesLoaded)issues.push('页面图片未能正确加载');
        const invalid = await page.evaluate(() => [...document.querySelectorAll('svg [stop-color],svg [fill]')].flatMap(n => ['stop-color', 'fill'].filter(a => n.hasAttribute(a)).map(a => n.getAttribute(a) || '')).filter(v => !/^url\(|^none$/.test(v) && !CSS.supports('color', v)));
        checks.validSvgColors = !invalid.length;
        if (invalid.length)
            issues.push('SVG颜色无效：' + invalid.slice(0, 4).join('，'));
        const filter = await page.evaluate(() => {
            const buttons = [...document.querySelectorAll<HTMLButtonElement>('nav button,[aria-label*="筛选"] button')];
            const all = buttons.find(b => /^(全部|all)$/i.test(b.textContent?.trim() || '')), category = buttons.find(b => b !== all);
            const before = [...document.querySelectorAll<HTMLElement>('article')].filter(a => getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().height > 0).length;
            if (!all || !category || !before)
                return null;
            category.click();
            const after = [...document.querySelectorAll<HTMLElement>('article')].filter(a => getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().height > 0).length;
            all.click();
            return { before, after, reset: [...document.querySelectorAll<HTMLElement>('article')].filter(a => getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().height > 0).length };
        });
        if (filter) {
            checks.filterChanges = filter.after > 0 && filter.after < filter.before;
            checks.filterResets = filter.reset === filter.before;
            if (!checks.filterChanges)
                issues.push('筛选后作品数量未减少；检查hidden是否被display:flex/grid覆盖，需要[hidden]{display:none!important}。');
        }
        await page.setViewport({ width: 390, height: 844 });
        checks.mobileNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        checks.noScriptErrors = issues.length === 0;
        return { available: true, passed: Object.values(checks).every(Boolean), checks, issues };
    }
    catch (e) {
        return { available: true, passed: false, checks, issues: [...issues, '浏览器检查失败：' + (e instanceof Error ? e.message : String(e))] };
    }
    finally {
        try {
            await browser?.close();
        }
        finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    }
}
