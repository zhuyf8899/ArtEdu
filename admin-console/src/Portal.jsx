import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowRight, BookOpenText, Brain, CirclesThreePlus,
  Compass, GraduationCap, GridFour, ImageSquare, Lightbulb, LockKey,
  MagnifyingGlass, Palette, Plus, RocketLaunch, Sparkle, Stack, UsersThree, X,
} from "@phosphor-icons/react";
import { createAgentRun, createGenerationJob, executeAgentRun, getPortalHome } from "./services/adminApi.js";
import { AiCreationConsole } from "./AiCreationConsole.jsx";
import { useFeedback } from "./FeedbackCenter.jsx";
import { canEnterAdmin } from "./testAccounts.js";

const LearningLibrary = lazy(() => import("./LearningLibrary.jsx").then(({ LearningLibrary: component }) => ({ default: component })));
const WorkflowStudio = lazy(() => import("./WorkflowStudio.jsx").then(({ WorkflowStudio: component }) => ({ default: component })));
const CommunityLibrary = lazy(() => import("./CommunityLibrary.jsx").then(({ CommunityLibrary: component }) => ({ default: component })));
const MyLearning = lazy(() => import("./MyLearning.jsx").then(({ MyLearning: component }) => ({ default: component })));
const SearchResults = lazy(() => import("./SearchResults.jsx").then(({ SearchResults: component }) => ({ default: component })));

const emptyPortalData = {
  courses: [], workflows: [], works: [],
  creation: { enabled: false, models: [], quota: { dailyLimit: null, dailyUsed: 0, monthlyLimit: null, monthlyUsed: 0, concurrentLimit: null, inFlight: 0 } },
};

const navItems = [
  ["home", "首页", GridFour],
  ["courses", "教学资源", GraduationCap],
  ["studio", "设计工作台", Palette],
  ["community", "案例社区", UsersThree],
  ["myLearning", "我的学习", BookOpenText],
];

function RolePill({ account }) {
  return <span className={`role-pill role-pill--${account.accent}`}><i />{account.roleLabel}</span>;
}

function WorkflowGlyph({ entryType }) {
  const Icon = entryType === "workbench" ? CirclesThreePlus : entryType === "external_tool" ? RocketLaunch : Brain;
  return <span className="workflow-glyph"><Icon size={21} weight="bold" /></span>;
}

export function LocalLogin({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isHostedPreview = typeof window !== "undefined" && window.location.hostname.endsWith(".chatgpt.site");

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try { await onLogin(username, password); }
    catch (reason) { setError(reason.message || "登录失败，请稍后再试"); }
    finally { setSubmitting(false); }
  };

  return <main className="test-login">
    <section className="test-login__intro">
      <div className="test-login__brand"><span>A</span><strong>ArtEdu</strong></div>
      <p className="eyebrow">// SECURE LOCAL ACCESS</p>
      <h1>登录后进入<br />学习与创作空间。</h1>
      <p>当前为受控的本地账号入口。学校单点登录接入后，将替换为统一认证入口。</p>
      <div className="test-login__note"><LockKey size={17} weight="bold" /><span>密码不会保存在浏览器；登录会话仅使用 HttpOnly 安全 Cookie。</span></div>
    </section>
    <section className="test-login__accounts">
      <div className="account-panel__heading"><div><p>// SIGN IN</p><h2>账号登录</h2></div></div>
      {isHostedPreview && <p className="login-error" role="status">当前为界面预览，未连接 API 或测试数据库；账号仅可在本地测试环境使用。</p>}
      <form className="local-login-form" onSubmit={submit}>
        <label>账号<input autoComplete="username" required maxLength="120" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" required minLength="1" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button disabled={submitting}>{submitting ? "正在验证…" : "安全登录"} <ArrowRight size={16} weight="bold" /></button>
      </form>
    </section>
  </main>;
}

export function UserPortal({ account, onSwitchAccount, onEnterAdmin, section = "home", searchQuery = "", studioWorkflowId = "", onNavigate = () => {} }) {
  const [data, setData] = useState(emptyPortalData);
  const [isLive, setIsLive] = useState(false);
  const [portalLoading, setPortalLoading] = useState(true);
  const [portalError, setPortalError] = useState("");
  const [coachOpen, setCoachOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { notify } = useFeedback();

  const loadPortalData = useCallback(async () => {
    setPortalLoading(true);
    setPortalError("");
    try {
      const payload = await getPortalHome();
      setData({
        courses: payload.courses ?? [],
        workflows: payload.workflows ?? [],
        works: payload.works ?? [],
        creation: payload.creation ?? emptyPortalData.creation,
      });
      setIsLive(true);
    } catch (error) {
      setData(emptyPortalData);
      setIsLive(false);
      setPortalError(error.message || "首页数据加载失败");
      notify(error.message || "首页数据加载失败，请检查 API 服务", "error");
    } finally {
      setPortalLoading(false);
    }
  }, [notify]);

  useEffect(() => { void loadPortalData(); }, [account.id, loadPortalData]);

  const nextCourse = useMemo(() => data.courses.find((course) => course.progressPercent > 0 && course.progressPercent < 100) ?? data.courses[0], [data.courses]);
  const showToast = notify;
  const startGeneration = async (jobType, prompt, parameters = {}) => {
    try {
      if (!data.creation.enabled) {
        const scenario = { image: "ui_design", pattern: "pattern_generation", webpage: "webpage_generation" }[jobType] ?? "ui_design";
        const run = await createAgentRun({ scenario, prompt, parameters });
        const completed = await executeAgentRun(run.id);
        const lastMessage = [...(completed.messages ?? [])].reverse().find((message) => message.role === "agent");
        showToast("本地演示已完成：创作说明已写入审计记录。", "success");
        return { id: run.id, local: true, content: lastMessage?.content ?? "本地创作说明已生成。" };
      }
      const job = await createGenerationJob({ jobType, prompt, parameters: { source: "integrated-test-site", ...parameters } });
      showToast(`任务已创建：${job.id.slice(0, 8)}…，可在后端任务队列中查看。`);
      return job;
    } catch (error) {
      showToast(isLive ? error.message : "API 服务不可用，暂时无法创建任务。", "error");
      return null;
    }
  };
  const createFromConversation = ({ jobType, prompt, parameters }) => startGeneration(jobType, prompt, parameters);

  const pageTitle = { home: "学习与创作总览", courses: "教学资源库", studio: "设计工作台", community: "案例社区", myLearning: "我的学习", search: "全站搜索" }[section];
  const navigateSection = (nextSection) => onNavigate({ home: "/", courses: "/learning", studio: "/studio", community: "/community", myLearning: "/my-learning" }[nextSection] ?? "/");
  const navigateSearch = (query) => onNavigate(`/search?query=${encodeURIComponent(query)}`);

  return <div className="portal-shell">
    <header className="portal-topbar">
      <button className="portal-brand" onClick={() => navigateSection("home")}><span>A</span><strong>ArtEdu</strong></button>
      <nav className="portal-nav" aria-label="主导航">{navItems.map(([id, label, Icon]) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => navigateSection(id)}><Icon size={17} weight={section === id ? "fill" : "bold"} />{label}</button>)}</nav>
      <GlobalSearchForm value={searchQuery} onSearch={navigateSearch} />
      {canEnterAdmin(account) && <button className="portal-console-shortcut" onClick={onEnterAdmin}>管理后台 <ArrowRight size={15} weight="bold" /></button>}
      <div className="portal-account"><span className={`live-indicator ${isLive ? "is-live" : ""}`}>{isLive ? "已连接 API" : "API 未连接"}</span><div className="account-menu"><button className="account-switch" aria-label="打开账号菜单" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}><span>{account.shortName.slice(0, 1)}</span><div><strong>{account.shortName}</strong><RolePill account={account} /></div></button>{accountMenuOpen && <div className="account-menu__panel"><strong>{account.name}</strong><span>{account.roleLabel}</span>{canEnterAdmin(account) && <button onClick={() => { setAccountMenuOpen(false); onEnterAdmin(); }}>进入管理后台</button>}<button className="account-menu__signout" onClick={onSwitchAccount}>退出登录</button></div>}</div></div>
    </header>

    <main className={`portal-main ${section === "home" ? "portal-main--home" : ""}`}>
      <div key={`${section}:${searchQuery}`} className="route-transition">
      {section !== "home" && section !== "myLearning" && section !== "search" && <section className="portal-heading"><div><p className="eyebrow">// {section.toUpperCase()}</p><h1>{pageTitle}</h1></div>{canEnterAdmin(account) && <button className="console-entry" onClick={onEnterAdmin}>进入管理工作台 <ArrowRight size={17} weight="bold" /></button>}</section>}

      {section === "home" && <>
        <AiCreationConsole account={account} onCreate={createFromConversation} creation={data.creation} onNotice={showToast} />
        {portalLoading && <HomeDataState loading />}
        {!portalLoading && portalError && <HomeDataState error={portalError} onRetry={loadPortalData} />}
        {!portalLoading && !portalError && (nextCourse ? <section className="progress-strip"><div><span>当前学习</span><strong>{nextCourse.title}</strong></div><div className="progress-line"><i style={{ width: `${nextCourse.progressPercent ?? 0}%` }} /></div><b>{nextCourse.progressPercent ?? 0}%</b><button onClick={() => navigateSection("courses")}>打开课程 <ArrowRight size={15} weight="bold" /></button></section> : <HomeDataState title="还没有进行中的课程" text="从教学资源库选择一门课程，开始记录你的学习进度。" action="浏览课程" onRetry={() => navigateSection("courses")} />)}
        <SectionHeading eyebrow="// QUICK START" title="今天想做什么？" action="查看全部工作流" onAction={() => navigateSection("studio")} />
        <section className="quick-grid"><QuickAction icon={Brain} title="问教学教练" text="根据课程与工作流生成下一步学习建议。" onClick={() => setCoachOpen(true)} /><QuickAction icon={ImageSquare} title="生成视觉草稿" text="输入灵感，启动图片或图案生成任务。" accent onClick={() => startGeneration("image", "以传统云纹为灵感，生成一张用于丝网印刷的青绿色视觉草稿。")} /><QuickAction icon={Compass} title="拆解优秀案例" text="从作品倒推同款工作流与创作方法。" onClick={() => navigateSection("community")} /></section>
        <SectionHeading eyebrow="// FEATURED WORKFLOWS" title="精选工作流" />
        {data.workflows.length ? <section className="workflow-grid">{data.workflows.slice(0, 3).map((workflow) => <article className="workflow-card" key={workflow.id}><WorkflowGlyph entryType={workflow.entryType} /><span>{workflow.category}</span><h3>{workflow.name}</h3><p>{workflow.description}</p><button onClick={() => navigateSection("studio")}>开始使用 <ArrowRight size={16} weight="bold" /></button></article>)}</section> : !portalLoading && !portalError && <HomeDataState title="暂无已发布工作流" text="教师发布工作流后，会在这里展示推荐创作路径。" action="进入工作台" onRetry={() => navigateSection("studio")} />}
      </>}

      <Suspense fallback={<section className="portal-empty"><p>正在加载页面…</p></section>}>
        {section === "courses" && <><SectionHeading eyebrow="// RESOURCE LIBRARY" title="课程与学习资源" /><LearningLibrary onNotice={showToast} /></>}

        {section === "studio" && <><SectionHeading eyebrow="// GUIDED CREATION" title="工作流学习与创作" /><WorkflowStudio initialWorkflowId={studioWorkflowId} onNotice={showToast} /></>}

        {section === "community" && <><SectionHeading eyebrow="// COMMUNITY" title="大家正在创作" /><CommunityLibrary onNotice={showToast} onOpenWorkflow={(workflowId) => onNavigate(`/studio?workflow=${encodeURIComponent(workflowId)}`)} /></>}

        {section === "myLearning" && <MyLearning account={account} onNavigate={onNavigate} onNotice={showToast} />}

        {section === "search" && <SearchResults initialQuery={searchQuery} fallbackData={data} onSearch={navigateSearch} onNavigate={onNavigate} />}
      </Suspense>
      </div>
    </main>
    {coachOpen && <TeachingCoach courses={data.courses} workflows={data.workflows} onClose={() => setCoachOpen(false)} onNavigate={(target) => { setCoachOpen(false); onNavigate(target); }} />}
  </div>;
}

function TeachingCoach({ courses, workflows, onClose, onNavigate }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const createAdvice = (event) => {
    event.preventDefault();
    const keyword = question.trim().toLowerCase();
    const course = courses.find((item) => `${item.title}${item.summary}${item.category}`.toLowerCase().includes(keyword)) ?? courses[0];
    const workflow = workflows.find((item) => `${item.name}${item.description}${item.category}`.toLowerCase().includes(keyword)) ?? workflows[0];
    const focus = /图案|纹样|pattern/.test(keyword) ? "先收集 3 个纹样参考，提炼重复单元、主色和留白规则。" : /ui|网页|界面|web/.test(keyword) ? "先写清页面目标、核心用户操作和信息层级，再进入视觉细化。" : "先把创作目标拆成“主题、素材、方法、输出”四项，再逐项验证。";
    setAnswer({ focus, course, workflow });
  };
  return <div className="coach-layer" role="presentation"><button className="coach-scrim" aria-label="关闭教学教练" onClick={onClose} /><section className="coach-dialog" role="dialog" aria-modal="true" aria-labelledby="coach-title"><header><div><p>// LEARNING COACH</p><h2 id="coach-title">教学教练</h2></div><button onClick={onClose} aria-label="关闭教学教练"><X size={20} weight="bold" /></button></header><p className="coach-intro">基于当前已发布课程与工作流，为你整理可执行的下一步。它不调用外部模型，也不会编造课程内容。</p><form onSubmit={createAdvice}><label>你现在想解决什么？<textarea required maxLength="300" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：我想用传统纹样做一个移动端首页，但不知道先做什么。" /></label><button>生成学习建议 <ArrowRight size={16} weight="bold" /></button></form>{answer && <section className="coach-answer"><span><Lightbulb size={18} weight="fill" /> 建议的起点</span><p>{answer.focus}</p>{answer.course && <button onClick={() => onNavigate("/learning")}><small>推荐课程</small><strong>{answer.course.title}</strong><ArrowRight size={16} weight="bold" /></button>}{answer.workflow && <button onClick={() => onNavigate("/studio")}><small>推荐工作流</small><strong>{answer.workflow.name}</strong><ArrowRight size={16} weight="bold" /></button>}{!answer.course && !answer.workflow && <em>当前尚无可推荐内容；请先由教师发布课程或工作流。</em>}</section>}</section></div>;
}

function HomeDataState({ loading = false, error = "", title, text, action, onRetry }) {
  return <section className={`home-data-state ${error ? "home-data-state--error" : ""}`} aria-busy={loading}>
    <ArrowClockwise size={21} weight="bold" className={loading ? "spin" : ""} />
    <div><strong>{loading ? "正在同步平台内容" : title || "平台内容暂时无法加载"}</strong><span>{loading ? "课程、工作流和案例即将就绪。" : text || error}</span></div>
    {!loading && onRetry && <button onClick={onRetry}>{action || "重新加载"} <ArrowRight size={14} weight="bold" /></button>}
  </section>;
}

function GlobalSearchForm({ value, onSearch }) {
  const [query, setQuery] = useState(value);
  useEffect(() => setQuery(value), [value]);
  const submit = (event) => {
    event.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };
  return <form className="portal-search" onSubmit={submit}><MagnifyingGlass size={16} weight="bold" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索教学资源、工作流和案例" placeholder="搜索课程、工作流、案例…" /><button aria-label="提交搜索" disabled={!query.trim()}><ArrowRight size={15} weight="bold" /></button></form>;
}

function SectionHeading({ eyebrow, title, action, onAction }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && <button onClick={onAction}>{action} <ArrowRight size={16} weight="bold" /></button>}</div>;
}

function QuickAction({ icon: Icon, title, text, accent, onClick }) {
  return <button className={`quick-action ${accent ? "quick-action--accent" : ""}`} onClick={onClick}><Icon size={28} weight="thin" /><strong>{title}</strong><span>{text}</span><i><ArrowRight size={17} weight="bold" /></i></button>;
}

function StudioCard({ icon: Icon, label, title, text, action, accent, onClick }) {
  return <article className={`studio-card ${accent ? "studio-card--accent" : ""}`}><span className="studio-card__icon"><Icon size={26} weight="thin" /></span><small>{label}</small><h3>{title}</h3><p>{text}</p><button onClick={onClick}>{action} <ArrowRight size={16} weight="bold" /></button></article>;
}
