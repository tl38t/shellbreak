import fs from 'node:fs/promises';
import path from 'node:path';
process.env.CDP_PORT = '9339';
const { connect } = await import('../../../_cdp.mjs');

const targets = await (await fetch('http://127.0.0.1:9339/json/list')).json();
let page = targets.find(x => x.type === 'page' && x.url.includes('/index.html'));
if (!page) {
  const browser = await connect();
  await browser.send('Target.createTarget', { url: 'http://127.0.0.1:8768/index.html' });
  browser.close();
  await new Promise(resolve => setTimeout(resolve, 1800));
  const updated = await (await fetch('http://127.0.0.1:9339/json/list')).json();
  page = updated.find(x => x.type === 'page' && x.url.includes('/index.html'));
}
if (!page) throw new Error('Local game page was not found on CDP port 9339.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let commandId = 0;
const pending = new Map();
const frameWrites = [];
let frameCount = 0;
function rpc(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
socket.addEventListener('message', event => {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result || {});
    return;
  }
  if (message.method === 'Page.screencastFrame') {
    const data = message.params.data;
    const number = ++frameCount;
    frameWrites.push(fs.writeFile(path.join(framesDir, `frame-${String(number).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64')));
    rpc('Page.screencastFrameAck', { sessionId: message.params.sessionId }).catch(() => {});
  }
});

await rpc('Page.enable');
await rpc('Runtime.enable');
await rpc('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await rpc('Page.bringToFront').catch(() => {});
await rpc('Emulation.setDocumentVisibilityState', { visibilityState: 'visible' }).catch(() => {});
await new Promise(resolve => setTimeout(resolve, 1500));

await rpc('Runtime.evaluate', { expression: `(() => {
  if (!window.SB || !SB.game || !SB.aiStrategy) throw new Error('Game APIs did not load.');
  const style = document.createElement('style');
  style.textContent = 'html{scrollbar-width:none!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}';
  document.head.appendChild(style);
  SB.game.setSpeed(30);
  if (!window.SB.aiPlayer && !document.getElementById('promo-ai-player-script')) {
    const script = document.createElement('script');
    script.id = 'promo-ai-player-script';
    script.src = '/src/ai-player.js';
    document.head.appendChild(script);
  }
  return true;
})()` });
for (let attempt = 0; attempt < 50; attempt++) {
  const result = await rpc('Runtime.evaluate', { expression: "!!document.getElementById('ai-player-panel')", returnByValue: true });
  if (result.result?.value) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
await rpc('Runtime.evaluate', { expression: "document.getElementById('ai-player-panel')?.remove(); true", returnByValue: true });
await new Promise(resolve => setTimeout(resolve, 400));

const framesDir = path.join(process.env.TEMP || 'C:/Users/Administrator/AppData/Local/Temp', 'shellbreak-taptap-video-frames');
await fs.mkdir(framesDir, { recursive: true });
for (const entry of await fs.readdir(framesDir)) await fs.rm(path.join(framesDir, entry), { force: true });

const selectTab = tab => rpc('Runtime.evaluate', { expression: `(() => {
  const modal = document.getElementById('modal');
  if (modal && !modal.classList.contains('hidden')) {
    const enter = [...modal.querySelectorAll('button')].find(b => /进入科技页|继续|确认|知道了/.test(b.innerText || ''));
    if (enter) enter.click();
  }
  const panel = document.getElementById('ai-player-panel');
  if (panel) panel.remove();
  SB.game.setTab(${JSON.stringify(tab)});
  return true;
})()` }).catch(() => {});
await selectTab('village');
await rpc('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 });
const schedule = [
  [6500, 'folk'],
  [13000, 'tech'],
  [20000, 'village'],
];
for (const [at, tab] of schedule) setTimeout(() => { selectTab(tab); console.log('Recording section:', tab); }, at);
const durationMs = 26000;
for (let elapsed = 0; elapsed < durationMs; elapsed += 5000) {
  await new Promise(resolve => setTimeout(resolve, Math.min(5000, durationMs - elapsed)));
  console.log(`Screencast ${(elapsed + 5000) / 1000}s, frames=${frameCount}`);
}
await rpc('Page.stopScreencast');
await new Promise(resolve => setTimeout(resolve, 800));
await Promise.all(frameWrites);
const finalState = await rpc('Runtime.evaluate', { expression: `(() => { const s = SB.game.run(); return {time:Math.round(s.t), population:s.pop, techs:Object.keys(s.techs||{}).filter(k=>s.techs[k]).length}; })()`, returnByValue: true });
console.log('Video source frames ready:', JSON.stringify({ framesDir, frameCount, finalState: finalState.result?.value }));
socket.close();
