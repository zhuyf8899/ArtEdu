import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sectionFromPath, adminSectionFromPath, safeDestination, studioUrl, canViewAdminSection } from '../src/navigationModel.js';
import { responseError, SESSION_EXPIRED } from '../src/services/httpFeedback.js';

test('未知页面不会被当成首页或管理总览；站外目标被拒绝',()=>{
  assert.equal(sectionFromPath('/invalid'),null); assert.equal(adminSectionFromPath('/administrator'),null);
  assert.equal(sectionFromPath('/studio/'),'studio'); assert.equal(adminSectionFromPath('/admin/reports/'),'reports');
  assert.equal(safeDestination('/learning?course=a&lesson=b','http://localhost:4173'),'/learning?course=a&lesson=b');
  assert.throws(()=>safeDestination('//example.com/admin','http://localhost:4173'));
});
test('工作流目录、创建器、编辑和执行记录使用可恢复地址',()=>{
  assert.equal(studioUrl(),'/studio'); assert.equal(studioUrl({builder:true}),'/studio?builder=1');
  assert.equal(studioUrl({builder:true,edit:'draft 1'}),'/studio?builder=1&edit=draft+1');
  assert.equal(studioUrl({workflow:'w',run:'r'}),'/studio?workflow=w&run=r');
  assert.equal(canViewAdminSection({roles:['operator']},'reports'),true);
  assert.equal(canViewAdminSection({roles:['operator']},'users'),false);
});
test('业务 401 通知重新登录，密码错误及初始化查询不误报会话失效',()=>{
  const saved=globalThis.window;const events=[];globalThis.window={dispatchEvent:event=>events.push(event.type)};
  try {assert.equal(responseError(401,{},'/api/workflows').status,401);assert.deepEqual(events,[SESSION_EXPIRED]);
    assert.equal(responseError(401,{message:'用户名或密码错误'},'/auth/login').message,'用户名或密码错误');
    responseError(401,{},'/auth/me');assert.equal(events.length,1);
    assert.match(responseError(403,{message:'跨站写请求被拒绝'},'/api/a').message,/访问地址未获服务器授权/);
  }finally{globalThis.window=saved;}
});
const source = (await readFile(new URL('../src/services/adminApi.js',import.meta.url),'utf8'))
 .replace('(import.meta.env.VITE_API_BASE_URL || "/api")','"/api"')
 .replace('"./httpFeedback.js"',JSON.stringify(new URL('../src/services/httpFeedback.js',import.meta.url).href))
 .replace('"./uploadFile.js"',JSON.stringify(new URL('../src/services/uploadFile.js',import.meta.url).href));
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('鉴权、限流和模糊的成功响应不得再次触发生成请求',async()=>{
  const saved=globalThis.fetch;
  try{for(const status of [401,403,429,500,200]){let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({message:'失败'}),{status,headers:{'content-type':'application/json'}})};
    await assert.rejects(api.executeAgentRunStream('r'));assert.equal(calls,1,'status '+status+' must not resubmit');}
  }finally{globalThis.fetch=saved;}
});
test('明确的流式接口未实现可以回退一次；登录保留后端密码错误',async()=>{
  const saved=globalThis.fetch;
  try{let calls=0;globalThis.fetch=async()=>++calls===1?new Response('{}',{status:405}):Response.json({id:'r',status:'succeeded'});
    assert.equal((await api.executeAgentRunStream('r')).id,'r');assert.equal(calls,2);
    globalThis.fetch=async()=>Response.json({message:'用户名或密码错误'},{status:401});
    await assert.rejects(api.loginLocal('a','b'),/用户名或密码错误/);
  }finally{globalThis.fetch=saved;}
});
