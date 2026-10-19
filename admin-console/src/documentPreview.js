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

// Inspect ZIP metadata BEFORE decompression. Reject zip bombs/encrypted/ZIP64 files;
// no Office macros, linked network resources or embedded HTML are executed.
export function validateOfficeArchive(buffer) {
  if (buffer.byteLength > MAX_PREVIEW_BYTES) throw Error('文件超过 32 MB，请下载原件查看。');
  const data = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (data.getUint32(i, true) === 0x06054b50 && i + 22 + data.getUint16(i + 20, true) === buffer.byteLength) { end = i; break; }
  }
  if (end < 0) throw Error('文件损坏或已加密，请下载原件或重新导出。');
  const count = data.getUint16(end + 10, true), start = data.getUint32(end + 16, true);
  if (!count || count > 4000 || start >= end || data.getUint16(end + 4, true) || data.getUint16(end + 6, true)) throw Error('文档结构不受支持，请下载原件查看。');
  let cursor = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || data.getUint32(cursor, true) !== 0x02014b50) throw Error('文档目录损坏，无法预览。');
    const flags = data.getUint16(cursor + 8, true), size = data.getUint32(cursor + 24, true);
    total += size;
    if ((flags & 1) || size > MAX_PREVIEW_BYTES || total > 128 * 1024 * 1024) throw Error('文档已加密或解压后过大，请下载原件查看。');
    cursor += 46 + data.getUint16(cursor + 28, true) + data.getUint16(cursor + 30, true) + data.getUint16(cursor + 32, true);
    if (cursor > end) throw Error('文档目录损坏，无法预览。');
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
