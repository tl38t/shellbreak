/* 天壳 / SHELLBREAK — 兑换码（本地礼包码）
 *
 * ── 2026-11-07：TapTap TDS 平台兑换通道已整体下线 ────────────────────────────
 *   当前只保留本地礼包码，平台通道不再使用。
 *   ⚠️ 代价：后台已上架的礼包活动「深海补偿1030」（通兑码 / 总 500）随之作废。
 *
 *   本文件只走 `CFG.REDEEM.LOCAL_GRANTS` 配的码：
 *   normalize → 查表 → 命中直接入账，全程在本机完成。`platformReady()` 刻意保留
 *   但恒为 false，`api` 导出刻意保留但为空串 —— 两个都是回归用来钉死
 *   「平台通道没有偷偷复活」的锚点。
 *
 *   ⚠️ 若日后要恢复平台通道，必须**同时**恢复四处，缺一就是残功能：
 *     ① 本文件的平台校验段（签名 / 超时 / 错误码映射 / characterId）；
 *     ② `CFG.REDEEM.CLIENT_ID` 与 `ACTIVITY_ID`（当前刻意留空）；
 *     ③ `sim/e2e-suites/redeem.mjs` 的平台套件；
 *     ④ `_repack.py` 与 `sim/probe_no_network.mjs` 的静态锁（否则封包会直接失败）。
 *
 * ── 本地礼包码（2026-11-04 新增，现为唯一通道）────────────────────────────────
 *   命中即本地入账。用途是「改一处配置就能发」的临时福利，
 *   不必等后台建活动、填 ACTIVITY_ID。两种奖励可同时给：
 *     tide（轮回点，必须走 credit 维护定损方程）、stardust（星屑，只加余额）。
 *   ⚠️ 明文 code 写在包里 = 解包可见 = 全服可领；只给某一个人的码必须换成 h（sha1）。
 *   生成：`node tmp/_mkcode.mjs <你的码>`。
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var CFG = SB.CFG || {};

  function tr(key, params, fallback) {
    var value = SB.i18n && SB.i18n.t ? SB.i18n.t(key, params) : '';
    if (value) return value;
    return String(fallback == null ? '' : fallback).replace(/\{([^{}]+)\}/g, function (match, name) {
      return params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
    });
  }
  function htmlText(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rc() { return (CFG.REDEEM || {}); }

  /* ⚠️ 平台通道已下线（2026-11-07）。恒 false，与 CLIENT_ID / ACTIVITY_ID 的内容无关：
   *   即使有人把那两个 ID 填回去，也绝不会重新发出请求。保留函数供回归钉死这一点。 */
  function platformReady() { return false; }
  /* 面板/入口是否可用 = 至少配了一个本地码。 */
  function ready() { return localGrants().length > 0; }
  function rewardNum() {
    var n = Number(rc().REWARD_NUM);
    return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
  }

  /* ── 本地礼包码 ────────────────────────────────────────────────────────────
   * 匹配口径：去空格/连字符/下划线，大小写不敏感（走 dedupeKey）。
   * 两种存法：code 明文（好改，但包是明文 JS ⇒ 解包可见 = 全服可领）、
   *          h = sha1('sb:' + 大写码)（包里只有哈希，看不到码）。
   * 哈希生成：`node tmp/_mkcode.mjs <你的码>`。 */
  function localGrants() {
    var arr = rc().LOCAL_GRANTS;
    if (!arr || Object.prototype.toString.call(arr) !== '[object Array]') return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var g = arr[i];
      if (!g || typeof g !== 'object') continue;
      var tide = Math.floor(Number(g.tide) || 0), star = Math.floor(Number(g.stardust) || 0);
      if (!(tide > 0) && !(star > 0)) continue;   /* 空奖励项一律忽略，不发空气 */
      out.push({
        h: g.h ? String(g.h).toLowerCase() : '',
        code: g.code ? dedupeKey(String(g.code)) : '',
        tide: Math.max(0, tide), stardust: Math.max(0, star),
        label: String(g.label || tr('redeem.item.generic.name', null, '礼包'))
      });
    }
    return out;
  }
  function localHash(key) { return sha1('sb:' + String(key || '').toUpperCase()); }
  /* key 必须是 dedupeKey() 归一化后的**大写**串。 */
  function findLocal(key) {
    var list = localGrants(), hk = null;
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (g.h) { if (hk === null) hk = localHash(key); if (hk === g.h) return g; }
      else if (g.code && g.code === key) return g;
    }
    return null;
  }

  /* ── SHA-1（纯 JS）───────────────────────────────────────────────────────
   * 不用 crypto.subtle：它异步、且非安全上下文（file:// / 普通 http）下不可用，
   * 小游戏容器里也不保证有。这里只要 40 字节的摘要，自己算最稳。
   * ⚠️ 平台签名删了，但本地码的哈希校验仍依赖它，不许一起删。
   * 自测：sha1('abc') === 'a9993e364706816aba3e25717850c26c9cd0d89d' */
  function sha1(msg) {
    function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
    function toBytes(str) {
      var out = [], i, c;
      for (i = 0; i < str.length; i++) {
        c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        else {
          i++;
          c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
          out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
      }
      return out;
    }
    var bytes = toBytes(String(msg)), bits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0);                                  /* 高 32 位恒 0（消息不会到 4GB） */
    bytes.push((bits >>> 24) & 0xff, (bits >>> 16) & 0xff, (bits >>> 8) & 0xff, bits & 0xff);

    var H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0], w = new Array(80);
    for (var i = 0; i < bytes.length; i += 64) {
      for (var j = 0; j < 16; j++) {
        w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
      }
      for (j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      var a = H[0], b = H[1], c2 = H[2], d = H[3], e = H[4], f, k, t;
      for (j = 0; j < 80; j++) {
        if (j < 20) { f = (b & c2) | (~b & d); k = 0x5a827999; }
        else if (j < 40) { f = b ^ c2 ^ d; k = 0x6ed9eba1; }
        else if (j < 60) { f = (b & c2) | (b & d) | (c2 & d); k = 0x8f1bbcdc; }
        else { f = b ^ c2 ^ d; k = 0xca62c1d6; }
        t = (rotl(a, 5) + f + e + k + w[j]) | 0;
        e = d; d = c2; c2 = rotl(b, 30); b = a; a = t;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c2) | 0;
      H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0;
    }
    var out = '';
    for (i = 0; i < 5; i++) out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
  }

  /* ── 入账 ────────────────────────────────────────────────────────────────
   * ⚠️⚠️ 必须**同时**写 tide 与 tideEarnedTotal，这是补偿最容易被漏掉的一步。
   *   定损方程（见 tmp/_probe_tide_audit.mjs / docs/JUDGMENTS.md）是
   *     tide = tideEarnedTotal − spent + 10M
   *   只加 tide 不加 earned ⇒ 方程失衡 ⇒ 下次对账把「补偿」算成「又丢了 N 点」
   *   ⇒ 重复补偿、且一旦发给玩家就不可回收。 */
  function credit(m, n) {
    m.tide = (m.tide || 0) + n;
    m.tideEarnedTotal = (m.tideEarnedTotal || 0) + n;
    m.compensationTotal = (m.compensationTotal || 0) + n;
  }

  /* ── 星屑入账 ────────────────────────────────────────────────────────────
   * ⚠️ 与 tide 不同，这里**刻意不写 stardustEarned**。那个字段是三处共用的
   *   「累计**结算**获得」口径：
   *     ① 排行榜「最多星屑」（game.js: entries key:'star'，值就是 stardustEarned）
   *     ② 商店面板那行「累计结算获得 X」
   *     ③ freshRun 把它 seed 进 s.got.stardust，喂超古代科技/市政的「星屑累积」尤里卡
   *   礼包码是赠送、不是结算产出。写进 earned ⇒ 后台发的福利同时抬高排行榜成绩与
   *   尤里卡进度（等于用运营手段换游戏内成就）。所以：**余额加、统计不加**。
   * ⚠️ 顺手把 stardustShopUnlocked 置真：商店的门是「建成首座轨道卫星」，
   *   有余额却进不去商店是死路。这与 normalizeMeta 的「已有星屑资产即视为曾解锁」同一口径。 */
  function creditStar(m, n) {
    m.stardust = Math.max(0, Math.floor(Number(m.stardust) || 0)) + Math.max(0, Math.floor(Number(n) || 0));
    m.stardustShopUnlocked = true;
  }

  function applyLocal(m, g, key) {
    var parts = [];
    if (g.tide > 0) {
      credit(m, g.tide);
      parts.push(tr('redeem.reward.prestige_points', { amount: g.tide }, '轮回点 +{amount}'));
    }
    if (g.stardust > 0) {
      creditStar(m, g.stardust);
      parts.push(tr('redeem.reward.stardust', { amount: g.stardust }, '星屑 +{amount}'));
    }
    var rewardSummary = parts.join('、');
    if (!m.redeemed || typeof m.redeemed !== 'object') m.redeemed = {};
    m.redeemed[key] = { t: Date.now(), n: g.tide || 0, s: g.stardust || 0 };
    if (SB.state && SB.state.saveMeta) SB.state.saveMeta(m);
    if (SB.game && SB.game.log) SB.game.log(tr('redeem.local.success.log', {
      rewardSummary: rewardSummary, rewardLabel: g.label
    }, '兑换成功：{rewardSummary}（{rewardLabel}）。'));
    /* ⚠️ 导出名是 renderAll（写错会静默不刷新）。 */
    if (SB.ui && SB.ui.render && SB.ui.render.renderAll) SB.ui.render.renderAll();
    return { ok: true, msg: tr('redeem.local.success.result', { rewardSummary: rewardSummary },
      '兑换成功：{rewardSummary}。'), tide: g.tide || 0, stardust: g.stardust || 0 };
  }

  /* 玩家输入的清洗：去首尾空白，去空格 / 连字符 / 下划线。 */
  function normalize(code) {
    return String(code || '').trim().replace(/[\s\-_]/g, '');
  }
  /* 本地防重键：转大写是为了让「同一个码换大小写/加连字符重输」仍被认成同一个。 */
  function dedupeKey(code) {
    return normalize(code).toUpperCase();
  }

  function usedLine(used) {
    return tr('redeem.used_count', { redeemedCodeCount: used }, '本存档已兑换 {redeemedCodeCount} 个码。');
  }

  function alreadyRedeemed(m, code) {
    return !!(m && m.redeemed && Object.prototype.hasOwnProperty.call(m.redeemed, code));
  }

  /* 兑换主流程。返回 Promise<{ok, msg, tide?, stardust?}>，e2e 与面板共用同一入口。
   * ⚠️ 本函数只走本地码表：命中即入账，未命中一律判「码无效」，
   *   绝不再落到平台。 */
  function redeem(rawCode) {
    var code = normalize(rawCode);
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : null;
    if (!ready()) return Promise.resolve({ ok: false, msg: tr('redeem.error.unavailable', null, '兑换功能尚未开放。') });
    if (!m) return Promise.resolve({ ok: false, msg: tr('redeem.error.save_not_ready', null, '存档还没就绪，请稍后重试。') });
    if (!code) return Promise.resolve({ ok: false, msg: tr('redeem.error.code_required', null, '请先输入兑换码。') });
    if (!/^[A-Za-z0-9]{4,24}$/.test(code)) return Promise.resolve({ ok: false, msg: tr('redeem.error.code_format', null, '兑换码只含字母和数字，请再检查一遍。') });
    var key = dedupeKey(code);
    if (alreadyRedeemed(m, key)) return Promise.resolve({ ok: false, msg: tr('redeem.error.already_redeemed.local', null, '这个码你已经领过了。') });

    var lg = findLocal(key);
    if (lg) return Promise.resolve(applyLocal(m, lg, key));
    return Promise.resolve({ ok: false, msg: tr('redeem.error.api.invalid_code', null, '这个兑换码无效，请核对有没有输错。') });
  }

  /* ── 面板 ────────────────────────────────────────────────────────────────
   * 复用 #modal / #modalBox 与 input.js 的 data-modal-close 通道，不另写遮罩。 */
  function open() {
    var box = document.getElementById('modalBox'), modal = document.getElementById('modal');
    if (!box || !modal) return;
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : null;
    var used = (m && m.redeemed) ? Object.keys(m.redeemed).length : 0;
    /* ⚠️ 文案不许把用途写死：这个面板是通用兑换入口，具体给什么由成功提示按实际入账说。 */
    var body =
      '<div class="modal-hd"><b>' + htmlText(tr('ui.settings.redeem.title', null, '兑换码')) + '</b>' +
      '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.action.close', null, '关闭')) + '">×</button></div>' +
      '<div class="redeem-body">' +
        '<p class="redeem-intro">' + htmlText(tr('redeem.panel.intro', null,
          '输入兑换码，兑换成功后奖励直接进入存档。每个码只能使用一次。')) + '</p>' +
        '<div class="redeem-row">' +
          '<input id="redeemCode" class="redeem-input" type="text" maxlength="24" ' +
            'placeholder="' + htmlText(tr('redeem.panel.code_placeholder', null, '输入兑换码')) + '" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
          '<button type="button" class="btn redeem-go" id="redeemGo">' + htmlText(tr('redeem.panel.submit', null, '兑换')) + '</button>' +
        '</div>' +
        '<div class="redeem-status" id="redeemStatus" role="status" aria-live="polite"></div>' +
        /* 累计行**常驻**（空则 CSS :empty 隐藏）：只在置换时改 textContent，不插新节点。 */
        '<small class="redeem-used" id="redeemUsed">' + (used ? usedLine(used) : '') + '</small>' +
      '</div>';
    if (!ready()) {
      body =
        '<div class="modal-hd"><b>' + htmlText(tr('ui.settings.redeem.title', null, '兑换码')) + '</b>' +
        '<button type="button" class="modal-x" data-modal-close="1" aria-label="' + htmlText(tr('ui.action.close', null, '关闭')) + '">×</button></div>' +
        '<div class="redeem-body"><p class="redeem-intro">' + htmlText(tr('redeem.error.unavailable', null, '兑换功能尚未开放。')) + '</p></div>';
    }
    box.innerHTML = body;
    if (SB.ui && SB.ui.render && SB.ui.render.resetModalChrome) SB.ui.render.resetModalChrome();
    modal.classList.remove('hidden');
    if (root.document && root.document.body && root.document.body.classList) root.document.body.classList.add('modal-open');

    var input = document.getElementById('redeemCode');
    var go = document.getElementById('redeemGo');
    var status = document.getElementById('redeemStatus');
    if (!input || !go || !status) return;
    function say(text, kind) {
      status.textContent = text;
      status.className = 'redeem-status' + (kind ? ' is-' + kind : '');
    }
    function fire() {
      say(tr('redeem.panel.submitting', null, '兑换中…'), 'busy');
      go.disabled = true;
      redeem(input.value).then(function (r) {
        go.disabled = false;
        say(r.msg, r.ok ? 'ok' : 'err');
        if (r.ok) {
          input.value = '';
          var meta = SB.game.meta();
          var used2 = meta.redeemed ? Object.keys(meta.redeemed).length : 0;
          var line = document.getElementById('redeemUsed');
          if (line) line.textContent = usedLine(used2);
        }
      });
    }
    go.onclick = fire;
    input.onkeydown = function (ev) { if (ev && ev.key === 'Enter') fire(); };
    if (input.focus) setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
  }

  function boot() {
    var btn = document.getElementById('btnSettingsRedeem');
    if (!btn) return;
    /* 一个本地码都没配时**整块连标题一起隐藏**，不给玩家点出「功能未开放」的死路。 */
    var block = document.getElementById('redeemSettingBlock') || btn;
    if (!ready()) { block.style.display = 'none'; return; }
    block.style.display = '';
    btn.onclick = open;
  }

  SB.redeem = {
    boot: boot, open: open, redeem: redeem,
    ready: ready, platformReady: platformReady, sha1: sha1, normalize: normalize,
    dedupeKey: dedupeKey,
    localGrants: localGrants, findLocal: findLocal, localHash: localHash, creditStar: creditStar,
    credit: credit,
    /* 两个「通道已下线」的锚点：回归直接断言 api === '' 且 platformReady() === false，
     * 防止以后有人手滑把平台通道加回来。 */
    api: '', reward: rewardNum
  };
})(typeof window !== 'undefined' ? window : globalThis);
