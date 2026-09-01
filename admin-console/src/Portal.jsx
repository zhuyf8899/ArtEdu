import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpenText, Brain, CheckCircle, CirclesThreePlus,
  Compass, GraduationCap, GridFour, ImageSquare, Lightbulb, LockKey,
  Palette, Plus, RocketLaunch, Sparkle, Stack, UsersThree,
} from "@phosphor-icons/react";
import { createGenerationJob, getPortalHome } from "./services/adminApi.js";
import { AiCreationConsole } from "./AiCreationConsole.jsx";
import { LearningLibrary } from "./LearningLibrary.jsx";
import { WorkflowStudio } from "./WorkflowStudio.jsx";
import { CommunityLibrary } from "./CommunityLibrary.jsx";
import { MyLearning } from "./MyLearning.jsx";
import { canEnterAdmin } from "./testAccounts.js";

const emptyPortalData = { courses: [], workflows: [], works: [] };

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
      <form className="local-login-form" onSubmit={submit}>
        <label>账号<input autoComplete="username" required maxLength="120" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" required minLength="1" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button disabled={submitting}>{submitting ? "正在验证…" : "安全登录"} <ArrowRight size={16} weight="bold" /></button>
      </form>
    </section>
  </main>;
}

export function UserPortal({ account, onSwitchAccount, onEnterAdmin, section = "home", onNavigate = () => {} }) {
  const [data, setData] = useState(emptyPortalData);
  const [isLive, setIsLive] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    getPortalHome().then((payload) => {
      setData({
        courses: payload.courses ?? [],
        workflows: payload.workflows ?? [],
        works: payload.works ?? [],
      });
      setIsLive(true);
    }).catch(() => {
      setData(emptyPortalData);
      setIsLive(false);
      setToast("首页数据加载失败，请检查 API 服务");
    });
  }, [account.id]);

  const nextCourse = useMemo(() => data.courses.find((course) => course.progressPercent > 0 && course.progressPercent < 100) ?? data.courses[0], [data.courses]);
  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const startGeneration = async (jobType, prompt, parameters = {}) => {
    try {
      const job = await createGenerationJob({ jobType, prompt, parameters: { source: "integrated-test-site", ...parameters } });
      showToast(`任务已创建：${job.id.slice(0, 8)}…，可在后端任务队列中查看。`);
      return job;
    } catch (error) {
      showToast(isLive ? error.message : "API 服务不可用，暂时无法创建任务。");
      return null;
    }
  };
  const createFromConversation = ({ jobType, prompt, parameters }) => startGeneration(jobType, prompt, parameters);

  const pageTitle = { home: "学习与创作总览", courses: "教学资源库", studio: "设计工作台", community: "案例社区", myLearning: "我的学习" }[section];
  const navigateSection = (nextSection) => onNavigate({ home: "/", courses: "/learning", studio: "/studio", community: "/community", myLearning: "/my-learning" }[nextSection] ?? "/");

  return <div className="portal-shell">
    <header className="portal-topbar">
      <button className="portal-brand" onClick={() => navigateSection("home")}><span>A</span><strong>ArtEdu</strong></button>
      <nav className="portal-nav" aria-label="主导航">{navItems.map(([id, label, Icon]) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => navigateSection(id)}><Icon size={17} weight={section === id ? "fill" : "bold"} />{label}</button>)}</nav>
      {canEnterAdmin(account) && <button className="portal-console-shortcut" onClick={onEnterAdmin}>管理后台 <ArrowRight size={15} weight="bold" /></button>}
      <div className="portal-account"><span className={`live-indicator ${isLive ? "is-live" : ""}`}>{isLive ? "已连接 API" : "API 未连接"}</span><button className="account-switch" onClick={onSwitchAccount}><span>{account.shortName.slice(0, 1)}</span><div><strong>{account.shortName}</strong><RolePill account={account} /></div></button></div>
    </header>

    <main className={`portal-main ${section === "home" ? "portal-main--home" : ""}`}>
      {section !== "home" && section !== "myLearning" && <section className="portal-heading"><div><p className="eyebrow">// {section.toUpperCase()}</p><h1>{pageTitle}</h1></div>{canEnterAdmin(account) && <button className="console-entry" onClick={onEnterAdmin}>进入管理工作台 <ArrowRight size={17} weight="bold" /></button>}</section>}

      {section === "home" && <>
        <AiCreationConsole account={account} onCreate={createFromConversation} />
        <section className="progress-strip"><div><span>当前学习</span><strong>{nextCourse?.title}</strong></div><div className="progress-line"><i style={{ width: `${nextCourse?.progressPercent ?? 0}%` }} /></div><b>{nextCourse?.progressPercent ?? 0}%</b><button onClick={() => navigateSection("courses")}>打开课程 <ArrowRight size={15} weight="bold" /></button></section>
        <SectionHeading eyebrow="// QUICK START" title="今天想做什么？" action="查看全部工作流" onAction={() => navigateSection("studio")} />
        <section className="quick-grid"><QuickAction icon={Brain} title="问教学教练" text="根据课件与课程知识提问，生成学习路径。" onClick={() => showToast("教学对话模块已预留，下一步接入课程知识库。")} /><QuickAction icon={ImageSquare} title="生成视觉草稿" text="输入灵感，启动图片或图案生成任务。" accent onClick={() => startGeneration("image", "以传统云纹为灵感，生成一张用于丝网印刷的青绿色视觉草稿。")} /><QuickAction icon={Compass} title="拆解优秀案例" text="从作品倒推同款工作流与创作方法。" onClick={() => navigateSection("community")} /></section>
        <SectionHeading eyebrow="// FEATURED WORKFLOWS" title="精选工作流" />
        <section className="workflow-grid">{data.workflows.slice(0, 3).map((workflow) => <article className="workflow-card" key={workflow.id}><WorkflowGlyph entryType={workflow.entryType} /><span>{workflow.category}</span><h3>{workflow.name}</h3><p>{workflow.description}</p><button onClick={() => navigateSection("studio")}>开始使用 <ArrowRight size={16} weight="bold" /></button></article>)}</section>
      </>}

      {section === "courses" && <><SectionHeading eyebrow="// RESOURCE LIBRARY" title="课程与学习资源" /><LearningLibrary onNotice={showToast} /></>}

      {section === "studio" && <><SectionHeading eyebrow="// GUIDED CREATION" title="工作流学习与创作" /><WorkflowStudio onNotice={showToast} /></>}

      {section === "community" && <><SectionHeading eyebrow="// COMMUNITY" title="大家正在创作" /><CommunityLibrary onNotice={showToast} /></>}

      {section === "myLearning" && <MyLearning account={account} onNavigate={onNavigate} onNotice={showToast} />}
    </main>
    {toast && <div className="portal-toast"><CheckCircle size={18} weight="fill" />{toast}</div>}
  </div>;
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
