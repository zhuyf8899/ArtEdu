import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Code, ImageSquare, Lightbulb, LinkSimple, ListBullets, Palette, Path, PencilSimple, Plus, Robot, SquaresFour, Wrench } from "@phosphor-icons/react";
import { ComfyCanvas } from './ComfyCanvas.jsx';
import { createToolDirectoryLink, executeWorkflowRun, getManagedToolDirectoryLinks, getToolDirectoryLinks, getWorkflow, getWorkflowRun, getWorkflows, startWorkflowRun, updateToolDirectoryLink } from "./services/adminApi.js";
import { faviconSourcesFor } from "./imageSources.js";

const WorkflowAdmin = lazy(() => import("./WorkflowAdmin.jsx").then(({ WorkflowAdmin: component }) => ({ default: component })));
const WorkflowRunner = lazy(() => import("./WorkflowRunner.jsx").then(({ WorkflowRunner: component }) => ({ default: component })));

const TOOL_ICONS = { design: Palette, image: ImageSquare, idea: Lightbulb, learning: Path, ai: Robot, code: Code, link: LinkSimple };
const emptyToolForm = () => ({ category: "", name: "", detail: "", href: "https://", coverImageUrl: "", iconKey: "link", launchMode: "new_tab", featured: false, status: "active" });

/**
 * 工作流自己是否带着提示词。带着的话，「创作需求」输入节点只是"可选需求"：
 * 使用者什么都不填也该能一键出图；整条链路一句提示词都没有时才需要停下来问一句。
 */
const PROMPT_NODE_TYPES = ["prompt", "text_encode", "skill"];
const nodesCarryPrompt = (nodes = []) => nodes.some((node) => PROMPT_NODE_TYPES.includes(node.type) && String(node.data?.value ?? "").trim());

export function WorkflowStudio({ initialWorkflowId, initialRunId = "", onNotice, canPublish = false, canManageToolDirectory = false }) {
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [autoError, setAutoError] = useState("");
  const advancing = useRef("");

  // 目录带 includeDrafts：作者在这里就能看到自己的草稿并直接试运行，不用先发布。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { getWorkflows("", { includeDrafts: true }).then((payload) => setWorkflows(payload.items ?? [])).catch((error) => onNotice(error.message)); }, []);

  const open = async (workflow) => {
    setLoading(true);
    try {
      const detail = await getWorkflow(workflow.id);
      const previous = initialRunId ? await getWorkflowRun(initialRunId) : null;
      if (previous && previous.workflowId !== detail.id) throw new Error("执行记录与工作流不匹配");
      setSelected(detail);
      setRun(null);
      setAutoError("");
      const next = previous ?? (detail.versionId && detail.definition?.engine !== "comfyui" ? await startWorkflowRun(detail.id) : null);
      setRun(next);
    }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!initialWorkflowId || selected || loading || !workflows.length) return;
    const workflow = workflows.find((item) => item.id === initialWorkflowId);
    if (workflow) void open(workflow);
  }, [initialWorkflowId, loading, selected, workflows]);
  const start = async () => {
    setLoading(true);
    try { const next = await startWorkflowRun(selected.id); setAutoError(""); setRun(next); onNotice("工作流已开始，节点进度会自动保存"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  const executeNode = async (input = {}) => {
    setLoading(true);
    try { const next = await executeWorkflowRun(run.id, input); setAutoError(""); setRun(next); onNotice(next.status === "completed" ? "节点工作流已完成" : "节点已执行，正在进入下一节点"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!run || !selected || loading || autoError || run.status !== "in_progress") return;
    const step = run.steps[run.currentStep];
    const node = run.nodes.find((item) => item.id === step?.id);
    // 一键跑到底：整条链路自己往下走，直到出图，不再让人一个节点一个节点点。
    // 正向/负向提示词都直接读节点里配好的默认值。
    // 只有「非现场给不可」的两种情况才停下来：要上传的参考图片；
    // 以及整条链路里一句提示词都没有时，创作需求必须问一句（否则没东西可生成）。
    if (run.context?.engine === "comfyui" || !node || node.type === "load_image") return;
    if (node.type === "input" && !String(node.data?.value ?? "").trim() && !nodesCarryPrompt(run.nodes)) return;
    const key = `${run.id}:${run.currentStep}`;
    if (advancing.current === key) return;
    advancing.current = key;
    setLoading(true);
    executeWorkflowRun(run.id).then((next) => setRun(next)).catch((error) => {
      setAutoError(error.message || "节点运行失败");
      onNotice(error.message);
    }).finally(() => setLoading(false));
  }, [run, selected, loading, autoError, onNotice]);

  if (selected?.definition?.engine === 'comfyui') return <ComfyCanvas readOnly editor={{name:selected.name,definition:selected.definition}} selected={selected} onNotice={onNotice} onBack={()=>{setSelected(null);setRun(null);}} />;
  if (selected) return <Suspense fallback={<section className="portal-empty"><p>正在加载工作流画布…</p></section>}><WorkflowRunner selected={selected} run={run} loading={loading} autoError={autoError} onNotice={onNotice} onRetry={() => { advancing.current = ""; setAutoError(""); }} onBack={() => { setSelected(null); setRun(null); setAutoError(""); }} onStart={start} onExecute={executeNode} /></Suspense>;
  if (builderOpen) return <div className="workflow-builder-entry">
    <button className="learning-back" onClick={() => setBuilderOpen(false)}><ArrowLeft size={16} weight="bold" /> 返回设计工具</button>
    <Suspense fallback={<section className="portal-empty"><p>正在加载工作流创建器…</p></section>}>
      <WorkflowAdmin showToast={onNotice} canPublish={canPublish} />
    </Suspense>
  </div>;
  return <section className="workflow-catalog" id="workflow-catalog">
    <ToolDirectory canManage={canManageToolDirectory} onNotice={onNotice} onOpenWorkflowBuilder={() => setBuilderOpen(true)} />
    {/* 工具入口之后必须有节点工作流列表：之前这一块被工具目录挤掉了，学生根本点不进工作流。 */}
    <div className="workflow-catalog__list">
      <header className="workflow-catalog__toolbar">
        <div><p>// NODE WORKFLOWS</p><h2>节点工作流</h2><span>点开就是独立画布：正向/负向提示词直接读节点里配好的内容，点一次就一路跑到出图。</span></div>
        <button className="primary-button" disabled={loading} onClick={() => setBuilderOpen(true)}><Plus size={18} weight="bold" /> 新建节点工作流</button>
      </header>
      {workflows.length ? <section className="workflow-grid">{workflows.map((workflow) => {
        // 只有作者本人能在这里看到草稿，所以「草稿」标记同时也是一次试运行的入口。
        const draft = workflow.versionPublished === false;
        return <article className={`workflow-card${draft ? " workflow-card--draft" : ""}`} key={workflow.id}>
          <Wrench size={21} weight="bold" />
          <span>{workflow.category}{draft ? " · 草稿" : ""}</span>
          <h3>{workflow.name}</h3>
          <p>{workflow.description}</p>
          <small className="workflow-card__state">{draft ? "未发布 · 只有你能试运行" : workflow.versionNumber ? `V${workflow.versionNumber} · 已发布` : "尚无保存版本"}</small>
          <button disabled={loading} onClick={() => open(workflow)}>{draft ? "草稿试运行" : "打开节点画布"} <ArrowRight size={16} weight="bold" /></button>
        </article>;
      })}</section> : <div className="empty-state"><Wrench size={28} weight="thin" /><strong>还没有节点工作流</strong><span>点右侧「新建节点工作流」搭一个：保存后你就能在这里试运行，发布后其他人也能看到。</span></div>}
    </div>
  </section>;
}
function ToolDirectory({ canManage, onNotice, onOpenWorkflowBuilder }) {
  const [links, setLinks] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyToolForm);
  const [editingId, setEditingId] = useState(null);
  const [category, setCategory] = useState("全部");
  const [viewMode, setViewMode] = useState("grid");

  const load = useCallback(() => {
    const request = canManage ? getManagedToolDirectoryLinks : getToolDirectoryLinks;
    request().then((payload) => setLinks(payload.items ?? [])).catch((error) => onNotice(error.message));
  }, [canManage, onNotice]);
  useEffect(() => { load(); }, [load]);
  const categories = useMemo(() => ["全部", ...new Set(links.filter((item) => item.status === "active").map((item) => item.category).filter(Boolean))], [links]);
  // 皮影与其它工具同属一份清单：早前它单独占一张大卡，其余工具在下面另起一段；
  // 现在全部按同一行式呈现，管理员也能像别的工具一样编辑它。
  const visibleLinks = useMemo(() => links.filter((item) => item.status === "active" && (category === "全部" || item.category === category)), [category, links]);
  const openNew = () => { setEditingId(null); setForm(emptyToolForm()); setEditorOpen(true); };
  const edit = (item) => { setEditingId(item.id); setForm({ category: item.category, name: item.name, detail: item.detail, href: item.href, coverImageUrl: item.coverImageUrl || "", iconKey: item.iconKey, launchMode: item.launchMode, featured: item.featured, status: item.status }); setEditorOpen(true); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true);
    try { const item = editingId ? await updateToolDirectoryLink(editingId, form) : await createToolDirectoryLink(form); setLinks((current) => editingId ? current.map((entry) => entry.id === item.id ? item : entry) : [...current, item]); setEditorOpen(false); setEditingId(null); setForm(emptyToolForm()); onNotice(editingId ? "工具条目已更新。" : "工具栏目已添加，所有登录用户现在都能看到。"); }
    catch (error) { onNotice(error.message); } finally { setSaving(false); }
  };
  return <section className="tool-directory" aria-label="设计工具"><header className="tool-directory__header"><div className="tool-directory__page-copy"><p>ARTEDU · DESIGN TOOLS</p><div><h1>设计工具</h1></div><small>按创作阶段选择工具；外部网站会在新标签页打开。</small></div><div className="tool-directory__actions"><div className="tool-directory__view-switch" role="group" aria-label="切换工具浏览方式"><button type="button" className={viewMode === "grid" ? "is-active" : ""} aria-label="卡片浏览" aria-pressed={viewMode === "grid"} title="卡片浏览" onClick={() => setViewMode("grid")}><SquaresFour size={17} weight="bold" /></button><button type="button" className={viewMode === "list" ? "is-active" : ""} aria-label="列表浏览" aria-pressed={viewMode === "list"} title="列表浏览" onClick={() => setViewMode("list")}><ListBullets size={18} weight="bold" /></button></div>{canManage && <button className="outline-button tool-directory__manage" onClick={openNew}><Plus size={16} weight="bold" /> 添加工具</button>}</div></header>{editorOpen && <form className="tool-directory__editor" onSubmit={submit}><label>栏目名称<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="例如：三维与动效" /></label><label>工具名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：Blender" /></label><label>用途说明<input required value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} placeholder="一句话说明使用场景" /></label><label>链接或站内路径<input required value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} placeholder="https://… 或 /learning" /></label><label>背景图地址（可选）<input value={form.coverImageUrl} onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })} placeholder="/assets/… 或 https://…" /></label><label>图标<select value={form.iconKey} onChange={(event) => setForm({ ...form, iconKey: event.target.value })}>{Object.entries({ design: "设计", image: "图片", idea: "灵感", learning: "学习", ai: "AI", code: "开发", link: "通用" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>打开方式<select value={form.launchMode} onChange={(event) => setForm({ ...form, launchMode: event.target.value })}><option value="new_tab">新标签页</option><option value="same_tab">当前页</option></select></label><label className="tool-directory__check"><input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} /> 首页推荐</label>{editingId && <label>状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">展示</option><option value="archived">下架（保留记录）</option></select></label>}<button className="primary-button" disabled={saving}>{saving ? "正在保存…" : editingId ? "保存修改" : "保存并发布入口"}</button></form>}<div className="tool-directory__toolbar" aria-label="工具分类"><span>按用途浏览</span><div>{categories.map((item) => <button type="button" className={category === item ? "is-active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><em>{visibleLinks.length} 个入口</em></div><div className={`tool-directory__list tool-directory__list--${viewMode}`}>{visibleLinks.map((tool) => <ToolDirectoryCard key={tool.id} tool={tool} canManage={canManage} onEdit={edit} onOpenWorkflowBuilder={onOpenWorkflowBuilder} />)}</div></section>;
}

/**
 * 外链工具的图标优先用目标站点自己的页标（favicon），拿不到才退回内置图标。
 * 依次尝试：站点根目录 favicon.ico → DuckDuckGo 图标服务 → Google 图标服务，
 * 全失败才显示内置矢量图标；图片请求不带来源信息，也不会带平台登录信息。
 */
function ToolSiteIcon({ href, fallback }) {
  const sources = useMemo(() => faviconSourcesFor(href), [href]);
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [href]);
  if (!sources.length || index >= sources.length) return fallback;
  return <img className="tool-directory__favicon" src={sources[index]} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setIndex((value) => value + 1)} />;
}

function ToolDirectoryCard({ tool, canManage, onEdit, onOpenWorkflowBuilder }) {
  const Icon = TOOL_ICONS[tool.iconKey] ?? LinkSimple;
  const external = tool.launchMode !== "same_tab";
  const cover = tool.coverImageUrl || ({ design: "/assets/learning/ai-design-foundations.jpg", image: "/assets/learning/traditional-patterns.jpg", idea: "/assets/learning/vibe-coding.jpg", learning: "/assets/learning/traditional-patterns.jpg", ai: "/assets/learning/ai-design-foundations.jpg", code: "/assets/learning/vibe-coding.jpg", link: "/assets/learning/ai-design-foundations.jpg" }[tool.iconKey] ?? "/assets/learning/ai-design-foundations.jpg");
  const content = <><span className="tool-directory__cover" style={{ backgroundImage: `url(${cover})` }} aria-hidden="true" /><span className="tool-directory__veil"><span className="tool-directory__icon" style={tool.coverImageUrl ? { backgroundImage: `url(${tool.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{!tool.coverImageUrl && <ToolSiteIcon href={tool.href} fallback={<Icon size={25} weight="duotone" />} />}</span><span className="tool-directory__copy"><small>{tool.category} · {tool.featured ? "推荐工具" : external ? "外部工具" : "平台功能"}</small><b>{tool.name}</b><em>{tool.detail}</em></span><span className="tool-directory__play"><span /></span></span></>;
  const isWorkflowBuilder = tool.id === "tool-directory-workflow";
  return <article className="tool-directory__card">{isWorkflowBuilder ? <button type="button" className="tool-directory__launch" onClick={onOpenWorkflowBuilder} aria-label="打开节点工作流创建器">{content}</button> : <a href={tool.href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} referrerPolicy={external ? "no-referrer" : undefined}>{content}</a>}{canManage && <button className="tool-directory__edit" onClick={() => onEdit(tool)} aria-label={`编辑 ${tool.name}`}><PencilSimple size={14} weight="bold" /><span>编辑</span></button>}</article>;
}

