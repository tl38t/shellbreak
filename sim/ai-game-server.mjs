import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filename, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    if (filename === path.join(root, 'index.html')) {
      data = Buffer.from(data.toString('utf8').replace('</body>', '<script src="src/ai-player.js?v=3"></script>\n</body>'), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
const port = Number(process.env.SB_AI_PORT || 4174);
server.listen(port, '127.0.0.1', () => console.log(`真实游戏 AI 页面：http://127.0.0.1:${port}/`));
