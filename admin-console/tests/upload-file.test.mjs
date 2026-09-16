import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFile } from '../src/services/uploadFile.js';
import { caseUploadError } from '../src/caseStory.js';
test('视频 100 MiB 边界与服务端配置一致，图片不扩大', () => {
  const video = {name:'test.mp4',type:'video/mp4',size:100*1024*1024};
  assert.equal(caseUploadError([video]),'');
  assert.match(caseUploadError([{...video,size:video.size+1}]),/100 MiB/);
  assert.match(caseUploadError([video],0,{videoBytes:20*1024*1024,fileBytes:10*1024*1024}),/20 MiB/);
  assert.match(caseUploadError([{...video,type:'image/png'}]),/10 MiB/);
});
test('真实进度事件、取消、代理错误和成功响应分别处理', async () => {
  const previous = globalThis.XMLHttpRequest;
  let xhr;
  globalThis.XMLHttpRequest = class { constructor(){xhr=this;this.upload={};} open(){} send(){} abort(){this.onabort();} };
  const file = new Blob(['test'],{type:'video/mp4'});
  try {
    const controller = new AbortController();
    let progress;
    const pending = uploadFile('/api/works/a/assets',file,{signal:controller.signal,onProgress:n=>progress=n});
    assert.equal(xhr.withCredentials,true);
    xhr.upload.onprogress({lengthComputable:true,loaded:3,total:4}); assert.equal(progress,75);
    controller.abort(); await assert.rejects(pending,{name:'AbortError'});
    const large = uploadFile('/api/works/a/assets',file); xhr.status=413; xhr.responseText='<html>Too large</html>'; xhr.onload(); await assert.rejects(large,/服务器上传限制/);
    const ok = uploadFile('/api/works/a/assets',file); xhr.status=201; xhr.responseText='{"id":"a"}'; xhr.onload(); assert.deepEqual(await ok,{id:'a'});
  } finally { globalThis.XMLHttpRequest = previous; }
});
