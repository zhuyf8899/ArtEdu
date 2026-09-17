/**
 * 网页产物的静态自检。
 *
 * 为什么需要它：模型写完网页就"交卷"了，但页面的样式表路径写错、样式表是空的、
 * 引用了外部 CDN——这些在预览环境里必然表现成"没有样式的裸 HTML"，而模型自己看不见。
 * 这里用纯静态分析把这类问题在收尾前抓出来。
 *
 * 边界：静态检查不能替代真实渲染（它发现不了浏览器层面的拦截），所以结论里
 * 会明确要求把预览链接给用户点开确认。
 */
export interface PageReferences {
  stylesheets: string[];
  scripts: string[];
  images: string[];
  external: string[];
  absolute: string[];
  inlineStyleBlocks: number;
  inlineScriptBlocks: number;
}

export interface PageCheckIssue {
  level: "fail" | "warn";
  message: string;
}

/** 从 HTML 里抽出所有需要加载的资源引用（不做网络与文件访问，纯函数）。 */
export function extractPageReferences(html: string): PageReferences {
  const attribute = (tag: RegExp, name: string) => {
    const values: string[] = [];
    for (const match of html.matchAll(tag)) {
      const raw = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(match[0])?.[1];
      if (raw) values.push(raw.trim());
    }
    return values;
  };

  const stylesheets = attribute(/<link\b[^>]*>/gi, "href").filter((href) => /stylesheet/i.test(href) || /\.css(\?|#|$)/i.test(href));
  // 只保留真正的样式表 link：上面的过滤会把所有 <link> 都带进来，这里再收敛一次。
  const stylesheetLinks = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi)]
    .map((match) => /href\s*=\s*["']([^"']+)["']/i.exec(match[0])?.[1]?.trim() ?? "")
    .filter(Boolean);
  const scripts = attribute(/<script\b[^>]*\bsrc\s*=[^>]*>/gi, "src");
  const images = attribute(/<img\b[^>]*>/gi, "src")
    .concat(attribute(/<source\b[^>]*>/gi, "src"))
    .concat(attribute(/<video\b[^>]*>/gi, "src"));

  const all = [...new Set([...stylesheets, ...stylesheetLinks, ...scripts, ...images])];
  return {
    // 去重：上面两种写法会把同一张表统计两次。
    stylesheets: [...new Set([...stylesheets, ...stylesheetLinks])],
    scripts: [...new Set(scripts)],
    images: [...new Set(images)],
    external: all.filter((value) => /^(https?:)?\/\//i.test(value)),
    absolute: all.filter((value) => value.startsWith("/") && !value.startsWith("//")),
    inlineStyleBlocks: (html.match(/<style\b/gi) ?? []).length,
    inlineScriptBlocks: (html.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi) ?? []).length,
  };
}

export interface AssetState {
  path: string;
  exists: boolean;
  sizeBytes: number | null;
}

/**
 * 把页面里的相对引用解析成工作区内的路径（处理 ./ 与 ../）。
 * 越过工作区根目录、空引用、纯锚点都返回 null——调用方据此报"引用的文件不存在"。
 */
export function normalizeRelative(baseDirectory: string, reference: string) {
  const clean = reference.split(/[?#]/)[0].trim();
  if (!clean) return null;
  const segments = `${baseDirectory}${clean}`.split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!out.length) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length ? out.join("/") : null;
}

/** 汇总自检结论：把"必然导致页面坏掉"的情况标成 fail，其余标 warn。 */
export function summarizePageCheck(input: {
  htmlBytes: number;
  references: PageReferences;
  assets: AssetState[];
}): { verdict: "pass" | "warn" | "fail"; issues: PageCheckIssue[] } {
  const issues: PageCheckIssue[] = [];
  const { references, assets } = input;

  if (input.htmlBytes === 0) issues.push({ level: "fail", message: "HTML 文件是空的。" });
  if (!references.stylesheets.length && references.inlineStyleBlocks === 0) {
    issues.push({ level: "fail", message: "页面没有任何样式来源（既没有 <link rel=stylesheet>，也没有内联 <style>），用户会看到没样式的裸 HTML。" });
  }
  for (const asset of assets) {
    if (!asset.exists) issues.push({ level: "fail", message: `引用的文件不存在：${asset.path}（路径写错或没写进工作区）。` });
    else if (asset.sizeBytes === 0) issues.push({ level: "fail", message: `引用的文件是空的：${asset.path}。` });
  }
  for (const url of references.external) {
    issues.push({ level: "fail", message: `引用了外部地址 ${url}：预览环境离线，外部 CDN／字体／图片一律加载不到。` });
  }
  for (const path of references.absolute) {
    issues.push({ level: "warn", message: `使用了绝对路径 ${path}：它会指向平台服务根目录而不是工作区文件，请改成相对路径。` });
  }
  if (references.stylesheets.length > 1) {
    issues.push({ level: "warn", message: `页面引用了 ${references.stylesheets.length} 个样式表，确认它们的层叠顺序符合预期。` });
  }

  const verdict = issues.some((issue) => issue.level === "fail") ? "fail" : issues.length ? "warn" : "pass";
  return { verdict, issues };
}
