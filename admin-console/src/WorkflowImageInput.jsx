import { useEffect, useRef, useState } from 'react';
import './workflow-image-input.css';

const pngBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('无法导出图片')), 'image/png'));
const maxBytes = 8 * 1024 * 1024;

/** Paint is the editable region. Export uses transparent pixels for edits. */
export function WorkflowImageInput({ value, onChange, disabled = false }) {
  const [url, setUrl] = useState(''), [size, setSize] = useState(null), [error, setError] = useState('');
  const [zoom, setZoom] = useState(1), [brush, setBrush] = useState(40), [erase, setErase] = useState(false), [actions, setActions] = useState([]), [redo, setRedo] = useState([]), [busy, setBusy] = useState(false);
  const canvas = useRef(null), active = useRef(null), sequence = useRef(0), currentValue = useRef(value);
  currentValue.current = value;
  useEffect(() => { if (!value?.imageFile) { setUrl(''); setSize(null); return; } const next = URL.createObjectURL(value.imageFile); setUrl(next); return () => URL.revokeObjectURL(next); }, [value?.imageFile]);
  useEffect(() => { if (value?.imageFile) return; sequence.current++; setActions([]); setRedo([]); }, [value?.imageFile]);
  const draw = list => {
    const el = canvas.current; if (!el) return;
    const ctx = el.getContext('2d'); ctx.clearRect(0, 0, el.width, el.height);
    for (const a of list) {
      ctx.globalCompositeOperation = a.kind === 'invert' ? 'xor' : a.erase ? 'destination-out' : 'source-over';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
      if (a.kind === 'invert') { ctx.fillRect(0, 0, el.width, el.height); continue; }
      ctx.lineWidth = a.brush; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const first = a.points[0]; ctx.beginPath(); ctx.arc(first.x, first.y, a.brush / 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(first.x, first.y); for (const p of a.points.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  useEffect(() => { draw(actions); }, [actions, size]);
  useEffect(() => () => { sequence.current++; }, []);
  const choose = async file => {
    if (!file) return;
    const token = ++sequence.current; setBusy(true); setError('');
    const previous = currentValue.current; onChange({ ...previous, maskPending: true });
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > maxBytes) throw Error('请选择不超过 8 MB 的 PNG、JPEG 或 WebP 图片');
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 16777216) throw Error('图片最多 1600 万像素，单边不超过 8192 像素');
        const el = document.createElement('canvas'); el.width = bitmap.width; el.height = bitmap.height; el.getContext('2d').drawImage(bitmap, 0, 0);
        const blob = await pngBlob(el); if (blob.size > maxBytes) throw Error('转为 PNG 后超过 8 MB，请先缩小图片');
        if (token !== sequence.current) return;
        setSize({ width: el.width, height: el.height }); setActions([]); setRedo([]); setZoom(1);
        onChange({ imageFile: new File([blob], 'workflow-image.png', { type: 'image/png' }), maskFile: null, maskPending: false });
      } finally { bitmap.close(); }
    } catch (e) { if (token === sequence.current) { setError(e.message); onChange(previous); } }
    finally { if (token === sequence.current) setBusy(false); }
  };
  const point = event => { const rect = canvas.current.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.current.width / rect.width, y: (event.clientY - rect.top) * canvas.current.height / rect.height }; };
  const commit = list => { if (disabled || busy) return; setActions(list); setRedo([]); onChange({ ...currentValue.current, maskFile: null, maskPending: Boolean(list.length) }); };
  const applyMask = async () => {
    const token = ++sequence.current; setBusy(true); setError('');
    try {
      if (!actions.length) { onChange({ ...value, maskFile: null, maskPending: false }); return; }
      const overlay = canvas.current, el = document.createElement('canvas'); el.width = overlay.width; el.height = overlay.height;
      const ctx = el.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, el.width, el.height); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(overlay, 0, 0);
      const alpha = ctx.getImageData(0, 0, el.width, el.height).data;
      let editable = false; for (let i = 3; i < alpha.length; i += 4) if (alpha[i] < 255) { editable = true; break; }
      if (!editable) throw Error('遮罩没有编辑区域，请涂抹希望修改的位置');
      const blob = await pngBlob(el); if (blob.size > maxBytes) throw Error('遮罩超过 8 MB，请缩小图片');
      if (token === sequence.current) onChange({ ...currentValue.current, maskFile: new File([blob], 'workflow-mask.png', { type: 'image/png' }), maskPending: false });
    } catch (e) { if (token === sequence.current) setError(e.message); }
    finally { if (token === sequence.current) setBusy(false); }
  };
  return <section className="workflow-image-input" aria-label="图片与遮罩" onDragOver={e => { if (!disabled && !busy && e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (!disabled && !busy) void choose(e.dataTransfer.files?.[0]); }} onPaste={e => { const file = [...e.clipboardData.items].find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile(); if (file && !disabled && !busy) { e.preventDefault(); void choose(file); } }}>
    <label>输入图片<input type="file" disabled={disabled || busy} accept="image/png,image/jpeg,image/webp" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} /></label>
    {url && <><button type="button" disabled={disabled || busy} onClick={() => { setError(''); onChange(null); }}>移除图片</button><p>涂抹区域将交给图片编辑 API 修改。未涂抹时编辑整张图片。遮罩保存原图尺寸。</p>
      <label>查看缩放<input type="range" min="1" max="4" step="0.25" value={zoom} disabled={disabled || busy} onChange={e => setZoom(Number(e.target.value))}/>{Math.round(zoom * 100)}%</label>
      <fieldset disabled={disabled || busy}><legend>遮罩画笔</legend><label>画笔直径（原图像素）<input type="range" min="1" max="300" value={brush} onChange={e => setBrush(Number(e.target.value))} />{brush}</label>
        <button type="button" aria-pressed={!erase} onClick={() => setErase(false)}>画笔</button><button type="button" aria-pressed={erase} onClick={() => setErase(true)}>橡皮</button>
        <button type="button" disabled={!actions.length} onClick={() => { setRedo([...redo, actions.at(-1)]); setActions(actions.slice(0, -1)); onChange({ ...value, maskFile: null, maskPending: actions.length > 1 }); }}>撤销</button>
        <button type="button" disabled={!redo.length} onClick={() => { setActions([...actions, redo.at(-1)]); setRedo(redo.slice(0, -1)); onChange({ ...value, maskFile: null, maskPending: true }); }}>重做</button>
        <button type="button" onClick={() => commit([...actions, { kind: 'invert' }])}>反选</button><button type="button" onClick={() => commit([])}>清空</button>
      </fieldset>
      <div className="workflow-mask-stage"><div className="workflow-mask-surface" style={{width:`${zoom * 100}%`}}><img src={url} alt="待编辑原图" onLoad={e => { if (!size) setSize({ width: e.target.naturalWidth, height: e.target.naturalHeight }); }} />
        {size && <canvas ref={canvas} width={size.width} height={size.height} aria-label="涂抹需要修改的区域" onPointerDown={e => { if (disabled || busy || e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); active.current = { brush, erase, points: [point(e)] }; draw([...actions, active.current]); onChange({ ...currentValue.current, maskFile: null, maskPending: true }); }} onPointerMove={e => { if (!active.current) return; active.current.points.push(point(e)); draw([...actions, active.current]); }} onPointerUp={() => { if (active.current) { commit([...actions, active.current]); active.current = null; } }} onPointerCancel={() => { active.current = null; draw(actions); onChange({ ...currentValue.current, maskFile: null, maskPending: Boolean(actions.length) }); }} />}
      </div></div>
      <small>{size?.width} × {size?.height} · {value?.maskFile ? '遮罩已应用' : actions.length ? '遮罩已修改，请应用后继续' : '未设置遮罩：整图编辑'}</small>
      <button type="button" disabled={disabled || busy || !actions.length} onClick={applyMask}>{busy ? '处理中…' : '应用遮罩'}</button>
      <input type="hidden" value={actions.length && !value?.maskFile ? 'pending' : 'ready'} />
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
