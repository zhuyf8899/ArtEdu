import { useEffect, useState } from "react";
import { ArrowClockwise, CheckCircle, Copy, PlugsConnected, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { getBridgeDevices, pairBridgeDevice, revokeBridgeDevice } from "./services/adminApi.js";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

export function BridgeDevices({ showToast, confirmAction }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [pairing, setPairing] = useState(null);
  const [deviceName, setDeviceName] = useState("我的电脑 GPU Worker");
  const [tokenDays, setTokenDays] = useState(30);
  const load = async () => {
    setLoading(true);
    try { const result = await getBridgeDevices(); setDevices(result.items ?? []); }
    catch (error) { showToast(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const pair = async () => {
    try {
      const result = await pairBridgeDevice(deviceName.trim() || "我的电脑 GPU Worker", tokenDays);
      setPairing(result);
      await load();
    } catch (error) { showToast(error.message); }
  };
  const copyToken = async () => {
    try { await navigator.clipboard.writeText(pairing.token); showToast("配对令牌已复制；请只粘贴到本机 GPU Worker 配置中"); }
    catch { showToast("浏览器未允许复制，请手动复制令牌", "error"); }
  };
  const revoke = async (device) => {
    const confirmed = await confirmAction({ title: "撤销 Bridge 设备", message: `确认撤销“${device.displayName}”吗？撤销后该设备会立即停止领取和执行模型任务。`, confirmLabel: "确认撤销", danger: true });
    if (!confirmed) return;
    setBusyId(device.id);
    try { await revokeBridgeDevice(device.id); setDevices((current) => current.filter((item) => item.id !== device.id)); showToast("Bridge 设备已撤销"); }
    catch (error) { showToast(error.message); }
    finally { setBusyId(""); }
  };
  return <div className="page-content">
    <section className="page-intro"><div><p>// LOCAL MODEL BRIDGE</p><h1>本地 Bridge</h1><span>管理本地模型与 GPU 执行器。令牌只在配对时返回，过期或撤销后不可恢复。</span></div><button className="outline-button" onClick={load} disabled={loading}><ArrowClockwise size={17} /> 刷新状态</button></section>
    <section className="bridge-security-note"><CheckCircle size={22} weight="fill" /><div><strong>云端不会接收本地模型 API Key，也不会主动连接你的电脑</strong><span>本机 Worker 主动领取任务并回传允许展示的产物；门户服务器只承担鉴权、调度和审计。</span></div></section>
    <section className="bridge-pair-panel"><div><p>// PAIR A GPU WORKER</p><h2>配对我的电脑</h2><span>为本机 GPU Worker 创建短期令牌。令牌只显示一次，不能上传到 Git、聊天记录或云服务器。</span></div><label>设备名称<input maxLength="80" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label><label>令牌有效期<select value={tokenDays} onChange={(event) => setTokenDays(Number(event.target.value))}><option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option></select></label><button className="primary-button" onClick={pair}><Plus size={17} weight="bold" /> 创建配对令牌</button></section>
    {pairing && <section className="bridge-token" role="status"><div><strong>只显示一次的本机配对令牌</strong><span>设备：{pairing.deviceId}。有效期 {pairing.tokenDays} 天，至 {formatDate(pairing.expiresAt)}。复制后立即写入你电脑的本地环境变量；关闭此提示后无法再次查看。</span><code>{pairing.token}</code></div><button onClick={copyToken}><Copy size={16} weight="bold" /> 复制令牌</button></section>}
    <section className="table-panel bridge-panel"><div className="panel__heading"><div><p>// PAIRED DEVICES</p><h2>已配对设备</h2></div><span>{loading ? "读取中" : `${devices.length} 台有效设备`}</span></div>{loading ? <div className="empty-state"><PlugsConnected size={34} /><strong>正在读取设备状态</strong></div> : devices.length ? <div className="bridge-list">{devices.map((device) => <article className="bridge-row" key={device.id}><div className="bridge-row__icon"><PlugsConnected size={22} weight="bold" /></div><div className="bridge-row__main"><strong>{device.displayName}</strong><span>{device.id}</span></div><div className="bridge-row__meta"><span className={device.status === "online" ? "bridge-online" : "bridge-offline"}><i />{device.status === "online" ? "在线" : "离线"}</span><small>最近心跳：{formatDate(device.lastSeenAt)}</small><small>有效期至：{formatDate(device.expiresAt)}</small></div><button className="bridge-revoke" disabled={busyId === device.id} onClick={() => revoke(device)}><Trash size={16} />{busyId === device.id ? "撤销中…" : "撤销"}</button></article>)}</div> : <div className="empty-state"><WarningCircle size={34} /><strong>暂无已配对设备</strong><span>请在本地 Bridge 配置流程中使用登录后的配对令牌。</span></div>}</section>
  </div>;
}
