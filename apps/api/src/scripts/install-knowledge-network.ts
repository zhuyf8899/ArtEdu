import assert from 'node:assert/strict';
import path from 'node:path';import {pathToFileURL} from 'node:url';
import {repositoryRoot,withDatabase} from './run-sql-file';
async function main(){
 const {pilotNodes,pilotLinks}=await import(pathToFileURL(path.join(repositoryRoot,'shared/knowledgeNetworkPilot.mjs')).href);
 await withDatabase(async pool=>{const client=await pool.connect();await client.query('BEGIN');try{
 await client.query('SELECT pg_advisory_xact_lock(7410633)');
 const result=await client.query("SELECT id,title,tags FROM knowledge_nodes WHERE status='published' AND title=ANY($1::text[]) FOR UPDATE",[pilotNodes.map((node:any)=>node.title)]);
 const ids=new Map<string,string>();
 for(const node of pilotNodes){const matches=result.rows.filter(row=>row.title===node.title);assert.equal(matches.length,1,'需要唯一且已发布的现有节点：'+node.title);const row=matches[0];ids.set(node.title,row.id);
 const tags=[...new Set([...(row.tags??[]),...node.tags])];assert.ok(tags.length<=12);
 const resource=await client.query('SELECT 1 FROM knowledge_bindings WHERE node_id=$1 LIMIT 1',[row.id]);assert.ok(resource.rows.length,'节点必须保留真实资源关联');
 await client.query('UPDATE knowledge_nodes SET show_in_network=true,tags=$2::jsonb,updated_at=now() WHERE id=$1',[row.id,JSON.stringify(tags)]);
 }
 let added=0;
 for(const [from,to]of pilotLinks){const pair=[ids.get(from),ids.get(to)].sort();assert.ok(pair[0]&&pair[1]&&pair[0]!==pair[1]);
 const exists=await client.query("SELECT 1 FROM knowledge_edges WHERE relation='related' AND ((from_node_id=$1 AND to_node_id=$2) OR (from_node_id=$2 AND to_node_id=$1))",pair);
 if(!exists.rows.length){await client.query("INSERT INTO knowledge_edges(from_node_id,to_node_id,relation) VALUES($1,$2,'related') ON CONFLICT DO NOTHING",pair);added++;}}
 await client.query('COMMIT');console.log(JSON.stringify({selected:pilotNodes.length,tagged:pilotNodes.filter((node:any)=>node.tags.length).length,curatedLinks:pilotLinks.length,newLinks:added,preserved:'existing nodes, bindings, edges and learning records'}));
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}});
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
