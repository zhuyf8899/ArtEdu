import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, CheckCircle, Clock, FlowArrow, Play, SpinnerGap } from "@phosphor-icons/react";
import { uploadTemporaryCreationFile } from "./services/adminApi.js";
import "@xyflow/react/dist/style.css";

const nodeStyle = { input: "#4b87ff", load_image: "#4b87ff", prompt: "#b268ff", negative_prompt: "#a15e8c", text_encode: "#b268ff", skill: "#b268ff", text_generate: "#b268ff", load_checkpoint: "#ff8b4b", lora: "#ff8b4b", controlnet: "#ff8b4b", model: "#ff8b4b", empty_latent: "#d6b335", ksampler: "#d6b335", vae_decode: "#d6b335", upscale: "#d6b335", preview: "#42b883", save_image: "#42b883", note: "#78859b" };
const fitViewOptions = { padding: 0.18, maxZoom: 1.1 };

function GraphNode({ data }) {
  const color = nodeStyle[data.nodeType] || nodeStyle.note;
  return <div className={`workflow-run-node ${data.isActive ? "is-active" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": color }}><Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" /><div><FlowArrow size={14} weight="bold" /><span>{data.nodeType === "input" ? "输入" : data.nodeType === "prompt" ? "正向提示词" : data.nodeType === "negative_prompt" ? "负向提示词" : data.nodeType === "skill" ? "内置 Skill" : data.nodeType === "model" ? "模型" : data.nodeType === "preview" ? "输出" : "说明"}</span></div><strong>{data.label}</strong><small>{data.description}</small><Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" /></div>;
}
const nodeTypes = Object.fromEntries(Object.keys(nodeStyle).map((type) => [type, GraphNode]));

export function WorkflowRunner({ selected, run, loading, autoError, onRetry, onBack, onStart, onExecute }) {
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
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  const currentNode = versionNodes.find((item) => item.id === activeStep?.id);
  return createPortal(<section className="workflow-player workflow-graph-runner" role="dialog" aria-modal="true" aria-label={`${selected.name}节点画布`}>
    <header className="workflow-graph-runner__topbar">
      <button className="workflow-graph-runner__back" onClick={onBack}><ArrowLeft size={18} weight="bold" /> 返回工作台</button>
      <div className="workflow-graph-runner__title"><span>{selected.category} / 节点画布</span><h1>{selected.name}</h1></div>
      <div className="workflow-graph-runner__run-state">{loading ? <SpinnerGap className="spin" size={17} /> : run?.status === "completed" ? <CheckCircle size={18} weight="fill" /> : <FlowArrow size={18} />}<span>{loading ? "正在自动运行" : autoError ? "运行已暂停" : run?.status === "completed" ? "运行完成" : run ? "自动运行已开启" : "等待开始"}</span></div>
    </header>
    <div className="workflow-graph-runner__body">
      <div className="workflow-run-canvas" aria-label="工作流节点图"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={fitViewOptions} nodesDraggable nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} onNodeDragStop={onNodeDragStop}><Background color="#384250" gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow><div className="workflow-graph-runner__canvas-hint">拖动画布 · 滚轮缩放 · 拖动节点调整位置</div></div>
      <aside className="workflow-graph-runner__sidebar">
        <div className="workflow-graph-runner__summary"><span>工作流进度</span><strong>{run?.status === "completed" ? "已完成" : `${run?.currentStep ?? 0} / ${run?.totalSteps ?? versionNodes.length} 个节点`}</strong><div className="workflow-player__progress"><i><b style={{ width: `${run?.status === "completed" ? 100 : progress}%` }} /></i><span>{run?.status === "completed" ? 100 : progress}%</span></div><p>{selected.description}</p></div>
        <div className="workflow-graph-runner__sidebar-content">
          {!run && <div className="workflow-start workflow-start--graph"><FlowArrow size={40} weight="thin" /><strong>{selected.versionId ? "准备启动工作流" : "暂无可运行版本"}</strong><p>{selected.versionId ? "点击开始后，画布会自动运行已有参数的节点。" : "请先发布工作流版本。"}</p>{selected.versionId && <button disabled={loading} onClick={onStart}><Play size={18} weight="fill" /> 开始运行</button>}</div>}
          {run?.status === "in_progress" && activeStep && <NodeExecutionPanel key={activeStep.id} step={activeStep} node={currentNode} output={run.context?.nodeResults?.[activeStep.id]} loading={loading} onExecute={onExecute} />}
          {autoError && <div className="workflow-graph-runner__error" role="alert"><strong>自动运行暂停</strong><p>{autoError}</p><button type="button" onClick={onRetry}>重试当前节点</button></div>}
          {run?.status === "completed" && <div className="workflow-complete"><CheckCircle size={40} weight="fill" /><strong>节点工作流已完成</strong><p>模型生成记录和节点结果已保存，可从“我的学习”继续查看。</p></div>}
          {run?.context?.artifact?.downloadUrl && <a className="workflow-result-link" href={run.context.artifact.downloadUrl} target="_blank" rel="noreferrer">查看或下载生成图片 <ArrowRight size={16} /></a>}
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
  return <article className="workflow-step workflow-step--node"><span>当前节点 · {node?.type || "note"}</span><h3>{step.title}</h3><p>{step.description}</p>{step.instruction && !needsNegativePrompt && <div><small>// 节点参数</small>{step.instruction}</div>}{needsPrompt && <label className="workflow-run-prompt">本次需求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入本次要生成或处理的内容" /></label>}{needsNegativePrompt && <label className="workflow-run-prompt">负向提示词<textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="例如：文字、水印、模糊" maxLength={1500} /></label>}{needsReference && <label className="workflow-reference-upload">参考图片<input type="file" disabled={uploading} accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => { setReferenceFile(event.target.files?.[0] ?? null); setUploadError(""); }} /><small>{referenceFile ? `已选择：${referenceFile.name}` : "支持 JPEG、PNG、GIF、WebP，最大 8 MB；仅在本次运行中授权使用。"}</small>{uploadError && <em>{uploadError}</em>}</label>}{output && <pre className="workflow-node-output">{JSON.stringify(output, null, 2)}</pre>}<footer><em><Clock size={16} /> 约 {step.estimatedMinutes ?? 10} 分钟</em>{needsPrompt || needsReference ? <button disabled={loading || uploading || (needsPrompt && !prompt.trim() && !String(node?.data?.value ?? "").trim()) || (needsReference && !referenceFile)} onClick={execute}>{loading || uploading ? <SpinnerGap className="spin" /> : <Play size={18} weight="fill" />} {uploading ? "上传参考图片…" : "提交并自动运行"}</button> : <span className="workflow-step__auto">{loading ? "正在自动执行…" : "节点将自动执行"}</span>}</footer></article>;
}
