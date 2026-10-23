import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { z } from 'zod';

export function objectStorageConfig(env:NodeJS.ProcessEnv=process.env){
 const config=z.object({
  OSS_ENABLED:z.enum(['true','false']).default('false'),
  OSS_PROVIDER:z.literal('aliyun').default('aliyun'),
  OSS_REGION:z.string().default('oss-cn-hangzhou'),
  OSS_BUCKET:z.string().optional(),
  OSS_ACCESS_KEY_ID:z.string().optional(),
  OSS_ACCESS_KEY_SECRET:z.string().optional(),
  OSS_STS_TOKEN:z.string().optional(),
 }).parse(env);
 if(config.OSS_ENABLED==='true'&&(!config.OSS_BUCKET?.trim()||!config.OSS_ACCESS_KEY_ID?.trim()||!config.OSS_ACCESS_KEY_SECRET?.trim()))throw new Error('启用 OSS 必须配置 bucket 和访问凭据');
 return config;
}
export interface ObjectStorage {
 put(key:string,stream:Readable,mimeType:string):Promise<void>;
 get(key:string):Promise<Readable>;
 delete(key:string):Promise<void>;
}
@Injectable()
export class ObjectStorageService implements ObjectStorage {
 private readonly config=objectStorageConfig();
 private client:any;
 get enabled(){return this.config.OSS_ENABLED==='true';}
 private storage(){
  if(!this.enabled)throw new ServiceUnavailableException('OSS 服务尚未启用');
  if(!this.client){
   const OSS=require('ali-oss');
   this.client=new OSS({region:this.config.OSS_REGION,bucket:this.config.OSS_BUCKET,accessKeyId:this.config.OSS_ACCESS_KEY_ID,accessKeySecret:this.config.OSS_ACCESS_KEY_SECRET,stsToken:this.config.OSS_STS_TOKEN||undefined,secure:true,authorizationV4:true});
  }
  return this.client;
 }
 private key(key:string){
  if(!key||key.startsWith('/')||key.includes('\\')||key.split('/').some(part=>!part||part==='.'||part==='..')||/[\x00-\x1f\x7f]/.test(key))throw new Error('无效的对象存储键');
  return key;
 }
 async put(key:string,stream:Readable,mimeType:string){await this.storage().putStream(this.key(key),stream,{headers:{'Content-Type':mimeType,'x-oss-object-acl':'private'}});}
 async get(key:string):Promise<Readable>{return (await this.storage().getStream(this.key(key))).stream;}
 async delete(key:string){await this.storage().delete(this.key(key));}
}
