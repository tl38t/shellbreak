import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.CDP_PORT = '9339';
const { connect } = await import('../../../_cdp.mjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'screenshots');
await fs.mkdir(outDir, { recursive: true });

let targets = await (await fetch('http://127.0.0.1:9339/json/list')).json();
let page = targets.find(x => x.type === 'page' && x.url.includes('/index.html'));
if (!page) {
  const browser = await connect();
  await browser.send('Target.createTarget', { url: 'http://127.0.0.1:8768/index.html' });
  browser.close();
  await new Promise(resolve => setTimeout(resolve, 1800));
  targets = await (await fetch('http://127.0.0.1:9339/json/list')).json();
  page = targets.find(x => x.type === 'page' && x.url.includes('/index.html'));
}
if (!page) throw new Error('Local game page was not found on CDP port 9339.');
const cdp = await connect(page.webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
});
await new Promise(resolve => setTimeout(resolve, 1500));
await cdp.evaluate(`(() => {
  const style = document.createElement('style');
  style.textContent = 'html{scrollbar-width:none!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}';
  document.head.appendChild(style);
  return true;
})()`);

const injectAi = `(() => {
  if (!window.SB || !SB.game || !SB.aiStrategy) return 'game-not-ready';
  const current = SB.game.run();
  if (current && SB.tech && SB.tech.panelOpen && SB.tech.panelOpen(current)) return 'already-unlocked';
  if (!document.getElementById('promo-ai-player-script')) {
    const script = document.createElement('script');
    script.id = 'promo-ai-player-script';
    script.src = '/src/ai-player.js';
    document.head.appendChild(script);
  }
  return 'ai-loaded';
})()`;
console.log('AI injection:', await cdp.evaluate(injectAi));

function stateSummary(s) {
  return {
    gameSeconds: Math.round(Number(s?.t) || 0),
    population: Math.round(Number(s?.pop) || 0),
    shell: Math.round(Number(s?.shell) || 0),
    buildings: Object.values(s?.lvl || {}).reduce((a, n) => a + (Number(n) || 0), 0),
    technologies: Object.keys(s?.techs || {}).filter(k => s.techs[k]).length,
    era: s?.era || null,
  };
}

let announced = false;
for (let elapsed = 0; elapsed <= 300; elapsed += 10) {
  const summary = await cdp.evaluate(`(() => {
    const s = SB.game.run();
    return {
      t: s && s.t, pop: s && s.pop, shell: s && s.shell,
      lvl: s && s.lvl, techs: s && s.techs, era: s && (s.era || s.eraId),
      techOpen: !!(s && SB.tech && SB.tech.panelOpen && SB.tech.panelOpen(s)),
      workshop: !!(s && s.lvl && s.lvl.workshop),
    };
  })()`);
  const compact = stateSummary(summary);
  if (elapsed % 30 === 0) console.log(`AI ${elapsed}s`, JSON.stringify(compact), `techOpen=${summary?.techOpen}`, `workshop=${summary?.workshop}`);
  if (summary?.techOpen && !announced) {
    announced = true;
    console.log('Technology panel unlocked; collecting a common-state screenshot set.');
    await cdp.evaluate(`(() => {
      const modal = document.getElementById('modal');
      if (modal && !modal.classList.contains('hidden')) {
        const enter = [...modal.querySelectorAll('button')].find(b => /进入科技页|继续|确认/.test(b.innerText || ''));
        if (enter) enter.click();
      }
      const pause = document.getElementById('ai-player-pause');
      if (pause && !pause.disabled) pause.click();
      const panel = document.getElementById('ai-player-panel');
      if (panel) panel.remove();
      SB.game.setSpeed(1);
      return true;
    })()`);
    await new Promise(resolve => setTimeout(resolve, 1600));
    const capture = async (tab, filename) => {
      await cdp.evaluate(`(() => {
        const panel = document.getElementById('ai-player-panel');
        if (panel) panel.remove();
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) {
          const close = [...modal.querySelectorAll('button')].find(b => /进入科技页|继续|确认|关闭|返回/.test(b.innerText || ''));
          if (close) close.click();
        }
        return true;
      })()`);
      await cdp.evaluate(`SB.game.setTab(${JSON.stringify(tab)})`);
      await new Promise(resolve => setTimeout(resolve, 900));
      const image = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 92, fromSurface: true,
      });
      await fs.writeFile(path.join(outDir, filename), Buffer.from(image.result.data, 'base64'));
      console.log('Saved', filename, JSON.stringify(compact));
    };
    await capture('village', '01-gameplay-village-1600x900.jpg');
    await capture('folk', '02-gameplay-folk-1600x900.jpg');
    await capture('tech', '03-gameplay-tech-1600x900.jpg');
    await cdp.send('Page.close').catch(() => {});
    cdp.close();
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 10000));
}

console.error('AI did not unlock the technology panel within five minutes; no incomplete set was exported.');
cdp.close();
process.exit(2);
