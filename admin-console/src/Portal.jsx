import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpenText, Brain, CheckCircle, CirclesThreePlus,
  Compass, GraduationCap, GridFour, ImageSquare, Lightbulb, LockKey,
  Palette, PlayCircle, Plus, RocketLaunch, Sparkle, Stack, UsersThree,
} from "@phosphor-icons/react";
import { createGenerationJob, getPortalHome } from "./services/adminApi.js";
import { canEnterAdmin } from "./testAccounts.js";

const fallbackData = {
  courses: [
    { id: "course-ai-design-foundation", title: "AI 辅助设计思维与方法", summary: "从灵感到方案，理解 AI 在设计流程中的作用。", category: "设计基础", progressPercent: 62, lessonCount: 8 },
    { id: "course-traditional-pattern", title: "传统纹样的当代表达", summary: "从传统视觉元素中提取结构并完成现代转译。", category: "视觉设计", progressPercent: 0, lessonCount: 6 },
  ],
  workflows: [
    { id: "workflow-case-analysis", name: "案例分析工作流", description: "通过多轮提问拆解作品的目标、结构与设计方法。", category: "案例教学", entryType: "chat" },
    { id: "workflow-image-draft", name: "图片生成工作流", description: "从文字描述开始生成可继续讨论的视觉草稿。", category: "视觉生成", entryType: "workbench" },
    { id: "workflow-webpage", name: "网页创作助手", description: "先厘清页面结构，再输出可编辑的网页方案。", category: "网页生成", entryType: "chat" },
  ],
  works: [
    { id: "work-demo-cloud-pattern", title: "云格新序：传统纹样的当代表达", summary: "从云纹、格栅与植物轮廓中提取结构特征，重新组织为当代视觉系统。", discipline: "视觉系统设计", author: "林知夏" },
    { id: "work-demo-poster", title: "校园导视图标系统", summary: "为新生设计清晰、统一且可扩展的校园导视图标。", discipline: "视觉传达", author: "陈明远" },
  ],
};

const navItems = [
  ["home", "首页", GridFour],
  ["courses", "教学资源", GraduationCap],
  ["studio", "设计工作台", Palette],
  ["community", "案例社区", UsersThree],
];

function RolePill({ account }) {
  return <span className={`role-pill role-pill--${account.accent}`}><i />{account.roleLabel}</span>;
}

function WorkflowGlyph({ entryType }) {
  const Icon = entryType === "workbench" ? CirclesThreePlus : entryType === "external_tool" ? RocketLaunch : Brain;
  return <span className="workflow-glyph"><Icon size={21} weight="bold" /></span>;
}

export function TestLogin({ accounts, onSelect }) {
  return <main className="test-login">
    <section className="test-login__intro">
      <div className="test-login__brand"><span>A</span><strong>ArtEdu</strong></div>
      <p className="eyebrow">// INTEGRATED TEST SPACE</p>
      <h1>一个入口，<br />测试所有角色。</h1>
      <p>教学、创作、案例社区与管理工作台已合在同一套测试站中。选择下方账号即可进入。</p>
      <div className="test-login__note"><LockKey size={17} weight="bold" /><span>测试账号对应数据库中的演示用户，不需要密码。</span></div>
    </section>
    <section className="test-login__accounts" aria-label="选择测试账号">
      <div className="account-panel__heading"><div><p>// TEST ACCOUNTS</p><h2>选择一个身份</h2></div><span>04 accounts</span></div>
      <div className="account-cards">
        {accounts.map((account, index) => <button className={`account-card account-card--${account.accent}`} key={account.id} onClick={() => onSelect(account)}>
          <span className="account-card__number">0{index + 1}</span><RolePill account={account} />
          <strong>{account.name}</strong><p>{account.description}</p>
          <span className="account-card__enter">进入体验 <ArrowRight size={16} weight="bold" /></span>
        </button>)}
      </div>
    </section>
  </main>;
}

export function UserPortal({ account, onSwitchAccount, onEnterAdmin, section = "home", onNavigate = () => {} }) {
  const [data, setData] = useState(fallbackData);
  const [isLive, setIsLive] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    getPortalHome().then((payload) => {
      setData({
        courses: payload.courses?.length ? payload.courses : fallbackData.courses,
        workflows: payload.workflows?.length ? payload.workflows : fallbackData.workflows,
        works: payload.works?.length ? payload.works : fallbackData.works,
      });
      setIsLive(true);
    }).catch(() => setIsLive(false));
  }, [account.id]);

  const nextCourse = useMemo(() => data.courses.find((course) => course.progressPercent > 0 && course.progressPercent < 100) ?? data.courses[0], [data.courses]);
  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const startGeneration = async (jobType, prompt) => {
    try {
      const job = await createGenerationJob({ jobType, prompt, parameters: { source: "integrated-test-site" } });
      showToast(`任务已创建：${job.id.slice(0, 8)}…，可在后端任务队列中查看。`);
    } catch (error) {
      showToast(isLive ? error.message : "当前展示为离线演示数据；启动 API 后即可创建真实任务。");
    }
  };

  const pageTitle = { home: "学习与创作总览", courses: "教学资源库", studio: "设计工作台", community: "案例社区" }[section];
  const navigateSection = (nextSection) => onNavigate({ home: "/", courses: "/learning", studio: "/studio", community: "/community" }[nextSection] ?? "/");

  return <div className="portal-shell">
    <header className="portal-topbar">
      <button className="portal-brand" onClick={() => navigateSection("home")}><span>A</span><strong>ArtEdu</strong></button>
      <nav className="portal-nav" aria-label="主导航">{navItems.map(([id, label, Icon]) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => navigateSection(id)}><Icon size={17} weight={section === id ? "fill" : "bold"} />{label}</button>)}</nav>
      <div className="portal-account"><span className={`live-indicator ${isLive ? "is-live" : ""}`}>{isLive ? "已连接 API" : "演示数据"}</span><button className="account-switch" onClick={onSwitchAccount}><span>{account.shortName.slice(0, 1)}</span><div><strong>{account.shortName}</strong><RolePill account={account} /></div></button></div>
    </header>

    <main className="portal-main">
      <section className="portal-heading"><div><p className="eyebrow">// {section.toUpperCase()}</p><h1>{pageTitle}</h1></div>{canEnterAdmin(account) && <button className="console-entry" onClick={onEnterAdmin}>进入管理工作台 <ArrowRight size={17} weight="bold" /></button>}</section>

      {section === "home" && <>
        <section className="portal-hero">
          <div><span className="hero-hello">你好，{account.shortName}</span><h2>从一节课开始，<br /><em>把想法变成作品。</em></h2><p>今天可以继续学习、进入工作流，或者从案例中找到下一次创作的起点。</p><div className="hero-actions"><button className="portal-primary" onClick={() => navigateSection("courses")}><PlayCircle size={19} weight="fill" />继续学习</button><button className="portal-secondary" onClick={() => navigateSection("studio")}><Sparkle size={18} weight="bold" />开始创作</button></div></div>
          <div className="hero-orbit"><span className="orbit-center"><Brain size={38} weight="thin" /></span><i className="orbit-dot orbit-dot--one" /><i className="orbit-dot orbit-dot--two" /><i className="orbit-dot orbit-dot--three" /><div className="orbit-label orbit-label--one">教学</div><div className="orbit-label orbit-label--two">设计</div><div className="orbit-label orbit-label--three">社区</div></div>
        </section>
        <section className="progress-strip"><div><span>当前学习</span><strong>{nextCourse?.title}</strong></div><div className="progress-line"><i style={{ width: `${nextCourse?.progressPercent ?? 0}%` }} /></div><b>{nextCourse?.progressPercent ?? 0}%</b><button onClick={() => navigateSection("courses")}>打开课程 <ArrowRight size={15} weight="bold" /></button></section>
        <SectionHeading eyebrow="// QUICK START" title="今天想做什么？" action="查看全部工作流" onAction={() => navigateSection("studio")} />
        <section className="quick-grid"><QuickAction icon={Brain} title="问教学教练" text="根据课件与课程知识提问，生成学习路径。" onClick={() => showToast("教学对话模块已预留，下一步接入课程知识库。")} /><QuickAction icon={ImageSquare} title="生成视觉草稿" text="输入灵感，启动图片或图案生成任务。" accent onClick={() => startGeneration("image", "以传统云纹为灵感，生成一张用于丝网印刷的青绿色视觉草稿。")} /><QuickAction icon={Compass} title="拆解优秀案例" text="从作品倒推同款工作流与创作方法。" onClick={() => navigateSection("community")} /></section>
        <SectionHeading eyebrow="// FEATURED WORKFLOWS" title="精选工作流" />
        <section className="workflow-grid">{data.workflows.slice(0, 3).map((workflow) => <article className="workflow-card" key={workflow.id}><WorkflowGlyph entryType={workflow.entryType} /><span>{workflow.category}</span><h3>{workflow.name}</h3><p>{workflow.description}</p><button onClick={() => navigateSection("studio")}>开始使用 <ArrowRight size={16} weight="bold" /></button></article>)}</section>
      </>}

      {section === "courses" && <><SectionHeading eyebrow="// RESOURCE LIBRARY" title="课程与学习资源" /><section className="course-grid">{data.courses.map((course, index) => <article className="course-card" key={course.id}><div className={`course-cover course-cover--${index % 3}`}><BookOpenText size={32} weight="thin" /><span>{course.category}</span></div><div className="course-card__content"><small>{course.lessonCount ?? 6} 个课时</small><h3>{course.title}</h3><p>{course.summary}</p><div className="course-card__footer"><div><i><b style={{ width: `${course.progressPercent ?? 0}%` }} /></i><span>{course.progressPercent ?? 0}%</span></div><button onClick={() => showToast("课程详情页将复用当前课程数据与学习进度表。")}><ArrowRight size={18} weight="bold" /></button></div></div></article>)}</section></>}

      {section === "studio" && <><SectionHeading eyebrow="// CREATE WITH AI" title="设计工作台" /><section className="studio-grid"><StudioCard icon={Lightbulb} label="多轮引导" title="网页创作助手" text="通过几轮提问明确内容、结构与风格，再生成页面方案。" action="开始对话" onClick={() => startGeneration("webpage", "为美术学院 AI 课程设计一个明快、可浏览作品的活动介绍页面。")} /><StudioCard icon={ImageSquare} label="即时生成" title="UI / 图标生成" text="从一句提示词开始，在创作过程中继续与 AI 教练对话。" action="生成草稿" accent onClick={() => startGeneration("image", "为校园导视系统生成一组圆角线性图标，统一线宽，包含教学楼、食堂、运动场。")} /><StudioCard icon={CirclesThreePlus} label="节点工作台" title="图案生成实验室" text="用可视化节点串联图案处理流程，把专业技能封装为可复用模块。" action="打开画布" onClick={() => startGeneration("pattern", "将传统云纹与植物标本结构重组为可无限延展的现代纹样。")} /></section><section className="studio-tip"><Sparkle size={20} weight="fill" /><div><strong>测试提示</strong><span>启动 API 与 worker 后，点击任意创作卡片会写入真实的生成任务队列。</span></div></section></>}

      {section === "community" && <><SectionHeading eyebrow="// COMMUNITY" title="大家正在创作" action="发布作品" onAction={() => showToast("作品发布表单将在作品与文件上传接口完成后接入。")} /><section className="work-grid">{data.works.map((work, index) => <article className="work-card" key={work.id}><div className={`work-preview work-preview--${index % 3}`}><span>{work.discipline}</span><Palette size={44} weight="thin" /></div><div><small>{work.author}</small><h3>{work.title}</h3><p>{work.summary}</p><button onClick={() => showToast("案例详情会连接作品、评论和同款工作流。")}>查看案例 <ArrowRight size={16} weight="bold" /></button></div></article>)}</section></>}
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
