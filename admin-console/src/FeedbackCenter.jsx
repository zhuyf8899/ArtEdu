import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";

const FeedbackContext = createContext(null);

const ERROR_PATTERN = /失败|错误|无法|不能|不存在|未配置|无权|拒绝|异常|失效/;

export function FeedbackProvider({ children }) {
  const [notices, setNotices] = useState([]);
  const [dialog, setDialog] = useState(null);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback((message, tone) => {
    const text = typeof message === "string" ? message : message?.message || "操作失败，请稍后重试";
    const resolvedTone = tone || (ERROR_PATTERN.test(text) ? "error" : "success");
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotices((current) => [...current.slice(-2), { id, text, tone: resolvedTone }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), resolvedTone === "error" ? 5200 : 3400));
    return id;
  }, [dismiss]);

  const confirmAction = useCallback((options) => new Promise((resolve) => {
    setDialog({
      title: options.title || "确认操作",
      message: options.message || "此操作会立即生效。",
      confirmLabel: options.confirmLabel || "确认",
      cancelLabel: options.cancelLabel || "取消",
      danger: Boolean(options.danger),
      resolve,
    });
  }), []);

  const settleDialog = useCallback((confirmed) => {
    setDialog((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    dialog?.resolve(false);
  }, [dialog]);

  const value = useMemo(() => ({ notify, confirmAction }), [confirmAction, notify]);

  return <FeedbackContext.Provider value={value}>
    {children}
    <div className="feedback-stack" aria-live="polite" aria-atomic="false">
      {notices.map((notice) => <article className={`feedback-toast feedback-toast--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} key={notice.id}>
        {notice.tone === "error" ? <WarningCircle size={20} weight="fill" /> : notice.tone === "info" ? <Info size={20} weight="fill" /> : <CheckCircle size={20} weight="fill" />}
        <span>{notice.text}</span>
        <button onClick={() => dismiss(notice.id)} aria-label="关闭提示"><X size={15} weight="bold" /></button>
      </article>)}
    </div>
    {dialog && <div className="feedback-dialog-layer" role="presentation">
      <button className="feedback-dialog-scrim" onClick={() => settleDialog(false)} aria-label="取消操作" />
      <section className="feedback-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feedback-dialog-title" aria-describedby="feedback-dialog-message">
        <span className={dialog.danger ? "is-danger" : ""}><WarningCircle size={24} weight="fill" /></span>
        <h2 id="feedback-dialog-title">{dialog.title}</h2>
        <p id="feedback-dialog-message">{dialog.message}</p>
        <div><button onClick={() => settleDialog(false)}>{dialog.cancelLabel}</button><button autoFocus className={dialog.danger ? "is-danger" : "is-primary"} onClick={() => settleDialog(true)}>{dialog.confirmLabel}</button></div>
      </section>
    </div>}
  </FeedbackContext.Provider>;
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback 必须在 FeedbackProvider 内使用");
  return value;
}
