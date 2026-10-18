// One-time normalization of the supplied HTML; safe to re-run on its output.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve('admin-console/public/morph');
for(const name of readdirSync(root).filter(n=>n.endsWith('.html'))) {
  if(name==='index-light.html') {writeFileSync(path.join(root,name),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=index.html"><title>MORPH LAB</title><a href="index.html">打开已接入的平台</a></html>');continue;}
  let source=readFileSync(path.join(root,name),'utf8');
  source=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>{
    const src=/\bsrc="([^"]+)"/.exec(tag)?.[1]||/data-visual-src="([^"]+)"/.exec(tag)?.[1];
    if(src&&/^(effects\/|dark-home\.js|gallery\.js)/.test(src))return `<script type="application/x-morph-visual" data-visual-src="${src}"></script>`;
    return '';
  });
  source=source.replace(/<html([^>]*)>/,(_,attrs)=>`<html${attrs.replace(/ class="[^"]*"/,'')} class="morph-loading">`);
  source=source.replace(/<link[^>]+href="connected\.css"[^>]*>/g,'');
  source=source.replace('</head>','<link rel="stylesheet" href="connected.css"><script type="module" src="connected.js"></script></head>');
  source=source.replaceAll('王婧','学习者');
  writeFileSync(path.join(root,name),source);
}
const homePath=path.join(root,'dark-home.js');let home=readFileSync(homePath,'utf8');
if(home.includes('let toastTimer;')){home=home.slice(0,home.indexOf('let toastTimer;'))+'resize();sync();\n})();\n';writeFileSync(homePath,home);}
console.log('MORPH HTML now loads authenticated business modules; visual effects preserved.');
