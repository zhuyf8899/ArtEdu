import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import type { DocumentContent } from "./document-content";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function documentHtml(doc: DocumentContent) {
  const e = escapeHtml;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'"><title>${e(doc.title)}</title><style>
  @page { size: A4; margin: 22mm 20mm; }
  body { font-family: 'Noto Sans CJK SC','Microsoft YaHei',sans-serif; color:#171717; font-size:11pt; line-height:1.8; }
  h1 { font-size:24pt; line-height:1.4; margin:0 0 14pt; } h2 { font-size:16pt; margin:22pt 0 8pt; break-after:avoid; }
  p { margin:0 0 9pt; orphans:3; widows:3; } li { margin:5pt 0; break-inside:avoid; } ul { padding-left:20pt; }
  p,li,h1,h2 { overflow-wrap:anywhere; } .summary { color:#525252; }
  </style></head><body><h1>${e(doc.title)}</h1><p class="summary">${e(doc.summary)}</p>${doc.sections.map(s => `<section><h2>${e(s.heading)}</h2>${s.paragraphs.map(p => `<p>${e(p)}</p>`).join("")}${s.bullets.length ? `<ul>${s.bullets.map(b => `<li>${e(b)}</li>`).join("")}</ul>` : ""}</section>`).join("")}</body></html>`;
}

export function pdfBrowserPath() {
  const configured = process.env.PDF_BROWSER_EXECUTABLE;
  if (configured) return configured;
  return ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
}

let active = false;
export class PdfExportError extends Error {}
export function assertPdfAvailable() {
  const executablePath = pdfBrowserPath();
  if (!executablePath || !existsSync(executablePath)) throw new PdfExportError("PDF 渲染服务尚未配置，请联系管理员设置浏览器运行路径");
  if (active) throw new PdfExportError("PDF 渲染服务繁忙，请稍后重试");
}
export async function createPdf(doc: DocumentContent) {
  assertPdfAvailable();
  const executablePath = pdfBrowserPath()!;
  active = true;
  let browser;
  try {
    // Dedicated ephemeral browser. Keep its sandbox enabled; never reuse a user profile.
    browser = await puppeteer.launch({ executablePath, headless: true, timeout: 20000, args: ["--disable-background-networking", "--disable-extensions"] });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", request => { void request.abort(); });
    await page.setContent(documentHtml(doc), { waitUntil: "domcontentloaded", timeout: 10000 });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, timeout: 20000 }));
  } catch {
    throw new PdfExportError("PDF 排版服务暂时不可用，请联系管理员检查浏览器与字体配置");
  } finally {
    try { await browser?.close(); } finally { active = false; }
  }
}
