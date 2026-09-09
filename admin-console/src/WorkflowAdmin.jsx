import { useEffect, useMemo, useState } from "react";
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ArrowRight, DownloadSimple, FloppyDisk, FlowArrow, Plus, UploadSimple, X } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { createWorkflow, createWorkflowVersion, getAdminWorkflow, getAdminWorkflows, updateWorkflow } from "./services/adminApi.js";

const blankWorkflow = { name: "", description: "", category: "视觉创作", entryType: "workbench", entryUrl: "" };
const palette = {
  input: { title: "输入", hint: "接收文字、图片或参数", color: "#4b87ff" },
  prompt: { title: "提示词", hint: "整理创作指令", color: "#b268ff" },
  skill: { title: "内置 Skill", hint: "封装专业方法与参数预设", color: "#d6b335" },
  model: { title: "模型", hint: "调用图像/文本能力", color: "#ff8b4b" },
  preview: { title: "预览输出", hint: "展示并保存结果", color: "#42b883" },
  note: { title: "说明", hint: "补充教学或操作说明", color: "#78859b" },
};
const draftKey = (id) => `artedu.workflow.graph-draft.${id}`;
const newId = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function emptyDefinition() {
  return {
    schemaVersion: 2,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    nodes: [
      { id: "input-1", type: "input", position: { x: 70, y: 160 }, data: { label: "创作需求", description: "输入主题、受众或参考素材", value: "" } },
      { id: "prompt-1", type: "prompt", position: { x: 350, y: 160 }, data: { label: "提示词构建", description: "将需求整理为可执行提示词", value: "" } },
      { id: "skill-1", type: "skill", position: { x: 640, y: 160 }, data: { label: "传统纹样 Skill", description: "将专业处理方法封装为可复用节点", value: "提取纹样骨架，保持对称、留白与色彩层级。" } },
      { id: "model-1", type: "model", position: { x: 930, y: 160 }, data: { label: "图像生成模型", description: "选择后续接入的模型与参数", value: "" } },
      { id: "preview-1", type: "preview", position: { x: 1220, y: 160 }, data: { label: "成果预览", description: "查看并导出生成结果", value: "" } },
    ],
    edges: [
      { id: "edge-input-prompt", source: "input-1", target: "prompt-1" },
      { id: "edge-prompt-skill", source: "prompt-1", target: "skill-1" },
      { id: "edge-skill-model", source: "skill-1", target: "model-1" },
      { id: "edge-model-preview", source: "model-1", target: "preview-1" },
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
  if (!definition.nodes.some((node) => node.type === "preview")) warnings.push("建议添加预览输出节点，明确成果如何结束");
  if (definition.nodes.some((node) => !incoming.has(node.id) && node.type !== "input")) warnings.push("存在未接入的节点，请确认它是独立说明还是遗漏了连线");
  if (definition.nodes.some((node) => !outgoing.has(node.id) && node.type !== "preview" && node.type !== "note")) warnings.push("存在没有输出连线的处理节点");
  return [...new Set(warnings)];
}

function FlowNode({ data }) {
  const meta = palette[data.nodeType] || palette.note;
  const canReceive = data.nodeType !== "input";
  const canSend = data.nodeType !== "preview";
  return <div className="workflow-flow-node" style={{ "--node-color": meta.color }}>
    {canReceive && <Handle id="input" type="target" position={Position.Left} className="workflow-flow-handle" />}
    <div className="workflow-flow-node__bar drag-handle"><FlowArrow size={15} weight="bold" /> {meta.title}</div>
    <strong className="nodrag">{data.label || meta.title}</strong>
    <span className="nodrag">{data.description || meta.hint}</span>
    {data.value && <small className="nodrag">{data.value}</small>}
    {canSend && <Handle id="output" type="source" position={Position.Right} className="workflow-flow-handle" />}
  </div>;
}

const nodeTypes = { input: FlowNode, prompt: FlowNode, skill: FlowNode, model: FlowNode, preview: FlowNode, note: FlowNode };

export function WorkflowAdmin({ showToast, canPublish = true }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

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

  const change = (key, value) => setEditor((current) => {
    const next = { ...current, [key]: value };
    writeDraft(selected?.id, { definition: next.definition, promptTemplate: next.promptTemplate });
    return next;
  });

  const changeDefinition = (definition) => change("definition", definition);

  const save = async (publish) => {
    const issues = workflowIssues(editor.definition);
    if (!editor.name.trim() || issues.length) { showToast(!editor.name.trim() ? "请填写工作流名称" : issues[0]); return; }
    setLoading(true);
    try {
      await updateWorkflow(selected.id, { name: editor.name, description: editor.description, category: editor.category, entryType: editor.entryType, entryUrl: editor.entryUrl || undefined });
      await createWorkflowVersion(selected.id, { definition: editor.definition, promptTemplate: editor.promptTemplate, publish });
      window.localStorage.removeItem(draftKey(selected.id));
      await load(); await open({ id: selected.id });
      showToast(publish ? "节点工作流新版本已发布" : "节点工作流版本已保存");
    } catch (error) { showToast(error.message); }
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
      showToast("节点图已导入本地草稿");
    } catch (error) { showToast(`导入失败：${error.message}`); }
  };

  if (editor && selected) return <WorkflowCanvas editor={editor} selected={selected} loading={loading} canPublish={canPublish} onBack={() => { setEditor(null); setSelected(null); }} onChange={change} onDefinition={changeDefinition} onSave={save} onExport={exportJson} onImport={importJson} />;

  return <div className="page-content">
    <section className="page-intro"><div><p>// COMFY-STYLE WORKFLOW OPERATIONS</p><h1>节点工作流</h1><span>用画布连接输入、提示词、模型与输出节点；保存后生成不可变版本。</span></div><button className="primary-button" disabled={loading} onClick={create}><Plus size={18} weight="bold" /> 新建节点工作流</button></section>
    <section className="table-panel workflow-admin-panel"><div className="table-tools workflow-admin-tools"><label><FlowArrow size={18} weight="bold" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="搜索工作流名称或描述" /></label><button className="outline-button" onClick={load}>搜索</button></div><div className="workflow-admin-list">{items.map((workflow) => <button className="workflow-admin-row" key={workflow.id} onClick={() => open(workflow)}><div className="workflow-admin-icon"><FlowArrow size={22} weight="bold" /></div><div><span>{workflow.category} · {workflow.stepCount ?? 0} 个节点</span><strong>{workflow.name}</strong><small>{workflow.creatorName} · V{workflow.versionNumber ?? 0} · {workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString("zh-CN") : "尚未保存版本"}</small></div><em className={`course-state course-state--${workflow.status}`}>{workflow.status === "published" ? "已发布" : workflow.status === "archived" ? "已归档" : "草稿"}</em><ArrowRight size={17} /></button>)}{!items.length && <div className="empty-state"><FlowArrow size={34} /><strong>尚无工作流</strong><span>创建第一条节点工作流，开始搭建画布。</span></div>}</div></section>
  </div>;
}

function WorkflowCanvas({ editor, selected, loading, canPublish, onBack, onChange, onDefinition, onSave, onExport, onImport }) {
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [preview, setPreview] = useState("");
  const nodes = useMemo(() => editor.definition.nodes.map((node) => ({ ...node, data: { ...node.data, nodeType: node.type } })), [editor.definition.nodes]);
  const edges = useMemo(() => editor.definition.edges.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })), [editor.definition.edges]);
  const selectedNode = editor.definition.nodes.find((node) => node.id === selectedId);
  const selectedEdge = editor.definition.edges.find((edge) => edge.id === selectedEdgeId);
  const issues = workflowIssues(editor.definition);
  const warnings = workflowWarnings(editor.definition);

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

  return <div className="page-content workflow-canvas-page">
    <button className="learning-back" onClick={onBack}><ArrowLeft size={16} weight="bold" /> 返回工作流列表</button>
    <section className="workflow-canvas-topbar"><div><p>// COMFY-STYLE WORKFLOW BUILDER · {selected.status === "published" ? "NEW VERSION" : "DRAFT"}</p><h1>{editor.name || "未命名节点工作流"}</h1><span>拖动画布、连线编排；编辑状态仅保存在本机浏览器，保存后才写入数据库。</span></div><div className="workflow-editor-actions"><label className="outline-button"><UploadSimple size={16} /> 导入 JSON<input hidden type="file" accept="application/json,.json" onChange={onImport} /></label><button className="outline-button" onClick={onExport}><DownloadSimple size={16} /> 导出 JSON</button></div></section>
    <section className="workflow-canvas-shell">
      <aside className="workflow-node-palette"><p>// NODE LIBRARY</p><h2>节点库</h2><span>点击添加到画布</span>{Object.entries(palette).map(([type, meta]) => <button key={type} onClick={() => addNode(type)} style={{ "--node-color": meta.color }}><i><FlowArrow size={16} /></i><strong>{meta.title}</strong><small>{meta.hint}</small><Plus size={15} /></button>)}<div className="workflow-canvas-tip"><strong>连接规则</strong><span>从右侧输出点拖至下一节点左侧输入点，可形成分支与汇合。</span></div></aside>
      <div className="workflow-flow-wrap"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={editor.definition.viewport} fitView nodesDraggable nodesConnectable elementsSelectable panOnDrag isValidConnection={isValidConnection} onNodesChange={(changes) => commit({ nodes: applyNodeChanges(changes, editor.definition.nodes) })} onEdgesChange={(changes) => commit({ edges: applyEdgeChanges(changes, editor.definition.edges) })} onConnect={connect} onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); }} onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); }} onMoveEnd={(_, viewport) => commit({ viewport })}><Background color="#374151" gap={18} size={1} /><MiniMap pannable zoomable nodeColor={(node) => palette[node.type]?.color || "#78859b"} /><Controls /></ReactFlow>{preview && <div className="workflow-preview-toast"><strong>本地结构预览</strong><span>{preview}</span><button onClick={() => setPreview("")}><X size={15} /></button></div>}</div>
      <aside className="workflow-inspector"><p>// INSPECTOR</p><h2>{selectedNode ? "节点配置" : selectedEdge ? "连线配置" : "工作流配置"}</h2>{selectedNode ? <div className="workflow-form"><div className="node-type-badge" style={{ "--node-color": palette[selectedNode.type]?.color }}>{palette[selectedNode.type]?.title}</div><label>节点名称<input value={selectedNode.data.label || ""} onChange={(event) => updateNode("label", event.target.value)} /></label><label>节点说明<textarea value={selectedNode.data.description || ""} onChange={(event) => updateNode("description", event.target.value)} /></label><label>默认值 / 参数<textarea value={selectedNode.data.value || ""} onChange={(event) => updateNode("value", event.target.value)} placeholder={selectedNode.type === "skill" ? "例如：提取纹样骨架；保持四方连续；应用低饱和配色" : "例如：1024×1024、写实摄影、低饱和"} /></label><label>预计用时<input type="number" min="0" max="1440" value={selectedNode.data.estimatedMinutes ?? 10} onChange={(event) => updateNode("estimatedMinutes", Number(event.target.value))} /><small>用于学生端步骤提示，不影响图结构。</small></label><button className="outline-button" onClick={duplicateNode}><Plus size={15} /> 复制节点</button><button className="danger-text-button" onClick={deleteNode}><X size={15} /> 删除节点</button></div> : selectedEdge ? <div className="workflow-edge-inspector"><strong>{editor.definition.nodes.find((node) => node.id === selectedEdge.source)?.data?.label || selectedEdge.source}</strong><FlowArrow size={18} weight="bold" /><strong>{editor.definition.nodes.find((node) => node.id === selectedEdge.target)?.data?.label || selectedEdge.target}</strong><span>这条连线代表数据从上游节点传递到下游节点。</span><button className="danger-text-button" onClick={deleteEdge}><X size={15} /> 删除连线</button></div> : <div className="workflow-form"><label>工作流名称<input value={editor.name} onChange={(event) => onChange("name", event.target.value)} /></label><label>工作流描述<textarea value={editor.description} onChange={(event) => onChange("description", event.target.value)} /></label><label>分类<input value={editor.category} onChange={(event) => onChange("category", event.target.value)} /></label><label>入口<select value={editor.entryType} onChange={(event) => onChange("entryType", event.target.value)}><option value="chat">教学对话</option><option value="workbench">设计工作台</option><option value="external_tool">外部工具</option></select></label><label>提示模板（可选）<textarea value={editor.promptTemplate} onChange={(event) => onChange("promptTemplate", event.target.value)} placeholder="供未来模型节点调用的全局提示词" /></label></div>}<div className={`workflow-graph-check ${issues.length ? "is-error" : ""}`}><strong>{issues.length ? "图结构待修复" : "图结构有效"}</strong><span>{issues[0] || `${editor.definition.nodes.length} 个节点 · ${editor.definition.edges.length} 条连接`}</span>{!issues.length && warnings[0] && <em>{warnings[0]}</em>}</div></aside>
    </section>
    <section className="workflow-runbar"><div><FlowArrow size={19} weight="bold" /><span>当前仅校验图结构；模型执行、队列和运行日志将在后续接入实际算力后启用。</span></div><div><button className="outline-button" onClick={() => setPreview(issues.length ? issues[0] : `连接关系有效：${editor.definition.nodes.length} 个节点将按画布关系传递数据。`)}>本地预览</button><button className="outline-button" disabled={loading} onClick={() => onSave(false)}><FloppyDisk size={16} /> 保存版本</button>{canPublish ? <button className="primary-button" disabled={loading} onClick={() => onSave(true)}>保存并发布 <ArrowRight size={16} /></button> : <span className="workflow-publish-hint">保存后由教师、运营或管理员发布。</span>}</div></section>
    {selected.versions?.length > 0 && <section className="table-panel workflow-versions"><div className="panel__heading"><div><p>// VERSION HISTORY</p><h2>版本记录</h2></div><span>{selected.versions.length} 个版本</span></div>{selected.versions.map((version) => <div key={version.id}><strong>V{version.versionNumber}</strong><span>{version.nodes?.length ?? version.steps?.length ?? 0} 个节点 · {version.edges?.length ?? 0} 条连接 · {version.published ? "已发布" : "草稿"}</span><small>{version.createdAt ? new Date(version.createdAt).toLocaleString("zh-CN") : ""}</small></div>)}</section>}
  </div>;
}
