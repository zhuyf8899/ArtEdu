// Advisory routing only; server independently checks tools and delivery.
export function planTask({ prompt, previousTask = null }) {
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
    const create = /(生成|制作|创建|导出|搭建|做个|做一个|设计(?:一套|一个|一款)|生图|出图|画|绘制)|\b(build|create|make|generate|export)\b/i.test(affirmative);
    const deliverables = [];
    const imageApi = /生图|出图|(?:调用|使用|用).*(?:图片生成|图像生成|生图|generate_image)/i.test(affirmative);
    const visualMockup = /(?:网页|页面|网站|首页|前端界面|UI界面|UI).*(?:设计图|效果图|截图)|(?:设计图|效果图|截图).*(?:网页|页面|网站|首页|前端界面|UI界面|UI)/i.test(affirmative);
    const webRequest = clauses.some(s => !/^(?:请)?(?:不要|不用|别|无需)/.test(s) && /(?:制作|创建|搭建|做个|做一个|生成|设计).*(?:网页|页面|网站|前端界面|UI界面|博客|html|website)/i.test(s) && !/(?:设计图|效果图|截图)/i.test(s));
    if (create && (!visualMockup || webRequest) && /网页|页面|网站|前端界面|UI界面|博客|html|gallery|website|webpage|交互.*画廊/i.test(affirmative))
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
        if (/(?:修改|修复).*(?:网页|页面|html)/i.test(text))
            return { action: 'modify', deliverables: [{ kind: 'webpage', format: 'html' }] };
        if (previousTask?.artifacts?.length)
            return { action: 'modify', deliverables: previousTask.artifacts.map(a => ({ kind: a.kind || 'webpage', format: a.format || (a.kind==='webpage'?'html':a.kind==='graphic'?'svg':a.kind==='image'?'image':'docx'), ...(a.kind==='webpage'||a.kind==='graphic'?{path:a.path}:{}) })), reason: '延续已确认的任务产物' };
        if (previousTask?.plannedDeliverables?.length)
            return { action: 'create', deliverables: previousTask.plannedDeliverables, reason: '沿用已确认交付计划' };
        return { action: 'clarify', deliverables: [], reason: '缺少可定位的先前产物或交付计划' };
    }
    return { action: 'answer', deliverables: [], reason: '默认文本回答，不因格式关键词创建文件' };
}
