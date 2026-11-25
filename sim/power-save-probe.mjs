import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function media(legacy) {
  const listeners = [];
  const query = {
    matches: false,
    change(matches) {
      query.matches = matches;
      for (const listener of listeners) listener();
    }
  };
  if (legacy) query.addListener = callback => { listeners.push(callback); };
  else query.addEventListener = (_, callback) => { listeners.push(callback); };
  return query;
}

const reduced = media(false);
const coarse = media(true);
const queries = {
  '(prefers-reduced-motion: reduce)': reduced,
  '(pointer: coarse)': coarse,
  '(orientation: landscape)': media(false)
};
const listeners = {};
const change = [];
const selector = {};
const dataset = {};
const storage = new Map([['shellbreak.powerSave', 'auto']]);
let storageReads = 0, mediaReads = 0, refreshes = 0;
const window = {
  SB: { ui: { background: { refresh: () => { refreshes++; } } } },
  localStorage: {
    getItem(key) { storageReads++; return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); }
  },
  matchMedia(selector) { mediaReads++; return queries[selector]; },
  addEventListener(name, listener) { listeners[name] = listener; },
  document: {
    documentElement: { dataset },
    querySelector(key) { return key === 'select[data-ui-power-save]' ? selector : null; },
    querySelectorAll() { return []; },
    addEventListener(name, listener) { if (name === 'change') change.push(listener); }
  }
};
vm.runInNewContext(fs.readFileSync(new URL('../src/ui/theme.js', import.meta.url), 'utf8'), { window });
const theme = window.SB.ui.theme;
function expect(mode, active) {
  assert.equal(theme.powerSaveMode(), mode);
  assert.equal(theme.isPowerSave(), active);
  assert.equal(dataset.powerSave, active ? 'on' : 'off');
  assert.equal(selector.value, mode);
}
expect('auto', false);
const reads = [storageReads, mediaReads];
for (let i = 0; i < 1000; i++) assert.equal(theme.isPowerSave(), false);
assert.deepEqual([storageReads, mediaReads], reads);

coarse.change(true);
expect('auto', true);
coarse.change(false);
expect('auto', false);
reduced.change(true);
expect('auto', true);
assert.equal(dataset.deepBubbles, 'off');

selector.value = 'off';
for (const listener of change) {
  listener({ target: { closest: key => key === 'select[data-ui-power-save]' ? selector : null } });
}
expect('off', false);
assert.equal(storage.get('shellbreak.powerSave'), 'off');
reduced.change(false);
coarse.change(true);
expect('off', false);
assert.equal(theme.setPowerSave('on'), true);
expect('on', true);

const beforeStorage = refreshes;
storage.set('shellbreak.powerSave', 'auto');
listeners.storage({ key: 'shellbreak.powerSave' });
expect('auto', true);
assert.equal(refreshes, beforeStorage + 1);
coarse.change(false);
expect('auto', false);
console.log('Power-save mode cache, settings changes, both media queries and storage synchronization passed.');
