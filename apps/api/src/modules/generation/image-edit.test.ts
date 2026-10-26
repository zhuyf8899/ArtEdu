import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { imageEditForm } from './image-edit';
import { OpenAIImageAdapter } from './openai-image.adapter';
import { ModelRegistry } from './model-registry';
import { getEnvironment } from '../../common/environment';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6l8AAAAASUVORK5CYII=','base64');
const image={fileName:'private.png',dataUrl:`data:image/png;base64,${png.toString('base64')}`};
test('编辑表单发送原图及同尺寸透明 PNG，不发送私有 URL',async()=>{
 const form=imageEditForm({image,mask:image},'edit-model','修改选区');
 assert.equal(form.get('prompt'),'修改选区');assert.equal(form.get('model'),'edit-model');
 assert.deepEqual(Buffer.from(await (form.get('image') as File).arrayBuffer()),png);
 assert.deepEqual(Buffer.from(await (form.get('mask') as File).arrayBuffer()),png);
 const changed=Buffer.from(png);changed.writeUInt32BE(2,16);
 assert.throws(()=>imageEditForm({image,mask:{...image,dataUrl:`data:image/png;base64,${changed.toString('base64')}`}},'m','p'),/同尺寸/);
 assert.throws(()=>imageEditForm({image:{...image,dataUrl:'https://private/api/file'}},'m','p'),/PNG/);
});
test('图片编辑仅路由到显式支持 edits 的配置，不回退到文生图',()=>{
 const saved=process.env.MODEL_PROVIDERS_JSON;
 try{
  process.env.MODEL_PROVIDERS_JSON=JSON.stringify([{id:'generate',model:'g',baseUrl:'https://api.test/v1/',protocol:'siliconflow-image',capabilities:['image']},{id:'edit',model:'e',baseUrl:'https://api.test/v1/',protocol:'openai-image',capabilities:['image'],imageEditing:true}]);
  const registry=new ModelRegistry();assert.equal(registry.getForJob({jobType:'image',imageEditing:true}).id,'edit');
  process.env.MODEL_PROVIDERS_JSON=JSON.stringify([{id:'generate',model:'g',baseUrl:'https://api.test/v1/',protocol:'openai-image',capabilities:['image']}]);
  assert.throws(()=>new ModelRegistry().getForJob({jobType:'image',imageEditing:true}));
 }finally{if(saved===undefined)delete process.env.MODEL_PROVIDERS_JSON;else process.env.MODEL_PROVIDERS_JSON=saved;}
});
test('适配器实际调用 multipart images/edits，并私有保存返回图片',async()=>{
 const previous=globalThis.fetch;let key:string|undefined;let calls=0;
 try{
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://api.test/v1/images/edits');assert.equal(new Headers(init?.headers).get('content-type'),null);assert.ok(init?.body instanceof FormData);assert.ok(init.body.get('mask'));return Response.json({data:[{b64_json:png.toString('base64')}]});};
  const adapter=new OpenAIImageAdapter({id:'edit',baseUrl:'https://api.test/v1/',model:'edit-model',capabilities:['image'],protocol:'openai-image',timeoutMs:1000,imageEditing:true});
  // Test-only API key, restored below.
  const saved=process.env.ARTEDU_EDIT_TEST_KEY;process.env.ARTEDU_EDIT_TEST_KEY='test';
  try{
   const configured=new OpenAIImageAdapter({...((adapter as any).config),apiKeyEnv:'ARTEDU_EDIT_TEST_KEY'});
   const result=await configured.execute({jobType:'image',prompt:'修改选区',imageEdit:{image,mask:image}});key=result.content;
   assert.deepEqual(await readFile(path.resolve(getEnvironment().uploadRoot,key)),png);assert.equal(calls,1);
  }finally{if(saved===undefined)delete process.env.ARTEDU_EDIT_TEST_KEY;else process.env.ARTEDU_EDIT_TEST_KEY=saved;}
 }finally{globalThis.fetch=previous;if(key)await rm(path.resolve(getEnvironment().uploadRoot,key),{force:true});}
});
