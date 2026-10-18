import { createPortal } from 'react-dom';
import { ZoomableImage } from './ImageLightbox.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ViewportPortal, Background, Controls, MiniMap, Handle, Position, addEdge, reconnectEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { getComfyCatalog, getComfyQueue, cancelComfyJob, retryComfyJob, getComfyJob, getMyWorkflowRuns, startWorkflowRun } from './services/adminApi.js';
import { ports, specs, isWidget, nodeFromInfo, compilePrompt, importComfy, validConnection, validateGraphStructure } from './comfyGraph.js';
import { nodeGroup } from '../../shared/comfyNodes.mjs';
import { COMFY_PRESETS, createComfyPreset } from './comfyPresets.js';
import './comfy-canvas.css';
import '@xyflow/react/dist/style.css';
function ComfyNode({ data, selected }) {
    const io = ports(data.info);
    const linked = new Set(data.linkedInputs);
    return <div className={`comfy-node ${selected ? 'is-selected' : ''} ${data.active ? 'is-running' : ''}`}><strong>{data.label}</strong><small>{data.classType}</small>
    {io.inputs.map(p => <div className="comfy-port" key={p.name}><Handle id={p.name} type="target" position={Position.Left}/><span>{p.name}</span><small>{p.type}</small></div>)}
    {io.outputs.map(p => <div className="comfy-port comfy-port--out" key={p.name}><Handle id={p.name} type="source" position={Position.Right}/><span>{p.label}</span><small>{p.type}</small></div>)}
    {specs(data.info).filter(([, s]) => isWidget(s)).map(([name, s]) => <label className="nodrag nowheel" key={name} title={s[1]?.tooltip} onBlur={data.endEdit}>{!Array.isArray(s[0]) && <Handle id={name} type="target" position={Position.Left}/>}<span>{name}</span>{linked.has(name) ? <small>由上游提供</small> : Array.isArray(s[0]) ? <select aria-label={name} disabled={data.readOnly} value={data.widgets[name] ?? ''} onChange={e => data.update(name, s[0].find(v => String(v) === e.target.value))}>{!s[0].length && <option value="">本机没有可用选项</option>}{s[0].map(v => <option key={v} value={v}>{v}</option>)}</select> : s[0] === 'BOOLEAN' ? <input aria-label={name} disabled={data.readOnly} type="checkbox" checked={!!data.widgets[name]} onChange={e => data.update(name, e.target.checked)}/> : s[0] === 'STRING' && s[1]?.multiline ? <textarea aria-label={name} disabled={data.readOnly} value={data.widgets[name] ?? ''} onChange={e => data.update(name, e.target.value)}/> : <input aria-label={name} disabled={data.readOnly} type={s[0] === 'STRING' ? 'text' : 'number'} min={s[1]?.min} max={s[0] === 'INT' ? Math.min(s[1]?.max ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) : s[1]?.max} step={s[0] === 'FLOAT' ? 'any' : 1} value={data.widgets[name] ?? ''} onChange={e => data.update(name, s[0] === 'STRING' || e.target.value === '' ? e.target.value : Number(e.target.value))}/>}</label>)}
    {!data.info && <p role="status">节点定义不可用，请连接 Worker 后刷新。</p>}
  </div>;
}
const nodeTypes = { comfy: ComfyNode };
export function ComfyCanvas({ editor, selected, onDefinition, onChange, onBack, onSave, loading, canPublish, onNotice, readOnly = false }) {
    const graph = editor.definition;
    const [flow, setFlow] = useState(null);
    const [catalog, setCatalog] = useState({});
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('全部');
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [job, setJob] = useState(null);
    const [queue, setQueue] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const locked = readOnly || loading || busy;
    const history = useRef({ past: [], future: [] });
    const copied = useRef(null);
    const reconnecting = useRef(null);
    const graphRef = useRef(graph);
    graphRef.current = graph;
    const [revision, setRevision] = useState(0);
    const refresh = async () => {
        try {
            const result = await getComfyCatalog();
            setCatalog(result.nodes || {});
            setQueue((await getComfyQueue()).items || []);
            setError('');
        }
        catch (e) {
            setError(e.message);
        }
    };
    useEffect(() => {
        history.current = { past: [], future: [] };
        copied.current = null;
        setJob(null);
        void refresh();
        let stopped = false;
        getMyWorkflowRuns().then(async (result) => {
            const run = result.items?.find(r => r.workflowId === selected.id && r.context?.engine === 'comfyui');
            if (run) { const next = await getComfyJob(run.id); if (!stopped) setJob(next); }
        }).catch(e => { if (!stopped) setError(e.message); });
        return () => { stopped = true; };
    }, [selected.id]);
    useEffect(() => {
        if (!job || !['queued', 'running', 'cancelling'].includes(job.status))
            return;
        let stopped = false;
        let timer;
        const tick = async () => {
            try {
                const next = await getComfyJob(job.runId);
                if (!stopped) {
                    setJob(next);
                    setQueue((await getComfyQueue()).items || []);
                }
            }
            catch (e) {
                if (!stopped)
                    setError(e.message);
            }
            if (!stopped)
                timer = setTimeout(tick, 1500);
        };
        timer = setTimeout(tick, 1500);
        return () => { stopped = true; clearTimeout(timer); };
    }, [job?.runId, job?.status]);
    const recordHistory = key => {
        if (key && history.current.editKey === key) return;
        history.current.editKey = key;
        history.current.past.push(structuredClone(graphRef.current));
        history.current.past = history.current.past.slice(-80);
        history.current.future = [];
    };
    const commit = (next, key) => {
        if (locked)
            return;
        if (JSON.stringify(next) === JSON.stringify(graphRef.current)) return;
        recordHistory(key);
        graphRef.current = next;
        onDefinition(next);
        setRevision(n => n + 1);
    };
    const undo = () => {
        const h = history.current;
        if (!h.past.length || locked)
            return;
        h.future.push(structuredClone(graphRef.current));
        h.editKey = null;
        const next = h.past.pop(); graphRef.current = next; onDefinition(next);
        setRevision(n => n + 1);
    };
    const redo = () => {
        const h = history.current;
        if (!h.future.length || locked)
            return;
        h.past.push(structuredClone(graphRef.current));
        h.editKey = null;
        const next = h.future.pop(); graphRef.current = next; onDefinition(next);
        setRevision(n => n + 1);
    };
    useEffect(() => {
        const key = e => {
            if (locked || e.target.closest('input,textarea,select,[contenteditable]') || !(e.ctrlKey || e.metaKey))
                return;
            const k = e.key.toLowerCase();
            if (k === 'z' || k === 'y') {
                e.preventDefault();
                k === 'y' || e.shiftKey ? redo() : undo();
            }
            if (k === 'c') {
                e.preventDefault();
                const ids = new Set(graphRef.current.nodes.filter(n => n.selected).map(n => n.id));
                copied.current = structuredClone({ nodes: graphRef.current.nodes.filter(n => ids.has(n.id)), edges: graphRef.current.edges.filter(e => ids.has(e.source) && ids.has(e.target)) });
            }
            if (k === 'v' && copied.current?.nodes.length) {
                e.preventDefault();
                const current = graphRef.current;
                if (current.nodes.length + copied.current.nodes.length > 80) {
                    onNotice('最多 80 个节点');
                    return;
                }
                const ids = new Map(copied.current.nodes.map(n => [n.id, cryptoId()]));
                commit({ ...current, nodes: [...current.nodes.map(n => ({ ...n, selected: false })), ...copied.current.nodes.map(n => ({ ...structuredClone(n), id: ids.get(n.id), selected: true, position: { x: n.position.x + 45, y: n.position.y + 45 } }))], edges: [...current.edges, ...copied.current.edges.map(e => ({ ...e, id: cryptoId(), source: ids.get(e.source), target: ids.get(e.target) }))] });
            }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [locked, onDefinition, revision]);
    useEffect(() => {
        if (!flow || !Object.keys(catalog).length)
            return;
        const timer = setTimeout(() => {
            const viewport = graphRef.current.viewport;
            if (viewport && (viewport.x || viewport.y || viewport.zoom !== 1)) void flow.setViewport(viewport);
            else void flow.fitView({ padding: 0.2, minZoom: 0.15, maxZoom: 1 });
        }, 120);
        return () => clearTimeout(timer);
    }, [flow, selected.id, !!Object.keys(catalog).length]);
    const nodes = useMemo(() => graph.nodes.map(n => ({ ...n, data: { ...n.data, readOnly: locked, endEdit: () => { history.current.editKey = null; }, active: job?.progress?.node === n.id && job?.status === 'running', info: catalog[n.data.classType], linkedInputs: graph.edges.filter(e => e.target === n.id).map(e => e.targetHandle), update: (name, value) => { const current = graphRef.current; commit({ ...current, nodes: current.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, widgets: { ...x.data.widgets, [name]: value } } } : x) }, `${n.id}:${name}`); } } })), [graph, catalog, job?.progress?.node, job?.status, locked]);
    const valid = c => !locked && validConnection(c, { ...graphRef.current, edges: graphRef.current.edges.filter(e => e.id !== reconnecting.current) }, catalog);
    const load = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file)
            return;
        try {
            if (file.size > 750000)
                throw new Error('工作流文件过大');
            const raw = JSON.parse(await file.text());
            const next = raw.format === 'artedu-comfy-workflow' && raw.definition?.engine === 'comfyui' ? raw.definition : importComfy(raw, catalog);
            validateGraphStructure(next);
            commit(next);
            setError('');
        }
        catch (e) {
            setError(e.message);
        }
    };
    const exportApi = () => {
        try {
            const blob = new Blob([JSON.stringify(compilePrompt(graph, catalog), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'comfy-api-workflow.json';
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            setError(e.message);
        }
    };
    const exportCanvas = () => {
        try {
            validateGraphStructure(graph);
            const { comfyPrompt, ...definition } = graph;
            const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'artedu-comfy-workflow', version: 2, definition }, null, 2)], { type: 'application/json' }));
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'comfy-canvas.json'; anchor.click(); URL.revokeObjectURL(url);
        } catch (e) { setError(e.message); }
    };
    const run = async () => {
        setBusy(true);
        setError('');
        try {
            const prompt = compilePrompt(graph, catalog);
            const saved = readOnly ? null : await onSave(false, { ...graph, comfyPrompt: prompt });
            if (!readOnly && !saved) return;
            const result = await startWorkflowRun(selected.id, {}, saved?.id ?? selected.versionId);
            setJob(await getComfyJob(result.id));
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const addPreset = kind => {
        try {
            const preset = createComfyPreset(kind, catalog, cryptoId);
            if (graph.nodes.length + preset.nodes.length > 80) throw new Error('最多 80 个节点');
            const offset = graph.nodes.length ? Math.max(...graph.nodes.map(n => n.position.y + (n.measured?.height || 400))) + 120 : 0;
            commit({ ...graph, nodes: [...graph.nodes.map(n => ({ ...n, selected: false })), ...preset.nodes.map(n => ({ ...n, selected: true, position: { ...n.position, y: n.position.y + offset } }))], edges: [...graph.edges, ...preset.edges] });
            setError('');
        } catch (e) { setError(e.message); }
    };
    return createPortal(<section className="comfy-editor"><header><button disabled={loading || busy} onClick={onBack}>返回</button>{readOnly ? <strong>{editor.name}</strong> : <input disabled={locked} aria-label="工作流名称" value={editor.name} onChange={e => onChange('name', e.target.value)}/>}<button onClick={refresh}>刷新节点与队列</button>{!readOnly && <><label>导入 ComfyUI JSON<input disabled={locked} hidden type="file" accept=".json" onChange={load}/></label><button onClick={exportCanvas}>导出画布 JSON</button><button onClick={exportApi}>导出 API JSON</button><button disabled={loading || busy} onClick={() => {
                try {
                    validateGraphStructure(graph);
                    const { comfyPrompt, ...draft } = graph;
                    void onSave(false, draft);
                }
                catch (e) {
                    setError(e.message);
                }
            }}>保存</button>{canPublish && <button disabled={loading} onClick={() => {
                    if (window.confirm('发布这个工作流版本，供其他用户运行？')) {
                        try {
                            const prompt = compilePrompt(graph, catalog);
                            void onSave(true, { ...graph, comfyPrompt: prompt });
                        }
                        catch (e) {
                            setError(e.message);
                        }
                    }
                }}>发布</button>}</>}<button disabled={busy || loading || ['queued', 'running', 'cancelling'].includes(job?.status)} onClick={run}>加入运行队列</button></header>
    {error && <p role="alert">{error}</p>}
    <div className="comfy-editor__body">{!readOnly && <button className="comfy-editor__library-toggle" aria-pressed={paletteOpen} onClick={() => setPaletteOpen(v => !v)}>＋ 添加节点</button>}{!readOnly && paletteOpen && <aside className="comfy-editor__library"><input aria-label="搜索 ComfyUI 节点" placeholder="搜索节点" value={query} onChange={e => setQuery(e.target.value)}/><select aria-label="节点分类" value={category} onChange={e => setCategory(e.target.value)}>{['全部', ...new Set(Object.keys(catalog).map(nodeGroup))].map(name => <option key={name}>{name}</option>)}</select><h3>添加完整节点链</h3>{COMFY_PRESETS.map(p => <button key={p.id} disabled={p.required.some(name => !catalog[name])} onClick={() => addPreset(p.id)}>{p.label}</button>)}<small>追加到画布；图生图使用本机图片，局部重绘使用图片透明区域。</small><button onClick={undo}>撤销</button><button onClick={redo}>重做</button><button onClick={() => flow?.fitView({ padding: .2, minZoom: .15 })}>查看全图</button><button onClick={() => flow?.fitView({ nodes: graph.nodes.filter(n => n.selected), padding: .3, maxZoom: 1 })}>聚焦选中节点</button><button disabled={graph.nodes.filter(n => n.selected).length < 2} onClick={() => {
                const ids = graph.nodes.filter(n => n.selected).map(n => n.id);
                if ((graph.groups?.length || 0) >= 20)
                    return onNotice('最多 20 个分组');
                commit({ ...graph, groups: [...(graph.groups || []), { id: cryptoId(), title: '节点分组', color: '#9ed85b', nodeIds: ids }] });
            }}>选中节点建组</button>{(graph.groups || []).map(g => <label key={g.id}>分组<input value={g.title} onChange={e => commit({ ...graph, groups: graph.groups.map(x => x.id === g.id ? { ...x, title: e.target.value } : x) })}/><button onClick={() => commit({ ...graph, groups: graph.groups.filter(x => x.id !== g.id) })}>删除分组</button></label>)}{!Object.keys(catalog).length && <p>请连接 GPU Worker 获取真实节点、模型与参数。</p>}{Object.entries(catalog).filter(([name, info]) => (category === '全部' || nodeGroup(name) === category) && `${name} ${info.display_name} ${info.category} ${nodeGroup(name)}`.toLowerCase().includes(query.toLowerCase())).map(([name, info]) => <button key={name} onClick={() => {
                    if (graph.nodes.length >= 80)
                        return onNotice('最多 80 个节点');
                    commit({ ...graph, nodes: [...graph.nodes, nodeFromInfo(cryptoId(), name, info, { x: 100 + graph.nodes.length % 4 * 300, y: 100 + Math.floor(graph.nodes.length / 4) * 350 })] });
                }}>{info.display_name || name}<small>{nodeGroup(name)} · {info.category}</small></button>)}</aside>}
    <div className="comfy-editor__canvas"><ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} onInit={setFlow} minZoom={0.15} defaultViewport={graph.viewport} onMoveEnd={(_, viewport) => {
            if (!locked) { const next = { ...graphRef.current, viewport }; graphRef.current = next; onDefinition(next); }
        }} nodesDraggable={!locked} nodesConnectable={!locked} edgesReconnectable={!locked} deleteKeyCode={locked ? null : ['Backspace', 'Delete']} onNodeDragStart={() => { if (!locked) recordHistory(); }} onNodesChange={changes => {
            if (!locked) {
                const current = graphRef.current;
                const nextNodes = applyNodeChanges(changes, current.nodes);
                const ids = new Set(nextNodes.map(n => n.id));
                const next = { ...current, nodes: nextNodes, groups: (current.groups || []).map(g => ({ ...g, nodeIds: g.nodeIds.filter(id => ids.has(id)) })).filter(g => g.nodeIds.length >= 2), edges: current.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
                if (changes.every(c => ['select', 'dimensions', 'position'].includes(c.type))) {
                    graphRef.current = next; onDefinition(next);
                }
                else
                    commit(next);
            }
        }} onEdgesChange={changes => {
            if (locked) return;
            const current = graphRef.current, next = { ...current, edges: applyEdgeChanges(changes, current.edges) };
            if (changes.every(c => c.type === 'select')) { graphRef.current = next; onDefinition(next); }
            else commit(next);
        }} isValidConnection={valid} onReconnectStart={(_, edge) => { reconnecting.current = edge.id; }} onReconnectEnd={() => { reconnecting.current = null; }} onReconnect={(edge, connection) => {
            const current = graphRef.current;
            if (!locked && validConnection(connection, { ...current, edges: current.edges.filter(e => e.id !== edge.id) }, catalog)) commit({ ...current, edges: reconnectEdge(edge, connection, current.edges) });
        }} onConnect={c => valid(c) && commit({ ...graphRef.current, edges: addEdge({ ...c, id: cryptoId() }, graphRef.current.edges) })}><ViewportPortal>{(graph.groups || []).map(g => {
            const members = graph.nodes.filter(n => g.nodeIds.includes(n.id));
            if (members.length < 2)
                return null;
            const left = Math.min(...members.map(n => n.position.x)) - 20, top = Math.min(...members.map(n => n.position.y)) - 45, right = Math.max(...members.map(n => n.position.x + (n.measured?.width || 260))) + 20, bottom = Math.max(...members.map(n => n.position.y + (n.measured?.height || 400))) + 20;
            return <div key={g.id} className='comfy-group' style={{ left, top, width: right - left, height: bottom - top, borderColor: g.color }}>{g.title}</div>;
        })}</ViewportPortal><Background /><Controls /><MiniMap /></ReactFlow></div>
    <aside className="comfy-editor__results" aria-live="polite"><section className="comfy-editor__progress"><span>运行进度</span><h3>{({ queued: "排队中", running: "正在运行", cancelling: "正在取消", completed: "运行完成", failed: "运行失败", cancelled: "已取消" })[job?.status] || "等待运行"}</h3><progress max="100" value={job?.status === "completed" ? 100 : job?.progress?.max ? Math.round(job.progress.value / job.progress.max * 100) : 0} /><p>{job?.progress?.max ? `${Math.round(job.progress.value / job.progress.max * 100)}%` : ""}</p></section><h3>运行队列</h3>{queue.map(j => <p key={j.runId}>{j.workflowName} · {j.status}<button disabled={!['queued', 'running'].includes(j.status)} onClick={async () => {
                try {
                    await cancelComfyJob(j.runId);
                    await refresh();
                    if (job?.runId === j.runId)
                        setJob(await getComfyJob(j.runId));
                }
                catch (e) {
                    setError(e.message);
                }
            }}>取消</button><button disabled={!['failed', 'cancelled'].includes(j.status)} onClick={async () => {
                try {
                    const result = await retryComfyJob(j.runId);
                    setJob(await getComfyJob(result.id));
                }
                catch (e) {
                    setError(e.message);
                }
            }}>重试</button></p>)}{job && <><strong>{job.status}</strong><p>{job.progress?.node ? `节点 ${job.progress.node}` : ''} {job.progress?.max ? `${job.progress.value}/${job.progress.max}` : ''}</p>{job.error && <p role="alert">{job.error}</p>}{job.previewUrl && <ZoomableImage src={job.previewUrl} alt="采样实时预览"/>}{job.artifacts?.map(a => <ZoomableImage key={a.id} src={a.downloadUrl} alt="工作流生成的图片" fileName={a.fileName || ""}/>)}</>}</aside></div>
  </section>, document.body);
}
const cryptoId = () => globalThis.crypto?.randomUUID?.() || `node-${Date.now()}-${Math.random().toString(36).slice(2)}`;
