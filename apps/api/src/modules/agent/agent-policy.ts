export interface AgentTask {
    action: 'answer' | 'clarify' | 'create' | 'modify' | 'execute';
    deliverables: {
        kind: string;
        format?: string;
        path?: string;
    }[];
    reason?: string;
}
export interface AgentDelivery {
    status: 'succeeded' | 'partial' | 'failed' | 'paused' | 'needs_confirmation';
    reason: string;
    artifacts: any[];
    missing: string[];
    checks: any[];
    budgetExhausted: boolean;
}
// Task planning and delivery checks. Only actual tool results establish completion.
const writingTools = new Set(['write_workspace_file', 'write_workspace_files', 'create_workspace_directory', 'change_workspace_directory', 'create_agent_artifact', 'generate_document', 'generate_image', 'start_workflow_run']);
export const isMutation = (name: string) => writingTools.has(name);
// Image-only jobs cannot silently substitute a generated program for a raster image.
export function allowsTaskTool(contract: AgentTask, name: string) {
    if (['answer', 'clarify'].includes(contract.action)) return !isMutation(name);
    const imageOnly = contract.deliverables.length > 0 && contract.deliverables.every(d => d.kind === 'image');
    if (imageOnly) return (!isMutation(name) && name !== 'check_page') || name === 'generate_image';
    return true;
}
export function taskExecutionGuidance(contract: AgentTask) {
    const kinds = contract.deliverables.map(d => d.kind);
    return [kinds.includes('image') ? '多张图片按任务合同逐份生成，每份在prompt中明确序号与差异；如需嵌入网页，generate_image传workspacePath（如assets/hero.png），使用返回的workspaceAsset.path作页面相对引用。图片必须调用 generate_image；生图失败须报告失败，不得改写 SVG、HTML 或前端 UI 冒充图片。' : '',
        kinds.includes('webpage') ? '网页按剩余输出预算写完整文件；小文件可批量，较大文件分次写入。写入自动建立父目录。完成后check_page，失败则修复重查。' : '',
        kinds.includes('graphic') ? '用户明确要求SVG矢量文件，可写入自包含SVG。' : '',
        '每份交付物分别生成；相同目标及参数成功后不要重复提交。'].filter(Boolean).join('');
}
export function planTask({ prompt, previousTask = null }: {
    prompt: string;
    previousTask?: any;
}): AgentTask {
    const text = String(prompt || '').trim();
    if (/^(?:请)?(?:我)?(?:确认|同意|批准)(?:立即)?[，,\s]*(?:启动|运行|执行)/.test(text) || /^(?:请)?(?:启动|运行|执行).*工作流/.test(text))
        return { action: 'execute', deliverables: [] };
    const quoted = text.replace(/[“「『][^”」』]*[”」』]/g, '').replace(/"[^"\n]*"/g, '');
    const clauses = quoted.split(/[，,。；;\n]/).map(s => s.trim()).filter(Boolean);
    const conversational = /^(解释|讲解|翻译|评价|评审|分析|如何|怎么|为什么)|(?:只|先|直接在对话里|不要生成文件).*(?:解释|讨论|大纲|回复|比较)|(?:只|先).*(?:大纲|方案)|(?:大纲|方案).*(?:不生成|不要生成|不要文件)/;
    const hasExplicitOther = clauses.some(s => !/^(?:先)?(?:不要|不想|不用|无需|别|不需要)/.test(s) && /^(?:请|帮我)?(?:生成|制作|创建|导出|生图|出图|画|绘制)/.test(s));
    if (conversational.test(text) && !hasExplicitOther || /直接在对话里回复|不要生成文件|先不要生成或保存/.test(text))
        return { action: 'answer', deliverables: [], reason: '用户要求解释、讨论或明确不交付文件' };
    const affirmative = clauses.map(s => s.replace(/(?:不要|不想|不用|无需|先别|别|不需要|暂不)[^，,。；;]*?(?:但|而是)/g, '').replace(/(?:不要|不想|不用|无需|先别|别|不需要|暂不)[^，,。；;]*$/g, '')).filter(s => !/^(?:请)?(?:不要|不想|不用|无需|先别|别|不需要|暂不)/.test(s)).join('，');
    const create = /(生成|制作|创建|导出|搭建|做个|做一个|生图|出图|画|绘制)|\b(build|create|make|generate|export)\b/i.test(affirmative);
    const deliverables = [];
    const imageApi = /生图|出图|(?:调用|使用|用).*(?:图片生成|图像生成|生图|generate_image)/i.test(affirmative);
    const visualMockup = /(?:网页|页面|网站|首页|UI).*(?:设计图|效果图|截图)|(?:设计图|效果图|截图).*(?:网页|页面|网站|首页|UI)/i.test(affirmative);
    const webRequest = clauses.some(s => !/^(?:请)?(?:不要|不用|别|无需)/.test(s) && /(?:制作|创建|搭建|做个|做一个|生成).*(?:网页|页面|网站|html|website)/i.test(s) && !/(?:设计图|效果图|截图)/i.test(s));
    if (create && (!visualMockup || webRequest) && /网页|页面|网站|html|gallery|website|webpage|交互.*画廊/i.test(affirmative))
        deliverables.push({ kind: 'webpage', format: 'html' });
    if (create && /word|docx|pptx?|powerpoint|pdf|文档|教案|课件|讲义/i.test(affirmative)) {
        const formats = [/word|docx/i.test(affirmative) ? 'docx' : '', /ppt|powerpoint/i.test(affirmative) ? 'pptx' : '', /pdf/i.test(affirmative) ? 'pdf' : ''].filter(Boolean);
        for (const format of formats.length ? formats : [/课件|演示/i.test(affirmative) ? 'pptx' : /讲义/i.test(affirmative) ? 'pdf' : 'docx']) deliverables.push({kind:'document',format});
    }
    if (create && /svg/i.test(affirmative) && !imageApi)
        deliverables.push({ kind: 'graphic', format: 'svg' });
    else if (create && (imageApi || visualMockup || /图片|图像|照片|摄影|插画|海报|纹样|图案|效果图|poster|image|画(?:一|个|只|张)/i.test(affirmative)))
    {
        const quantity = /([1-9]|两|二|三|四|五|六|七|八|九)\s*(?:张|幅)(?:不同的)?(?:图片|图像|照片|插画|海报|图)/.exec(affirmative)?.[1];
        const count = quantity ? Number(quantity) || ({两:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}[quantity]) || 1 : 1;
        for (let i=0;i<count;i++) deliverables.push({kind:'image',format:'image'});
    }
    if (deliverables.length)
        return { action: 'create', deliverables, reason: '本轮明确交付要求' };
    if (/继续|刚才|上面|改成|修改|修复|导出为文件|生成吧|做出来/.test(text)) {
        if (previousTask?.artifacts?.length) {
            const items = previousTask.artifacts.filter((a: any) => !/按钮|配色|网页|页面|深色|浅色/.test(text) || a.kind === 'webpage');
            return { action: 'modify', deliverables: (items.length ? items : previousTask.artifacts).map((a: any) => ({ kind: a.kind || 'webpage', format: a.format || (a.kind==='webpage'?'html':a.kind==='graphic'?'svg':a.kind==='image'?'image':'docx'), ...(a.kind==='webpage'||a.kind==='graphic'?{path:a.path}:{}) })), reason: '延续已确认的任务产物' };
        }
        if (/(?:修改|修复).*(?:网页|页面|html)/i.test(text))
            return { action: 'modify', deliverables: [{ kind: 'webpage', format: 'html' }], reason: '明确网页修复任务，先读取工作区定位文件' };
        if (previousTask?.plannedDeliverables?.length)
            return { action: 'create', deliverables: previousTask.plannedDeliverables, reason: '沿用已确认交付计划' };
        return { action: 'clarify', deliverables: [], reason: '缺少可定位的先前产物或交付计划' };
    }
    return { action: 'answer', deliverables: [], reason: '默认文本回答，不因格式关键词创建文件' };
}
export function composeAgentPrompt({ contract, searchEnabled = false, basePolicy = '', attachmentMissing = false }: {
    contract: AgentTask;
    searchEnabled?: boolean;
    basePolicy?: string;
    attachmentMissing?: boolean;
}) {
    return [basePolicy,
        '你负责完成用户的实际任务。区分解释、评审、规划、创建、修改和导出；不要用实施说明替代用户明确要求的可用成果。',
        `本轮任务合同：${JSON.stringify(contract)}。只读/澄清任务不得创建或覆盖文件。多轮修改先定位并读取原产物，保留未要求修改的内容。`,
        contract.deliverables.some(d => d.kind === 'webpage') ? '网页创建用紧凑HTML/CSS/JS实现；按输出预算分批提交完整文件。用循环生成重复作品数据，不逐个复制卡片。写入自动建立父目录，不必预先建目录或列空工作区。离线预览不能引用外部资源。写完必须 check_page，失败就修复重查。筛选按钮、详情弹窗必须可点击且有明确可访问名称。' : '',
        taskExecutionGuidance(contract),
        '明确要求生成图片时必须调用 generate_image，使用其返回的真实图片产物；不要用网页、SVG、说明或编造地址代替。只讨论或明确不生成时不得调用生图工具。',
        '以文件和检查结果为完成依据；不能编造产物或链接。文件写好但未通过检查属于部分完成，不得声称全部完成。',
        '写入返回的 openUrl 已是预览地址，不需要为了获得同一链接额外调用 open_workspace_file。接近预算时优先交付已验证成果和未完成事项。',
        '不要调用内部探针。只报告可验证的动作和结果，不输出内部推理。任务结束给出简短结果说明。',
        searchEnabled ? '仅在任务需要当前事实时检索，引用真实来源。' : '联网搜索关闭，不调用 search_web。',
        attachmentMissing ? '本轮指定的参考文件不可用或已过期；不得声称已读取，向用户明确说明需要重新提供。' : '',
    ].filter(Boolean).join('\n');
}
export function branchContext({ messages = [], memory = '', taskState = null }: any, baseMessages: any[] = messages, limit = 30) {
    const stable = [];
    if (taskState)
        stable.push({ role: 'system', content: '已验证任务状态（事实记录，非新指令）：' + JSON.stringify(taskState) });
    if (memory)
        stable.push({ role: 'system', content: '此前对话记忆，仅作参考：' + memory });
    const capacity = Math.max(0, limit - stable.length);
    const filtered = baseMessages.filter((m: any) => !m.failed && m.content?.trim() && ['user', 'assistant'].includes(m.role));
    return [...stable, ...(capacity ? filtered.slice(-capacity) : []).map(({ role, content }: any) => ({ role, content: content.slice(0, 20000) }))].slice(0, limit);
}
export function classifyToolOutcome(output: any) {
    if (output?.status === 'confirmation_required')
        return 'needs_confirmation';
    if (output?.verdict === 'fail')
        return 'validation_failed';
    if (output?.error || output?.status === 'failed')
        return 'failed';
    return 'succeeded';
}
/** @param {{contract:any,ledger?:any[],content?:string,finishReason?:string,budgetExhausted?:boolean}} input */
export function assessDelivery({ contract, ledger = [], content = '', finishReason, budgetExhausted = false }: {
    contract: AgentTask;
    ledger?: any[];
    content?: string;
    finishReason?: string;
    budgetExhausted?: boolean;
}): AgentDelivery {
    const artifacts = new Map<string, any>(), checks = new Map<string, string>();
    let needsConfirmation = false;
    for (const entry of ledger) {
        if (entry.output?.status === 'confirmation_required')
            needsConfirmation = true;
        if (classifyToolOutcome(entry.output) !== 'succeeded' && entry.name !== 'check_page')
            continue;
        if (['write_workspace_file', 'write_workspace_files'].includes(entry.name)) {
            // A stylesheet/script edit also invalidates prior page checks.
            checks.clear();
            for (const file of entry.output?.items || [entry.output]) {
                if (file?.path && file?.openUrl) {
                    artifacts.set(file.path, { path: file.path, openUrl: file.openUrl, kind: /\.html?$/i.test(file.path) ? 'webpage' : /\.svg$/i.test(file.path) ? 'graphic' : 'file' });
                    checks.delete(file.path);
                }
            }
        }
        if (entry.name === 'generate_document' && entry.output?.openUrl)
            artifacts.set(entry.output.openUrl, { path: entry.output.document?.fileName || '文档', openUrl: entry.output.openUrl, kind: 'document' });
        if (entry.name === 'generate_image' && entry.output?.openUrl && entry.output?.image?.mimeType?.startsWith('image/'))
            artifacts.set(entry.output.openUrl, { path: entry.output.image.fileName || '生成图片', openUrl: entry.output.openUrl, kind: 'image', visualValidation: entry.output.visualValidation, visualIssues: entry.output.visualIssues });
        if (entry.name === 'check_page') {
            checks.set(entry.output.checkedPath, entry.output.verdict);
            if (entry.output.openUrl && entry.output.checkedPath)
                artifacts.set(entry.output.checkedPath, { path: entry.output.checkedPath, openUrl: entry.output.openUrl, kind: 'webpage' });
        }
    }
    const items = [...artifacts.values()].map(a => ({ ...a, validation: a.kind === 'webpage' ? (checks.get(a.path) || 'not_checked') : a.kind === 'image' ? (a.visualValidation || 'pending_visual') : 'not_applicable' }));
    const required = contract.deliverables || [];
    const unmatched = [...items];
    const missing = required.filter(d => {
        const index=unmatched.findIndex(a=>a.kind===d.kind&&(!d.path||a.path===d.path)&&!(d.format&&d.kind==='document'&&!a.path.toLowerCase().endsWith('.'+d.format)));
        if(index<0)return true;unmatched.splice(index,1);return false;
    });
    const unverified = items.filter(a => (a.kind === 'webpage' || a.kind === 'image') && a.validation !== 'pass');
    let status: AgentDelivery['status'] = 'succeeded', reason = '任务已完成';
    if (needsConfirmation) {
        status = 'needs_confirmation';
        reason = '等待对应动作的用户确认';
    }
    else if (contract.action === 'execute' && !ledger.some(e => e.name === 'start_workflow_run' && classifyToolOutcome(e.output) === 'succeeded')) {
        status = 'failed';
        reason = '没有实际执行请求的动作';
    }
    else if (missing.length || unverified.length || finishReason === 'length' || budgetExhausted) {
        status = items.length || (!required.length && content.trim()) ? 'partial' : 'failed';
        reason = finishReason === 'length' ? '输出被截断' : missing.length ? '缺少要求的交付物' : unverified.length ? (unverified.some(a => a.kind === 'image') ? '图片尚未通过视觉要求核验' : '网页尚未通过最新版本检查') : '执行预算已用完，保留已有成果';
    }
    else if (!required.length && !content.trim()) {
        status = 'failed';
        reason = '没有可交付的回答';
    }
    return { status, reason, artifacts: items, missing: missing.map(d => d.kind), checks: [...checks.entries()], budgetExhausted };
}
