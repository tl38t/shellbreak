// TapTap 小游戏 MCP stdio JSON-RPC 兜底客户端
// MCP 未挂载进会话时使用：node _tt-mcp.mjs list-tools | node _tt-mcp.mjs call <tool> <json>
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const SERVER = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/@taptap/instant-games-open-mcp/dist/server.js';
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe';

const child = spawn(NODE, [SERVER], {
  env: { ...process.env, TAPTAP_MCP_WORKSPACE_ROOT: 'D:/shellbreak' },
  stdio: ['pipe', 'pipe', 'inherit']
});

let id = 0;
const pending = new Map();
const rl = createInterface({ input: child.stdout });
let onLine = null;

rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    p(msg);
  } else if (onLine) {
    onLine(msg);
  }
});

function request(method, params) {
  return new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    const obj = { jsonrpc: '2.0', id: myId, method, params: params || {} };
    child.stdin.write(JSON.stringify(obj) + '\n');
  });
}

async function main() {
  const initResp = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'tt-cli', version: '1.0' }
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  if (!initResp || initResp.error) {
    console.error('initialize failed:', JSON.stringify(initResp));
    child.kill();
    process.exit(1);
  }

  const [cmd, toolName, argStr] = process.argv.slice(2);
  if (cmd === 'list-tools') {
    const r = await request('tools/list', {});
    const tools = (r.result && r.result.tools) || [];
    for (const t of tools) {
      console.log('• ' + t.name);
      if (t.description) console.log('    ' + t.description.replace(/\n/g, ' ').slice(0, 200));
      if (t.inputSchema && t.inputSchema.properties) {
        console.log('    params: ' + Object.keys(t.inputSchema.properties).join(', '));
      }
    }
    child.kill();
    process.exit(0);
  } else if (cmd === 'call') {
    let args = {};
    if (argStr) {
      try {
        const fs = await import('node:fs');
        if (fs.existsSync(argStr)) { args = JSON.parse(fs.readFileSync(argStr, 'utf8')); }
        else { args = JSON.parse(argStr); }
      } catch (e) {
        console.error('args JSON parse error:', e.message);
        child.kill(); process.exit(1);
      }
    }
    const r = await request('tools/call', { name: toolName, arguments: args });
    if (r.error) {
      console.error('TOOL ERROR:', JSON.stringify(r.error));
      child.kill(); process.exit(1);
    }
    const content = (r.result && r.result.content) || [];
    for (const c of content) {
      if (c.type === 'text') console.log(c.text);
      else console.log(JSON.stringify(c));
    }
    child.kill();
    process.exit(0);
  } else {
    console.error('usage: node _tt-mcp.mjs list-tools | call <tool> <json>');
    child.kill();
    process.exit(1);
  }
}

child.on('error', (e) => { console.error('spawn error:', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout waiting for MCP'); child.kill(); process.exit(1); }, 60000);
main();
