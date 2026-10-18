// Isolated use of server-configured adapters. No database, sessions, or public uploads.
const fs=require('fs'),path=require('path');
process.env.UPLOAD_ROOT='/tmp/artedu-agent-sandbox-image-20261018';
const {ModelRegistry}=require('/app/apps/api/dist/modules/generation/model-registry.js');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 if(!['chat','image','document'].includes(input.jobType))throw Error('Unsupported audit job');
 const registry=new ModelRegistry(),adapter=registry.getForJob({jobType:input.jobType,providerId:input.providerId});
 // Private downstream source assets only. Keep provenance in the artifact record;
 // this bridge never publishes a final product or changes the production adapter.
 if(input.jobType==='image'&&input.downstreamAsset===true&&adapter.id==='model-siliconflow-kolors'){
   const upstream=globalThis.fetch;
   globalThis.fetch=(url,options={})=>{
     const parsed=new URL(String(url));
     if(options.method==='POST'&&parsed.hostname==='api.siliconflow.cn'&&parsed.pathname.endsWith('/images/generations')){
       const headers=new Headers(options.headers);headers.set('X-Enable-Watermark','0');return upstream(url,{...options,headers});
     }
     return upstream(url,options);
   };
 }
 const control=new AbortController();let timer;
 if(input.abortAfterMs)timer=setTimeout(()=>control.abort(),input.abortAfterMs);
 let result;
 try{result=await adapter.execute({...input.request,jobType:input.jobType,signal:control.signal});}
 catch(error){if(control.signal.aborted){process.stdout.write(JSON.stringify({aborted:true,error:'测试用户暂停：上游请求已通过AbortSignal中止'}));return;}throw error;}
 finally{clearTimeout(timer);}
 const output={adapterId:adapter.id,result};
 if(input.jobType==='document'){
   const {parseDocumentContent}=require('/app/apps/api/dist/modules/generation/document-content.js');
   const {OfficeExportService}=require('/app/apps/api/dist/modules/generation/office-export.service.js');
   if(result.finishReason==='length')throw Error('文档内容被截断');
   const content=parseDocumentContent(result.content),exporter=new OfficeExportService();
   const artifact=await exporter.create(input.request.jobId,content,input.format||'docx');
   const bytes=await exporter.read(artifact.storageKey);
   output.document={...artifact,base64:bytes.toString('base64')};
 }
 if(input.jobType==='image'){
   if(result.kind!=='asset')throw Error('Image adapter returned no asset');
   const root=path.resolve(process.env.UPLOAD_ROOT),file=path.resolve(root,result.content);
   if(!file.startsWith(root+path.sep))throw Error('Invalid audit artifact path');
   const bytes=fs.readFileSync(file);
   output.image={fileName:path.basename(file),mimeType:result.mimeType,sizeBytes:bytes.length,base64:bytes.toString('base64')};
 }
 process.stdout.write(JSON.stringify(output));
})().catch(error=>{process.stderr.write(String(error.message).replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,800));process.exitCode=1;});
