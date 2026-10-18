import { useEffect, useRef, useState } from 'react';
import { getConversationArtifact } from './localArtifacts.js';

export function LocalArtifact({ artifact }) {
  const [record, setRecord] = useState(null), [url, setUrl] = useState(''), [error, setError] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    let cancelled = false, objectUrl;
    getConversationArtifact(artifact.localArchiveId).then(value => {
      if (cancelled) return;
      if (!value) throw Error('此浏览器中未找到成果文件');
      objectUrl = URL.createObjectURL(value.blob); setRecord(value); setUrl(objectUrl);
    }).catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [artifact.localArchiveId]);
  const open = async () => {
    if (artifact.kind === 'webpage') {
      const html = await record.blob.text();
      dialog.current.querySelector('iframe').srcdoc = html;
    }
    dialog.current.showModal();
  };
  return <article className="agent-artifact" data-local-source={artifact.openUrl}>
    <strong>{artifact.path}</strong><small>{error || '已随聊天保存在本机'}</small>
    {url && record?.blob.type.startsWith('image/') && <button type="button" className="local-artifact-image" onClick={open}><img src={url} alt={artifact.path}/></button>}
    {url && <><button type="button" data-open-local onClick={open}>打开成果</button><a href={url} download={artifact.path.split('/').pop()}>下载文件</a></>}
    <dialog ref={dialog} className="local-artifact-preview" aria-label={artifact.path}>
      <header><strong>{artifact.path}</strong><button type="button" onClick={() => dialog.current.close()}>关闭预览</button></header>
      {artifact.kind === 'webpage' ? <iframe title={artifact.path} sandbox="allow-scripts allow-downloads" /> : record?.blob.type.startsWith('image/') ? <img src={url} alt={artifact.path} /> : <p>此文件可下载后打开。{url && <a href={url} download={artifact.path.split('/').pop()}>下载文件</a>}</p>}
    </dialog>
  </article>;
}
