import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bell, CaretDown, ChartBar, Check, Clock, Coins, Eye,
  BookOpenText, CirclesThreePlus, FileImage, Gauge, List, MagnifyingGlass, Robot, ShieldCheck,
  PlugsConnected, SlidersHorizontal, Sparkle, Users, Warning, X,
} from "@phosphor-icons/react";
import {
  getAdminDashboard,
  getAdminReviews,
  getAdminUsers,
  reviewSubmission,
  updateUserQuota,
  updateUsersQuota,
  updateUserStatus,
} from "./services/adminApi.js";
import { AdminCourses } from "./AdminCourses.jsx";
import { WorkflowAdmin } from "./WorkflowAdmin.jsx";
import { BridgeDevices } from "./BridgeDevices.jsx";
import { useFeedback } from "./FeedbackCenter.jsx";

const navItems = [
  { id: "overview", label: "总览", icon: ChartBar },
  { id: "users", label: "用户管理", icon: Users },
  { id: "courses", label: "课程资源", icon: BookOpenText },
  { id: "workflows", label: "工作流管理", icon: CirclesThreePlus },
  { id: "reviews", label: "作品审核", icon: ShieldCheck },
  { id: "bridges", label: "本地 Bridge", icon: PlugsConnected },
];

const statusLabel = { active: "正常", limited: "额度用尽", suspended: "已停用" };

function formatQuotaLimit(value, unit) { return value === null || value === undefined ? `不限 / ${unit}` : `${value} / ${unit}`; }
function formatLastActive(value) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "暂无记录";
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "刚刚活跃";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function AppLogo() {
  return <div className="brand"><div className="brand__mark">A</div><div><strong>AIGC 管理台</strong><span>清华美院 AI 实验场</span></div></div>;
}

function Sidebar({ section, onSectionChange, open, onClose, pendingCount, items, actor, onBack, dashboard }) {
  return <>
    {open && <button className="scrim" aria-label="关闭菜单" onClick={onClose} />}
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar__top"><AppLogo /><button className="icon-button sidebar__close" onClick={onClose} aria-label="关闭导航"><X size={20} weight="bold" /></button></div>
      <div className="sidebar__eyebrow">// ADMIN CONSOLE</div>
      <nav className="side-nav" aria-label="管理员导航">
        {items.map((item, index) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "is-active" : ""} onClick={() => { onSectionChange(item.id); onClose(); }}><span className="side-nav__index">0{index + 1}</span><Icon size={20} weight={section === item.id ? "fill" : "regular"} /><span>{item.label}</span>{item.id === "reviews" && <b>{pendingCount}</b>}</button>; })}
      </nav>
      <button className="sidebar__back" onClick={onBack}>← 返回 ArtEdu 测试站</button>
      <div className="sidebar__notice"><div className="sidebar__notice-label"><Sparkle size={15} weight="fill" /> 系统状态</div><strong>本地模型执行未启用</strong><div className="status-line"><span /> {dashboard ? `${dashboard.activeModels} 个模型配置已启用` : "正在读取模型配置"}</div></div>
      <div className="sidebar__account"><div className="avatar avatar--light">{actor?.shortName?.slice(0, 1) ?? "管"}</div><div><strong>{actor?.shortName ?? "平台管理员"}</strong><span>{actor?.roleLabel ?? "管理员"}</span></div><CaretDown size={16} weight="bold" /></div>
    </aside>
  </>;
}

function Topbar({ section, onOpenMenu, actor, onBack, users, reviews, dashboard, onNavigate }) {
  const titles = { overview: ["管理总览", "查看平台状态、额度消耗与待办事项"], users: ["用户管理", "管理账户状态与每个用户的 API 使用额度"], courses: ["课程资源", "创建课程、配置课时并完成发布审核"], workflows: ["工作流管理", "创建教学与创作路径，编辑版本并发布到学生端"], reviews: ["作品审核", "审核用户提交到资源库的作品与案例"], bridges: ["本地 Bridge", "管理本机模型执行器与访问令牌"] };
  const [query, setQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    const matchedUsers = users.filter((user) => `${user.name}${user.id}${user.department ?? ""}`.toLowerCase().includes(keyword)).slice(0, 4).map((user) => ({ id: `user-${user.id}`, label: user.name, detail: `${user.identity} · ${user.department ?? "未分院系"}`, section: "users" }));
    const matchedReviews = reviews.filter((review) => `${review.id}${review.title}${review.author}`.toLowerCase().includes(keyword)).slice(0, 4).map((review) => ({ id: `review-${review.id}`, label: review.title, detail: `${review.author} · ${review.status === "pending" ? "待审核" : "已处理"}`, section: "reviews" }));
    return [...matchedUsers, ...matchedReviews].slice(0, 6);
  }, [query, reviews, users]);
  const notifications = useMemo(() => {
    const items = [];
    const pending = reviews.filter((item) => item.status === "pending").length;
    const quotaAlerts = users.filter((user) => user.monthlyLimit > 0 && user.monthlyUsed / user.monthlyLimit >= 0.7).length;
    if (pending) items.push({ id: "reviews", title: `${pending} 项作品等待审核`, detail: "进入审核队列处理投稿", section: "reviews" });
    if (quotaAlerts) items.push({ id: "quota", title: `${quotaAlerts} 个账户额度接近上限`, detail: "检查并调整用户额度", section: "users" });
    if (dashboard && dashboard.activeModels === 0) items.push({ id: "models", title: "模型服务尚未启用", detail: "创作任务会保存草稿，不会调用外部模型", section: "overview" });
    return items;
  }, [dashboard, reviews, users]);
  return <header className="topbar">
    <button className="icon-button menu-button" onClick={onOpenMenu} aria-label="打开导航"><List size={22} weight="bold" /></button>
    <div className="topbar__title"><p>// CONTROL CENTER</p><div><strong>{titles[section][0]}</strong><span>{titles[section][1]}</span></div></div>
    <button className="topbar__back" onClick={onBack}>← ArtEdu</button>
    <form className="global-search" onSubmit={(event) => { event.preventDefault(); if (results[0]) { onNavigate(results[0].section); setQuery(""); } }}><MagnifyingGlass size={18} weight="bold" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="全局搜索" placeholder="搜索用户或投稿作品……" />{query ? <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} weight="bold" /></button> : <kbd>Enter</kbd>}{results.length > 0 && <div className="admin-search-results">{results.map((result) => <button type="button" key={result.id} onClick={() => { onNavigate(result.section); setQuery(""); }}><strong>{result.label}</strong><span>{result.detail}</span></button>)}</div>}</form>
    <div className="topbar__notification-wrap"><button className="topbar__alert" aria-label="通知" aria-expanded={showNotifications} onClick={() => setShowNotifications((open) => !open)}><Bell size={21} weight="bold" />{notifications.length > 0 && <span>{notifications.length}</span>}</button>{showNotifications && <section className="notification-panel"><header><strong>待处理提醒</strong><button onClick={() => setShowNotifications(false)} aria-label="关闭通知"><X size={15} weight="bold" /></button></header>{notifications.length ? notifications.map((item) => <button key={item.id} onClick={() => { onNavigate(item.section); setShowNotifications(false); }}><strong>{item.title}</strong><span>{item.detail}</span></button>) : <p>目前没有待处理事项。</p>}</section>}</div>
    <div className="topbar__admin"><div className="avatar">{actor?.shortName?.slice(0, 1) ?? "管"}</div><div><strong>{actor?.shortName ?? "管理员"}</strong><span>{actor?.roleLabel ?? "超级管理员"}</span></div></div>
  </header>;
}

function MetricCard({ label, value, change, accent, icon: Icon }) {
  return <article className={`metric-card ${accent ? "metric-card--accent" : ""}`}><div className="metric-card__header"><span>{label}</span><Icon size={22} weight="bold" /></div><strong>{value}</strong><p>{change}</p><div className="metric-card__corner" /></article>;
}

function formatCount(value) {
  if (value === undefined || value === null) return "读取中";
  return Number(value).toLocaleString("zh-CN");
}

function Overview({ users, reviews, dashboard, onNavigate, onEditQuota }) {
  const totalUsed = users.reduce((sum, user) => sum + user.monthlyUsed, 0);
  const hourlyUsage = dashboard?.hourlyApiCalls ?? [];
  const maxHourlyUsage = Math.max(1, ...hourlyUsage.map((item) => Number(item.calls)));
  return <div className="page-content">
    <section className="metrics-grid">
      <MetricCard label="平台用户" value={String(dashboard?.users ?? users.length)} change="数据库实时统计" icon={Users} />
      <MetricCard label="本月 API 调用" value={formatCount(dashboard?.monthlyApiCalls)} change={`${formatCount(dashboard?.todayApiCalls)} 次 · 今日`} icon={Gauge} accent />
      <MetricCard label="待审核作品" value={String(dashboard?.pendingReviews ?? reviews.filter((item) => item.status === "pending").length).padStart(2, "0")} change="数据库实时统计" icon={ShieldCheck} />
      <MetricCard label="已消耗额度" value={totalUsed.toLocaleString()} change="数据库用户额度合计" icon={Coins} />
    </section>
    <section className="overview-grid">
      <article className="panel usage-panel"><div className="panel__heading"><div><p>// API USAGE</p><h2>调用统计</h2></div><span className="live-chip">数据库实时</span></div><div className="usage-summary"><strong>{formatCount(dashboard?.todayApiCalls)}</strong><span>次调用 · 今日</span></div><div className="usage-chart" aria-label="最近八小时 API 调用趋势">{hourlyUsage.map((item) => <div key={item.hour} title={`${new Date(item.hour).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}：${item.calls} 次`}><i style={{ height: `${Math.max(5, Math.round(Number(item.calls) / maxHourlyUsage * 100))}%` }} /><span>{new Date(item.hour).getHours().toString().padStart(2, "0")}</span></div>)}</div><small className="usage-chart__caption">最近 8 小时 · 成功调用</small></article>
      <article className="panel model-panel"><div className="panel__heading"><div><p>// MODEL STATUS</p><h2>模型服务</h2></div><span className="live-chip"><i /> {dashboard ? `${dashboard.activeModels} 个已启用` : "读取中"}</span></div><div className="empty-state"><Robot size={28} /><strong>模型执行暂未启用</strong><span>当前仅展示数据库中的模型配置状态。</span></div></article>
      <article className="panel review-panel"><div className="panel__heading"><div><p>// REVIEW QUEUE</p><h2>最新待审核</h2></div><button className="text-button" onClick={() => onNavigate("reviews")}>全部审核 <ArrowRight size={16} weight="bold" /></button></div><div className="review-list">{reviews.filter((item) => item.status === "pending").slice(0, 3).map((item, index) => <button key={item.id} onClick={() => onNavigate("reviews")}><span className="queue-index">0{index + 1}</span><div><strong>{item.title}</strong><span>{item.author} · {item.department}</span></div><em>{item.submittedAt}</em><ArrowRight size={17} weight="bold" /></button>)}</div></article>
      <article className="panel quota-alerts"><div className="panel__heading"><div><p>// QUOTA ALERTS</p><h2>额度预警</h2></div><button className="text-button" onClick={() => onNavigate("users")}>管理用户 <ArrowRight size={16} weight="bold" /></button></div>{users.filter((user) => user.monthlyLimit > 0 && user.monthlyUsed / user.monthlyLimit >= 0.7).slice(0, 3).map((user) => { const ratio = Math.round((user.monthlyUsed / user.monthlyLimit) * 100); return <div className="quota-alert" key={user.id}><div className="avatar avatar--outline">{user.initials}</div><div className="quota-alert__info"><strong>{user.name}</strong><span>{user.monthlyUsed} / {user.monthlyLimit} 额度</span></div><div className="quota-alert__meter"><div><i style={{ width: `${ratio}%` }} /></div><span>{ratio}%</span></div><button className="small-button" onClick={() => onEditQuota(user)}>调整</button></div>; })}</article>
    </section>
  </div>;
}

const USERS_PAGE_SIZE = 8;

function UsersPage({ users, onEditQuota, onToggleStatus, selectedIds, onSelectionChange, onOpenBulkQuota, canManageQuota }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [identity, setIdentity] = useState("all");
  const [department, setDepartment] = useState("all");
  const [page, setPage] = useState(1);
  const departments = useMemo(() => [...new Set(users.map((user) => user.department).filter(Boolean))].sort(), [users]);
  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchedQuery = `${user.name}${user.id}${user.department ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchedStatus = status === "all" || user.status === status;
    const matchedIdentity = identity === "all" || user.identity === identity;
    const matchedDepartment = department === "all" || user.department === department;
    return matchedQuery && matchedStatus && matchedIdentity && matchedDepartment;
  }), [query, status, identity, department, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const pageUsers = filteredUsers.slice((page - 1) * USERS_PAGE_SIZE, page * USERS_PAGE_SIZE);
  const pageIds = pageUsers.map((user) => user.id);
  const pageFullySelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  useEffect(() => setPage(1), [query, status, identity, department]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => onSelectionChange((current) => new Set([...current].filter((id) => users.some((user) => user.id === id)))), [onSelectionChange, users]);
  const toggleSelection = (id) => onSelectionChange((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const togglePageSelection = () => onSelectionChange((current) => { const next = new Set(current); pageFullySelected ? pageIds.forEach((id) => next.delete(id)) : pageIds.forEach((id) => next.add(id)); return next; });
  return <div className="page-content">
    <section className="page-intro"><div><p>// USER DIRECTORY</p><h1>用户与 API 额度</h1><span>共 {users.length} 个账户 · 支持按用户限制日额度、月额度和并发任务数</span></div>{canManageQuota && <button className="primary-button" disabled={!selectedIds.size} onClick={onOpenBulkQuota}><Users size={18} weight="bold" /> 批量设置额度{selectedIds.size ? `（${selectedIds.size}）` : ""}</button>}</section>
    <section className="table-panel">
      <div className="table-tools"><label><MagnifyingGlass size={18} weight="bold" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名、编号或院系" /></label><div className="segmented" aria-label="用户状态筛选">{[["all", "全部"], ["active", "正常"], ["limited", "额度用尽"], ["suspended", "已停用"]].map(([value, label]) => <button key={value} className={status === value ? "is-active" : ""} onClick={() => setStatus(value)}>{label}</button>)}</div><label className="select-tool"><span>身份</span><select value={identity} onChange={(event) => setIdentity(event.target.value)}><option value="all">全部身份</option><option value="学生">学生</option><option value="教师">教师</option><option value="运营">运营</option><option value="管理员">管理员</option></select></label><label className="select-tool"><span>院系</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">全部院系</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      <div className="user-table-wrap"><table className="user-table"><thead><tr>{canManageQuota && <th><input type="checkbox" aria-label="选择本页全部用户" checked={pageFullySelected} onChange={togglePageSelection} /></th>}<th>用户</th><th>身份</th><th>API 额度</th><th>本月使用</th><th>状态</th><th>最近活跃</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{pageUsers.map((user) => { const ratio = user.monthlyLimit ? Math.min(100, Math.round(user.monthlyUsed / user.monthlyLimit * 100)) : 0; return <tr key={user.id}>{canManageQuota && <td><input type="checkbox" aria-label={`选择${user.name}`} checked={selectedIds.has(user.id)} onChange={() => toggleSelection(user.id)} /></td>}<td><div className="user-cell"><div className="avatar avatar--outline">{user.initials}</div><div><strong>{user.name}</strong><span>{user.id} · {user.department}</span></div></div></td><td><span className="identity-chip">{user.identity}</span></td><td><strong>{formatQuotaLimit(user.dailyLimit, "日")}</strong><span className="sub-value">{formatQuotaLimit(user.monthlyLimit, "月")} · 并发 {user.concurrentLimit ?? "不限制"}</span></td><td><div className="table-meter"><div><i style={{ width: `${ratio}%` }} /></div><span>{user.monthlyLimit === null ? "—" : `${ratio}%`}</span></div></td><td><span className={`status-chip status-chip--${user.status}`}><i />{statusLabel[user.status]}</span></td><td title={user.lastActive}>{formatLastActive(user.lastActive)}</td><td><div className="row-actions">{canManageQuota ? <><button onClick={() => onEditQuota(user)}>额度</button><button onClick={() => onToggleStatus(user)}>{user.status === "suspended" ? "启用" : "停用"}</button></> : <span className="sub-value">仅管理员可调整</span>}</div></td></tr>; })}</tbody></table></div>
      {filteredUsers.length === 0 && <div className="empty-state"><Users size={34} /><strong>没有匹配的用户</strong><span>尝试调整搜索关键词或筛选条件。</span></div>}
      <div className="table-footer"><span>显示 {pageUsers.length} / {filteredUsers.length} 个账户 · 第 {page} / {totalPages} 页</span><div><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button><button className="is-active">{page}</button><button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页</button></div></div>
    </section>
  </div>;
}

function BulkQuotaDrawer({ count, onClose, onSave }) {
  const [daily, setDaily] = useState(30); const [monthly, setMonthly] = useState(600); const [concurrent, setConcurrent] = useState(2);
  return <div className="drawer-layer" role="presentation"><button className="drawer-scrim" onClick={onClose} aria-label="关闭批量额度设置" /><aside className="drawer" aria-label="批量 API 额度设置"><div className="drawer__header"><div><p>// BULK QUOTA POLICY</p><h2>批量设置额度</h2></div><button className="icon-button" onClick={onClose}><X size={21} weight="bold" /></button></div><p className="bulk-quota-summary">将为 <strong>{count}</strong> 个已选用户应用同一套额度策略。</p><form onSubmit={(event) => { event.preventDefault(); onSave({ dailyLimit: Number(daily), monthlyLimit: Number(monthly), concurrentLimit: Number(concurrent) }); }}><div className="field-group"><label htmlFor="bulk-daily">每日额度上限</label><div className="number-field"><input id="bulk-daily" type="number" min="0" value={daily} onChange={(event) => setDaily(event.target.value)} /><span>额度 / 日</span></div></div><div className="field-group"><label htmlFor="bulk-monthly">每月额度上限</label><div className="number-field"><input id="bulk-monthly" type="number" min="0" value={monthly} onChange={(event) => setMonthly(event.target.value)} /><span>额度 / 月</span></div></div><div className="field-group"><label htmlFor="bulk-concurrent">并发任务数</label><div className="number-field"><input id="bulk-concurrent" type="number" min="0" max="100" value={concurrent} onChange={(event) => setConcurrent(event.target.value)} /><span>个任务</span></div></div><div className="policy-note"><Warning size={20} weight="fill" /><p><strong>设置为 0 将立即停止新任务</strong><span>保存后会为每个账户写入独立审计记录。</span></p></div><div className="drawer__actions"><button type="button" className="outline-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">应用到 {count} 个用户 <ArrowRight size={17} /></button></div></form></aside></div>;
}

function ReviewsPage({ reviews, selectedReview, onSelectReview }) {
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const visibleReviews = reviews.filter((item) => (filter === "all" || item.status === filter) && `${item.id}${item.title}${item.author}${item.department ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content">
    <section className="page-intro"><div><p>// CONTENT MODERATION</p><h1>作品上传审核</h1><span>核对作品信息、生成来源与内容安全结果后再发布到资源库</span></div><div className="review-summary"><Clock size={19} weight="bold" /><div><strong>{reviews.filter((item) => item.status === "pending").length} 项待处理</strong><span>平均等待 1.4 小时</span></div></div></section>
    <section className="review-workspace"><div className="review-queue"><div className="review-tabs">{[["pending", "待审核"], ["approved", "已通过"], ["rejected", "已驳回"], ["all", "全部"]].map(([value, label]) => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="queue-search"><MagnifyingGlass size={17} weight="bold" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索投稿编号、标题、作者或院系" /></label><div className="queue-items">{visibleReviews.map((item) => <button key={item.id} className={selectedReview?.id === item.id ? "is-active" : ""} onClick={() => onSelectReview(item)}><div className="file-tile"><FileImage size={23} weight="bold" /></div><div className="queue-item__main"><span>{item.id} · {item.kind}</span><strong>{item.title}</strong><small>{item.author} / {item.department}</small></div><div className="queue-item__meta"><span>{item.submittedAt}</span><em className={item.machineStatus.includes("复核") ? "is-warning" : ""}>{item.machineStatus}</em></div></button>)}{visibleReviews.length === 0 && <div className="empty-state"><Check size={32} /><strong>这个队列已处理完成</strong><span>暂时没有新的审核项目。</span></div>}</div></div><div className="review-placeholder"><ShieldCheck size={40} weight="thin" /><strong>选择一项作品开始审核</strong><span>右侧将显示作品信息、生成参数和审核操作。</span></div></section>
  </div>;
}

function QuotaDrawer({ user, onClose, onSave }) {
  const [daily, setDaily] = useState(user?.dailyLimit ?? 30); const [monthly, setMonthly] = useState(user?.monthlyLimit ?? 600); const [concurrent, setConcurrent] = useState(user?.concurrentLimit ?? 2);
  if (!user) return null;
  const usedPercent = monthly ? Math.min(100, Math.round(user.monthlyUsed / monthly * 100)) : 0;
  const changes = [["每日", user.dailyLimit, Number(daily)], ["每月", user.monthlyLimit, Number(monthly)], ["并发", user.concurrentLimit, Number(concurrent)]].filter(([, before, after]) => before !== after);
  return <div className="drawer-layer" role="presentation"><button className="drawer-scrim" onClick={onClose} aria-label="关闭额度设置" /><aside className="drawer" aria-label={`${user.name}的 API 额度设置`}><div className="drawer__header"><div><p>// QUOTA POLICY</p><h2>调整 API 额度</h2></div><button className="icon-button" onClick={onClose}><X size={21} weight="bold" /></button></div><div className="drawer__user"><div className="avatar avatar--outline">{user.initials}</div><div><strong>{user.name}</strong><span>{user.id} · {user.department} · {user.identity}</span></div></div><div className="current-usage"><div><span>本月当前使用</span><strong>{user.monthlyUsed} <small>/ {monthly}</small></strong></div><em>{usedPercent}%</em><div className="wide-meter"><i style={{ width: `${usedPercent}%` }} /></div></div><form onSubmit={(event) => { event.preventDefault(); onSave(user.id, { dailyLimit: Number(daily), monthlyLimit: Number(monthly), concurrentLimit: Number(concurrent) }); }}><div className="field-group"><label htmlFor="daily">每日额度上限</label><p>用户每天最多可消耗的积分额度。</p><div className="number-field"><input id="daily" type="number" min="0" value={daily} onChange={(e) => setDaily(e.target.value)} /><span>额度 / 日</span></div></div><div className="field-group"><label htmlFor="monthly">每月额度上限</label><p>每月 1 日自动重置，不影响账户中的历史记录。</p><div className="number-field"><input id="monthly" type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} /><span>额度 / 月</span></div></div><div className="field-group"><label htmlFor="concurrent">并发任务数</label><p>限制用户同时运行的 AI 生成任务数量。</p><div className="number-field"><input id="concurrent" type="number" min="0" max="10" value={concurrent} onChange={(e) => setConcurrent(e.target.value)} /><span>个任务</span></div></div><div className="quota-change-summary"><strong>{changes.length ? "即将应用的调整" : "额度尚未修改"}</strong>{changes.map(([label, before, after]) => <span key={label}>{label}：{before} → <b>{after}</b></span>)}</div><div className="policy-note"><Warning size={20} weight="fill" /><p><strong>设置为 0 将立即停止新任务</strong><span>已运行的任务不受影响，调整记录会写入管理员审计日志。</span></p></div><div className="drawer__actions"><button type="button" className="outline-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={!changes.length}>保存额度策略 <ArrowRight size={17} weight="bold" /></button></div></form></aside></div>;
}

function ReviewDrawer({ review, onClose, onDecision }) {
  const [note, setNote] = useState(""); if (!review) return null;
  return <div className="drawer-layer" role="presentation"><button className="drawer-scrim" onClick={onClose} aria-label="关闭审核详情" /><aside className="drawer drawer--review" aria-label="作品审核详情"><div className="drawer__header"><div><p>// {review.id}</p><h2>审核作品</h2></div><button className="icon-button" onClick={onClose}><X size={21} weight="bold" /></button></div><div className="review-hero"><div className="review-hero__icon"><FileImage size={54} weight="thin" /></div><div className="review-hero__label"><span>{review.kind}</span><strong>{review.assets} 个作品文件</strong></div>{review.assetLinks?.[0]?.url ? <a className="outline-button" href={review.assetLinks[0].url} target="_blank" rel="noreferrer"><Eye size={17} weight="bold" /> 打开作品文件</a> : <button disabled><Eye size={17} weight="bold" /> 暂无可预览文件</button>}</div><div className="review-title"><span>{review.id}</span><h3>{review.title}</h3><p>{review.author} · {review.department} · {review.submittedAt}</p></div>{review.assetLinks?.length > 0 && <div className="review-assets"><span>作品文件</span>{review.assetLinks.map((asset, index) => <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">{index + 1}. {asset.fileName}</a>)}</div>}<div className="review-facts"><div><span>生成模型</span><strong>{review.model}</strong></div><div><span>资源类型</span><strong>{review.kind}</strong></div><div><span>安全检测</span><strong className={review.machineStatus.includes("复核") ? "warning-text" : "safe-text"}>{review.machineStatus}</strong></div></div><div className="prompt-box"><span>// PROMPT 摘要</span><p>{review.prompt}</p></div><label className="review-note"><span>审核备注</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="通过时可选；驳回时建议填写修改原因……" /></label><div className="drawer__actions drawer__actions--split"><button className="reject-button" onClick={() => onDecision(review.id, "rejected", note)}>驳回并退回修改</button><button className="primary-button" onClick={() => onDecision(review.id, "approved", note)}><Check size={18} weight="bold" /> 通过并发布</button></div></aside></div>;
}

export function AdminDashboard({ actor, onBack, onNavigate = () => {}, initialSection = "overview" }) {
  const operatorOnly = actor?.role === "operator";
  const canManageQuota = actor?.role === "admin" || actor?.roles?.includes("admin");
  const availableNavItems = operatorOnly ? navItems.filter((item) => item.id === "reviews") : navItems;
  const [section, setSection] = useState(operatorOnly ? "reviews" : initialSection); const [sidebarOpen, setSidebarOpen] = useState(false); const [users, setUsers] = useState([]); const [reviews, setReviews] = useState([]); const [dashboard, setDashboard] = useState(null); const [quotaUser, setQuotaUser] = useState(null); const [selectedUserIds, setSelectedUserIds] = useState(new Set()); const [bulkQuotaOpen, setBulkQuotaOpen] = useState(false); const [selectedReview, setSelectedReview] = useState(null); const [adminLoading, setAdminLoading] = useState(true); const [adminLoadError, setAdminLoadError] = useState("");
  const { notify: showToast, confirmAction } = useFeedback();
  useEffect(() => setSection(operatorOnly ? "reviews" : initialSection), [initialSection, operatorOnly]);
  const changeSection = (nextSection) => { setSection(nextSection); onNavigate(nextSection); };
  const loadAdminData = useCallback(async () => {
    setAdminLoading(true); setAdminLoadError("");
    const [userResult, reviewResult, dashboardResult] = await Promise.allSettled([operatorOnly ? Promise.resolve(null) : getAdminUsers(), getAdminReviews(), operatorOnly ? Promise.resolve(null) : getAdminDashboard()]);
    const failures = [];
    if (userResult.status === "fulfilled" && userResult.value) setUsers(userResult.value.items ?? []); else if (!operatorOnly) failures.push("用户数据");
    if (reviewResult.status === "fulfilled") setReviews(reviewResult.value.items ?? []); else failures.push("审核数据");
    if (dashboardResult.status === "fulfilled" && dashboardResult.value) setDashboard(dashboardResult.value); else if (!operatorOnly) failures.push("统计数据");
    if (failures.length) { const message = `${failures.join("、")}加载失败`; setAdminLoadError(message); showToast(message, "error"); }
    setAdminLoading(false);
  }, [operatorOnly, showToast]);
  useEffect(() => { void loadAdminData(); }, [loadAdminData]);
  const saveQuota = async (id, values) => { try { const updated = await updateUserQuota(id, values); setUsers((current) => current.map((user) => user.id === id ? updated : user)); setQuotaUser(null); showToast("API 额度策略已更新"); } catch (error) { showToast(error.message); } };
  const saveBulkQuota = async (values) => {
    const userIds = [...selectedUserIds];
    if (!userIds.length) return;
    const confirmed = await confirmAction({ title: "批量应用额度策略", message: `确认将新的日、月及并发额度应用到 ${userIds.length} 个账户吗？`, confirmLabel: "确认应用" });
    if (!confirmed) return;
    try {
      const result = await updateUsersQuota(userIds, values);
      const updated = new Map((result.items ?? []).map((user) => [user.id, user]));
      setUsers((current) => current.map((user) => updated.get(user.id) ?? user));
      setSelectedUserIds(new Set()); setBulkQuotaOpen(false); showToast(`已更新 ${updated.size} 个账户的额度策略`);
    } catch (error) { showToast(error.message); }
  };
  const toggleUserStatus = async (target) => { const status = target.status === "suspended" ? "active" : "suspended"; const confirmed = await confirmAction({ title: status === "active" ? "重新启用账户" : "停用用户账户", message: status === "active" ? `确认恢复“${target.name}”的登录与创作权限吗？` : `确认停用“${target.name}”吗？该用户将无法继续登录或创建任务。`, confirmLabel: status === "active" ? "确认启用" : "确认停用", danger: status !== "active" }); if (!confirmed) return; try { const updated = await updateUserStatus(target.id, status); setUsers((current) => current.map((user) => user.id === target.id ? updated : user)); showToast(status === "active" ? "用户账户已重新启用" : "用户账户已停用"); } catch (error) { showToast(error.message); } };
  const decideReview = async (id, status, note) => { if (status === "rejected" && !note.trim()) { showToast("驳回作品前请填写修改原因", "error"); return; } const confirmed = await confirmAction({ title: status === "approved" ? "通过并发布作品" : "驳回作品", message: status === "approved" ? "作品通过后会立即出现在案例社区，确认继续吗？" : "作品将退回作者修改，审核原因会同步给作者。", confirmLabel: status === "approved" ? "确认发布" : "确认驳回", danger: status === "rejected" }); if (!confirmed) return; try { const updated = await reviewSubmission(id, { status, note }); setReviews((current) => current.map((item) => item.id === id ? updated : item)); setSelectedReview(null); showToast(status === "approved" ? "作品已通过并发布到资源库" : "作品已驳回并退回作者修改"); } catch (error) { showToast(error.message); } };
  return <div className="admin-shell"><Sidebar section={section} onSectionChange={changeSection} open={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={reviews.filter((item) => item.status === "pending").length} items={availableNavItems} actor={actor} onBack={onBack} dashboard={dashboard} /><div className="admin-main"><Topbar section={section} onOpenMenu={() => setSidebarOpen(true)} actor={actor} onBack={onBack} users={users} reviews={reviews} dashboard={dashboard} onNavigate={changeSection} /><main><div key={section} className="route-transition">{(adminLoading || adminLoadError) && <div className={`admin-load-state ${adminLoadError ? "is-error" : ""}`} aria-busy={adminLoading}><span>{adminLoading ? "正在同步管理数据…" : adminLoadError}</span>{!adminLoading && <button onClick={loadAdminData}>重新加载</button>}</div>}{section === "overview" && <Overview users={users} reviews={reviews} dashboard={dashboard} onNavigate={changeSection} onEditQuota={setQuotaUser} />}{section === "users" && <UsersPage users={users} onEditQuota={setQuotaUser} onToggleStatus={toggleUserStatus} selectedIds={selectedUserIds} onSelectionChange={setSelectedUserIds} onOpenBulkQuota={() => setBulkQuotaOpen(true)} canManageQuota={canManageQuota} />}{section === "courses" && <AdminCourses showToast={showToast} />}{section === "workflows" && <WorkflowAdmin showToast={showToast} />}{section === "reviews" && <ReviewsPage reviews={reviews} selectedReview={selectedReview} onSelectReview={setSelectedReview} />}{section === "bridges" && <BridgeDevices showToast={showToast} confirmAction={confirmAction} />}</div></main></div><QuotaDrawer user={quotaUser} onClose={() => setQuotaUser(null)} onSave={saveQuota} />{bulkQuotaOpen && <BulkQuotaDrawer count={selectedUserIds.size} onClose={() => setBulkQuotaOpen(false)} onSave={saveBulkQuota} />}<ReviewDrawer review={selectedReview} onClose={() => setSelectedReview(null)} onDecision={decideReview} /></div>;
}
