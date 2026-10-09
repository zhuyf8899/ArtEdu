import { useEffect, useState } from 'react';
import { getRuntimeStatus } from './services/adminApi.js';

export function RuntimeStatus() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true); setError('');
    try { setState(await getRuntimeStatus()); } catch { setState(null); setError('状态无法读取，请检查 API 与当前账号权限'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section className="runtime-status" aria-label="运行环境状态" style={{padding:'12px 16px',marginBottom:16,border:'1px solid #ddd',borderRadius:10,background:'#fafafa',fontSize:14,lineHeight:1.8}}>
    <strong>运行环境</strong> · 当前访问 {window.location.host}
    {state && <><div>环境：{state.environment} · API 版本：{state.version} · 数据库/迁移：{state.database ? '正常' : '未就绪'} · 素材目录：{state.uploads ? '正常' : '未就绪'}</div>
      {/* 这里只陈述运行事实：此前写死的"测试账号/请勿作为公网正式环境/不代表供应商可用"是
          面向运维的告警，出现在演示与对外界面上与平台状态无关，反而会被误读成"这不是正式环境"。 */}
      <div>账号登录：{state.localAuth ? '已启用' : '未启用'} · 模型执行：{state.modelExecution ? '已启用' : '未启用'}</div>
      <small>最近检查：{new Date(state.checkedAt).toLocaleString()}</small></>}
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={refresh} disabled={loading} style={{marginLeft:12}}>{loading ? '检测中…' : '重新检测'}</button>
  </section>;
}
