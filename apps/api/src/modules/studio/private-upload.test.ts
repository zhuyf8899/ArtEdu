import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { caseUploadPolicy } from '../../common/upload-policy';
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import AdmZip from "adm-zip";
import { extractOfficeText } from "../creation-storage/creation-storage.service";
import { detectUploadMimeType, storePrivateUpload } from "./private-upload";
import { resolveWorkAssetPath } from "./work-asset-path";
import { StudioService } from "./studio.service";
import { StudioController } from "./studio.controller";
import { resolveByteRange } from "../../common/byte-range";

test('上传已落库后 OCR 审计异常不得删除素材', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'artedu-ocr-commit-'));
  const oldRoot = process.env.UPLOAD_ROOT, oldEnabled = process.env.ENABLE_FILE_UPLOADS;
  process.env.UPLOAD_ROOT=root; process.env.ENABLE_FILE_UPLOADS='true';
  let savedKey = '';
  const query = async (sql: string, values: unknown[] = []) => {
    if(sql.includes('sha256=$2'))return {rows:[]};
    if(sql.includes('COUNT(*)'))return {rows:[{count:0}]};
    if(sql.includes('INSERT INTO work_assets')) {savedKey=String(values[4]);return {rows:[]};}
    return {rows:[{status:'draft',author_id:'user-a',title:'test'}]};
  };
  const service = new StudioService({query,transaction:async(fn:any)=>fn({query})} as any,{} as any);
  (service as any).autoModerateImageAsset = async()=>{throw new Error('audit unavailable');};
  try {
    await assert.rejects(service.uploadWorkAsset({id:'user-a'} as any,'work-a',{file:async()=>({fieldname:'file',filename:'test.png',mimetype:'image/png',file:Readable.from([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])])})} as any),/audit unavailable/);
    assert.equal((await readFile(path.join(root,savedKey))).length,8);
  } finally {
    if(oldRoot===undefined)delete process.env.UPLOAD_ROOT;else process.env.UPLOAD_ROOT=oldRoot;
    if(oldEnabled===undefined)delete process.env.ENABLE_FILE_UPLOADS;else process.env.ENABLE_FILE_UPLOADS=oldEnabled;
    await rm(root,{recursive:true,force:true});
  }
});

test('案例视频分类型限额、超限清理、伪装拒绝；其他上传保持 10 MiB', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'artedu-video-limits-'));
  const part = (size: number, type = 'video/mp4', header = '....ftypisom') => ({fieldname:'file',filename:'test.mp4',mimetype:type,file:Readable.from((function* () {
    yield Buffer.from(header); let left = size - header.length;
    while(left > 0) { const bytes = Math.min(left,65536); yield Buffer.alloc(bytes); left -= bytes; }
  })())}) as any;
  try {
    const policy = caseUploadPolicy();
    const video = await storePrivateUpload(part(11*1024*1024),root,undefined,'',policy.videoBytes);
    assert.equal(video.sizeBytes,11*1024*1024);
    await assert.rejects(storePrivateUpload(part(11*1024*1024),root),/10 MiB/);
    await assert.rejects(storePrivateUpload(part(policy.videoBytes+1),root,undefined,'',policy.videoBytes),/100 MiB/);
    await assert.rejects(storePrivateUpload(part(11*1024*1024,'image/png'),root,undefined,'',policy.videoBytes),/10 MiB/);
    await assert.rejects(storePrivateUpload(part(1024,'video/mp4','not-a-video'),root,undefined,'',policy.videoBytes),/不一致/);
    assert.equal((await readdir(root)).length,1);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('Fastify 单路由覆盖 multipart 上限，普通路由仍拒绝大文件', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'artedu-video-http-'));
  const app = Fastify();
  await app.register(multipart,{limits:{files:1,fileSize:10*1024*1024}});
  app.post('/case',async request => {
    const part = await request.file({limits:{fileSize:100*1024*1024}});
    return storePrivateUpload(part!,root,undefined,'',100*1024*1024);
  });
  app.post('/other',async request => storePrivateUpload((await request.file())!,root));
  const payload = Buffer.concat([Buffer.from('--boundary\r\nContent-Disposition: form-data; name="file"; filename="test.mp4"\r\nContent-Type: video/mp4\r\n\r\n....ftypisom'),Buffer.alloc(11*1024*1024),Buffer.from('\r\n--boundary--\r\n')]);
  try {
    const options = {method:'POST' as const,headers:{'content-type':'multipart/form-data; boundary=boundary'},payload};
    assert.equal((await app.inject({...options,url:'/case'})).statusCode,200);
    assert.notEqual((await app.inject({...options,url:'/other'})).statusCode,200);
  } finally { await app.close(); await rm(root,{recursive:true,force:true}); }
});

test("作品新分层与旧 UUID 路径均可读取；越权、穿越和丢失文件被拒绝", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-case-path-"));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    const file = () => ({fieldname:"file",filename:"case.pdf",mimetype:"application/pdf",file:Readable.from([Buffer.from("%PDF-1.7\n")])}) as any;
    const nested = await storePrivateUpload(file(), root, undefined, "users/student-a/works/work-a");
    const legacy = await storePrivateUpload(file(), root);
    assert.equal((await readFile(await resolveWorkAssetPath(root,nested.storageKey,"student-a","work-a"))).subarray(0,5).toString(), "%PDF-");
    await resolveWorkAssetPath(root,legacy.storageKey,"student-a","work-a");
    for (const key of ["../outside", "C:/outside", "/etc/passwd", nested.storageKey.replace("student-a","student-b"), nested.storageKey.replace("work-a","work-b"), nested.storageKey.replaceAll("/","\\"), "%2e%2e/file"]) {
      await assert.rejects(resolveWorkAssetPath(root,key,"student-a","work-a"));
    }
    const asset = {storage_key:nested.storageKey, file_name:"case.pdf", mime_type:"application/pdf", asset_type:"document", status:"draft", author_id:"student-a", moderation_status:"pending",story_json:{allowDocumentDownload:false}};
    const service = new StudioService({query: async () => ({rows:[asset]})} as any, {} as any);
    const owner = {id:"student-a",roles:["student"]} as any;
    const stranger = {id:"student-b",roles:["student"]} as any;
    await assert.rejects(service.openWorkAsset(stranger,"work-a","asset-a"), /无权/);
    const output = await service.openWorkAsset(owner,"work-a","asset-a");
    assert.ok(output.stream);
    const chunks = []; for await (const chunk of output.stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).subarray(0,5).toString(), "%PDF-");
    asset.status = "approved"; asset.moderation_status = "approved";
    await assert.rejects(service.openWorkAsset(stranger,"work-a","asset-a"), /未开放/);
    asset.story_json.allowDocumentDownload = true;
    const permitted = await service.openWorkAsset(stranger,"work-a","asset-a");
    assert.ok(permitted.stream);
    for await (const chunk of permitted.stream) assert.ok(chunk.length);
    await rm(await resolveWorkAssetPath(root,nested.storageKey,"student-a","work-a"));
    await assert.rejects(service.openWorkAsset(owner,"work-a","asset-a"), /不存在/);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_ROOT; else process.env.UPLOAD_ROOT = previous;
    await rm(root,{recursive:true,force:true});
  }
});

test("视频范围支持前向/后向/尾部读取，超大整数不溢出，非法或多范围回退完整响应", () => {
  assert.deepEqual(resolveByteRange(100), {status:200,length:100});
  for (const header of ['items=0-5','bytes=','bytes=-','bytes=8-2','bytes=0-1,4-5','bytes=abc-9']) {
    assert.equal(resolveByteRange(100,header).status,200);
  }
  assert.deepEqual(resolveByteRange(100,'bytes=20-29'),{status:206,start:20,end:29,length:10});
  assert.deepEqual(resolveByteRange(100,'bytes=90-'),{status:206,start:90,end:99,length:10});
  assert.deepEqual(resolveByteRange(100,'bytes=-10'),{status:206,start:90,end:99,length:10});
  assert.deepEqual(resolveByteRange(100,'bytes=-99999999999999999999'),{status:206,start:0,end:99,length:100});
  assert.deepEqual(resolveByteRange(100,'bytes=90-99999999999999999999'),{status:206,start:90,end:99,length:10});
  for (const header of ['bytes=100-','bytes=99999999999999999999-','bytes=-0']) assert.equal(resolveByteRange(100,header).status,416);
  assert.equal(resolveByteRange(0,'bytes=0-').status,416);
  assert.equal(resolveByteRange(0,'bytes=-5').status,416);
  assert.equal(resolveByteRange(0).status,200);
});

test("案例文件分段流字节准确；HEAD、416 不开流，Range 不能绕过审核和原件权限", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),'artedu-case-ranges-'));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    const bytes = Buffer.from('....ftypisom0123456789');
    const stored = await storePrivateUpload({fieldname:'file',filename:'case.mp4',mimetype:'video/mp4',file:Readable.from([bytes])} as any,root);
    const asset = {storage_key:stored.storageKey,file_name:'case.mp4',mime_type:'video/mp4',asset_type:'video',status:'approved',author_id:'owner',moderation_status:'approved',story_json:{allowDocumentDownload:false}};
    const service = new StudioService({query:async()=>({rows:[asset]})} as any,{} as any);
    const viewer = {id:'viewer',roles:['student']} as any;
    const app = Fastify();
    const controller = new StudioController({getActor:async()=>viewer} as any,service);
    app.setErrorHandler((error:any,_request,reply)=>reply.code(error.getStatus?.()??500).send({message:error.message}));
    app.head('/case',(request,reply)=>controller.headWorkAsset(request,reply,'work-a','asset-a'));
    app.get('/case',(request,reply)=>controller.downloadWorkAsset(request,reply,'work-a','asset-a'));
    try {
      const full = await app.inject('/case');
      assert.equal(full.statusCode,200); assert.deepEqual(full.rawPayload,bytes);
      assert.equal(full.headers['content-length'],String(bytes.length));
      assert.equal(full.headers['accept-ranges'],'bytes');
      assert.equal(full.headers['cache-control'],'private, no-store');
      assert.match(String(full.headers['content-disposition']),/^inline;/);
      const partial = await app.inject({url:'/case',headers:{range:'bytes=12-15'}});
      assert.equal(partial.statusCode,206); assert.equal(partial.headers['content-range'],`bytes 12-15/${bytes.length}`);
      assert.equal(partial.headers['content-length'],'4'); assert.deepEqual(partial.rawPayload,bytes.subarray(12,16));
      const tail = await app.inject({url:'/case',headers:{range:'bytes=-4'}});
      assert.equal(tail.statusCode,206); assert.deepEqual(tail.rawPayload,bytes.subarray(-4));
      const invalid = await app.inject({url:'/case',headers:{range:'bytes=999-'}});
      assert.equal(invalid.statusCode,416); assert.equal(invalid.headers['content-range'],`bytes */${bytes.length}`);
      assert.equal(invalid.rawPayload.length,0);
      const head = await app.inject({method:'HEAD',url:'/case',headers:{range:'bytes=12-15'}});
      assert.equal(head.statusCode,200); assert.equal(head.rawPayload.length,0); assert.equal(head.headers['content-length'],String(bytes.length));
      const fallback = await app.inject({url:'/case',headers:{range:'bytes=12-15','if-range':'"stale"'}});
      assert.equal(fallback.statusCode,200); assert.deepEqual(fallback.rawPayload,bytes);
      asset.status='draft';
      const denied=await app.inject({url:'/case',headers:{range:'bytes=999-'}});
      assert.equal(denied.statusCode,403); assert.equal(denied.headers['content-range'],undefined);
      asset.status='approved';
    } finally {await app.close();}
    for (const header of ['bytes=12-15','bytes=4-','bytes=-4','bytes=0-999']) {
      const result = await service.openWorkAsset(viewer,'work-a','asset-a',{range:header});
      assert.equal(result.range.status,206); assert.ok(result.stream);
      const chunks=[]; for await(const chunk of result.stream)chunks.push(chunk);
      if(result.range.status===206) assert.deepEqual(Buffer.concat(chunks),bytes.subarray(result.range.start,result.range.end+1));
    }
    const head = await service.openWorkAsset(viewer,'work-a','asset-a',{head:true,range:'bytes=999-'});
    assert.equal(head.range.status,200); assert.equal(head.range.length,bytes.length); assert.equal(head.stream,undefined);
    const unsatisfied = await service.openWorkAsset(viewer,'work-a','asset-a',{range:'bytes=999-'});
    assert.equal(unsatisfied.range.status,416); assert.equal(unsatisfied.stream,undefined);
    const ifRange = await service.openWorkAsset(viewer,'work-a','asset-a',{range:'bytes=12-15',ifRange:'"stale"'});
    assert.equal(ifRange.range.status,200); assert.ok(ifRange.stream);
    for await(const chunk of ifRange.stream)assert.ok(chunk.length);
    asset.status='draft';
    await assert.rejects(service.openWorkAsset(viewer,'work-a','asset-a',{range:'bytes=999-'}),/无权/);
    asset.status='approved'; asset.moderation_status='pending';
    await assert.rejects(service.openWorkAsset(viewer,'work-a','asset-a',{head:true}),/无权/);
    asset.moderation_status='approved'; asset.asset_type='document';
    await assert.rejects(service.openWorkAsset(viewer,'work-a','asset-a',{range:'bytes=0-3'}),/未开放/);
  } finally {
    if(previous===undefined)delete process.env.UPLOAD_ROOT;else process.env.UPLOAD_ROOT=previous;
    await rm(root,{recursive:true,force:true});
  }
});

test("上传文件按真实魔数识别，并拒绝伪装内容", () => {
  assert.equal(detectUploadMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectUploadMimeType(Buffer.from("%PDF-1.7\n", "ascii")), "application/pdf");
  assert.equal(detectUploadMimeType(Buffer.from("....ftypisom", "ascii")), "video/mp4");
  assert.equal(detectUploadMimeType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93])), "video/webm");
  assert.equal(detectUploadMimeType(Buffer.from("<script>alert(1)</script>", "utf8")), undefined);
  assert.equal(detectUploadMimeType(Buffer.from("RIFF0000WAVE", "ascii")), undefined);
});

test("课件新增类型：图片按魔数识别，HTML/SVG/CSS 需内容形态匹配", async () => {
  assert.equal(detectUploadMimeType(Buffer.from("GIF89a....", "ascii")), "image/gif");
  assert.equal(detectUploadMimeType(Buffer.from([0x42, 0x4d, 0x00, 0x00])), "image/bmp");
  // AVIF 与 MP4 共用 ftyp 容器：必须按 brand 区分，否则图片会被当成视频。
  assert.equal(detectUploadMimeType(Buffer.from("....ftypavif", "ascii")), "image/avif");
  assert.equal(detectUploadMimeType(Buffer.from("....ftypisom", "ascii")), "video/mp4");

  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-courseware-"));
  const part = (body: string | Buffer, filename: string, mimetype: string) => ({
    fieldname: "file", filename, mimetype, file: Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8")]),
  }) as any;
  try {
    const html = await storePrivateUpload(part("<!doctype html><div>课件</div>", "lesson.html", "text/html"), root, ["text/html"]);
    assert.equal(html.mimeType, "text/html");
    assert.equal(html.assetType, "web");
    assert.match(html.fileName, /\.html$/);

    const svg = await storePrivateUpload(part('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "icon.svg", "image/svg+xml"), root, ["image/svg+xml"]);
    assert.equal(svg.assetType, "image");

    const css = await storePrivateUpload(part("body { color: #111; }", "theme.css", "text/css"), root, ["text/css"]);
    assert.match(css.fileName, /\.css$/);

    // 内容与声明不符时一律拒绝：普通文本不能改名成 HTML 或 SVG 当页面托管。
    await assert.rejects(storePrivateUpload(part("just words", "lesson.html", "text/html"), root, ["text/html"]), /不一致/);
    await assert.rejects(storePrivateUpload(part("<!doctype html><div>x</div>", "icon.svg", "image/svg+xml"), root, ["image/svg+xml"]), /不一致/);
    await assert.rejects(storePrivateUpload(part("no braces here", "theme.css", "text/css"), root, ["text/css"]), /不一致/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("课程资料上传接受安全识别的 PDF、DOCX，并在拒绝时清理临时文件", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-upload-test-"));
  try {
    const pdf = {
      fieldname: "file",
      filename: "lesson.pdf",
      mimetype: "application/pdf",
      file: Readable.from([Buffer.from("%PDF-1.7\\n", "ascii")]),
    } as any;
    const stored = await storePrivateUpload(pdf, root, ["application/pdf"], "users/user-a/works/work-a");
    assert.equal(stored.mimeType, "application/pdf");
    assert.equal(stored.assetType, "document");
    assert.match(stored.storageKey, /^users\/user-a\/works\/work-a\/[a-f0-9-]{36}-[a-f0-9-]{36}$/i);
    assert.match((await readFile(path.join(root, ...stored.storageKey.split("/")))).toString("ascii"), /^%PDF-/);

    const docx = {
      fieldname: "file",
      filename: "lesson.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      file: Readable.from([Buffer.from("PK\x03\x04[Content_Types].xml word/document.xml", "latin1")]),
    } as any;
    const document = await storePrivateUpload(docx, root, ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
    assert.equal(document.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.match(document.fileName, /\.docx$/);

    const image = {
      fieldname: "file",
      filename: "not-a-course.pdf",
      mimetype: "image/png",
      file: Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    } as any;
    await assert.rejects(() => storePrivateUpload(image, root, ["application/pdf"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent 解析 Office 附件时拒绝超过解压上限的 ZIP 条目", () => {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(`<document>${"A".repeat(2 * 1024 * 1024 + 1)}</document>`, "utf8"));
  assert.throws(() => extractOfficeText(zip.toBuffer()), /过大的解压条目/);
});

 test('上传文件名保留中文并清除路径与危险字符', async () => {
 const { safeFileName } = await import('./private-upload');
 assert.equal(safeFileName('C:\\temp\\课程封面.jpg', 'image/png'), '课程封面.png');
 assert.equal(safeFileName('../课程:介绍.pdf', 'application/pdf'), '课程_介绍.pdf');
 });
