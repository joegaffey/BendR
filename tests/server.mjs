// Minimal dependency-free static file server for the test suite.
// Serves the repository root so both the app (/web/index.html) and the test
// harness (/tests/harness/...) are reachable from one origin.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  let filePath = join(root, normalize(urlPath));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404);
      res.end('not found');
    });
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    });
    stream.pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BendR test server on http://127.0.0.1:${port} (root: ${root})`);
});
