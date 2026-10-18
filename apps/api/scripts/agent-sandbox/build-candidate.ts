import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
export async function buildCandidate(root=process.cwd()){
 const original=path.join(root,'apps/api/src/modules/agent/agent-harness.service.ts');
 const base=path.join(root,'apps/api/scripts/agent-sandbox');
 const directory=path.join(root,'local-artifacts/agent-sandbox-20261018/backend');fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'tsconfig.json'),JSON.stringify({extends:path.join(root,'apps/api/tsconfig.json').replace(/\\/g,'/'),compilerOptions:{rootDir:'.'}},null,2));
 let source=fs.readFileSync(original,'utf8');
 const req=createRequire(original);
 source=source.replace(/from "([^"]+)"/g,(_whole,spec)=>`from ${JSON.stringify((spec.startsWith('.')?(spec==='./agent-runtime'?path.join(base,'runtime'):spec==='./agent-tools'?path.join(base,'tools'):path.resolve(path.dirname(original),spec)):req.resolve(spec)).replace(/\\/g,'/'))}`);
 source=`// Generated isolated candidate; original production source is untouched.\nimport {composeSandboxPrompt,planTask} from ${JSON.stringify(path.join(base,'policy.mjs').replace(/\\/g,'/'))};\n`+source;
 const replacements:[RegExp,string][]=[
   [/const systemPrompt = input\.systemPrompt \?\? [^\n]+;/,'const systemPrompt = composeSandboxPrompt({basePolicy:toolUsePolicy,contract:runParameters?.sandboxContract ?? planTask({prompt,previousTask:runParameters?.previousTask}),searchEnabled:input.searchEnabled,attachmentMissing:!!referenceId && !uploadedFile});'],
   [/maxRounds: 8,/,'maxRounds: runParameters?.sandboxRecovery ? Number(runParameters?.sandboxRounds ?? 8) : 5, recovery: !!runParameters?.sandboxRecovery, contract: runParameters?.sandboxContract ?? planTask({prompt,previousTask:runParameters?.previousTask}),'],
   [/const completed = await this\.agents\.completeRun\(runId\);/,'const completed = await (this.agents as any).finishSandboxRun(runId, result.delivery);'],
   [/await runProgress\(completed\.status === "succeeded" \? "succeeded" : "failed"\);/,'await runProgress(completed.status);'],
   [/await this\.agents\.appendAgentMessage\(runId, result\.content\);/,'await this.agents.appendAgentMessage(runId, result.delivery?.status === "succeeded" ? result.content : result.delivery?.reason ?? result.content);'],
 ];
 for(const [pattern,value] of replacements){if(!pattern.test(source))throw Error('Source changed: sandbox patch anchor missing '+pattern);source=source.replace(pattern,value);}
 const target=path.join(directory,'candidate-harness.service.ts');fs.writeFileSync(target,source);
 const module=await import(pathToFileURL(target).href);return module.AgentHarnessService;
}
