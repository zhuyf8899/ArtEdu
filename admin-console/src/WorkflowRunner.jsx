import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, CheckCircle, Clock, FlowArrow, Play, SpinnerGap } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";

const nodeStyle = { input: "#4b87ff", load_image: "#4b87ff", prompt: "#b268ff", text_encode: "#b268ff", skill: "#b268ff", load_checkpoint: "#ff8b4b", lora: "#ff8b4b", controlnet: "#ff8b4b", model: "#ff8b4b", empty_latent: "#d6b335", ksampler: "#d6b335", vae_decode: "#d6b335", upscale: "#d6b335", preview: "#42b883", save_image: "#42b883", note: "#78859b" };
const fitViewOptions = { padding: 0.18, maxZoom: 1.1 };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}><Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" /><div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "提示词" : data.nodeType === "skill" ? "内置 Skill" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div><strong>{data.label}</strong><small>{data.description}</small><Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" /></div>;
}
const nodeTypes = Object.fromEntries(Object.keys(nodeStyle).map((type) => [type, GraphNode]));

export function WorkflowRunner({ selected, run, loading, onBack, onStart, onExecute }) {
  const steps = run?.steps ?? selected.steps ?? [];
  const activeStep = run?.status === "in_progress" ? steps[run.currentStep] : null;
  const activeId = activeStep?.id;
  const [nodePositions, setNodePositions] = useState({});
  useEffect(() => { setNodePositions({}); }, [selected.id]);
  // 仅在拖拽结束后写回位置，避免鼠标移动时反复重算所有节点导致画布卡顿。
  const onNodeDragStop = useCallback((_, node) => setNodePositions((current) => ({ ...current, [node.id]: node.position })), []);
  const completedIds = useMemo(() => new Set(run ? steps.slice(0, run.currentStep).map((step) => step.id) : []), [run, steps]);
  const nodes = useMemo(() => (selected.nodes ?? []).map((node) => ({ ...node, position: nodePositions[node.id] ?? node.position, data: { ...node.data, nodeType: node.type, isActive: node.id === activeId, isComplete: completedIds.has(node.id) } })), [selected.nodes, nodePositions, activeId, completedIds]);
  const edges = useMemo(() => (selected.edges ?? []).map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [selected.edges]);
  const progress = run?.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
  return <section className="workflow-player workflow-graph-runner"><button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流</button><header><div><span>{selected.category} · V{selected.versionNumber ?? 1} · 节点画布</span><h2>{selected.name}</h2><p>{selected.description}</p><small className="workflow-canvas-hint">拖动节点后松开鼠标才会更新位置，保障画布流畅。</small></div><aside><strong>{selected.nodes?.length ?? selected.stepCount ?? 0}</strong><span>个节点</span></aside></header><div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? "全部完成" : `${progress}%`}</span></div><div className="workflow-run-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={fitViewOptions} nodesDraggable nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} onNodeDragStop={onNodeDragStop}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow></div>{!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={45} weight="thin" /><strong>准备运行节点工作流</strong><p>开始后每个节点会写入运行上下文；KSampler 通过平台统一图片 API 发起真实生成。</p><button disabled={loading || !selected.versionId} onClick={onStart}><Play size={18} weight="fill" /> 开始工作流</button>{!selected.versionId && <small>该工作流还没有发布版本</small>}</div>}{run?.status === "in_progress" && activeStep && <NodeExecutionPanel step={activeStep} node={selected.nodes?.find((item) => item.id === activeStep.id)} output={run.context?.nodeResults?.[activeStep.id]} loading={loading} onExecute={onExecute} />}{run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={54} weight="fill" /><strong>节点工作流已完成</strong><p>本次节点进度已经保存；可把成果整理后发布到案例社区。</p></div>}</section>;
}

function NodeExecutionPanel({ step, node, output, loading, onExecute }) {
  const [prompt, setPrompt] = useState("");
  const needsPrompt = node?.type === "input";
  return <article className="workflow-step workflow-step--node"><span>NODE · {node?.type || "note"} · {step.title}</span><h3>{step.title}</h3><p>{step.description}</p>{step.instruction && <div><small>// 节点参数</small>{step.instruction}</div>}{needsPrompt && <label className="workflow-run-prompt">本次需求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入本次要生成或处理的内容" /></label>}{output && <pre className="workflow-node-output">{JSON.stringify(output, null, 2)}</pre>}<footer><em><Clock size={16} /> 约 {step.estimatedMinutes ?? 10} 分钟</em><button disabled={loading || (needsPrompt && !prompt.trim())} onClick={() => onExecute(prompt.trim())}>{loading ? <SpinnerGap className="spin" /> : <Play size={18} weight="fill" />} 执行当前节点</button></footer></article>;
}
