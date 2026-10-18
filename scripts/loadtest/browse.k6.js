import http from 'k6/http';
import {check,sleep,fail} from 'k6';
import {SharedArray} from 'k6/data';
import {Rate} from 'k6/metrics';
import exec from 'k6/execution';
const base=__ENV.BASE_URL || 'http://127.0.0.1:18200';
if (!/^http:\/\/(127\.0\.0\.1|localhost):18200$/.test(base)) throw Error('This test only targets the isolated local port 18200');
const accounts=new SharedArray('loadtest accounts',()=>JSON.parse(open('../../local-artifacts/loadtest/accounts.json')));
const smoke=__ENV.SMOKE==='1';
const target=Number(__ENV.TARGET_VUS || 150);
if(![150,300,500,800,1000,1500,2000].includes(target))throw Error('Supported preliminary profiles: 150 through 2000 users');
const hold=Number(__ENV.HOLD_SECONDS||180);
if(![60,90,180].includes(hold))throw Error('Invalid hold duration');
const businessErrors=new Rate('business_errors');
export const options={
  setupTimeout:'180s',
  ...(smoke ? {vus:1,iterations:3} : {stages:target!==150?[{duration:'30s',target:target},{duration:hold+'s',target:target},{duration:'20s',target:0}]:[{duration:'20s',target:10},{duration:'20s',target:10},{duration:'20s',target:30},{duration:'20s',target:30},{duration:'20s',target:50},{duration:'20s',target:50},{duration:'30s',target:100},{duration:'90s',target:100},{duration:'30s',target:150},{duration:'90s',target:150},{duration:'20s',target:0}]}),
  thresholds:{
    'http_req_failed{phase:load}':[{threshold:'rate<0.02',abortOnFail:true,delayAbortEval:'30s'}],
    'http_req_duration{phase:load}':['p(95)<1000',{threshold:'p(99)<5000',abortOnFail:true,delayAbortEval:'30s'}],
    ...(!smoke ? target!==150?{[`http_req_duration{level:${target}}`]:['p(95)<1000']}:{'http_req_duration{level:100}':['p(95)<1000'],'http_req_duration{level:150}':['p(95)<1000']} : {}),
    business_errors:[{threshold:'rate<0.01',abortOnFail:true,delayAbortEval:'30s'}],
  },
};
export function setup(){
  const health=http.get(`${base}/api/health/ready`);
  if(health.status!==200) fail('Isolated server not ready');
  const sessions=[];
  if(accounts.length<target&&!smoke)fail('Not enough isolated accounts');
  for(const account of accounts.slice(0,smoke?1:target)){
    const response=http.post(`${base}/api/auth/login`,JSON.stringify(account),{headers:{'Content-Type':'application/json',Origin:base},tags:{name:'login',phase:'setup'}});
    if(response.status!==201) fail(`Test login failed (${response.status})`);
    const cookies=Object.entries(response.cookies).map(([name,values])=>({name,value:values[0].value}));
    if(!cookies.length) fail('Login returned no session cookie');
    sessions.push(cookies);
  }
  return {sessions};
}
function level(){const seconds=(Date.now()-exec.scenario.startTime)/1000;return target!==150?(seconds>=30&&seconds<30+hold?String(target):'ramp'):seconds>=270&&seconds<360?'150':seconds>=150&&seconds<240?'100':'ramp';}
function read(path,name,valid){
  const response=http.get(base+'/api'+path,{tags:{name,phase:'load',level:level()},timeout:'10s'});
  let body;try{body=response.json();}catch{}
  const ok=check(response,{[name+': valid authenticated response']:()=>response.status===200 && body && (!valid||valid(body))});
  businessErrors.add(!ok);return body;
}
export default function(data){
  for(const cookie of data.sessions[__VU-1]) http.cookieJar().set(base,cookie.name,cookie.value);
  read('/portal/home','home');
  read('/courses','courses',body=>Array.isArray(body.items)&&body.items.length>0);
  sleep(smoke?0.1:1+Math.random()*2);
  if(Math.random()<0.5) read('/courses/course-ai-design-foundation','course_detail',body=>body.id==='course-ai-design-foundation');
  else read('/works','community',body=>Array.isArray(body.items));
  if(Math.random()<0.4) read('/portal/search?query=AI&type=all','search',body=>Array.isArray(body.items));
  read('/me/learning-space','learning_space',body=>body.profile?.id===`loadtest-${String(__VU).padStart(3,'0')}`);
  if(smoke||Math.random()<0.1){
    const response=http.post(base+'/api/me/learning-space/notes',JSON.stringify({title:'压测笔记',content:'只写入隔离测试数据库'}),{headers:{'Content-Type':'application/json',Origin:base},tags:{name:'save_note',phase:'load',level:level()},timeout:'10s'});
    const ok=check(response,{'note persisted':r=>r.status===201});businessErrors.add(!ok);
  }
  sleep(smoke?0.1:2+Math.random()*3);
}
