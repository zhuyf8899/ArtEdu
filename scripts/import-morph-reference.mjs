/** Import supplied v17 visual assets. Never execute its demo business/storage scripts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'admin-console/package.json'));
const postcss = require('postcss');
const source = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass the extracted v17 frontend directory');
const dest = path.join(root, 'admin-console/src/morph');
await fs.mkdir(dest, { recursive: true });
await fs.mkdir(path.join(root, 'admin-console/public/morph-v17'), { recursive: true });
await fs.cp(path.join(source, 'assets'), path.join(root, 'admin-console/public/morph-v17/assets'), { recursive: true, force: false });
// Namespace every original rule, including body/:root tokens. No source CSS can reach /admin.
for (const name of ['platform.css', 'dark-home.css', 'ui-system.css', 'gallery.css', 'account.css', 'curriculum.css']) {
  const ast = postcss.parse(await fs.readFile(path.join(source, name), 'utf8'));
  ast.walkDecls(d => { d.value = d.value.replace(/url\((["']?)assets\//g, 'url($1/morph-v17/assets/'); });
  ast.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map(s => {
      // Source body data selectors are mapped to the React shell's data-page attribute.
      s = s.replace(/^:root\b/, '.morph-v17').replace(/^body\b/, '.morph-v17');
      return s.startsWith('.morph-v17') ? s : `.morph-v17 ${s}`;
    });
  });
  await fs.writeFile(path.join(dest, `source-${name}`), `/* Supplied MORPH LAB v17; mechanically scoped by scripts/import-morph-reference.mjs. */\n${ast}`);
}
// Reuse the actual supplied starfield. Strip only demo composer handlers; add lifecycle cleanup.
let effect = await fs.readFile(path.join(source, 'dark-home.js'), 'utf8');
effect = effect.slice(0, effect.indexOf('let toastTimer;'));
effect = effect.replace("(()=>{'use strict';", "export function mountMorphCosmos(root) {\nconst controller = new AbortController();\nconst listen = (target, type, handler) => target.addEventListener(type, handler, {signal:controller.signal});");
effect = effect.replaceAll('document.querySelector', 'root.querySelector').replaceAll('document.getElementById(', 'root.querySelectorById(');
effect = effect.replaceAll('root.querySelectorById(', 'byId(');
effect = effect.replace('const hero=', "const byId = id => root.querySelector('#' + id);\nconst hero=");
effect = effect.replace("const hero=root.querySelector('.cosmos')", 'const hero=root');
effect = effect.replace("hero.addEventListener('pointermove',", "listen(hero,'pointermove',").replace("hero.addEventListener('pointerleave',", "listen(hero,'pointerleave',");
effect = effect.replace("document.addEventListener('visibilitychange',sync)", "listen(document,'visibilitychange',sync)");
effect = effect.replace("new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync()},{threshold:.02}).observe(hero)", "const observer = new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync()},{threshold:.02});observer.observe(hero)");
effect = effect.replace("reduced.addEventListener('change',", "listen(reduced,'change',").replace("addEventListener('resize',", "listen(window,'resize',");
effect += "\nresize();sync();\nreturn () => { controller.abort(); observer.disconnect(); clearTimeout(resizeTimer); cancelAnimationFrame(raf); byId('scene-next').onclick = null; };\n}\n";
await fs.writeFile(path.join(dest, 'cosmosEffect.js'), effect);
for (const [name, exported] of [['atomic','mountAtomic'],['network','mountNetwork'],['floating','mountFloating']]) {
  let script = await fs.readFile(path.join(source, `effects/${name}.js`), 'utf8');
  script = script.replace(/\(function\s*\(\)\s*\{|\(\(\)=>\{/, `export function ${exported}(root) {`);
  script = script.replace(/document\.getElementById\('([^']+)'\)/g, (_,id)=>`root.querySelector('#${id}')`);
  script = script.slice(0, script.lastIndexOf('})();'));
  if(name==='atomic') script = script.replace('window.destroyAtomicCodefield = function()', 'return function()').replace("window.addEventListener('pagehide',window.destroyAtomicCodefield);",'');
  if(name==='floating') script = script.replace('window.destroyMorphFloating=()=>', 'const destroy=()=>').replace("window.addEventListener('pagehide',window.destroyMorphFloating);resize();start();",'resize();start();return destroy;');
  if(name==='network') script = script.replace("window.addEventListener('pagehide',()=>{",'const destroy=()=>{').replace('});resize();start();','};resize();start();return destroy;');
  await fs.writeFile(path.join(dest, `${name}Effect.js`), script+'\n}\n');
}
console.log('Imported scoped CSS, supplied assets and cleanup-safe starfield. No demo data imported.');
