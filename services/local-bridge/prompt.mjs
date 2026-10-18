export function localMessages(task) {
 const input=task.input||{}, execution=input.execution||{};
 const system=execution.systemPrompt || '你是ArtEdu中文助教。本地模式仅支持文本回答；不能调用工具或创建产物，不能声称完成未执行动作。';
 const context=(execution.context||[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.content||'')}));
 return [{role:'system',content:system+'\n本地执行能力：仅文本回答，无平台或文件工具。不要声称执行了工具或生成文件。'},...context,{role:'user',content:input.prompt||''}];
}
