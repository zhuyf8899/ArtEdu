import {CanActivate,ExecutionContext,ForbiddenException,Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
export async function workflowFeatureEnabled(db:DatabaseService):Promise<boolean>{
 const result=await db.query('SELECT enabled FROM comfy_feature_settings WHERE id=true');
 return result.rows[0]?.enabled===true;
}
export async function requireWorkflowFeature(db:DatabaseService){
 if(!await workflowFeatureEnabled(db))throw new ForbiddenException({code:'COMFYUI_DISABLED',message:'节点生图（ComfyUI）功能已关闭'});
}
export const workflowToolNames=new Set(['list_own_workflow_drafts','create_temporary_workflow','edit_temporary_workflow','read_temporary_workflow','load_own_workflow_draft','get_workflow_detail','list_workflows','get_workflow_run_result','start_workflow_run']);
export function isWorkflowRoute(url:string){
 const path=url.split('?')[0].replace(/^\/api(?=\/)/,'');
 // Worker shutdown acknowledgements remain available; pulse instructs it to cancel.
 if(/^\/local-bridge\/comfy\/(?:claim$|jobs\/[^/]+\/(?:pulse|progress|finish)$)/.test(path))return false;
 return /^\/(?:comfy|temporary-workflows|workflows|workflow-runs|admin\/workflows|me\/workflow-runs|local-bridge\/comfy)(?:\/|$)/.test(path)
 || /^\/admin\/content\/workflow(?:\/|$)/.test(path);
}
@Injectable()
export class WorkflowFeatureGuard implements CanActivate {
 constructor(private readonly db:DatabaseService){}
 async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest();
  if(isWorkflowRoute(request.routeOptions?.url??request.url)||isWorkflowRoute(request.url))await requireWorkflowFeature(this.db);
  return true;
 }
}
