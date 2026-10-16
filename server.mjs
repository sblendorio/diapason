import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, errorResponse } from './api-handler.mjs';
import { createMemoryStore } from './rooms.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, 'dist');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export function createAppServer(store = createMemoryStore()) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      try {
        if (req.method === 'POST') {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 20000) throw new Error('Request too large.');
            chunks.push(chunk);
          }
          if (size) body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
        const result = await handleApi(req.method, url.pathname, body, req.headers['x-player-token'], store);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(JSON.stringify(result.data));
      } catch (error) {
        const result = errorResponse(error);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result.data));
      }
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!/^\/(?:index\.html|favicon(?:-32)?\.(?:svg|png)|apple-touch-icon\.png|(?:css|js)\/[\w.-]+)$/.test(path)) {
      res.writeHead(404); return res.end('Not found');
    }
    try {
      const file = await readFile(join(dist, path));
      res.writeHead(200, { 'Content-Type': (mime[extname(path)] || 'application/octet-stream') +
        (['.html', '.css', '.js'].includes(extname(path)) ? '; charset=utf-8' : ''),
        'X-Content-Type-Options': 'nosniff' });
      res.end(file);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = createAppServer().listen(port, '0.0.0.0', () =>
    process.stdout.write(`Diapason listening on ${port}\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
