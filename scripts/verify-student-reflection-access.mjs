// Local access checks only. No course, atom, insight or learning record is created.
import assert from 'node:assert/strict';
const origin=new URL(process.env.ARTEDU_TEST_ORIGIN||'http://localhost:4173');
if(!['localhost','127.0.0.1'].includes(origin.hostname)||origin.username||origin.password)throw Error('Local origin only');
let cookie='';
async function request(path,body,expected=200){const response=await fetch(new URL('/api/'+path,origin),{method:body===undefined?'GET':'POST',headers:{origin:origin.origin,...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(response.status,expected,path+' unexpected HTTP status');return response;}
try{
 await request('atomic/catalog?view=learning',undefined,401);
 const login=await request('auth/login',{username:process.env.ARTEDU_TEST_STUDENT_USERNAME||'student.demo',password:process.env.ARTEDU_TEST_STUDENT_PASSWORD||'123456'},201);
 cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert.ok(cookie);
 const actor=await login.json();assert.ok(actor.roles.includes('student'));assert.ok(!actor.roles.includes('teacher'));
 for(const view of ['learning','mine','atoms']){const data=await(await request('atomic/catalog?view='+view)).json();assert.ok(Array.isArray(data.items));}
 await request('atomic/catalog?view=review',undefined,403);
 for(const kind of ['teaching','course'])await request('atomic/nodes',{kind,payload:{}},403);
 await request('atomic/nodes',{kind:'reflection',payload:{}},400); // Missing association, never inserts a row.
 console.log('PASS: student-only session can read learned/published atoms and own contributions; teacher creation and moderation remain forbidden; unlinked insights rejected. No content written.');
}finally{if(cookie)await request('auth/logout',{},201);}
