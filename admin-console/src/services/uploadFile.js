// XMLHttpRequest exposes actual upload progress; fetch does not.
export function uploadFile(url, file, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error, data) => { signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(data); };
    if (signal?.aborted) { reject(new DOMException('已取消上传', 'AbortError')); return; }
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100))); };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { /* Proxy errors may be HTML. */ }
      if (xhr.status >= 200 && xhr.status < 300 && data) { finish(null, data); return; }
      const message = xhr.status === 413 ? '文件超过服务器上传限制，请缩小文件或联系管理员核对代理配置'
        : xhr.status === 401 ? '登录已失效，请重新登录'
        : (Array.isArray(data?.message) ? data.message.join('；') : data?.message) || `上传失败（HTTP ${xhr.status}）`;
      finish(Object.assign(new Error(message), { status: xhr.status }));
    };
    xhr.onerror = () => finish(new Error('上传连接中断，请检查网络后重试'));
    xhr.ontimeout = () => finish(new Error('上传超时，请检查网络后重试'));
    xhr.onabort = () => finish(new DOMException('已取消上传', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    const form = new FormData(); form.append('file', file); xhr.send(form);
  });
}
