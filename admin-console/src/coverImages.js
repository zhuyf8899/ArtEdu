const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

export function titleCoverDataUrl(title, width = 640, height = 360) {
  const letters = Array.from(String(title ?? "").trim() || "未命名");
  const lineLength = width <= 480 ? 9 : 12;
  const lines = [];
  while (letters.length && lines.length < 3) lines.push(letters.splice(0, lineLength).join(""));
  if (letters.length) lines[2] = `${Array.from(lines[2]).slice(0, lineLength - 1).join("")}…`;
  const fontSize = width <= 480 ? 32 : 42;
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
