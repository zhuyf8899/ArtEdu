import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
require('dotenv').config({path:new URL('../apps/api/.env',import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1')});
const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'local database only');
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});const c=await pool.connect();
try{
 await c.query('BEGIN');
 const users=await c.query('SELECT id FROM users ORDER BY id LIMIT 2');assert.equal(users.rows.length,2);
 const learner=users.rows[0].id,other=users.rows[1].id,atom='verify-'+randomUUID(),node='verify-'+randomUUID();
 await c.query("INSERT INTO knowledge_nodes(id,title,status) VALUES($1,'能力事务验证','published')",[node]);
 await c.query("INSERT INTO atomic_nodes(id,kind,owner_id) VALUES($1,'teaching',$2)",[atom,other]);
 await c.query("INSERT INTO atomic_versions(node_id,revision,payload,status) VALUES($1,1,$2,'published'),($1,2,$2,'published')",[atom,JSON.stringify({title:'验证原子',completion:'practice'})]);
 await c.query('UPDATE atomic_nodes SET published_revision=2 WHERE id=$1',[atom]);
 for(const revision of [1,2])await c.query('INSERT INTO atomic_knowledge_bindings(atom_id,revision,knowledge_node_id) VALUES($1,$2,$3)',[atom,revision,node]);
 const state=async()=> (await c.query('SELECT * FROM user_knowledge_abilities WHERE user_id=$1 AND knowledge_node_id=$2',[learner,node])).rows[0];
 await c.query("INSERT INTO atomic_progress(user_id,node_id,revision,stage) VALUES($1,$2,1,'read')",[learner,atom]);
 assert.equal((await state()).read_count,1);
 await c.query("UPDATE atomic_progress SET stage='submitted' WHERE user_id=$1 AND node_id=$2",[learner,atom]);assert.equal((await state()).submitted_count,1);
 await c.query("UPDATE atomic_progress SET stage='needs_revision',feedback='继续练习',reviewer_id=$3 WHERE user_id=$1 AND node_id=$2",[learner,atom,other]);assert.equal((await state()).needs_revision_count,1);
 await c.query("UPDATE atomic_progress SET stage='completed',feedback='通过',reviewer_id=$3 WHERE user_id=$1 AND node_id=$2",[learner,atom,other]);assert.equal((await state()).evaluated_count,1);
 await c.query("INSERT INTO atomic_progress(user_id,node_id,revision,stage) VALUES($1,$2,2,'read')",[learner,atom]);assert.equal((await state()).atom_count,1);assert.equal((await state()).read_count,1);
 assert.equal((await c.query('SELECT COUNT(*)::int AS count FROM user_atomic_ability_evidence WHERE user_id=$1 AND atom_id=$2',[learner,atom])).rows[0].count,2);
 assert.equal((await c.query('SELECT COUNT(*)::int AS count FROM user_knowledge_abilities WHERE user_id=$1 AND knowledge_node_id=$2',[other,node])).rows[0].count,0);
 await c.query('DELETE FROM atomic_knowledge_bindings WHERE atom_id=$1',[atom]);assert.equal(await state(),undefined);
 await c.query('INSERT INTO atomic_knowledge_bindings(atom_id,revision,knowledge_node_id) VALUES($1,1,$2)',[atom,node]);assert.equal((await state()).evaluated_count,1);
 console.log('PASS: read/submit/revise/grade persistence, version deduplication, user isolation, binding backfill/removal. All fixtures rolled back.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
