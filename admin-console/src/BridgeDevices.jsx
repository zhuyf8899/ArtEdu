import { useEffect, useState } from "react";
import { ArrowClockwise, CheckCircle, PlugsConnected, Trash, WarningCircle } from "@phosphor-icons/react";
import { getBridgeDevices, revokeBridgeDevice } from "./services/adminApi.js";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

export function BridgeDevices({ showToast, confirmAction }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const load = async () => {
    setLoading(true);
    try { const result = await getBridgeDevices(); setDevices(result.items ?? []); }
    catch (error) { showToast(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const revoke = async (device) => {
    const confirmed = await confirmAction({ title: "撤销 Bridge 设备", message: `确认撤销“${device.displayName}”吗？撤销后该设备会立即停止领取和执行模型任务。`, confirmLabel: "确认撤销", danger: true });
    if (!confirmed) return;
    setBusyId(device.id);
    try { await revokeBridgeDevice(device.id); setDevices((current) => current.filter((item) => item.id !== device.id)); showToast("Bridge 设备已撤销"); }
    catch (error) { showToast(error.message); }
    finally { setBusyId(""); }
  };
  return <div className="page-content">
    <section className="page-intro"><div><p>// LOCAL MODEL BRIDGE</p><h1>本地 Bridge</h1><span>管理本地模型执行器。令牌只在配对时返回，过期或撤销后不可恢复。</span></div><button className="outline-button" onClick={load} disabled={loading}><ArrowClockwise size={17} /> 刷新状态</button></section>
    <section className="bridge-security-note"><CheckCircle size={22} weight="fill" /><div><strong>云端不会接收本地模型 API Key</strong><span>Bridge 只通过短期访问令牌领取当前用户任务，并将结果回传到对应任务。</span></div></section>
    <section className="table-panel bridge-panel"><div className="panel__heading"><div><p>// PAIRED DEVICES</p><h2>已配对设备</h2></div><span>{loading ? "读取中" : `${devices.length} 台有效设备`}</span></div>{loading ? <div className="empty-state"><PlugsConnected size={34} /><strong>正在读取设备状态</strong></div> : devices.length ? <div className="bridge-list">{devices.map((device) => <article className="bridge-row" key={device.id}><div className="bridge-row__icon"><PlugsConnected size={22} weight="bold" /></div><div className="bridge-row__main"><strong>{device.displayName}</strong><span>{device.id}</span></div><div className="bridge-row__meta"><span className={device.status === "online" ? "bridge-online" : "bridge-offline"}><i />{device.status === "online" ? "在线" : "离线"}</span><small>最近心跳：{formatDate(device.lastSeenAt)}</small><small>有效期至：{formatDate(device.expiresAt)}</small></div><button className="bridge-revoke" disabled={busyId === device.id} onClick={() => revoke(device)}><Trash size={16} />{busyId === device.id ? "撤销中…" : "撤销"}</button></article>)}</div> : <div className="empty-state"><WarningCircle size={34} /><strong>暂无已配对设备</strong><span>请在本地 Bridge 配置流程中使用登录后的配对令牌。</span></div>}</section>
  </div>;
}
