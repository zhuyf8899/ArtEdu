// ComfyUI API prompts and UI workflows are distinct formats. Never guess widget order.
export function specs(info) {
    return Object.entries({ ...(info?.input?.required || {}), ...(info?.input?.optional || {}) });
}
export function isWidget(spec) { return Array.isArray(spec?.[0]) || ['INT', 'FLOAT', 'STRING', 'BOOLEAN'].includes(spec?.[0]) && !spec?.[1]?.forceInput; }
export function ports(info) {
    return { inputs: specs(info).filter(([, s]) => !isWidget(s)).map(([name, s]) => ({ name, type: s[0] })),
        outputs: (info?.output || []).map((type, i) => ({ name: String(i), type, label: info.output_name?.[i] || type })) };
}
export function compatible(from, to) { return from === '*' || to === '*' || from === to; }
export function nodeFromInfo(id, classType, info, position) {
    const widgets = Object.fromEntries(specs(info).filter(([, s]) => isWidget(s)).map(([name, s]) => [name, s[1]?.default ?? (Array.isArray(s[0]) ? s[0][0] : s[0] === 'BOOLEAN' ? false : s[0] === 'STRING' ? '' : 0)]));
    return { id: String(id), type: 'comfy', position, data: { label: info.display_name || classType, classType, widgets } };
}
export function compilePrompt(definition, catalog) {
    const prompt = {};
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
            if (inputs[e.targetHandle] instanceof Array && inputs[e.targetHandle].length === 2 && typeof inputs[e.targetHandle][1] === 'number')
                throw new Error('一个输入端口只能有一条连线');
            inputs[e.targetHandle] = [e.source, Number(e.sourceHandle)];
        }
        for (const name of Object.keys(info.input?.required || {}))
            if (!(name in inputs))
                throw new Error(`${n.data.label} 缺少输入 ${name}`);
        prompt[n.id] = { class_type: n.data.classType, inputs, _meta: { title: n.data.label } };
    }
    if (!definition.nodes.some(n => catalog[n.data.classType]?.output_node))
        throw new Error('需要 SaveImage 等输出节点');
    return prompt;
}
export function importComfy(raw, catalog) {
    const input = raw.prompt || raw;
    if (Array.isArray(input.nodes)) {
        const nodes = input.nodes.filter(n => n.type !== 'Reroute').map(n => {
            const info = catalog[n.type];
            if (!info)
                throw new Error(`缺少节点 ${n.type}，无法安全解析 widgets_values`);
            if (n.mode && n.mode !== 0)
                throw new Error('请先在 ComfyUI 中取消静音/旁路，再导出 API 格式');
            const node = nodeFromInfo(n.id, n.type, info, { x: n.pos?.[0] || 0, y: n.pos?.[1] || 0 });
            const widgetInputs = (n.inputs || []).filter(i => i.widget).map(i => i.widget.name || i.name);
            const names = widgetInputs.length ? widgetInputs : specs(info).filter(([, s]) => isWidget(s)).map(([name]) => name);
            const values = n.widgets_values || [];
            const mappedValues = [...values];
            if (['KSampler', 'KSamplerAdvanced'].includes(n.type) && mappedValues.length === names.length + 1) {
                const seedIndex = names.findIndex(name => ['seed', 'noise_seed'].includes(name));
                if (seedIndex >= 0 && ['fixed', 'increment', 'decrement', 'randomize'].includes(mappedValues[seedIndex + 1]))
                    mappedValues.splice(seedIndex + 1, 1);
            }
            if (!Array.isArray(values) || mappedValues.length !== names.length)
                throw new Error(`${n.type} 的控件顺序无法可靠映射，请用 ComfyUI 导出 API 格式`);
            names.forEach((name, i) => { node.data.widgets[name] = mappedValues[i]; });
            return node;
        });
        if (nodes.length !== input.nodes.length)
            throw new Error('暂不支持 UI 格式 Reroute；请导出 API 格式');
        const byId = new Map(input.nodes.map(n => [String(n.id), n]));
        const edges = (input.links || []).map((link, index) => {
            const [id, source, slot, target, targetSlot] = Array.isArray(link) ? link : [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot];
            const targetHandle = byId.get(String(target))?.inputs?.[targetSlot]?.name;
            if (!targetHandle)
                throw new Error('无法识别 UI 连线输入');
            return { id: String(id ?? index), source: String(source), target: String(target), sourceHandle: String(slot), targetHandle };
        });
        return { schemaVersion: 2, engine: 'comfyui', nodes, edges, groups: [], viewport: { x: 0, y: 0, zoom: 1 } };
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
            if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'number' && input[String(value[0])])
                edges.push({ id: `${id}-${name}`, source: String(value[0]), target: id, sourceHandle: String(value[1]), targetHandle: name });
            else
                node.data.widgets[name] = value;
        });
        nodes.push(node);
    });
    return { schemaVersion: 2, engine: 'comfyui', nodes, edges, groups: [], viewport: { x: 0, y: 0, zoom: 1 } };
}
