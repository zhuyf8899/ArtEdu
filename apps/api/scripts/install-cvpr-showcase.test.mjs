import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {assetPath,assertExisting} from './install-cvpr-showcase.mjs';
const work={id:'work-65ec6cbb-c891-43d3-a25e-3e3de376dea0',authorId:'user-operator-demo',title:'Example',story:{collection:'art-selection',originalUrl:'https://thecvf-art.com/project.php?id=891',creators:['Original artist']}};
test('recovery rejects traversal and files owned by another work or user',()=>{
 const leaf='998cb3cd-a803-4d38-a265-a496fa75f5e3-98e7cf74-06f1-4c36-9826-17254ceeff9a';
 const key=`users/${work.authorId}/works/${work.id}/${leaf}`;
 assert.equal(assetPath('/uploads',key,work),path.resolve('/uploads',...key.split('/')));
 for(const bad of ['../outside',key.replace(work.authorId,'other-user'),key.replace(work.id,'work-other'),key+'/../../secret',key.replace(leaf,'x')])assert.throws(()=>assetPath('/uploads',bad,work));
});
test('recovery stops on identity, publication, collection and attribution conflicts',()=>{
 const row={id:work.id,author_id:work.authorId,title:work.title,status:'approved',story_json:work.story};assert.doesNotThrow(()=>assertExisting(row,work));
 for(const changes of [{id:'different'},{author_id:'other'},{title:'edited title'},{status:'rejected'},{story_json:{...work.story,collection:'community'}},{story_json:{...work.story,creators:['Another artist']}},{story_json:{...work.story,originalUrl:'https://other.example/'}}])assert.throws(()=>assertExisting({...row,...changes},work));
});
test('CVPR manifest retains all nine source links, expanded introductions and 43 approved media references',async()=>{
 const root=new URL('../../../',import.meta.url);
 const bundle=JSON.parse(await readFile(new URL('seed/cvpr-showcase/manifest.json',root),'utf8'));
 const copy=JSON.parse(await readFile(new URL('seed/cvpr-featured-copy-v1.json',root),'utf8'));
 assert.equal(bundle.cases.length,9);assert.equal(new Set(bundle.cases.map(w=>w.id)).size,9);
 const assets=bundle.cases.flatMap(w=>w.assets);assert.equal(assets.filter(a=>a.assetType==='image').length,30);assert.equal(assets.filter(a=>a.assetType==='video').length,13);
 for(const w of bundle.cases){const source=copy.works.find(c=>c.title===w.title);assert.ok(source);assert.equal(w.summary,source.summary);assert.equal(w.story.originalUrl,source.originalUrl);assert.equal(w.story.collection,'art-selection');assert.ok(!w.story.authorizationNote&&!w.story.editorialNote);assert.ok(w.assets.some(a=>a.id===w.story.coverAssetId&&a.assetType==='image'));for(const a of w.assets)assert.doesNotThrow(()=>assetPath('/uploads',a.storageKey,w));}
});
