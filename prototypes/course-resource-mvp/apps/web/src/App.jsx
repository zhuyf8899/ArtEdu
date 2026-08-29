import { useEffect, useState } from "react";
import {
  ArrowRight, CaretDown, Check, Clock, Coins, Eye, FileArrowUp, Heart,
  BookOpenText, CheckCircle, DownloadSimple, GraduationCap, ImageSquare,
  List, MagnifyingGlass, PaperPlaneTilt, Play, Sparkle, UserCircle, X,
} from "@phosphor-icons/react";

const fallbackModels = [
  { id: "gpt-4o", name: "GPT-4o", cost: 1, capability: "创意规划 / 视觉理解" },
  { id: "flux-1-dev", name: "Flux.1-dev", cost: 2, capability: "高质量图像生成" },
  { id: "midjourney-v6", name: "Midjourney V6.1", cost: 3, capability: "艺术图像生成" },
  { id: "ideogram-3", name: "Ideogram 3", cost: 2, capability: "字体 / 海报生成" },
];

const fallbackResources = [
  { id: "R-101", title: "国潮茶饮包装：宋风意境", category: "视觉传达", type: "案例", author: "周可", views: 5513, likes: 743, model: "Ideogram 3", asset: "/assets/song-tea-packaging.png" },
  { id: "R-102", title: "毕设海报：断裂与重建", category: "信息艺术", type: "案例", author: "陈明远", views: 3679, likes: 481, model: "Flux.1-dev", asset: "/assets/fracture-poster.png" },
  { id: "R-103", title: "透明背景 Icon 生成指南", category: "UI 创作", type: "课程", author: "王雅琳", views: 2280, likes: 316, model: "GPT-4o", asset: "/assets/icon-system.png" },
  { id: "R-104", title: "传统纹样数字采样包", category: "工艺美术", type: "素材", author: "平台资源组", views: 8064, likes: 902, model: "—", asset: "/assets/pattern-sampler.png" },
];

const fallbackWorkflows = [
  { id: "WF-001", title: "用 AI 生成 3 组视觉方向", category: "视觉传达", difficulty: "教师精选", duration: 16, users: "1.8k", progress: 38, steps: ["关键词拆解与风格定义", "初稿图案生成", "色彩系统调整", "丝巾版式适配", "最终导出与资产整理"] },
  { id: "WF-002", title: "从需求分析到交互原型", category: "UI 创作", difficulty: "新手友好", duration: 28, users: "2.9k", progress: 0, steps: ["拆解需求", "信息架构", "界面视觉", "交互原型"] },
  { id: "WF-003", title: "传统图案的生成式再设计", category: "染织服装", difficulty: "可做商稿", duration: 32, users: "1.2k", progress: 64, steps: ["文化母题研究", "纹样提示词", "连续图案生成", "材质模拟", "展示板输出"] },
];

const fallbackSubjects = [
  { id: "SUB-01", name: "视觉传达", count: 2 }, { id: "SUB-02", name: "信息艺术设计", count: 2 },
  { id: "SUB-03", name: "染织服装", count: 2 }, { id: "SUB-04", name: "工业设计", count: 1 },
  { id: "SUB-05", name: "环境艺术", count: 0 }, { id: "SUB-06", name: "工艺美术", count: 2 },
];

const fallbackLearning = [
  { id: "PROJECT-001", type: "project", title: "需求分析到交互原型的 Vibe Coding 路径", summary: "从用户访谈提炼需求、梳理任务流，到用 AI 编程工具生成可交互原型。", cover: "UI", enrollmentCount: 9280, estimatedMinutes: 90, subjects: [{ id: "SUB-02", name: "信息艺术设计" }], tags: [{ name: "教师精选" }], progress: { progressPercent: 25, status: "in_progress", completedStepIds: ["P001-S1"] }, steps: [] },
  { id: "PROJECT-002", type: "project", title: "传统图案拆解与纹样 AI 延展创作", summary: "将非遗纹样拆解为形态语素与配色规律，生成丝巾、包装和海报应用。", cover: "纹样", enrollmentCount: 6730, estimatedMinutes: 120, subjects: [{ id: "SUB-03", name: "染织服装" }], tags: [{ name: "可做同款" }], progress: { progressPercent: 33, status: "in_progress", completedStepIds: ["P002-S1"] }, steps: [] },
  { id: "PROJECT-003", type: "project", title: "产品概念草图到多角度 AI 渲染流程", summary: "上传产品草图，识别造型语言并生成多角度效果图。", cover: "3D", enrollmentCount: 4510, estimatedMinutes: 80, subjects: [{ id: "SUB-04", name: "工业设计" }], tags: [{ name: "教师精选" }], progress: null, steps: [] },
  { id: "COURSE-001", type: "course", title: "AI 辅助 UI 设计全流程", summary: "从需求到交互稿，再到 Vibe Coding 实现，完整贯通 AI 设计工作流。", cover: "UI", enrollmentCount: 18000, estimatedMinutes: 360, subjects: [{ id: "SUB-02", name: "信息艺术设计" }], tags: [{ name: "教师精选" }], progress: { progressPercent: 42, status: "in_progress", completedStepIds: [] }, steps: [] },
  { id: "COURSE-002", type: "course", title: "非遗纹样数字创作课", summary: "拆解传统纹样规律，用多模型延展为当代视觉应用。", cover: "纹样", enrollmentCount: 9310, estimatedMinutes: 240, subjects: [{ id: "SUB-03", name: "染织服装" }], tags: [{ name: "新手友好" }], progress: { progressPercent: 100, status: "completed", completedStepIds: [] }, steps: [] },
  { id: "COURSE-003", type: "course", title: "品牌视觉系统速成课", summary: "从关键词到 Logo、主色板和字体搭配，形成完整品牌规范。", cover: "品牌", enrollmentCount: 22000, estimatedMinutes: 270, subjects: [{ id: "SUB-01", name: "视觉传达" }], tags: [{ name: "新手友好" }], progress: null, steps: [] },
];

async function api(path, options) {
  const response = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "请求失败");
  return data;
}

function Logo() {
  return <button className="logo" onClick={() => { location.hash = "home"; location.reload(); }}><span>A</span><div><strong>AIGC 创作广场</strong><small>清华美院 AI 实验场</small></div></button>;
}

function Header({ page, setPage, quota, onOpenCreate, searchQuery, onSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (next) => { setPage(next); setMenuOpen(false); location.hash = next; };
  return <header className="site-header"><Logo /><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="打开导航"><List size={22} weight="bold" /></button><nav className={menuOpen ? "is-open" : ""} aria-label="主导航">{[['home','首页'],['resources','资源库'],['workflows','工作流']].map(([id,label]) => <button key={id} className={page === id ? "is-active" : ""} onClick={() => navigate(id)}>{label}</button>)}<label className="header-search"><MagnifyingGlass size={18} /><input value={searchQuery} onChange={(event) => onSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") navigate("resources"); }} placeholder="搜索课程、项目、案例……" /></label></nav><div className="header-account"><button className="account-button"><UserCircle size={24} weight="fill" /><span><strong>周可</strong><small>染织服装 2024</small></span></button><span className="works-count"><strong>12</strong><small>作品</small></span><button className="quota-button"><Coins size={18} weight="fill" /><strong>{quota?.monthly ? quota.monthly.limit - quota.monthly.used : 172}</strong> 额度</button><button className="publish-button" onClick={onOpenCreate}>发布作品</button></div></header>;
}

function CreationConsole({ models, initialWorkflow, learningContext, onTaskCreated }) {
  const [prompt, setPrompt] = useState(initialWorkflow ? `使用「${initialWorkflow.title}」工作流，创作一套艺术视觉方案` : "");
  const [modelId, setModelId] = useState(models[0]?.id || "gpt-4o");
  const [mode, setMode] = useState("图案生成");
  const [busy, setBusy] = useState(false);
  const selected = models.find((model) => model.id === modelId) || models[0];
  const submit = async () => {
    if (prompt.trim().length < 4) return onTaskCreated({ error: "请先输入至少 4 个字的创作想法" });
    setBusy(true);
    try { onTaskCreated(await api("/generations", { method: "POST", body: JSON.stringify({ prompt, modelId, workflowId: initialWorkflow?.id, contentId: learningContext?.contentId, stepId: learningContext?.stepId }) })); }
    catch (error) { onTaskCreated({ error: error.message }); }
    finally { setBusy(false); }
  };
  return <div className="creation-console"><div className="mode-tabs">{["UI 创作", "图案生成", "VIBE CODING", "网页首页", "移动端 APP", "后台系统"].map(item => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item}</button>)}</div><div className="prompt-row"><Sparkle size={24} weight="duotone" /><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述你想创作的内容、风格、用途和尺寸……" /><button aria-label="提交创作" onClick={submit} disabled={busy}><PaperPlaneTilt size={20} weight="fill" /></button></div><div className="model-row"><span>模型</span><div className="model-pills">{models.map(model => <button key={model.id} className={modelId === model.id ? "is-active" : ""} onClick={() => setModelId(model.id)}>{model.name}</button>)}</div><button className="start-button" onClick={submit} disabled={busy}><Play size={16} weight="fill" />{busy ? "正在创建任务" : `开始创作 · ${selected?.cost || 1} 额度`}</button></div></div>;
}

function ResourceCard({ item }) {
  return <article className="resource-card"><div className="resource-card__image" style={{ backgroundImage: `url(${item.asset || ''})` }}><span>{item.type}</span></div><div className="resource-card__body"><small>{item.category} / {item.model}</small><h3>{item.title}</h3><p>{item.author}</p><footer><span><Eye size={15} />{item.views.toLocaleString()}</span><span><Heart size={15} />{item.likes}</span><button>查看 <ArrowRight size={14} /></button></footer></div></article>;
}

function WorkflowCard({ item, onOpen }) {
  const art = { "UI 创作": "UI", "视觉传达": "视觉", "染织服装": "纹样" }[item.category] || "AI";
  return <article className="workflow-card"><div className="workflow-card__art"><span>{item.difficulty}</span><strong>{art}</strong><small>0{item.steps.length} STEPS</small></div><div className="workflow-card__body"><p>{item.category} / AI 创作</p><h3>{item.title}</h3><div className="workflow-meta"><span><Clock size={15} />{item.duration} min</span><span><UserCircle size={15} />{item.users} 人使用</span></div><div className="progress-label"><span>{item.progress ? `${item.progress}% 已完成` : "尚未开始"}</span><strong>{item.progress}%</strong></div><div className="progress-track"><i style={{ width: `${item.progress}%` }} /></div><button onClick={() => onOpen(item)}>{item.progress ? "继续学习" : "开始工作流"}<ArrowRight size={15} weight="bold" /></button></div></article>;
}

function Home({ models, resources, workflows, setPage, onOpenWorkflow, onTaskCreated }) {
  return <><section className="hero"><div className="hero__eyebrow"><i /> 多模型免费体验 · 校内账号直接使用</div><h1>今天想<span>创作</span>什么？</h1><p>// 输入你的想法，AI 帮你规划创作路径、推荐工作流、直接生成</p><CreationConsole models={models} onTaskCreated={onTaskCreated} /></section><main className="home-content"><section className="section-head"><div><p>// 案例广场</p><h2>从案例开始创作</h2><span>查看优秀作品背后的 AI 工作流，一键复刻学习路径</span></div><button onClick={() => setPage("resources")}>浏览全部资源 <ArrowRight size={17} /></button></section><div className="resource-grid">{resources.slice(0,4).map(item => <ResourceCard key={item.id} item={item} />)}</div><section className="section-head workflow-heading"><div><p>// 教师精选工作流</p><h2>边做边学，掌握 AI 创作技能</h2></div><button onClick={() => setPage("workflows")}>查看全部工作流 <ArrowRight size={17} /></button></section><div className="workflow-grid">{workflows.map(item => <WorkflowCard key={item.id} item={item} onOpen={onOpenWorkflow} />)}</div></main></>;
}

function LearningCard({ item, onOpen }) {
  const progress = item.progress?.progressPercent ?? 0;
  const completed = progress >= 100;
  const action = completed ? "再看一遍" : progress > 0 ? "继续学习" : item.type === "course" ? "开始课程" : "开始学习";
  return <article className={`learning-card learning-card--${item.type}`}>
    <div className="learning-card__cover"><span>{item.tags?.[0]?.name ?? "新手友好"}</span><strong>{item.cover || (item.type === "course" ? "课程" : "项目")}</strong>{completed && <em><Check size={13} weight="bold" /> 完成</em>}</div>
    <div className="learning-card__body"><small>{item.subjects?.map((subject) => subject.name).join(" / ") || "跨学科"} · {item.type === "course" ? "系统课程" : "学习项目"}</small><h3>{item.title}</h3><p>{item.summary}</p><div className="learning-card__meta"><span><UserCircle size={14} />{item.enrollmentCount?.toLocaleString()} 人学习</span><span><Clock size={14} />{item.estimatedMinutes} 分钟</span></div><div className="progress-label"><span>{completed ? "全部完成" : progress ? `${item.progress?.completedStepIds?.length ?? 0}/${item.steps?.length ?? "—"} 步` : "未开始"}</span><strong>{progress}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><button onClick={() => onOpen(item)}>{action}<ArrowRight size={15} weight="bold" /></button></div>
  </article>;
}

function LearningLibrary({ subjects, contents, query, onQueryChange, onOpen, onOpenSubmit }) {
  const [subjectId, setSubjectId] = useState("all");
  const visible = contents.filter((item) => subjectId === "all" || item.subjects?.some((subject) => subject.id === subjectId)).filter((item) => !query.trim() || `${item.title}${item.summary}${item.instructorName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const projects = visible.filter((item) => item.type === "project");
  const courses = visible.filter((item) => item.type === "course");
  return <main className="cream-page learning-library"><section className="page-banner"><div><p>// RESOURCE LIBRARY</p><h1>课程资源</h1><span>按学科找到学习项目和系统课程，在真实创作中掌握 AI 方法。</span></div><button onClick={onOpenSubmit}><FileArrowUp size={19} />提交我的案例</button></section><section className="filter-panel"><p>// 学科筛选</p><div className="filter-title-row"><h2>按学科筛选资源</h2><label><MagnifyingGlass size={17} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索课程或项目" /></label></div><div><button className={subjectId === "all" ? "is-active" : ""} onClick={() => setSubjectId("all")}>全部</button>{subjects.map((subject) => <button className={subjectId === subject.id ? "is-active" : ""} key={subject.id} onClick={() => setSubjectId(subject.id)}>{subject.name} {subject.count}</button>)}</div></section>
    <section className="learning-section"><div className="section-head"><div><p>// 精选学习项目</p><h2>跟着项目路径，掌握 AI 创作技能</h2><span>每个项目都连接课程步骤、AI 工作流与成果提交。</span></div></div>{projects.length ? <div className="learning-grid learning-grid--projects">{projects.map((item) => <LearningCard key={item.id} item={item} onOpen={onOpen} />)}</div> : <div className="learning-empty">当前筛选下没有学习项目</div>}</section>
    <section className="learning-section"><div className="section-head"><div><p>// 系统课程</p><h2>系统课程，深入掌握 AI 创作方法</h2><span>从概念、工具到最终成果，完整保存学习进度。</span></div></div>{courses.length ? <div className="learning-grid">{courses.map((item) => <LearningCard key={item.id} item={item} onOpen={onOpen} />)}</div> : <div className="learning-empty">当前筛选下没有系统课程</div>}</section>
  </main>;
}

function CourseDetail({ content, models, onClose, onProgress, onTaskCreated }) {
  const [current, setCurrent] = useState(content.steps?.find((step) => !content.progress?.completedStepIds?.includes(step.id)) ?? content.steps?.[0]);
  const completed = new Set(content.progress?.completedStepIds ?? []);
  if (!current) return <main className="course-detail"><button className="back-button" onClick={onClose}>← 返回课程资源</button><div className="learning-empty">课程内容正在整理中</div></main>;
  const completeStep = async () => { const progress = await api(`/courses/${content.id}/progress`, { method: "PUT", body: JSON.stringify({ stepId: current.id, completed: true }) }); onProgress(content.id, progress); };
  return <main className="course-detail"><button className="back-button" onClick={onClose}>← 返回课程资源</button><header className="course-detail__hero"><div><p>// {content.type === "course" ? "SYSTEM COURSE" : "LEARNING PROJECT"}</p><h1>{content.title}</h1><span>{content.summary}</span><div><b>{content.instructorName}</b><span>{content.estimatedMinutes} 分钟</span><span>{content.enrollmentCount.toLocaleString()} 人学习</span></div></div><strong>{content.progress?.progressPercent ?? 0}%<small>学习进度</small></strong></header><div className="course-detail__layout"><aside><h2>课程步骤</h2>{content.steps.map((step, index) => <button key={step.id} className={current.id === step.id ? "is-active" : ""} onClick={() => setCurrent(step)}><b>{completed.has(step.id) ? <CheckCircle size={20} weight="fill" /> : String(index + 1).padStart(2, "0")}</b><span><strong>{step.title}</strong><small>{step.kind} · {step.estimatedMinutes} 分钟</small></span></button>)}</aside><section className="course-step"><div className="course-step__heading"><span>STEP {String(current.sortOrder).padStart(2, "0")} · {current.kind}</span><h2>{current.title}</h2><p>{current.summary}</p></div>{current.resourceFileIds?.length > 0 && <div className="course-assets"><h3>本步骤资料</h3>{current.resourceFileIds.map((id) => <button key={id}><DownloadSimple size={18} />课程附件 {id}<span>下载</span></button>)}</div>}{current.kind === "workflow" ? <div className="course-workflow"><div><GraduationCap size={30} weight="duotone" /><h3>进入课程绑定工作流</h3><p>本次生成会校验课程允许的模型与账户额度，完成后自动记录为学习成果。</p></div><CreationConsole models={models.filter((model) => !current.modelIds?.length || current.modelIds.includes(model.id))} initialWorkflow={{ id: current.workflowId, title: current.title }} onTaskCreated={(task) => { onTaskCreated(task); if (!task.error) onProgress(content.id, { ...content.progress, lastStepId: current.id }); }} /></div> : <div className="lesson-body"><BookOpenText size={38} weight="thin" /><h3>学习内容</h3><p>这里承载教师编辑的图文、视频、PDF 和课堂任务。当前演示已打通步骤、附件和进度接口。</p></div>}<button className="complete-step" onClick={completeStep} disabled={completed.has(current.id)}>{completed.has(current.id) ? "本步骤已完成" : "完成本步骤"}<ArrowRight size={17} /></button></section></div></main>;
}

function Workflows({ items, onOpen }) {
  return <main className="cream-page"><section className="page-banner page-banner--dark"><div><p>// LEARNING PATH</p><h1>工作流学院</h1><span>从提示词到最终输出，跟随结构化步骤完成一次真正的 AI 艺术创作。</span></div><div className="banner-stat"><strong>03</strong><span>条精选路径</span></div></section><section className="workflow-intro"><p>// 精选学习项目</p><h2>跟着项目路径，掌握 AI 创作技能</h2></section><div className="workflow-grid workflow-grid--page">{items.map(item => <WorkflowCard key={item.id} item={item} onOpen={onOpen} />)}</div></main>;
}

function WorkflowDetail({ workflow, models, onClose, onTaskCreated }) {
  if (!workflow) return null;
  return <main className="workflow-detail"><button className="back-button" onClick={onClose}>← 返回工作流</button><div className="workflow-detail__layout"><section><div className="detail-heading"><p>// 完整步骤拆解 · {workflow.steps.length} 步完成</p><h1>{workflow.title}</h1><span>展开每步查看详细 Prompt、参数与截图，按顺序完成创作。</span></div>{workflow.steps.map((step,index) => <article className="step-card" key={step}><header><b>{index+1}</b><strong>STEP 0{index+1} — {step}</strong><span>{index === 0 ? "GPT-4o" : "Flux.1-dev"}<CaretDown size={14} /></span></header><div className="step-card__content"><div className="step-icon">{index === 0 ? <Sparkle size={42} weight="duotone" /> : <ImageSquare size={42} weight="duotone" />}</div><div><p>{index === 0 ? "将创作主题拆解为核心意象词、色调方向与风格参照，让模型先完成结构化创意规划。" : "延续上一步输出，以统一视觉语言生成候选方案，并记录关键参数用于后续调整。"}</p><pre>// PROMPT\n{index === 0 ? "分析创作主题，输出意象、色彩、材质与构图建议" : `根据「${step}」生成四组可比较的艺术方向`}</pre></div></div></article>)}</section><aside><div className="workflow-summary"><p>// 当前工作流</p><h2>{workflow.title}</h2><span>{workflow.steps.length} 步 · 约 {workflow.duration} min · {workflow.users} 人使用</span><ol>{workflow.steps.map((step,index) => <li key={step}><b>{index+1}</b>{step}</li>)}</ol></div><CreationConsole models={models} initialWorkflow={workflow} onTaskCreated={onTaskCreated} /></aside></div></main>;
}

function SubmitModal({ open, models, onClose, onSubmitted }) {
  const [form, setForm] = useState({ title: "", prompt: "", model: models[0]?.name || "GPT-4o", kind: "案例投稿" });
  if (!open) return null;
  const submit = async e => { e.preventDefault(); try { const result = await api("/resources/submissions", { method: "POST", body: JSON.stringify(form) }); onSubmitted(result); onClose(); } catch (error) { onSubmitted({ error: error.message }); } };
  return <div className="modal-layer"><button className="modal-scrim" onClick={onClose} aria-label="关闭" /><form className="submit-modal" onSubmit={submit}><header><div><p>// CASE SUBMISSION</p><h2>提交作品到资源库</h2></div><button type="button" onClick={onClose}><X size={20} /></button></header><label>作品标题<input required minLength={2} value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="例如：生成式纹样实验" /></label><label>创作说明与 Prompt<textarea required minLength={4} value={form.prompt} onChange={e => setForm({...form,prompt:e.target.value})} placeholder="说明作品主题、方法和使用的提示词……" /></label><div className="form-grid"><label>模型<select value={form.model} onChange={e => setForm({...form,model:e.target.value})}>{models.map(model => <option key={model.id}>{model.name}</option>)}</select></label><label>资源类型<select value={form.kind} onChange={e => setForm({...form,kind:e.target.value})}><option>案例投稿</option><option>工作流案例</option><option>课程作业</option></select></label></div><div className="submit-note"><Check size={19} weight="bold" /><span>提交后由机器预审与平台管理员复核，通过后公开到资源库。</span></div><button className="modal-submit">提交审核 <ArrowRight size={17} /></button></form></div>;
}

function Toast({ state, onClose }) {
  if (!state) return null;
  return <div className={`toast ${state.error ? "is-error" : ""}`}><div>{state.error ? <X size={19} /> : <Check size={19} />}</div><p><strong>{state.error ? "操作未完成" : state.id?.startsWith("TASK") ? "创作任务已进入队列" : "提交成功"}</strong><span>{state.error || (state.id?.startsWith("TASK") ? `${state.id} · 正在由模型处理` : "作品已进入管理员审核队列")}</span></p><button onClick={onClose}><X size={16} /></button></div>;
}

export function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "home");
  const [models, setModels] = useState(fallbackModels);
  const [resources, setResources] = useState(fallbackResources);
  const [workflows, setWorkflows] = useState(fallbackWorkflows);
  const [subjects, setSubjects] = useState(fallbackSubjects);
  const [learning, setLearning] = useState(fallbackLearning);
  const [quota, setQuota] = useState(null);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [activeContent, setActiveContent] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [toast, setToast] = useState(null);
  useEffect(() => { Promise.allSettled([api("/models"), api("/resources"), api("/workflows"), api("/me/quota"), api("/subjects"), api("/courses")]).then(([m,r,w,q,s,c]) => { if (m.status === "fulfilled") setModels(m.value.items); if (r.status === "fulfilled") setResources(r.value.items.map((item,index) => ({...item, asset: fallbackResources[index % fallbackResources.length].asset}))); if (w.status === "fulfilled") setWorkflows(w.value.items); if (q.status === "fulfilled") setQuota(q.value); if (s.status === "fulfilled") setSubjects(s.value.items); if (c.status === "fulfilled") setLearning(c.value.items); }); }, []);
  const openWorkflow = workflow => { setActiveWorkflow(workflow); window.scrollTo({top:0,behavior:"smooth"}); };
  const openContent = async item => { try { const detail = await api(`/courses/${item.id}`); if (!detail.progress) detail.progress = await api(`/courses/${item.id}/enroll`, { method: "POST" }); setActiveContent(detail); } catch { setActiveContent(item); } window.scrollTo({top:0,behavior:"smooth"}); };
  const updateLearningProgress = (contentId, progress) => { setLearning((items) => items.map((item) => item.id === contentId ? { ...item, progress } : item)); setActiveContent((item) => item?.id === contentId ? { ...item, progress } : item); };
  const navigate = next => { setPage(next); setActiveWorkflow(null); setActiveContent(null); window.scrollTo({top:0,behavior:"smooth"}); };
  return <div className="app-shell"><Header page={page} setPage={navigate} quota={quota} onOpenCreate={() => setSubmitOpen(true)} searchQuery={searchQuery} onSearch={setSearchQuery} />{activeContent ? <CourseDetail content={activeContent} models={models} onClose={() => setActiveContent(null)} onProgress={updateLearningProgress} onTaskCreated={setToast} /> : activeWorkflow ? <WorkflowDetail workflow={activeWorkflow} models={models} onClose={() => setActiveWorkflow(null)} onTaskCreated={setToast} /> : <>{page === "home" && <Home models={models} resources={resources} workflows={workflows} setPage={navigate} onOpenWorkflow={openWorkflow} onTaskCreated={setToast} />}{page === "resources" && <LearningLibrary subjects={subjects} contents={learning} query={searchQuery} onQueryChange={setSearchQuery} onOpen={openContent} onOpenSubmit={() => setSubmitOpen(true)} />}{page === "workflows" && <Workflows items={workflows} onOpen={openWorkflow} />}</>}<SubmitModal open={submitOpen} models={models} onClose={() => setSubmitOpen(false)} onSubmitted={setToast} /><Toast state={toast} onClose={() => setToast(null)} /></div>;
}
