const fields=[['每日','dailyLimit',100000],['每月','monthlyLimit',1000000],['并发','concurrentLimit',100]];
export const quotaDraft=user=>Object.fromEntries(fields.map(([,key])=>[key,user?.[key]??'']));
export const quotaInputValue=value=>String(value).trim()===''?null:Number(value);
export const validQuotaDraft=draft=>fields.every(([,key,max])=>{const value=quotaInputValue(draft[key]);return value!==null&&Number.isInteger(value)&&value>=0&&value<=max;});
export const quotaDraftChanges=(user,draft)=>fields.map(([label,key])=>[label,user[key]??null,quotaInputValue(draft[key])]).filter(([,before,after])=>before!==after);
