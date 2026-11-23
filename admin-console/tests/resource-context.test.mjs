import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnTarget,returnContext,withReturnTarget} from '../src/resourceContext.js';
test('返回来源仅允许本地学习资源，拒绝外站、协议相对地址和控制字符',()=>{
 for(const value of ['https://evil.test','//evil.test','/admin/users','/learning\n?course=x','javascript:alert(1)'])assert.equal(safeReturnTarget(value),'');
 const value='/my-learning?view=favorites';assert.equal(safeReturnTarget(value),value);
 assert.deepEqual(returnContext('?returnTo='+encodeURIComponent(value)),{to:value,label:'返回收藏案例'});
 assert.equal(returnContext('?returnTo='+encodeURIComponent('/learning?course=abc')).label,'返回本课程');
});
test('社区、搜索和不同参数顺序的课程返回显示准确名称',()=>{
 assert.equal(returnContext('?returnTo=%2Fcommunity').label,'返回案例社区');
 assert.equal(returnContext('?returnTo='+encodeURIComponent('/search?query=色彩')).label,'返回搜索结果');
 assert.equal(returnContext('?returnTo='+encodeURIComponent('/learning?library=legacy&course=abc')).label,'返回本课程');
});
test('多级返回保留来源的筛选条件，并把返回参数放在锚点前面',()=>{
 const search='?library=atoms&query=%E8%89%B2%E5%BD%A9';
 const source='/learning'+search;
 const previous=globalThis.window;
 globalThis.window={location:{pathname:'/learning',search},scrollY:120};
 try{
  const path=withReturnTarget('/curriculum?node=abc#path');
  const url=new URL(path,'http://local');
  assert.equal(url.hash,'#path');
  assert.equal(returnContext(url.search).to,source);
  assert.equal(withReturnTarget(path),path);
  const detail=new URL(withReturnTarget('/learning?course=abc',path),'http://local');
  assert.deepEqual(returnContext(detail.search),{to:path,label:'返回学习路径'});
 } finally {
  if(previous===undefined)delete globalThis.window;
  else globalThis.window=previous;
 }
});
test('首页、个人课程和工作流目录有独立的返回文案',()=>{
 for(const [to,label] of [['/','返回首页'],['/my-learning?view=courses','返回我的课程'],['/studio?view=workflows','返回工作流目录'],['/learning?library=courses&node=abc','返回本课程']]){
  assert.deepEqual(returnContext('?returnTo='+encodeURIComponent(to)),{to,label});
 }
});
