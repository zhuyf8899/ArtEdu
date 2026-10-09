import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ViewportPortal, Background, Controls, MiniMap, Handle, Position, addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { getComfyCatalog, getComfyQueue, cancelComfyJob, retryComfyJob, getComfyJob, getMyWorkflowRuns, startWorkflowRun } from './services/adminApi.js';
import { ports, specs, isWidget, compatible, nodeFromInfo, compilePrompt, importComfy } from './comfyGraph.js';
import './comfy-canvas.css';
import '@xyflow/react/dist/style.css';
function ComfyNode({ data, selected }) {
    const io = ports(data.info);
    const linked = new Set(data.linkedInputs);
    return <div className={`comfy-node ${selected ? 'is-selected' : ''} ${data.active ? 'is-running' : ''}`}><strong>{data.label}</strong><small>{data.classType}</small>
    {io.inputs.map(p => <div className="comfy-port" key={p.name}><Handle id={p.name} type="target" position={Position.Left}/><span>{p.name}</span><small>{p.type}</small></div>)}
    {io.outputs.map(p => <div className="comfy-port comfy-port--out" key={p.name}><Handle id={p.name} type="source" position={Position.Right}/><span>{p.label}</span><small>{p.type}</small></div>)}
    {specs(data.info).filter(([, s]) => isWidget(s)).map(([name, s]) => <label className="nodrag" key={name}><Handle id={name} type="target" position={Position.Left}/><span>{name}</span>{linked.has(name) ? <small>由上游提供</small> : Array.isArray(s[0]) ? <select value={data.widgets[name] ?? ''} onChange={e => data.update(name, e.target.value)}>{s[0].map(v => <option key={v} value={v}>{v}</option>)}</select> : s[0] === 'BOOLEAN' ? <input type="checkbox" checked={!!data.widgets[name]} onChange={e => data.update(name, e.target.checked)}/> : s[0] === 'STRING' && s[1]?.multiline ? <textarea value={data.widgets[name] ?? ''} onChange={e => data.update(name, e.target.value)}/> : <input type={s[0] === 'STRING' ? 'text' : 'number'} min={s[1]?.min} max={s[1]?.max} step={s[0] === 'FLOAT' ? 'any' : 1} value={data.widgets[name] ?? ''} onChange={e => data.update(name, s[0] === 'STRING' ? e.target.value : Number(e.target.value))}/>}</label>)}
  </div>;
}
const nodeTypes = { comfy: ComfyNode };
export function ComfyCanvas({ editor, selected, onDefinition, onChange, onBack, onSave, loading, canPublish, onNotice, readOnly = false }) {
    const graph = editor.definition;
    const [flow, setFlow] = useState(null);
    const [catalog, setCatalog] = useState({});
    const [query, setQuery] = useState('');
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [job, setJob] = useState(null);
    const [queue, setQueue] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const history = useRef({ past: [], future: [] });
    const copied = useRef(null);
    const graphRef = useRef(graph);
    graphRef.current = graph;
    const [revision, setRevision] = useState(0);
    const refresh = async () => {
        try {
            const result = await getComfyCatalog();
            setCatalog(result.nodes || {});
            setQueue((await getComfyQueue()).items || []);
        }
        catch (e) {
            setError(e.message);
        }
    };
    useEffect(() => {
        void refresh();
        getMyWorkflowRuns().then(async (result) => {
            const run = result.items?.find(r => r.workflowId === selected.id && r.context?.engine === 'comfyui');
            if (run)
                setJob(await getComfyJob(run.id));
        }).catch(e => setError(e.message));
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
    const commit = next => {
        if (readOnly)
            return;
        history.current.past.push(structuredClone(graphRef.current));
        history.current.past = history.current.past.slice(-80);
        history.current.future = [];
        onDefinition(next);
        setRevision(n => n + 1);
    };
    const undo = () => {
        const h = history.current;
        if (!h.past.length || readOnly)
            return;
        h.future.push(structuredClone(graphRef.current));
        onDefinition(h.past.pop());
        setRevision(n => n + 1);
    };
    const redo = () => {
        const h = history.current;
        if (!h.future.length || readOnly)
            return;
        h.past.push(structuredClone(graphRef.current));
        onDefinition(h.future.pop());
        setRevision(n => n + 1);
    };
    useEffect(() => {
        const key = e => {
            if (readOnly || e.target.closest('input,textarea,select,[contenteditable]') || !(e.ctrlKey || e.metaKey))
                return;
            const k = e.key.toLowerCase();
            if (k === 'z' || k === 'y') {
                e.preventDefault();
                k === 'y' || e.shiftKey ? redo() : undo();
            }
            if (k === 'c') {
                e.preventDefault();
                const ids = new Set(graphRef.current.nodes.filter(n => n.selected).map(n => n.id));
                copied.current = { nodes: graphRef.current.nodes.filter(n => ids.has(n.id)), edges: graphRef.current.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
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
    }, [readOnly, onDefinition, revision]);
    useEffect(() => {
        if (!flow || !Object.keys(catalog).length)
            return;
        const timer = setTimeout(() => flow.fitView({ padding: 0.2, minZoom: 0.15, maxZoom: 1 }), 120);
        return () => clearTimeout(timer);
    }, [flow, catalog, graph.nodes.length]);
    const nodes = useMemo(() => graph.nodes.map(n => ({ ...n, data: { ...n.data, active: job?.progress?.node === n.id && job?.status === 'running', info: catalog[n.data.classType], linkedInputs: graph.edges.filter(e => e.target === n.id).map(e => e.targetHandle), update: (name, value) => commit({ ...graph, nodes: graph.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, widgets: { ...x.data.widgets, [name]: value } } } : x) }) } })), [graph, catalog, job?.progress?.node, job?.status]);
    const valid = c => {
        const a = graph.nodes.find(n => n.id === c.source), b = graph.nodes.find(n => n.id === c.target);
        if (!a || !b || a.id === b.id || graph.edges.some(e => e.target === b.id && e.targetHandle === c.targetHandle))
            return false;
        const from = catalog[a.data.classType]?.output?.[Number(c.sourceHandle)];
        const to = specs(catalog[b.data.classType]).find(([name]) => name === c.targetHandle)?.[1]?.[0];
        if (!from || !to || Array.isArray(to) || !compatible(from, to))
            return false;
        const seen = new Set();
        const visit = id => {
            if (id === a.id)
                return true;
            if (seen.has(id))
                return false;
            seen.add(id);
            return graph.edges.filter(e => e.source === id).some(e => visit(e.target));
        };
        return !visit(b.id);
    };
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
            compilePrompt(next, catalog);
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
    const run = async () => {
        setBusy(true);
        setError('');
        try {
            const prompt = compilePrompt(graph, catalog);
            if (!readOnly && !await onSave(false, { ...graph, comfyPrompt: prompt }))
                return;
            const result = await startWorkflowRun(selected.id);
            setJob(await getComfyJob(result.id));
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    return createPortal(<section className="comfy-editor"><header><button onClick={onBack}>返回</button>{readOnly ? <strong>{editor.name}</strong> : <input aria-label="工作流名称" value={editor.name} onChange={e => onChange('name', e.target.value)}/>}<button onClick={refresh}>刷新节点与队列</button>{!readOnly && <><label>导入 ComfyUI JSON<input hidden type="file" accept=".json" onChange={load}/></label><button onClick={exportApi}>导出 API JSON</button><button disabled={loading} onClick={() => {
                try {
                    void onSave(false, { ...graph, comfyPrompt: compilePrompt(graph, catalog) });
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
    <div className="comfy-editor__body">{!readOnly && <button className="comfy-editor__library-toggle" aria-pressed={paletteOpen} onClick={() => setPaletteOpen(v => !v)}>＋ 添加节点</button>}{!readOnly && paletteOpen && <aside className="comfy-editor__library"><input aria-label="搜索 ComfyUI 节点" placeholder="搜索节点" value={query} onChange={e => setQuery(e.target.value)}/><button onClick={undo}>撤销</button><button onClick={redo}>重做</button><button onClick={() => flow?.fitView({ padding: .2, minZoom: .15 })}>查看全图</button><button onClick={() => flow?.fitView({ nodes: graph.nodes.filter(n => n.selected), padding: .3, maxZoom: 1 })}>聚焦选中节点</button><button disabled={graph.nodes.filter(n => n.selected).length < 2} onClick={() => {
                const ids = graph.nodes.filter(n => n.selected).map(n => n.id);
                if ((graph.groups?.length || 0) >= 20)
                    return onNotice('最多 20 个分组');
                commit({ ...graph, groups: [...(graph.groups || []), { id: cryptoId(), title: '节点分组', color: '#9ed85b', nodeIds: ids }] });
            }}>选中节点建组</button>{(graph.groups || []).map(g => <label key={g.id}>分组<input value={g.title} onChange={e => commit({ ...graph, groups: graph.groups.map(x => x.id === g.id ? { ...x, title: e.target.value } : x) })}/><button onClick={() => commit({ ...graph, groups: graph.groups.filter(x => x.id !== g.id) })}>删除分组</button></label>)}{!Object.keys(catalog).length && <p>请连接 GPU Worker 获取真实节点、模型与参数。</p>}{Object.entries(catalog).filter(([name, info]) => `${name} ${info.display_name} ${info.category}`.toLowerCase().includes(query.toLowerCase())).map(([name, info]) => <button key={name} onClick={() => {
                    if (graph.nodes.length >= 80)
                        return onNotice('最多 80 个节点');
                    commit({ ...graph, nodes: [...graph.nodes, nodeFromInfo(cryptoId(), name, info, { x: 100 + graph.nodes.length % 4 * 300, y: 100 + Math.floor(graph.nodes.length / 4) * 350 })] });
                }}>{info.display_name || name}<small>{info.category}</small></button>)}</aside>}
    <div className="comfy-editor__canvas"><ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} onInit={setFlow} minZoom={0.15} fitView nodesDraggable={!readOnly} nodesConnectable={!readOnly} deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']} onNodesChange={changes => {
            if (!readOnly) {
                const nextNodes = applyNodeChanges(changes, graph.nodes);
                const ids = new Set(nextNodes.map(n => n.id));
                const next = { ...graph, nodes: nextNodes, groups: (graph.groups || []).map(g => ({ ...g, nodeIds: g.nodeIds.filter(id => ids.has(id)) })).filter(g => g.nodeIds.length >= 2), edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
                if (changes.every(c => c.type === 'select'))
                    onDefinition(next);
                else
                    commit(next);
            }
        }} onEdgesChange={changes => !readOnly && commit({ ...graph, edges: applyEdgeChanges(changes, graph.edges) })} isValidConnection={valid} onConnect={c => valid(c) && commit({ ...graph, edges: addEdge({ ...c, id: cryptoId() }, graph.edges) })}><ViewportPortal>{(graph.groups || []).map(g => {
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
            }}>重试</button></p>)}{job && <><strong>{job.status}</strong><p>{job.progress?.node ? `节点 ${job.progress.node}` : ''} {job.progress?.max ? `${job.progress.value}/${job.progress.max}` : ''}</p>{job.error && <p role="alert">{job.error}</p>}{job.previewUrl && <img src={job.previewUrl} alt="采样实时预览"/>}{job.artifacts?.map(a => <a key={a.id} href={a.downloadUrl} target="_blank" rel="noreferrer"><img src={a.downloadUrl} alt={a.fileName}/></a>)}</>}</aside></div>
  </section>, document.body);
}
const cryptoId = () => globalThis.crypto?.randomUUID?.() || `node-${Date.now()}-${Math.random().toString(36).slice(2)}`;
