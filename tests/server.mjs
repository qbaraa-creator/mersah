// خادم ثابت للاختبارات فقط: يخدم جذر المستودع، ويحاكي نشر نسخة جديدة
// بتغيير CACHE_NAME داخل sw.js عبر /__test/sw-version?v=...
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 8095);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};
let swSuffix = '';

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/__test/sw-version') {
    swSuffix = url.searchParams.get('v') || '';
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  const relative = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  const filePath = join(root, relative);
  if (!filePath.startsWith(root) || filePath.split(sep).includes('node_modules')) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    let body = await readFile(filePath);
    if (relative === `${sep}sw.js` && swSuffix) {
      body = Buffer.from(body.toString('utf8').replace(/(const CACHE_NAME = `\$\{CACHE_PREFIX\}[^`]+)`/, `$1-${swSuffix}\``));
    }
    response.writeHead(200, {
      'Content-Type': types[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(port, '127.0.0.1');
