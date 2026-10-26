import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnTarget,returnContext} from '../src/resourceContext.js';
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
