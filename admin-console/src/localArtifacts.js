import { randomId } from './randomId.js';
import { getConversationArtifact, saveConversationArtifact } from './conversationStore.js';

// Files live beside conversations in IndexedDB, never as expiring server URLs.
// Each reply gets an immutable snapshot, so later edits cannot change old results.
const privateArtifact = /^\/api\/(?:agent-runs\/workspace-preview\/|generation-jobs\/[^/]+\/download(?:$|\?)|agent-runs\/[^/]+\/artifacts\/)/;
const dataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
export async function archiveArtifacts(accountId, conversationId, artifacts) {
  const archived = [], failures = [];
  for (const artifact of artifacts) {
    if (!privateArtifact.test(artifact.openUrl || '')) continue;
    try {
      const source = new URL(artifact.openUrl, location.origin);
      const files = new Map(), visiting = new Set();
      const fetchFile = async url => {
        if (files.has(url.href)) return files.get(url.href);
        if (url.origin !== location.origin || !privateArtifact.test(url.pathname)) throw Error('成果引用了无法本地保存的资源');
        const response = await fetch(url, { credentials: 'include', redirect: 'error' });
        if (!response.ok) throw Error(`文件读取失败 (${response.status})`);
        const blob = await response.blob(); files.set(url.href, blob); return blob;
      };
      const embed = async url => {
        if (visiting.has(url.href)) throw Error('资源循环引用，无法生成离线文件');
        visiting.add(url.href);
        try {
          let blob = await fetchFile(url);
          if (/text\/css/.test(blob.type) || /\.css$/i.test(url.pathname)) blob = new Blob([await embedCss(await blob.text(), url)], { type: 'text/css' });
          if (/(?:javascript|ecmascript)/.test(blob.type) || /\.m?js$/i.test(url.pathname)) {
            let script = await blob.text();
            const imports = [...script.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)];
            for (const match of imports) {
              const ref = match[1] || match[2];
              if (ref.startsWith('data:')) continue;
              const replacement = await embed(new URL(ref, url));
              script = script.replace(match[0], match[0].replace(ref, replacement));
            }
            blob = new Blob([script], { type: 'text/javascript' });
          }
          return await dataUrl(blob);
        } finally { visiting.delete(url.href); }
      };
      const embedCss = async (text, base) => {
        const matches = [...text.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)|@import\s+['"]([^'"]+)['"]/gi)];
        for (const match of matches) {
          const ref = match[2] || match[3];
          if (/^(?:data:|#)/i.test(ref)) continue;
          const value = await embed(new URL(ref, base));
          text = text.replace(match[0], match[3] ? `@import url("${value}")` : `url("${value}")`);
        }
        return text;
      };
      let blob = await fetchFile(source);
      if (artifact.kind === 'webpage') {
        const doc = new DOMParser().parseFromString(await blob.text(), 'text/html');
        doc.querySelectorAll('base,meta[http-equiv="refresh"],meta[http-equiv="Content-Security-Policy"]').forEach(node => node.remove());
        for (const node of doc.querySelectorAll('[src],[poster],link[href]')) {
          for (const attr of ['src', 'poster', ...(node.tagName === 'LINK' ? ['href'] : [])]) {
            const ref = node.getAttribute(attr); if (!ref || /^(?:data:|#)/i.test(ref)) continue;
            node.setAttribute(attr, await embed(new URL(ref, source)));
          }
        }
        // Preserve responsive image candidates as well as ordinary src images.
        for (const node of doc.querySelectorAll('[srcset]')) {
          if (node.getAttribute('srcset').startsWith('data:')) continue;
          const candidates = node.getAttribute('srcset').split(',').map(value => value.trim()).filter(Boolean);
          const values = [];
          for (const candidate of candidates) {
            const [ref, descriptor] = candidate.split(/\s+/);
            values.push(`${await embed(new URL(ref, source))}${descriptor ? ' ' + descriptor : ''}`);
          }
          node.setAttribute('srcset', values.join(', '));
        }
        for (const node of doc.querySelectorAll('style')) node.textContent = await embedCss(node.textContent, source);
        for (const node of doc.querySelectorAll('[style]')) node.setAttribute('style', await embedCss(node.getAttribute('style'), source));
        const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
        csp.content = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline' data:; script-src 'unsafe-inline' data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
        doc.head.prepend(csp);
        blob = new Blob(['<!doctype html>\n', doc.documentElement.outerHTML], { type: 'text/html' });
      }
      const id = `${accountId}:${conversationId}:${randomId()}`;
      const record = { id, accountId, conversationId, sourceUrl: artifact.openUrl, blob, files: [...files].map(([url, data]) => ({ url, blob: data })), createdAt: new Date().toISOString() };
      await saveConversationArtifact(record);
      archived.push({ ...artifact, localArchiveId: id, localSavedAt: record.createdAt });
    } catch (error) { failures.push({ ...artifact, localSaveError: error.message || '本地空间不足' }); }
  }
  if (archived.length) void navigator.storage?.persist?.().catch(() => {});
  return { artifacts: [...archived, ...failures], failures };
}

export { getConversationArtifact };
