/* 天壳 / SHELLBREAK — TapTap 兑换码（2026-10-30）
 * 用途：TapTap TDS 礼包「无服务器兑换」通道。**这是一个通用兑换入口**，不要把它当一次性
 *   事故补偿页——首次使用是给 Ver1.0.5 修 migratePerks 幂等哨兵撞名后被吞节点的玩家补
 *   120 轮回点，但面板文案与结构都不许写死这个用途（2026-10-30 用户：「以后还要复用，
 *   写轮回点干嘛，就直接写 TapTap 平台兑换码」）。换活动只改 CFG.REDEEM 的三项。
 *
 * ── 为什么走 TDS、以及这条路的能力边界 ──────────────────────────────────────
 *   TapTap 没有任何「开发者 → 玩家存档」的写接口（云存档 createArchive/updateArchive 全是
 *   客户端 SDK，跑在玩家设备上），也没有私信通道 ⇒ **唯一码无处安全发放**（评价回复、论坛帖子
 *   都是公开的，码一露就被别人抢）。所以这里只支持「通兑码」：
 *   同一个码全服可领，平台按 (活动, character_id) 每人限 1 次，我们这边再用 meta.redeemed
 *   兜一层本地防重（断网重试 / 双开时先于平台挡住）。
 * 平台**不会**替我们把奖励写进存档 —— 入账是本文件自己做的（见 credit），TDS 只负责
 *   「这个码有效吗 / 这个用户发过吗」。
 *   ⇒ 后台建活动时必须选「通兑码」+ 每用户 1 次 + 库存足够，三条缺一都会让玩家领不到。
 *
 *   ⚠️ character_id 必须**每个存档一个**（meta.installId），不能写常量 —— 详见 characterId()。
 *
 * ── 接口事实（2026-10-30 curl 实测，不是照文档猜）──────────────────────────
 *   POST https://poster-api.xd.cn/api/v1.0/cdk/game/submit-simple
 *   sign = sha1(timestamp + nonce_str + client_id)   ← 用 Client ID 代 Secret，可安全放客户端
 *   ① CORS 全开（Access-Control-Allow-Origin: *）⇒ 容器内可直连，不需要代理或域名白名单；
 *   ② 空包 → error:100001 + hint 指名 ClientId 必填 ⇒ 字段名正确；
 *   ③ 假 client_id + 正确签名 → error:100005 + dev_message:"game_not_found"
 *      ⇒ 签名算法与字段全对，服务端按 client_id 查活动。
 *   ⚠️ 前置：后台「游戏服务 → 应用配置」拿 Client ID；礼包活动必须建成「无服务器礼包」，
 *      否则调用报 100018（该活动无法使用此兑换接口）。
 */
(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  var CFG = SB.CFG || {};
  var API = 'https://poster-api.xd.cn/api/v1.0/cdk/game/submit-simple';
  var TIMEOUT_MS = 12000;

  function rc() { return (CFG.REDEEM || {}); }
  function ready() {
    var c = rc();
    return !!(c.CLIENT_ID && c.ACTIVITY_ID);
  }
  function rewardNum() {
    var n = Number(rc().REWARD_NUM);
    return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
  }

  /* ── SHA-1（纯 JS）───────────────────────────────────────────────────────
   * 不用 crypto.subtle：它异步、且非安全上下文（file:// / 普通 http）下不可用，
   * 小游戏容器里也不保证有。这里只要 40 字节的摘要，自己算最稳。
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
   * ⚠️⚠️ 必须**同时**写 tide 与 tideEarnedTotal，这是本轮补偿最容易被漏掉的一步。
   *   定损方程（见 tmp/_probe_tide_audit.mjs / docs/JUDGMENTS.md）是
   *     tide = tideEarnedTotal − spent + 10M
   *   只加 tide 不加 earned ⇒ 方程失衡 ⇒ 下次对账把「补偿」算成「又丢了 N 点」
   *   ⇒ 重复补偿、且一旦发给玩家就不可回收。 */
  function credit(m, n) {
    m.tide = (m.tide || 0) + n;
    m.tideEarnedTotal = (m.tideEarnedTotal || 0) + n;
    m.compensationTotal = (m.compensationTotal || 0) + n;
  }

  /* 玩家输入的清洗：去首尾空白，去空格 / 连字符 / 下划线。
   * ⚠️ **不转大写**（2026-10-30 实测修正）：TDS 随机生成的是**大小写混排** 13 位券码
   *   （本活动那颗实际就是全小写 `krvpcacr334es`）。原来这里 `.toUpperCase()` 会把玩家
   *   输入的码改写成 `KRVPCACR334ES` 再发出去 —— 平台一旦大小写敏感就是全员 100016
   *   「兑换码无效」，而这种错在本地夹具里永远看不出来（桩不管大小写）。
   *   保持原样送出，在「敏感」与「不敏感」两种平台下都成立，所以这是唯一安全的选择。 */
  function normalize(code) {
    return String(code || '').trim().replace(/[\s\-_]/g, '');
  }
  /* 本地防重键：**只**用于 meta.redeemed 与 alreadyRedeemed，绝不发给平台。
   * 转大写是为了让「同一个码换大小写/加连字符重输」仍被认成同一个（见 redeem 的重复领取段）。 */
  function dedupeKey(code) {
    return normalize(code).toUpperCase();
  }

  /* ── 每个存档独立的「游戏用户 ID」（character_id）────────────────────────────
   * ⚠️ 这是本文件最容易写错、且错了**只有第二个玩家才会发现**的一行。
   *   TDS 按 (活动, character_id) 记每个用户的兑换次数（错误码 100017 = 同一用户超次数）。
   *   若传一个全服常量 ⇒ 全服算一个人 ⇒ 通兑码只有首位玩家能领，其余全报 100017。
   *   所以：首次兑换时生成一次、存进 meta.installId、以后复用（同一存档内稳定）。
   *   不在 state.js 里做迁移：meta 是 `Object.assign(empty, parsed)` 合并，未知字段天然保留，
   *   老存档第一次兑换时补上即可，不需要动存档版本号。
   *   约束：长度 ≤ 50（平台限制）。 */
  function mkCharacterId() {
    var t = Date.now().toString(36);
    var r = '';
    for (var i = 0; i < 12; i++) r += '0123456789abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 36));
    return 'sb' + t + r;    /* 约 22 字符，纯小写字母数字 */
  }
  function characterId(m) {
    var id = m && m.installId;
    if (typeof id === 'string' && /^[a-z0-9]{8,50}$/.test(id)) return id;
    id = mkCharacterId();
    if (m) {
      m.installId = id;
      if (SB.state && SB.state.saveMeta) SB.state.saveMeta(m);
    }
    return id;
  }

  /* 累计行只说「兑了几个码」（2026-10-30）：原来写「累计 +N 轮回点」，把面板绑死在
   * 这一种奖励上。以后发别的活动还在用同一个面板，所以这里不许提奖励类型。 */
  function usedLine(used) {
    return '本存档已兑换 ' + used + ' 个码。';
  }

  function alreadyRedeemed(m, code) {
    return !!(m && m.redeemed && Object.prototype.hasOwnProperty.call(m.redeemed, code));
  }

  /* 错误码文案：官方错误码表里的每一条都是**玩家真会撞上**的，别只翻前三个。
   * 100001 覆盖「参数错 / 时间戳过了一分钟有效期」——设备时间不准的玩家会一直撞它，
   * 所以文案里必须提时间，否则他会以为码是错的。 */
  function errText(err) {
    var e = Number(err && err.error);
    var MAP = {
      100001: '兑换信息没被接受（可能是设备时间不准，或码里有字符不对）。',
      100005: '兑换功能配置有误，请到论坛反馈。',
      100006: '这个码已经被领完了。',
      100008: '这个码已经过期了。',
      100009: '活动还没开始，请稍后再来。',
      100011: '点得太快了，缓一下再试。',
      100012: '刚刚太多人同时兑换，稍等几秒再试。',
      100016: '这个兑换码无效，请核对有没有输错。',
      100017: '你已领过这个码了（每个码每人限领一次）。',
      100018: '兑换活动类型不对，请到论坛反馈。',
      100022: '你所在的地区不支持这个兑换码。'
    };
    if (MAP[e]) return MAP[e];
    var m = (err && (err.message || (err.info && err.info.dev_message))) || '';
    return '兑换失败' + (e ? '（' + e + '）' : '') + (m ? '：' + m : '') + '。';
  }

  var busy = false;

  /* 兑换主流程。返回 Promise<{ok, msg, tide?}>，e2e 与面板共用同一入口。
   * ⚠️ 只有「平台明确返回成功」才写状态；网络失败 / 超时一律不落盘，码不算用掉。 */
  function redeem(rawCode) {
    var code = normalize(rawCode);
    var c = rc();
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : null;
    if (!ready()) return Promise.resolve({ ok: false, msg: '兑换功能尚未开放。' });
    if (!m) return Promise.resolve({ ok: false, msg: '存档还没就绪，请稍后重试。' });
    if (busy) return Promise.resolve({ ok: false, msg: '正在兑换，请稍候…' });
    if (!code) return Promise.resolve({ ok: false, msg: '请先输入兑换码。' });
    if (!/^[A-Za-z0-9]{4,24}$/.test(code)) return Promise.resolve({ ok: false, msg: '兑换码只含字母和数字，请再检查一遍。' });
    if (alreadyRedeemed(m, dedupeKey(code))) return Promise.resolve({ ok: false, msg: '这个码你已经领过了。' });
    if (typeof root.fetch !== 'function') return Promise.resolve({ ok: false, msg: '当前环境不能联网兑换。' });

    var ts = Math.floor(Date.now() / 1000);
    var nonce = '';
    var pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (var i = 0; i < 5; i++) nonce += pool.charAt(Math.floor(Math.random() * pool.length));
    var body = {
      client_id: String(c.CLIENT_ID),
      /* ⚠️ 送**原样大小写**的码（见 normalize 注释）；本地记录用的是大写键。 */
      gift_code: code,
      /* ⚠️ 每个存档独立的 id，绝不能用常量（见 characterId 的注释）。 */
      character_id: characterId(m),
      nonce_str: nonce,
      sign: sha1(ts + nonce + c.CLIENT_ID),
      timestamp: ts
    };

    busy = true;
    var timer = null, opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
    if (root.AbortController) {
      var ac = new root.AbortController();
      opts.signal = ac.signal;
      timer = root.setTimeout(function () { try { ac.abort(); } catch (e) {} }, TIMEOUT_MS);
    }
    return root.fetch(API, opts).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (timer) root.clearTimeout(timer);
      busy = false;
      if (!data || data.success !== true || Number(data.error) !== 0) {
        return { ok: false, msg: errText(data) };
      }
      /* 只认我们那个活动：防止玩家拿别的活动的码来这里刷（TDS 的码是全网通用的）。 */
      if (String(data.activity_id) !== String(c.ACTIVITY_ID)) {
        return { ok: false, msg: '这个码不属于本游戏的兑换活动。' };
      }
      var n = rewardNum();
      var meta = SB.game.meta();
      if (!meta.redeemed || typeof meta.redeemed !== 'object') meta.redeemed = {};
      meta.redeemed[dedupeKey(code)] = { t: Date.now(), n: n };
      credit(meta, n);
      if (SB.state && SB.state.saveMeta) SB.state.saveMeta(meta);
      if (SB.game && SB.game.log) SB.game.log('兑换成功：轮回点 +' + n + '（累计兑换 ' + (meta.compensationTotal || n) + '）。');
      /* ⚠️ 导出名是 renderAll，不是 all（写错会静默不刷新：点数和顶栏要等下一次 tick 才变）。 */
      if (SB.ui && SB.ui.render && SB.ui.render.renderAll) SB.ui.render.renderAll();
      return { ok: true, msg: '兑换成功，轮回点 +' + n + '。', tide: n };
    }).catch(function (e) {
      if (timer) root.clearTimeout(timer);
      busy = false;
      /* 超时/断网：码没被平台核销，状态一点没动，让玩家可以原样重试。 */
      return { ok: false, msg: '网络不通，稍后再试（兑换码没有被使用）。' };
    });
  }

  /* ── 面板 ────────────────────────────────────────────────────────────────
   * 复用 #modal / #modalBox 与 input.js 的 data-modal-close 通道，不另写遮罩
   * （同排行榜 / 更新日志 / 政体选择器的先例；resetModalChrome 见 JUDGMENTS 五点二十八）。 */
  function open() {
    var box = document.getElementById('modalBox'), modal = document.getElementById('modal');
    if (!box || !modal) return;
    var m = (SB.game && SB.game.meta) ? SB.game.meta() : null;
    var used = (m && m.redeemed) ? Object.keys(m.redeemed).length : 0;
    /* ⚠️ 文案**不许把用途写死**（2026-10-30 用户：「兑换码那个页面以后还要复用，
     *   写轮回点干嘛，就直接写 TapTap 平台兑换码」）。这个面板是通用的 TapTap 兑换入口，
     *   以后发别的活动还在用它 —— 所以这里只说「平台兑换码 / 每个码一次 / 奖励直接到账」，
     *   具体给什么由成功提示那行按实际入账说（见 redeem 的返回值）。 */
    var body =
      '<div class="modal-hd"><b>TapTap 兑换码</b>' +
      '<button type="button" class="modal-x" data-modal-close="1" aria-label="关闭">×</button></div>' +
      '<div class="redeem-body">' +
        '<p class="redeem-intro">输入 TapTap 平台发放的兑换码，兑换成功后奖励直接进入存档。' +
          '每个码只能使用一次。</p>' +
        '<div class="redeem-row">' +
          '<input id="redeemCode" class="redeem-input" type="text" maxlength="24" ' +
            'placeholder="输入兑换码" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
          '<button type="button" class="btn redeem-go" id="redeemGo">兑换</button>' +
        '</div>' +
        '<div class="redeem-status" id="redeemStatus" role="status" aria-live="polite"></div>' +
        /* 累计行**常驻**（空则 CSS :empty 隐藏）：只在置换时改 textContent，
         * 不往 DOM 里插新节点 —— 插节点要走 insertAdjacentHTML，假 DOM 没有它，
         * 回归里就会「成功路径抛错但状态已经写进去了」，最难看的一类半绿。 */
        '<small class="redeem-used" id="redeemUsed">' + (used ? usedLine(used) : '') + '</small>' +
      '</div>';
    if (!ready()) {
      body =
        '<div class="modal-hd"><b>TapTap 兑换码</b>' +
        '<button type="button" class="modal-x" data-modal-close="1" aria-label="关闭">×</button></div>' +
        '<div class="redeem-body"><p class="redeem-intro">兑换功能尚未开放。</p></div>';
    }
    box.innerHTML = body;
    /* 归一化走 render.js 的公开出口，不自己写第二份（同 save-transfer.js 的先例）。 */
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
      say('兑换中…', 'busy');
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
    /* 没配 Client ID / 活动 ID 时**整块连标题一起隐藏**（#redeemSettingBlock），
     * 不给玩家点出一个「功能未开放」的死路，也不留一个空标题。
     * 这两项来自开发者后台，缺一个就兑换不了。 */
    var block = document.getElementById('redeemSettingBlock') || btn;
    if (!ready()) { block.style.display = 'none'; return; }
    block.style.display = '';
    btn.onclick = open;
  }

  SB.redeem = {
    boot: boot, open: open, redeem: redeem,
    ready: ready, sha1: sha1, normalize: normalize,
    /* dedupeKey 单独导出：回归要能钉住「大小写不同但同码只入账一次」这条。 */
    dedupeKey: dedupeKey,
    /* 供探针/回归直接断言，避免它们去猜内部格式。characterId 单独导出是为了钉住
     * 「每个存档一个 id」这条（写常量会让除第一个玩家以外全员 100017）。 */
    characterId: characterId,
    api: API, reward: rewardNum
  };
})(typeof window !== 'undefined' ? window : globalThis);
