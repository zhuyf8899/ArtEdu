import { useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, FlowArrow, Path, Play, SpinnerGap } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { getWorkflow, getWorkflows, startWorkflowRun, updateWorkflowRun } from "./services/adminApi.js";

const nodeStyle = { input: "#4b87ff", prompt: "#b268ff", model: "#ff8b4b", preview: "#42b883", note: "#78859b" };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}>
    <Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" />
    <div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "提示词" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div>
    <strong>{data.label}</strong><small>{data.description}</small>
    <Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" />
  </div>;
}

const nodeTypes = { input: GraphNode, prompt: GraphNode, model: GraphNode, preview: GraphNode, note: GraphNode };

export function WorkflowStudio({ onNotice }) {
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getWorkflows().then((payload) => setWorkflows(payload.items ?? [])).catch((error) => onNotice(error.message)); }, []);

  const open = async (workflow) => {
    setLoading(true);
    try { setSelected(await getWorkflow(workflow.id)); setRun(null); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
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

  if (selected) return <WorkflowRunner selected={selected} run={run} loading={loading} onBack={() => { setSelected(null); setRun(null); }} onStart={start} onComplete={completeNode} />;
  return <section className="workflow-catalog">{workflows.map((workflow, index) => <article key={workflow.id}><div className={`workflow-catalog__cover workflow-catalog__cover--${index % 3}`}><FlowArrow size={36} weight="thin" /><span>{workflow.stepCount ?? "—"} NODES</span></div><div><small>{workflow.category}</small><h3>{workflow.name}</h3><p>{workflow.description}</p><button disabled={loading} onClick={() => open(workflow)}>打开节点画布 <ArrowRight size={16} weight="bold" /></button></div></article>)}{!workflows.length && <div className="empty-state"><Path size={32} /><strong>暂时没有已发布的工作流</strong><span>请由管理员在工作流管理中创建并发布。</span></div>}</section>;
}

function WorkflowRunner({ selected, run, loading, onBack, onStart, onComplete }) {
  const steps = run?.steps ?? selected.steps ?? [];
  const activeStep = run?.status === "in_progress" ? steps[run.currentStep] : null;
  const activeId = activeStep?.id;
  const nodes = useMemo(() => (selected.nodes ?? []).map((node) => ({ ...node, data: { ...node.data, nodeType: node.type, isActive: node.id === activeId, isComplete: Boolean(run && steps.slice(0, run.currentStep).some((step) => step.id === node.id)) } })), [selected.nodes, activeId, run, steps]);
  const edges = useMemo(() => (selected.edges ?? []).map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [selected.edges]);
  const progress = run?.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
  return <section className="workflow-player workflow-graph-runner">
    <button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流</button>
    <header><div><span>{selected.category} · V{selected.versionNumber ?? 1} · 节点画布</span><h2>{selected.name}</h2><p>{selected.description}</p></div><aside><strong>{selected.nodes?.length ?? selected.stepCount ?? 0}</strong><span>个节点</span></aside></header>
    <div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? "全部完成" : `${progress}%`}</span></div>
    <div className="workflow-run-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnDoubleClick={false}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
    {!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={45} weight="thin" /><strong>准备运行节点工作流</strong><p>画布展示已发布的连接关系；开始后按教学节点记录进度。模型节点当前只做本地结构演示，不调用外部算力。</p><button disabled={loading || !selected.versionId} onClick={onStart}><Play size={18} weight="fill" /> 开始工作流</button>{!selected.versionId && <small>该工作流还没有发布版本</small>}</div>}
    {run?.status === "in_progress" && activeStep && <article className="workflow-step workflow-step--node"><span>NODE {String(run.currentStep + 1).padStart(2, "0")} / {run.totalSteps}</span><h3>{activeStep.title}</h3><p>{activeStep.description}</p>{activeStep.instruction && <div><small>// 操作说明</small>{activeStep.instruction}</div>}<footer><em><Clock size={16} /> 约 {activeStep.estimatedMinutes ?? 10} 分钟</em><button disabled={loading} onClick={onComplete}>{loading ? <SpinnerGap className="spin" /> : <CheckCircle size={18} weight="fill" />} 完成当前节点</button></footer></article>}
    {run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={54} weight="fill" /><strong>节点工作流已完成</strong><p>本次节点进度已经保存；可把成果整理后发布到案例社区。</p></div>}
  </section>;
}
