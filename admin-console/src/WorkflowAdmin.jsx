import { WorkflowImageInput } from "./WorkflowImageInput.jsx";
import { createPortal } from "react-dom";
import "./workflow-editor.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { ComfyNode } from './ComfyNode.jsx';
import { skipNode, graphLimitIssue, layoutGraph, groupBounds as measuredGroupBounds } from '../../shared/workflowGraph.mjs';
import { getComfyCatalog, getComfyJob, cancelComfyJob, retryComfyJob } from './services/adminApi.js';
import { compilePrompt, importComfy, readComfyWorkflowFile, exchangeNodeInfo, validConnection, nodeFromInfo, exportComfyApi, exportComfyUI, validateGraphStructure } from './comfyGraph.js';
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, ConnectionLineType, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ViewportPortal } from "@xyflow/react";
import { ArrowLeft, ArrowRight, ArrowsOut, CheckCircle, DownloadSimple, FloppyDisk, FlowArrow, Keyboard, MagnifyingGlass, MagicWand, Play, Plus, SpinnerGap, UploadSimple, X } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { createWorkflow, createWorkflowVersion, executeWorkflowRun, getAdminWorkflow, getAdminWorkflows, getMyWorkflowRuns, getWorkflowRun, rerunWorkflowNode, startWorkflowRun, updateWorkflow, uploadTemporaryCreationFile } from "./services/adminApi.js";
import { shortId } from "./randomId.js";
import { ZoomableImage } from "./ImageLightbox.jsx";
import { isImageArtifact } from "./imageSources.js";

import { LearningBindingFields } from "./LearningBindingFields.jsx";
import { normalizeLearningBindings } from "./learningBindings.js";
import { hasDownstreamPrompt, platformPublishIssues } from './workflowExecution.js';
import { additionalPlatformNodes, createPlatformPreset, platformInputPorts } from './platformNodeCatalog.js';
const blankWorkflow = { name: "", description: "", category: "视觉创作", entryType: "workbench" };
const palette = {
  input: { title: "创作输入", hint: "接收本次的文字需求", color: "#4b87ff", group: "输入与素材" },
  load_image: { title: "图片与遮罩", hint: "上传图片，可涂抹局部重绘区域，通过图片编辑 API 处理", color: "#4b87ff", group: "输入与素材" },
  prompt: { title: "正向提示词", hint: "描述希望画面出现的内容", color: "#b268ff", group: "提示与教学" },
  negative_prompt: { title: "负向提示词", hint: "描述需要避开的内容", color: "#a15e8c", group: "提示与教学" },
  prompt_merge: { title: "提示词合并", hint: "汇合正向与负向提示词，分别保留两种条件后送入图片生成", color: "#b268ff", group: "提示与教学" },
  skill: { title: "内置 Skill", hint: "封装专业方法与参数预设", color: "#d6b335", group: "提示与教学" },
  text_generate: { title: "生成文字", hint: "调用平台文本模型，保存回复", color: "#b268ff", group: "模型与控制" },
  model: { title: "图片模型设置", hint: "配置下游图片生成所用的模型；本节点不生图，留空恢复默认模型", color: "#ff8b4b", group: "模型与控制" },
  empty_latent: { title: "图片尺寸", hint: "填写如 1024x1024 的输出尺寸", color: "#d6b335", group: "采样与处理" },
  ksampler: { title: "图片生成", hint: "接收合并后的正负提示词、模型与尺寸，调用云端图片模型生成图片", color: "#d6b335", group: "采样与处理" },
  preview: { title: "预览输出", hint: "展示中间或最终结果", color: "#42b883", group: "输出与说明" },
  save_image: { title: "保存图片", hint: "展示已归档的可下载产物", color: "#42b883", group: "输出与说明" },
  note: { title: "说明", hint: "补充教学或操作说明", color: "#78859b", group: "输出与说明" },
  ...additionalPlatformNodes,
};
const paletteGroups = [...new Set(Object.values(palette).map((item) => item.group))];
const draftKey = (id) => `artedu.workflow.graph-draft.${id}`;
// crypto.randomUUID 在明文 HTTP 的不安全上下文里不存在，统一走 randomId。
const newId = shortId;

/**
 * 工作流自己是否带着提示词。带着的话，「创作需求」输入节点只是"可选需求"，
 * 试运行时什么都不填也直接跑到出图；一句提示词都没有时才停下来问人要需求。
 */
const nodesCarryPrompt = (nodes, edges, id) => hasDownstreamPrompt(nodes, edges, id);

function emptyDefinition() {
  return {
    schemaVersion: 2,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    nodes: [
      { id: "input-1", type: "input", position: { x: 70, y: 160 }, data: { label: "创作需求", description: "输入主题、受众或参考素材", value: "" } },
      { id: "prompt-1", type: "prompt", position: { x: 350, y: 160 }, data: { label: "正向提示词", description: "希望生成的主体、构图与风格", value: "画面主体明确，构图清晰，色彩协调。" } },
      { id: "negative-1", type: "negative_prompt", position: { x: 350, y: 570 }, data: { label: "负向提示词", description: "需要排除的内容，独立连接到提示词合并", value: "模糊、低清晰度、杂乱构图、文字、水印" } },
      { id: "merge-1", type: "prompt_merge", position: { x: 640, y: 270 }, data: { label: "提示词合并", description: "正向与负向分别保留，汇合后发送到图片生成", value: "" } },
      { id: "model-1", type: "model", position: { x: 930, y: 160 }, data: { label: "图像生成模型", description: "填写服务端已配置的模型 ID；留空则使用内部图片通道", value: "" } },
      { id: "ksampler-1", type: "ksampler", position: { x: 1210, y: 160 }, data: { label: "生成图片", description: "通过平台统一图片 API 创建真实生成任务", value: "" } },
      { id: "preview-1", type: "preview", position: { x: 1490, y: 160 }, data: { label: "成果预览", description: "展示已经生成的图片", value: "" } },
      { id: "save-1", type: "save_image", position: { x: 1770, y: 160 }, data: { label: "保存成果", description: "打开平台已归档的图片", value: "" } },
    ],
    edges: [
      { id: "edge-input-prompt", source: "input-1", target: "prompt-1" },
      { id: "edge-prompt-merge", source: "prompt-1", target: "merge-1", targetHandle: "positive" },
      { id: "edge-negative-merge", source: "negative-1", target: "merge-1", targetHandle: "negative" },
      { id: "edge-merge-model", source: "merge-1", target: "model-1" },
      { id: "edge-model-sampler", source: "model-1", target: "ksampler-1" },
      { id: "edge-sampler-preview", source: "ksampler-1", target: "preview-1" },
      { id: "edge-preview-save", source: "preview-1", target: "save-1" },
    ],
  };
}

function legacyDefinition(steps = []) {
  if (!steps.length) return emptyDefinition();
  return {
    schemaVersion: 2,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    nodes: steps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      type: "note",
      position: { x: 80 + index * 280, y: 180 },
      data: { label: step.title || `步骤 ${index + 1}`, description: step.description || step.instruction || "", value: step.instruction || "" },
    })),
    edges: steps.slice(1).map((step, index) => ({ id: `edge-${index + 1}`, source: steps[index].id || `step-${index + 1}`, target: step.id || `step-${index + 2}` })),
  };
}

function normalizeDefinition(value, steps) {
  if (value?.nodes && value?.edges) return { schemaVersion: 2, learning: value.learning ?? {}, engine: value.engine, comfyPrompt: value.comfyPrompt, comfyExchange: value.comfyExchange, viewport: value.viewport || { x: 0, y: 0, zoom: 0.85 }, nodes: value.nodes, edges: value.edges, groups: value.groups || [] };
  return legacyDefinition(steps);
}

function readDraft(id) {
  try { return JSON.parse(window.localStorage.getItem(draftKey(id)) || "null"); } catch { return null; }
}

function writeDraft(id, value) {
  try { if (id) window.localStorage.setItem(draftKey(id), JSON.stringify(value)); return true; }
  catch { return false; }
}

function workflowIssues(definition) {
  const ids = new Set();
  const edgeIds = new Set();
  const issues = [];
  const limit = graphLimitIssue(definition); if (limit) issues.push(limit);
  definition.nodes.forEach((node) => {
    if (!node.id || ids.has(node.id)) issues.push("节点 ID 不能重复");
    ids.add(node.id);
  });
  definition.edges.forEach((edge) => {
    if (!edge.id || edgeIds.has(edge.id)) issues.push("连线 ID 不能重复");
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target)) issues.push("连线必须连接到现有节点");
    if (edge.source === edge.target) issues.push("节点不能连接自身");
  });
  const groupIds = new Set();
  (definition.groups ?? []).forEach((group) => {
    if (!group.id || groupIds.has(group.id)) issues.push("分组 ID 不能重复");
    groupIds.add(group.id);
    if (!group.title?.trim()) issues.push("请填写分组名称");
    if (group.nodeIds.length < 2 || new Set(group.nodeIds).size !== group.nodeIds.length || group.nodeIds.some((id) => !ids.has(id))) issues.push("分组必须包含至少两个不同的现有节点");
  });
  if (!definition.nodes.length) issues.push("至少需要一个节点");
  const outgoing = new Map(definition.nodes.map((node) => [node.id, []]));
  definition.edges.forEach((edge) => outgoing.get(edge.source)?.push(edge.target));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = (outgoing.get(id) || []).some(visit);
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  if (definition.nodes.some((node) => visit(node.id))) issues.push("工作流不能包含循环连接");
  return [...new Set(issues)];
}

function workflowWarnings(definition) {
  const incoming = new Set(definition.edges.map((edge) => edge.target));
  const outgoing = new Set(definition.edges.map((edge) => edge.source));
  const warnings = [];
  if (!definition.nodes.some((node) => ["input","prompt","text_constant","text_template"].includes(node.type))) warnings.push("建议添加创作输入或正向提示词，明确生成内容");
  if (!definition.nodes.some((node) => ["preview","save_image","text_preview"].includes(node.type))) warnings.push("建议添加预览或保存图片节点，明确成果如何结束");
  if (definition.nodes.some((node) => !incoming.has(node.id) && ["ksampler", "save_image", "prompt_merge", "text_generate"].includes(node.type))) warnings.push("存在缺少上游数据的节点，请补充连线");
  if (definition.nodes.some((node) => !outgoing.has(node.id) && node.type !== "preview" && node.type !== "save_image" && node.type !== "text_preview" && node.type !== "note")) warnings.push("存在没有输出连线的处理节点");
  return [...new Set(warnings)];
}

const publishIssues = platformPublishIssues;

function NodeOptions({ type, data, onChange, disabled = false, onFocus }) {
  if (type === 'result_select') return <label className="workflow-flow-node__widget"><span>选用结果（未使用分支不执行）</span><select className="nodrag nowheel" aria-label="选用结果" disabled={disabled} value={data.selection ?? 'a'} onFocus={onFocus} onChange={event => onChange('selection', event.target.value)}><option value="a">A 路</option><option value="b">B 路</option></select></label>;
  if (type === 'condition') return <><label className="workflow-flow-node__widget">比较字段<select className="nodrag" value={data.field || 'text'} onChange={e=>onChange('field',e.target.value)} disabled={disabled}>{[['text','文字'],['prompt','正向提示词'],['negativePrompt','负向提示词'],['error','错误信息']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>判断方式<select className="nodrag" value={data.operator || 'contains'} onChange={e=>onChange('operator',e.target.value)} disabled={disabled}>{[['contains','包含'],['equals','等于'],['not_empty','不为空']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label></>;
  if (type === 'loop') return <><label>循环次数<input className="nodrag" aria-label="循环次数" type="number" min="1" max="20" value={data.iterations || 1} onChange={e=>onChange('iterations',Number(e.target.value))} disabled={disabled}/></label><label>循环操作<select className="nodrag" value={data.operation || 'text_template'} onChange={e=>onChange('operation',e.target.value)} disabled={disabled}><option value="text_template">文字模板</option><option value="text_replace">查找替换</option><option value="text_generate">文字生成</option></select></label>{data.operation==='text_replace' && <><label>查找<input className="nodrag" value={data.find || ''} onChange={e=>onChange('find',e.target.value)} disabled={disabled}/></label><label>替换为<input className="nodrag" value={data.replacement || ''} onChange={e=>onChange('replacement',e.target.value)} disabled={disabled}/></label></>}<label>包含以下文字时提前停止<input className="nodrag" value={data.until || ''} onChange={e=>onChange('until',e.target.value)} disabled={disabled}/></label></>;
  const fields = type === 'text_replace'  ? [['find', '查找文字', ''], ['replacement', '替换为（可留空）', '']] : type === 'text_join' ? [['separator', '分隔符', '\n']] : [];
  return fields.map(([key, title, fallback]) => <label className="workflow-flow-node__widget" key={key}><span>{title}</span><textarea className="nodrag nowheel" aria-label={title} disabled={disabled} rows={2} value={data[key] ?? fallback} onFocus={onFocus} onChange={event => onChange(key, event.target.value)} /></label>);
}

function FlowNode({ data, selected }) {
  const meta = palette[data.nodeType] || palette.note;
  const inputs = platformInputPorts(data.nodeType);
  const canSend = data.nodeType !== "save_image";
  const outputLabel = meta.output || ({ prompt: '正向提示词', negative_prompt: '负向提示词', prompt_merge: '生成条件', model: '模型与条件', ksampler: '图片', text_generate: '生成文字', empty_latent: '尺寸与条件', load_image: '参考图片' })[data.nodeType] || '下游数据';
  const hasValue = additionalPlatformNodes[data.nodeType] ? Boolean(meta.valueLabel) : !['prompt_merge', 'preview', 'save_image', 'ksampler', 'load_image'].includes(data.nodeType);
  const valueLabel = meta.valueLabel || ({ prompt: "正向提示词", negative_prompt: "负向提示词", model: "模型 ID", empty_latent: "输出尺寸", skill: "方法与参数", note: "说明内容", input: "默认需求" })[data.nodeType] || "节点参数";
  const multiline = ["prompt", "negative_prompt", "skill", "note", "input", "text_generate", "text_constant", "text_template", "loop"].includes(data.nodeType);
  return <div className={`workflow-flow-node ${selected ? "is-selected" : ""} ${data.isActive ? "is-running" : ""} ${data.isComplete ? "is-complete" : ""} ${data.isSkipped ? "is-skipped" : ""} ${data.isFailed ? "is-failed" : ""}`} style={{ "--node-color": meta.color }} onClick={(event) => { event.stopPropagation(); if (!event.target.closest("input, textarea, select")) data.onSelect(event.shiftKey); }}>
    <div className="workflow-flow-node__bar drag-handle"><FlowArrow size={17} weight="bold" /><span>{meta.group}</span><em>{data.isFailed ? "失败" : data.isSkipped ? "已跳过" : data.isComplete ? <CheckCircle size={17} weight="fill" aria-label="已执行" /> : data.isActive ? <SpinnerGap size={17} className="spin" aria-label="正在执行" /> : data.nodeType}</em></div>
    <div className="workflow-flow-node__body"><strong>{data.label || meta.title}</strong><p>{data.description || meta.hint}</p>
      {inputs.map(([port, title]) => <div key={port} className="workflow-flow-node__port workflow-flow-node__port--input"><Handle id={port} type="target" position={Position.Left} className="workflow-flow-handle" /><span>{title}</span><small>{data.nodeType === 'ksampler' ? '生成条件与参数' : '上游数据'}</small></div>)}
      {canSend && data.nodeType !== 'condition' && <div className="workflow-flow-node__port workflow-flow-node__port--output"><Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" /><span>输出</span><small>{outputLabel}</small></div>}
      {data.nodeType === 'condition' && ['true','false'].map(port=><div className="workflow-flow-node__port workflow-flow-node__port--output" key={port}><Handle id={port} type="source" position={Position.Right} className="workflow-flow-handle"/><span>{port==='true'?'条件满足':'条件不满足'}</span></div>)}
      <div className="workflow-flow-node__port workflow-flow-node__port--output workflow-error-port"><Handle id="error" type="source" position={Position.Right} className="workflow-flow-handle"/><span>失败时</span><small>连接错误处理分支</small></div>
      {hasValue && <label className="workflow-flow-node__widget"><span>{valueLabel}</span>{multiline ? <textarea disabled={data.locked} className="nodrag nowheel" value={data.value || ""} onFocus={data.onValueFocus} onChange={(event) => data.onValueChange(event.target.value)} rows={data.nodeType === "prompt" || data.nodeType === "negative_prompt" ? 3 : 2} placeholder="在节点内直接编辑" /> : <input disabled={data.locked} className="nodrag nowheel" value={data.value || ""} onFocus={data.onValueFocus} onChange={(event) => data.onValueChange(event.target.value)} placeholder={data.nodeType === "empty_latent" ? "1024x1024" : "可选参数"} />}</label>}
      <div className="workflow-node-options" onFocus={data.onValueFocus}><NodeOptions type={data.nodeType} data={data} onChange={data.onFieldChange} disabled={data.locked} /></div>
      {data.previewUrl && <img className="workflow-flow-node__preview" draggable={false} src={data.previewUrl} alt="本次运行生成的图片预览" />}
    </div>
  </div>;
}

const nodeTypes = { ...Object.fromEntries(Object.keys(palette).map((type) => [type, FlowNode])), comfy: ComfyNode };

export function WorkflowAdmin({ showToast, canPublish = true, initialWorkflowId = "", onWorkflowNavigate }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // 管理列表也是分页的：以前只读第一页，工作流一多，后面的记录在这个页面上就点不到了。
  const ADMIN_PAGE_SIZE = 20;
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(false);
  const saving = useRef(false);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const draftTimer = useRef(null);
  const opening = useRef(0);
  const [openError, setOpenError] = useState("");

  useEffect(() => () => { if (draftTimer.current) window.clearTimeout(draftTimer.current); }, []);

  const load = async () => {
    try {
      const payload = await getAdminWorkflows(search, { page: 1, pageSize: ADMIN_PAGE_SIZE });
      setItems(payload.items ?? []);
      setTotal(typeof payload.total === "number" ? payload.total : (payload.items?.length ?? 0));
    }
    catch (error) { showToast(error.message); }
  };
  // 追加下一页并去重；搜索词随当前输入走，翻页不会悄悄换回旧条件。
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = Math.floor(items.length / ADMIN_PAGE_SIZE) + 1;
      const payload = await getAdminWorkflows(search, { page, pageSize: ADMIN_PAGE_SIZE });
      setItems(current => { const seen = new Set(current.map(item => item.id)); return [...current, ...(payload.items ?? []).filter(item => !seen.has(item.id))]; });
      if (typeof payload.total === "number") setTotal(payload.total);
    }
    catch (error) { showToast(error.message); }
    finally { setLoadingMore(false); }
  };
  useEffect(() => { load(); }, []);

  const open = async (workflow) => {
    const requestId = ++opening.current;
    setOpenError(""); setLoading(true);
    try {
      const detail = await getAdminWorkflow(workflow.id);
      if(requestId !== opening.current) return;
      const latest = detail.versions?.[0];
      const local = readDraft(workflow.id);
      setSelected(detail);
      setDirty(Boolean(local));
      setEditor({
        name: local?.name ?? detail.name ?? "", description: local?.description ?? detail.description ?? "", category: local?.category ?? detail.category ?? "视觉创作", entryType: local?.entryType ?? detail.entryType ?? "workbench", entryUrl: local?.entryUrl ?? detail.entryUrl ?? "",
        promptTemplate: local?.promptTemplate ?? latest?.promptTemplate ?? "",
        definition: normalizeDefinition(local?.definition ?? latest?.definition, latest?.steps),
      });
    } catch (error) { if(requestId === opening.current) { setOpenError(error.message); showToast(error.message); } }
    finally { if(requestId === opening.current) setLoading(false); }
  };

  useEffect(() => {
    if (!onWorkflowNavigate) return;
    if (initialWorkflowId) { setEditor(null); setSelected(null); void open({id:initialWorkflowId}); }
    else { opening.current++; setEditor(null); setSelected(null); setOpenError(""); setLoading(false); }
    return () => { opening.current++; };
  }, [initialWorkflowId]);
  const openFromList = (workflow) => onWorkflowNavigate ? onWorkflowNavigate(workflow.id) : open(workflow);
  const backToList = () => { if(onWorkflowNavigate) onWorkflowNavigate(""); else { setEditor(null); setSelected(null); } };

  const create = async (native = false) => {
    setLoading(true);
    try {
      const workflow = await createWorkflow({ ...blankWorkflow, name: "未命名节点工作流", description: "请在画布中配置这条工作流的节点与连接。" });
      await load(); await open(workflow); if(onWorkflowNavigate) onWorkflowNavigate(workflow.id); if(native) {writeDraft(workflow.id,{definition:{schemaVersion:2,engine:"comfyui",nodes:[],edges:[],groups:[],viewport:{x:0,y:0,zoom:1}}});setEditor(current=>({...current,definition:{schemaVersion:2,engine:'comfyui',nodes:[],edges:[],groups:[],viewport:{x:0,y:0,zoom:1}}}));setDirty(true);} showToast("节点工作流草稿已创建");
    } catch (error) { showToast(error.message); }
    finally { setLoading(false); }
  };

  const queueDraft = (id, value) => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => { if (!writeDraft(id, value)) showToast('浏览器草稿空间不足，请点击保存，将当前草稿保存到服务器。'); }, 180);
  };
  const change = (key, value) => { if (saving.current) return; setDirty(true); setEditor((current) => {
    const next = { ...current, [key]: value };
    // 拖动节点会连续产生几十个 position 事件，延迟写草稿避免同步 localStorage 阻塞指针移动。
    queueDraft(selected?.id, next);
    return next;
  }); };

  const changeDefinition = (definition) => change("definition", definition);

  const save = async (publish, override) => {
    if (saving.current) return false;
    const requestId = opening.current;
    const definition = override ?? editor.definition;
    const native = definition.engine === 'comfyui';
    const issues = workflowIssues(definition);
    const releaseIssues = publish && !native ? publishIssues(definition) : [];
    if (!editor.name.trim() || issues.length || releaseIssues.length) { showToast(!editor.name.trim() ? "请填写工作流名称" : issues[0] || releaseIssues[0]); return; }
    saving.current = true;
    setLoading(true);
    try {
      // 历史数据可能把站内路由（例如 /studio）存进入口地址；服务端仅接受无凭据 HTTP(S) 外链。
      const entryUrl = /^https?:\/\//i.test(editor.entryUrl || "") ? editor.entryUrl : undefined;
      const savedDefinition = { ...definition, learning: normalizeLearningBindings(definition.learning) };
      await updateWorkflow(selected.id, { name: editor.name, description: editor.description, category: editor.category, entryType: editor.entryType, entryUrl });
      const version = await createWorkflowVersion(selected.id, { definition: savedDefinition, promptTemplate: editor.promptTemplate, publish });
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      window.localStorage.removeItem(draftKey(selected.id));
      if (requestId !== opening.current) return version;
      setDirty(false);
      // Keep the mounted canvas and its run state; list refresh is independent.
      setSelected(current => ({ ...current, name: editor.name, description: editor.description, category: editor.category,
        status: publish ? 'published' : current.status,
        versions: [{ ...version, definition: savedDefinition }, ...(current.versions ?? [])] }));
      setEditor(current => ({ ...current, definition: savedDefinition }));
      void load();
      showToast(publish ? "节点工作流新版本已发布" : "节点工作流版本已保存");
      return version;
    } catch (error) { showToast(error.message); return false; }
    finally { saving.current = false; setLoading(false); }
  };

  const exportJson = () => {
    let learning;
    try { learning = normalizeLearningBindings(editor.definition.learning); }
    catch (error) { showToast(error.message); return; }
    const payload = { format: "artedu-comfy-workflow", version: 2, workflow: { name: editor.name, description: editor.description, category: editor.category, entryType: editor.entryType, entryUrl: editor.entryUrl }, definition: { ...editor.definition, learning }, promptTemplate: editor.promptTemplate };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${editor.name || "artedu-workflow"}.json`; anchor.click(); URL.revokeObjectURL(url); showToast("节点图 JSON 已导出");
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const requestId = opening.current;
    try {
      const data = await readComfyWorkflowFile(file);
      const definition = data.definition ? normalizeDefinition(data.definition, data.steps) : importComfy(data,(await getComfyCatalog().catch(()=>({nodes:{}}))).nodes);
      if (requestId !== opening.current) return;
      if (definition.engine === 'comfyui') delete definition.comfyPrompt;
      const issues = workflowIssues(definition); if (issues.length) throw new Error(issues[0]);
      setEditor((current) => {
        const next = { ...current, ...(data.workflow ?? {}), definition, promptTemplate: data.promptTemplate ?? current.promptTemplate };
        writeDraft(selected?.id, { definition: next.definition, promptTemplate: next.promptTemplate }); return next;
      });
      setDirty(true);
      showToast("节点图已导入本地草稿");
    } catch (error) { showToast(`导入失败：${error.message}`); }
  };

  if (editor && selected) return <WorkflowCanvas key={`${selected.id}:${editor.definition.engine || "platform"}`} editor={editor} selected={selected} loading={loading} dirty={dirty} canPublish={canPublish} onNotice={showToast} onBack={backToList} onChange={change} onDefinition={changeDefinition} onSave={save} onExport={exportJson} onImport={importJson} />;

  if (initialWorkflowId && !editor) return <section className="portal-empty"><h2>{loading ? "正在打开编辑画布…" : "无法打开此工作流"}</h2>{openError && <p role="alert">{openError}</p>}<button onClick={backToList}>返回工作流列表</button></section>;
  return <div className="page-content">
    <section className="page-intro"><div><p>// COMFY-STYLE WORKFLOW OPERATIONS</p><h1>节点工作流</h1><span>用画布连接输入、提示词、模型与输出节点；保存后生成不可变版本。</span></div><button className="primary-button" disabled={loading} onClick={() => create()}><Plus size={18} weight="bold" /> 新建节点工作流</button><button className="outline-button" disabled={loading} onClick={() => create(true)}>新建 ComfyUI 工作流</button></section>
    <section className="table-panel workflow-admin-panel"><div className="table-tools workflow-admin-tools"><label><FlowArrow size={18} weight="bold" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="搜索工作流名称或描述" /></label><button className="outline-button" onClick={load}>搜索</button></div><div className="workflow-admin-list">{items.map((workflow) => <button className="workflow-admin-row" key={workflow.id} onClick={() => openFromList(workflow)}><div className="workflow-admin-icon"><FlowArrow size={22} weight="bold" /></div><div><span>{workflow.category} · {workflow.stepCount ?? 0} 个节点</span><strong>{workflow.name}</strong><small>{workflow.creatorName} · V{workflow.versionNumber ?? 0} · {workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString("zh-CN") : "尚未保存版本"}</small></div><em className={`course-state course-state--${workflow.status}`}>{workflow.status === "published" ? `公开 V${workflow.publishedVersionNumber??workflow.versionNumber??0}${workflow.versionPublished===false?` · 最新草稿 V${workflow.versionNumber}`:""}` : workflow.status === "archived" ? "已归档" : "草稿"}</em><ArrowRight size={17} /></button>)}{!items.length && <div className="empty-state"><FlowArrow size={34} /><strong>{search.trim() ? "没有匹配的工作流" : "尚无工作流"}</strong><span>{search.trim() ? `「${search.trim()}」没有匹配到工作流名称或描述。` : "创建第一条节点工作流，开始搭建画布。"}</span></div>}</div>
      <footer className="workflow-admin-pager"><span>已显示 {items.length} / {total} 条</span>{items.length < total && <button className="outline-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "正在加载…" : `加载更多（还有 ${total - items.length} 条）`}</button>}</footer>
    </section>
  </div>;
}

export function WorkflowCanvas({ editor, selected, loading = false, dirty = false, canPublish = false, onNotice = () => {}, onBack, onChange = () => {}, onDefinition = () => {}, onSave, onExport, onImport, readOnly = false }) {
  const native = editor.definition.engine === 'comfyui';
  const [catalog, setCatalog] = useState({});
  const [workerOnline, setWorkerOnline] = useState(false);
  const [nativeJob, setNativeJob] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(20);
  const [nativeError, setNativeError] = useState('');
  const refreshCatalog = () => getComfyCatalog().then(r => {setCatalog(r.nodes || {});setWorkerOnline(Boolean(r.workers?.length));setNativeError('');}).catch(e => setNativeError(e.message));
  useEffect(() => { if (native) void refreshCatalog(); }, [native, selected.id]);
  useEffect(() => {
    if (!nativeJob || !['queued','running','cancelling'].includes(nativeJob.status)) return;
    let cancelled=false,timer;
    const tick=async()=>{try{const job=await getComfyJob(nativeJob.runId);if(!cancelled)setNativeJob(job);}catch(e){if(!cancelled)setNativeError(e.message);}if(!cancelled)timer=setTimeout(tick,1500);};
    timer=setTimeout(tick,1500);return()=>{cancelled=true;clearTimeout(timer);};
  },[nativeJob?.runId,nativeJob?.status]);
  const downloadNative = format => {
    try {
      const payload = format === 'api' ? exportComfyApi(editor.definition, catalog) : exportComfyUI(editor.definition, catalog, format);
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = format === 'api' ? 'comfy-api-workflow.json' : `comfy-ui-${format}.json`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { onNotice(e.message); setNativeError(e.message); }
  };
  const importGraph = async event => {
    if (onImport) return onImport(event);
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { onDefinition(importComfy(await readComfyWorkflowFile(file), catalog)); } catch (e) { setNativeError(e.message); }
  };
  const exportGraph = () => {
    if (onExport) return onExport();
    const url = URL.createObjectURL(new Blob([JSON.stringify({format:'artedu-comfy-workflow',version:2,definition:editor.definition})], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'comfy-canvas.json'; a.click(); URL.revokeObjectURL(url);
  };
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panel, setPanel] = useState("settings");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const copiedGraph = useRef(null);
  const [hasCopiedGraph, setHasCopiedGraph] = useState(false);
  const pasteCount = useRef(0);
  const [preview, setPreview] = useState("");
  const [nodeQuery, setNodeQuery] = useState("");
  const [nodeGroup, setNodeGroup] = useState("全部");
  const [quickAdd, setQuickAdd] = useState(null);
  const [quickQuery, setQuickQuery] = useState("");
  const [history, setHistory] = useState({ past: [], future: [] });
  const [flow, setFlow] = useState(null);
  const canvasWrapRef = useRef(null);
  const [run, setRun] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [runFilter, setRunFilter] = useState("全部");
  const [inspectedRun, setInspectedRun] = useState(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");
  const [runPrompt, setRunPrompt] = useState("");
  const [runNegativePrompt, setRunNegativePrompt] = useState("");
  const [referenceFile, setReferenceFile] = useState(null);
  const [runBusy, setRunBusy] = useState(false);
  const startingRun = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [selected.id]);
  const [runError, setRunError] = useState("");
  // 发布是独立动作：点「保存并发布」先弹二次确认，确认后才真的发布。
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const loadRuns = async () => {
    setRunsLoading(true);
    try { const response = await getMyWorkflowRuns(); setRecentRuns((response.items ?? []).filter((item) => item.workflowId === selected.id).sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || new Date(b.updatedAt) - new Date(a.updatedAt))); setRunsError(""); }
    catch (error) { setRunsError(error.message); }
    finally { setRunsLoading(false); }
  };
  useEffect(() => { void loadRuns(); }, [selected.id, native]);
  useEffect(() => { if (run?.status !== "in_progress") return; const timer = window.setInterval(() => { void loadRuns(); }, 10000); return () => window.clearInterval(timer); }, [run?.status, selected.id]);
  const inspectRun = async (item, resume = false) => {
    try {
      const detail = await getWorkflowRun(item.id);
      setInspectedRun(detail);
      if (native) {setRun(detail);setNativeJob(await getComfyJob(item.id));setPanel('run');return;}
      if (resume) {
        if (detail.versionId !== selected.versions?.[0]?.id) onNotice(`正在继续 V${detail.versionNumber} 的运行快照；当前画布的改动不会影响这次任务。`);
        setRun(detail); setRunError(""); setRunPrompt(""); setRunNegativePrompt("");
        runPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (error) { onNotice(error.message); }
  };
  const runSteps = run?.steps ?? [];
  const activeStep = run?.status === "in_progress" ? runSteps[run.currentStep] : null;
  const runNodes = run?.nodes?.length ? run.nodes : editor.definition.nodes;
  const activeNode = activeStep ? runNodes.find((node) => node.id === activeStep.id) : null;
  const completedNodeIds = useMemo(() => new Set(run ? runSteps.slice(0, run.currentStep).map((step) => step.id) : []), [run, runSteps]);
  const recordHistory = () => setHistory((current) => ({ past: [...current.past.slice(-29), structuredClone(editor.definition)], future: [] }));
  const commit = (next, record = true) => { if (readOnly || loading || startingRun.current) return; const issue = graphLimitIssue({ ...editor.definition, ...next }); if (issue) return onNotice(issue); if (record) recordHistory(); onDefinition({ ...editor.definition, ...next }); };
  const undo = () => { if (readOnly || loading || startingRun.current || !history.past.length) return; const previous = history.past.at(-1); setHistory({ past: history.past.slice(0, -1), future: [structuredClone(editor.definition), ...history.future] }); onDefinition(previous); };
  const redo = () => { if (readOnly || loading || startingRun.current || !history.future.length) return; const next = history.future[0]; setHistory({ past: [...history.past, structuredClone(editor.definition)], future: history.future.slice(1) }); onDefinition(next); };
  const changeNodeData = (id, key, value) => commit({ nodes: editor.definition.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, [key]: value } } : node) }, false);
  const changeNodeValue = (id, value) => changeNodeData(id, 'value', value);
  const selectNode = (id, additive) => { const next = additive ? (selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]) : [id]; setSelectedIds(next); setSelectedId(next[0] ?? null); setSelectedEdgeId(null); };
  const artifactUrl = run?.context?.artifact?.downloadUrl && isImageArtifact(run.context.artifact) ? run.context.artifact.downloadUrl : null;
  const nativeNode = node => ({ ...node, measured: measurements.find(n=>n.id===node.id)?.measured || node.measured, selected: selectedIds.includes(node.id), data: { ...node.data, readOnly: readOnly || loading || startingRun.current, active:nativeJob?.status==='running' && nativeJob.progress?.node===node.id,
    originalSize: node.data.comfyUI?.size, updateRaw: (index,value) => commit({nodes:editor.definition.nodes.map(n=>n.id===node.id?{...n,data:{...n.data,comfyUI:{...n.data.comfyUI,widgets_values:n.data.comfyUI.widgets_values.map((v,i)=>i===index?value:v)}}}:n)}),
    info: exchangeNodeInfo(node, editor.definition, catalog), linkedInputs: editor.definition.edges.filter(e => e.target === node.id).map(e => e.targetHandle),
    endEdit: () => {}, update: (name, value) => commit({nodes: editor.definition.nodes.map(n => n.id === node.id ? {...n,data:{...n.data,widgets:{...n.data.widgets,[name]:value}}} : n)}) } });
  const nodes = useMemo(() => editor.definition.nodes.map((node) => native ? nativeNode(node) : ({ ...node, measured: measurements.find(n=>n.id===node.id)?.measured || node.measured, dragHandle: undefined, selected: selectedIds.includes(node.id), data: { ...node.data, nodeType: node.type, locked: readOnly || loading || startingRun.current, isActive: node.id === activeStep?.id, isComplete: completedNodeIds.has(node.id) && run?.context?.nodeResults?.[node.id]?.kind !== "skipped", isSkipped: run?.context?.nodeResults?.[node.id]?.kind === "skipped", isFailed: run?.context?.nodeResults?.[node.id]?.kind === "failed", onSelect: (additive) => selectNode(node.id, additive), onValueFocus: recordHistory, onValueChange: (value) => changeNodeValue(node.id, value), onFieldChange: (key, value) => changeNodeData(node.id, key, value), previewUrl: artifactUrl && ["ksampler", "preview", "save_image"].includes(node.type) ? artifactUrl : null } })), [editor.definition.nodes, editor.definition.edges, selectedIds, activeStep?.id, completedNodeIds, artifactUrl, loading, runBusy, native, catalog, readOnly, measurements, nativeJob]);
  const edges = useMemo(() => editor.definition.edges.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [editor.definition.edges]);
  const selectedNode = editor.definition.nodes.find((node) => node.id === selectedId);
  const selectedEdge = editor.definition.edges.find((edge) => edge.id === selectedEdgeId);
  const groups = editor.definition.groups ?? [];
  const originalGroups=native && editor.definition.comfyExchange?.source?.groups;
  const groupBounds = originalGroups && JSON.stringify(groups)===JSON.stringify(editor.definition.comfyExchange.groups)
    ? originalGroups.map((g,index)=>({id:`original-${index}`,title:g.title || '节点分组',color:g.color || '#9ed85b',left:g.bounding[0],top:g.bounding[1],width:g.bounding[2],height:g.bounding[3]}))
    : measuredGroupBounds(editor.definition, measurements);
  const issues = workflowIssues(editor.definition);
  const warnings = native ? [] : workflowWarnings(editor.definition);
  const filteredRuns = recentRuns.filter((item) => runFilter === "全部" || (runFilter === "进行中" ? item.status === "in_progress" : item.status === "completed"));
  const activePalette = native ? Object.fromEntries(Object.entries(catalog).map(([type, info]) => [type, {title:info.display_name || type,hint:info.category || '',group:info.category || 'ComfyUI',color:'#9ed85b'}])) : palette;
  const visiblePalette = Object.entries(activePalette).filter(([type, meta]) => (nodeGroup === "全部" || meta.group === nodeGroup) && `${type} ${meta.title} ${meta.hint}`.toLowerCase().includes(nodeQuery.trim().toLowerCase()));

  const addNode = (type, position) => {
    const count = editor.definition.nodes.filter((node) => node.type === type).length + 1;
    if (readOnly) return;
    if (editor.definition.nodes.length >= 80) return onNotice("最多 80 个节点");
    if (native) { commit({nodes:[...editor.definition.nodes,nodeFromInfo(newId(type),type,catalog[type],position || {x:100,y:100})]}); return; }
    const node = { id: newId(type), type, position: position ?? { x: 150 + (editor.definition.nodes.length % 4) * 270, y: 100 + Math.floor(editor.definition.nodes.length / 4) * 210 }, data: { label: `${palette[type].title} ${count}`, description: palette[type].hint, value: palette[type].defaultValue ?? '', ...palette[type].defaults } };
    commit({ nodes: [...editor.definition.nodes, node] }); setSelectedId(node.id); setSelectedIds([node.id]); setQuickAdd(null); setQuickQuery("");
  };
  const insertPreset = (kind) => {
    const preset = createPlatformPreset(kind, newId);
    if (editor.definition.nodes.length + preset.nodes.length > 80 || editor.definition.edges.length + preset.edges.length > 160) { onNotice('插入后会超过 80 个节点或 160 条连线上限'); return; }
    const offset = editor.definition.nodes.length ? Math.max(...editor.definition.nodes.map(node => node.position.y)) + 600 : 0;
    commit({ nodes: [...editor.definition.nodes, ...preset.nodes.map(node => ({ ...node, position: { x: node.position.x, y: node.position.y + offset } }))], edges: [...editor.definition.edges, ...preset.edges] });
    setSelectedIds(preset.nodes.map(node => node.id)); setSelectedId(preset.nodes[0].id);
    requestAnimationFrame(() => void flow?.fitView({ padding: 0.2 }));
    onNotice('示例节点与连线已插入画布，可直接编辑参数。');
  };
  const updateNode = (key, value) => commit({ nodes: editor.definition.nodes.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, [key]: value } } : node) });
  const selectedNodeIds = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
  const createGroup = () => {
    if (selectedNodeIds.length < 2) { onNotice("请按住 Shift 选择至少两个节点后建组"); return; }
    if (groups.length >= 20) { onNotice("每张画布最多创建 20 个分组"); return; }
    const group = { id: newId("group"), title: `节点组 ${groups.length + 1}`, color: "#9ed85b", nodeIds: [...selectedNodeIds] };
    commit({ groups: [...groups, group] });
  };
  const renameGroup = (id, title) => commit({ groups: groups.map((group) => group.id === id ? { ...group, title } : group) }, false);
  const deleteGroup = (id) => commit({ groups: groups.filter((group) => group.id !== id) });
  const deleteNode = () => { if (!selectedNodeIds.length) return; const ids = new Set(selectedNodeIds); commit({ nodes: editor.definition.nodes.filter((node) => !ids.has(node.id)), edges: editor.definition.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)), groups: groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !ids.has(id)) })).filter((group) => group.nodeIds.length >= 2) }); setSelectedId(null); setSelectedIds([]); };
  const copyNodes = () => {
    const ids = new Set(selectedNodeIds);
    if (!ids.size) return;
    copiedGraph.current = { nodes: structuredClone(editor.definition.nodes.filter((node) => ids.has(node.id))), edges: structuredClone(editor.definition.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))) };
    setHasCopiedGraph(true);
    pasteCount.current = 0;
    onNotice(`已复制 ${ids.size} 个节点`);
  };
  const pasteNodes = () => {
    if (!copiedGraph.current?.nodes.length) return;
    if (editor.definition.nodes.length + copiedGraph.current.nodes.length > 80 || editor.definition.edges.length + copiedGraph.current.edges.length > 160) { onNotice("粘贴后会超过工作流的 80 个节点或 160 条连线上限"); return; }
    pasteCount.current += 1;
    const shift = 48 * pasteCount.current;
    const ids = new Map(copiedGraph.current.nodes.map((node) => [node.id, newId(node.type)]));
    const pastedNodes = copiedGraph.current.nodes.map((node) => ({ ...node, id: ids.get(node.id), position: { x: node.position.x + shift, y: node.position.y + shift }, data: { ...node.data } }));
    const pastedEdges = copiedGraph.current.edges.map((edge) => ({ ...edge, id: newId("edge"), source: ids.get(edge.source), target: ids.get(edge.target) }));
    commit({ nodes: [...editor.definition.nodes, ...pastedNodes], edges: [...editor.definition.edges, ...pastedEdges] });
    setSelectedIds(pastedNodes.map((node) => node.id)); setSelectedId(pastedNodes[0].id); setSelectedEdgeId(null);
  };
  const duplicateNode = () => {
    if (!selectedNode) return;
    if (editor.definition.nodes.length >= 80) return onNotice("最多 80 个节点");
    const node = { ...selectedNode, id: newId(selectedNode.type), position: { x: selectedNode.position.x + 42, y: selectedNode.position.y + 42 }, data: { ...selectedNode.data, label: `${selectedNode.data.label || palette[selectedNode.type].title} 副本` } };
    commit({ nodes: [...editor.definition.nodes, node] }); setSelectedId(node.id); setSelectedIds([node.id]);
  };
  const deleteEdge = () => { if (!selectedEdgeId) return; commit({ edges: editor.definition.edges.filter((edge) => edge.id !== selectedEdgeId) }); setSelectedEdgeId(null); };
  const isValidConnection = (connection) => {
    if (readOnly || loading || editor.definition.edges.length >= 160) return false;
    if (native) return validConnection(connection, editor.definition, Object.fromEntries(editor.definition.nodes.map(n => [n.data.classType,exchangeNodeInfo(n,editor.definition,catalog)])));
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    const sourceType = editor.definition.nodes.find(node => node.id === connection.source)?.type;
    const targetType = editor.definition.nodes.find(node => node.id === connection.target)?.type;
    const outputPorts = sourceType === 'condition' ? ['true','false','error'] : ['output','error'];
    if (!outputPorts.includes(connection.sourceHandle || 'output')) return false;
    if (!platformInputPorts(targetType).some(([port]) => port === (connection.targetHandle ?? 'input'))) return false;
    if (targetType === 'prompt_merge' && ((connection.targetHandle === 'positive' && ['negative_prompt', 'text_to_negative'].includes(sourceType)) || (connection.targetHandle === 'negative' && ['input', 'prompt', 'skill', 'text_generate', 'text_to_prompt'].includes(sourceType)))) return false;
    if (additionalPlatformNodes[targetType] && !['error'].includes(connection.sourceHandle) && editor.definition.edges.some(edge => edge.target === connection.target && (edge.targetHandle ?? 'input') === (connection.targetHandle ?? 'input'))) return false;
    if (editor.definition.edges.some((edge) => edge.source === connection.source && edge.target === connection.target && (edge.targetHandle ?? 'input') === (connection.targetHandle ?? 'input'))) return false;
    const outgoing = new Map(editor.definition.nodes.map((node) => [node.id, []]));
    editor.definition.edges.forEach((edge) => outgoing.get(edge.source)?.push(edge.target));
    const seen = new Set(); const queue = [connection.target];
    while (queue.length) { const id = queue.shift(); if (id === connection.source) return false; if (seen.has(id)) continue; seen.add(id); queue.push(...(outgoing.get(id) || [])); }
    return true;
  };
  const connect = (connection) => {
    if (!isValidConnection(connection)) return;
    commit({ edges: addEdge({ ...connection, id: newId("edge") }, editor.definition.edges) }); setSelectedEdgeId(null);
  };

  const autoLayout = () => {
    commit({ nodes: layoutGraph(editor.definition, flow?.getNodes() || measurements) });
    window.setTimeout(() => flow?.fitView({ padding: 0.2, duration: 280 }), 0);
  };
  const fitCanvas = () => flow?.fitView({ padding: 0.2, duration: 280 });
  const openQuickAdd = (event) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setQuickAdd({ x: Math.min(event.clientX - bounds.left, bounds.width - 270), y: Math.min(event.clientY - bounds.top, bounds.height - 340), position: flow?.screenToFlowPosition?.({ x: event.clientX, y: event.clientY }) });
    setQuickQuery("");
  };
  const quickResults = Object.entries(activePalette).filter(([type, meta]) => `${type} ${meta.title} ${meta.hint}`.toLowerCase().includes(quickQuery.trim().toLowerCase()));
  /**
   * 试运行与发布彻底分开：点运行只会把当前画布存成一个「草稿版本」再跑，
   * 绝不会顺手发布给别人。发布是右下角那个单独按钮 + 二次确认的事。
   */
  const runWorkflow = async () => {
    if (startingRun.current || runBusy) return;
    if (native) {
      if (!workerOnline) {setNativeError('没有在线且已配对的 GPU Worker；可继续编辑与导出。');return;}
      startingRun.current=true;setRunBusy(true);setNativeError('');
      try {
        const prompt=compilePrompt(editor.definition,catalog);
        const saved=readOnly?null:await onSave?.(false,{...editor.definition,comfyPrompt:prompt});
        if(!readOnly&&!saved)return;
        if(!mounted.current)return;
        const next=await startWorkflowRun(selected.id,{},saved?.id || selected.versionId || selected.versions?.[0]?.id);
        if(!mounted.current)return;
        setRun(next);setNativeJob(await getComfyJob(next.id));setPanel('run');void loadRuns();
      }catch(e){setNativeError(e.message);onNotice(e.message);}finally{startingRun.current=false;setRunBusy(false);}
      return;
    }
    if (readOnly) return;
    if (issues.length) { onNotice(issues[0]); return; }
    if (publishIssues(editor.definition).length) { onNotice(publishIssues(editor.definition)[0]); return; }
    startingRun.current = true;
    setRunBusy(true);
    setRunError("");
    try {
      // 画布上有未保存改动、或这张图还没存过版本时，先落一个草稿版本再试运行。
      let versionId = selected.versions?.[0]?.id;
      if (dirty || !versionId) {
        const saved = await onSave(false);
        if (!saved) { setRunError('草稿未保存成功，请检查提示后重试。'); return; }
        versionId = saved.id;
      }
      if (!mounted.current) return;
      const next = await startWorkflowRun(selected.id, {}, versionId);
      if (!mounted.current) return;
      setRun(next); setRunPrompt(""); setRunNegativePrompt(""); void loadRuns();
      onNotice(next.trialRun ? "草稿试运行已启动：这一版没有发布，其他人看不到。" : "运行已启动：节点将按连接顺序执行。");
    } catch (error) { setRunError(error.message); onNotice(error.message); }
    finally { startingRun.current = false; setRunBusy(false); }
  };
  const confirmPublish = async () => {
    setPublishBusy(true);
    try { if (await onSave(true)) setPublishOpen(false); }
    finally { setPublishBusy(false); }
  };
  const executingNode = useRef(false);
  const executeCurrentNode = async () => {
    if (!run || !activeNode || executingNode.current) return;
    // 只有整条链路一句提示词都没有时，才真的需要人写一句需求；
    // 工作流自带正向提示词时这里必须放行，否则自动推进会被这条守卫悄悄掐断。
    if (!skipNode(run.definition, activeNode.id, run.context?.nodeResults) && activeNode.type === "input" && !runPrompt.trim() && !String(activeNode.data.value || "").trim() && !nodesCarryPrompt(runNodes, run?.edges ?? [], activeStep?.id)) {
      onNotice("请填写创作需求，或在输入节点配置默认值。");
      return;
    }
    executingNode.current = true;
    setRunBusy(true);
    setRunError("");
    try {
      let referenceFileId, maskFileId;
      if (activeNode.type === "load_image" && !skipNode(run.definition, activeNode.id, run.context?.nodeResults)) {
        if (!referenceFile?.imageFile || referenceFile.maskPending) { onNotice("请先选择一张已获授权的参考图片。"); return; }
        const uploaded = await uploadTemporaryCreationFile(referenceFile.imageFile);
        if (referenceFile.maskFile) maskFileId = (await uploadTemporaryCreationFile(referenceFile.maskFile)).id;
        referenceFileId = uploaded.id;
      }
      const next = await executeWorkflowRun(run.id, { ...(activeNode.type === "input" && runPrompt.trim() ? { prompt: runPrompt.trim() } : {}), ...(activeNode.type === "negative_prompt" && runNegativePrompt.trim() ? { negativePrompt: runNegativePrompt.trim() } : {}), ...(referenceFileId ? { referenceFileId, ...(maskFileId ? { maskFileId } : {}) } : {}) });
      setRun(next); setInspectedRun((current) => current?.id === next.id ? next : current); void loadRuns();
      if (referenceFileId) setReferenceFile(null);
      if (next.status === "completed") onNotice("工作流已执行完成，结果已写入本次运行记录。");
    } catch (error) { setRunError(error.message); onNotice(error.message); }
    finally { executingNode.current = false; setRunBusy(false); }
  };

  /**
   * 一键跑到底：试运行开始后，能自己跑的节点全部自己跑完（含负向提示词与出图），
   * 不再要求一个节点一个节点点「执行当前节点」。
   * 只有非现场给不可的两件事会停下来等人：没配默认值的创作需求、要上传的参考图片。
   */
  const autoAdvanced = useRef("");
  useEffect(() => {
    if (native || !run || run.status !== "in_progress" || runBusy || runError) return;
    const step = run.steps[run.currentStep];
    const node = runNodes.find((item) => item.id === step?.id);
    if (!node) return;
    if (node.type === "load_image" && !skipNode(run.definition, node.id, run.context?.nodeResults)) return;
    // 正向/负向提示词直接读节点默认值；只有整条链路一句提示词都没有时，才停下来问人要需求。
    if (!skipNode(run.definition, node.id, run.context?.nodeResults) && node.type === "input" && !String(node.data?.value ?? "").trim() && !nodesCarryPrompt(runNodes, run?.edges ?? [], node.id)) return;
    const key = `${run.id}:${run.currentStep}`;
    if (autoAdvanced.current === key) return;
    autoAdvanced.current = key;
    void executeCurrentNode();
  }, [run, runBusy, runError, runNodes]);

  // 运行面板在画布下面（首屏看不到），试运行一开始就把它滚进视野，否则等于没有入口。
  const runPanelRef = useRef(null);
  useEffect(() => {
    if (run?.id) runPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [run?.id]);

  useEffect(() => {
    if (!flow || !editor.definition.nodes.length) return;
    const frame = window.requestAnimationFrame(() => flow.fitView({ padding: 0.12, maxZoom: 0.85, duration: 0 }));
    return () => window.cancelAnimationFrame(frame);
  }, [flow, selected.id]);

  useEffect(() => {
    if (!flow || !canvasWrapRef.current || typeof ResizeObserver === 'undefined') return;
    let frame;
    let previousSize = '';
    const observer = new ResizeObserver(([entry]) => {
      const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
      if (!previousSize) { previousSize = size; return; }
      if (size === previousSize) return;
      previousSize = size;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (flow.getNodes().some(node => node.measured?.width)) void flow.fitView({ padding: 0.12, maxZoom: 0.85, duration: 0 }); });
    });
    observer.observe(canvasWrapRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [flow, selected.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!editing && !readOnly && !loading) onSave?.(false); return; }
      if (editing || readOnly || loading || startingRun.current) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedNodeIds.length) { event.preventDefault(); copyNodes(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && copiedGraph.current?.nodes.length) { event.preventDefault(); pasteNodes(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selectedId) { event.preventDefault(); duplicateNode(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); const bounds = document.querySelector(".workflow-flow-wrap")?.getBoundingClientRect(); if (bounds) { const x = bounds.left + bounds.width / 2; const y = bounds.top + bounds.height / 2; setQuickAdd({ x: bounds.width / 2 - 130, y: bounds.height / 2 - 150, position: flow?.screenToFlowPosition?.({ x, y }) }); } return; }
      if (event.key === "Escape") { setSelectedId(null); setSelectedIds([]); setSelectedEdgeId(null); setQuickAdd(null); }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId) deleteNode(); else if (selectedEdgeId) deleteEdge();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, selectedIds, selectedEdgeId, loading, onSave, history, editor.definition, flow]);

  return createPortal(<div className={`page-content workflow-canvas-page workflow-editor-fullscreen ${native ? 'is-exchange' : ''} ${readOnly ? 'is-readonly' : ''} panel-${panel} ${paletteOpen ? "palette-open" : ""}`}>
    <button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 退出编辑</button>
    <section className="workflow-canvas-topbar"><div><p>{(selected.versions?.find(v=>v.published)?`公开 V${selected.versions.find(v=>v.published).versionNumber} · `:"")+(dirty ? "本机编辑尚未保存" : "当前编辑版本已保存")}</p><h1>{editor.name || "未命名节点工作流"}</h1><span>按住节点的非输入区域即可拖动；拖动画布空白处平移，滚轮缩放。{dirty ? "本机草稿尚未保存为版本。" : "当前版本已保存。"}</span></div><div className="workflow-editor-actions"><button className="outline-button" aria-pressed={paletteOpen} onClick={() => setPaletteOpen(v => !v)}><Plus size={16} />节点库</button><button className="outline-button" disabled={loading || runBusy} onClick={() => onSave(false)}><FloppyDisk size={16} />保存</button>{/* 运行入口放在首屏：运行面板在画布下面，只靠它等于没有入口。 */}<button className="primary-button workflow-canvas-run-top" disabled={loading || runBusy} onClick={() => { setPanel("run"); void runWorkflow(); }}>{runBusy ? <SpinnerGap className="spin" /> : <Play size={16} weight="fill" />}{runBusy ? "正在运行…" : run?.status === "completed" ? "再跑一次" : "试运行当前流程"}</button><label className="outline-button"><UploadSimple size={16} /> 导入 JSON<input hidden type="file" accept="application/json,.json" onChange={onImport} /></label><button className="outline-button" onClick={onExport}><DownloadSimple size={16} /> 导出 JSON</button></div></section>
    <section className="workflow-canvas-shell">
      <aside className="workflow-node-palette" hidden={readOnly}><p>// NODE LIBRARY</p><h2>节点库</h2><span>{Object.keys(activePalette).length} 种节点 · 按类型搜索，点击添加到画布</span><div className="workflow-preset-actions" hidden={native}><strong>插入示例链路</strong><button className="outline-button" disabled={loading} onClick={() => insertPreset('image-edit')}>图片编辑与局部重绘</button><button className="outline-button" disabled={loading} onClick={() => insertPreset('prompt-tools')}>提示词整理模板</button><button className="outline-button" disabled={loading} onClick={() => insertPreset('text-join')}>文字拼接模板</button></div><label className="workflow-node-search"><MagnifyingGlass size={15} /><input value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} placeholder="搜索节点，例如 KSampler" /></label><div className="workflow-node-groups"><button className={nodeGroup === "全部" ? "is-active" : ""} onClick={() => setNodeGroup("全部")}>全部</button>{(native ? [...new Set(Object.values(activePalette).map(p=>p.group))] : paletteGroups).map((group) => <button key={group} className={nodeGroup === group ? "is-active" : ""} onClick={() => setNodeGroup(group)}>{group}</button>)}</div><div className="workflow-node-list">{visiblePalette.map(([type, meta]) => <button key={type} draggable onClick={() => addNode(type)} onDragStart={(event) => { event.dataTransfer.setData("application/artedu-node", type); event.dataTransfer.effectAllowed = "copy"; }} style={{ "--node-color": meta.color }}><i><FlowArrow size={16} /></i><span><em>{meta.group}</em><strong>{meta.title}</strong><small>{meta.hint}</small></span><Plus size={15} /></button>)}{!visiblePalette.length && <div className="workflow-node-empty">没有匹配的节点</div>}</div><div className="workflow-canvas-tip"><strong>执行说明</strong><span>按连线顺序传递输入；文本和图片生成调用平台已配置的模型服务。计算通过 API 执行；未配置对应能力的节点不可运行。</span></div></aside>
      {/* fitView 交给 ReactFlow 自己做：它会在节点测量完成后再适配。
          以前只靠一个 rAF 里的 fitView()，加上 onlyRenderVisibleElements，
          视口偏掉时会形成「节点没渲染 → 量不出尺寸 → 更适配不了」的死结，画布看起来是空的。 */}
      <div className="workflow-flow-wrap" ref={canvasWrapRef} onDragOver={(event) => { if (event.dataTransfer.types.includes("application/artedu-node")) event.preventDefault(); }} onDrop={(event) => { const type = event.dataTransfer.getData("application/artedu-node"); if (!type || !activePalette[type]) return; event.preventDefault(); addNode(type, flow?.screenToFlowPosition?.({ x: event.clientX, y: event.clientY })); }} onContextMenu={readOnly ? undefined : openQuickAdd} onDoubleClick={(event) => { if (!readOnly && event.target.closest(".react-flow__pane")) openQuickAdd(event); }}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={editor.definition.viewport} fitView fitViewOptions={{ padding: 0.12, maxZoom: 0.85 }} onInit={setFlow} nodesDraggable={!readOnly && !loading && !startingRun.current} nodesConnectable={!readOnly && !loading && !startingRun.current} elementsSelectable deleteKeyCode={null} panOnDrag zoomOnScroll snapToGrid snapGrid={[20, 20]} connectionLineType={ConnectionLineType.SmoothStep} isValidConnection={isValidConnection} onNodesChange={(changes) => { if (changes.some(c => c.type === "dimensions")) setMeasurements(current => {
          const updated=new Map(current.map(n=>[n.id,n]));
          for(const change of changes) if(change.type==='dimensions' && change.dimensions) updated.set(change.id,{id:change.id,measured:change.dimensions});
          return [...updated.values()];
        }); const relevant = changes.filter((change) => change.type !== "select" && change.type !== "dimensions"); if (relevant.length) commit({ nodes: applyNodeChanges(relevant, editor.definition.nodes) }, !relevant.every((change) => change.type === "position")); }} onNodeDragStart={recordHistory} onEdgesChange={(changes) => { const relevant = changes.filter((change) => change.type !== "select"); if (relevant.length) commit({ edges: applyEdgeChanges(relevant, editor.definition.edges) }); }} onConnect={connect} onNodeClick={(event, node) => { if (native) selectNode(node.id,event.shiftKey); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); setSelectedIds([]); }} onPaneClick={() => { setSelectedId(null); setSelectedIds([]); setSelectedEdgeId(null); }} onMoveEnd={(event, viewport) => { if (native && !event) return; if (JSON.stringify(viewport) !== JSON.stringify(editor.definition.viewport)) commit({ viewport }, false); }}><ViewportPortal>{groupBounds.map((group) => <div key={group.id} className="workflow-canvas-group" style={{ left: group.left, top: group.top, width: group.width, height: group.height, "--group-color": group.color }}><strong>{group.title}</strong></div>)}</ViewportPortal><Background color="#374151" gap={20} size={1} /><MiniMap pannable zoomable nodeColor={(node) => palette[node.type]?.color || "#78859b"} /><Controls showInteractive={false} /><div className="workflow-flow-tools"><button type="button" disabled={!selectedNodeIds.length} onClick={copyNodes} title="复制选中节点 Ctrl+C">复制</button><button type="button" disabled={!hasCopiedGraph} onClick={pasteNodes} title="粘贴节点 Ctrl+V">粘贴</button><button type="button" disabled={!history.past.length} onClick={undo} title="撤销 Ctrl+Z">撤销</button><button type="button" disabled={!history.future.length} onClick={redo} title="重做 Ctrl+Y">重做</button><button type="button" onClick={() => { const bounds = document.querySelector(".workflow-flow-wrap")?.getBoundingClientRect(); if (bounds) { const x = bounds.left + bounds.width / 2; const y = bounds.top + bounds.height / 2; setQuickAdd({ x: bounds.width / 2 - 130, y: bounds.height / 2 - 150, position: flow?.screenToFlowPosition?.({ x, y }) }); } }} title="快速添加节点">+ 节点</button><button type="button" onClick={autoLayout} title="按连接关系自动整理节点"><MagicWand size={15} /> 自动整理</button><button type="button" onClick={fitCanvas} title="让全部节点适配画布"><ArrowsOut size={15} /> 适配画布</button></div></ReactFlow>{quickAdd && <div className="workflow-quick-add" style={{ left: Math.max(8, quickAdd.x), top: Math.max(8, quickAdd.y) }} onClick={(event) => event.stopPropagation()}><div className="workflow-quick-add__title"><strong>添加节点</strong><button onClick={() => setQuickAdd(null)} aria-label="关闭节点搜索"><X size={16} /></button></div><label><MagnifyingGlass size={16} /><input autoFocus value={quickQuery} onChange={(event) => setQuickQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && quickResults[0]) addNode(quickResults[0][0], quickAdd.position); if (event.key === "Escape") setQuickAdd(null); }} placeholder="搜索节点，Enter 添加" /></label><div className="workflow-quick-add__list">{quickResults.map(([type, meta]) => <button key={type} onClick={() => addNode(type, quickAdd.position)}><i style={{ background: meta.color }} /><span><strong>{meta.title}</strong><small>{meta.group}</small></span><Plus size={14} /></button>)}</div></div>}{preview && <div className="workflow-preview-toast"><strong>本地结构预览</strong><span>{preview}</span><button onClick={() => setPreview("")}><X size={15} /></button></div>}</div>
    </section>
    <aside className="workflow-editor-sidebar"><nav aria-label="编辑面板"><button onClick={() => setPanel("settings")} aria-pressed={panel === "settings"}>参数配置</button><button onClick={() => setPanel("run")} aria-pressed={panel === "run"}>运行与结果</button><button onClick={() => setPanel("history")} aria-pressed={panel === "history"}>历史</button></nav>
      <aside className="workflow-inspector" inert={readOnly || undefined}><p>// INSPECTOR</p><h2>{selectedNode ? "节点配置" : selectedEdge ? "连线配置" : "工作流配置"}</h2>{selectedNode?.type === "comfy" ? <div className="workflow-form"><strong>{selectedNode.data.classType}</strong><p>参数在画布节点内编辑。支持类型端口连线与离线导出。</p><button onClick={duplicateNode} disabled={readOnly}>复制节点</button><button onClick={deleteNode} disabled={readOnly}>删除节点</button></div> : selectedNode ? <div className="workflow-form"><div className="node-type-badge" style={{ "--node-color": palette[selectedNode.type]?.color }}>{palette[selectedNode.type]?.title}</div><label>节点名称<input value={selectedNode.data.label || ""} onChange={(event) => updateNode("label", event.target.value)} /></label><label>节点说明<textarea value={selectedNode.data.description || ""} onChange={(event) => updateNode("description", event.target.value)} /></label>{(!additionalPlatformNodes[selectedNode.type] || palette[selectedNode.type]?.valueLabel) && <label>{palette[selectedNode.type]?.valueLabel || "默认值 / 参数"}<textarea value={selectedNode.data.value || ""} onChange={(event) => updateNode("value", event.target.value)} placeholder={selectedNode.type === "skill" ? "例如：提取纹样骨架；保持四方连续；应用低饱和配色" : "节点参数"} /></label>}<NodeOptions type={selectedNode.type} data={selectedNode.data} onChange={updateNode} disabled={loading} onFocus={recordHistory} /><label>示例输入<textarea value={selectedNode.data.exampleInput || ""} onChange={(event) => updateNode("exampleInput", event.target.value)} placeholder="给学习者一个可直接参考的输入" /></label><label>参数说明<textarea value={selectedNode.data.parameterDescription || ""} onChange={(event) => updateNode("parameterDescription", event.target.value)} placeholder="解释尺寸、风格、步骤数等参数如何影响结果" /></label><label>示例输出<textarea value={selectedNode.data.exampleOutput || ""} onChange={(event) => updateNode("exampleOutput", event.target.value)} placeholder="描述或粘贴该步骤预期的输出示例" /></label><label>预计用时<input type="number" min="0" max="1440" value={selectedNode.data.estimatedMinutes ?? 10} onChange={(event) => updateNode("estimatedMinutes", Number(event.target.value))} /><small>用于学生端步骤提示，不影响图结构。</small></label><button className="outline-button" onClick={duplicateNode}><Plus size={15} /> 复制节点</button><button className="danger-text-button" onClick={deleteNode}><X size={15} /> 删除节点</button></div> : selectedEdge ? <div className="workflow-edge-inspector"><strong>{editor.definition.nodes.find((node) => node.id === selectedEdge.source)?.data?.label || selectedEdge.source}</strong><FlowArrow size={18} weight="bold" /><strong>{editor.definition.nodes.find((node) => node.id === selectedEdge.target)?.data?.label || selectedEdge.target}</strong><span>这条连线代表数据从上游节点传递到下游节点。</span><button className="danger-text-button" onClick={deleteEdge}><X size={15} /> 删除连线</button></div> : <div className="workflow-form"><label>工作流名称<input value={editor.name} onChange={(event) => onChange("name", event.target.value)} /></label><label>工作流描述<textarea value={editor.description} onChange={(event) => onChange("description", event.target.value)} /></label><label>分类<input value={editor.category} onChange={(event) => onChange("category", event.target.value)} /></label><label>入口<select value={editor.entryType} onChange={(event) => onChange("entryType", event.target.value)}><option value="chat">教学对话</option><option value="workbench">设计工作台</option><option value="external_tool">外部工具</option></select></label><label>提示模板（可选）<textarea value={editor.promptTemplate} onChange={(event) => onChange("promptTemplate", event.target.value)} placeholder="供未来模型节点调用的全局提示词" /></label></div>}<div className={`workflow-graph-check ${issues.length ? "is-error" : ""}`}><strong>{issues.length ? "图结构待修复" : "图结构有效"}</strong><span>{issues[0] || `${editor.definition.nodes.length} 个节点 · ${editor.definition.edges.length} 条连接`}</span>{!issues.length && warnings[0] && <em>{warnings[0]}</em>}</div></aside>
    <section className="workflow-group-panel" aria-label="画布节点分组"><div><strong>画布分组</strong><span>按住 Shift 点选多个节点，给相关步骤加一个可命名的视觉分组。</span></div><button className="outline-button" disabled={selectedNodeIds.length < 2} onClick={createGroup}><Plus size={15} /> 将选中节点建组</button>{groups.map((group) => <label key={group.id}><i style={{ background: group.color }} /><input aria-label={`分组 ${group.title} 名称`} value={group.title} onFocus={recordHistory} onChange={(event) => renameGroup(group.id, event.target.value)} maxLength={80} /><small>{group.nodeIds.length} 个节点</small><button aria-label={`删除分组 ${group.title}`} onClick={() => deleteGroup(group.id)}><X size={15} /></button></label>)}</section>
    <details className="workflow-learning-config"><summary>学习图谱关联 · 知识、工具与能力目标</summary><p>随当前工作流版本保存。工具名称是配置说明，不是用户实际使用的证明；能力目标也不是能力评分。</p>
        <LearningBindingFields disabled={loading} value={editor.definition.learning} onChange={(key, value) => !readOnly && !loading && onDefinition({ ...editor.definition, learning: { ...editor.definition.learning, [key]: value } })} />
    </details>
    {native && <section className="workflow-native-runtime" aria-live="polite"><h2>{nativeJob ? ({queued:'排队中',running:'正在运行',cancelling:'正在取消',completed:'运行完成',failed:'运行失败',cancelled:'已取消'})[nativeJob.status] : workerOnline ? 'GPU Worker 已就绪' : '等待连接 GPU Worker'}</h2>{nativeJob && <><p>{nativeJob.progress?.node ? `节点 ${nativeJob.progress.node}` : ''}</p>{nativeJob.error && <p role="alert">{nativeJob.error}</p>}{nativeJob.previewUrl && <ZoomableImage src={nativeJob.previewUrl} alt="采样实时预览"/>}{nativeJob.artifacts?.map(a=><ZoomableImage key={a.id} src={a.downloadUrl} alt="GPU 生成图片" fileName={a.fileName}/>)}{['queued','running'].includes(nativeJob.status) && <button onClick={async()=>{try{setNativeJob(await cancelComfyJob(nativeJob.runId));}catch(e){setNativeError(e.message);}}}>取消运行</button>}{['failed','cancelled'].includes(nativeJob.status) && <button onClick={async()=>{try{const next=await retryComfyJob(nativeJob.runId);setNativeJob(await getComfyJob(next.id));}catch(e){setNativeError(e.message);}}}>重试运行</button>}</>}</section>}
    <section hidden={native} className="workflow-canvas-runner" aria-live="polite" ref={runPanelRef}>
      <div><p>// TRY RUN ON CANVAS</p><h2>{run?.status === "completed" ? (run.trialRun ? "本次草稿试运行已完成" : "本次运行已完成") : activeNode ? `正在执行：${activeNode.data.label || activeNode.type}` : "从画布试运行"}</h2><span>{run ? `${run.trialRun ? "草稿试运行 · " : ""}${Math.round((run.currentStep / Math.max(run.totalSteps, 1)) * 100)}% · ${run.currentStep}/${run.totalSteps} 个节点已完成` : "点一次试运行就自动跑到出图：正向/负向提示词都读节点里配好的默认值。只有「要上传参考图片」或「整条链路一句提示词都没有」时才会停下来问你。试运行不会发布；要让别人用，再点右下角的「保存并发布」。"}</span></div>
      {run && <div className="workflow-run-progress" aria-label={`运行进度 ${Math.round((run.currentStep / Math.max(run.totalSteps, 1)) * 100)}%`}><i style={{ width: `${Math.round((run.currentStep / Math.max(run.totalSteps, 1)) * 100)}%` }} /></div>}
      {!run && <button className="primary-button" disabled={loading || runBusy} onClick={runWorkflow}>{runBusy ? <SpinnerGap className="spin" /> : <Play size={16} weight="fill" />}{dirty || !selected.versions?.length ? "保存草稿并试运行" : "试运行（不发布）"}</button>}
      {run?.status === "in_progress" && activeNode && <div className="workflow-canvas-runner__step"><div><strong>{activeNode.data.label || activeNode.type}</strong><small>{activeNode.data.description || palette[activeNode.type]?.hint}</small></div>{activeNode.type === "input" && <label>创作需求<textarea value={runPrompt} onChange={(event) => setRunPrompt(event.target.value)} placeholder="例如：为新生设计一张青绿色的传统纹样海报" /></label>}{activeNode.type === "negative_prompt" && <label>本次负向提示词<textarea value={runNegativePrompt} onChange={(event) => setRunNegativePrompt(event.target.value)} placeholder={activeNode.data.value || "例如：文字、水印、模糊"} maxLength={1500} /><small>留空使用节点默认值</small></label>}{activeNode.type === "load_image" && <WorkflowImageInput value={referenceFile} onChange={setReferenceFile} disabled={runBusy} />}<button className="primary-button" disabled={runBusy || (activeNode.type === "load_image" && (!referenceFile?.imageFile || referenceFile.maskPending))} onClick={executeCurrentNode}>{runBusy ? <SpinnerGap className="spin" /> : <Play size={16} weight="fill" />}{activeNode.type === "input" ? "开始生成" : activeNode.type === "load_image" ? "上传并继续" : "执行当前节点"}</button></div>}
      {runBusy && activeNode?.type === "ksampler" && <small className="workflow-canvas-runner__status">图片服务可能排队数分钟，请勿重复点击或关闭页面。</small>}
      {runError && <p className="workflow-canvas-runner__error" role="alert">{runError}</p>}
      {run?.status === "completed" && <div className="workflow-canvas-runner__done"><CheckCircle size={20} weight="fill" /> 已完成。{run.context?.artifact?.downloadUrl && (isImageArtifact(run.context.artifact) ? <ZoomableImage src={run.context.artifact.downloadUrl} alt={run.context.artifact.fileName ?? "工作流生成的图片"} fileName={run.context.artifact.fileName ?? ""} /> : <a href={run.context.artifact.downloadUrl} target="_blank" rel="noreferrer">查看生成作品</a>)}{run.context?.text && <span>{run.context.text}</span>}</div>}
      {!canPublish && <small>草稿可自行试运行；发布给其他人使用需要教师、运营或管理员身份。</small>}
    </section>
    <section className="workflow-run-history" aria-label="运行任务与历史">
      <header><div><p>// RUN TASKS</p><h2>运行任务与历史</h2><span>本账号在这条工作流上的全部运行，分批展开。未完成任务按更新时间排在前面，可继续执行。</span></div><button className="outline-button" disabled={runsLoading} onClick={loadRuns}>{runsLoading ? <SpinnerGap size={16} className="spin" /> : <FlowArrow size={16} />} 刷新任务</button></header>
      <div className="workflow-run-history__filters">{["全部", "进行中", "已完成"].map((filter) => <button key={filter} className={runFilter === filter ? "is-active" : ""} onClick={() => setRunFilter(filter)}>{filter} <span>{filter === "全部" ? recentRuns.length : recentRuns.filter((item) => filter === "进行中" ? item.status === "in_progress" : item.status === "completed").length}</span></button>)}</div>
      {runsError && <p className="workflow-run-history__error" role="alert">加载运行记录失败：{runsError}</p>}
      {!runsError && !filteredRuns.length && <p className="workflow-run-history__empty">{recentRuns.length ? "此状态下没有任务。" : "还没有运行记录。点击上方「试运行」后，任务会出现在这里。"}</p>}
      {!!filteredRuns.length && <div className="workflow-run-history__list">{filteredRuns.slice(0, historyVisible).map((item) => <article key={item.id} className={inspectedRun?.id === item.id ? "is-active" : ""}><div><strong>{item.expired ? "已过期" : item.status === "completed" ? "已完成" : item.status === "in_progress" ? "进行中" : "已结束"} · V{item.versionNumber ?? "?"}{item.trialRun ? " 草稿试运行" : ""}</strong><small>{item.startedAt ? new Date(item.startedAt).toLocaleString("zh-CN") : ""} · {item.currentStep}/{item.totalSteps} 个节点</small><div className="workflow-run-history__progress"><i style={{ width: `${Math.round((item.currentStep / Math.max(item.totalSteps, 1)) * 100)}%` }} /></div></div><button onClick={() => inspectRun(item, item.status === "in_progress")}>{item.status === "in_progress" ? "继续 / 查看" : "查看结果"}</button></article>)}</div>}
      {filteredRuns.length > historyVisible && <button className="outline-button" onClick={() => setHistoryVisible(n => n + 20)}>加载更早记录（还有 {filteredRuns.length - historyVisible} 条）</button>}
      {inspectedRun && <div className="workflow-run-detail"><div><strong>运行 V{inspectedRun.versionNumber ?? "?"} · {inspectedRun.expired ? "已过期" : inspectedRun.status === "completed" ? "已完成" : inspectedRun.status === "in_progress" ? "进行中" : "已结束"}</strong><button onClick={() => setInspectedRun(null)} aria-label="收起运行详情"><X size={17} /></button></div><span>任务 ID：{inspectedRun.id}</span>{inspectedRun.context?.artifact?.downloadUrl && (isImageArtifact(inspectedRun.context.artifact) ? <ZoomableImage src={inspectedRun.context.artifact.downloadUrl} alt={inspectedRun.context.artifact.fileName || "运行成果"} fileName={inspectedRun.context.artifact.fileName || ""} /> : <a href={inspectedRun.context.artifact.downloadUrl} target="_blank" rel="noreferrer">打开运行成果</a>)}{inspectedRun.context?.text && <p>{inspectedRun.context.text}</p>}<ol>{(inspectedRun.steps ?? []).map((step, index) => <li key={step.id}><span>{index < inspectedRun.currentStep ? "✓" : index === inspectedRun.currentStep && inspectedRun.status === "in_progress" ? "●" : "○"}</span><strong>{step.title || step.label || inspectedRun.nodes?.find((node) => node.id === step.id)?.data?.label || step.id}</strong>{!inspectedRun.expired && !native && <button disabled={runBusy || index > inspectedRun.currentStep} onClick={async()=>{try {setRunBusy(true);const next=await rerunWorkflowNode(inspectedRun.id,step.id);autoAdvanced.current='';setRunError('');setRun(next);setInspectedRun(next);setPanel('run');}catch(e){onNotice(e.message);}finally{setRunBusy(false);}}}>从此节点重跑</button>}{inspectedRun.context?.nodeResults?.[step.id] && <small>{inspectedRun.context.nodeResults[step.id].kind === "skipped" ? "已跳过" : inspectedRun.context.nodeResults[step.id].kind === "failed" ? "失败 · 已路由" : "已有结果"}</small>}</li>)}</ol></div>}
    </section>
        {selected.versions?.length > 0 && <section className="table-panel workflow-versions"><div className="panel__heading"><div><p>// VERSION HISTORY</p><h2>版本记录</h2></div><span>{selected.versions.length} 个版本</span></div>{selected.versions.map((version) => <div key={version.id}><strong>V{version.versionNumber}</strong><span>{version.nodes?.length ?? version.steps?.length ?? 0} 个节点 · {version.edges?.length ?? 0} 条连接 · {version.published ? "已发布" : "草稿"}</span><small>{version.createdAt ? new Date(version.createdAt).toLocaleString("zh-CN") : ""}</small></div>)}</section>}
</aside>
    <section className="workflow-runbar"><div><FlowArrow size={19} weight="bold" /><span>按住节点的非输入区域拖动；Shift 点击多选，Ctrl/⌘+C/V 复制粘贴，Delete 批量删除，Ctrl/⌘+Z 撤销，Ctrl/⌘+S 保存草稿。</span></div><div><span className="workflow-canvas-selection-hint"><Keyboard size={14} /> {selectedNode ? `已选节点：${selectedNode.data.label || "未命名"}` : selectedEdge ? "已选连线" : "未选择对象"}</span><button className="outline-button" onClick={() => setPreview(issues.length ? issues[0] : `连接关系有效：${editor.definition.nodes.length} 个节点将按画布关系传递数据。`)}>本地预览</button><button className="outline-button" disabled={readOnly || loading || runBusy} onClick={() => onSave?.(false)}><FloppyDisk size={16} /> 保存草稿版本</button>{canPublish && (!native || workerOnline) && !readOnly ? <button className="outline-button workflow-publish-button" disabled={loading || runBusy} onClick={() => setPublishOpen(true)}>保存并发布 <ArrowRight size={16} /></button> : <span className="workflow-publish-hint">{native && !workerOnline ? "发布和运行需要在线 GPU Worker" : "保存后由教师、运营或管理员发布。"}</span>}</div></section>
    {publishOpen && <div className="workflow-publish-confirm" role="dialog" aria-modal="true" aria-label="确认发布工作流">
      <button className="workflow-publish-confirm__scrim" aria-label="取消发布" onClick={() => setPublishOpen(false)} />
      <section className="workflow-publish-confirm__card">
        <p>// CONFIRM PUBLISH</p>
        <h2>把这一版发布给所有人？</h2>
        <span>发布后，学生与其他成员就能在「设计工作台」看到并运行它。试运行不会发布，只有这一步会改变别人看到的内容。</span>
        <div className="workflow-publish-confirm__actions">
          <button className="outline-button" disabled={publishBusy} onClick={() => setPublishOpen(false)}>再改改</button>
          <button className="primary-button" disabled={publishBusy} onClick={confirmPublish}>{publishBusy ? <SpinnerGap className="spin" /> : <ArrowRight size={16} weight="bold" />} 确认发布</button>
        </div>
      </section>
    </div>}

  </div>, document.body);
}
