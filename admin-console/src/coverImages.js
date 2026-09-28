const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

function coverTextUnits(value) {
  return Array.from(value).reduce((total, character) => total + (/\s/u.test(character) ? 0.32 : /[A-Z]/u.test(character) ? 0.67 : /[a-z0-9]/u.test(character) ? 0.56 : /[\x21-\x7e]/u.test(character) ? 0.45 : 1), 0);
}

function wrapCoverTitle(tokens, maxUnits) {
  const lines = [];
  let line = "";
  let pendingSpace = false;
  for (const token of tokens) {
    if (/^\s+$/u.test(token)) { pendingSpace = true; continue; }
    if (coverTextUnits(token) > maxUnits) return null;
    const spacer = pendingSpace && line ? " " : "";
    if (line && coverTextUnits(line + spacer + token) > maxUnits) {
      lines.push(line);
      line = token;
    } else line += spacer + token;
    pendingSpace = false;
  }
  if (line) lines.push(line);
  return lines;
}

function fitCoverLine(value, maxUnits) {
  let result = value.trimEnd();
  while (result && coverTextUnits(`${result}…`) > maxUnits) {
    // 长标题只在末尾省略，不把最后一个英文单词切成两半。
    result = /[A-Za-z0-9]+$/u.test(result) ? result.replace(/[A-Za-z0-9]+$/u, "").trimEnd() : Array.from(result).slice(0, -1).join("").trimEnd();
  }
  return `${result}…`;
}

export function titleCoverDataUrl(title, width = 640, height = 360) {
  const normalizedTitle = String(title ?? "").trim().replace(/\s+/gu, " ") || "未命名";
  // 中文可逐字换行；英文词保持完整，避免窄封面出现 “Codin / g”。
  const tokens = normalizedTitle.match(/[A-Za-z0-9]+(?:[.+#/-][A-Za-z0-9]+)*|\s+|./gu) ?? ["未命名"];
  const maxFontSize = Math.min(width <= 480 ? 32 : 42, Math.max(18, Math.floor(width / 8)));
  const safeWidth = width * 0.8;
  let fontSize = maxFontSize;
  let lines = null;
  let readableFallback = null;
  for (let size = maxFontSize; size >= 18; size -= 2) {
    const candidate = wrapCoverTitle(tokens, safeWidth / size);
    if (!candidate || candidate.length > 3) continue;
    readableFallback ??= { fontSize: size, lines: candidate };
    // 若相邻英文词被分到两行，先试较小字号，让完整短语留在同一行。
    const splitsLatinPhrase = candidate.some((line, index) => index < candidate.length - 1 && /[A-Za-z0-9]$/u.test(line) && /^[A-Za-z0-9]/u.test(candidate[index + 1]));
    if (!splitsLatinPhrase) { fontSize = size; lines = candidate; break; }
  }
  if (!lines && readableFallback) ({ fontSize, lines } = readableFallback);
  if (!lines) {
    fontSize = 18;
    const maxUnits = safeWidth / fontSize;
    const fittedTokens = tokens.map((token) => {
      if (/^\s+$/u.test(token) || coverTextUnits(token) <= maxUnits) return token;
      return fitCoverLine(token, maxUnits);
    });
    const wrapped = wrapCoverTitle(fittedTokens, maxUnits) ?? ["未命名"];
    lines = wrapped.slice(0, 3);
    if (wrapped.length > 3) lines[2] = fitCoverLine(lines[2], maxUnits);
  }
  const lineHeight = fontSize * 1.4;
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  const text = lines.map((line, index) => `<text x="50%" y="${startY + index * lineHeight}" text-anchor="middle" dominant-baseline="middle" fill="#111" font-family="Noto Sans SC, sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${text}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function coverImageFor(item, width = 640, height = 360) {
  return item.coverImageUrl || item.coverUrl || titleCoverDataUrl(item.title, width, height);
}

export async function prepareCoverFile(file, width = 640, height = 360) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("封面只支持 JPG、PNG 或 WebP 图片");
  if (file.size > 10 * 1024 * 1024) throw new Error("原始封面图片不能超过 10 MiB");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("无法读取封面图片"));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理封面图片");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("无法生成封面图片");
    return new File([blob], "cover.jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(objectUrl); }
}
