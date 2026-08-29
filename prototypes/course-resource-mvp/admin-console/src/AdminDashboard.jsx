import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bell, CaretDown, ChartBar, Check, Clock, Coins, Eye,
  BookOpenText, FileArrowUp, FileImage, Gauge, List, MagnifyingGlass, Robot, ShieldCheck,
  SlidersHorizontal, Sparkle, Users, Warning, X,
} from "@phosphor-icons/react";
import {
  createCourse,
  getAdminCourses,
  getAdminReviews,
  getAdminResourceFiles,
  getAdminSubjects,
  getContentReviews,
  getAdminUsers,
  registerResourceFile,
  reviewCourse,
  reviewSubmission,
  submitCourseReview,
  updateUserQuota,
  updateUserStatus,
} from "./services/adminApi.js";

// DEMO FALLBACK: keeps the admin UI independently previewable when the API is offline.
// Once GET /api/admin/users and /api/admin/reviews respond, server data replaces it.
const initialUsers = [
  { id: "U-1042", name: "林知夏", initials: "林", department: "信息艺术设计", identity: "学生", status: "active", plan: "教学基础", dailyLimit: 30, monthlyLimit: 600, monthlyUsed: 428, concurrentLimit: 2, works: 12, lastActive: "2 分钟前" },
  { id: "U-1038", name: "陈明远", initials: "陈", department: "视觉传达", identity: "学生", status: "active", plan: "教学进阶", dailyLimit: 60, monthlyLimit: 1200, monthlyUsed: 1018, concurrentLimit: 3, works: 24, lastActive: "18 分钟前" },
  { id: "U-1029", name: "周可", initials: "周", department: "染织服装", identity: "学生", status: "active", plan: "教学基础", dailyLimit: 30, monthlyLimit: 600, monthlyUsed: 186, concurrentLimit: 2, works: 12, lastActive: "1 小时前" },
  { id: "U-1016", name: "王雅琳", initials: "王", department: "视觉传达", identity: "教师", status: "active", plan: "教师账户", dailyLimit: 120, monthlyLimit: 3000, monthlyUsed: 1740, concurrentLimit: 5, works: 38, lastActive: "今天 09:40" },
  { id: "U-1008", name: "赵子涵", initials: "赵", department: "工艺美术", identity: "学生", status: "limited", plan: "教学基础", dailyLimit: 10, monthlyLimit: 300, monthlyUsed: 300, concurrentLimit: 1, works: 9, lastActive: "昨天 21:18" },
  { id: "U-0997", name: "刘思远", initials: "刘", department: "工业设计", identity: "学生", status: "suspended", plan: "已暂停", dailyLimit: 0, monthlyLimit: 0, monthlyUsed: 0, concurrentLimit: 0, works: 4, lastActive: "8 月 24 日" },
];

const initialReviews = [
  { id: "CASE-0281", title: "生成式纹样：夏夜标本", author: "林知夏", department: "信息艺术设计", kind: "工作流案例", model: "Flux.1-dev", submittedAt: "今天 13:26", machineStatus: "机器预审通过", prompt: "以植物标本册为灵感，生成青绿色夜光纹样，保留手工丝网印刷的颗粒质感。", assets: 6, status: "pending" },
  { id: "CASE-0279", title: "宋韵茶饮包装视觉提案", author: "周可", department: "染织服装", kind: "案例投稿", model: "Ideogram 3", submittedAt: "今天 11:02", machineStatus: "机器预审通过", prompt: "将宋代山水的留白与现代茶饮包装结合，输出三组正视图与材质说明。", assets: 4, status: "pending" },
  { id: "CASE-0274", title: "校园导视图标系统", author: "陈明远", department: "视觉传达", kind: "案例投稿", model: "Midjourney V6.1", submittedAt: "昨天 18:40", machineStatus: "需要人工复核", prompt: "面向新生的校园导视图标，统一线宽与圆角，覆盖教学楼、食堂、运动场等场景。", assets: 12, status: "pending" },
  { id: "CASE-0268", title: "工业机械品牌动态海报", author: "刘思远", department: "工业设计", kind: "课程作业", model: "GPT-4o + Flux", submittedAt: "8 月 25 日", machineStatus: "机器预审通过", prompt: "以精密制造和机械结构为核心，生成一组高对比黑白品牌海报。", assets: 3, status: "pending" },
];

const navItems = [
  { id: "overview", label: "总览", icon: ChartBar },
  { id: "users", label: "用户管理", icon: Users },
  { id: "courses", label: "课程资源", icon: BookOpenText },
  { id: "reviews", label: "作品审核", icon: ShieldCheck },
];

const statusLabel = { active: "正常", limited: "额度用尽", suspended: "已停用" };

function AppLogo() {
  return <div className="brand"><div className="brand__mark">A</div><div><strong>AIGC 管理台</strong><span>清华美院 AI 实验场</span></div></div>;
}

function Sidebar({ section, onSectionChange, open, onClose, pendingCount }) {
  return <>
    {open && <button className="scrim" aria-label="关闭菜单" onClick={onClose} />}
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar__top"><AppLogo /><button className="icon-button sidebar__close" onClick={onClose} aria-label="关闭导航"><X size={20} weight="bold" /></button></div>
      <div className="sidebar__eyebrow">// ADMIN CONSOLE</div>
      <nav className="side-nav" aria-label="管理员导航">
        {navItems.map((item, index) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "is-active" : ""} onClick={() => { onSectionChange(item.id); onClose(); }}><span className="side-nav__index">0{index + 1}</span><Icon size={20} weight={section === item.id ? "fill" : "regular"} /><span>{item.label}</span>{item.id === "reviews" && <b>{pendingCount}</b>}</button>; })}
      </nav>
      <div className="sidebar__notice"><div className="sidebar__notice-label"><Sparkle size={15} weight="fill" /> 系统状态</div><strong>所有模型服务正常</strong><div className="status-line"><span /> 8 个模型在线</div></div>
      <div className="sidebar__account"><div className="avatar avatar--light">管</div><div><strong>平台管理员</strong><span>admin@aigc.edu.cn</span></div><CaretDown size={16} weight="bold" /></div>
    </aside>
  </>;
}

function Topbar({ section, onOpenMenu }) {
  const titles = { overview: ["管理总览", "查看平台状态、额度消耗与待办事项"], users: ["用户管理", "管理账户状态与每个用户的 API 使用额度"], courses: ["课程资源", "创建课程与学习项目、管理资源文件并提交发布审核"], reviews: ["作品审核", "审核用户提交到资源库的作品与案例"] };
  return <header className="topbar">
    <button className="icon-button menu-button" onClick={onOpenMenu} aria-label="打开导航"><List size={22} weight="bold" /></button>
    <div className="topbar__title"><p>// CONTROL CENTER</p><div><strong>{titles[section][0]}</strong><span>{titles[section][1]}</span></div></div>
    <label className="global-search"><MagnifyingGlass size={18} weight="bold" /><input aria-label="全局搜索" placeholder="搜索用户、作品或任务……" /><kbd>⌘ K</kbd></label>
    <button className="topbar__alert" aria-label="通知"><Bell size={21} weight="bold" /><span>3</span></button>
    <div className="topbar__admin"><div className="avatar">管</div><div><strong>管理员</strong><span>超级管理员</span></div></div>
  </header>;
}

function MetricCard({ label, value, change, accent, icon: Icon }) {
  return <article className={`metric-card ${accent ? "metric-card--accent" : ""}`}><div className="metric-card__header"><span>{label}</span><Icon size={22} weight="bold" /></div><strong>{value}</strong><p>{change}</p><div className="metric-card__corner" /></article>;
}

function UsageBars() {
  const bars = [41, 57, 52, 76, 62, 89, 68, 93, 72, 65, 78, 58];
  return <div className="usage-chart" aria-label="近十二小时 API 调用量柱状图">{bars.map((value, index) => <i key={index} style={{ height: `${value}%` }}><span>{value}</span></i>)}</div>;
}

function Overview({ users, reviews, onNavigate, onEditQuota }) {
  const totalUsed = users.reduce((sum, user) => sum + user.monthlyUsed, 0);
  return <div className="page-content">
    <section className="metrics-grid">
      <MetricCard label="平台用户" value="2,486" change="本月新增 128 人 ↗" icon={Users} />
      <MetricCard label="本月 API 调用" value="48.2K" change="较上月 +18.6%" icon={Gauge} accent />
      <MetricCard label="待审核作品" value={String(reviews.filter((item) => item.status === "pending").length).padStart(2, "0")} change="最早等待 3 小时" icon={ShieldCheck} />
      <MetricCard label="已消耗额度" value={totalUsed.toLocaleString()} change="演示账户合计" icon={Coins} />
    </section>
    <section className="overview-grid">
      <article className="panel usage-panel"><div className="panel__heading"><div><p>// API USAGE</p><h2>调用趋势</h2></div><button className="outline-button">近 12 小时 <CaretDown size={14} weight="bold" /></button></div><div className="usage-summary"><strong>6,842</strong><span>次调用 · 今日</span><em>+12.8%</em></div><UsageBars /><div className="chart-axis"><span>08:00</span><span>12:00</span><span>16:00</span><span>现在</span></div></article>
      <article className="panel model-panel"><div className="panel__heading"><div><p>// MODEL STATUS</p><h2>模型服务</h2></div><span className="live-chip"><i /> 实时</span></div>{[["GPT-4o", "文本 / 视觉", "24ms", 98], ["Flux.1-dev", "图像生成", "1.8s", 84], ["Midjourney V6.1", "图像生成", "2.4s", 72], ["Claude 4", "文本 / 代码", "31ms", 94]].map(([name, type, latency, load]) => <div className="model-row" key={name}><div className="model-row__icon"><Robot size={18} weight="fill" /></div><div className="model-row__name"><strong>{name}</strong><span>{type}</span></div><div className="mini-track"><i style={{ width: `${load}%` }} /></div><span>{latency}</span></div>)}</article>
      <article className="panel review-panel"><div className="panel__heading"><div><p>// REVIEW QUEUE</p><h2>最新待审核</h2></div><button className="text-button" onClick={() => onNavigate("reviews")}>全部审核 <ArrowRight size={16} weight="bold" /></button></div><div className="review-list">{reviews.filter((item) => item.status === "pending").slice(0, 3).map((item, index) => <button key={item.id} onClick={() => onNavigate("reviews")}><span className="queue-index">0{index + 1}</span><div><strong>{item.title}</strong><span>{item.author} · {item.department}</span></div><em>{item.submittedAt}</em><ArrowRight size={17} weight="bold" /></button>)}</div></article>
      <article className="panel quota-alerts"><div className="panel__heading"><div><p>// QUOTA ALERTS</p><h2>额度预警</h2></div><button className="text-button" onClick={() => onNavigate("users")}>管理用户 <ArrowRight size={16} weight="bold" /></button></div>{users.filter((user) => user.monthlyLimit > 0 && user.monthlyUsed / user.monthlyLimit >= 0.7).slice(0, 3).map((user) => { const ratio = Math.round((user.monthlyUsed / user.monthlyLimit) * 100); return <div className="quota-alert" key={user.id}><div className="avatar avatar--outline">{user.initials}</div><div className="quota-alert__info"><strong>{user.name}</strong><span>{user.monthlyUsed} / {user.monthlyLimit} 额度</span></div><div className="quota-alert__meter"><div><i style={{ width: `${ratio}%` }} /></div><span>{ratio}%</span></div><button className="small-button" onClick={() => onEditQuota(user)}>调整</button></div>; })}</article>
    </section>
  </div>;
}

function UsersPage({ users, onEditQuota, onToggleStatus }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filteredUsers = useMemo(() => users.filter((user) => `${user.name}${user.id}${user.department}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || user.status === status)), [query, status, users]);
  return <div className="page-content">
    <section className="page-intro"><div><p>// USER DIRECTORY</p><h1>用户与 API 额度</h1><span>共 {users.length} 个演示账户 · 支持按用户限制日额度、月额度和并发任务数</span></div><button className="primary-button"><Users size={18} weight="bold" /> 批量设置额度</button></section>
    <section className="table-panel">
      <div className="table-tools"><label><MagnifyingGlass size={18} weight="bold" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名、编号或院系" /></label><div className="segmented" aria-label="用户状态筛选">{[["all", "全部"], ["active", "正常"], ["limited", "额度用尽"], ["suspended", "已停用"]].map(([value, label]) => <button key={value} className={status === value ? "is-active" : ""} onClick={() => setStatus(value)}>{label}</button>)}</div><button className="outline-button"><SlidersHorizontal size={17} weight="bold" /> 更多筛选</button></div>
      <div className="user-table-wrap"><table className="user-table"><thead><tr><th>用户</th><th>身份</th><th>API 额度</th><th>本月使用</th><th>状态</th><th>最近活跃</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{filteredUsers.map((user) => { const ratio = user.monthlyLimit ? Math.min(100, Math.round(user.monthlyUsed / user.monthlyLimit * 100)) : 0; return <tr key={user.id}><td><div className="user-cell"><div className="avatar avatar--outline">{user.initials}</div><div><strong>{user.name}</strong><span>{user.id} · {user.department}</span></div></div></td><td><span className="identity-chip">{user.identity}</span></td><td><strong>{user.dailyLimit} / 日</strong><span className="sub-value">{user.monthlyLimit} / 月 · 并发 {user.concurrentLimit}</span></td><td><div className="table-meter"><div><i style={{ width: `${ratio}%` }} /></div><span>{ratio}%</span></div></td><td><span className={`status-chip status-chip--${user.status}`}><i />{statusLabel[user.status]}</span></td><td>{user.lastActive}</td><td><div className="row-actions"><button onClick={() => onEditQuota(user)}>额度</button><button onClick={() => onToggleStatus(user)}>{user.status === "suspended" ? "启用" : "停用"}</button></div></td></tr>; })}</tbody></table></div>
      {filteredUsers.length === 0 && <div className="empty-state"><Users size={34} /><strong>没有匹配的用户</strong><span>尝试调整搜索关键词或筛选条件。</span></div>}
      <div className="table-footer"><span>显示 {filteredUsers.length} / {users.length} 个账户</span><div><button disabled>上一页</button><button className="is-active">1</button><button>下一页</button></div></div>
    </section>
  </div>;
}

function ReviewsPage({ reviews, selectedReview, onSelectReview }) {
  const [filter, setFilter] = useState("pending");
  const visibleReviews = reviews.filter((item) => filter === "all" || item.status === filter);
  return <div className="page-content">
    <section className="page-intro"><div><p>// CONTENT MODERATION</p><h1>作品上传审核</h1><span>核对作品信息、生成来源与内容安全结果后再发布到资源库</span></div><div className="review-summary"><Clock size={19} weight="bold" /><div><strong>{reviews.filter((item) => item.status === "pending").length} 项待处理</strong><span>平均等待 1.4 小时</span></div></div></section>
    <section className="review-workspace"><div className="review-queue"><div className="review-tabs">{[["pending", "待审核"], ["approved", "已通过"], ["rejected", "已驳回"], ["all", "全部"]].map(([value, label]) => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="queue-search"><MagnifyingGlass size={17} weight="bold" /><input placeholder="搜索投稿编号或作者" /></label><div className="queue-items">{visibleReviews.map((item) => <button key={item.id} className={selectedReview?.id === item.id ? "is-active" : ""} onClick={() => onSelectReview(item)}><div className="file-tile"><FileImage size={23} weight="bold" /></div><div className="queue-item__main"><span>{item.id} · {item.kind}</span><strong>{item.title}</strong><small>{item.author} / {item.department}</small></div><div className="queue-item__meta"><span>{item.submittedAt}</span><em className={item.machineStatus.includes("复核") ? "is-warning" : ""}>{item.machineStatus}</em></div></button>)}{visibleReviews.length === 0 && <div className="empty-state"><Check size={32} /><strong>这个队列已处理完成</strong><span>暂时没有新的审核项目。</span></div>}</div></div><div className="review-placeholder"><ShieldCheck size={40} weight="thin" /><strong>选择一项作品开始审核</strong><span>右侧将显示作品信息、生成参数和审核操作。</span></div></section>
  </div>;
}

const publishStatusLabel = { draft: "草稿", pending_review: "待审核", published: "已发布", rejected: "已驳回", archived: "已归档" };

function CoursesPage({ courses, subjects, files, contentReviews, onCreate, onSubmitReview, onReview, onRegisterFile }) {
  const [tab, setTab] = useState("contents");
  const [form, setForm] = useState({ type: "course", title: "", summary: "", subjectId: subjects[0]?.id ?? "SUB-01", difficulty: "beginner", estimatedMinutes: 120, cover: "AI", stepTitle: "课程导览" });
  const [fileForm, setFileForm] = useState({ name: "", mimeType: "application/pdf", byteSize: 0 });
  const create = (event) => { event.preventDefault(); onCreate({ type: form.type, title: form.title, summary: form.summary, subjectIds: [form.subjectId], tagIds: [], difficulty: form.difficulty, estimatedMinutes: Number(form.estimatedMinutes), featured: false, cover: form.cover, steps: [{ title: form.stepTitle, summary: "教师可继续补充图文、附件或绑定工作流。", sortOrder: 1, kind: "lesson", estimatedMinutes: 20, resourceFileIds: [] }] }).then(() => setForm((current) => ({ ...current, title: "", summary: "" }))); };
  const registerFile = (event) => { event.preventDefault(); onRegisterFile({ ...fileForm, byteSize: Number(fileForm.byteSize) }).then(() => setFileForm({ name: "", mimeType: "application/pdf", byteSize: 0 })); };
  return <div className="page-content"><section className="page-intro"><div><p>// LEARNING CONTENT CMS</p><h1>课程与学习项目</h1><span>统一管理学科、课程版本、课时资源和发布审核流程</span></div><div className="segmented">{[["contents","内容"],["reviews","发布审核"],["files","资源文件"]].map(([value,label]) => <button key={value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{label}</button>)}</div></section>
    {tab === "contents" && <div className="course-admin-grid"><section className="table-panel"><div className="panel__heading"><div><p>// CONTENT LIST</p><h2>课程内容</h2></div><span>{courses.length} 项</span></div><div className="course-admin-list">{courses.map((course) => <article key={course.id}><div className="course-admin-cover">{course.cover}</div><div><span>{course.type === "course" ? "系统课程" : "学习项目"} · v{course.version}</span><strong>{course.title}</strong><small>{course.steps.length} 个步骤 · {course.enrollmentCount.toLocaleString()} 人学习</small></div><em className={`publish-chip publish-chip--${course.status}`}>{publishStatusLabel[course.status]}</em>{["draft","rejected"].includes(course.status) && <button className="small-button" onClick={() => onSubmitReview(course.id)}>提交审核</button>}</article>)}</div></section><form className="course-create-panel" onSubmit={create}><div><p>// CREATE CONTENT</p><h2>新建课程内容</h2></div><label>内容类型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="course">系统课程</option><option value="project">学习项目</option></select></label><label>标题<input required minLength={2} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>简介<textarea required minLength={4} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label><div className="form-grid"><label>学科<select value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>难度<select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}><option value="beginner">入门</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select></label></div><label>首个步骤<input required value={form.stepTitle} onChange={(event) => setForm({ ...form, stepTitle: event.target.value })} /></label><button className="primary-button"><BookOpenText size={18} />保存为草稿</button></form></div>}
    {tab === "reviews" && <section className="table-panel"><div className="panel__heading"><div><p>// PUBLISH REVIEW</p><h2>课程发布审核</h2></div></div><div className="content-review-list">{contentReviews.map((review) => <article key={review.id}><div><span>{review.id} · v{review.snapshotVersion}</span><strong>{review.contentTitle}</strong><small>{review.submitterName} · {review.contentType === "course" ? "系统课程" : "学习项目"}</small></div><em>{review.status === "pending" ? "待审核" : review.status === "approved" ? "已通过" : "已驳回"}</em>{review.status === "pending" && <div><button className="reject-button" onClick={() => onReview(review.id,"rejected","请补充课时资料后重新提交")}>驳回</button><button className="primary-button" onClick={() => onReview(review.id,"approved","")}><Check size={17} />通过发布</button></div>}</article>)}{contentReviews.length === 0 && <div className="empty-state"><ShieldCheck size={34} /><strong>暂无课程审核任务</strong></div>}</div></section>}
    {tab === "files" && <div className="course-admin-grid"><section className="table-panel"><div className="panel__heading"><div><p>// FILE LIBRARY</p><h2>教学资源文件</h2></div></div><div className="file-admin-list">{files.map((file) => <article key={file.id}><FileImage size={22} /><div><strong>{file.name}</strong><span>{file.mimeType} · {(file.byteSize / 1024 / 1024).toFixed(1)} MB</span></div><em>{file.safetyStatus === "safe" ? "安全" : file.safetyStatus === "blocked" ? "已拦截" : "待检测"}</em></article>)}</div></section><form className="course-create-panel" onSubmit={registerFile}><div><p>// REGISTER FILE</p><h2>登记资源文件</h2></div><label>文件名<input required value={fileForm.name} onChange={(event) => setFileForm({ ...fileForm, name: event.target.value })} placeholder="教学课件.pdf" /></label><label>文件类型<input required value={fileForm.mimeType} onChange={(event) => setFileForm({ ...fileForm, mimeType: event.target.value })} /></label><label>文件大小（字节）<input type="number" min="0" value={fileForm.byteSize} onChange={(event) => setFileForm({ ...fileForm, byteSize: event.target.value })} /></label><button className="primary-button"><FileArrowUp size={18} />创建上传任务</button><p className="form-hint">当前接口返回演示上传地址；接入学校对象存储后替换为预签名 PUT URL。</p></form></div>}
  </div>;
}

function QuotaDrawer({ user, onClose, onSave }) {
  const [daily, setDaily] = useState(user?.dailyLimit ?? 30); const [monthly, setMonthly] = useState(user?.monthlyLimit ?? 600); const [concurrent, setConcurrent] = useState(user?.concurrentLimit ?? 2);
  if (!user) return null;
  const usedPercent = monthly ? Math.min(100, Math.round(user.monthlyUsed / monthly * 100)) : 0;
  return <div className="drawer-layer" role="presentation"><button className="drawer-scrim" onClick={onClose} aria-label="关闭额度设置" /><aside className="drawer" aria-label={`${user.name}的 API 额度设置`}><div className="drawer__header"><div><p>// QUOTA POLICY</p><h2>调整 API 额度</h2></div><button className="icon-button" onClick={onClose}><X size={21} weight="bold" /></button></div><div className="drawer__user"><div className="avatar avatar--outline">{user.initials}</div><div><strong>{user.name}</strong><span>{user.id} · {user.department} · {user.identity}</span></div></div><div className="current-usage"><div><span>本月当前使用</span><strong>{user.monthlyUsed} <small>/ {monthly}</small></strong></div><em>{usedPercent}%</em><div className="wide-meter"><i style={{ width: `${usedPercent}%` }} /></div></div><form onSubmit={(event) => { event.preventDefault(); onSave(user.id, { dailyLimit: Number(daily), monthlyLimit: Number(monthly), concurrentLimit: Number(concurrent) }); }}><div className="field-group"><label htmlFor="daily">每日额度上限</label><p>用户每天最多可消耗的积分额度。</p><div className="number-field"><input id="daily" type="number" min="0" value={daily} onChange={(e) => setDaily(e.target.value)} /><span>额度 / 日</span></div></div><div className="field-group"><label htmlFor="monthly">每月额度上限</label><p>每月 1 日自动重置，不影响账户中的历史记录。</p><div className="number-field"><input id="monthly" type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)} /><span>额度 / 月</span></div></div><div className="field-group"><label htmlFor="concurrent">并发任务数</label><p>限制用户同时运行的 AI 生成任务数量。</p><div className="number-field"><input id="concurrent" type="number" min="0" max="10" value={concurrent} onChange={(e) => setConcurrent(e.target.value)} /><span>个任务</span></div></div><div className="policy-note"><Warning size={20} weight="fill" /><p><strong>设置为 0 将立即停止新任务</strong><span>已运行的任务不受影响，调整记录会写入管理员审计日志。</span></p></div><div className="drawer__actions"><button type="button" className="outline-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存额度策略 <ArrowRight size={17} weight="bold" /></button></div></form></aside></div>;
}

function ReviewDrawer({ review, onClose, onDecision }) {
  const [note, setNote] = useState(""); if (!review) return null;
  return <div className="drawer-layer" role="presentation"><button className="drawer-scrim" onClick={onClose} aria-label="关闭审核详情" /><aside className="drawer drawer--review" aria-label="作品审核详情"><div className="drawer__header"><div><p>// {review.id}</p><h2>审核作品</h2></div><button className="icon-button" onClick={onClose}><X size={21} weight="bold" /></button></div><div className="review-hero"><div className="review-hero__icon"><FileImage size={54} weight="thin" /></div><div className="review-hero__label"><span>{review.kind}</span><strong>{review.assets} 个作品文件</strong></div><button><Eye size={17} weight="bold" /> 打开作品预览</button></div><div className="review-title"><span>{review.id}</span><h3>{review.title}</h3><p>{review.author} · {review.department} · {review.submittedAt}</p></div><div className="review-facts"><div><span>生成模型</span><strong>{review.model}</strong></div><div><span>资源类型</span><strong>{review.kind}</strong></div><div><span>安全检测</span><strong className={review.machineStatus.includes("复核") ? "warning-text" : "safe-text"}>{review.machineStatus}</strong></div></div><div className="prompt-box"><span>// PROMPT 摘要</span><p>{review.prompt}</p></div><label className="review-note"><span>审核备注</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="通过时可选；驳回时建议填写修改原因……" /></label><div className="drawer__actions drawer__actions--split"><button className="reject-button" onClick={() => onDecision(review.id, "rejected", note)}>驳回并退回修改</button><button className="primary-button" onClick={() => onDecision(review.id, "approved", note)}><Check size={18} weight="bold" /> 通过并发布</button></div></aside></div>;
}

function Toast({ message }) { return message ? <div className="toast" role="status"><Check size={18} weight="bold" /><span>{message}</span></div> : null; }

export function AdminDashboard() {
  const [section, setSection] = useState("overview"); const [sidebarOpen, setSidebarOpen] = useState(false); const [users, setUsers] = useState(initialUsers); const [reviews, setReviews] = useState(initialReviews); const [courses, setCourses] = useState([]); const [subjects, setSubjects] = useState([]); const [resourceFiles, setResourceFiles] = useState([]); const [contentReviews, setContentReviews] = useState([]); const [quotaUser, setQuotaUser] = useState(null); const [selectedReview, setSelectedReview] = useState(null); const [toast, setToast] = useState("");
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  useEffect(() => { Promise.allSettled([getAdminUsers(), getAdminReviews(), getAdminCourses(), getAdminSubjects(), getAdminResourceFiles(), getContentReviews()]).then(([userResult, reviewResult, courseResult, subjectResult, fileResult, contentReviewResult]) => { if (userResult.status === "fulfilled") setUsers(userResult.value.items); if (reviewResult.status === "fulfilled") setReviews(reviewResult.value.items); if (courseResult.status === "fulfilled") setCourses(courseResult.value.items); if (subjectResult.status === "fulfilled") setSubjects(subjectResult.value.items); if (fileResult.status === "fulfilled") setResourceFiles(fileResult.value.items); if (contentReviewResult.status === "fulfilled") setContentReviews(contentReviewResult.value.items); }); }, []);
  const saveQuota = async (id, values) => { try { const updated = await updateUserQuota(id, values); setUsers((current) => current.map((user) => user.id === id ? updated : user)); setQuotaUser(null); showToast("API 额度策略已更新"); } catch (error) { showToast(error.message); } };
  const toggleUserStatus = async (target) => { const status = target.status === "suspended" ? "active" : "suspended"; try { const updated = await updateUserStatus(target.id, status); setUsers((current) => current.map((user) => user.id === target.id ? updated : user)); showToast(status === "active" ? "用户账户已重新启用" : "用户账户已停用"); } catch (error) { showToast(error.message); } };
  const decideReview = async (id, status, note) => { try { const updated = await reviewSubmission(id, { status, note }); setReviews((current) => current.map((item) => item.id === id ? updated : item)); setSelectedReview(null); showToast(status === "approved" ? "作品已通过并发布到资源库" : "作品已驳回并退回作者修改"); } catch (error) { showToast(error.message); } };
  const addCourse = async (payload) => { try { const created = await createCourse(payload); setCourses((current) => [created, ...current]); showToast("课程草稿已创建"); return created; } catch (error) { showToast(error.message); throw error; } };
  const sendCourseToReview = async (id) => { try { const review = await submitCourseReview(id); setContentReviews((current) => [review, ...current]); setCourses((current) => current.map((course) => course.id === id ? { ...course, status: "pending_review" } : course)); showToast("课程已提交发布审核"); } catch (error) { showToast(error.message); } };
  const decideCourseReview = async (id, status, note) => { try { const result = await reviewCourse(id, { status, note }); setContentReviews((current) => current.map((review) => review.id === id ? result.review : review)); setCourses((current) => current.map((course) => course.id === result.content.id ? result.content : course)); showToast(status === "approved" ? "课程已通过并发布" : "课程已退回修改"); } catch (error) { showToast(error.message); } };
  const addResourceFile = async (payload) => { try { const created = await registerResourceFile(payload); setResourceFiles((current) => [created, ...current]); showToast("资源文件上传任务已创建"); return created; } catch (error) { showToast(error.message); throw error; } };
  return <div className="admin-shell"><Sidebar section={section} onSectionChange={setSection} open={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={reviews.filter((item) => item.status === "pending").length} /><div className="admin-main"><Topbar section={section} onOpenMenu={() => setSidebarOpen(true)} /><main>{section === "overview" && <Overview users={users} reviews={reviews} onNavigate={setSection} onEditQuota={setQuotaUser} />}{section === "users" && <UsersPage users={users} onEditQuota={setQuotaUser} onToggleStatus={toggleUserStatus} />}{section === "courses" && <CoursesPage courses={courses} subjects={subjects} files={resourceFiles} contentReviews={contentReviews} onCreate={addCourse} onSubmitReview={sendCourseToReview} onReview={decideCourseReview} onRegisterFile={addResourceFile} />}{section === "reviews" && <ReviewsPage reviews={reviews} selectedReview={selectedReview} onSelectReview={setSelectedReview} />}</main></div><QuotaDrawer user={quotaUser} onClose={() => setQuotaUser(null)} onSave={saveQuota} /><ReviewDrawer review={selectedReview} onClose={() => setSelectedReview(null)} onDecision={decideReview} /><Toast message={toast} /></div>;
}
