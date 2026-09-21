import { useCallback, useEffect, useMemo, useState } from "react";
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, Position, ReactFlow } from "@xyflow/react";
import { ArrowLeft, ImageSquare, Play, Plus, Sparkle, Trash } from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import { runGenerationJob } from "./services/adminApi.js";
import { shortId } from "./randomId.js";

const NODE_TYPES = {
  input: { label: "创作需求", hint: "填写想生成的画面", color: "#4b87ff" },
  prompt: { label: "提示词", hint: "补充风格、构图与限制", color: "#9a6df0" },
  model: { label: "图像模型", hint: "留空时使用平台默认模型", color: "#f08c54" },
  ksampler: { label: "生成图片", hint: "提交本次图片生成", color: "#d9b842" },
  preview: { label: "预览结果", hint: "展示已生成的图片", color: "#40a979" },
};

function CanvasNode({ data }) {
  const meta = NODE_TYPES[data.nodeType];
  return <div className={`image-canvas-node ${data.selected ? "is-selected" : ""}`} style={{ "--node-color": meta.color }}>
    {data.nodeType !== "input" && <Handle type="target" position={Position.Left} />}
    <small>{meta.label}</small><strong>{data.label || meta.label}</strong><span>{data.value || meta.hint}</span>
    {data.nodeType !== "preview" && <Handle type="source" position={Position.Right} />}
  </div>;
}
const nodeTypes = Object.fromEntries(Object.keys(NODE_TYPES).map((type) => [type, CanvasNode]));
const DRAFT_KEY = "artedu-image-canvas-draft-v1";

function readDraft() {
  try {
    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null");
    return Array.isArray(draft?.nodes) && Array.isArray(draft?.edges) ? draft : { nodes: [], edges: [] };
  } catch { return { nodes: [], edges: [] }; }
}

export function ImageCanvas({ onBack }) {
  const [draft] = useState(readDraft);
  const [nodes, setNodes] = useState(draft.nodes);
  const [edges, setEdges] = useState(draft.edges);
  const [selectedId, setSelectedId] = useState(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("从左侧拖入或点击节点，搭建你的第一条图片生成链路。");
  const [result, setResult] = useState(null);
  const selected = nodes.find((node) => node.id === selectedId);
  const graphReady = useMemo(() => {
    const nodeByType = Object.fromEntries(Object.keys(NODE_TYPES).map((type) => [type, nodes.find((node) => node.type === type)]));
    if (Object.values(nodeByType).some((node) => !node)) return false;
    const connected = (from, to) => edges.some((edge) => edge.source === from.id && edge.target === to.id);
    return connected(nodeByType.input, nodeByType.prompt) && connected(nodeByType.prompt, nodeByType.model) && connected(nodeByType.model, nodeByType.ksampler) && connected(nodeByType.ksampler, nodeByType.preview);
  }, [nodes, edges]);
  const flowNodes = useMemo(() => nodes.map((node) => ({ ...node, data: { ...node.data, selected: node.id === selectedId } })), [nodes, selectedId]);

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ nodes, edges })); }
    catch { /* 本机存储不可用时仍允许正常创作。 */ }
  }, [nodes, edges]);

  const addNode = (type) => {
    const meta = NODE_TYPES[type];
    const id = `${type}-${shortId()}`;
    const index = nodes.length;
    setNodes((current) => [...current, { id, type, position: { x: 110 + (index % 3) * 290, y: 110 + Math.floor(index / 3) * 190 }, data: { nodeType: type, label: meta.label, value: "" } }]);
    setSelectedId(id);
  };
  const updateNode = (key, value) => setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, [key]: value } } : node));
  const onNodesChange = useCallback((changes) => setNodes((current) => applyNodeChanges(changes, current)), []);
  const onEdgesChange = useCallback((changes) => setEdges((current) => applyEdgeChanges(changes, current)), []);
  const onConnect = useCallback((connection) => setEdges((current) => addEdge({ ...connection, id: `edge-${shortId()}`, animated: true }, current)), []);
  const reset = () => { setNodes([]); setEdges([]); setSelectedId(null); setResult(null); try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setNotice("画布已清空。请从创作需求节点开始。"); };
  const generate = async () => {
    if (!graphReady) { setNotice("请连接：创作需求 → 提示词 → 图像模型 → 生成图片 → 预览结果。"); return; }
    const byType = (type) => nodes.find((node) => node.type === type);
    const input = byType("input")?.data.value?.trim();
    if (!input) { setNotice("先在“创作需求”节点写下要生成的内容。"); setSelectedId(byType("input")?.id ?? null); return; }
    const prompt = [input, byType("prompt")?.data.value?.trim()].filter(Boolean).join("\n");
    setRunning(true); setNotice("正在把画布参数提交给图片生成服务…");
    try {
      const response = await runGenerationJob({ jobType: "image", prompt, modelConfigId: byType("model")?.data.value?.trim() || undefined, parameters: { source: "standalone-image-canvas", size: "1024x1024" }, context: [] });
      if (!response.artifact?.downloadUrl) throw new Error("图片服务未返回可预览的产物");
      setResult(response.artifact); setNotice("图片已生成。你可以继续调整节点参数并再次运行。");
    } catch (error) { setNotice(error.message || "生成失败，请检查模型服务和额度。"); }
    finally { setRunning(false); }
  };

  return <main className="image-canvas-page">
    <header className="image-canvas-page__bar"><button onClick={onBack}><ArrowLeft size={17} /> 返回工作台</button><div><Sparkle size={17} weight="fill" /><strong>图片生成画布</strong><span>空白开始 · 自动保存本机草稿</span></div><button className="image-canvas-page__reset" onClick={reset}><Trash size={16} /> 清空</button></header>
    <aside className="image-canvas-page__library"><p>添加节点</p>{Object.entries(NODE_TYPES).map(([type, meta]) => <button key={type} onClick={() => addNode(type)} style={{ "--node-color": meta.color }}><i><Plus size={15} /></i><span><strong>{meta.label}</strong><small>{meta.hint}</small></span></button>)}<div className="image-canvas-page__rule"><b>最小链路</b><span>需求 → 提示词 → 模型 → 生成 → 预览</span></div></aside>
    <section className="image-canvas-page__stage"><ReactFlow nodes={flowNodes} edges={edges} nodeTypes={nodeTypes} fitView nodesConnectable onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}><Background gap={22} size={1} color="#e7e7e1" /><Controls /></ReactFlow><div className="image-canvas-page__status"><span>{notice}</span><button disabled={running || !graphReady} onClick={generate}><Play size={16} weight="fill" /> {running ? "生成中…" : "运行并生成图片"}</button></div></section>
    <aside className="image-canvas-page__inspector">{selected ? <><p>节点参数</p><strong>{NODE_TYPES[selected.type].label}</strong><label>节点名称<input value={selected.data.label} onChange={(event) => updateNode("label", event.target.value)} /></label><label>{selected.type === "input" ? "创作需求" : selected.type === "prompt" ? "补充提示词" : selected.type === "model" ? "模型 ID（可选）" : "节点说明"}<textarea value={selected.data.value} onChange={(event) => updateNode("value", event.target.value)} placeholder={NODE_TYPES[selected.type].hint} /></label><button className="image-canvas-page__delete" onClick={() => { setNodes((current) => current.filter((node) => node.id !== selectedId)); setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId)); setSelectedId(null); }}>删除节点</button></> : <><ImageSquare size={30} weight="thin" /><strong>选择一个节点</strong><span>在这里填写创作需求、提示词或模型参数。</span></>}{result && <figure className="image-canvas-page__result"><img src={result.downloadUrl} alt="本次画布生成的图片" /><figcaption><span>{result.fileName || "生成图片"}</span><a href={result.downloadUrl}>下载</a></figcaption></figure>}</aside>
  </main>;
}
