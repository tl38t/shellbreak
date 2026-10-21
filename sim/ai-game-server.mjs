import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
let latestAiStatus = null;
const maxStatusBytes = 16 * 1024;

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  if (pathname === '/__ai-status') {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
      const ageMs = latestAiStatus ? Date.now() - latestAiStatus.receivedAt : null;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        online: ageMs !== null && ageMs <= 5000,
        stale: ageMs === null || ageMs > 5000,
        ageMs,
        status: latestAiStatus,
      }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'GET, POST' }); res.end('Method not allowed'); return;
    }
    let body = '';
    let bodyBytes = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      bodyBytes += chunk.length;
      if (bodyBytes > maxStatusBytes) tooLarge = true;
      else if (!tooLarge) body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) { res.writeHead(413); res.end('Status payload too large'); return; }
      let status;
      try { status = JSON.parse(body); }
      catch { res.writeHead(400); res.end('Invalid JSON'); return; }
      if (!status || typeof status.running !== 'boolean' || !Number.isFinite(status.gameHours)
          || !Number.isFinite(status.era) || !Number.isFinite(status.techDone)
          || !Number.isFinite(status.techTotal) || !Number.isFinite(status.population)
          || !Number.isFinite(status.populationCap)) {
        res.writeHead(400); res.end('Invalid AI status'); return;
      }
      latestAiStatus = { ...status, receivedAt: Date.now() };
      res.writeHead(204); res.end();
    });
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filename, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    if (filename === path.join(root, 'index.html')) {
      data = Buffer.from(data.toString('utf8').replace('</body>', '<script src="src/ai-player.js?v=12"></script>\n</body>'), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
const port = Number(process.env.SB_AI_PORT || 4174);
server.listen(port, '127.0.0.1', () => console.log(`真实游戏 AI 页面：http://127.0.0.1:${port}/`));
