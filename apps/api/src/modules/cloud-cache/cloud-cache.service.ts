import {Injectable,Logger,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {readdir,stat,lstat,unlink} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseService} from '../database/database.service';
import {getEnvironment} from '../../common/environment';
import {cacheExpired} from './cache-policy';
// Only these managed cache trees can be cleaned; authored resources are outside them.
export async function purgeCacheFiles(root:string, protectedKeys:Set<string>, now=Date.now()) {
 const absolute=path.resolve(root);let removed=0;
 const walk=async(dir:string):Promise<void>=>{
  if((await lstat(dir).catch(()=>null))?.isSymbolicLink())return;
  for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
   const target=path.resolve(dir,entry.name);
   if(!target.startsWith(absolute+path.sep)||entry.isSymbolicLink())continue;
   if(entry.isDirectory()){await walk(target);continue;}
   const key=path.relative(absolute,target).split(path.sep).join('/');
   if(protectedKeys.has(key))continue;
   const info=await stat(target).catch(()=>null);
   if(info?.isFile()&&cacheExpired(info.mtimeMs,now)){await unlink(target);removed++;}
  }
 };
 for(const tree of ['temporary','agent-runs','agent-workspaces','generated'])await walk(path.join(absolute,tree));
 return removed;
}
@Injectable()
export class CloudCacheService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private active=false;private readonly logger=new Logger(CloudCacheService.name);
 constructor(private readonly db:DatabaseService){}
 onModuleInit(){void this.cleanup();this.timer=setInterval(()=>void this.cleanup(),30000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async cleanup(){
  if(this.active)return;this.active=true;
  try{
   // Keep accounting/status metadata, never the expired user prompt or parameters.
   await this.db.query(`UPDATE generation_jobs SET prompt='',parameters_json='{}'::jsonb,error_message=NULL WHERE created_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes' AND (prompt<>'' OR parameters_json<>'{}'::jsonb OR error_message IS NOT NULL)`);
   await this.db.query(`DELETE FROM agent_runs WHERE id IN (SELECT id FROM agent_runs WHERE created_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes' ORDER BY created_at LIMIT 500)`);
   await this.db.query(`DELETE FROM conversation_messages WHERE created_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes'`);
   await this.db.query(`UPDATE conversations SET title=NULL WHERE created_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes' AND title IS NOT NULL`);
   await this.db.query(`UPDATE workflow_runs SET context_json='{}'::jsonb WHERE started_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes' AND context_json<>'{}'::jsonb`);
   await this.db.query(`UPDATE comfy_jobs SET prompt_json='{}'::jsonb,progress_json='{}'::jsonb,error=NULL WHERE created_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes' AND (prompt_json<>'{}'::jsonb OR progress_json<>'{}'::jsonb OR error IS NOT NULL)`);
   await this.db.query(`UPDATE workflow_run_events SET note=NULL WHERE created_at<=CURRENT_TIMESTAMP-INTERVAL '20 minutes' AND note IS NOT NULL`);
   const saved=await this.db.query<{storage_key:string}>(`SELECT o.storage_key FROM generation_outputs o WHERE EXISTS(SELECT 1 FROM work_generation_jobs w WHERE w.generation_job_id=o.job_id) OR EXISTS(SELECT 1 FROM learning_generation_outputs l WHERE l.generation_output_id=o.id)`);
   await purgeCacheFiles(getEnvironment().uploadRoot,new Set(saved.rows.map(r=>r.storage_key)));
  }catch{this.logger.warn('临时缓存清理失败，将在下一周期重试');}finally{this.active=false;}
 }
}
