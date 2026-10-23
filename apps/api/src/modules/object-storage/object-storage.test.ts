import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {objectStorageConfig,ObjectStorageService} from './object-storage.service';
test('OSS 默认阿里云且关闭，无需凭据',()=>{
 const config=objectStorageConfig({});
 assert.equal(config.OSS_PROVIDER,'aliyun');assert.equal(config.OSS_ENABLED,'false');
 assert.throws(()=>objectStorageConfig({OSS_ENABLED:'true'}));
 assert.throws(()=>objectStorageConfig({OSS_ENABLED:'yes'}));
});
test('关闭时所有存储操作拒绝且不会创建 SDK 客户端',async()=>{
 const previous=process.env.OSS_ENABLED;process.env.OSS_ENABLED='false';
 try{
  const service=new ObjectStorageService();
  await assert.rejects(service.put('test/file',Readable.from('hello'),'text/plain'),/尚未启用/);
  await assert.rejects(service.get('test/file'),/尚未启用/);
  await assert.rejects(service.delete('test/file'),/尚未启用/);
  assert.equal((service as any).client,undefined);
 }finally{if(previous===undefined)delete process.env.OSS_ENABLED;else process.env.OSS_ENABLED=previous;}
});
