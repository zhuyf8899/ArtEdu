import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, FlowArrow, Play, SpinnerGap } from "@phosphor-icons/react";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";
import "@xyflow/react/dist/style.css";

const nodeStyle = { input: "#4b87ff", load_image: "#4b87ff", prompt: "#b268ff", text_encode: "#b268ff", skill: "#b268ff", text_generate: "#b268ff", load_checkpoint: "#ff8b4b", lora: "#ff8b4b", controlnet: "#ff8b4b", model: "#ff8b4b", empty_latent: "#d6b335", ksampler: "#d6b335", vae_decode: "#d6b335", upscale: "#d6b335", preview: "#42b883", save_image: "#42b883", note: "#78859b" };
const fitViewOptions = { padding: 0.18, maxZoom: 1.1 };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}><Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" /><div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "提示词" : data.nodeType === "skill" ? "内置 Skill" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div><strong>{data.label}</strong><small>{data.description}</small><Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" /></div>;
}
const nodeTypes = Object.fromEntries(Object.keys(nodeStyle).map((type) => [type, GraphNode]));

export function WorkflowRunner({ selected, run, loading, onBack, onStart, onExecute, onExecuteRemaining }) {
  const steps = run?.steps ?? selected.steps ?? [];
  const activeStep = run?.status === "in_progress" ? steps[run.currentStep] : null;
  const activeId = activeStep?.id;
  const [nodePositions, setNodePositions] = useState({});
  useEffect(() => { setNodePositions({}); }, [selected.id]);
  // 仅在拖拽结束后写回位置，避免鼠标移动时反复重算所有节点导致画布卡顿。
  const onNodeDragStop = useCallback((_, node) => setNodePositions((current) => ({ ...current, [node.id]: node.position })), []);
  const completedIds = useMemo(() => new Set(run ? steps.slice(0, run.currentStep).map((step) => step.id) : []), [run, steps]);
  const versionNodes = run?.nodes ?? selected.nodes ?? [];
  const nodes = useMemo(() => versionNodes.map((node) => ({ ...node, position: nodePositions[node.id] ?? node.position, data: { ...node.data, nodeType: node.type, isActive: node.id === activeId, isComplete: completedIds.has(node.id) } })), [versionNodes, nodePositions, activeId, completedIds]);
  const edges = useMemo(() => (run?.edges ?? selected.edges ?? []).map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [run?.edges, selected.edges]);
  const progress = run?.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
  return <section className="workflow-player workflow-graph-runner"><button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流</button><header><div><span>{selected.category} · 节点画布</span><h2>{selected.name}</h2><p>{selected.description}</p></div><aside><strong>{versionNodes.length}</strong><span>个节点</span></aside></header><div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? "全部完成" : `${progress}%`}</span></div><div className="workflow-run-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={fitViewOptions} nodesDraggable nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} onNodeDragStop={onNodeDragStop}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow></div>{!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={45} weight="thin" /><strong>准备运行节点工作流</strong><p>开始后输入创作需求；模型节点会调用平台已配置的服务，结果自动保存。</p><button disabled={loading || !selected.versionId} onClick={onStart}><Play size={18} weight="fill" /> 开始工作流</button>{!selected.versionId && <small>该工作流还没有发布版本</small>}</div>}{run?.status === "in_progress" && activeStep && <><NodeExecutionPanel key={activeStep.id} step={activeStep} node={versionNodes.find((item) => item.id === activeStep.id)} output={run.context?.nodeResults?.[activeStep.id]} loading={loading} onExecute={onExecute} />{!["input", "load_image"].includes(versionNodes.find((item) => item.id === activeStep.id)?.type) && <button className="workflow-run-all" disabled={loading} onClick={onExecuteRemaining}>{loading ? "正在运行…" : "执行剩余节点"} <ArrowRight size={15} /></button>}</>}{run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={40} weight="fill" /><strong>节点工作流已完成</strong><p>模型生成记录和节点结果已保存，可从“我的学习”继续查看。</p></div>}{run?.context?.artifact?.downloadUrl && <a className="workflow-result-link" href={run.context.artifact.downloadUrl} target="_blank" rel="noreferrer">查看或下载生成图片 <ArrowRight size={16} /></a>}{run?.context?.text && <section className="workflow-result-text"><strong>生成文字</strong><p>{run.context.text}</p></section>}</section>;
}

function NodeExecutionPanel({ step, node, output, loading, onExecute }) {
  const [prompt, setPrompt] = useState("");
  const [referenceFile, setReferenceFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const needsPrompt = node?.type === "input";
  const needsReference = node?.type === "load_image";
  const execute = async () => {
    if (needsReference && !referenceFile) return;
    try {
      setUploading(true);
      const reference = needsReference ? await uploadTemporaryCreationFile(referenceFile) : null;
      setUploadError("");
      onExecute({ ...(prompt.trim() ? { prompt: prompt.trim() } : {}), ...(reference ? { referenceFileId: reference.id } : {}) });
    } catch (error) { setUploadError(error instanceof Error ? error.message : "参考图片上传失败"); }
    finally { setUploading(false); }
  };
  return <article className="workflow-step workflow-step--node"><span>NODE · {node?.type || "note"} · {step.title}</span><h3>{step.title}</h3><p>{step.description}</p>{step.instruction && <div><small>// 节点参数</small>{step.instruction}</div>}{needsPrompt && <label className="workflow-run-prompt">本次需求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入本次要生成或处理的内容" /></label>}{needsReference && <label className="workflow-reference-upload">参考图片<input type="file" disabled={uploading} accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => { setReferenceFile(event.target.files?.[0] ?? null); setUploadError(""); }} /><small>{referenceFile ? `已选择：${referenceFile.name}` : "支持 JPEG、PNG、GIF、WebP，最大 8 MB；仅在本次运行中授权使用。"}</small>{uploadError && <em>{uploadError}</em>}</label>}{output && <pre className="workflow-node-output">{JSON.stringify(output, null, 2)}</pre>}<footer><em><Clock size={16} /> 约 {step.estimatedMinutes ?? 10} 分钟</em><button disabled={loading || uploading || (needsPrompt && !prompt.trim()) || (needsReference && !referenceFile)} onClick={execute}>{loading || uploading ? <SpinnerGap className="spin" /> : <Play size={18} weight="fill" />} {uploading ? "上传参考图片…" : "执行当前节点"}</button></footer></article>;
}
