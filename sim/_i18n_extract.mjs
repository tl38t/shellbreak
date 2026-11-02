/* 天壳 / SHELLBREAK — 全量玩家可见文本抽取器（本地化基线 / 泄漏扫描两用）。
 *
 * 产出 sim/_i18n_texts.json，字段见文件末尾 ROWS 说明。两条独立通路：
 *   通路 A「数据表」：用 sim/load-sb.mjs 真加载游戏，遍历 SB 上 20 张内容表，
 *                     按字段取文本 → 带 table / entityId / field，是本地化主键的来源。
 *   通路 B「字面量」：对 src/**\/*.js + index.html + src/ui/*.html 做字符级扫描，
 *                     **先剥注释再取字符串**（否则源码注释里的开发黑话会污染扫描，
 *                     见 docs/JUDGMENTS.md 的「静态扫雷必须先剥注释」判据），
 *                     抓渲染层写死的 UI 文案与 HTML 文本节点。
 *
 * 只抽文本，不改任何数值。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadNoDom, ROOT } from './load-sb.mjs';

const sandbox = {
  console,
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {}, body: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => 0 },
  setInterval() {}, clearInterval() {},
};
const { SB } = loadNoDom(sandbox);

/* ══ 1. 字段口径 ══════════════════════════════════════════════
 * VISIBLE  = 玩家看得见的字段；INTERNAL = 源码内部批注（note 之类，按记忆纪律不算文案）；
 * 其余字符串键只要不在 STRUCT_BLACK 里，一律按「待判定」收进来 —— 宁可多收也不静默漏。 */
const VISIBLE = new Set(['name', 'desc', 'flavor', 'effectDesc', 'unlockDesc', 'tip', 'hint',
  'label', 'outLabel', 'title', 'subtitle', 'motto', 'short', 'text', 'msg', 'quote', 'story', 'brief', 'unit']);
const INTERNAL = new Set(['note', 'note2', 'notes', 'comment', 'dev', 'internal', 'todo', 'memo']);
const STRUCT_BLACK = new Set(['id', 'icon', 'img', 'src', 'css', 'cls', 'class', 'color', 'glyph',
  'era', 'branch', 'gov', 'civic', 'need', 'res', 'type', 'key', 'slot', 'slots', 'subtree',
  'target', 'zone', 'retiredBy', 'cond', 'eff', 'effect', 'cost', 'reqs', 'capEra', 'capMul',
  'bonus', 'in', 'out', 'ratio', 'apply', 'kind', 'n', 'costStep', 'give', 'layer', 'mult',
  'storageEra', 'defaultUnlockable', 'requiredTech', 'requiredCivic', 'needCivic', 'unlockScheme']);

const TABLES = [
  ['TIDE_TREE', 'list'], ['STAR_PERKS', 'list'], ['JOBS', 'list'], ['TOOLS', 'list'],
  ['SEASONS', 'list'], ['CRAFTS', 'list'], ['UPGRADES', 'list'], ['WONDERS', 'list'],
  ['BUILDINGS', 'list'], ['BUILD_ZONES', 'list'], ['COMPANY_TIERS', 'list'], ['COMPANIES', 'list'],
  ['ERAS', 'list'], ['TECHS', 'list'], ['BRANCHES', 'list'], ['CIVICS', 'list'],
  ['GOVS', 'list'], ['POLICIES', 'list'], ['RESS', 'dict'], ['UNIT', 'dict'],
];
/* 表名 → 中文（本地化时便于人工按类目分工） */
const TABLE_CN = {
  TIDE_TREE: '潮纹天赋树', STAR_PERKS: '星空特权', JOBS: '职业', TOOLS: '工坊工具',
  SEASONS: '季节', CRAFTS: '工坊制造', UPGRADES: '工坊升级', WONDERS: '奇观',
  BUILDINGS: '建筑', BUILD_ZONES: '建筑分区', COMPANY_TIERS: '公司层级', COMPANIES: '公司',
  ERAS: '纪元', TECHS: '科技', BRANCHES: '科技分支', CIVICS: '市政', GOVS: '政体',
  POLICIES: '政策卡', RESS: '资源', UNIT: '单位',
};

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const rows = [];
let seq = 0;
function add(o) {
  if (typeof o.zh !== 'string') return;
  o.zh = o.zh.replace(/\s+/g, ' ').trim();
  if (!o.zh) return;
  rows.push({ seq: ++seq, en: '', ...o });
}

/* ══ 通路 A：数据表 ══════════════════════════════════════════ */
for (const [tname, kind] of TABLES) {
  const src = SB[tname];
  if (!src) { console.warn('缺表:', tname); continue; }
  const items = kind === 'list'
    ? src.map((v, i) => [v && (v.id || String(i)), v])
    : Object.keys(src).map((k) => [k, src[k]]);
  for (const [eid, item] of items) {
    if (!item || typeof item !== 'object') continue;
    if (kind === 'dict' && typeof item !== 'object') continue;
    const ename = item.name || '';
    for (const f of Object.keys(item)) {
      const v = item[f];
      if (typeof v === 'string') {
        if (STRUCT_BLACK.has(f)) continue;
        if (!CJK.test(v)) continue;                      // 纯 id / 英文键不收
        const surface = VISIBLE.has(f) ? '玩家可见' : INTERNAL.has(f) ? '内部批注' : '待判定';
        add({ key: `${tname}.${eid}.${f}`, scope: '数据表', table: tname, tableCn: TABLE_CN[tname] || tname,
          entityId: String(eid), entityName: ename, field: f, zh: v, surface });
      } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        v.forEach((s, i) => {
          if (!CJK.test(s)) return;
          add({ key: `${tname}.${eid}.${f}[${i}]`, scope: '数据表', table: tname, tableCn: TABLE_CN[tname] || tname,
            entityId: String(eid), entityName: ename, field: `${f}[${i}]`, zh: s,
            surface: VISIBLE.has(f) ? '玩家可见' : '待判定' });
        });
      }
    }
    // dict 表（RESS / UNIT）的值本身就是「名称」这类标量
    if (kind === 'dict') {
      for (const f of Object.keys(item)) {
        const v = item[f];
        if (typeof v === 'string' && CJK.test(v) && !STRUCT_BLACK.has(f)) {
          const surface = VISIBLE.has(f) ? '玩家可见' : INTERNAL.has(f) ? '内部批注' : '待判定';
          add({ key: `${tname}.${eid}.${f}`, scope: '数据表', table: tname, tableCn: TABLE_CN[tname] || tname,
            entityId: String(eid), entityName: ename, field: f, zh: v, surface });
        } else if (typeof v === 'string' && CJK.test(v) && !Object.keys(item).length) {
          // UNIT 这类 { resKey: '个' } 的纯标量表
          add({ key: `${tname}.${eid}`, scope: '数据表', table: tname, tableCn: TABLE_CN[tname] || tname,
            entityId: String(eid), entityName: '', field: 'unit', zh: v, surface: '玩家可见' });
        }
      }
    }
  }
}
/* UNIT / RESS 是「键 → 标量」还是「键 → 对象」两种形态都要覆盖 */
for (const tname of ['RESS', 'UNIT']) {
  const d = SB[tname];
  if (!d) continue;
  for (const k of Object.keys(d)) {
    const v = d[k];
    if (typeof v === 'string' && CJK.test(v)) {
      add({ key: `${tname}.${k}`, scope: '数据表', table: tname, tableCn: TABLE_CN[tname] || tname,
        entityId: k, entityName: '', field: 'name', zh: v, surface: '玩家可见' });
    }
  }
}

/* ══ 通路 B：源码字面量（剥注释） ═════════════════════════════ */
const REGEX_OK_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
  'instanceof', 'do', 'else', 'yield', 'await', 'throw']);

function lineStarts(s) {
  const out = [0];
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') out.push(i + 1);
  return out;
}
function lineOf(ls, idx) {
  let lo = 0, hi = ls.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ls[mid] <= idx) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
function unescape(raw) {
  try { return JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"'); }
  catch (e) { return raw.replace(/\\(['"`\\nrt])/g, (_m, c) => ({ n: '\n', r: '\r', t: '\t' }[c] || c)); }
}

/** 字符级扫描：跳过注释 / 正则，收集字符串字面量（含模板串里的 ${} 表达式递归）。 */
function scanJs(src, rel, lineOffset = 0, bufOut) {
  const ls = lineStarts(src);
  const n = src.length;
  let i = 0, prevSig = '', prevWord = '';
  const emit = (text, start, end, quote) => {
    const line = lineOf(ls, start) + lineOffset;
    bufOut.push({ text, line, start, end, quote, src });
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n' || c === '\r' || c === ' ' || c === '\t') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1, raw = '';
      while (j < n) {
        const d = src[j];
        if (d === '\\') { raw += d + (src[j + 1] || ''); j += 2; continue; }
        if (d === q || d === '\n') break;
        raw += d; j++;
      }
      emit(unescape(raw), i, Math.min(j + 1, n), q);
      i = j + 1; prevSig = q; prevWord = ''; continue;
    }
    if (c === '`') {
      let j = i + 1, raw = '', start = i;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { raw += d + (src[j + 1] || ''); j += 2; continue; }
        if (d === '`') break;
        if (d === '$' && src[j + 1] === '{') {           // 递归扫 ${} 里的表达式
          let depth = 1, k = j + 2, expr = '';
          while (k < n && depth > 0) {
            const e = src[k];
            if (e === '{' && src[k - 1] === '$') { depth++; expr += e; k++; continue; }
            if (e === '}') { depth--; if (depth === 0) break; }
            expr += e; k++;
          }
          const innerOffset = lineOf(ls, j) - 1;
          scanJs(expr, rel, lineOffset + innerOffset, bufOut);
          raw += '${…}'; j = k + 1; continue;
        }
        raw += d; j++;
      }
      emit(raw.replace(/\n\s*/g, ' '), start, Math.min(j + 1, n), '`');
      i = j + 1; prevSig = '`'; prevWord = ''; continue;
    }
    if (c === '/' && (prevSig === '' || '(=:,!&|?{};+-*%~^<>'.includes(prevSig) || REGEX_OK_AFTER.has(prevWord))) {
      let j = i + 1, inCls = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inCls = true;
        else if (d === ']') inCls = false;
        else if (d === '/' && !inCls) break;
        else if (d === '\n') break;
        j++;
      }
      i = j + 1; prevSig = '/'; prevWord = ''; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      prevWord = src.slice(i, j); prevSig = 'w'; i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i; while (j < n && /[0-9.]/i.test(src[j])) j++;
      prevSig = '0'; prevWord = ''; i = j; continue;
    }
    prevSig = c; prevWord = ''; i++;
  }
  return bufOut;
}

function moduleOf(rel) {
  if (rel.startsWith('src/ui/')) return '渲染层';
  if (/^src\/(config|techs|civics-data|companies|challenges|achv|events)/.test(rel)) return '内容表';
  if (/^src\/ai-/.test(rel)) return 'AI';
  return '玩法逻辑';
}
const DATA_FILES = /^src\/(config[^/]*|techs|civics-data|companies|challenges|achv|events)\.js$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const allFiles = [
  'index.html',
  ...walk(path.join(ROOT, 'src')).map((p) => path.relative(ROOT, p).replace(/\\/g, '/')),
].filter((p) => /\.(js|html)$/.test(p));

const dataTexts = new Map();          // 文本 → 数据表 key（用于标「同源」）
for (const r of rows) if (!dataTexts.has(r.zh)) dataTexts.set(r.zh, r.key);

for (const rel of allFiles) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const mod = moduleOf(rel);
  const lit = [];
  if (rel.endsWith('.js')) {
    scanJs(src, rel, 0, lit);
  } else {
    // HTML：文本节点 + title/placeholder/alt + 内联 script（内联 script 走 JS 扫描器）
    const noStyle = src.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(src))) {
      const off = (src.slice(0, m.index).match(/\n/g) || []).length;
      if (!/\ssrc=/.test(m[1])) scanJs(m[2], rel, off, lit);
    }
    const body = noStyle.replace(/<script[\s\S]*?<\/script>/gi, '');
    const tn = />([^<>]*)</g;
    while ((m = tn.exec(body))) {
      if (!CJK.test(m[1])) continue;
      const t = m[1].replace(/\s+/g, ' ').trim();
      if (!t) continue;
      lit.push({ text: t, line: (body.slice(0, m.index).match(/\n/g) || []).length + 1, html: true, src: body });
    }
    const at = /(?:title|placeholder|alt|aria-label)="([^"]*)"/g;
    while ((m = at.exec(body))) {
      if (!CJK.test(m[1])) continue;
      lit.push({ text: m[1], line: (body.slice(0, m.index).match(/\n/g) || []).length + 1, attr: true, src: body });
    }
  }

  for (const L of lit) {
    const zh = (L.text || '').replace(/\s+/g, ' ').trim();
    if (!zh || !CJK.test(zh)) continue;
    // 上下文取证：同往前 60 字符内有没有 console./debug( → 判为控制台内部串
    const before = (L.src || '').slice(Math.max(0, (L.start ?? 0) - 60), L.start ?? 0);
    const after = (L.src || '').slice((L.end ?? 0), (L.end ?? 0) + 12);
    const isConsole = /console\.(log|warn|error|info|debug)|\[(调试|诊断|探针)|debug\(/.test(before);
    let entityId = '';
    if (DATA_FILES.test(rel) && typeof L.start === 'number') {
      const head = (L.src || '').slice(Math.max(0, L.start - 1200), L.start);
      const ids = [...head.matchAll(/\bid:\s*['"]([A-Za-z0-9_]+)['"]/g)];
      if (ids.length) entityId = ids[ids.length - 1][1];
    }
    const dup = dataTexts.get(zh);
    let surface = mod === '渲染层' ? '玩家可见' : mod === 'AI' ? '内部(AI)' : mod === '内容表' ? '数据表字面量' : '待判定';
    if (isConsole) surface = '内部(控制台)';
    add({
      key: `ui.${rel.replace(/[^A-Za-z0-9]/g, '_')}.${L.line}`,
      scope: L.html ? 'HTML文本' : L.attr ? 'HTML属性' : '代码字面量',
      table: mod, tableCn: mod, entityId, entityName: '',
      field: L.html ? 'text' : L.attr ? 'attr' : '字面量',
      zh, surface, file: rel, line: L.line,
      flags: [
        /<[A-Za-z/]/.test(zh) ? '含HTML标签' : '',
        /\$\{|%s|%d|\{0\}|\{\{/.test(zh) ? '含插值占位符' : '',
        /^\s*\+/.test(after) ? '拼接片段' : '',
        dup ? `同源:${dup}` : '',
      ].filter(Boolean).join('、'),
    });
  }
}

/* ══ 2. HTML 片段拆分 ══════════════════════════════════════════
 * 渲染层大量写死 '<div class="nm">10 轮回点 → 1 星屑</div>' —— 标签和中文混在一条串里，
 * 这种原文丢给翻译没法用。这里把标签之间的中文文本节点与 title/placeholder 属性拆成子行，
 * 父行降级标记为「结构(含标签)」，子行才是可翻译单元。 */
const extra = [];
for (const r of rows) {
  if (!/[<>]/.test(r.zh) || r.scope === 'HTML文本') continue;
  const seg = [];
  let m;
  const nodeRe = /(?:^|>)([^<>]*)(?:<|$)/g;
  while ((m = nodeRe.exec(r.zh))) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && CJK.test(t)) seg.push(t);
  }
  const attrRe = /(?:title|placeholder|alt)="([^"]*)"/g;
  while ((m = attrRe.exec(r.zh))) { const t = m[1].trim(); if (t && CJK.test(t)) seg.push(t); }
  seg.forEach((s, i) => extra.push({
    ...r, key: `${r.key}#s${i + 1}`, field: 'HTML文本片段', zh: s,
    flags: (r.flags ? r.flags + '、' : '') + 'HTML片段',
    surface: (r.surface === '内部(控制台)' || r.surface === '内部(AI)') ? r.surface : '玩家可见',
  }));
  r.flags = (r.flags ? r.flags + '、' : '') + '原串含标签';
  if (seg.length) r.surface = '结构(含标签,见子行)';
}
rows.push(...extra);
rows.sort((a, b) => (a.scope + a.table + a.key).localeCompare(b.scope + b.table + b.key));
rows.forEach((r, i) => { r.seq = i + 1; });

fs.writeFileSync(path.join(ROOT, 'sim', '_i18n_texts.json'),
  JSON.stringify({ generated: new Date().toISOString(), count: rows.length, rows }, null, 1));

const byScope = {}, bySurface = {};
for (const r of rows) { byScope[r.scope] = (byScope[r.scope] || 0) + 1; bySurface[r.surface] = (bySurface[r.surface] || 0) + 1; }
console.log('rows:', rows.length);
console.log('scope:', JSON.stringify(byScope));
console.log('surface:', JSON.stringify(bySurface));
console.log('files scanned:', allFiles.length);
