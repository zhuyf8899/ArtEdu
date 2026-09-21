import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Code, FlowArrow, ImageSquare, Lightbulb, LinkSimple, Palette, Path, PencilSimple, Plus, Robot, Wrench } from "@phosphor-icons/react";
import { createToolDirectoryLink, executeWorkflowRun, getManagedToolDirectoryLinks, getToolDirectoryLinks, getWorkflow, getWorkflows, startWorkflowRun, updateToolDirectoryLink } from "./services/adminApi.js";

const WorkflowAdmin = lazy(() => import("./WorkflowAdmin.jsx").then(({ WorkflowAdmin: component }) => ({ default: component })));
const WorkflowRunner = lazy(() => import("./WorkflowRunner.jsx").then(({ WorkflowRunner: component }) => ({ default: component })));

const TOOL_ICONS = { design: Palette, image: ImageSquare, idea: Lightbulb, learning: Path, ai: Robot, code: Code, link: LinkSimple };
const emptyToolForm = () => ({ category: "", name: "", detail: "", href: "https://", iconKey: "link", launchMode: "new_tab", featured: false, status: "active" });

export function WorkflowStudio({ initialWorkflowId, onNotice, canPublish = false, canManageToolDirectory = false }) {
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => { getWorkflows().then((payload) => setWorkflows(payload.items ?? [])).catch((error) => onNotice(error.message)); }, []);

  const open = async (workflow) => {
    setLoading(true);
    try { setSelected(await getWorkflow(workflow.id)); setRun(null); }
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
    try { const next = await startWorkflowRun(selected.id, { source: "web-node-canvas" }); setRun(next); onNotice("工作流已开始，节点进度会保存到本地数据库"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  const executeNode = async (prompt) => {
    setLoading(true);
    try { const next = await executeWorkflowRun(run.id, prompt ? { prompt } : {}); setRun(next); onNotice(next.status === "completed" ? "节点工作流已完成" : "节点已执行，正在进入下一节点"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  if (selected) return <Suspense fallback={<section className="portal-empty"><p>正在加载工作流画布…</p></section>}><WorkflowRunner selected={selected} run={run} loading={loading} onBack={() => { setSelected(null); setRun(null); }} onStart={start} onExecute={executeNode} /></Suspense>;
  if (builderOpen) return <div className="workflow-builder-entry">
    <button className="learning-back" onClick={() => setBuilderOpen(false)}><ArrowLeft size={16} weight="bold" /> 返回设计工作台</button>
    <Suspense fallback={<section className="portal-empty"><p>正在加载工作流创建器…</p></section>}>
      <WorkflowAdmin showToast={onNotice} canPublish={canPublish} />
    </Suspense>
  </div>;
  return <section className="workflow-catalog" id="workflow-catalog"><header className="workflow-catalog__toolbar"><div><p>// CREATE AND LEARN</p><h2>通用工作流</h2><span>选择案例分析或图片生成等子流程；登录用户也可以新建自己的节点图。</span></div><button className="primary-button" disabled={loading} onClick={() => setBuilderOpen(true)}><Plus size={18} weight="bold" /> 新建节点工作流</button></header><ToolDirectory canManage={canManageToolDirectory} onNotice={onNotice} />{workflows.map((workflow, index) => <article key={workflow.id}><div className={`workflow-catalog__cover workflow-catalog__cover--${index % 3}`}><FlowArrow size={36} weight="thin" /><span>{workflow.stepCount ?? "—"} NODES</span></div><div><small>{workflow.category}</small><h3>{workflow.name}</h3><p>{workflow.description}</p><button disabled={loading} onClick={() => open(workflow)}>进入子流程 <ArrowRight size={16} weight="bold" /></button></div></article>)}{!workflows.length && <div className="empty-state"><Path size={32} /><strong>暂时没有已发布的工作流</strong><span>可以先创建自己的节点工作流，保存为草稿版本。</span></div>}</section>;
}
function ToolDirectory({ canManage, onNotice }) {
  const [links, setLinks] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyToolForm);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(() => {
    const request = canManage ? getManagedToolDirectoryLinks : getToolDirectoryLinks;
    request().then((payload) => setLinks(payload.items ?? [])).catch((error) => onNotice(error.message));
  }, [canManage, onNotice]);
  useEffect(() => { load(); }, [load]);
  // 工具以纵向单列展示，栏目作为每条工具的辅助信息；学生不用先理解分组再找入口。
  const visibleLinks = useMemo(() => links.filter((item) => item.status === "active"), [links]);
  const openNew = () => { setEditingId(null); setForm(emptyToolForm()); setEditorOpen(true); };
  const edit = (item) => { setEditingId(item.id); setForm({ category: item.category, name: item.name, detail: item.detail, href: item.href, iconKey: item.iconKey, launchMode: item.launchMode, featured: item.featured, status: item.status }); setEditorOpen(true); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true);
    try { const item = editingId ? await updateToolDirectoryLink(editingId, form) : await createToolDirectoryLink(form); setLinks((current) => editingId ? current.map((entry) => entry.id === item.id ? item : entry) : [...current, item]); setEditorOpen(false); setEditingId(null); setForm(emptyToolForm()); onNotice(editingId ? "工具条目已更新。" : "工具栏目已添加，所有登录用户现在都能看到。"); }
    catch (error) { onNotice(error.message); } finally { setSaving(false); }
  };
  return <section className="tool-directory" aria-labelledby="tool-directory-title"><header><div><p>// DESIGN TOOLBOX</p><h3 id="tool-directory-title"><Wrench size={18} weight="bold" /> 设计工具入口</h3><span>统一展示平台与外部工具；外部网站将在新窗口打开。</span></div>{canManage && <button className="outline-button tool-directory__manage" onClick={openNew}><Plus size={16} weight="bold" /> 添加工具</button>}</header>{editorOpen && <form className="tool-directory__editor" onSubmit={submit}><label>栏目名称<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="例如：三维与动效" /></label><label>工具名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：Blender" /></label><label>用途说明<input required value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} placeholder="一句话说明使用场景" /></label><label>链接或站内路径<input required value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} placeholder="https://… 或 /learning" /></label><label>图标<select value={form.iconKey} onChange={(event) => setForm({ ...form, iconKey: event.target.value })}>{Object.entries({ design: "设计", image: "图片", idea: "灵感", learning: "学习", ai: "AI", code: "开发", link: "通用" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>打开方式<select value={form.launchMode} onChange={(event) => setForm({ ...form, launchMode: event.target.value })}><option value="new_tab">新标签页</option><option value="same_tab">当前页</option></select></label><label className="tool-directory__check"><input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} /> 首页推荐</label>{editingId && <label>状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">展示</option><option value="archived">下架（保留记录）</option></select></label>}<button className="primary-button" disabled={saving}>{saving ? "正在保存…" : editingId ? "保存修改" : "保存并发布入口"}</button></form>}<div className="tool-directory__list">{visibleLinks.map((tool) => <ToolDirectoryCard key={tool.id} tool={tool} canManage={canManage} onEdit={edit} />)}</div></section>;
}

function ToolDirectoryCard({ tool, canManage, onEdit }) {
  const Icon = TOOL_ICONS[tool.iconKey] ?? LinkSimple;
  const external = tool.launchMode !== "same_tab";
  return <article className="tool-directory__card"><a href={tool.href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}><span className="tool-directory__icon"><Icon size={21} weight="duotone" /></span><span><b>{tool.name}</b><small>{tool.category} · {tool.featured ? "推荐工具" : external ? "外部工具" : "平台功能"}</small><em>{tool.detail}</em></span><LinkSimple size={17} weight="bold" /></a>{canManage && <button className="tool-directory__edit" onClick={() => onEdit(tool)} aria-label={`编辑 ${tool.name}`}><PencilSimple size={15} weight="bold" /></button>}</article>;
}

