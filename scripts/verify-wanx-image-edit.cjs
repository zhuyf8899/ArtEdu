// Explicitly opt in: this script submits at most ONE billable image-edit task.
const path = require('node:path');
const {createRequire} = require('node:module');
const {mkdir,writeFile} = require('node:fs/promises');
const root = path.resolve(__dirname,'..');
const api = createRequire(path.join(root,'apps/api/package.json'));
api('dotenv').config({path:path.join(root,'apps/api/.env'),quiet:true});
const {PNG} = api('pngjs');
const {ModelRegistry} = require(path.join(root,'apps/api/dist/modules/generation/model-registry.js'));
async function main(){
 if(!process.argv.includes('--live'))throw Error('Pass --live to authorize one image-edit task.');
 const image = new PNG({width:512,height:512}),mask = new PNG({width:512,height:512});
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4,square=x>=150&&x<362&&y>=150&&y<362;
  image.data[i]=square?215:245;image.data[i+1]=square?45:240;image.data[i+2]=square?45:230;image.data[i+3]=255;
  mask.data[i]=mask.data[i+1]=mask.data[i+2]=0;mask.data[i+3]=square?0:255;
 }
 const encode=png=>`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
 const directory=path.join(root,'outputs/wanx-image-edit');await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'original.png'),PNG.sync.write(image));await writeFile(path.join(directory,'mask.png'),PNG.sync.write(mask));
 const started=Date.now();const registry=new ModelRegistry();
 const adapter=registry.getForJob({jobType:'image',imageEditing:true,requireConfigured:true});
 const output=await adapter.execute({jobType:'image',prompt:'把图片中央的红色正方形改为纯蓝色正方形，保持原有位置、大小和米白色背景。',imageEdit:{image:{dataUrl:encode(image),fileName:'original.png'},mask:{dataUrl:encode(mask),fileName:'mask.png'}},transient:true});
 const bytes=output.metadata?.bytes;if(!Buffer.isBuffer(bytes))throw Error('Expected in-memory image result');
 const resultPath=path.join(directory,'result.png');await writeFile(resultPath,bytes);
 const report={status:'succeeded',providerId:adapter.id,elapsedMs:Date.now()-started,fileSize:bytes.length,mimeType:output.mimeType,resultPath,submittedTasks:1};
 await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(JSON.stringify({status:'failed',name:error?.name,message:String(error?.message||'Failed')}));process.exitCode=1;});
