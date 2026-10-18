import assert from "node:assert/strict";
import test from "node:test";
import { buildPortalSearchPatterns, portalSearchQuerySchema } from "./portal.contracts";
import { PortalService } from "./portal.service";

test("portal search trims query and applies the all type by default", () => {
  assert.deepEqual(portalSearchQuerySchema.parse({ query: "  传统纹样  " }), {
    query: "传统纹样",
    type: "all",
  });
});

test("portal search rejects empty and unsupported queries", () => {
  assert.equal(portalSearchQuerySchema.safeParse({ query: "   " }).success, false);
  assert.equal(portalSearchQuerySchema.safeParse({ query: "AI", type: "book" }).success, false);
});

test("portal search expands common creation-method aliases", () => {
  assert.deepEqual(buildPortalSearchPatterns(" UI "), ["%UI%", "%界面%", "%交互%", "%视觉设计%", "%设计系统%"]);
  assert.ok(buildPortalSearchPatterns("Vibe Coding").includes("%网页%"));
  assert.deepEqual(buildPortalSearchPatterns("传统纹样"), ["%传统纹样%"]);
});

test('search keeps public authors, precise detail routes and full matching totals', async () => {
  const queries: string[]=[];
  const base={title:'测试',summary:'',category:'艺术',author:'上传账号',tags:[],updated_at:new Date('2026-10-18'),match_count:12};
  const rows=[{...base,id:'course one',catalog_json:{authorLabel:'课程作者'}},{...base,id:'flow one'}, {...base,id:'work one',creators:['Robin Champenois']}, {...base,id:'tool one',directory_name:'工具名称'}];
  const database={query:async(sql:string)=>{queries.push(sql);return {rows:[rows[queries.length-1]]};}};
  const service=new PortalService(database as any,{} as any);
  const result=await service.search({} as any,{query:'测试',type:'all'});
  assert.equal(result.matchCount,48);assert.equal(result.items.length,4);
  assert.equal(result.items.find(item=>item.id==='work one')?.author,'Robin Champenois');
  assert.equal(result.items.find(item=>item.id==='work one')?.route,'/community?work=work%20one');
  assert.equal(result.items.find(item=>item.id==='flow one')?.route,'/studio?workflow=flow%20one');
  assert.equal(result.items.find(item=>item.id==='course one')?.author,'课程作者');
  assert.equal(result.items.find(item=>item.id==='tool one')?.directoryName,'工具名称');
  assert.match(queries[2],/story_json->'creators'/);assert.doesNotMatch(queries[3],/bundleId/);
});
