export const MAX_PREVIEW_BYTES = 32 * 1024 * 1024;
export function previewKind(fileName = '', mimeType = '') {
  const ext = fileName.split('/').pop().split('.').pop().toLowerCase();
  if (['docx', 'pptx', 'pdf'].includes(ext)) return ext;
  if (['doc','ppt','xls','xlsx','xlsm'].includes(ext)) return 'unsupported';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (['txt','md','csv','json','js','css','ts'].includes(ext) || mimeType.startsWith('text/')) return 'text';
  return 'unsupported';
}

// Validate the same central directory used by the renderer and locate each compressed stream.
export function validateOfficeArchive(buffer) {
  if (buffer.byteLength > MAX_PREVIEW_BYTES) throw Error('文件超过 32 MB，请下载原件查看。');
  const data = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const malformed = () => Error('文档目录损坏，无法预览。');
  let end = -1;
  for (let i = buffer.byteLength - 4; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (data.getUint32(i, true) !== 0x06054b50) continue;
    if (i + 22 > buffer.byteLength || i + 22 + data.getUint16(i + 20, true) !== buffer.byteLength) throw malformed();
    end = i;
    break;
  }
  if (end < 0) throw Error('文件损坏或已加密，请下载原件或重新导出。');
  const count = data.getUint16(end + 10, true);
  const start = data.getUint32(end + 16, true);
  if (!count || count > 4000 || start >= end || data.getUint32(end + 12, true) !== end - start
    || data.getUint16(end + 4, true) || data.getUint16(end + 6, true) || data.getUint16(end + 8, true) !== count) {
    throw Error('文档结构不受支持，请下载原件查看。');
  }

  const entries = [];
  let cursor = start;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || data.getUint32(cursor, true) !== 0x02014b50) throw malformed();
    const flags = data.getUint16(cursor + 8, true);
    const method = data.getUint16(cursor + 10, true);
    const compressed = data.getUint32(cursor + 20, true);
    const size = data.getUint32(cursor + 24, true);
    const nameLength = data.getUint16(cursor + 28, true);
    const local = data.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + data.getUint16(cursor + 30, true) + data.getUint16(cursor + 32, true);
    total += size;
    if ((flags & 1) || size > MAX_PREVIEW_BYTES || total > 128 * 1024 * 1024) {
      throw Error('文档已加密或解压后过大，请下载原件查看。');
    }
    if (![0, 8].includes(method) || next > end || local + 30 > start
      || data.getUint32(local, true) !== 0x04034b50 || data.getUint16(local + 6, true) !== flags
      || data.getUint16(local + 8, true) !== method || data.getUint16(local + 26, true) !== nameLength
      || data.getUint16(cursor + 34, true)) throw malformed();

    const stream = local + 30 + nameLength + data.getUint16(local + 28, true);
    if (stream + compressed > start || (method === 0 && compressed !== size)) throw malformed();
    for (let n = 0; n < nameLength; n++) {
      if (bytes[local + 30 + n] !== bytes[cursor + 46 + n]) throw malformed();
    }
    entries.push({ local, start: stream, end: stream + compressed, size, method });
    cursor = next;
  }
  if (cursor !== end) throw malformed();
  const ordered = [...entries].sort((a, b) => a.local - b.local);
  if (ordered.some((entry, index) => index > 0 && entry.local < ordered[index - 1].end)) throw malformed();
  return entries;
}

// Discard streamed output after counting it. The Office renderer sees the original container
// only when every stream fits its independently verified per-file and aggregate budget.
export async function verifyOfficeArchive(buffer, signal) {
  const entries = validateOfficeArchive(buffer);
  for (const entry of entries) {
    signal?.throwIfAborted();
    if (entry.method === 0) continue;
    const compressed = new Uint8Array(buffer, entry.start, entry.end - entry.start);
    let offset = 0;
    const stream = new ReadableStream({
      pull(controller) {
        const end = Math.min(offset + 4096, compressed.length);
        if (end > offset) controller.enqueue(compressed.subarray(offset, end));
        offset = end;
        if (offset === compressed.length) controller.close();
      },
    });
    const reader = stream.pipeThrough(new DecompressionStream('deflate-raw'), { signal }).getReader();
    let actual = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        actual += value.byteLength;
        if (actual > entry.size) {
          await reader.cancel();
          throw Error('文档实际解压大小超过预览限制。');
        }
      }
      if (actual !== entry.size) throw Error('文档解压大小与目录不一致。');
    } finally { reader.releaseLock(); }
  }
}

export async function readPreviewBlob(src, signal) {
  const url = new URL(src, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw Error('仅支持平台内授权文件预览。');
  const response = await fetch(url, { credentials: 'include', redirect: 'error', signal });
  if (!response.ok) throw Error(response.status === 401 ? '登录已过期，请重新登录后预览。' : response.status === 403 ? '当前账号没有此文件的查看权限。' : '文件暂时无法读取，请重试。');
  if (Number(response.headers.get('content-length')) > MAX_PREVIEW_BYTES) throw Error('文件超过 32 MB，请下载原件查看。');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_PREVIEW_BYTES) { await reader.cancel(); throw Error('文件超过 32 MB，请下载原件查看。'); }
    chunks.push(value);
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
}
