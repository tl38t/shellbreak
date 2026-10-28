/* 极简 CDP 客户端（支持 >64KB 的 64 位长度帧）。可复用。 */
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';

const PORT = process.env.CDP_PORT || 9333;
const CDP = `http://127.0.0.1:${PORT}`;

function httpJson(p) {
  return new Promise((res, rej) => {
    http.get(CDP + p, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

export async function connect(opts) {
  // opts: 字符串 ws-url（直接连某 target 自己的 webSocketDebuggerUrl，可调用 Runtime 等），或省略（默认连 browser /json/version）。
  const wsUrl = (typeof opts === 'string') ? opts
    : (opts && opts.url) ? opts.url
    : (await httpJson('/json/version')).webSocketDebuggerUrl;
  const u = new URL(wsUrl);
  const key = crypto.randomBytes(16).toString('base64');
  const sock = net.connect(Number(u.port), u.hostname);
  await new Promise(r => sock.once('connect', r));
  sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  await new Promise(r => { let b = ''; sock.on('data', function h(c) { b += c; if (b.includes('\r\n\r\n')) { sock.removeListener('data', h); r(); } }); });

  let buf = Buffer.alloc(0);
  const waiters = new Map();
  /* 事件帧（无 id、只有 method）原先被直接丢弃，探针拿不到控制台报错 / 未捕获异常。
   * 这里补一个最小订阅通道：on(method, fn)。只做增量，不影响原有 send/evaluate。 */
  const listeners = new Map();
  let id = 0;
  sock.on('data', c => {
    buf = Buffer.concat([buf, c]);
    while (true) {
      if (buf.length < 2) break;
      const op = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) break;
      const pay = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (op === 1) {
        let msg; try { msg = JSON.parse(pay.toString()); } catch (e) { continue; }
        const w = waiters.get(msg.id);
        if (w) { waiters.delete(msg.id); w(msg); continue; }
        if (msg.method) {
          const fns = listeners.get(msg.method);
          if (fns) for (const fn of fns) { try { fn(msg.params || {}); } catch (e) {} }
        }
      }
    }
  });

  function send(method, params = {}, sessionId) {
    return new Promise(res => {
      const i = ++id;
      // ⚠️ 扁平会话（flatten:true）下 sessionId 必须是**消息顶层字段**，放进 params 会报
      //"'Runtime.evaluate' wasn't found"。
      const m = JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params });
      waiters.set(i, res);
      const p = Buffer.from(m);
      const mask = crypto.randomBytes(4);
      let hdr;
      if (p.length < 126) hdr = Buffer.from([0x81, 0x80 | p.length]);
      else if (p.length < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(p.length, 2); }
      else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(p.length), 2); }
      const masked = Buffer.alloc(p.length);
      for (let k = 0; k < p.length; k++) masked[k] = p[k] ^ mask[k % 4];
      sock.write(Buffer.concat([hdr, mask, masked]));
    });
  }

  async function evaluate(expression, awaitPromise = true, sessionId) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
    if (r.error) throw new Error('CDP ' + JSON.stringify(r.error).slice(0, 400));
    const rr = r.result || {};                 // { result: RemoteObject, exceptionDetails }
    if (rr.exceptionDetails) throw new Error(JSON.stringify(rr.exceptionDetails).slice(0, 800));
    const ro = rr.result;
    return ro ? ro.value : undefined;
  }

  function on(method, fn) {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  }

  return { send, evaluate, on, close: () => sock.end() };
}
