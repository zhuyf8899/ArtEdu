import assert from 'node:assert/strict';
import path from 'node:path';import {pathToFileURL} from 'node:url';
import {repositoryRoot,withDatabase} from './run-sql-file';
const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
async function main(){
 const atlas=await import(pathToFileURL(path.join(repositoryRoot,'admin-console/src/curriculumAtlas.js')).href);
 const source=await import(pathToFileURL(path.join(repositoryRoot,'admin-console/src/courseKnowledge.js')).href);
 await withDatabase(async pool=>{const client=await pool.connect();await client.query('BEGIN');try{
 await client.query('SELECT pg_advisory_xact_lock(7410633)');
 const courses=await client.query<{id:string;title:string;knowledge_points:string[]}>("SELECT id,title,knowledge_points FROM courses WHERE status='published' FOR UPDATE");
 let matched=0,points=0;const missing:string[]=[];
 for(const course of atlas.atlasCourses){
 const matches=courses.rows.filter(row=>normalize(row.title)===normalize(course.title));
 if(matches.length!==1){missing.push(course.title);continue;}
 const target=matches[0],branches=source.courseKnowledge[course.id].branches;
 const labels:string[]=[...new Set<string>(branches.flatMap((b:any)=>b.points.map((p:any)=>p.title)))];
 const merged=[...new Set([...target.knowledge_points,...labels])];assert.ok(merged.length<=20,'课程知识标签超过20项，请人工整理');
 await client.query('UPDATE courses SET knowledge_points=$2::jsonb WHERE id=$1 AND knowledge_points<>$2::jsonb',[target.id,JSON.stringify(merged)]);
 for(const branch of branches){let previous:string|undefined;
 for(const point of branch.points){
 const node=await client.query<{id:string}>("SELECT id FROM knowledge_nodes WHERE id='knowledge-label-'||md5(lower($1))",[point.title]);assert.ok(node.rows[0]);const id=node.rows[0].id;
 await client.query("UPDATE knowledge_nodes SET description=$2,domain=$3 WHERE id=$1 AND source='labels' AND description=''",[id,point.summary+'（课程目录提炼，非能力认证；具体教学顺序由教师确认。）',course.domain]);
 if(previous&&previous!==id)await client.query("INSERT INTO knowledge_edges(from_node_id,to_node_id,relation) VALUES($1,$2,'related') ON CONFLICT DO NOTHING",[previous,id]);
 previous=id;points++;}
 }
 matched++;
 }
 await client.query('COMMIT');console.log('Atlas import: '+matched+' matched published courses; '+points+' point references. No learning progress changed.');if(missing.length)console.log('Unmatched titles skipped: '+missing.join('、'));
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}});
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
