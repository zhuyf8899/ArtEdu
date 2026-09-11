import { useEffect, useRef, useState } from "react";
import { CREATION_METHODS, creationMethod } from "./creationMethods.js";

// 五个能力按钮并排会把工具条挤成一团：这里收敛为一个小圆形按钮，
// 点开才展开完整能力列表（图标 + 名称 + 说明），选中即收起。
export function CapabilityPicker({ methodId, onChange, align = "start", label = "创作能力" }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const method = creationMethod(methodId);

  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") { setOpen(false); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  return <div className={`ai-method-picker ai-method-picker--${align}`} ref={root}>
    <button
      type="button"
      className="ai-method-menu__trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${label}：${method.label}，点击展开能力列表`}
      title={`${label}：${method.label}`}
      onClick={() => setOpen((value) => !value)}
    >
      <method.Icon size={19} weight="bold" />
    </button>
    {open && <div className="ai-method-menu" role="listbox" aria-label="选择创作能力">
      {CREATION_METHODS.map(({ id, label: name, eyebrow, Icon }) => <button
        type="button"
        key={id}
        role="option"
        aria-selected={methodId === id}
        className={methodId === id ? "is-active" : ""}
        onClick={() => { onChange(id); setOpen(false); }}
      ><Icon size={18} weight="bold" /><span><strong>{name}</strong><small>{eyebrow}</small></span></button>)}
    </div>}
  </div>;
}
