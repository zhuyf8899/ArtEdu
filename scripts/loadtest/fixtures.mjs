import {createRequire} from 'node:module';
import {randomBytes,scryptSync} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=require('pg');
const connectionString=process.env.LOADTEST_DATABASE_URL || 'postgresql://loadtest:loadtest_local_only@127.0.0.1:55432/artedu_loadtest';
const target=new URL(connectionString);
if (!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/artedu_loadtest') throw Error('Only isolated local load-test database is allowed');
const count=Number(process.env.LOADTEST_USERS || 150);
if (!Number.isInteger(count)||count<1||count>2000) throw Error('Invalid fixture count');
const password=randomBytes(20).toString('base64url'),salt=randomBytes(16).toString('base64url');
const hash=`scrypt$16384$8$1$${salt}$${scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('base64url')}`;
const pool=new Pool({connectionString});
const accounts=[];
try {
  await pool.query('BEGIN');
  for(let i=1;i<=count;i++) {
    const username=`loadtest-${String(i).padStart(3,'0')}`;
    await pool.query("INSERT INTO users(id,username,display_name) VALUES($1,$1,$2) ON CONFLICT(id) DO NOTHING",[username,`压测用户 ${i}`]);
    await pool.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,'role-student') ON CONFLICT DO NOTHING",[username]);
    await pool.query("INSERT INTO user_identities(id,user_id,provider,external_subject,password_hash) VALUES($1,$1,'local',$1,$2) ON CONFLICT(user_id,provider) DO UPDATE SET password_hash=$2",[username,hash]);
    accounts.push({username,password});
  }
  // Match the current directory counts using synthetic content, never copy private files.
  for(let i=1;i<=12;i++) {
    const id=`loadtest-course-${i}`;
    await pool.query("INSERT INTO courses(id,slug,title,summary,category,difficulty,status,created_by,estimated_minutes) VALUES($1,$1,$2,'本地压测合成课程，不含私有课件','设计基础','beginner','published','user-teacher-demo',30) ON CONFLICT(id) DO NOTHING",[id,`AI压测课程 ${i}`]);
    await pool.query("INSERT INTO course_lessons(id,course_id,title,status,lesson_type,estimated_minutes) VALUES($1,$2,'合成教学节点','published','lesson',30) ON CONFLICT(id) DO NOTHING",[`${id}-lesson`,id]);
  }
  for(let i=1;i<=13;i++) {
    const id=`loadtest-work-${i}`;
    await pool.query("INSERT INTO works(id,author_id,title,summary,discipline,status,published_at) VALUES($1,'user-student-demo',$2,'仅用于本地压测的案例元数据，不含媒体文件','视觉设计','approved',CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING",[id,`AI压测案例 ${i}`]);
  }
  await pool.query('COMMIT');
  await mkdir('local-artifacts/loadtest',{recursive:true});
  await writeFile('local-artifacts/loadtest/accounts.json',JSON.stringify(accounts));
  console.log(`Prepared ${count} isolated student accounts; credentials saved only to ignored local file.`);
} catch(error) {await pool.query('ROLLBACK');throw error;} finally {await pool.end();}
