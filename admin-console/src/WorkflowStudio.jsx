import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, FlowArrow, LinkSimple, Path, Play, Plus, SpinnerGap, Wrench } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { createToolDirectoryLink, executeWorkflowRun, getToolDirectoryLinks, getWorkflow, getWorkflows, startWorkflowRun } from "./services/adminApi.js";

const WorkflowAdmin = lazy(() => import("./WorkflowAdmin.jsx").then(({ WorkflowAdmin: component }) => ({ default: component })));
const nodeStyle = { input: "#4b87ff", load_image: "#4b87ff", prompt: "#b268ff", text_encode: "#b268ff", skill: "#b268ff", load_checkpoint: "#ff8b4b", lora: "#ff8b4b", controlnet: "#ff8b4b", model: "#ff8b4b", empty_latent: "#d6b335", ksampler: "#d6b335", vae_decode: "#d6b335", upscale: "#d6b335", preview: "#42b883", save_image: "#42b883", note: "#78859b" };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}>
    <Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" />
    <div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "提示词" : data.nodeType === "skill" ? "内置 Skill" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div>
    <strong>{data.label}</strong><small>{data.description}</small>
    <Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" />
  </div>;
}

const nodeTypes = Object.fromEntries(Object.keys(nodeStyle).map((type) => [type, GraphNode]));

const TOOL_DIRECTORY = [
  { group: "界面与版式", items: [
    { name: "Figma", detail: "协作界面与原型设计", href: "https://www.figma.com/" },
    { name: "Canva", detail: "版式、海报与演示设计", href: "https://www.canva.com/" },
    { name: "Photopea", detail: "浏览器内图片编辑", href: "https://www.photopea.com/" },
  ] },
  { group: "灵感与素材", items: [
    { name: "Behance", detail: "查看设计作品与案例", href: "https://www.behance.net/" },
    { name: "Unsplash", detail: "寻找可用视觉素材", href: "https://unsplash.com/" },
  ] },
  { group: "平台工具", items: [
    { name: "AI 创作助手", detail: "生成图像、网页或文档草稿", href: "/create", internal: true },
    { name: "案例社区", detail: "查看优秀案例与复用方法", href: "/community", internal: true },
    { name: "课程中心", detail: "学习课程与阅读课件", href: "/learning", internal: true },
  ] },
];

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

  if (selected) return <WorkflowRunner selected={selected} run={run} loading={loading} onBack={() => { setSelected(null); setRun(null); }} onStart={start} onExecute={executeNode} />;
  if (builderOpen) return <div className="workflow-builder-entry">
    <button className="learning-back" onClick={() => setBuilderOpen(false)}><ArrowLeft size={16} weight="bold" /> 返回设计工作台</button>
    <Suspense fallback={<section className="portal-empty"><p>正在加载工作流创建器…</p></section>}>
      <WorkflowAdmin showToast={onNotice} canPublish={canPublish} />
    </Suspense>
  </div>;
  return <section className="workflow-catalog"><header className="workflow-catalog__toolbar"><div><p>// CREATE AND LEARN</p><h2>创建或使用节点工作流</h2><span>登录用户都可以搭建自己的节点图，保存为个人草稿版本。</span></div><button className="primary-button" disabled={loading} onClick={() => setBuilderOpen(true)}><Plus size={18} weight="bold" /> 新建节点工作流</button></header><ToolDirectory canManage={canManageToolDirectory} onNotice={onNotice} />{workflows.map((workflow, index) => <article key={workflow.id}><div className={`workflow-catalog__cover workflow-catalog__cover--${index % 3}`}><FlowArrow size={36} weight="thin" /><span>{workflow.stepCount ?? "—"} NODES</span></div><div><small>{workflow.category}</small><h3>{workflow.name}</h3><p>{workflow.description}</p><button disabled={loading} onClick={() => open(workflow)}>打开节点画布 <ArrowRight size={16} weight="bold" /></button></div></article>)}{!workflows.length && <div className="empty-state"><Path size={32} /><strong>暂时没有已发布的工作流</strong><span>可以先创建自己的节点工作流，保存为草稿版本。</span></div>}</section>;
}

function ToolDirectory({ canManage, onNotice }) {
  const [customLinks, setCustomLinks] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "", name: "", detail: "", href: "https://" });

  useEffect(() => { getToolDirectoryLinks().then((payload) => setCustomLinks(payload.items ?? [])).catch((error) => onNotice(error.message)); }, [onNotice]);
  const groups = useMemo(() => {
    const merged = new Map(TOOL_DIRECTORY.map(({ group, items }) => [group, [...items]]));
    customLinks.forEach((item) => merged.set(item.category, [...(merged.get(item.category) ?? []), item]));
    return [...merged.entries()].map(([group, items]) => ({ group, items }));
  }, [customLinks]);
  const submit = async (event) => {
    event.preventDefault(); setSaving(true);
    try { const item = await createToolDirectoryLink(form); setCustomLinks((current) => [...current, item]); setEditorOpen(false); setForm({ category: "", name: "", detail: "", href: "https://" }); onNotice("工具栏目已添加，所有登录用户现在都能看到。"); }
    catch (error) { onNotice(error.message); } finally { setSaving(false); }
  };
  return <section className="tool-directory" aria-labelledby="tool-directory-title"><header><div><p>// DESIGN TOOLBOX</p><h3 id="tool-directory-title"><Wrench size={18} weight="bold" /> 设计工具入口</h3><span>按栏目浏览工具；外部网站在新窗口打开，平台功能留在当前站内。</span></div>{canManage && <button className="outline-button tool-directory__manage" onClick={() => setEditorOpen((open) => !open)}><Plus size={16} weight="bold" /> 添加栏目链接</button>}</header>{editorOpen && <form className="tool-directory__editor" onSubmit={submit}><label>栏目名称<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="例如：三维与动效" /></label><label>工具名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：Blender" /></label><label>用途说明<input required value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} placeholder="一句话说明使用场景" /></label><label>网址<input required type="url" value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} /></label><button className="primary-button" disabled={saving}>{saving ? "正在保存…" : "保存并发布入口"}</button></form>}<div className="tool-directory__groups">{groups.map(({ group, items }) => <div key={group}><strong>{group}</strong>{items.map((tool) => <a key={tool.id ?? tool.name} href={tool.href} target={tool.internal ? undefined : "_blank"} rel={tool.internal ? undefined : "noopener noreferrer"}><span><b>{tool.name}</b><small>{tool.detail}</small></span><LinkSimple size={17} weight="bold" /></a>)}</div>)}</div></section>;
}

function WorkflowRunner({ selected, run, loading, onBack, onStart, onExecute }) {
  const steps = run?.steps ?? selected.steps ?? [];
  const activeStep = run?.status === "in_progress" ? steps[run.currentStep] : null;
  const activeId = activeStep?.id;
  const [nodePositions, setNodePositions] = useState({});

  useEffect(() => { setNodePositions({}); }, [selected.id]);

  const onNodesChange = useCallback((changes) => {
    setNodePositions((current) => {
      let next = current;
      for (const change of changes) {
        if (change.type !== "position" || !change.position) continue;
        if (next === current) next = { ...current };
        next[change.id] = change.position;
      }
      return next;
    });
  }, []);

  const nodes = useMemo(() => (selected.nodes ?? []).map((node) => ({ ...node, position: nodePositions[node.id] ?? node.position, data: { ...node.data, nodeType: node.type, isActive: node.id === activeId, isComplete: Boolean(run && steps.slice(0, run.currentStep).some((step) => step.id === node.id)) } })), [selected.nodes, nodePositions, activeId, run, steps]);
  const edges = useMemo(() => (selected.edges ?? []).map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [selected.edges]);
  const progress = run?.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
  return <section className="workflow-player workflow-graph-runner">
    <button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流</button>
    <header><div><span>{selected.category} · V{selected.versionNumber ?? 1} · 节点画布</span><h2>{selected.name}</h2><p>{selected.description}</p><small className="workflow-canvas-hint">可直接拖动节点调整本次查看的画布布局。</small></div><aside><strong>{selected.nodes?.length ?? selected.stepCount ?? 0}</strong><span>个节点</span></aside></header>
    <div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? "全部完成" : `${progress}%`}</span></div>
    <div className="workflow-run-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesDraggable nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} onNodesChange={onNodesChange}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
    {!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={45} weight="thin" /><strong>准备运行节点工作流</strong><p>开始后每个节点会写入运行上下文；KSampler 通过平台统一图片 API 发起真实生成。</p><button disabled={loading || !selected.versionId} onClick={onStart}><Play size={18} weight="fill" /> 开始工作流</button>{!selected.versionId && <small>该工作流还没有发布版本</small>}</div>}
    {run?.status === "in_progress" && activeStep && <NodeExecutionPanel step={activeStep} node={selected.nodes?.find((item) => item.id === activeStep.id)} output={run.context?.nodeResults?.[activeStep.id]} loading={loading} onExecute={onExecute} />}
    {run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={54} weight="fill" /><strong>节点工作流已完成</strong><p>本次节点进度已经保存；可把成果整理后发布到案例社区。</p></div>}
  </section>;
}

function NodeExecutionPanel({ step, node, output, loading, onExecute }) {
  const [prompt, setPrompt] = useState("");
  const needsPrompt = node?.type === "input";
  return <article className="workflow-step workflow-step--node"><span>NODE · {node?.type || "note"} · {step.title}</span><h3>{step.title}</h3><p>{step.description}</p>{step.instruction && <div><small>// 节点参数</small>{step.instruction}</div>}{needsPrompt && <label className="workflow-run-prompt">本次需求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入本次要生成或处理的内容" /></label>}{output && <pre className="workflow-node-output">{JSON.stringify(output, null, 2)}</pre>}<footer><em><Clock size={16} /> 约 {step.estimatedMinutes ?? 10} 分钟</em><button disabled={loading || (needsPrompt && !prompt.trim())} onClick={() => onExecute(prompt.trim())}>{loading ? <SpinnerGap className="spin" /> : <Play size={18} weight="fill" />} 执行当前节点</button></footer></article>;
}
