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
        if (typeof node.id !== 'string' || !node.id || ids.has(node.id)) throw new Error('节点 ID 无效或重复');
        ids.add(node.id);
        if (node.type !== 'comfy' || typeof node.data?.classType !== 'string' || !node.data.classType || !node.data.widgets || typeof node.data.widgets !== 'object' || Array.isArray(node.data.widgets) || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) throw new Error('ComfyUI 节点数据无效');
    }
    for (const edge of definition.edges) {
        if (!edge.id || edgeIds.has(edge.id)) throw new Error('连线 ID 无效或重复');
        edgeIds.add(edge.id);
        if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('连线引用不存在的节点');
        if (!/^\d+$/.test(edge.sourceHandle ?? '') || !edge.targetHandle) throw new Error('连线端口无效');
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
export function importComfy(raw, catalog) {
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
