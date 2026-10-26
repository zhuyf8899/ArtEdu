// ComfyUI API prompts and UI workflows are distinct formats. Never guess widget order.
export function specs(info) {
    const inputs = { ...(info?.input?.required || {}), ...(info?.input?.optional || {}) };
    const order = [...(info?.input_order?.required || []), ...(info?.input_order?.optional || [])];
    return [...new Set([...order, ...Object.keys(inputs)])].filter(name => name in inputs).map(name => [name, inputs[name]]);
}
export function isWidget(spec) { return Array.isArray(spec?.[0]) || ['INT', 'FLOAT', 'STRING', 'BOOLEAN'].includes(spec?.[0]) && !spec?.[1]?.forceInput; }
export function ports(info) {
    return { inputs: specs(info).filter(([, s]) => !isWidget(s)).map(([name, s]) => ({ name, type: s[0] })),
        outputs: (info?.output || []).map((type, i) => ({ name: String(i), type, label: info.output_name?.[i] || type })) };
}
export function compatible(from, to) {
    if (Array.isArray(from) || Array.isArray(to)) return false;
    return typeof from === 'string' && typeof to === 'string' && (from === '*' || to === '*' || from.split(',').some(type => to.split(',').map(t => t.trim()).includes(type.trim())));
}
export function validateGraphStructure(definition) {
    if (!definition || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges) || definition.nodes.length < 1 || definition.nodes.length > 80 || definition.edges.length > 160) throw new Error('工作流需包含 1 至 80 个节点，最多 160 条连线');
    const ids = new Set(), edgeIds = new Set(), inputs = new Set();
    if (definition.viewport && (!Number.isFinite(definition.viewport.x) || !Number.isFinite(definition.viewport.y) || !Number.isFinite(definition.viewport.zoom) || definition.viewport.zoom <= 0 || definition.viewport.zoom > 4)) throw new Error('画布视角无效');
    for (const node of definition.nodes) {
        if (typeof node.id !== 'string' || !node.id || node.id.length > 80 || ids.has(node.id)) throw new Error('节点 ID 无效或重复');
        ids.add(node.id);
        if (typeof node.data?.label !== 'string' || !node.data.label || node.data.label.length > 160) throw new Error('节点标题无效');
        if (node.type !== 'comfy' || typeof node.data?.classType !== 'string' || !node.data.classType || !node.data.widgets || typeof node.data.widgets !== 'object' || Array.isArray(node.data.widgets) || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) throw new Error('ComfyUI 节点数据无效');
    }
    for (const edge of definition.edges) {
        if (!edge.id || edgeIds.has(edge.id)) throw new Error('连线 ID 无效或重复');
        edgeIds.add(edge.id);
        if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('连线引用不存在的节点');
        if (!/^\d+$/.test(edge.sourceHandle ?? '') || !Number.isSafeInteger(Number(edge.sourceHandle)) || Number(edge.sourceHandle) > 255 || !edge.targetHandle) throw new Error('连线端口无效');
        const key = JSON.stringify([edge.target, edge.targetHandle]);
        if (inputs.has(key)) throw new Error('一个输入端口只能有一条连线');
        inputs.add(key);
    }
    const active = new Set(), visited = new Set();
    const visit = id => {
        if (active.has(id)) throw new Error('工作流不能包含循环连接');
        if (visited.has(id)) return;
        active.add(id); definition.edges.filter(e => e.target === id).forEach(e => visit(e.source)); active.delete(id); visited.add(id);
    };
    ids.forEach(visit);
    const groupIds = new Set();
    if ((definition.groups?.length || 0) > 20) throw new Error('最多 20 个分组');
    for (const group of definition.groups || []) {
        if (!group.id || groupIds.has(group.id) || typeof group.title !== 'string' || !group.title.trim() || group.title.length > 80 || !/^#[0-9a-fA-F]{6}$/.test(group.color) || !Array.isArray(group.nodeIds) || group.nodeIds.length < 2 || new Set(group.nodeIds).size !== group.nodeIds.length || group.nodeIds.some(id => !ids.has(id))) throw new Error('分组数据无效');
        groupIds.add(group.id);
    }
    if (new TextEncoder().encode(JSON.stringify(definition)).length > 750000) throw new Error('工作流及保留的原始元数据超过 750 KB，请精简节点或插件数据');
    return definition;
}
export function validConnection(connection, definition, catalog) {
    if (definition.edges.length >= 160) return false;
    const source = definition.nodes.find(n => n.id === connection.source), target = definition.nodes.find(n => n.id === connection.target);
    if (!source || !target || source.id === target.id || !/^\d+$/.test(connection.sourceHandle ?? '') || definition.edges.some(e => e.target === target.id && e.targetHandle === connection.targetHandle)) return false;
    const from = catalog[source.data.classType]?.output?.[Number(connection.sourceHandle)];
    const to = specs(catalog[target.data.classType]).find(([name]) => name === connection.targetHandle)?.[1]?.[0];
    if (!compatible(from, to)) return false;
    const seen = new Set();
    const reachesSource = id => { if (id === source.id) return true; if (seen.has(id)) return false; seen.add(id); return definition.edges.filter(e => e.source === id).some(e => reachesSource(e.target)); };
    return !reachesSource(target.id);
}
export function nodeFromInfo(id, classType, info, position) {
    const widgets = Object.fromEntries(specs(info).filter(([, s]) => isWidget(s)).map(([name, s]) => [name, s[1]?.default ?? (Array.isArray(s[0]) ? s[0][0] : s[0] === 'BOOLEAN' ? false : s[0] === 'STRING' ? '' : Math.max(s[1]?.min ?? 0, Math.min(s[1]?.max ?? 0, 0)))]));
    return { id: String(id), type: 'comfy', position, data: { label: info.display_name || classType, classType, widgets } };
}
export function compilePrompt(definition, catalog) {
    validateGraphStructure(definition);
    const prompt = Object.create(null);
    const ids = new Set(definition.nodes.map(n => n.id));
    const visiting = new Set();
    const visited = new Set();
    const visit = id => {
        if (visiting.has(id))
            throw new Error('工作流不能包含循环连接');
        if (visited.has(id))
            return;
        visiting.add(id);
        definition.edges.filter(e => e.target === id).forEach(e => visit(e.source));
        visiting.delete(id);
        visited.add(id);
    };
    for (const n of definition.nodes) {
        const info = catalog[n.data.classType];
        if (!info)
            throw new Error(`缺少节点：${n.data.classType}，请连接提供该节点的 Worker`);
        visit(n.id);
        const inputs = { ...n.data.widgets };
        for (const e of definition.edges.filter(e => e.target === n.id)) {
            const source = definition.nodes.find(n => n.id === e.source);
            if (!source || !ids.has(e.target))
                throw new Error('连线引用不存在的节点');
            const outputType = catalog[source.data.classType]?.output?.[Number(e.sourceHandle)];
            const targetSpec = specs(info).find(([name]) => name === e.targetHandle)?.[1];
            if (!targetSpec || !outputType || !compatible(outputType, targetSpec[0]))
                throw new Error(`端口类型不匹配：${n.data.label}.${e.targetHandle}`);
            inputs[e.targetHandle] = [e.source, Number(e.sourceHandle)];
        }
        for (const name of Object.keys(info.input?.required || {}))
            if (!(name in inputs))
                throw new Error(`${n.data.label} 缺少输入 ${name}`);
        for (const [name, value] of Object.entries(inputs)) {
            const spec = specs(info).find(([key]) => key === name)?.[1];
            if (!spec) throw new Error(`${n.data.label} 未知输入 ${name}`);
            if (definition.edges.some(e => e.target === n.id && e.targetHandle === name)) continue;
            const [type, options = {}] = spec;
            if (options.forceInput) throw new Error(`${n.data.label}.${name} 必须连接 ${type} 端口`);
            const valid = Array.isArray(type) ? type.includes(value)
                : type === 'STRING' ? typeof value === 'string' && value.length <= 10000
                : type === 'BOOLEAN' ? typeof value === 'boolean'
                : ['INT', 'FLOAT'].includes(type) ? typeof value === 'number' && Number.isFinite(value)
                    && (type !== 'INT' || Number.isSafeInteger(value))
                    && (options.min === undefined || value >= options.min) && (options.max === undefined || value <= options.max)
                : false;
            if (!valid) throw new Error(`${n.data.label}.${name} 参数无效或需要连接 ${Array.isArray(type) ? '有效选项' : type} 端口`);
        }
        prompt[n.id] = { class_type: n.data.classType, inputs, _meta: { title: n.data.label } };
    }
    if (!definition.nodes.some(n => catalog[n.data.classType]?.output_node))
        throw new Error('需要 SaveImage 等输出节点');
    return prompt;
}
function importComfyStrict(raw, catalog) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('不是有效的 ComfyUI 工作流');
    const input = raw.prompt || raw;
    if (Array.isArray(input.nodes)) {
        if (input.definitions?.subgraphs?.length) throw new Error('嵌套子图请先展开或导出 API 格式');
        const nodes = input.nodes.filter(n => n.type !== 'Reroute').map(n => {
            const info = catalog[n.type];
            if (!info)
                throw new Error(`缺少节点 ${n.type}，无法安全解析 widgets_values`);
            if (n.mode && n.mode !== 0)
                throw new Error('请先在 ComfyUI 中取消静音/旁路，再导出 API 格式');
            const node = nodeFromInfo(n.id, n.type, info, { x: n.pos?.[0] || 0, y: n.pos?.[1] || 0 });
            const names = specs(info).filter(([, s]) => isWidget(s)).map(([name]) => name);
            const values = n.widgets_values || [];
            if (!Array.isArray(values)) throw new Error(`${n.type} 的控件顺序无法可靠映射，请用 ComfyUI 导出 API 格式`);
            const mappedValues = [...values];
            names.forEach((name, i) => {
                const spec = specs(info).find(([key]) => key === name)[1];
                if (spec[1]?.control_after_generate || ['KSampler','KSamplerAdvanced'].includes(n.type) && ['seed','noise_seed'].includes(name)) {
                    const index = i + 1;
                    if (['fixed', 'increment', 'decrement', 'randomize'].includes(mappedValues[index])) { mappedValues.splice(index, 1); }
                }
            });
            if (!Array.isArray(values) || mappedValues.length !== names.length)
                throw new Error(`${n.type} 的控件顺序无法可靠映射，请用 ComfyUI 导出 API 格式`);
            names.forEach((name, i) => { node.data.widgets[name] = mappedValues[i]; });
            return node;
        });
        const byId = new Map(input.nodes.map(n => [String(n.id), n]));
        const links = (input.links || []).map(link => Array.isArray(link) ? link : [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot]);
        const resolve = (source, slot, seen = new Set()) => {
            const node = byId.get(String(source));
            if (!node) throw new Error('连线引用不存在的节点');
            if (node.type !== 'Reroute') return [source, slot];
            if (seen.has(String(source))) throw new Error('Reroute 不能包含循环连接');
            if (node.mode && node.mode !== 0) throw new Error('请先取消 Reroute 静音/旁路');
            seen.add(String(source));
            const incoming = links.filter(link => String(link[3]) === String(source));
            if (incoming.length !== 1) throw new Error('Reroute 需要且只能有一条输入连线');
            return resolve(incoming[0][1], incoming[0][2], seen);
        };
        const edges = links.filter(link => byId.get(String(link[3]))?.type !== 'Reroute').map((link, index) => {
            const [id, origin, originSlot, target, targetSlot] = link;
            const [source, slot] = resolve(origin, originSlot);
            const targetHandle = byId.get(String(target))?.inputs?.[targetSlot]?.name;
            if (!targetHandle)
                throw new Error('无法识别 UI 连线输入');
            return { id: String(id ?? index), source: String(source), target: String(target), sourceHandle: String(slot), targetHandle };
        });
        const groups = (input.groups || []).map((group, index) => {
            const [x, y, width, height] = group.bounding || [];
            return { id: `group-${index}`, title: group.title || '节点分组', color: /^#[0-9a-fA-F]{6}$/.test(group.color) ? group.color : '#9ed85b', nodeIds: nodes.filter(n => n.position.x >= x && n.position.x <= x + width && n.position.y >= y && n.position.y <= y + height).map(n => n.id) };
        }).filter(group => group.nodeIds.length >= 2);
        return validateGraphStructure({ schemaVersion: 2, engine: 'comfyui', nodes, edges, groups, viewport: { x: 0, y: 0, zoom: 1 } });
    }
    if (!input || typeof input !== 'object' || !Object.keys(input).length)
        throw new Error('不是有效的 ComfyUI 工作流');
    const nodes = [];
    const edges = [];
    Object.entries(input).forEach(([id, n], index) => {
        if (!n?.class_type || !n.inputs || !catalog[n.class_type])
            throw new Error(`缺少节点定义：${n?.class_type || id}`);
        const node = nodeFromInfo(id, n.class_type, catalog[n.class_type], { x: (index % 4) * 310, y: Math.floor(index / 4) * 390 });
        node.data.label = n._meta?.title || node.data.label;
        node.data.widgets = {};
        Object.entries(n.inputs).forEach(([name, value]) => {
            if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'number')
                edges.push({ id: `${id}-${name}`, source: String(value[0]), target: id, sourceHandle: String(value[1]), targetHandle: name });
            else
                node.data.widgets[name] = value;
        });
        nodes.push(node);
    });
    return validateGraphStructure({ schemaVersion: 2, engine: 'comfyui', nodes, edges, groups: [], viewport: { x: 0, y: 0, zoom: 1 } });
}

const clone = value => structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const linkTuple = link => Array.isArray(link) ? link : [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot, link.type];
const nodeKey = value => {
    if (!['string', 'number'].includes(typeof value) || !String(value) || String(value).length > 80 || typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('节点 ID 无效');
    return String(value);
};
function boundedFile(raw) {
    if (!object(raw) || new TextEncoder().encode(JSON.stringify(raw)).length > 750000) throw new Error('工作流文件无效或超过 750 KB');
}
function viewportFromUI(raw) {
    const ds = raw.extra?.ds;
    return ds && Number.isFinite(ds.offset?.[0]) && Number.isFinite(ds.offset?.[1]) && Number.isFinite(ds.scale) && ds.scale > 0 && ds.scale <= 4
        ? { x: ds.offset[0], y: ds.offset[1], zoom: ds.scale } : { x: 0, y: 0, zoom: 1 };
}
function uiGroups(raw, nodes) {
    return (raw.groups || []).map((g, i) => {
        const [x,y,w,h] = g.bounding || [];
        if (![x,y,w,h].every(Number.isFinite) || w < 0 || h < 0) throw new Error('分组边界无效');
        return { id: `group-${i}`, title: g.title || '节点分组', color: /^#[\da-f]{6}$/i.test(g.color) ? g.color : '#9ed85b', nodeIds: nodes.filter(n=>n.position.x>=x && n.position.x<=x+w && n.position.y>=y && n.position.y<=y+h).map(n=>n.id) };
    }).filter(g=>g.nodeIds.length>=2);
}

/** Offline exchange preserves opaque custom widgets; only known widget orders are mapped. */
export function importComfy(raw, catalog = {}) {
    boundedFile(raw);
    if (raw.format === 'artedu-comfy-workflow') {
        if (raw.definition?.engine !== 'comfyui') throw new Error('这不是原生 ComfyUI 交换文件');
        const graph = clone(raw.definition); delete graph.comfyPrompt;
        return validateGraphStructure(graph);
    }
    let input = Array.isArray(raw.nodes) ? raw : Array.isArray(raw.workflow?.nodes) ? raw.workflow : raw.prompt || raw;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch { throw new Error('工作流元数据不是合法 JSON'); } }
    boundedFile(input);
    if (Array.isArray(input.nodes)) {
        if (!input.nodes.length || input.nodes.length > 80 || !Array.isArray(input.links || []) || (input.links?.length || 0) > 160) throw new Error('工作流节点或连线数量超限');
        const ids = new Set();
        input.nodes.forEach(n=>{ const id=nodeKey(n.id); if(ids.has(id))throw new Error('节点 ID 无效或重复'); ids.add(id); });
        const links = (input.links || []).map(linkTuple), linkIds = new Set();
        for (const link of links) {
            if (!['number','string'].includes(typeof link[0]) || linkIds.has(String(link[0]))) throw new Error('连线 ID 无效或重复');
            linkIds.add(String(link[0]));
            if (!ids.has(String(link[1])) || !ids.has(String(link[3])) || !Number.isInteger(link[2]) || link[2]<0 || link[2]>255 || !Number.isInteger(link[4]) || link[4]<0 || link[4]>255) throw new Error('连线引用不存在的节点或无效端口');
        }
        const strict = !input.definitions?.subgraphs?.length && input.nodes.every(n=>!n.mode && (n.type==='Reroute' || catalog[n.type]) && Array.isArray(n.widgets_values || []));
        let graph;
        if (strict) graph = importComfyStrict(input, catalog);
        else {
            const nodes=input.nodes.map(n=>{
                if(typeof n.type!=='string'||!n.type)throw new Error('节点类型无效');
                const known=catalog[n.type];
                // Named widgets have no ordering ambiguity. Positional plugin widgets remain opaque.
                const widgets=object(n.widgets_values)?clone(n.widgets_values):{};
                const x=n.pos?.[0]??0,y=n.pos?.[1]??0;
                const result={id:nodeKey(n.id),type:'comfy',position:{x,y},data:{label:n.title||known?.display_name||n.type,classType:n.type,widgets}};
                if(known && Array.isArray(n.widgets_values) && !n.mode) {
                    const single=importComfyStrict({nodes:[{...n,inputs:[]}],links:[]},{[n.type]:known});
                    result.data.widgets=single.nodes[0].data.widgets;
                }
                return result;
            });
            const byId=new Map(input.nodes.map(n=>[String(n.id),n]));
            const edges=links.map(([id,source,slot,target,targetSlot])=>{
                const targetHandle=byId.get(String(target))?.inputs?.[targetSlot]?.name;
                if(!targetHandle)throw new Error('无法识别 UI 连线输入');
                return {id:String(id),source:String(source),target:String(target),sourceHandle:String(slot),targetHandle};
            });
            graph={schemaVersion:2,engine:'comfyui',nodes,edges,groups:uiGroups(input,nodes)};
        }
        graph.viewport=viewportFromUI(input);
        for(const node of graph.nodes) {
            const original=input.nodes.find(n=>String(n.id)===node.id);
            node.data.label=original.title||node.data.label;
            node.data.comfyUI=clone(original);
            if(catalog[node.data.classType])node.data.comfyInfo=clone(catalog[node.data.classType]);
            const api=object(raw.prompt)&&raw.prompt[node.id];
            if(object(api)&&api.class_type===node.data.classType&&object(api.inputs)) {
                node.data.comfyAPI=clone(api);
                if(!node.data.comfyInfo) {
                    node.data.widgets=Object.fromEntries(Object.entries(api.inputs).filter(([,v])=>!(Array.isArray(v)&&v.length===2&&typeof v[1]==='number')));
                    node.data.comfyOriginalWidgets=clone(node.data.widgets);
                }
            }
            node.data.comfyOriginalWidgets=clone(node.data.widgets);
            node.data.comfyOriginalLabel=node.data.label;
        }
        graph.comfyExchange={format:'ui',source:clone(input),edges:clone(graph.edges),groups:clone(graph.groups),collapsedReroutes:input.nodes.filter(n=>n.type==='Reroute'&&!graph.nodes.some(v=>v.id===String(n.id))).map(n=>String(n.id))};
        return validateGraphStructure(graph);
    }
    if (!object(input) || !Object.keys(input).length) throw new Error('不是有效的 ComfyUI 工作流');
    const nodes=[],edges=[];
    for(const [id,n] of Object.entries(input)) {
        nodeKey(id);
        if(!object(n)||typeof n.class_type!=='string'||!object(n.inputs))throw new Error(`缺少节点定义：${n?.class_type||id}`);
        const known=catalog[n.class_type];
        const node=known?nodeFromInfo(id,n.class_type,known,{x:(nodes.length%4)*310,y:Math.floor(nodes.length/4)*390}):{id,type:'comfy',position:{x:(nodes.length%4)*310,y:Math.floor(nodes.length/4)*390},data:{label:n.class_type,classType:n.class_type,widgets:{}}};
        node.data.widgets={};node.data.label=n._meta?.title||node.data.label;node.data.comfyAPI=clone(n);
        if(known)node.data.comfyInfo=clone(known);
        for(const [name,value] of Object.entries(n.inputs)) {
            if(Array.isArray(value)&&value.length===2&&typeof value[1]==='number'&&['string','number'].includes(typeof value[0])){
                if(!Number.isInteger(value[1])||value[1]<0)throw new Error('连线端口无效');
                edges.push({id:`${id}-${name}`,source:String(value[0]),target:id,sourceHandle:String(value[1]),targetHandle:name});
            }else Object.defineProperty(node.data.widgets,name,{value:clone(value),enumerable:true,writable:true,configurable:true});
        }
        nodes.push(node);
    }
    return validateGraphStructure({schemaVersion:2,engine:'comfyui',nodes,edges,groups:[],viewport:{x:0,y:0,zoom:1},comfyExchange:{format:'api'}});
}

function metadata(node, catalog) { return node.data.comfyInfo || (Object.hasOwn(catalog,node.data.classType) ? catalog[node.data.classType] : undefined); }

/** API interchange requires named inputs, not an online GPU or an executable provider. */
export function exportComfyApi(graph, catalog = {}) {
    validateGraphStructure(graph);
    const prompt=Object.create(null);
    if(graph.comfyExchange?.source?.definitions?.subgraphs?.length)throw new Error('子图可用 UI JSON 完整导出；导出 API 前请在 ComfyUI 中展开子图');
    for(const n of graph.nodes) {
        if(n.data.comfyUI?.mode)throw new Error(`节点 ${n.data.label} 已静音或旁路，请使用 UI JSON 保留其语义`);
        if(n.data.classType==='Reroute')throw new Error('离线 Reroute 请使用 UI JSON 导出，或在 ComfyUI 中导出 API 格式');
        const info=metadata(n,catalog);
        if(n.data.comfyUI && Array.isArray(n.data.comfyUI.widgets_values) && n.data.comfyUI.widgets_values.length && !info && !n.data.comfyAPI)throw new Error(`缺少 ${n.data.classType} 控件定义，无法可靠生成 API 输入；可导出 UI JSON`);
        const inputs={...n.data.widgets};
        for(const edge of graph.edges.filter(e=>e.target===n.id))Object.defineProperty(inputs,edge.targetHandle,{value:[edge.source,Number(edge.sourceHandle)],enumerable:true,writable:true,configurable:true});
        // Known catalogs still enforce required inputs, types and parameter limits.
        if(info) {
            for(const name of Object.keys(info.input?.required||{}))if(!(name in inputs))throw new Error(`${n.data.label} 缺少输入 ${name}`);
        }
        prompt[n.id]={...(n.data.comfyAPI||{}),class_type:n.data.classType,inputs,_meta:{...(n.data.comfyAPI?._meta||{}),title:n.data.label}};
    }
    return prompt;
}

/** Standard ComfyUI UI workflow, never the platform-private canvas wrapper. */
export function exportComfyUI(graph, catalog = {}, version = graph.comfyExchange?.source?.version ?? 0.4) {
    validateGraphStructure(graph);
    if(![0.4,1].includes(version))throw new Error('UI JSON 仅支持 0.4 或 1.0');
    const source=graph.comfyExchange?.source;
    const sameEdges=source && JSON.stringify(graph.edges)===JSON.stringify(graph.comfyExchange.edges);
    // Exact import/export is essential for reference workflows: do not inject
    // default titles, sizes, counters or viewport fields into an untouched file.
    const unchanged=source && version===source.version && sameEdges
        && graph.nodes.length+(graph.comfyExchange.collapsedReroutes?.length||0)===(source.nodes?.length||0)
        && JSON.stringify(graph.groups)===JSON.stringify(graph.comfyExchange.groups)
        && JSON.stringify(graph.viewport)===JSON.stringify(viewportFromUI(source))
        && graph.nodes.every(node=>{
            const original=source.nodes.find(n=>String(n.id)===node.id);
            return original && original.type===node.data.classType
                && node.position.x===(original.pos?.[0]??0) && node.position.y===(original.pos?.[1]??0)
                && node.data.label===node.data.comfyOriginalLabel
                && JSON.stringify(node.data.widgets)===JSON.stringify(node.data.comfyOriginalWidgets)
                && JSON.stringify(node.data.comfyUI)===JSON.stringify(original);
        });
    if(unchanged)return clone(source);
    if(source?.reroutes?.length && (!sameEdges || version!==source.version))throw new Error('新版转接点请保持原 UI 格式与连线导出，或先在 ComfyUI 中展开后再转换');
    const raw=source?clone(source):{};
    const visible=new Set(graph.nodes.map(n=>n.id));
    // Keep imported Reroute topology and opaque metadata when links are unchanged.
    const hidden=sameEdges?(source.nodes||[]).filter(n=>!visible.has(String(n.id))&&graph.comfyExchange.collapsedReroutes?.includes(String(n.id))).map(clone):[];
    const rawNodes=graph.nodes.map((n,index)=>{
        const ui=n.data.comfyUI?clone(n.data.comfyUI):{};
        const info=metadata(n,catalog);
        if(!info && Array.isArray(ui.widgets_values) && n.data.comfyOriginalWidgets && JSON.stringify(n.data.widgets)!==JSON.stringify(n.data.comfyOriginalWidgets))throw new Error('缺少控件顺序定义，修改后的命名参数请导出 API JSON，避免写回错误的 UI 控件');
        ui.id=String(ui.id)===n.id?ui.id:n.id;ui.type=n.data.classType;ui.title=n.data.label;ui.pos=[n.position.x,n.position.y];ui.size=ui.size||[280,180];ui.flags=ui.flags||{};ui.order=ui.order??index;ui.mode=ui.mode??0;ui.properties=ui.properties||{};
        if(info && !ui.mode) {
            const names=specs(info).filter(([,s])=>isWidget(s)).map(([name])=>name);
            const values=[];
            for(const name of names) {
                const spec=specs(info).find(([key])=>key===name)[1];
                values.push(n.data.widgets[name] ?? spec[1]?.default ?? (Array.isArray(spec[0])?spec[0][0]:spec[0]==='STRING'?'':spec[0]==='BOOLEAN'?false:0));
                if(spec[1]?.control_after_generate || ['KSampler','KSamplerAdvanced'].includes(n.data.classType)&&['seed','noise_seed'].includes(name)) {
                    const original=ui.widgets_values;const oldIndex=values.length;
                    values.push(Array.isArray(original)&&['fixed','increment','decrement','randomize'].includes(original[oldIndex])?original[oldIndex]:'fixed');
                }
            }
            ui.widgets_values=object(ui.widgets_values)?{...ui.widgets_values,...n.data.widgets}:values;
        } else if(!n.data.comfyUI) ui.widgets_values=clone(n.data.widgets);
        else if(object(ui.widgets_values))ui.widgets_values={...ui.widgets_values,...n.data.widgets};
        ui.inputs=ui.inputs||[];ui.outputs=ui.outputs||[];
        if(!sameEdges) {
            const targets=new Set(graph.edges.filter(e=>e.target===n.id).map(e=>e.targetHandle));
            for(const name of [...Object.keys(n.data.widgets),...targets])if(!ui.inputs.some(p=>p.name===name)){
                const spec=info&&specs(info).find(([key])=>key===name)?.[1];
                ui.inputs.push({name,type:spec?.[0]||'*',...(name in n.data.widgets?{widget:{name}}:{})});
            }
            const maxSlot=Math.max(-1,...graph.edges.filter(e=>e.source===n.id).map(e=>Number(e.sourceHandle)));
            const count=Math.max(ui.outputs.length,info?.output?.length||0,maxSlot+1);
            while(ui.outputs.length<count){const slot=ui.outputs.length;ui.outputs.push({name:info?.output_name?.[slot]||info?.output?.[slot]||String(slot),type:info?.output?.[slot]||'*',links:[]});}
        }
        return ui;
    });
    raw.nodes=[...rawNodes,...hidden];
    if(!sameEdges) {
        const byId=new Map(raw.nodes.map(n=>[String(n.id),n]));
        raw.nodes.forEach(n=>{n.inputs.forEach(p=>{p.link=null;});n.outputs.forEach(p=>{p.links=[];});});
        raw.links=graph.edges.map((edge,index)=>{
            const from=byId.get(edge.source),to=byId.get(edge.target),slot=Number(edge.sourceHandle),targetSlot=to.inputs.findIndex(p=>p.name===edge.targetHandle),id=index+1;
            to.inputs[targetSlot].link=id;from.outputs[slot].links.push(id);
            return [id,from.id,slot,to.id,targetSlot,from.outputs[slot].type];
        });
    }
    const tuples=(raw.links||[]).map(linkTuple);
    raw.links=version===1?tuples.map(([id,origin_id,origin_slot,target_id,target_slot,type],index)=>({...((sameEdges&&object(source.links?.[index]))?source.links[index]:{}),id,origin_id,origin_slot,target_id,target_slot,type})):tuples;
    if(!source || JSON.stringify(graph.groups)!==JSON.stringify(graph.comfyExchange.groups))raw.groups=(graph.groups||[]).map(group=>{
        const nodes=group.nodeIds.map(id=>graph.nodes.find(n=>n.id===id));const x=Math.min(...nodes.map(n=>n.position.x))-24,y=Math.min(...nodes.map(n=>n.position.y))-40;
        return {title:group.title,color:group.color,bounding:[x,y,Math.max(...nodes.map(n=>n.position.x+280))-x+24,Math.max(...nodes.map(n=>n.position.y+180))-y+24]};
    });
    raw.extra={...(raw.extra||{}),ds:{...(raw.extra?.ds||{}),scale:graph.viewport?.zoom||1,offset:[graph.viewport?.x||0,graph.viewport?.y||0]}};
    raw.version=version;raw.config=raw.config||{};
    const maxNode=Math.max(0,...raw.nodes.map(n=>Number.isSafeInteger(Number(n.id))?Number(n.id):0));const maxLink=Math.max(0,...tuples.map(t=>Number(t[0])||0));
    if(version===1){raw.state={...(raw.state||{}),lastNodeId:Math.max(maxNode,raw.state?.lastNodeId||0),lastLinkId:maxLink};delete raw.last_node_id;delete raw.last_link_id;}
    else {raw.last_node_id=Math.max(maxNode,Number(raw.last_node_id)||0);raw.last_link_id=maxLink;delete raw.state;}
    return raw;
}

/** Display imported sockets without an inference backend or a guessed widget order. */
export function exchangeNodeInfo(node, graph, catalog = {}) {
    const known = metadata(node, catalog);
    if (known) return known;
    const ui = node.data.comfyUI;
    const inputs = Object.create(null);
    for (const p of ui?.inputs || []) if (!p.widget) inputs[p.name] = [typeof p.type === 'string' ? p.type : '*', { forceInput: true }];
    for (const [name,value] of Object.entries(node.data.widgets)) inputs[name] = [typeof value === 'string' ? 'STRING' : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? Number.isInteger(value) ? 'INT' : 'FLOAT' : 'OPAQUE', {}];
    for (const e of graph.edges.filter(e=>e.target===node.id)) inputs[e.targetHandle] = [inputs[e.targetHandle]?.[0] || '*', {forceInput:true}];
    const output=(ui?.outputs||[]).map(p=>typeof p.type==='string'?p.type:'*');
    const max=Math.max(-1,...graph.edges.filter(e=>e.source===node.id).map(e=>Number(e.sourceHandle)));
    while(output.length<=max)output.push('*');
    return {input:{required:inputs},output,output_name:ui?.outputs?.map(p=>p.name),exchangeOnly:true};
}

async function inflateText(bytes) {
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    let total=0;const chunks=[];
    try { while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>750000)throw new Error('PNG 工作流元数据过大');chunks.push(value);} }
    finally { await reader.cancel().catch(()=>{}); }
    const joined=new Uint8Array(total);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(joined);
}

/** JSON and ComfyUI-generated PNG text metadata; no external fetch or image execution. */
export async function readComfyWorkflowFile(file) {
    if(!file || file.size>8*1024*1024)throw new Error('导入文件不能超过 8 MB');
    if(!/\.png$/i.test(file.name)) {
        let raw;try{raw=JSON.parse(await file.text());}catch{throw new Error('工作流文件不是合法 JSON');}
        boundedFile(raw);return raw;
    }
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
    if(bytes.length<20 || [137,80,78,71,13,10,26,10].some((b,i)=>bytes[i]!==b))throw new Error('不是有效的 PNG 文件');
    const decoder=new TextDecoder(),metadata=Object.create(null);
    for(let offset=8;offset+12<=bytes.length;){
        const length=view.getUint32(offset);if(offset+12+length>bytes.length)throw new Error('PNG 元数据被截断');
        const type=decoder.decode(bytes.subarray(offset+4,offset+8)),data=bytes.subarray(offset+8,offset+8+length);offset+=12+length;
        if(type==='IEND')break;
        if(!['tEXt','zTXt','iTXt'].includes(type))continue;
        const end=data.indexOf(0);if(end<1)continue;const key=decoder.decode(data.subarray(0,end));if(!['workflow','prompt'].includes(key))continue;
        if(length>750000)throw new Error('PNG 工作流元数据过大');
        let text;
        if(type==='tEXt')text=decoder.decode(data.subarray(end+1));
        else if(type==='zTXt'){if(data[end+1]!==0)throw new Error('不支持 PNG 压缩格式');text=await inflateText(data.slice(end+2));}
        else {
            const flag=data[end+1],method=data[end+2];let cursor=end+3;
            for(let i=0;i<2;i++){const next=data.indexOf(0,cursor);if(next<0)throw new Error('PNG 文本格式无效');cursor=next+1;}
            if(![0,1].includes(flag)||method!==0)throw new Error('不支持 PNG 压缩格式');
            text=flag?await inflateText(data.slice(cursor)):decoder.decode(data.subarray(cursor));
        }
        if(text.length>750000)throw new Error('PNG 工作流元数据过大');
        try{metadata[key]=JSON.parse(text);}catch{throw new Error('PNG 中的工作流不是合法 JSON');}
    }
    if(metadata.workflow)return metadata.prompt?{workflow:metadata.workflow,prompt:metadata.prompt}:metadata.workflow;
    if(metadata.prompt)return {prompt:metadata.prompt};
    throw new Error('PNG 未包含 ComfyUI 工作流元数据');
}
