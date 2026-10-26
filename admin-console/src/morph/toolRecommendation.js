// User-scoped local drafts. Submitted recommendations use the separate platform review API.
export const toolDraftKey=accountId=>`artedu:tool-recommendation:${encodeURIComponent(accountId)}`;
export const emptyToolDraft=()=>({title:'',url:'',reason:''});
export function readToolDraft(storage,accountId) {
  try {
    const draft=JSON.parse(storage.getItem(toolDraftKey(accountId))||'null');
    return draft&&typeof draft==='object' ? Object.fromEntries(Object.keys(emptyToolDraft()).map(key=>[key,typeof draft[key]==='string'?draft[key]:''])) : emptyToolDraft();
  } catch {return emptyToolDraft();}
}
export function validateToolDraft(draft) {
  const result=Object.fromEntries(Object.keys(emptyToolDraft()).map(key=>[key,String(draft[key]??'').trim()]));
  if(!result.title||!result.reason)throw new Error('请填写工具名称与推荐理由。');
  if(result.title.length>80||result.reason.length>2000||result.url.length>2048)throw new Error('内容过长，请缩短后保存。');
  let url;try{url=new URL(result.url);}catch{throw new Error('请填写完整的 https 官网链接。');}
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('请使用不包含账号密码的 https 官网链接。');
  return result;
}
