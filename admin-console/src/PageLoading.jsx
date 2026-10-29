export function PageLoading({ label = '正在加载…' }) {
  return <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
    <span className="page-loading__spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}
