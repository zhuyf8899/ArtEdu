export function DocumentOptions({ method, pageCount, onChange, disabled = false }) {
  if (method.outputFormat !== "pptx") return null;
  return <label className="ai-document-options">PPT 总页数（含封面）<select aria-label="PPT 总页数" value={pageCount} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="">按描述自动安排</option>{Array.from({ length: 11 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count} 页</option>)}</select></label>;
}
