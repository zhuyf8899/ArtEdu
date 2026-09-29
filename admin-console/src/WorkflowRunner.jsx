import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, FlowArrow, Play, SpinnerGap } from "@phosphor-icons/react";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";
import { ZoomableImage } from "./ImageLightbox.jsx";
import { isImageArtifact } from "./imageSources.js";
import "@xyflow/react/dist/style.css";

const nodeStyle = { input: "#4b87ff", load_image: "#4b87ff", prompt: "#b268ff", negative_prompt: "#a15e8c", text_encode: "#b268ff", skill: "#b268ff", text_generate: "#b268ff", load_checkpoint: "#ff8b4b", lora: "#ff8b4b", controlnet: "#ff8b4b", model: "#ff8b4b", empty_latent: "#d6b335", ksampler: "#d6b335", vae_decode: "#d6b335", upscale: "#d6b335", preview: "#42b883", save_image: "#42b883", note: "#78859b" };
const fitViewOptions = { padding: 0.18, maxZoom: 1.1 };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}><Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" /><div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "正向提示词" : data.nodeType === "negative_prompt" ? "负向提示词" : data.nodeType === "skill" ? "内置 Skill" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div><strong>{data.label}</strong><small>{data.description}</small><Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" /></div>;
}
const nodeTypes = Object.fromEntries(Object.keys(nodeStyle).map((type) => [type, GraphNode]));

export function WorkflowRunner({ selected, run, loading, autoError, onRetry, onBack, onStart, onExecute, onNotice }) {
  const steps = run?.steps ?? selected.steps ?? [];
  const activeStep = run?.status === "in_progress" ? steps[run.currentStep] : null;
  const activeId = activeStep?.id;
  const [nodePositions, setNodePositions] = useState({});
  const flowRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => { setNodePositions({}); }, [selected.id]);
  // 仅在拖拽结束后写回位置，避免鼠标移动时反复重算所有节点导致画布卡顿。
  const onNodeDragStop = useCallback((_, node) => setNodePositions((current) => ({ ...current, [node.id]: node.position })), []);
  const completedIds = useMemo(() => new Set(run ? steps.slice(0, run.currentStep).map((step) => step.id) : []), [run, steps]);
  const versionNodes = run?.nodes ?? selected.nodes ?? [];
  const nodes = useMemo(() => versionNodes.map((node) => ({ ...node, position: nodePositions[node.id] ?? node.position, data: { ...node.data, nodeType: node.type, isActive: node.id === activeId, isComplete: completedIds.has(node.id) } })), [versionNodes, nodePositions, activeId, completedIds]);
  const edges = useMemo(() => (run?.edges ?? selected.edges ?? []).map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [run?.edges, selected.edges]);
  const progress = run?.totalSteps ? Math.round((run.currentStep / run.totalSteps) * 100) : 0;
  const focusNode = useCallback((id) => {
    if (id) flowRef.current?.fitView({ nodes: [{ id }], padding: 0.5, minZoom: 0.85, maxZoom: 1.15, duration: 280 });
  }, []);
  useEffect(() => { focusNode(activeId ?? versionNodes[0]?.id); }, [activeId, selected.id, focusNode]);
  // 窗口改变尺寸时重新聚焦当前节点，防止移动端切换方向后沿用桌面偏移量。
  useEffect(() => {
    if (!canvasRef.current || typeof ResizeObserver === "undefined") return;
    let frame;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => focusNode(activeId ?? versionNodes[0]?.id));
    });
    observer.observe(canvasRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [activeId, selected.id, focusNode]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 运行工作流时整页都属于画布：给 body 打标记，隐藏站点导航与两侧装饰。
    document.body.classList.add("workflow-runner-open");
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("workflow-runner-open");
    };
  }, []);
  const currentNode = versionNodes.find((item) => item.id === activeStep?.id);
  return createPortal(<section className="workflow-player workflow-graph-runner" role="dialog" aria-modal="true" aria-label={`${selected.name}节点画布`}>
    <header className="workflow-graph-runner__topbar">
      {/* 运行界面自成一体：只留一个退出按钮，其余位置给工作流本身。 */}
      <button className="workflow-graph-runner__back" onClick={onBack}><ArrowLeft size={18} weight="bold" /> 退出</button>
      <div className="workflow-graph-runner__title"><h1>{selected.name}</h1></div>
      <div className="workflow-graph-runner__run-state">{loading ? <SpinnerGap className="spin" size={17} /> : run?.status === "completed" ? <CheckCircle size={18} weight="fill" /> : <FlowArrow size={18} />}<span>{loading ? "正在自动运行" : autoError ? "运行已暂停" : run?.status === "completed" ? "运行完成" : run ? "自动运行已开启" : "等待开始"}</span></div>
    </header>
    <div className="workflow-graph-runner__body">
      <div className="workflow-run-canvas" ref={canvasRef} aria-label="工作流节点图">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={fitViewOptions} minZoom={0.2} maxZoom={2} nodesDraggable nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} onNodeDragStop={onNodeDragStop} onInit={(instance) => { flowRef.current = instance; requestAnimationFrame(() => focusNode(activeId ?? versionNodes[0]?.id)); }}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow>
        <div className="workflow-run-canvas__actions"><button type="button" onClick={() => focusNode(activeId ?? versionNodes[0]?.id)}>聚焦当前节点</button><button type="button" onClick={() => flowRef.current?.fitView({ padding: 0.18, duration: 280 })}>查看全图</button></div>
      </div>
      <aside className="workflow-graph-runner__sidebar">
        <div className="workflow-graph-runner__summary"><span>运行进度</span><strong>{run?.status === "completed" ? "已完成" : `${run?.currentStep ?? 0} / ${run?.totalSteps ?? versionNodes.length} 个节点`}</strong><div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? 100 : progress}%</span></div></div>
        <div className="workflow-graph-runner__sidebar-content">
          {!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={40} weight="thin" /><strong>{selected.versionId ? "准备运行" : "暂无可运行版本"}</strong>{selected.versionId && <button disabled={loading} onClick={onStart}><Play size={18} weight="fill" /> 开始运行</button>}</div>}
          {run?.status === "in_progress" && activeStep && <NodeExecutionPanel key={activeStep.id} step={activeStep} node={currentNode} output={run.context?.nodeResults?.[activeStep.id]} loading={loading} onExecute={onExecute} />}
          {autoError && <div className="workflow-graph-runner__error" role="alert"><strong>自动运行暂停</strong><p>{autoError}</p><button type="button" onClick={onRetry}>重试当前节点</button></div>}
          {run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={40} weight="fill" /><strong>运行完成</strong></div>}
          {/* 必须整块包在 && 里：run 还没开始时 run?.context?.artifact 是 undefined，
              原来写成三元表达式会走 else 分支去读 run.context.artifact.downloadUrl 直接崩页。 */}
          {run?.context?.artifact?.downloadUrl && (isImageArtifact(run.context.artifact)
            ? <ZoomableImage src={run.context.artifact.downloadUrl} alt={run.context.artifact.fileName ?? "工作流生成的图片"} fileName={run.context.artifact.fileName ?? ""} />
            : <a className="workflow-result-link" href={run.context.artifact.downloadUrl} target="_blank" rel="noreferrer">查看或下载生成图片 <ArrowRight size={16} /></a>)}
          {run?.context?.text && <section className="workflow-result-text"><strong>生成文字</strong><p>{run.context.text}</p></section>}
        </div>
      </aside>
    </div>
  </section>, document.body);
}

function NodeExecutionPanel({ step, node, output, loading, onExecute }) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(node?.data?.value ?? "");
  const [referenceFile, setReferenceFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const needsPrompt = node?.type === "input";
  const needsNegativePrompt = node?.type === "negative_prompt";
  const needsReference = node?.type === "load_image";
  const execute = async () => {
    if (needsReference && !referenceFile) return;
    try {
      setUploading(true);
      const reference = needsReference ? await uploadTemporaryCreationFile(referenceFile) : null;
      setUploadError("");
      onExecute({ ...(needsPrompt && prompt.trim() ? { prompt: prompt.trim() } : {}), ...(needsNegativePrompt ? { negativePrompt: negativePrompt.trim() } : {}), ...(reference ? { referenceFileId: reference.id } : {}) });
    } catch (error) { setUploadError(error instanceof Error ? error.message : "参考图片上传失败"); }
    finally { setUploading(false); }
  };
  return <article className="workflow-step workflow-step--node"><span>当前节点 · {node?.type || "note"}</span><h3>{step.title}</h3>{needsPrompt && <label className="workflow-run-prompt">创作需求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入本次要生成的内容" /></label>}{needsNegativePrompt && <label className="workflow-run-prompt">负向提示词<textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="例如：文字、水印、模糊" maxLength={1500} /></label>}{needsReference && <label className="workflow-reference-upload">参考图片<input type="file" disabled={uploading} accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => { setReferenceFile(event.target.files?.[0] ?? null); setUploadError(""); }} /><small>{referenceFile ? `已选择：${referenceFile.name}` : "支持 JPEG、PNG、GIF、WebP，最大 8 MB；仅在本次运行中授权使用。"}</small>{uploadError && <em>{uploadError}</em>}</label>}<footer>{needsPrompt || needsReference ? <button disabled={loading || uploading || (needsPrompt && !prompt.trim() && !String(node?.data?.value ?? "").trim()) || (needsReference && !referenceFile)} onClick={execute}>{loading || uploading ? <SpinnerGap className="spin" /> : <Play size={18} weight="fill" />} {uploading ? "上传参考图片…" : needsPrompt ? "开始生成" : "提交并继续"}</button> : needsNegativePrompt ? <button disabled={loading} onClick={execute}>{loading ? <SpinnerGap className="spin" /> : <Play size={18} weight="fill" />} 用这组负向词继续</button> : <span className="workflow-step__auto">{loading ? "正在执行…" : "自动执行"}</span>}</footer></article>;
}
