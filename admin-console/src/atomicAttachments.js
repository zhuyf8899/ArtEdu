import { randomId } from './randomId.js';
export const atomicAttachmentAccept='.jpg,.jpeg,.png,.webp,.pdf,.docx,.pptx,.txt,.md,.csv,.mp4,.webm';
const extensions=new Set(atomicAttachmentAccept.split(','));
export function selectAtomicAttachments(current,files,existingCount=0){
 const next=[...current],errors=[];
 for(const file of files){
  const extension='.'+file.name.split('.').pop().toLowerCase();
  if(!extensions.has(extension)){errors.push(`${file.name}：不支持此文件类型`);continue;}
  if(!file.size){errors.push(`${file.name}：不能上传空文件`);continue;}
  if(!['.mp4','.webm'].includes(extension)&&file.size>10*1024*1024){errors.push(`${file.name}：非视频文件不能超过 10 MiB`);continue;}
  if(next.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;
  if(existingCount+next.length>=12){errors.push('每个原子最多十二个附件，请移除待上传文件后重选');break;}
  next.push({key:randomId(),file,status:'queued',progress:0,error:''});
 }
 return {entries:next,errors};
}

/** A retry reuses the saved draft and skips acknowledged uploads. Never auto-publishes. */
export async function saveAtomicAttachments({payload,entries,checkpoint,persist,upload,onUpdate=()=>{},onDraft=()=>{},onPhase=()=>{}}){
 const signature=JSON.stringify({...payload,assetIds:undefined});
 if(!checkpoint.saved||checkpoint.signature!==signature){
  onPhase('saving');
  const draft=await persist({...payload,assetIds:[...new Set([...(payload.assetIds??[]),...(checkpoint.assetIds??[])])]},checkpoint);
  Object.assign(checkpoint,draft,{saved:true,signature,assetIds:[...new Set([...(payload.assetIds??[]),...(checkpoint.assetIds??[])])]});
  onDraft({id:checkpoint.id,revision:checkpoint.revision});
 }
 let failures=0;
 for(const entry of entries){
  if(entry.status==='complete')continue;
  onPhase('uploading');onUpdate(entry.key,{status:'uploading',progress:0,error:''});
  try{
   const asset=await upload(checkpoint.id,checkpoint.revision,entry.file,{onProgress:progress=>onUpdate(entry.key,{progress})});
   if(!asset?.id)throw Error('服务器未确认附件保存，请核对草稿附件后再试');
   checkpoint.assetIds=[...new Set([...checkpoint.assetIds,asset.id])];
   onUpdate(entry.key,{status:'complete',progress:100,assetId:asset.id,error:''});
  }catch(error){failures++;onUpdate(entry.key,{status:'failed',error:error.message||'上传失败，请重试'});}
 }
 if(failures)throw Error(`草稿已保存，${failures} 个附件未上传成功。已成功的附件会保留，再次保存只重试未成功的附件。`);
 return {id:checkpoint.id,revision:checkpoint.revision};
}
