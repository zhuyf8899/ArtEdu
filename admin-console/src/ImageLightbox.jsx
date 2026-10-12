import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, ArrowSquareOut, ArrowsCounterClockwise, ArrowsOutSimple, DownloadSimple, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from "@phosphor-icons/react";
import { safeImageUrl } from "./imageSources.js";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** 以指针为中心缩放：光标下的那一点在缩放前后停在原地，手感才像看图工具。 */
function zoomAt(view, factor, pointer, stage) {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === view.scale) return view;
  if (!pointer || !stage) return { ...view, scale };
  const rect = stage.getBoundingClientRect();
  const cx = pointer.x - rect.left - rect.width / 2;
  const cy = pointer.y - rect.top - rect.height / 2;
  const ratio = scale / view.scale;
  return { scale, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

/**
 * QQ 式看图浮层：滚轮（含触控板捏合）缩放、拖动平移、双击复位、Esc 或点空白关闭。
 */
export function ImageLightbox({ src, alt = "", fileName = "", onClose, variant = "default", gallery = null }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus?.();
    return () => { document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true }); };
  }, []);

  // 切换图片从完整适屏状态开始，不沿用上一张的缩放或拖动位置。
  useEffect(() => { reset(); dragRef.current = null; }, [src, reset]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
      else if (event.key === "+" || event.key === "=") setView((current) => zoomAt(current, 1.25, null, null));
      else if (event.key === "-") setView((current) => zoomAt(current, 0.8, null, null));
      else if (event.key === "0") reset();
      else if (event.key === "ArrowLeft" && gallery?.onPrevious) { event.preventDefault(); gallery.onPrevious(); }
      else if (event.key === "ArrowRight" && gallery?.onNext) { event.preventDefault(); gallery.onNext(); }
      else if (event.key === "Tab") {
        const controls = [...(dialogRef.current?.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), a[href]') ?? [])];
        const first = controls[0], last = controls.at(-1), active = document.activeElement;
        if (controls.length && (event.shiftKey ? active === first || !controls.includes(active) : active === last || !controls.includes(active))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, reset, gallery]);

  // 必须用原生监听：React 的 onWheel 是被动监听，preventDefault 不生效，页面会跟着滚。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018));
      setView((current) => zoomAt(current, factor, { x: event.clientX, y: event.clientY }, stage));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const startDrag = (event) => {
    if (event.button !== 0 || event.target === event.currentTarget) return;
    dragRef.current = { x: event.clientX, y: event.clientY, origin: view };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setView({ scale: drag.origin.scale, x: drag.origin.x + (event.clientX - drag.x), y: drag.origin.y + (event.clientY - drag.y) });
  };
  const endDrag = (event) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const percent = Math.round(view.scale * 100);
  const zoomed = view.scale !== 1 || view.x !== 0 || view.y !== 0;

  return createPortal(<div className={`image-lightbox${variant === "gallery" ? " image-lightbox--gallery" : ""}`} ref={dialogRef} role="dialog" aria-modal="true" aria-label="图片预览">
    <button type="button" className="image-lightbox__scrim" tabIndex={-1} aria-label="关闭图片查看" onClick={onClose} />
    <button type="button" className="image-lightbox__close" onClick={onClose} ref={closeRef} aria-label="关闭图片查看" title="关闭（Esc）"><X size={24} /></button>
    {gallery && <div className="image-lightbox__navigation">
      <button type="button" className="image-lightbox__previous" disabled={!gallery.onPrevious} onClick={gallery.onPrevious} aria-label="上一张图片"><CaretLeft size={30} weight="light" /></button>
      <span aria-live="polite">{gallery.index + 1} / {gallery.count}</span>
      <button type="button" className="image-lightbox__next" disabled={!gallery.onNext} onClick={gallery.onNext} aria-label="下一张图片"><CaretRight size={30} weight="light" /></button>
    </div>}
    <div
      className={`image-lightbox__stage${dragRef.current ? " is-dragging" : ""}`}
      ref={stageRef}
      onPointerDown={startDrag}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => {
        const next = view.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : zoomAt(view, 2 / view.scale, { x: event.clientX, y: event.clientY }, stageRef.current);
        setView(next);
      }}
    >
      <img
        src={src}
        alt={alt && alt !== fileName ? alt : "作品图片"}
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, cursor: dragRef.current ? "grabbing" : view.scale > 1 ? "grab" : "zoom-in" }}
      />
    </div>
    <div className="image-lightbox__bar" role="toolbar" aria-label="图片操作">
      <div className="image-lightbox__tools">
        <button type="button" onClick={() => setView((current) => zoomAt(current, 0.8, null, null))} aria-label="缩小" title="缩小（-）"><MagnifyingGlassMinus size={17} weight="bold" /></button>
        <b aria-live="polite">{percent}%</b>
        <button type="button" onClick={() => setView((current) => zoomAt(current, 1.25, null, null))} aria-label="放大" title="放大（+）"><MagnifyingGlassPlus size={17} weight="bold" /></button>
        <button type="button" onClick={reset} disabled={!zoomed} aria-label="恢复原始大小" title="恢复原始大小（0）"><ArrowsCounterClockwise size={17} weight="bold" /></button>
        <a href={src} target="_blank" rel="noopener noreferrer" aria-label="在新窗口打开原图" title="在新窗口打开原图"><ArrowSquareOut size={17} weight="bold" /></a>
        {/^\/(?!\/)/.test(src) && <a href={src} download={fileName || ""} aria-label="下载原图" title="下载原图"><DownloadSimple size={17} weight="bold" /></a>}
      </div>
      <small className="image-lightbox__hint">{gallery?.count > 1 ? "← → 切换 · " : ""}滚轮缩放 · 拖动平移 · 双击复位 · Esc 关闭</small>
    </div>
  </div>, document.body);
}

/**
 * 对话里的图片产物：默认在气泡内直接展示（不再只给一个跳转链接），
 * 点一下进入上面的看图浮层。
 */
export function ZoomableImage({ src, alt = "生成图片", fileName = "" }) {
  const safe = safeImageUrl(src);
  const [open, setOpen] = useState(false);
  if (!safe) return null;
  return <>
    <button type="button" className="chat-image" onClick={() => setOpen(true)} title="点击放大：滚轮缩放">
      <img src={safe} alt={alt} loading="lazy" />
      <span className="chat-image__hint"><ArrowsOutSimple size={13} weight="bold" /> 点击放大 · 滚轮缩放</span>
    </button>
    {open && <ImageLightbox src={safe} alt={alt} fileName={fileName} onClose={() => setOpen(false)} />}
  </>;
}
