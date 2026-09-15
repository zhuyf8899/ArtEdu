import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareManifest,importOrigin} from './import-community-cases.mjs';
test('case import requires HTTPS remotely and refuses URL credentials',()=>{
 assert.equal(importOrigin('http://localhost:4273'),'http://localhost:4273');
 assert.equal(importOrigin('https://art.example.org'),'https://art.example.org');
 for(const value of ['http://remote.example','https://user:pass@art.example','https://art.example/api','https://art.example?token=a'])assert.throws(()=>importOrigin(value));
});
async function fixture(run){
 const root=await mkdtemp(path.join(tmpdir(),'artedu-import-'));
 try{await run(root);}finally{await rm(root,{recursive:true,force:true});}
}
const bytes=Buffer.from('fixture-image'),sha256=createHash('sha256').update(bytes).digest('hex');
const item=()=>({key:'sample',payload:{title:'Sample',story:{steps:[{imageFiles:['image.png']}]}},assets:[{file:'image.png',sha256}],coverFile:'image.png'});
test('case import preflights checksums and owned image references',()=>fixture(async root=>{
 await writeFile(path.join(root,'image.png'),bytes);
 const manifest={version:1,cases:[item()]},file=path.join(root,'manifest.json');
 await writeFile(file,JSON.stringify(manifest));
 assert.equal((await prepareManifest(file)).cases[0].assets[0].digest,sha256);
 manifest.cases[0].assets[0].sha256='wrong';await writeFile(file,JSON.stringify(manifest));
 await assert.rejects(prepareManifest(file),/checksum/);
 manifest.cases[0]=item();manifest.cases[0].payload.story.steps[0].imageFiles=['foreign.png'];await writeFile(file,JSON.stringify(manifest));
 await assert.rejects(prepareManifest(file),/same case/);
}));
test('case import rejects duplicate identities and excessive file counts',()=>fixture(async root=>{
 await writeFile(path.join(root,'image.png'),bytes);const file=path.join(root,'manifest.json');
 await writeFile(file,JSON.stringify({version:1,cases:[item(),item()]}));await assert.rejects(prepareManifest(file),/Duplicate/);
 const record=item();record.assets=Array.from({length:11},()=>({file:'image.png',sha256}));
 await writeFile(file,JSON.stringify({version:1,cases:[record]}));await assert.rejects(prepareManifest(file),/1–10/);
}));
test('case import refuses filesystem traversal before any upload',()=>fixture(async root=>{
 await mkdir(path.join(root,'bundle'));await writeFile(path.join(root,'outside.png'),bytes);
 const record=item();record.assets[0].file='../outside.png';const file=path.join(root,'bundle/manifest.json');
 await writeFile(file,JSON.stringify({version:1,cases:[record]}));await assert.rejects(prepareManifest(file),/escapes/);
}));
