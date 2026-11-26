import { useEffect, useRef, useState } from 'react';
import './case-cover-image.css';

export function CaseCoverImage({src, alt}) {
  const frame = useRef(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('loading');
  const [original, setOriginal] = useState(false);
  const localAsset = /^\/api\/works\/[^/]+\/assets\/[^/]+\/download$/.test(src);
  useEffect(() => { setStatus('loading'); setOriginal(false); }, [src]);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {setVisible(true);return;}
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {setVisible(true);observer.disconnect();}
    }, {rootMargin:'150px'});
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  return <span ref={frame} className="case-cover-image" aria-busy={visible && status === 'loading'}>
    {status === 'loading' && <span className="case-cover-image__loading" role="status"><span className="page-loading__spinner" aria-hidden="true"/><span>正在加载封面</span></span>}
    {visible && <img src={localAsset && !original ? src + '?preview=1' : src} alt={alt} decoding="async"
      className={status === 'ready' ? 'is-ready' : ''} onLoad={()=>setStatus('ready')}
      onError={()=>{if(localAsset && !original)setOriginal(true);else setStatus('error');}}/>}
    {status === 'error' && <span className="case-cover-image__error">封面暂时无法加载</span>}
  </span>;
}
