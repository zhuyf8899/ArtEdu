import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
export const registrySchema = z.object({ nodes: z.record(z.string().min(1).max(160), z.object({ input: z.object({ required: z.record(z.string(), z.union([z.tuple([z.any()]), z.tuple([z.any(), z.record(z.string(), z.any())])])).optional(), optional: z.record(z.string(), z.union([z.tuple([z.any()]), z.tuple([z.any(), z.record(z.string(), z.any())])])).optional() }).passthrough(), output: z.array(z.string().max(100)).max(32), output_name: z.array(z.string().max(100)).optional(), output_node: z.boolean().optional(), display_name: z.string().max(200).optional(), category: z.string().max(200).optional() }).passthrough()).refine(n => Object.keys(n).length > 0 && Object.keys(n).length <= 400, '允许 1 至 400 个已审核节点') });
export const progressSchema = z.object({ type: z.enum(['executing', 'progress', 'execution_cached', 'execution_error', 'executed', 'status']), node: z.string().max(100).nullable().optional(), value: z.number().finite().min(0).optional(), max: z.number().finite().positive().optional(), cached: z.array(z.string().max(100)).max(80).optional() });
export const finishSchema = z.object({ status: z.enum(['completed', 'failed', 'cancelled']), error: z.string().max(1500).optional() });
export function compileGraph(definition: {
    nodes: Array<Record<string, any>>;
    edges: Array<Record<string, any>>;
}, catalog: Record<string, any>) {
    const prompt: Record<string, any> = {};
    for (const node of definition.nodes) {
        if (typeof node.data?.classType !== 'string' || !node.data.widgets || typeof node.data.widgets !== 'object')
            throw new BadRequestException('ComfyUI 节点参数无效');
        prompt[node.id] = { class_type: node.data.classType, inputs: { ...node.data.widgets }, _meta: { title: node.data.label } };
    }
    const connected = new Set<string>();
    for (const edge of definition.edges) {
        const target = prompt[edge.target], source = prompt[edge.source], slot = Number(edge.sourceHandle);
        if (!target || !source || !edge.targetHandle || !/^\d+$/.test(edge.sourceHandle ?? ''))
            throw new BadRequestException('ComfyUI 连线端口无效');
        const key = JSON.stringify([edge.target, edge.targetHandle]);
        if (connected.has(key))
            throw new BadRequestException('一个输入端口只能有一条连线');
        connected.add(key);
        target.inputs[edge.targetHandle] = [edge.source, slot];
    }
    validatePrompt(prompt, catalog);
    return prompt;
}
export function validatePrompt(prompt: Record<string, any>, catalog: Record<string, any>) {
    const ids = Object.keys(prompt);
    if (!ids.length || ids.length > 80)
        throw new BadRequestException('ComfyUI 工作流需包含 1 至 80 个节点');
    const visited = new Set<string>(), active = new Set<string>();
    let outputs = 0;
    const visit = (id: string) => {
        if (active.has(id))
            throw new BadRequestException('ComfyUI 工作流不能包含循环');
        if (visited.has(id))
            return;
        const n = prompt[id], info = catalog[n?.class_type];
        if (!info || !n.inputs || typeof n.inputs !== 'object')
            throw new BadRequestException(`Worker 缺少或未授权节点：${n?.class_type ?? id}`);
        active.add(id);
        if (info.output_node)
            outputs++;
        const inputs = { ...info.input.required, ...info.input.optional };
        for (const name of Object.keys(info.input.required ?? {}))
            if (!(name in n.inputs))
                throw new BadRequestException(`${n.class_type} 缺少 ${name}`);
        for (const [name, value] of Object.entries(n.inputs)) {
            const spec = inputs[name];
            if (!spec)
                throw new BadRequestException(`未知输入 ${name}`);
            const [type, options = {}] = spec;
            if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]) && prompt[value[0]]) {
                const parent = prompt[value[0]], source = catalog[parent.class_type]?.output?.[value[1]];
                if (!source || Array.isArray(type) || (type !== source && type !== '*' && source !== '*'))
                    throw new BadRequestException(`端口类型不匹配 ${id}.${name}`);
                visit(value[0]);
            }
            else if (Array.isArray(type)) {
                if (!type.includes(value))
                    throw new BadRequestException(`不支持的选项 ${id}.${name}`);
            }
            else if (type === 'STRING') {
                if (typeof value !== 'string' || value.length > 10000)
                    throw new BadRequestException('文本参数无效');
            }
            else if (type === 'BOOLEAN') {
                if (typeof value !== 'boolean')
                    throw new BadRequestException('布尔参数无效');
            }
            else if (type === 'INT' || type === 'FLOAT') {
                if (typeof value !== 'number' || !Number.isFinite(value) || type === 'INT' && !Number.isSafeInteger(value) || options.min !== undefined && value < options.min || options.max !== undefined && value > options.max)
                    throw new BadRequestException(`数值参数越界 ${id}.${name}`);
            }
            else
                throw new BadRequestException(`输入 ${id}.${name} 必须连接 ${type} 端口`);
        }
        active.delete(id);
        visited.add(id);
    };
    ids.forEach(visit);
    if (!outputs)
        throw new BadRequestException('ComfyUI 工作流缺少输出节点');
}
