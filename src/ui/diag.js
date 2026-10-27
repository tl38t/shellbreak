/* 现场诊断 + 自测（dev 工具，不影响正常玩法）
 *
 * 【入口】连点顶栏标题 5 次（2 秒内）开关面板；或 URL 带 ?diag。
 *   客户跑在 TapTap 容器里加不了查询串，所以必须让玩家自己按得出来。
 *
 * 【两种模式】
 *   ① 实时浮层：tabs 高度 / 页签行数 / docH / scrollY / 两个动态页签文字 / 闲置族民
 *   ② 自测（点「开始自测」）：**全程程序驱动，不需要手指**，因为客户的手势我们无法复现。
 *      判据全部落在「程序把 scrollTop 设成 X，再读回来是不是 X」——
 *      若被改掉，就说明确实有东西在抢滚动，且能区分是「弹回」还是「逐步回退」。
 *
 * 【为什么必须程序驱动】客户描述「按住就停、松开会走、再动从原位继续」——
 *   手工操作无法区分「滚动被改」与「画面在跳」；程序设值+读回能一次分开这两件事。
 *
 * 【必须存在的守卫】sim/load-sb.mjs 的 loadAll() 会把 index.html 声明的全部脚本塞进 vm 沙箱，
 *   那里既无 location 也无真实节点。首版没守卫时整份回归崩在「location is not defined」。
 */
(function (root) {
  var doc = root.document;
  if (typeof location === 'undefined' || !doc || !doc.body || doc.body.nodeType !== 1) return;
  if (typeof doc.addEventListener !== 'function') return;

  var OPEN = /[?&]diag\b(?!=)/.test(location.search || '');
  var TAP_WINDOW = 2000;
  var TAP_NEED = 5;
  var SAMPLE = 200;

  var box = null, timer = 0, taps = [];
  var stat = { min: Infinity, max: -Infinity, jumps: 0, lastH: -1 };
  var cells = {};

  function el(tag, css, text) {
    var n = doc.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }
  function se() { return doc.scrollingElement || doc.documentElement; }
  function tabsH() { return (doc.querySelector('.tabs') || {}).offsetHeight || 0; }
  function txt(id) { var n = doc.getElementById(id); return n ? String(n.textContent || '').trim() : '-'; }
  function idleNow() {
    try {
      var s = root.SB && root.SB.game && root.SB.game.run ? root.SB.game.run() : null;
      if (!s || !root.SB.folk || !root.SB.folk.idle) return '-';
      return String(root.SB.folk.idle(s));
    } catch (e) { return '?'; }
  }
  function rows() {
    var ts = doc.querySelectorAll('.tabs .tab'), tops = {}, n = 0;
    for (var i = 0; i < ts.length; i++) { var y = ts[i].offsetTop; if (!tops[y]) { tops[y] = 1; n++; } }
    return n;
  }

  /* ---------------- 实时浮层 ---------------- */
  function row(k, label) {
    var d = el('div', 'display:flex;justify-content:space-between;gap:10px;line-height:15px');
    d.appendChild(el('span', 'color:#8aa', label));
    var b = el('b', 'color:#dff;font-weight:500', '-');
    d.appendChild(b);
    box.appendChild(d);
    cells[k] = b;
  }

  function build() {
    if (box) return;
    box = el('div', [
      'position:fixed', 'right:6px', 'top:6px', 'z-index:2147483000',
      'background:rgba(4,10,18,.9)', 'border:1px solid #2a5a7d', 'border-radius:8px',
      'padding:7px 9px', 'font:11px/15px ui-monospace,Consolas,monospace',
      'color:#dff', 'min-width:196px', 'max-width:calc(100vw - 20px)',
      'box-shadow:0 4px 16px rgba(0,0,0,.5)'
    ].join(';'));
    box.id = '__sb_diag';

    var hd = el('div', 'color:#5be3a4;margin-bottom:4px;letter-spacing:1px;cursor:pointer', 'DIAG  (点我关闭)');
    hd.onclick = destroy;
    box.appendChild(hd);

    row('tabsH', 'tabs 高度');
    row('tabRows', '页签行数');
    row('jumps', '高度跳变');
    row('range', '极差');
    row('docH', '页面总高');
    row('scrollY', 'scrollY');
    row('vtab', '巢穴页签');
    row('ftab', '族民页签');
    row('idle', '闲置族民');

    var btn = el('button', [
      'margin-top:6px', 'width:100%', 'padding:5px', 'border-radius:6px',
      'border:1px solid #2a5a7d', 'background:#123a52', 'color:#dff',
      'font:11px ui-monospace,monospace', 'cursor:pointer'
    ].join(';'), '开始自测（约 25 秒）');
    btn.onclick = function () { runSelftest(); };
    box.appendChild(btn);
    var btn2 = el('button', [
      'margin-top:4px', 'width:100%', 'padding:5px', 'border-radius:6px',
      'border:1px solid #2a5a7d', 'background:transparent', 'color:#8aa',
      'font:11px ui-monospace,monospace', 'cursor:pointer'
    ].join(';'), '收起面板');
    btn2.onclick = destroy;
    box.appendChild(btn2);

    doc.body.appendChild(box);
    timer = root.setInterval(tick, SAMPLE);
    tick();
  }

  function tick() {
    if (!box) return;
    var H = tabsH(), R = rows(), s = se();
    if (stat.lastH >= 0 && H !== stat.lastH) {
      stat.jumps++;
      if (H > stat.max) stat.max = H;
      if (H < stat.min) stat.min = H;
    } else if (stat.lastH < 0) { stat.max = stat.min = H; }
    stat.lastH = H;

    cells.tabsH.textContent = H + (stat.jumps > 0 ? '  <<' : '');
    cells.tabsH.style.color = stat.jumps > 0 ? '#ff8b6b' : '#dff';
    cells.tabRows.textContent = R + ' 行';
    cells.jumps.textContent = stat.jumps + ' 次';
    cells.jumps.style.color = stat.jumps > 0 ? '#ff8b6b' : '#dff';
    cells.range.textContent = (stat.max - stat.min) + ' px';
    cells.docH.textContent = s.scrollHeight;
    cells.scrollY.textContent = Math.round(root.scrollY || s.scrollTop || 0);
    cells.vtab.textContent = txt('villageTabName');
    cells.ftab.textContent = txt('folkTabName');
    cells.idle.textContent = idleNow();
  }

  function destroy() {
    if (timer) { root.clearInterval(timer); timer = 0; }
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
  }

  /* ---------------- 自测 ---------------- */
  var running = false;

  function report() {
    var wrap = el('div', [
      'position:fixed', 'left:6px', 'right:6px', 'top:6px', 'bottom:6px',
      'z-index:2147483001', 'background:rgba(4,10,18,.96)', 'border:1px solid #2a5a7d',
      'border-radius:8px', 'padding:10px', 'overflow:auto',
      'font:11px/1.5 ui-monospace,Consolas,monospace', 'color:#dff',
      '-webkit-overflow-scrolling:touch'
    ].join(';'));
    wrap.id = '__sb_selftest';

    var hd = el('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px');
    hd.appendChild(el('span', 'color:#5be3a4;letter-spacing:1px', 'SELFTEST'));
    var x = el('span', 'color:#8aa;cursor:pointer;padding:0 4px', '关闭 ×');
    x.onclick = function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
    hd.appendChild(x);
    wrap.appendChild(hd);

    var log = el('div', 'white-space:pre-wrap;word-break:break-all');
    wrap.appendChild(log);
    doc.body.appendChild(wrap);
    return {
      log: function (t, color) {
        var d = el('div', 'white-space:pre-wrap;word-break:break-all' + (color ? ';color:' + color : ''), t);
        log.appendChild(d);
        wrap.scrollTop = wrap.scrollHeight;
      },
      node: wrap
    };
  }

  function env() {
    var s = se();
    var mq = root.matchMedia ? root.matchMedia.bind(root) : function () { return { matches: false }; };
    var ios = (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iOS' : 'other');
    var m = (navigator.userAgent || '').match(/OS (\d+)[_.](\d+)/);
    return [
      '设备       ' + ios + (m ? ' ' + m[1] + '.' + m[2] : ''),
      '视口       ' + root.innerWidth + '×' + root.innerHeight + '  dpr=' + (root.devicePixelRatio || 1),
      '页面总高   ' + s.scrollHeight + '  可滚 ' + (s.scrollHeight - root.innerHeight),
      'touch      ' + mq('(pointer: coarse)').matches + '  横屏 ' + mq('(orientation: landscape)').matches,
      '减弱动效   ' + mq('(prefers-reduced-motion: reduce)').matches,
      'body溢流   ' + getComputedStyle(doc.body).overflowX + '/' + getComputedStyle(doc.body).overflowY,
    ].join('\n');
  }

  function wait(ms) {
    return new Promise(function (r) { root.setTimeout(r, ms); });
  }

  function runSelftest() {
    if (running) return;
    running = true;
    var R = report();
    var result = { drift: 0, back: 0, maxBack: 0, bounce: 0, shifts: 0, misses: 0 };

    /* layout-shift 统计（客户说的「闪」若真是布局位移，这里会有值） */
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { if (!e.hadRecentInput) result.shifts += e.value; });
      }).observe({ type: 'layout-shift', buffered: false });
    } catch (e) { R.log('（本机不支持 layout-shift 观测）', '#8aa'); }

    R.log('=== 环境 ===\n' + env(), '#8aa');

    (function phase1() {
      /* 阶段 1：静止漂移 —— 把 scrollY 放到 1000，什么都不做，看它会不会自己变 */
      R.log('\n=== ① 静止漂移（4 秒，不触碰）===');
      var el0 = se();
      var target = Math.min(1000, Math.max(0, el0.scrollHeight - root.innerHeight));
      el0.scrollTop = target;
      var samples = [];
      var n = 0;
      var iv = root.setInterval(function () {
        samples.push(Math.round(root.scrollY || se().scrollTop || 0));
        if (++n >= 40) {
          root.clearInterval(iv);
          var min = Math.min.apply(null, samples), max = Math.max.apply(null, samples);
          result.drift = max - min;
          R.log('  设定 ' + target + '  期间取值 ' + min + '~' + max +
            '  漂移 ' + result.drift + ' px  ' + (result.drift > 4 ? '❌ 有东西在改滚动' : '✅ 静止稳定'),
            result.drift > 4 ? '#ff8b6b' : '#5be3a4');
          phase2();
        }
      }, 100);
    })();

    function phase2() {
      /* 阶段 2：连续滚动回退检测 —— 程序逐步加大 scrollTop，看读回值有没有倒退 */
      R.log('\n=== ② 连续滚动（20 步，程序驱动）===');
      var s = se();
      var start = Math.min(200, Math.max(0, s.scrollHeight - root.innerHeight - 40));
      var step = 80, i = 0, last = start, backs = 0, maxBack = 0, miss = 0;
      s.scrollTop = start;
      var iv = root.setInterval(function () {
        i++;
        var want = start + i * step;
        s.scrollTop = want;
        var got = Math.round(se().scrollTop);
        if (got < last - 5) { backs++; maxBack = Math.min(maxBack, got - last); }
        if (Math.abs(got - want) > 12) miss++;
        last = got;
        if (i >= 20) {
          root.clearInterval(iv);
          result.back = backs; result.maxBack = maxBack; result.misses = miss;
          R.log('  回退次数 ' + backs + '  最大回退 ' + maxBack + ' px  定位偏差>12px 的步数 ' + miss +
            '  ' + (backs > 0 || miss > 2 ? '❌ 滚动被干扰' : '✅ 程序滚动正常'),
            backs > 0 || miss > 2 ? '#ff8b6b' : '#5be3a4');
          phase3();
        }
      }, 60);
    }

    function phase3() {
      /* 阶段 3：滚到底弹回 —— 客户原话「巢穴页滚到最底会弹回去」 */
      R.log('\n=== ③ 滚到底部（3 秒）===');
      var s = se();
      var max = s.scrollHeight - root.innerHeight;
      s.scrollTop = max;
      wait(400).then(function () {
        var atBottom = Math.round(se().scrollTop);
        return wait(2600).then(function () {
          var after = Math.round(se().scrollTop);
          var afterMax = se().scrollHeight - root.innerHeight;
          result.bounce = Math.max(0, atBottom - after);
          R.log('  到底 ' + atBottom + '（当时上限 ' + max + '）→ 3 秒后 ' + after +
            '（上限 ' + afterMax + '）  弹回 ' + result.bounce + ' px  ' +
            (result.bounce > 4 ? '❌ 底部被弹回' : '✅ 底部稳定'),
            result.bounce > 4 ? '#ff8b6b' : '#5be3a4');
          phase4();
        });
      });
    }

    function phase4() {
      /* 阶段 4：各页签高度扫描 —— 找哪个页的内容会变。
       * ⚠️ 记下原始页签，结束后切回，否则客户自测完会莫名停在「成就」页。 */
      R.log('\n=== ④ 页签高度（看哪一页在变）===');
      var backTo = null;
      try { backTo = root.SB && root.SB.game && root.SB.game.getTab ? root.SB.game.getTab() : null; } catch (e) {}
      var keys = (root.SB && root.SB.ui && root.SB.ui.render && root.SB.ui.render.PANE_KEYS) || [];
      if (!keys.length) { R.log('  （拿不到 PAGE_KEYS，跳过）', '#8aa'); finish(); return; }
      var out = [];
      var i = 0;
      (function next() {
        if (i >= keys.length) {
          R.log(out.join('\n'));
          if (backTo) { try { root.SB.game.setTab(backTo); } catch (e) {} }
          finish();
          return;
        }
        var k = keys[i++];
        try { root.SB.game.setTab(k); } catch (e) {}
        var pane = doc.getElementById('pane-' + k);
        var h1 = pane ? Math.round(pane.getBoundingClientRect().height) : 0;
        var d1 = se().scrollHeight;
        root.setTimeout(function () {
          var h2 = pane ? Math.round(pane.getBoundingClientRect().height) : 0;
          var d2 = se().scrollHeight;
          out.push('  ' + String(k).padEnd(13) + 'pane ' + String(h1).padStart(5) + '→' + String(h2).padStart(5) +
            '  docH ' + String(d1).padStart(5) + '→' + String(d2).padStart(5) +
            (h1 !== h2 || d1 !== d2 ? '  ❌ 在变' : ''));
          next();
        }, 700);
      })();
    }

    function finish() {
      var bad = result.drift > 4 || result.back > 0 || result.bounce > 4 || result.misses > 2;
      R.log('\n=== 汇总 ===', '#5be3a4');
      R.log('  静止漂移 ' + result.drift + ' px');
      R.log('  滚动回退 ' + result.back + ' 次（最大 ' + result.maxBack + ' px，定位偏差 ' + result.misses + ' 步）');
      R.log('  底部弹回 ' + result.bounce + ' px');
      R.log('  布局位移累计 ' + result.shifts.toFixed(3));
      R.log('\n' + (bad
        ? '❌ 检测到滚动被干扰 —— 上面标红的那一项就是元凶，截图发回即可'
        : '✅ 程序驱动的滚动全程正常 —— 问题在触摸/手势层或容器，不在这套滚动逻辑里'),
        bad ? '#ff8b6b' : '#5be3a4');
      R.log('\n（把这一屏截图发回即可，不需要手滑）', '#8aa');
      running = false;
    }
  }

  /* ---------------- 入口 ---------------- */
  function bindTapEntry() {
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('.brandline, header')) return;
      var now = Date.now();
      taps = taps.filter(function (x) { return now - x < TAP_WINDOW; });
      taps.push(now);
      if (taps.length >= TAP_NEED) {
        taps = [];
        if (box) destroy(); else build();
      }
    }, true);
  }

  function boot() {
    if (OPEN) build();
    bindTapEntry();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
