import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowClockwise, CaretLeft, CaretRight, DownloadSimple, X } from '@phosphor-icons/react';
import { MAX_PREVIEW_BYTES, previewKind, readPreviewBlob, validateOfficeArchive } from './documentPreview.js';
import './document-preview.css';

const officeShell = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob: data:; font-src blob: data:; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;min-height:100%;background:#efedf6;color:#17192f;font-family:Arial,'Microsoft YaHei',sans-serif}#pages{padding:20px;box-sizing:border-box;min-height:100vh}.docx-wrapper{background:transparent!important;padding:0!important}.docx-wrapper>section.docx{max-width:100%;box-sizing:border-box;margin:0 auto 20px!important;box-shadow:0 2px 16px #17192f12!important}img,svg{max-width:100%}a{pointer-events:none}*{box-sizing:border-box}</style></head><body><main id="pages"></main></body></html>`;

/** Browser-only Office rendering: private/local files never go to an online viewer. */
export function DocumentPreview({ blob, src, fileName = '', mimeType = '' }) {
  const frame = useRef(null), viewer = useRef(null);
  const [source, setSource] = useState(null), [attempt, setAttempt] = useState(0), [ready, setReady] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', text: '', url: '', pages: 0, page: 0 });
  const kind = previewKind(fileName, source?.type || mimeType);
  useEffect(() => {
    const abort = new AbortController(); let cancelled = false;
    setSource(null); setState({ loading: true, error: '', text: '', url: '', pages: 0, page: 0 });
    Promise.resolve(blob || readPreviewBlob(src, abort.signal)).then(value => {
      if (cancelled) return;
      if (value.size > MAX_PREVIEW_BYTES) throw Error('文件超过 32 MB，请下载原件查看。');
      setSource(value);
    }).catch(error => { if (!cancelled) setState(current => ({ ...current, loading: false, error: error.message })); });
    return () => { cancelled = true; abort.abort(); };
  }, [blob, src, attempt]);

  useEffect(() => {
    if (!source) return;
    if (['docx','pptx'].includes(kind) && !ready) return;
    let cancelled = false, objectUrl = '', instance, resize;
    const render = async () => {
      if (kind === 'unsupported') throw Error('此格式暂不支持在线预览。旧版 .doc / .ppt 请另存为 .docx / .pptx 后上传。');
      if (['docx','pptx'].includes(kind)) {
        const buffer = await source.arrayBuffer(); validateOfficeArchive(buffer);
        const doc = frame.current?.contentDocument, container = doc?.getElementById('pages');
        if (!container || cancelled) return;
        container.replaceChildren();
        if (kind === 'docx') {
          const { renderAsync } = await import('docx-preview');
          if (cancelled) return;
          await renderAsync(buffer, container, doc.head, { inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, ignoreLastRenderedPageBreak: false, renderAltChunks: false, useBase64URL: true });
          // Word treats unspecified/zero-width tables as auto layout. Avoid
          // collapsing those columns into single-character vertical strips.
          for (const table of container.querySelectorAll('table')) {
            if (!table.style.width || table.style.width === 'auto' || parseFloat(table.style.width) === 0) { table.style.width = '100%'; table.style.tableLayout = 'auto'; }
          }
          if (!cancelled) setState(current => ({ ...current, loading: false, pages: container.querySelectorAll('section.docx').length }));
        } else {
          const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer');
          if (cancelled) return;
          instance = new PptxViewer(container, { externalMedia: 'block', pdfjs: false, zipLimits: RECOMMENDED_ZIP_LIMITS, fitMode: 'contain', onSlideChange: page => { if (!cancelled) setState(current => ({ ...current, page })); } });
          viewer.current = instance;
          await instance.open(buffer, { renderMode: 'slide', lazyMedia: true, lazySlides: true });
          // Fit BOTH dimensions: wide desktop pages must not make a slide taller
          // than its reading window. Keep this fit when the dialog is resized.
          container.style.padding = '0'; container.style.minHeight = '0';
          doc.body.style.display = 'grid'; doc.body.style.placeItems = 'center';
          const fit = () => {
            if (cancelled || !frame.current) return;
            const ratio = instance.slideWidth / instance.slideHeight || 16 / 9;
            container.style.width = `${Math.max(160, Math.min(frame.current.clientWidth - 40, (frame.current.clientHeight - 40) * ratio))}px`;
            void instance.setFitMode('contain').catch(() => {});
          };
          fit(); resize = new ResizeObserver(fit); resize.observe(frame.current);
          if (!cancelled) setState(current => ({ ...current, loading: false, pages: instance.slideCount, page: 0 }));
        }
      } else if (kind === 'text') {
        const text = (await source.text()).slice(0, 200000);
        if (!cancelled) setState(current => ({ ...current, loading: false, text }));
      } else {
        objectUrl = URL.createObjectURL(source);
        setState(current => ({ ...current, loading: false, url: objectUrl }));
      }
    };
    render().catch(error => { if (!cancelled) setState(current => ({ ...current, loading: false, error: error.message || '文档解析失败，请下载原件查看。' })); });
    return () => { cancelled = true; resize?.disconnect(); instance?.destroy(); if (viewer.current === instance) viewer.current = null; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, kind, ready]);
  const turn = async page => {
    if (!viewer.current || page < 0 || page >= state.pages) return;
    try { await viewer.current.goToSlide(page); } catch { setState(current => ({ ...current, error: '此页暂时无法显示，请重试或下载原件。' })); }
  };
  return <section className="document-preview" aria-label={`${fileName}在线预览`} aria-busy={state.loading}>
    <div className="document-preview__toolbar">
      <span>{kind === 'pptx' ? '幻灯片' : kind === 'docx' ? 'Word 文档' : '文件预览'}{state.pages > 0 && ` · ${state.pages} 页`}</span>
      {kind === 'pptx' && state.pages > 0 && <div className="document-preview__paging"><button disabled={state.page === 0} onClick={() => turn(state.page - 1)} aria-label="上一页"><CaretLeft /></button><label><span className="sr-only">跳转到幻灯片</span><select aria-label="跳转到幻灯片" value={state.page} onChange={event => turn(Number(event.target.value))}>{Array.from({ length: state.pages }, (_, page) => <option value={page} key={page}>{page + 1} / {state.pages}</option>)}</select></label><button disabled={state.page + 1 === state.pages} onClick={() => turn(state.page + 1)} aria-label="下一页"><CaretRight /></button></div>}
      <small>本机解析 · 不上传第三方</small>
    </div>
    {state.loading && <p className="document-preview__status" role="status">正在解析文档，请稍候…</p>}
    {state.error && <div className="document-preview__status" role="alert"><strong>暂时无法预览</strong><p>{state.error}</p><button onClick={() => setAttempt(value => value + 1)}><ArrowClockwise size={16} />重新尝试</button></div>}
    {['docx','pptx'].includes(kind) && <iframe ref={frame} className={state.error ? 'is-hidden' : ''} title={`${fileName}正文`} sandbox="allow-same-origin" srcDoc={officeShell} onLoad={() => setReady(value => value + 1)} />}
    {!state.error && state.url && (kind === 'pdf' ? <iframe src={state.url} title={`${fileName} PDF 预览`} /> : kind === 'image' ? <img src={state.url} alt={fileName} /> : kind === 'video' ? <video controls src={state.url} /> : <audio controls src={state.url} />)}
    {!state.error && kind === 'text' && !state.loading && <pre>{state.text}</pre>}
  </section>;
}

export function DocumentPreviewDialog({ fileName, src, blob, mimeType, downloadUrl, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { const previous = document.activeElement, element = dialog.current; element.showModal(); return () => { element.close(); requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); }; }, []);
  return createPortal(<dialog ref={dialog} className="document-preview-dialog" onCancel={onClose} aria-label={`${fileName}预览`}>
    <header><div><small>DOCUMENT VIEWER</small><strong>{fileName}</strong></div><div>{downloadUrl && <a href={downloadUrl} download={fileName.split('/').pop()}><DownloadSimple size={17} />下载原件</a>}<button type="button" onClick={onClose} aria-label="关闭文档预览"><X size={21} /></button></div></header>
    <DocumentPreview fileName={fileName} src={src} blob={blob} mimeType={mimeType} />
  </dialog>, document.body);
}
