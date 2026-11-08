// Restore the immutable private run, independent of current public workflow availability.
export async function loadWorkflowSelection(workflowId,runId,{getWorkflow,getWorkflowRun}) {
 if(!runId)return {detail:await getWorkflow(workflowId),previous:null};
 const previous=await getWorkflowRun(runId);
 if(workflowId&&previous.workflowId!==workflowId)throw new Error('执行记录不属于这个工作流，请返回目录重新打开');
 const detail={id:previous.workflowId,name:previous.workflowName,category:previous.category,description:'已保存的节点工作流',nodes:previous.nodes,edges:previous.edges,steps:previous.steps,definition:previous.definition,versionId:previous.versionId,versionNumber:previous.versionNumber,versionPublished:previous.versionPublished,stepCount:previous.totalSteps??previous.steps?.length??0};
 return {detail,previous};
}
