// Local-only HTTP + browser acceptance. All fixtures are removed in finally.
import { createRequire } from 'node:module';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),require=createRequire(path.join(root,'apps/api/package.json'));
require('dotenv').config({path:path.join(root,'apps/api/.env'),quiet:true});
const {Pool}=require('pg'),puppeteer=require('puppeteer-core');
const databaseUrl=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname),'local database only');
const pool=new Pool({connectionString:databaseUrl.href}),base='http://localhost:4173',output=path.join(root,'local-artifacts/morph-ui-qa');await mkdir(output,{recursive:true});
const prefix='verify-morph-'+randomBytes(5).toString('hex'),users=[prefix+'-a',prefix+'-b'],course=prefix+'-course',lesson=prefix+'-lesson',password=randomBytes(18).toString('base64url');
const salt=randomBytes(16).toString('base64url'),hash=`scrypt$16384$8$1$${salt}$${scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('base64url')}`;
let browser,checks=0;
const check=name=>{checks++;console.log('PASS '+name);};
async function request(route,{cookie,method='GET',body}={}){const response=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
try{
  for(const user of users){await pool.query('INSERT INTO users(id,username,display_name) VALUES($1,$1,$2)',[user,'界面对接验收']);await pool.query("INSERT INTO user_identities(id,user_id,provider,external_subject,password_hash) VALUES($1,$1,'local',$1,$2)",[user,hash]);await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='student'",[user]);}
  await pool.query("INSERT INTO courses(id,slug,title,summary,status,category,created_by) VALUES($1,$1,'界面对接验收课程','仅用于本地验收，结束后删除','published','验收',$2)",[course,users[0]]);
  await pool.query("INSERT INTO course_lessons(id,course_id,title,status,lesson_type,estimated_minutes) VALUES($1,$2,'验收教学节点','published','lesson',5)",[lesson,course]);
  const login=await request('/auth/login',{method:'POST',body:{username:users[0],password}});assert.equal(login.status,201);assert.ok(login.cookie);let cookie=login.cookie;
  const loginB=await request('/auth/login',{method:'POST',body:{username:users[1],password}});assert.equal(loginB.status,201);check('real account login through Vite proxy');
  assert.equal((await request('/me/morph-state')).status,401);
  let response=await request('/me/morph-state/favorites',{cookie,method:'PUT',body:{version:0,value:[{type:'course',id:course}]}});assert.equal(response.status,200);assert.equal(response.data.version,1);
  assert.deepEqual((await request('/me/morph-state',{cookie:loginB.cookie})).data.states,{});check('persistent state and two-account isolation');
  assert.equal((await request('/me/morph-state/favorites',{cookie,method:'PUT',body:{version:0,value:[]}})).status,409);
  assert.equal((await request('/me/morph-state/favorites',{cookie,method:'PUT',body:{version:1,value:[{type:'admin',id:'x'}]}})).status,400);check('stale writes and invalid state are rejected');
  assert.equal((await request('/me/morph-state/favorites',{cookie,method:'PUT',body:{version:1,value:[]}})).status,200);
  for(const route of ['/portal/home','/courses','/works','/tool-directory-links','/me/learning-space','/me/knowledge-map'])assert.equal((await request(route,{cookie})).status,200);check('authenticated content endpoints reach PostgreSQL');
  browser=await puppeteer.launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/morph/atomic-courses-particles.html');await page.waitForSelector('.morph-gate input[name=username]');await page.type('[name=username]',users[0]);await page.type('[name=password]',password);await page.click('.morph-gate button');await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));
  cookie=(await page.cookies(base+'/api')).map(c=>c.name+'='+c.value).join('; ');
  assert.equal(await page.$('.morph-failed-start'),null);assert.ok(await page.$(`[data-learn="${course}"]`));check('browser login and real course cards');
  await page.click(`[data-learn="${course}"]`);await page.waitForSelector('#course-note');await page.type('#course-note textarea','验收学习笔记');await page.click('#course-note button');await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='笔记已保存到账号');
  page.once('dialog',d=>d.accept());await page.click(`[data-lesson-complete="${lesson}"]`);await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='学习进度已保存');
  const detail=await request('/courses/'+course,{cookie});assert.equal(detail.data.progressPercent,100);assert.ok((await request('/me/learning-space',{cookie})).data.notes.some(n=>n.content==='验收学习笔记'));check('course enrollment, node progress and note write to business tables');
  await page.click('.dialog-close');await page.click(`[data-save="${course}"]`);await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='已收藏到账号');await page.reload();await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));assert.equal(await page.$eval(`[data-save="${course}"]`,n=>n.getAttribute('aria-pressed')),'true');check('course favorite survives reload');
  await page.goto(base+'/morph/profile.html');await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));await page.click('[data-node-id="263:2748"]');await page.$eval('dialog input[name=name]',n=>n.value='');await page.type('dialog input[name=name]','验收昵称');await page.click('dialog form button');await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='个人资料已保存到账号');await page.reload();await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));assert.equal(await page.$eval('[data-node-id="263:2764"]',n=>n.textContent),'验收昵称');check('profile edit survives reload');
  await page.screenshot({path:path.join(output,'profile-desktop.png'),fullPage:true});
  for(const name of ['index.html','case-community.html','skill-tools.html','curriculum.html','chat.html']){await page.goto(base+'/morph/'+name);await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));assert.equal(await page.$('.morph-failed-start'),null, name);}
  check('all seven main pages load with real authenticated APIs');
  await page.goto(base+'/morph/case-community.html');await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));const works=(await request('/works',{cookie})).data.items;assert.equal(await page.$$eval('.case-card',nodes=>nodes.length),works.length);
  if(works.length){const work=works[0];await page.click(`[data-save="${work.id}"]`);await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='已收藏到账号');assert.equal((await request('/works/'+work.id,{cookie})).data.favorited,true);await page.click(`[data-remix="${work.id}"]`);await page.type('dialog textarea[name=brief]','验收 Remix 方向');await page.click('dialog form button');await page.waitForSelector('a[href^="chat.html?remix="]');assert.equal((await request('/me/morph-state',{cookie})).data.states.remixes.value[0].sourceCaseId,work.id);await page.click('.dialog-close');check('real case favorite and linked Remix draft persist');}
  const coverFile=path.join(output,'upload-fixture.png');await writeFile(coverFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
  await page.click('#submit-work');await page.type('dialog [name=title]','验收作品草稿');await page.type('dialog [name=desc]','仅用于验收上传与持久化，测试结束后清理');await (await page.$('dialog input[type=file]')).uploadFile(coverFile);await page.click('dialog form button');await page.waitForFunction(()=>document.querySelector('#dialog-content')?.textContent.includes('作品草稿已保存'));const myWorks=(await request('/me/works',{cookie})).data.items;assert.equal(myWorks[0].status,'draft');assert.equal((await request('/works/'+myWorks[0].id,{cookie})).data.assets.length,1);await page.click('.dialog-close');check('work draft and cover reach existing upload/storage APIs');
  await page.screenshot({path:path.join(output,'cases-desktop.png'),fullPage:true});await page.setViewport({width:390,height:844});await page.reload();await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));await page.screenshot({path:path.join(output,'cases-mobile.png'),fullPage:true});
  // Image downloads share the existing per-IP limiter. Leave it enabled and
  // allow a window to reset before the next independent acceptance group.
  console.log('Waiting one existing rate-limit window before remaining checks.');
  await new Promise(resolve=>setTimeout(resolve,60_000));
  await page.setViewport({width:1440,height:1000});await page.goto(base+'/morph/skill-tools.html');await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));await page.click('#submit-tool');await page.type('dialog [name=title]','验收工具');await page.type('dialog [name=url]','https://example.com');await page.type('dialog [name=reason]','验收推荐理由');await page.click('dialog form button');await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='工具推荐已保存到账号');assert.equal((await request('/me/morph-state',{cookie})).data.states['tool-submissions'].value[0].title,'验收工具');check('tool recommendation persists to account');
  await page.goto(base+'/morph/curriculum.html');await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));await page.type('#curriculum-query','验收课程');await page.click('#curriculum-form button');await page.waitForSelector('#save-path');await page.click('#save-path');await page.waitForFunction(()=>document.getElementById('toast')?.textContent==='课程体系已保存到账号');assert.ok((await request('/me/morph-state',{cookie})).data.states['curriculum-paths'].value[0].courses.some(c=>c.id===course));check('curriculum uses real course IDs and saves a path');
  // Isolate paid execution only; auth, content and conversation persistence remain real.
  const originalHome=(await request('/portal/home',{cookie})).data;
  await page.setRequestInterception(true);page.on('request',request=>{const route=new URL(request.url()).pathname;
    if(route==='/api/portal/home')return request.respond({status:200,contentType:'application/json',body:JSON.stringify({...originalHome,creation:{...originalHome.creation,enabled:true,models:[{id:'acceptance-model',name:'验收模型',capabilities:['chat']}]}})});
    if(route==='/api/agent-runs')return request.respond({status:201,contentType:'application/json',body:JSON.stringify({id:'acceptance-run'})});
    if(route==='/api/agent-runs/acceptance-run/execute-stream')return request.respond({status:200,contentType:'text/event-stream',body:'event: delta\ndata: {"text":"流式验收回复"}\n\nevent: done\ndata: {"run":{"status":"succeeded","messages":[{"role":"agent","content":"流式验收回复"}]}}\n\n'});
    return request.continue();
  });
  await page.goto(base+'/morph/chat.html');await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));await page.type('#chat-prompt','验收流式对话');await page.click('#chat-compose button[type=submit]');await page.waitForFunction(()=>document.querySelector('.morph-message.assistant')?.textContent.includes('流式验收回复')&&document.getElementById('chat-prompt').value==='');await page.reload();await page.waitForFunction(()=>!document.documentElement.classList.contains('morph-loading'));assert.ok(await page.$eval('#chat-messages',n=>n.textContent.includes('流式验收回复')));assert.equal((await request('/me/morph-state',{cookie})).data.states['creation-records'].value[0].messages[1].role,'assistant');check('SSE parsing and account conversation recovery with isolated model fixture');
  assert.equal(await page.$eval('#morph-stop',node=>getComputedStyle(node).display),'none');
  await page.screenshot({path:path.join(output,'chat-desktop.png'),fullPage:true});
  await page.click('.account-trigger');await page.waitForSelector('#morph-logout');await page.click('#morph-logout');await page.waitForSelector('.morph-gate input[name=username]');assert.equal((await request('/auth/me',{cookie})).status,401);check('logout revokes the real session');
  assert.deepEqual(errors,[]);check('no browser runtime errors across desktop/mobile pages');
  await writeFile(path.join(output,'result.json'),JSON.stringify({checks,errors},null,2));console.log(`MORPH acceptance: ${checks} checks passed. No paid model calls.`);
}finally{
  await browser?.close();
  const assets=await pool.query('SELECT a.storage_key FROM work_assets a JOIN works w ON w.id=a.work_id WHERE w.author_id=ANY($1::text[])',[users]);
  const uploadRoot=path.resolve(root,'apps/api',process.env.UPLOAD_ROOT||'data/uploads');
  for(const asset of assets.rows){const file=path.resolve(uploadRoot,asset.storage_key),relative=path.relative(uploadRoot,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.ok(file.startsWith(root+path.sep),'fixture cleanup stays in workspace');await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  await pool.query('DELETE FROM works WHERE author_id=ANY($1::text[])',[users]);await pool.query('DELETE FROM course_enrollments WHERE course_id=$1',[course]);await pool.query('DELETE FROM learning_progress WHERE lesson_id=$1',[lesson]);await pool.query('DELETE FROM learning_notes WHERE course_id=$1',[course]);await pool.query('DELETE FROM course_lessons WHERE course_id=$1',[course]);await pool.query('DELETE FROM courses WHERE id=$1',[course]);await pool.query('DELETE FROM users WHERE id = ANY($1::text[])',[users]);await pool.end();
}
