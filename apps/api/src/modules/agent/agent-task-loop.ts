import type { ModelAdapter, ModelRequest, ModelResult, ModelMessage, ModelToolDefinition, ModelStreamDelta, ModelToolCall } from '../generation/model-adapter';
import { assessDelivery, classifyToolOutcome, allowsTaskTool, taskExecutionGuidance } from './agent-policy';
export interface AgentProgressEvent {
    id: string;
    kind: 'model' | 'tool' | 'run';
    name: string;
    status: 'running' | 'succeeded' | 'failed' | 'paused' | 'validation_failed' | 'needs_confirmation' | 'partial';
    round?: number;
    at: string;
}
export interface AgentToolContext {
    round: number;
    request: ModelRequest;
    messages: readonly ModelMessage[];
}
interface Options {
    adapter: ModelAdapter;
    request: ModelRequest;
    tools?: readonly ModelToolDefinition[];
    executeTool?: {
        execute(call: ModelToolCall, context: AgentToolContext): Promise<unknown>;
    };
    maxRounds?: number;
    contract?: any;
    recovery?: boolean;
    onDelta?: (delta: ModelStreamDelta) => void;
    onProgress?: (event: AgentProgressEvent) => void | Promise<void>;
}
function canonicalArguments(raw:string) {
 try {const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(JSON.parse(raw)));} catch{return raw;}
}
export async function runTaskLoop(options: Options) {
    const limit = options.maxRounds ?? Infinity;
    if (options.maxRounds !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
        throw Error('轮数必须是正整数');
    const contract = options.contract ?? { action: 'answer', deliverables: [] };
    const definitions = [...(options.tools ?? options.request.parameters?.tools ?? [])].filter(t => t.function.name !== 'harness_probe' && allowsTaskTool(contract, t.function.name));
    const byName = new Map(definitions.map(t => [t.function.name, t]));
    const messages: ModelMessage[] = [...(options.request.messages ?? [{ role: 'user', content: options.request.prompt || '' }])];
    const ledger: any[] = [], roundTexts: any[] = [];
    let toolCallCount = 0;
    const answerParts: string[] = [];
    const progress = async (e: Omit<AgentProgressEvent, 'at'>) => { await options.onProgress?.({ ...e, at: new Date().toISOString() }); };
    const finish = (result: ModelResult, round: number, exhausted = false) => {
        const delivery = assessDelivery({ contract, ledger, content: result.content, finishReason: result.finishReason, budgetExhausted: exhausted });
        if (options.request.signal?.aborted) {
            delivery.status = 'paused';
            delivery.reason = '任务已暂停，已有成果已保留';
        }
        return { ...result, content: [...answerParts, result.content].join(''), rounds: round, messages, toolCallCount, ledger, roundTexts, delivery };
    };
    for (let round = 1; round <= limit; round++) {
        if (options.request.signal?.aborted)
            return finish({ kind: 'text', content: '任务已暂停' }, round, true);
        const finalRound = round === limit;
        const state = assessDelivery({ contract, ledger, content: '' });

        const available = definitions;
        const next: ModelRequest = { ...options.request, messages: [...messages, ...(options.recovery && contract.action !== 'answer' ? [{ role: 'system' as const, content: `执行进度：已有产物 ${JSON.stringify(state.artifacts.map(a => ({ path: a.path, validation: a.validation })))}；缺项 ${JSON.stringify(state.missing)}。${taskExecutionGuidance(contract)}${Number.isFinite(limit) ? `还剩${limit - round + 1}次调用。` : '完成并检查全部交付物后结束。'}` }] : [])], parameters: { ...options.request.parameters, tools: finalRound ? [] : available, toolChoice: finalRound ? 'none' : 'auto' } };
        const me = { id: `model-${round}`, kind: 'model' as const, name: 'model.invoke', round };
        await progress({ ...me, status: 'running' });
        let result: ModelResult;
        try {
            result = options.onDelta && options.adapter.executeStream ? await options.adapter.executeStream(next, options.onDelta) : await options.adapter.execute(next);
            await progress({ ...me, status: 'succeeded' });
        }
        catch (error) {
            await progress({ ...me, status: options.request.signal?.aborted ? 'paused' : 'failed' });
            return finish({ kind: 'text', content: '模型调用未完成：' + (error as Error).message }, round, true);
        }
        roundTexts.push({ round, content: result.content, hasTools: !!result.toolCalls?.length });
        // Never execute a truncated tool batch. Keep earlier complete artifacts.
        if (result.finishReason === 'length') {
            if (options.recovery && !finalRound) {
                if (!result.toolCalls?.length && !contract.deliverables?.length && result.content.trim()) {
                    answerParts.push(result.content);
                    messages.push({ role: 'assistant', content: result.content }, { role: 'system', content: '上一段回答达到供应商单次输出长度，请从断点继续，不要重复已输出内容。完成回答后正常结束。' });
                } else {
                    messages.push({ role: 'system', content: '上一轮输出被截断，该批工具完全未执行。不要续接残缺JSON；重新提交更小的完整工具参数。' + taskExecutionGuidance(contract) });
                }
                continue;
            }
            return finish(result, round);
        }
        if (!result.toolCalls?.length) {
            if (options.recovery && !finalRound && contract.deliverables?.length && state.status !== 'succeeded' && !ledger.some(e => e.output?.status === 'confirmation_required') && (state.missing.length > 0 || !state.artifacts.some(a => a.validation === 'visual_failed' || a.validation === 'pending_visual'))) {
                messages.push({ role: 'assistant', content: result.content }, { role: 'system', content: `尚未完成：${JSON.stringify(state)}。请执行工具补齐缺项，不能以说明代替交付。` });
                continue;
            }
            return finish(result, round);
        }
        if (finalRound)
            return finish({ kind: 'text', content: '已保留已有成果；最后一轮仍请求工具，未再执行。' }, round, true);
        messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });
        for (const call of result.toolCalls) {
            if (options.request.signal?.aborted)
                return finish(result, round, true);
            const te = { id: `tool-${round}-${call.id}`, kind: 'tool' as const, name: call.function.name, round };
            await progress({ ...te, status: 'running' });
            let output: any;
            try {
                if (!byName.has(call.function.name))
                    throw Error('当前任务不允许此工具。' + taskExecutionGuidance(contract));
                if (options.recovery && ['generate_image', 'generate_document', 'start_workflow_run'].includes(call.function.name) && ledger.some(e => e.name === call.function.name && e.arguments === canonicalArguments(call.function.arguments) && classifyToolOutcome(e.output) === 'succeeded'))
                    throw Error('此动作已经成功执行，请使用已有产物或执行记录，不得重复提交');
                try {
                    JSON.parse(call.function.arguments);
                }
                catch {
                    throw Error('工具参数不是完整合法JSON，请修正参数后重试');
                }
                if (!options.executeTool)
                    throw Error('没有工具执行器');
                output = await options.executeTool.execute(call, { round, request: options.request, messages: [...messages] });
            }
            catch (error) {
                output = { error: (error as Error).message, status: 'failed' };
            }
            ledger.push({ name: call.function.name, arguments: canonicalArguments(call.function.arguments), output });
            await progress({ ...te, status: classifyToolOutcome(output) as AgentProgressEvent['status'] });
            messages.push({ role: 'tool', name: call.function.name, toolCallId: call.id, content: JSON.stringify(output) });
            toolCallCount++;
        }
        if (options.recovery) {
            const checked = assessDelivery({ contract, ledger, content: '' });
            if (checked.status === 'succeeded' && contract.deliverables?.length)
                return finish({ kind: 'text', content: '已完成并核验：\n' + checked.artifacts.map(a => `[${a.path}](${a.openUrl})`).join('\n') }, round);
        }
    }
    return finish({ kind: 'text', content: '预算已用完，已有成果已保留。' }, limit, true);
}
