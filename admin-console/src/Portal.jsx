import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise, ArrowRight, BookOpenText, Brain, CheckCircle, CirclesThreePlus,
  Compass, GraduationCap, GridFour, ImageSquare, Lightbulb, LockKey,
  MagnifyingGlass, Palette, Plus, RocketLaunch, Sparkle, Stack, UsersThree, X,
} from "@phosphor-icons/react";
import { createAgentRun, executeAgentRun, executeAgentRunStream, getApiHealth, getPortalHome, runGenerationJob } from "./services/adminApi.js";
import { AiCreationLauncher } from "./AiCreationConsole.jsx";
import { AiCreationWorkspace } from "./CreationWorkspace.jsx";
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

function PortalArtRails() {
  return <div className="portal-art-rails" aria-hidden="true">
    <div className="portal-art-rail portal-art-rail--left">
      <span className="art-rail__index">ART / 01</span>
      <figure className="art-rail__tile art-rail__tile--pattern"><img src="/assets/learning/traditional-patterns.jpg" alt="" /><figcaption>传统纹样</figcaption></figure>
      <i className="art-rail__shape art-rail__shape--ring" />
      <figure className="art-rail__tile art-rail__tile--code"><img src="/assets/learning/vibe-coding.jpg" alt="" /><figcaption>数字实验</figcaption></figure>
    </div>
    <div className="portal-art-rail portal-art-rail--right">
      <figure className="art-rail__tile art-rail__tile--visual"><img src="/assets/learning/ai-design-foundations.jpg" alt="" /><figcaption>视觉叙事</figcaption></figure>
      <i className="art-rail__shape art-rail__shape--spark" />
      <span className="art-rail__index">02 / EDU</span>
      <figure className="art-rail__tile art-rail__tile--detail"><img src="/assets/learning/traditional-patterns.jpg" alt="" /><figcaption>观察 · 重组</figcaption></figure>
    </div>
  </div>;
}

export function LocalLogin({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("checking");
  const isHostedPreview = typeof window !== "undefined" && window.location.hostname.endsWith(".chatgpt.site");

  const checkService = useCallback(async () => {
    setServiceStatus("checking");
    try { await getApiHealth(); setServiceStatus("online"); }
    catch { setServiceStatus("offline"); }
  }, []);

  useEffect(() => { void checkService(); }, [checkService]);

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
      {!isHostedPreview && <div className={`login-service login-service--${serviceStatus}`} role="status"><span>{serviceStatus === "checking" ? <ArrowClockwise className="spin" size={16} /> : serviceStatus === "online" ? <CheckCircle size={16} weight="fill" /> : <X size={16} weight="bold" />}{serviceStatus === "checking" ? "正在检测登录服务" : serviceStatus === "online" ? "登录服务与数据库连接正常" : "登录服务暂不可用"}</span>{serviceStatus === "offline" && <button type="button" onClick={checkService}>重新检测</button>}</div>}
      <form className="local-login-form" onSubmit={submit}>
        <label>账号<input autoComplete="username" required maxLength="120" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" required minLength="1" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button disabled={submitting || serviceStatus !== "online"}>{submitting ? "正在验证…" : serviceStatus === "checking" ? "正在连接…" : serviceStatus === "offline" ? "服务未连接" : "安全登录"} <ArrowRight size={16} weight="bold" /></button>
      </form>
    </section>
  </main>;
}

export function UserPortal({ account, onSwitchAccount, onEnterAdmin, section = "home", searchQuery = "", learningCourseId = "", studioWorkflowId = "", studioRunId = "", creationStartNew = false, creationId = "", onNavigate = () => {} }) {
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
      const [payload, health] = await Promise.all([getPortalHome(), getApiHealth()]);
      setData({
        courses: payload.courses ?? [],
        workflows: payload.workflows ?? [],
        works: payload.works ?? [],
        creation: payload.creation ?? emptyPortalData.creation,
      });
      setIsLive(Boolean(health));
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
  // signal 由创作页下发：用户点「暂停输出」时中断在途请求。
  // onDelta 同样由创作页下发：正文增量实时回到气泡里，实现逐字输出。
  const startGeneration = async (jobType, prompt, parameters = {}, modelConfigId, context = [], signal, onDelta) => {
    try {
      if (portalLoading || !isLive) throw new Error("平台服务尚未就绪，请等待加载完成后重试");
      const searchEnabled = parameters.searchEnabled === true;
      // 能力策略属于 system prompt，绝不拼进用户原话；否则模型会反复复述“平台提示”。
      const cleanPrompt = prompt;
      // 任务分流必须是白名单：普通问答只能走文本 Agent，绝不允许因为未知类型
      // 或缺失映射而默认回退到 ui_design / 图片生成通道。
      const agentScenarios = { chat: "chat", webpage: "webpage_generation" };
      const offlineScenarios = { chat: "chat", image: "ui_design", pattern: "pattern_generation", webpage: "webpage_generation", document: "document_generation" };
      const artifactJobTypes = new Set(["image", "pattern", "document"]);
      const agentScenario = agentScenarios[jobType];

      if (data.creation.enabled && agentScenario) {
        const scenario = agentScenario;
        const run = await createAgentRun({ scenario, prompt: cleanPrompt, parameters: { ...parameters, source: "portal-home" } }, { signal });
        const completed = await executeAgentRunStream(run.id, {
          mode: "server",
          providerId: modelConfigId,
          context,
          searchEnabled,
          systemPrompt: `${searchEnabled
            ? "仅当用户明确要求实时互联网资料、官网链接或事实核验时调用 search_web；调用后只能依据实际来源回答并列出链接。"
            : "联网搜索关闭：不要调用或提及 search_web。"}\n平台课程、案例与工作流的发现和读取工具始终可用，但只有用户明确询问平台内容、要求列出内容或打开站内内容时才调用。未提供 ID 时先用 list_published_content 或 search_platform。对“打开”请求返回站内相对路径 Markdown 链接，不要谈浏览器、域名、路由字段或能力限制。直接完成用户的任务，不要复述平台规则、工具名或能力说明。成果草稿可直接保存；启动工作流才需要用户明确确认。`,
          // 不要用 tool_choice 强制指定函数：当前文本模型（deepseek-flash）运行在
          // 思考模式下，DeepSeek 会直接拒绝并返回
          // 400 "Thinking mode does not support this tool_choice"。
          // 首轮调用 search_web 由上面的 systemPrompt 明确要求，auto 下模型会遵守；
          // 强制反而会让开启搜索的每一轮对话都失败。
          model: { toolChoice: "auto" },
        }, { signal, onDelta });
        const message = [...(completed.messages ?? [])].reverse().find((item) => item.role === "agent");
        showToast(searchEnabled ? "已完成带搜索能力的 Agent 创作" : "已完成 Agent 创作", "success");
        return {
          id: run.id,
          content: message?.content ?? "未生成创作建议。",
          sources: searchSourcesFromRun(completed.toolCalls),
        };
      }
      if (!data.creation.enabled) {
        const scenario = offlineScenarios[jobType];
        if (!scenario) throw new Error("不支持的创作类型，已阻止执行");
        const run = await createAgentRun({ scenario, prompt: cleanPrompt, parameters }, { signal });
        const completed = await executeAgentRun(run.id, { mode: data.creation.enabled ? "server" : "mock", providerId: modelConfigId, context }, { signal });
        const lastMessage = [...(completed.messages ?? [])].reverse().find((message) => message.role === "agent");
        showToast("本地演示已完成：创作说明已写入审计记录。", "success");
        return { id: run.id, local: true, content: lastMessage?.content ?? "本地创作说明已生成。" };
      }
      if (!artifactJobTypes.has(jobType)) throw new Error("不支持的创作类型，已阻止执行");
      // 只挑真正声明支持该能力的模型；图像/图案留给服务端的内部图像通道（不带 modelConfigId）。
      const selectedModelId = modelConfigId ?? data.creation.models.find((model) => model.capabilities?.includes(jobType))?.id;
      const result = await runGenerationJob({ jobType, prompt: cleanPrompt, context, modelConfigId: selectedModelId, parameters: { source: "portal-home", ...parameters } }, { signal });
      showToast(`模型已完成创作建议：${result.job.id.slice(0, 8)}…`, "success");
      void loadPortalData();
      // 产物类结果（kind=asset）的 content 是存储键，不能当正文显示。
        return { ...result.job, content: resultContent(result), model: result.output.metadata?.model, localFile: result.artifact ?? null };
    } catch (error) {
      // 主动暂停不是失败：不弹错误提示，交给创作页显示「已暂停」并回填输入。
      if (error?.name === "AbortError") throw error;
      showToast(isLive ? error.message : "API 服务不可用，暂时无法创建任务。", "error");
      throw error;
    }
  };
  const createFromConversation = ({ jobType, prompt, parameters, modelConfigId, context }, signal, onDelta) => startGeneration(jobType, prompt, parameters, modelConfigId, context, signal, onDelta);

  const pageTitle = { home: "学习与创作总览", courses: "教学资源库", studio: "设计工作台", community: "案例社区", myLearning: "我的学习", search: "全站搜索", creation: "创作会话" }[section];
  const navigateSection = (nextSection) => onNavigate({ home: "/", courses: "/learning", studio: "/studio", community: "/community", myLearning: "/my-learning", creation: "/create" }[nextSection] ?? "/");
  const navigateSearch = (query) => onNavigate(`/search?query=${encodeURIComponent(query)}`);

  return <div className="portal-shell" data-section={section}>
    <header className="portal-topbar">
      <button className="portal-brand" onClick={() => navigateSection("home")}><span>A</span><strong>ArtEdu</strong></button>
      <nav className="portal-nav" aria-label="顶部主导航">{navItems.map(([id, label, Icon]) => <button key={id} data-section={id} className={section === id ? "is-active" : ""} onClick={() => navigateSection(id)}><Icon size={17} weight={section === id ? "fill" : "bold"} />{label}</button>)}</nav>
      <GlobalSearchForm value={searchQuery} onSearch={navigateSearch} />
      {canEnterAdmin(account) && <button className="portal-console-shortcut" onClick={onEnterAdmin}>管理后台 <ArrowRight size={15} weight="bold" /></button>}
      <div className="portal-account"><span className={`live-indicator ${isLive ? "is-live" : ""}`}>{isLive ? "API 已验证" : "API 未连接"}</span><div className="account-menu"><button className="account-switch" aria-label="打开账号菜单" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}><span>{account.shortName.slice(0, 1)}</span><div><strong>{account.shortName}</strong><RolePill account={account} /></div></button>{accountMenuOpen && <div className="account-menu__panel"><strong>{account.name}</strong><span>{account.roleLabel}</span>{canEnterAdmin(account) && <button onClick={() => { setAccountMenuOpen(false); onEnterAdmin(); }}>进入管理后台</button>}<button className="account-menu__signout" onClick={onSwitchAccount}>退出登录</button></div>}</div></div>
    </header>

    <PortalArtRails />

    <main className={`portal-main ${section === "home" ? "portal-main--home" : ""}`}>
      <div key={`${section}:${searchQuery}`} className="route-transition">
      {section !== "home" && section !== "myLearning" && section !== "search" && section !== "creation" && <section className="portal-heading"><div><p className="eyebrow">// {section.toUpperCase()}</p><h1>{pageTitle}</h1></div>{canEnterAdmin(account) && <button className="console-entry" onClick={onEnterAdmin}>进入管理工作台 <ArrowRight size={17} weight="bold" /></button>}</section>}

      {section === "home" && <>
        <AiCreationLauncher account={account} creation={data.creation} onNotice={showToast} onLaunch={(id) => onNavigate(id ? `/create?id=${encodeURIComponent(id)}` : "/create")} />
        {portalLoading && <HomeDataState loading />}
        {!portalLoading && portalError && <HomeDataState error={portalError} onRetry={loadPortalData} />}
        {!portalLoading && !portalError && (nextCourse ? <section className="progress-strip"><div><span>当前学习</span><strong>{nextCourse.title}</strong></div><div className="progress-line"><i style={{ width: `${nextCourse.progressPercent ?? 0}%` }} /></div><b>{nextCourse.progressPercent ?? 0}%</b><button onClick={() => navigateSection("courses")}>打开课程 <ArrowRight size={15} weight="bold" /></button></section> : <HomeDataState title="还没有进行中的课程" text="从教学资源库选择一门课程，开始记录你的学习进度。" action="浏览课程" onRetry={() => navigateSection("courses")} />)}
        {!portalLoading && !portalError && <CourseDiscovery courses={data.courses} onSearch={navigateSearch} onBrowse={() => navigateSection("courses")} onCoach={() => setCoachOpen(true)} />}
        <SectionHeading eyebrow="// QUICK START" title="今天想做什么？" action="查看全部工作流" onAction={() => navigateSection("studio")} />
        <section className="quick-grid"><QuickAction icon={Brain} title="问教学教练" text="根据课程与工作流生成下一步学习建议。" onClick={() => setCoachOpen(true)} /><QuickAction icon={ImageSquare} title="生成视觉草稿" text="输入灵感，启动图片或图案生成任务。" accent onClick={() => startGeneration("image", "以传统云纹为灵感，生成一张用于丝网印刷的青绿色视觉草稿。")} /><QuickAction icon={Compass} title="拆解优秀案例" text="从作品倒推同款工作流与创作方法。" onClick={() => navigateSection("community")} /></section>
        <SectionHeading eyebrow="// FEATURED WORKFLOWS" title="精选工作流" />
        {data.workflows.length ? <section className="workflow-grid">{data.workflows.slice(0, 3).map((workflow) => <article className="workflow-card" key={workflow.id}><WorkflowGlyph entryType={workflow.entryType} /><span>{workflow.category}</span><h3>{workflow.name}</h3><p>{workflow.description}</p><button onClick={() => navigateSection("studio")}>开始使用 <ArrowRight size={16} weight="bold" /></button></article>)}</section> : !portalLoading && !portalError && <HomeDataState title="暂无已发布工作流" text="教师发布工作流后，会在这里展示推荐创作路径。" action="进入工作台" onRetry={() => navigateSection("studio")} />}
      </>}

      <Suspense fallback={<section className="portal-empty"><p>正在加载页面…</p></section>}>
        {section === "courses" && <><SectionHeading eyebrow="// RESOURCE LIBRARY" title="课程与学习资源" /><LearningLibrary initialCourseId={learningCourseId} onNotice={showToast} /></>}

        {section === "studio" && <WorkflowStudio initialWorkflowId={studioWorkflowId} initialRunId={studioRunId} onNotice={showToast} canManageToolDirectory={account.roles?.includes("admin")} canPublish={account.roles?.some((role) => ["admin", "teacher", "operator"].includes(role))} />}

        {section === "community" && <><SectionHeading eyebrow="// COMMUNITY" title="大家正在创作" /><CommunityLibrary account={account} onNotice={showToast} onOpenWorkflow={(workflowId) => onNavigate(`/studio?workflow=${encodeURIComponent(workflowId)}`)} /></>}

        {section === "myLearning" && <MyLearning account={account} onNavigate={onNavigate} onNotice={showToast} />}

        {section === "search" && <SearchResults initialQuery={searchQuery} fallbackData={data} onSearch={navigateSearch} onNavigate={onNavigate} />}

        {section === "creation" && <AiCreationWorkspace key={creationId || (creationStartNew ? "new" : "latest")} account={account} ready={!portalLoading && isLive} onCreate={createFromConversation} creation={data.creation} onNotice={showToast} startNew={creationStartNew} conversationId={creationId} onBack={() => onNavigate("/")} />}
      </Suspense>
      </div>
    </main>
    {coachOpen && <TeachingCoach courses={data.courses} workflows={data.workflows} onClose={() => setCoachOpen(false)} onNavigate={(target) => { setCoachOpen(false); onNavigate(target); }} />}
  </div>;
}

function TeachingCoach({ courses, workflows, onClose, onNavigate }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ goal: "", level: "", output: "" });
  const [answer, setAnswer] = useState(null);
  const questions = [
    { key: "goal", title: "你现在最想做什么？", options: [["learn", "系统学习", "从课程和基础概念开始"], ["create", "完成一个作品", "直接进入案例和工作流"], ["explore", "探索灵感", "先看优秀案例和工具"]] },
    { key: "level", title: "你对设计工具熟悉吗？", options: [["beginner", "零基础", "希望每一步都有明确提示"], ["familiar", "用过一些", "可以边看边尝试"], ["advanced", "比较熟悉", "希望快速进入创作"]] },
    { key: "output", title: "你希望先得到什么？", options: [["course", "课程路径", "按课时稳步学习"], ["workflow", "工作流方案", "照着节点步骤完成"], ["case", "案例参考", "先看结果和创作方法"]] }],
    current = questions[step];
  const choose = (value) => {
    const next = { ...answers, [current.key]: value };
    setAnswers(next);
    if (step < questions.length - 1) setStep(step + 1);
    else {
      const course = next.output === "course" ? courses[0] : courses.find((item) => next.goal === "create" ? /创作|设计|图案|视觉/.test(`${item.title}${item.summary}${item.category}`) : true) ?? courses[0];
      const workflow = next.output === "workflow" ? workflows[0] : workflows.find((item) => next.goal === "create" ? /工作流|设计|图像/.test(`${item.name}${item.description}${item.category}`) : true) ?? workflows[0];
      const focus = next.goal === "learn" ? "先从一门入门课程开始，完成一个小练习，再进入工作流实践。" : next.goal === "explore" ? "先浏览优秀案例和工具入口，收藏一个最想复刻的方向，再进入课程或工作流。" : "先确定作品主题、素材和输出形式，再用工作流把创意拆成可执行步骤。";
      setAnswer({ focus, course, workflow });
    }
  };
  return <div className="coach-layer" role="presentation"><button className="coach-scrim" aria-label="关闭教学教练" onClick={onClose} /><section className="coach-dialog" role="dialog" aria-modal="true" aria-labelledby="coach-title"><header><div><p>// LEARNING COACH · {answer ? "完成" : `问题 ${step + 1} / ${questions.length}`}</p><h2 id="coach-title">快速入门</h2></div><button onClick={onClose} aria-label="关闭教学教练"><X size={20} weight="bold" /></button></header><p className="coach-intro">回答三个小问题，获得适合你的课程、案例或工作流入口。推荐只基于平台已发布内容。</p>{!answer && <div className="coach-question"><strong>{current.title}</strong><div className="coach-options">{current.options.map(([value, label, hint]) => <button key={value} type="button" onClick={() => choose(value)}><b>{label}</b><span>{hint}</span><ArrowRight size={15} weight="bold" /></button>)}</div></div>}{answer && <section className="coach-answer"><span><Lightbulb size={18} weight="fill" /> 你的入门建议</span><p>{answer.focus}</p>{answer.course && <button onClick={() => onNavigate("/learning")}><small>推荐课程</small><strong>{answer.course.title}</strong><ArrowRight size={16} weight="bold" /></button>}{answer.workflow && <button onClick={() => onNavigate("/studio")}><small>推荐工作流</small><strong>{answer.workflow.name}</strong><ArrowRight size={16} weight="bold" /></button>}{!answer.course && !answer.workflow && <em>当前尚无可推荐内容；请先由教师发布课程或工作流。</em>}<button className="coach-restart" onClick={() => { setStep(0); setAnswers({ goal: "", level: "", output: "" }); setAnswer(null); }}>重新回答</button></section>}</section></div>;
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

function CourseDiscovery({ courses, onSearch, onBrowse, onCoach }) {
  const topics = [...new Set(courses.flatMap((course) => [course.title, course.category].filter(Boolean)))].slice(0, 6);
  return <section className="course-discovery course-discovery--questionnaire" aria-labelledby="course-discovery-title">
    <div><p>// QUICK START QUESTIONNAIRE</p><h2 id="course-discovery-title">先回答三个问题，再开始创作</h2><span>像 Blockbench 的 Quick Start 一样，先选目标和方向，再进入合适的课程、案例或工作流。</span></div>
    <div className="course-discovery__actions"><button className="primary-button" onClick={onCoach}><Lightbulb size={17} weight="fill" /> 开始问卷</button><button className="outline-button" onClick={onBrowse}>浏览全部课程</button></div>
    <div className="course-discovery__topics" aria-label="课程快捷入口">
      <small>课程快捷入口</small>{topics.length ? topics.map((topic) => <button key={topic} onClick={() => onSearch(topic)}>{topic} <ArrowRight size={13} weight="bold" /></button>) : <span>课程发布后将在这里显示快捷入口。</span>}
    </div>
  </section>;
}

function StudioCard({ icon: Icon, label, title, text, action, accent, onClick }) {
  return <article className={`studio-card ${accent ? "studio-card--accent" : ""}`}><span className="studio-card__icon"><Icon size={26} weight="thin" /></span><small>{label}</small><h3>{title}</h3><p>{text}</p><button onClick={onClick}>{action} <ArrowRight size={16} weight="bold" /></button></article>;
}

// 产物类结果（kind=asset，例如图像）的 content 是存储键，不能直接当正文显示。
function resultContent(result) {
  const output = result?.output ?? {};
  if (output.kind === "asset") {
    return "已生成图像产物，可在下方直接查看或下载。\n\n生成文件保存在平台私有目录，仅你的账号可以访问；继续输入描述即可调整风格、构图或配色。";
  }
  return output.content ?? "";
}

/**
 * 从本轮 Agent Run 的工具调用记录里取出联网检索来源，供创作页渲染引用卡片。
 * 来源由后端在 search_web 工具调用时随记录落库（output.sources），这里按 URL 去重保序。
 */
function searchSourcesFromRun(toolCalls) {
  const seen = new Set();
  const sources = [];
  for (const call of toolCalls ?? []) {
    if (call?.toolName !== "search_web") continue;
    for (const source of call?.output?.sources ?? []) {
      const url = typeof source?.url === "string" ? source.url : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: typeof source?.title === "string" ? source.title : "", url });
    }
  }
  return sources.slice(0, 12);
}
