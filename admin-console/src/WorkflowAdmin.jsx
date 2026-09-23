import { useEffect, useMemo, useRef, useState } from "react";
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, ConnectionLineType, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, ArrowsOut, CheckCircle, DownloadSimple, FloppyDisk, FlowArrow, Keyboard, MagnifyingGlass, MagicWand, Play, Plus, SpinnerGap, UploadSimple, X } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { createWorkflow, createWorkflowVersion, executeWorkflowRun, getAdminWorkflow, getAdminWorkflows, startWorkflowRun, updateWorkflow, uploadTemporaryCreationFile } from "./services/adminApi.js";
import { shortId } from "./randomId.js";

const blankWorkflow = { name: "", description: "", category: "视觉创作", entryType: "workbench" };
const palette = {
  input: { title: "创作输入", hint: "接收本次的文字需求", color: "#4b87ff", group: "输入与素材" },
  load_image: { title: "参考素材", hint: "记录已授权素材标识或参考说明", color: "#4b87ff", group: "输入与素材" },
  prompt: { title: "提示词", hint: "整理创作指令", color: "#b268ff", group: "提示与教学" },
  text_encode: { title: "文本编码", hint: "将正负提示词编码为条件", color: "#b268ff", group: "提示与教学" },
  skill: { title: "内置 Skill", hint: "封装专业方法与参数预设", color: "#d6b335", group: "提示与教学" },
  load_checkpoint: { title: "加载模型", hint: "选择审核过的基础模型", color: "#ff8b4b", group: "模型与控制" },
  lora: { title: "加载 LoRA", hint: "叠加受控风格或能力", color: "#ff8b4b", group: "模型与控制" },
  controlnet: { title: "ControlNet", hint: "以线稿、姿态或深度控制生成", color: "#ff8b4b", group: "模型与控制" },
  model: { title: "模型调用", hint: "调用图像或文本能力", color: "#ff8b4b", group: "模型与控制" },
  empty_latent: { title: "空 Latent", hint: "设定分辨率与批次数", color: "#d6b335", group: "采样与处理" },
  ksampler: { title: "KSampler", hint: "配置采样器、步数、CFG 与 Seed", color: "#d6b335", group: "采样与处理" },
  vae_decode: { title: "VAE 解码", hint: "将 Latent 转为图片", color: "#d6b335", group: "采样与处理" },
  upscale: { title: "超分规格", hint: "记录后续超分服务的目标规格", color: "#d6b335", group: "采样与处理" },
  preview: { title: "预览输出", hint: "展示中间或最终结果", color: "#42b883", group: "输出与说明" },
  save_image: { title: "保存图片", hint: "归档可下载的最终产物", color: "#42b883", group: "输出与说明" },
  note: { title: "说明", hint: "补充教学或操作说明", color: "#78859b", group: "输出与说明" },
};
const paletteGroups = [...new Set(Object.values(palette).map((item) => item.group))];
const draftKey = (id) => `artedu.workflow.graph-draft.${id}`;
// crypto.randomUUID 在明文 HTTP 的不安全上下文里不存在，统一走 randomId。
const newId = shortId;

function emptyDefinition() {
  return {
    schemaVersion: 2,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    nodes: [
      { id: "input-1", type: "input", position: { x: 70, y: 160 }, data: { label: "创作需求", description: "输入主题、受众或参考素材", value: "" } },
      { id: "prompt-1", type: "prompt", position: { x: 350, y: 160 }, data: { label: "提示词构建", description: "将需求整理为可执行提示词", value: "" } },
      { id: "skill-1", type: "skill", position: { x: 640, y: 160 }, data: { label: "传统纹样 Skill", description: "将专业处理方法封装为可复用节点", value: "提取纹样骨架，保持对称、留白与色彩层级。" } },
      { id: "model-1", type: "model", position: { x: 930, y: 160 }, data: { label: "图像生成模型", description: "填写服务端已配置的模型 ID；留空则使用内部图片通道", value: "" } },
      { id: "ksampler-1", type: "ksampler", position: { x: 1210, y: 160 }, data: { label: "生成图片", description: "通过平台统一图片 API 创建真实生成任务", value: "" } },
      { id: "vae-1", type: "vae_decode", position: { x: 1490, y: 160 }, data: { label: "读取生成结果", description: "读取 KSampler 已保存的图片产物", value: "" } },
      { id: "preview-1", type: "preview", position: { x: 1770, y: 160 }, data: { label: "成果预览", description: "展示当前图片或文本结果", value: "" } },
      { id: "save-1", type: "save_image", position: { x: 2050, y: 160 }, data: { label: "保存成果", description: "确认平台已归档的可下载图片", value: "" } },
    ],
    edges: [
      { id: "edge-input-prompt", source: "input-1", target: "prompt-1" },
      { id: "edge-prompt-skill", source: "prompt-1", target: "skill-1" },
      { id: "edge-skill-model", source: "skill-1", target: "model-1" },
      { id: "edge-model-sampler", source: "model-1", target: "ksampler-1" },
      { id: "edge-sampler-vae", source: "ksampler-1", target: "vae-1" },
      { id: "edge-vae-preview", source: "vae-1", target: "preview-1" },
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
  if (value?.nodes && value?.edges) return { schemaVersion: 2, viewport: value.viewport || { x: 0, y: 0, zoom: 0.85 }, nodes: value.nodes, edges: value.edges };
  return legacyDefinition(steps);
}

function readDraft(id) {
  try { return JSON.parse(window.localStorage.getItem(draftKey(id)) || "null"); } catch { return null; }
}

function writeDraft(id, value) {
  if (id) window.localStorage.setItem(draftKey(id), JSON.stringify(value));
}

function workflowIssues(definition) {
  const ids = new Set();
  const edgeIds = new Set();
  const issues = [];
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
  if (!definition.nodes.some((node) => node.type === "input")) warnings.push("建议添加输入节点，明确用户从哪里开始");
  if (!definition.nodes.some((node) => node.type === "preview" || node.type === "save_image")) warnings.push("建议添加预览或保存图片节点，明确成果如何结束");
  if (definition.nodes.some((node) => !incoming.has(node.id) && node.type !== "input")) warnings.push("存在未接入的节点，请确认它是独立说明还是遗漏了连线");
  if (definition.nodes.some((node) => !outgoing.has(node.id) && node.type !== "preview" && node.type !== "save_image" && node.type !== "note")) warnings.push("存在没有输出连线的处理节点");
  return [...new Set(warnings)];
}

function publishIssues(definition) {
  // 线性教学工作流会以 note 节点兼容历史版本；只对可执行节点图强制输入输出闭环。
  if (!definition.nodes.some((node) => node.type !== "note")) return [];
  const incoming = new Map(definition.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(definition.nodes.map((node) => [node.id, []]));
  definition.edges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  });
  const inputs = definition.nodes.filter((node) => node.type === "input");
  const outputs = definition.nodes.filter((node) => node.type === "preview" || node.type === "save_image");
  if (!inputs.length) return ["发布前需要至少一个创作输入节点"];
  if (!outputs.length) return ["发布前需要至少一个预览或保存图片节点"];
  const reachable = new Set(inputs.map((node) => node.id));
  const queue = [...reachable];
  while (queue.length) for (const target of outgoing.get(queue.shift()) ?? []) if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
  const detached = definition.nodes.find((node) => !reachable.has(node.id) && node.type !== "note");
  if (detached) return [`发布前请连接孤立节点“${detached.data.label || detached.id}”`];
  const unreachableOutput = outputs.find((node) => !reachable.has(node.id));
  if (unreachableOutput) return [`发布前请将输出节点“${unreachableOutput.data.label || unreachableOutput.id}”连接到输入链路`];
  if (definition.nodes.some((node) => node.type !== "note" && !(incoming.get(node.id) || outgoing.get(node.id)?.length))) return ["发布前请移除或连接孤立节点"];
  return [];
}

function FlowNode({ data, selected }) {
  const meta = palette[data.nodeType] || palette.note;
  const canReceive = data.nodeType !== "input";
  const canSend = data.nodeType !== "preview";
  return <div className={`workflow-flow-node ${selected ? "is-selected" : ""} ${data.isActive ? "is-running" : ""} ${data.isComplete ? "is-complete" : ""}`} style={{ "--node-color": meta.color }}>
    {canReceive && <Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" />}
    <div className="workflow-flow-node__bar drag-handle"><FlowArrow size={15} weight="bold" /> {meta.title}</div>
    <strong className="nodrag">{data.label || meta.title}{data.isComplete && <CheckCircle size={14} weight="fill" aria-label="已执行" />}{data.isActive && <SpinnerGap size={14} className="spin" aria-label="正在执行" />}</strong>
    <span className="nodrag">{data.description || meta.hint}</span>
    {data.value && <small className="nodrag">{data.value}</small>}
    {canSend && <Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" />}
  </div>;
}

const nodeTypes = Object.fromEntries(Object.keys(palette).map((type) => [type, FlowNode]));

export function WorkflowAdmin({ showToast, canPublish = true }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const draftTimer = useRef(null);

  useEffect(() => () => { if (draftTimer.current) window.clearTimeout(draftTimer.current); }, []);

  const load = async () => {
    try { setItems((await getAdminWorkflows(search)).items ?? []); }
    catch (error) { showToast(error.message); }
  };
  useEffect(() => { load(); }, []);

  const open = async (workflow) => {
    setLoading(true);
    try {
      const detail = await getAdminWorkflow(workflow.id);
      const latest = detail.versions?.[0];
      const local = readDraft(workflow.id);
      setSelected(detail);
      setDirty(Boolean(local));
      setEditor({
        name: detail.name ?? "", description: detail.description ?? "", category: detail.category ?? "视觉创作", entryType: detail.entryType ?? "workbench", entryUrl: detail.entryUrl ?? "",
        promptTemplate: local?.promptTemplate ?? latest?.promptTemplate ?? "",
        definition: normalizeDefinition(local?.definition ?? latest?.definition, latest?.steps),
      });
    } catch (error) { showToast(error.message); }
    finally { setLoading(false); }
  };

  const create = async () => {
    setLoading(true);
    try {
      const workflow = await createWorkflow({ ...blankWorkflow, name: "未命名节点工作流", description: "请在画布中配置这条工作流的节点与连接。" });
      await load(); await open(workflow); showToast("节点工作流草稿已创建");
    } catch (error) { showToast(error.message); }
    finally { setLoading(false); }
  };

  const queueDraft = (id, value) => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => writeDraft(id, value), 180);
  };
  const change = (key, value) => { setDirty(true); setEditor((current) => {
    const next = { ...current, [key]: value };
    // 拖动节点会连续产生几十个 position 事件，延迟写草稿避免同步 localStorage 阻塞指针移动。
    queueDraft(selected?.id, { definition: next.definition, promptTemplate: next.promptTemplate });
    return next;
  }); };

  const changeDefinition = (definition) => change("definition", definition);

  const save = async (publish) => {
    const issues = workflowIssues(editor.definition);
    const releaseIssues = publish ? publishIssues(editor.definition) : [];
    if (!editor.name.trim() || issues.length || releaseIssues.length) { showToast(!editor.name.trim() ? "请填写工作流名称" : issues[0] || releaseIssues[0]); return; }
    setLoading(true);
    try {
      // 历史数据可能把站内路由（例如 /studio）存进入口地址；服务端仅接受无凭据 HTTP(S) 外链。
      const entryUrl = /^https?:\/\//i.test(editor.entryUrl || "") ? editor.entryUrl : undefined;
      await updateWorkflow(selected.id, { name: editor.name, description: editor.description, category: editor.category, entryType: editor.entryType, entryUrl });
      await createWorkflowVersion(selected.id, { definition: editor.definition, promptTemplate: editor.promptTemplate, publish });
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      window.localStorage.removeItem(draftKey(selected.id));
      setDirty(false);
      await load(); await open({ id: selected.id });
      showToast(publish ? "节点工作流新版本已发布" : "节点工作流版本已保存");
      return true;
    } catch (error) { showToast(error.message); return false; }
    finally { setLoading(false); }
  };

  const exportJson = () => {
    const payload = { format: "artedu-comfy-workflow", version: 2, workflow: { name: editor.name, description: editor.description, category: editor.category, entryType: editor.entryType, entryUrl: editor.entryUrl }, definition: editor.definition, promptTemplate: editor.promptTemplate };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${editor.name || "artedu-workflow"}.json`; anchor.click(); URL.revokeObjectURL(url); showToast("节点图 JSON 已导出");
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const definition = normalizeDefinition(data.definition, data.steps);
      const issues = workflowIssues(definition); if (issues.length) throw new Error(issues[0]);
      setEditor((current) => {
        const next = { ...current, ...(data.workflow ?? {}), definition, promptTemplate: data.promptTemplate ?? current.promptTemplate };
        writeDraft(selected?.id, { definition: next.definition, promptTemplate: next.promptTemplate }); return next;
      });
      setDirty(true);
      showToast("节点图已导入本地草稿");
    } catch (error) { showToast(`导入失败：${error.message}`); }
  };

  if (editor && selected) return <WorkflowCanvas editor={editor} selected={selected} loading={loading} dirty={dirty} canPublish={canPublish} onNotice={showToast} onBack={() => { setEditor(null); setSelected(null); }} onChange={change} onDefinition={changeDefinition} onSave={save} onExport={exportJson} onImport={importJson} />;

  return <div className="page-content">
    <section className="page-intro"><div><p>// COMFY-STYLE WORKFLOW OPERATIONS</p><h1>节点工作流</h1><span>用画布连接输入、提示词、模型与输出节点；保存后生成不可变版本。</span></div><button className="primary-button" disabled={loading} onClick={create}><Plus size={18} weight="bold" /> 新建节点工作流</button></section>
    <section className="table-panel workflow-admin-panel"><div className="table-tools workflow-admin-tools"><label><FlowArrow size={18} weight="bold" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="搜索工作流名称或描述" /></label><button className="outline-button" onClick={load}>搜索</button></div><div className="workflow-admin-list">{items.map((workflow) => <button className="workflow-admin-row" key={workflow.id} onClick={() => open(workflow)}><div className="workflow-admin-icon"><FlowArrow size={22} weight="bold" /></div><div><span>{workflow.category} · {workflow.stepCount ?? 0} 个节点</span><strong>{workflow.name}</strong><small>{workflow.creatorName} · V{workflow.versionNumber ?? 0} · {workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString("zh-CN") : "尚未保存版本"}</small></div><em className={`course-state course-state--${workflow.status}`}>{workflow.status === "published" ? "已发布" : workflow.status === "archived" ? "已归档" : "草稿"}</em><ArrowRight size={17} /></button>)}{!items.length && <div className="empty-state"><FlowArrow size={34} /><strong>尚无工作流</strong><span>创建第一条节点工作流，开始搭建画布。</span></div>}</div></section>
  </div>;
}

function WorkflowCanvas({ editor, selected, loading, dirty, canPublish, onNotice, onBack, onChange, onDefinition, onSave, onExport, onImport }) {
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [preview, setPreview] = useState("");
  const [nodeQuery, setNodeQuery] = useState("");
  const [nodeGroup, setNodeGroup] = useState("全部");
  const [flow, setFlow] = useState(null);
  const [run, setRun] = useState(null);
  const [runPrompt, setRunPrompt] = useState("");
  const [referenceFile, setReferenceFile] = useState(null);
  const [runBusy, setRunBusy] = useState(false);
  const runSteps = run?.steps ?? [];
  const activeStep = run?.status === "in_progress" ? runSteps[run.currentStep] : null;
  const activeNode = activeStep ? editor.definition.nodes.find((node) => node.id === activeStep.id) : null;
  const completedNodeIds = useMemo(() => new Set(run ? runSteps.slice(0, run.currentStep).map((step) => step.id) : []), [run, runSteps]);
  const nodes = useMemo(() => editor.definition.nodes.map((node) => ({ ...node, data: { ...node.data, nodeType: node.type, isActive: node.id === activeStep?.id, isComplete: completedNodeIds.has(node.id) } })), [editor.definition.nodes, activeStep?.id, completedNodeIds]);
  const edges = useMemo(() => editor.definition.edges.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [editor.definition.edges]);
  const selectedNode = editor.definition.nodes.find((node) => node.id === selectedId);
  const selectedEdge = editor.definition.edges.find((edge) => edge.id === selectedEdgeId);
  const issues = workflowIssues(editor.definition);
  const warnings = workflowWarnings(editor.definition);
  const visiblePalette = Object.entries(palette).filter(([type, meta]) => (nodeGroup === "全部" || meta.group === nodeGroup) && `${type} ${meta.title} ${meta.hint}`.toLowerCase().includes(nodeQuery.trim().toLowerCase()));

  const commit = (next) => onDefinition({ ...editor.definition, ...next });
  const addNode = (type) => {
    const count = editor.definition.nodes.filter((node) => node.type === type).length + 1;
    const node = { id: newId(type), type, position: { x: 150 + (editor.definition.nodes.length % 4) * 270, y: 100 + Math.floor(editor.definition.nodes.length / 4) * 210 }, data: { label: `${palette[type].title} ${count}`, description: palette[type].hint, value: "" } };
    commit({ nodes: [...editor.definition.nodes, node] }); setSelectedId(node.id);
  };
  const updateNode = (key, value) => commit({ nodes: editor.definition.nodes.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, [key]: value } } : node) });
  const deleteNode = () => { if (!selectedId) return; commit({ nodes: editor.definition.nodes.filter((node) => node.id !== selectedId), edges: editor.definition.edges.filter((edge) => edge.source !== selectedId && edge.target !== selectedId) }); setSelectedId(null); };
  const duplicateNode = () => {
    if (!selectedNode) return;
    const node = { ...selectedNode, id: newId(selectedNode.type), position: { x: selectedNode.position.x + 42, y: selectedNode.position.y + 42 }, data: { ...selectedNode.data, label: `${selectedNode.data.label || palette[selectedNode.type].title} 副本` } };
    commit({ nodes: [...editor.definition.nodes, node] }); setSelectedId(node.id);
  };
  const deleteEdge = () => { if (!selectedEdgeId) return; commit({ edges: editor.definition.edges.filter((edge) => edge.id !== selectedEdgeId) }); setSelectedEdgeId(null); };
  const isValidConnection = (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    return !editor.definition.edges.some((edge) => edge.source === connection.source && edge.target === connection.target);
  };
  const connect = (connection) => {
    if (!isValidConnection(connection)) return;
    commit({ edges: addEdge({ ...connection, id: newId("edge") }, editor.definition.edges) }); setSelectedEdgeId(null);
  };

  const autoLayout = () => {
    const incoming = new Map(editor.definition.nodes.map((node) => [node.id, []]));
    editor.definition.edges.forEach((edge) => incoming.get(edge.target)?.push(edge.source));
    const ranks = new Map();
    const rankOf = (id, visiting = new Set()) => {
      if (ranks.has(id)) return ranks.get(id);
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const rank = Math.max(0, ...(incoming.get(id) || []).map((source) => rankOf(source, visiting) + 1));
      visiting.delete(id); ranks.set(id, rank); return rank;
    };
    editor.definition.nodes.forEach((node) => rankOf(node.id));
    const columns = new Map();
    editor.definition.nodes.forEach((node) => { const rank = ranks.get(node.id) ?? 0; if (!columns.has(rank)) columns.set(rank, []); columns.get(rank).push(node); });
    const nodes = editor.definition.nodes.map((node) => {
      const rank = ranks.get(node.id) ?? 0;
      const column = columns.get(rank) || [];
      return { ...node, position: { x: 70 + rank * 285, y: 70 + column.findIndex((item) => item.id === node.id) * 175 } };
    });
    commit({ nodes });
    window.setTimeout(() => flow?.fitView({ padding: 0.2, duration: 280 }), 0);
  };
  const fitCanvas = () => flow?.fitView({ padding: 0.2, duration: 280 });
  const runWorkflow = async () => {
    if (issues.length) { onNotice(issues[0]); return; }
    if (publishIssues(editor.definition).length) { onNotice(publishIssues(editor.definition)[0]); return; }
    setRunBusy(true);
    try {
      if (dirty || selected.status !== "published") {
        const saved = await onSave(true);
        if (!saved) return;
      }
      const next = await startWorkflowRun(selected.id, {});
      setRun(next); setRunPrompt(""); onNotice("运行已启动：请按画布连接顺序执行节点。");
    } catch (error) { onNotice(error.message); }
    finally { setRunBusy(false); }
  };
  const executeCurrentNode = async () => {
    if (!run || !activeNode) return;
    if (activeNode.type === "input" && !runPrompt.trim() && !String(activeNode.data.value || "").trim()) { onNotice("请填写创作需求，或在输入节点配置默认值。"); return; }
    setRunBusy(true);
    try {
      let referenceFileId;
      if (activeNode.type === "load_image") {
        if (!referenceFile) { onNotice("请先选择一张已获授权的参考图片。"); return; }
        const uploaded = await uploadTemporaryCreationFile(referenceFile);
        referenceFileId = uploaded.id;
      }
      const next = await executeWorkflowRun(run.id, { ...(runPrompt.trim() ? { prompt: runPrompt.trim() } : {}), ...(referenceFileId ? { referenceFileId } : {}) });
      setRun(next);
      if (referenceFileId) setReferenceFile(null);
      if (next.status === "completed") onNotice("工作流已执行完成，结果已写入本次运行记录。");
    } catch (error) { onNotice(error.message); }
    finally { setRunBusy(false); }
  };

  useEffect(() => {
    if (!flow || !editor.definition.nodes.length) return;
    const frame = window.requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 0 }));
    return () => window.cancelAnimationFrame(frame);
  }, [flow, selected.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!editing && !loading) onSave(false); return; }
      if (editing) return;
      if (event.key === "Escape") { setSelectedId(null); setSelectedEdgeId(null); }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId) deleteNode(); else if (selectedEdgeId) deleteEdge();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, selectedEdgeId, loading, onSave]);

  return <div className="page-content workflow-canvas-page">
    <button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流列表</button>
    <section className="workflow-canvas-topbar"><div><p>// COMFY-STYLE WORKFLOW BUILDER · {selected.status === "published" ? "NEW VERSION" : "DRAFT"}</p><h1>{editor.name || "未命名节点工作流"}</h1><span>拖动节点顶部调整位置；拖动画布空白处平移，滚轮缩放。{dirty ? "本机草稿尚未保存为版本。" : "当前版本已保存。"}</span></div><div className="workflow-editor-actions"><label className="outline-button"><UploadSimple size={16} /> 导入 JSON<input hidden type="file" accept="application/json,.json" onChange={onImport} /></label><button className="outline-button" onClick={onExport}><DownloadSimple size={16} /> 导出 JSON</button></div></section>
    <section className="workflow-canvas-shell">
      <aside className="workflow-node-palette"><p>// NODE LIBRARY</p><h2>节点库</h2><span>按类型搜索，点击添加到画布</span><label className="workflow-node-search"><MagnifyingGlass size={15} /><input value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} placeholder="搜索节点，例如 KSampler" /></label><div className="workflow-node-groups"><button className={nodeGroup === "全部" ? "is-active" : ""} onClick={() => setNodeGroup("全部")}>全部</button>{paletteGroups.map((group) => <button key={group} className={nodeGroup === group ? "is-active" : ""} onClick={() => setNodeGroup(group)}>{group}</button>)}</div><div className="workflow-node-list">{visiblePalette.map(([type, meta]) => <button key={type} onClick={() => addNode(type)} style={{ "--node-color": meta.color }}><i><FlowArrow size={16} /></i><span><em>{meta.group}</em><strong>{meta.title}</strong><small>{meta.hint}</small></span><Plus size={15} /></button>)}{!visiblePalette.length && <div className="workflow-node-empty">没有匹配的节点</div>}</div><div className="workflow-canvas-tip"><strong>连接规则</strong><span>当前画布会校验 DAG 结构；端口类型与实际 GPU 执行会随 Worker 协议接入。</span></div></aside>
      <div className="workflow-flow-wrap"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={editor.definition.viewport} onInit={setFlow} nodesDraggable nodesConnectable elementsSelectable dragHandle=".drag-handle" panOnDrag zoomOnScroll snapToGrid snapGrid={[20, 20]} onlyRenderVisibleElements connectionLineType={ConnectionLineType.SmoothStep} isValidConnection={isValidConnection} onNodesChange={(changes) => commit({ nodes: applyNodeChanges(changes, editor.definition.nodes) })} onEdgesChange={(changes) => commit({ edges: applyEdgeChanges(changes, editor.definition.edges) })} onConnect={connect} onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); }} onSelectionChange={({ nodes: nextNodes, edges: nextEdges }) => { setSelectedId(nextNodes[0]?.id ?? null); setSelectedEdgeId(nextEdges[0]?.id ?? null); }} onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); }} onMoveEnd={(_, viewport) => commit({ viewport })}><Background color="#374151" gap={20} size={1} /><MiniMap pannable zoomable nodeColor={(node) => palette[node.type]?.color || "#78859b"} /><Controls showInteractive={false} /><div className="workflow-flow-tools"><button type="button" onClick={autoLayout} title="按连接关系自动整理节点"><MagicWand size={15} /> 自动整理</button><button type="button" onClick={fitCanvas} title="让全部节点适配画布"><ArrowsOut size={15} /> 适配画布</button></div></ReactFlow>{preview && <div className="workflow-preview-toast"><strong>本地结构预览</strong><span>{preview}</span><button onClick={() => setPreview("")}><X size={15} /></button></div>}</div>
      <aside className="workflow-inspector"><p>// INSPECTOR</p><h2>{selectedNode ? "节点配置" : selectedEdge ? "连线配置" : "工作流配置"}</h2>{selectedNode ? <div className="workflow-form"><div className="node-type-badge" style={{ "--node-color": palette[selectedNode.type]?.color }}>{palette[selectedNode.type]?.title}</div><label>节点名称<input value={selectedNode.data.label || ""} onChange={(event) => updateNode("label", event.target.value)} /></label><label>节点说明<textarea value={selectedNode.data.description || ""} onChange={(event) => updateNode("description", event.target.value)} /></label><label>默认值 / 参数<textarea value={selectedNode.data.value || ""} onChange={(event) => updateNode("value", event.target.value)} placeholder={selectedNode.type === "skill" ? "例如：提取纹样骨架；保持四方连续；应用低饱和配色" : "例如：1024×1024、写实摄影、低饱和"} /></label><label>预计用时<input type="number" min="0" max="1440" value={selectedNode.data.estimatedMinutes ?? 10} onChange={(event) => updateNode("estimatedMinutes", Number(event.target.value))} /><small>用于学生端步骤提示，不影响图结构。</small></label><button className="outline-button" onClick={duplicateNode}><Plus size={15} /> 复制节点</button><button className="danger-text-button" onClick={deleteNode}><X size={15} /> 删除节点</button></div> : selectedEdge ? <div className="workflow-edge-inspector"><strong>{editor.definition.nodes.find((node) => node.id === selectedEdge.source)?.data?.label || selectedEdge.source}</strong><FlowArrow size={18} weight="bold" /><strong>{editor.definition.nodes.find((node) => node.id === selectedEdge.target)?.data?.label || selectedEdge.target}</strong><span>这条连线代表数据从上游节点传递到下游节点。</span><button className="danger-text-button" onClick={deleteEdge}><X size={15} /> 删除连线</button></div> : <div className="workflow-form"><label>工作流名称<input value={editor.name} onChange={(event) => onChange("name", event.target.value)} /></label><label>工作流描述<textarea value={editor.description} onChange={(event) => onChange("description", event.target.value)} /></label><label>分类<input value={editor.category} onChange={(event) => onChange("category", event.target.value)} /></label><label>入口<select value={editor.entryType} onChange={(event) => onChange("entryType", event.target.value)}><option value="chat">教学对话</option><option value="workbench">设计工作台</option><option value="external_tool">外部工具</option></select></label><label>提示模板（可选）<textarea value={editor.promptTemplate} onChange={(event) => onChange("promptTemplate", event.target.value)} placeholder="供未来模型节点调用的全局提示词" /></label></div>}<div className={`workflow-graph-check ${issues.length ? "is-error" : ""}`}><strong>{issues.length ? "图结构待修复" : "图结构有效"}</strong><span>{issues[0] || `${editor.definition.nodes.length} 个节点 · ${editor.definition.edges.length} 条连接`}</span>{!issues.length && warnings[0] && <em>{warnings[0]}</em>}</div></aside>
    </section>
    <section className="workflow-canvas-runner" aria-live="polite">
      <div><p>// RUN ON CANVAS</p><h2>{run?.status === "completed" ? "本次运行已完成" : activeNode ? `正在执行：${activeNode.data.label || activeNode.type}` : "从画布直接运行"}</h2><span>{run ? `${Math.round((run.currentStep / Math.max(run.totalSteps, 1)) * 100)}% · ${run.currentStep}/${run.totalSteps} 个节点已完成` : "先校验并发布当前节点图，再按连接关系逐节点执行。"}</span></div>
      {!run && <button className="primary-button" disabled={loading || runBusy || !canPublish} onClick={runWorkflow}>{runBusy ? <SpinnerGap className="spin" /> : <Play size={16} weight="fill" />}{dirty || selected.status !== "published" ? "发布并运行" : "运行工作流"}</button>}
      {run?.status === "in_progress" && activeNode && <div className="workflow-canvas-runner__step"><div><strong>{activeNode.data.label || activeNode.type}</strong><small>{activeNode.data.description || palette[activeNode.type]?.hint}</small></div>{activeNode.type === "input" && <label>创作需求<textarea value={runPrompt} onChange={(event) => setRunPrompt(event.target.value)} placeholder="例如：为新生设计一张青绿色的传统纹样海报" /></label>}{activeNode.type === "load_image" && <label className="workflow-reference-upload">参考图片<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)} /><small>{referenceFile ? `已选择：${referenceFile.name}` : "支持 JPEG、PNG、GIF、WebP，最大 8 MB；仅在本次运行中授权使用。"}</small></label>}<button className="primary-button" disabled={runBusy} onClick={executeCurrentNode}>{runBusy ? <SpinnerGap className="spin" /> : <Play size={16} weight="fill" />}执行当前节点</button></div>}
      {run?.status === "completed" && <div className="workflow-canvas-runner__done"><CheckCircle size={20} weight="fill" /> 所有节点均已执行。请在节点结果中查看生成产物或运行记录。</div>}
      {!canPublish && <small>需要教师、运营或管理员身份才能发布并运行。</small>}
    </section>
    <section className="workflow-runbar"><div><FlowArrow size={19} weight="bold" /><span>拖动节点：顶部栏；平移画布：空白处；缩放：滚轮。Delete 删除选中节点或连线，Ctrl/⌘+S 保存。</span></div><div><span className="workflow-canvas-selection-hint"><Keyboard size={14} /> {selectedNode ? `已选节点：${selectedNode.data.label || "未命名"}` : selectedEdge ? "已选连线" : "未选择对象"}</span><button className="outline-button" onClick={() => setPreview(issues.length ? issues[0] : `连接关系有效：${editor.definition.nodes.length} 个节点将按画布关系传递数据。`)}>本地预览</button><button className="outline-button" disabled={loading || runBusy} onClick={() => onSave(false)}><FloppyDisk size={16} /> 保存版本</button>{canPublish ? <button className="outline-button" disabled={loading || runBusy} onClick={() => onSave(true)}>保存并发布 <ArrowRight size={16} /></button> : <span className="workflow-publish-hint">保存后由教师、运营或管理员发布。</span>}</div></section>
    {selected.versions?.length > 0 && <section className="table-panel workflow-versions"><div className="panel__heading"><div><p>// VERSION HISTORY</p><h2>版本记录</h2></div><span>{selected.versions.length} 个版本</span></div>{selected.versions.map((version) => <div key={version.id}><strong>V{version.versionNumber}</strong><span>{version.nodes?.length ?? version.steps?.length ?? 0} 个节点 · {version.edges?.length ?? 0} 条连接 · {version.published ? "已发布" : "草稿"}</span><small>{version.createdAt ? new Date(version.createdAt).toLocaleString("zh-CN") : ""}</small></div>)}</section>}
  </div>;
}
