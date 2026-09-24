import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, FlowArrow, Path, Play, Plus, SpinnerGap } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { createWork, getWorkflow, getWorkflows, startWorkflowRun, updateWorkflowRun } from "./services/adminApi.js";

const WorkflowAdmin = lazy(() => import("./WorkflowAdmin.jsx").then(({ WorkflowAdmin: component }) => ({ default: component })));
const nodeStyle = { input: "#4b87ff", prompt: "#b268ff", skill: "#d6b335", model: "#ff8b4b", preview: "#42b883", note: "#78859b" };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}>
    <Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" />
    <div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "提示词" : data.nodeType === "skill" ? "内置 Skill" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div>
    <strong>{data.label}</strong><small>{data.description}</small>
    <Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" />
  </div>;
}

const nodeTypes = { input: GraphNode, prompt: GraphNode, skill: GraphNode, model: GraphNode, preview: GraphNode, note: GraphNode };

export function WorkflowStudio({ initialWorkflowId, onNotice, canPublish = false }) {
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
  const completeNode = async () => {
    setLoading(true);
    try { const next = await updateWorkflowRun(run.id, { stepIndex: run.currentStep, action: "complete" }); setRun(next); onNotice(next.status === "completed" ? "节点工作流已完成" : "当前节点已完成，正在进入下一节点"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  if (selected) return <WorkflowRunner selected={selected} run={run} loading={loading} onBack={() => { setSelected(null); setRun(null); }} onStart={start} onComplete={completeNode} onNotice={onNotice} />;
  if (builderOpen) return <div className="workflow-builder-entry">
    <button className="learning-back" onClick={() => setBuilderOpen(false)}><ArrowLeft size={16} weight="bold" /> 返回设计工作台</button>
    <Suspense fallback={<section className="portal-empty"><p>正在加载工作流创建器…</p></section>}>
      <WorkflowAdmin showToast={onNotice} canPublish={canPublish} />
    </Suspense>
  </div>;
  return <section className="workflow-catalog"><header className="workflow-catalog__toolbar"><div><p>// CREATE AND LEARN</p><h2>创建或使用节点工作流</h2><span>登录用户都可以搭建自己的节点图，保存为个人草稿版本。</span></div><button className="primary-button" disabled={loading} onClick={() => setBuilderOpen(true)}><Plus size={18} weight="bold" /> 新建节点工作流</button></header>{workflows.map((workflow, index) => <article key={workflow.id}><div className={`workflow-catalog__cover workflow-catalog__cover--${index % 3}`}><FlowArrow size={36} weight="thin" /><span>{workflow.stepCount ?? "—"} NODES</span></div><div><small>{workflow.category}</small><h3>{workflow.name}</h3><p>{workflow.description}</p><button disabled={loading} onClick={() => open(workflow)}>打开节点画布 <ArrowRight size={16} weight="bold" /></button></div></article>)}{!workflows.length && <div className="empty-state"><Path size={32} /><strong>暂时没有已发布的工作流</strong><span>可以先创建自己的节点工作流，保存为草稿版本。</span></div>}</section>;
}

function WorkflowRunner({ selected, run, loading, onBack, onStart, onComplete, onNotice }) {
  const steps = run?.steps ?? selected.steps ?? [];
  const activeStep = run?.status === "in_progress" ? steps[run.currentStep] : null;
  const activeId = activeStep?.id;
  const [nodePositions, setNodePositions] = useState({});
  const [savedWork, setSavedWork] = useState(false);
  const [savingWork, setSavingWork] = useState(false);

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
  const saveAsWork = async () => {
    setSavingWork(true);
    try {
      const nodes = selected.nodes ?? [];
      const tools = [...new Set(nodes.filter(node => node.type === "model" || node.type === "skill").map(node => node.data?.label).filter(Boolean))].slice(0, 12);
      const methods = selected.category ? [selected.category] : [];
      const saved = await createWork({
        title: `${selected.name} · 我的工作流实践`,
        summary: `通过「${selected.name}」完成的一次工作流实践。可继续编辑案例内容、补充封面与过程素材后提交审核。`,
        discipline: selected.category || "艺术创作",
        workflowIds: [selected.id],
        tagNames: [...new Set([selected.category, ...tools].filter(Boolean))].slice(0, 12),
        story: {
          version: 1, origin: "platform", creators: [], tools, methods,
          authorization: "confirmed", authorizationNote: "平台工作流实践产生的个人作品草稿。",
          allowDocumentDownload: false, coverAssetId: "", reflection: "",
          steps: nodes.slice(0, 20).map(node => ({
            title: node.data?.label || "工作流步骤",
            description: node.data?.description || "",
            prompt: node.type === "prompt" ? node.data?.value || "" : "",
            tool: node.type === "model" || node.type === "skill" ? node.data?.label || "" : "",
            parameters: node.data?.parameterDescription || node.data?.value || "",
            outcome: node.data?.exampleOutput || "",
            assetIds: [],
          })),
        },
      });
      setSavedWork(true);
      onNotice(`已保存为案例草稿「${saved.title}」，可到案例社区补充作品封面与实际成果`);
    } catch (error) { onNotice(error.message); }
    finally { setSavingWork(false); }
  };
  return <section className="workflow-player workflow-graph-runner">
    <button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流</button>
    <header><div><span>{selected.category} · V{selected.versionNumber ?? 1} · 节点画布</span><h2>{selected.name}</h2><p>{selected.description}</p><small className="workflow-canvas-hint">可直接拖动节点调整本次查看的画布布局。</small></div><aside><strong>{selected.nodes?.length ?? selected.stepCount ?? 0}</strong><span>个节点</span></aside></header>
    <div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? "全部完成" : `${progress}%`}</span></div>
    <div className="workflow-run-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesDraggable nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} onNodesChange={onNodesChange}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
    {!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={45} weight="thin" /><strong>准备运行节点工作流</strong><p>画布展示已发布的连接关系；开始后按教学节点记录进度。模型节点当前只做本地结构演示，不调用外部算力。</p><button disabled={loading || !selected.versionId} onClick={onStart}><Play size={18} weight="fill" /> 开始工作流</button>{!selected.versionId && <small>该工作流还没有发布版本</small>}</div>}
    {run?.status === "in_progress" && activeStep && <article className="workflow-step workflow-step--node"><span>NODE {String(run.currentStep + 1).padStart(2, "0")} / {run.totalSteps}</span><h3>{activeStep.title}</h3><p>{activeStep.description}</p>{activeStep.instruction && <div><small>// 操作说明</small>{activeStep.instruction}</div>}{activeStep.exampleInput && <div><small>// 示例输入</small><pre>{activeStep.exampleInput}</pre></div>}{activeStep.parameterDescription && <div><small>// 参数说明</small>{activeStep.parameterDescription}</div>}{activeStep.exampleOutput && <div><small>// 示例输出</small><pre>{activeStep.exampleOutput}</pre></div>}<footer><em><Clock size={16} /> 约 {activeStep.estimatedMinutes ?? 10} 分钟</em><button disabled={loading} onClick={onComplete}>{loading ? <SpinnerGap className="spin" /> : <CheckCircle size={18} weight="fill" />} 完成当前节点</button></footer></article>}
    {run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={54} weight="fill" /><strong>节点工作流已完成</strong><p>步骤、示例和参数说明已随本次学习记录保留。可以把工作流过程保存为案例草稿，再补充自己的实际成果。</p><button className="primary-button" disabled={savingWork || savedWork} onClick={saveAsWork}>{savedWork ? <CheckCircle size={17} /> : <Plus size={17} />} {savingWork ? "正在保存…" : savedWork ? "已保存到我的案例草稿" : "保存为我的作品"}</button></div>}
  </section>;
}
