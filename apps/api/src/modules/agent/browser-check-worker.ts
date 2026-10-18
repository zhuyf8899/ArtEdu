import http from 'node:http';
import { renderPage } from './agent-browser-check';

// Isolated renderer: no DB, credentials, upload volumes, public port or egress.
export function allowedCheckUrl(value: unknown) {
  if (typeof value !== 'string') throw Error('Missing URL');
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== 'api' || url.username || url.password || !/^\d+$/.test(url.port) || Number(url.port)<1024 || url.search || url.hash || !/^\/[0-9a-f-]{36}\//i.test(url.pathname)) throw Error('Invalid asset endpoint');
  return { url: url.href, prefix: url.origin + '/' + url.pathname.split('/')[1] + '/' };
}

export function startBrowserCheckWorker() {
  if (process.platform !== 'linux' || process.getuid?.() === 0 || process.env.ISOLATED_PAGE_CHECK_WORKER !== '1') throw Error('Renderer must run as an isolated non-root container');
  let active = false;
  return http.createServer(async (request, response) => {
    if(request.url==='/health'&&request.method==='GET'){response.end('ok');return;}
    if(request.method!=='POST'||request.url!=='/check'){response.writeHead(404).end();return;}
    if(active){response.writeHead(503).end('Renderer busy');return;}
    active=true;
    try {
      const chunks:Buffer[]=[]; let size=0;
      for await(const chunk of request){size+=chunk.length;if(size>4096)throw Error('Request too large');chunks.push(chunk);}
      const input=allowedCheckUrl(JSON.parse(Buffer.concat(chunks).toString()).url);
      const result=await renderPage(input.url,input.prefix);
      response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result));
    } catch {response.writeHead(400).end('Invalid check request');}
    finally {active=false;}
  }).listen(8080,'0.0.0.0');
}
if(require.main===module)startBrowserCheckWorker();
