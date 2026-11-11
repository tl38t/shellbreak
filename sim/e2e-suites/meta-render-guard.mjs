/* e2e suite: 轮回 / 星屑商店渲染守卫（"一闪一闪" 闪烁回归锁）。
 *
 * 2026-11-08：#1 实装的 lastMetaHTML 指纹守卫是手机端轮回商店偶发闪烁的根因修复
 * （约 101 张 decoding="async" 天赋图标在每 2 秒重写时被反复重插重解码，手机 WebView
 * 露白帧）。这条回归锁把守卫的不变量钉死，防止未来重构把守卫删了 / 改坏后闪烁静默复活：
 *
 *   ① 同一份状态连续渲染，pane-meta 的 innerHTML 只写一次（守卫跳过重复重写）；
 *   ② 内容变化（余额 / 节点状态）后，恰好重写一次。
 *
 * ⚠️ 不依赖真实浏览器：用 Proxy 包裹假 DOM 的 #pane-meta 节点，拦截 innerHTML 的 *赋值*
 *   动作计数。为什么不用 Object.defineProperty 覆盖原属性：假 DOM 的 mkEl 用
 *   `Object.defineProperty(el,'innerHTML',{get,set})` 定义该属性且**未设 configurable**
 *   （默认 false），从外部无法重定义 —— 直接 defineProperty 覆盖会抛
 *   `Cannot redefine property: innerHTML` 并让整份 e2e 在调用处抛异常中止。
 *   Proxy 方案不改任何属性描述符：把 `doc.getElementById('pane-meta')` 重定向到一个
 *   包裹真实节点的 proxy，render.js 取到的就是 proxy，每次 `node.innerHTML = x` 都经过
 *   set trap 计数，与属性是否可配置无关。
 *
 * ⚠️ 用「赋值次数」而非「值是否变化」断言：若守卫被删但内容相同，真实浏览器仍会重插
 *   重解码（假 DOM 赋值同值虽不重解析，但赋值动作本身发生了），值比较会漏判；拦截 set
 *   动作才能抓住这类回归。
 *
 * ⚠️ 不依赖绝对值：lastMetaHTML 是 render.js 模块私有变量，跨整份 e2e 持续存在，首遍渲染
 *   写不写取决于此前守卫状态；但「相邻两次相同态之间是否新增赋值」「变化后是否恰好新增一次」
 *   这两个增量判据与守卫此前状态无关，稳健。 */
export function run({ SB, check, doc }) {
  console.log('\n=== 轮回商店渲染守卫（闪烁回归锁）===');
  if (!doc || typeof doc.getElementById !== 'function') {
    check('回归锁：调用方需传入 doc 桩', false, '未收到 doc');
    return;
  }

  const realMetaEl = doc.getElementById('pane-meta');
  if (!realMetaEl) {
    check('回归锁：pane-meta 节点存在', false, 'getElementById 返回空');
    return;
  }

  let writes = 0;
  /* Proxy 包裹真实节点：拦截 innerHTML 赋值计数，其余读写透明转发到真实节点。
   * 真实节点的 _html 字段仍作后端存储，保证其它直接读写 _html 的代码语义一致。 */
  const metaProxy = new Proxy(realMetaEl, {
    get(target, prop, receiver) {
      if (prop === 'innerHTML') return target._html;
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (prop === 'innerHTML') {
        writes++;
        target._html = String(value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    }
  });

  /* 把 render.js 的 el('pane-meta') 重定向到 proxy（render.js 每次渲染现取节点，
   * 不缓存，故重定向对后续所有渲染生效）。finally 还原，避免污染其它套件。 */
  const origGetById = doc.getElementById.bind(doc);
  doc.getElementById = function (id) {
    if (id === 'pane-meta') return metaProxy;
    return origGetById(id);
  };

  const m = SB.game.meta();
  const keepShop = m.shopUnlocked;
  const keepTide = m.tide;
  try {
    m.shopUnlocked = true;   // 让 meta 页渲染完整内容（含余额摘要），状态确定且内容丰富

    // 基准态：先渲染一次，把守卫落到已知基准（写或不写都行，不断言绝对值）
    SB.ui.render.renderPanes();
    const w0 = writes;

    // 完全相同的状态再渲染一次 → 守卫必须跳过重写（不新增赋值）
    SB.ui.render.renderPanes();
    const wStable = writes - w0;
    check('轮回商店静止态二次渲染不重写 innerHTML（闪烁守卫生效）', wStable === 0,
      '二次渲染新增写入=' + wStable);

    // 内容变化（余额）后 → 必须恰好重写一次
    m.tide = (typeof keepTide === 'number' ? keepTide : 0) + 123.45;
    SB.ui.render.renderPanes();
    const wChanged = writes - w0 - wStable;
    check('轮回商店内容变化后恰好重写 1 次', wChanged === 1,
      '变化后新增写入=' + wChanged);

    // 变化后稳定态再渲染 → 又应跳过
    SB.ui.render.renderPanes();
    const wStable2 = writes - w0 - wStable - wChanged;
    check('内容变化后稳定态再次渲染不重写', wStable2 === 0,
      '稳定态新增写入=' + wStable2);
  } finally {
    doc.getElementById = origGetById;   // 还原，避免影响同进程后续套件 / 收尾
    m.shopUnlocked = keepShop;
    m.tide = keepTide;
  }
}
