(function (root) {
  'use strict';
  var SB = root.SB = root.SB || {};
  SB.ui = SB.ui || {};
  SB.ui.cosmicFinale = {
    mount: function (canvas, options) {
      options = options || {};
      if (!canvas || typeof canvas.getContext !== 'function') return null;
      const W = 1920, H = 1080, DURATION = 15, START_AT = 9;
      const PLAYBACK_DURATION = DURATION - START_AT;
      const TITLE_W = 1360, TITLE_H = 450, TITLE_LEFT = (W - TITLE_W) / 2, TITLE_TOP = H * 0.49 - TITLE_H / 2;
      const COPY_LOCALE = options.locale === 'en-US' && /^[\x00-\x7F]*$/.test(String(options.title || '')) ? 'en' : 'zh-CN';
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      const background = new root.Image();
      const random = (() => {
        let seed = 0x51a7c0de;
        return () => {
          seed += 0x6D2B79F5;
          let n = seed;
          n = Math.imul(n ^ n >>> 15, n | 1);
          n ^= n + Math.imul(n ^ n >>> 7, n | 61);
          return ((n ^ n >>> 14) >>> 0) / 4294967296;
        };
      })();
      const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
      const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
      let title = String(options.title || '');
      let stars = [];
      let glyphParticles = [];
      let backgroundLayer;
      let titleLayer;
      let stopped = false;
      let animationFrame = 0;
      const reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      canvas.width = W;
      canvas.height = H;
      canvas.setAttribute('aria-hidden', 'true');
      if (!ctx) {
        if (typeof options.onError === 'function') options.onError(new Error('Canvas is unavailable.'));
        return null;
      }
      function reportProgress(ratio) {
        if (typeof options.onProgress === 'function') options.onProgress(clamp(ratio));
      }
      function stop() {
        stopped = true;
        if (animationFrame) root.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

    function buildGlyphParticles() {
      const mask = document.createElement('canvas');
      mask.width = 1500; mask.height = 410;
      const m = mask.getContext('2d', { willReadFrequently: true });
      m.clearRect(0, 0, mask.width, mask.height);
      m.textAlign = 'center'; m.textBaseline = 'middle';
      m.font = COPY_LOCALE === 'en'
        ? '700 270px Arial, sans-serif'
        : '700 252px "Microsoft YaHei", "Noto Sans CJK SC", "SimHei", sans-serif';
      m.fillStyle = '#fff';
      m.fillText(title, mask.width / 2, mask.height / 2 + 3);
      const data = m.getImageData(0, 0, mask.width, mask.height).data;
      const candidates = [];
      const sample = 4;
      for (let y = 12; y < mask.height - 12; y += sample) {
        for (let x = 12; x < mask.width - 12; x += sample) {
          if (data[(y * mask.width + x) * 4 + 3] > 155) candidates.push({ x, y });
        }
      }
      const limit = 1500;
      const stride = Math.max(1, Math.ceil(candidates.length / limit));
      const filtered = candidates.filter((_, i) => i % stride === 0).slice(0, limit);
      glyphParticles = filtered.map((p, i) => {
        const targetX = W / 2 + (p.x - mask.width / 2) * 0.86;
        const targetY = H * 0.49 + (p.y - mask.height / 2) * 0.88;
        return {
          x: targetX, y: targetY,
          delay: 0,
          size: 1.35 + random() * 1.45,
          phase: random() * Math.PI * 2,
          spark: i % 31 === 0,
          tint: random() < 0.17 ? 42 : 0
        };
      });
      const glyphBeatTimes = [6.55, 6.93, 7.30, 7.66, 8.01, 8.35, 8.68, 9.00, 9.31, 9.61, 9.90, 10.18, 10.45, 10.71, 10.96, 11.20, 11.43, 11.65];
      const glyphWeights = [5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6];
      const glyphOrder = Array.from({ length: glyphParticles.length }, (_, i) => i);
      for (let i = glyphOrder.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [glyphOrder[i], glyphOrder[j]] = [glyphOrder[j], glyphOrder[i]];
      }
      const weightTotal = glyphWeights.reduce((sum, weight) => sum + weight, 0);
      let cursor = 0;
      for (let beat = 0; beat < glyphBeatTimes.length; beat++) {
        const count = beat === glyphBeatTimes.length - 1
          ? glyphParticles.length - cursor
          : Math.round(glyphParticles.length * glyphWeights[beat] / weightTotal);
        for (let i = 0; i < count; i++) {
          glyphParticles[glyphOrder[cursor++]].delay = glyphBeatTimes[beat] + random() * 0.035;
        }
      }
    }

    function makeScene() {
      stars = Array.from({ length: 1500 }, () => ({
        x: random() * W, y: random() * H,
        size: 0.65 + random() * 1.25,
        phase: random() * Math.PI * 2,
        speed: 0.6 + random() * 1.5,
        ignite: 0,
        warm: random() < 0.13,
        spark: random() < 0.055
      }));
      const starOrder = Array.from({ length: stars.length }, (_, i) => i);
      for (let i = starOrder.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [starOrder[i], starOrder[j]] = [starOrder[j], starOrder[i]];
      }
      let cursor = 0, beatTime = 0.9;
      while (cursor < starOrder.length) {
        const batchSize = Math.min(starOrder.length - cursor, 35 + Math.floor(random() * 31));
        for (let i = 0; i < batchSize; i++) {
          stars[starOrder[cursor++]].ignite = beatTime + random() * 0.035;
        }
        beatTime += 0.22 - 0.06 * (cursor / starOrder.length);
      }
      buildGlyphParticles();
      prepareLayers();
    }

    function prepareLayers() {
      backgroundLayer = document.createElement('canvas');
      backgroundLayer.width = W; backgroundLayer.height = H;
      const bg = backgroundLayer.getContext('2d');
      const scale = Math.max(W / background.width, H / background.height) * 1.015;
      const dw = background.width * scale, dh = background.height * scale;
      bg.drawImage(background, (W - dw) / 2, (H - dh) / 2, dw, dh);
      const deep = bg.createRadialGradient(W * 0.5, H * 0.48, 180, W * 0.5, H * 0.48, W * 0.72);
      deep.addColorStop(0, 'rgba(1, 5, 16, 0.05)');
      deep.addColorStop(0.62, 'rgba(1, 6, 18, 0.18)');
      deep.addColorStop(1, 'rgba(1, 4, 13, 0.62)');
      bg.fillStyle = deep; bg.fillRect(0, 0, W, H);

      titleLayer = document.createElement('canvas');
      titleLayer.width = TITLE_W; titleLayer.height = TITLE_H;
      const titleCtx = titleLayer.getContext('2d');
      titleCtx.globalCompositeOperation = 'screen';
      for (const p of glyphParticles) {
        const x = p.x - TITLE_LEFT, y = p.y - TITLE_TOP;
        const glow = p.tint ? 'rgba(255,223,178,0.42)' : 'rgba(166,231,255,0.48)';
        titleCtx.fillStyle = glow;
        const halo = p.size * 2.4;
        titleCtx.fillRect(x - halo / 2, y - halo / 2, halo, halo);
        titleCtx.fillStyle = 'rgba(255,255,255,0.92)';
        titleCtx.fillRect(x - p.size * 0.48, y - p.size * 0.48, p.size * 0.96, p.size * 0.96);
      }
      for (let i = 0; i < glyphParticles.length; i += 37) {
        const p = glyphParticles[i];
        const x = p.x - TITLE_LEFT, y = p.y - TITLE_TOP;
        titleCtx.fillStyle = 'rgba(255,255,255,0.88)';
        titleCtx.fillRect(x - 0.8, y - 8, 1.6, 16);
        titleCtx.fillRect(x - 8, y - 0.8, 16, 1.6);
      }
    }

    function drawBackground(t) {
      ctx.drawImage(backgroundLayer, 0, 0);
      const reveal = smooth((t - 0.2) / 2.8);
      const veil = ctx.createRadialGradient(W * 0.5, H * 0.48, 100, W * 0.5, H * 0.48, W * 0.82);
      veil.addColorStop(0, `rgba(1,4,12,${0.62 * (1 - reveal)})`);
      veil.addColorStop(0.55, `rgba(1,4,12,${0.35 * (1 - reveal)})`);
      veil.addColorStop(1, `rgba(1,4,12,${0.08 * (1 - reveal)})`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, W, H);
      const extinguish = smooth((t - 13.0) / 1.2);
      if (t > 13.0) {
        ctx.fillStyle = `rgba(1, 4, 12, ${0.46 * extinguish})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawAmbientStars(t) {
      const extinguish = 1 - smooth((t - 7.65) / 1.25);
      if (extinguish <= 0.002) return;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const groups = Array.from({ length: 16 }, () => []);
      const sparkGroups = Array.from({ length: 8 }, () => []);
      for (const p of stars) {
        const age = t - p.ignite;
        if (age < 0) continue;
        const birth = smooth(age / 0.06);
        const twinkle = 0.76 + 0.24 * Math.sin(t * p.speed + p.phase);
        const alpha = birth * extinguish * twinkle * (p.warm ? 0.72 : 0.88);
        if (alpha <= 0.015) continue;
        const bin = Math.min(7, Math.floor(alpha * 8));
        const size = p.size * (0.72 + twinkle * 0.42);
        groups[(p.warm ? 8 : 0) + bin].push(p.x, p.y, size);
        if (p.spark && age < 0.42) {
          const flash = (1 - smooth(age / 0.42)) * extinguish;
          const sparkBin = Math.min(7, Math.floor(flash * 8));
          const arm = 3 + p.size * 4;
          sparkGroups[sparkBin].push(p.x - 0.55, p.y - arm, 1.1, arm * 2, p.x - arm, p.y - 0.55, arm * 2, 1.1);
        }
      }
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]; if (!group.length) continue;
        ctx.beginPath();
        for (let j = 0; j < group.length; j += 3) ctx.rect(group[j], group[j + 1], group[j + 2], group[j + 2]);
        const level = (i % 8 + 0.5) / 8;
        ctx.fillStyle = i >= 8 ? `rgba(255,220,170,${level * 0.86})` : `rgba(155,224,255,${level})`;
        ctx.fill();
      }
      for (let i = 0; i < sparkGroups.length; i++) {
        const group = sparkGroups[i]; if (!group.length) continue;
        ctx.beginPath();
        for (let j = 0; j < group.length; j += 4) ctx.rect(group[j], group[j + 1], group[j + 2], group[j + 3]);
        ctx.fillStyle = `rgba(238,250,255,${(i + 0.5) / 8 * 0.95})`;
        ctx.fill();
      }
      ctx.restore();
    }

    function drawStarFlow(t) {
      const finish = 13.0;
      const dissolve = smooth((t - finish) / 1.15);
      if (t >= 11.8 && t < finish) {
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.94 + 0.06 * Math.sin(t * 2.1);
        ctx.drawImage(titleLayer, TITLE_LEFT, TITLE_TOP);
        ctx.restore();
        return;
      }
      if (t >= finish) {
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 1 - dissolve;
        if (dissolve < 1) ctx.drawImage(titleLayer, TITLE_LEFT, TITLE_TOP);
        ctx.restore();
        return;
      }
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const glowGroups = Array.from({ length: 16 }, () => []);
      const coreGroups = Array.from({ length: 8 }, () => []);
      const sparkGroups = Array.from({ length: 8 }, () => []);
      for (const p of glyphParticles) {
        const age = t - p.delay;
        if (age < 0) continue;
        const birth = smooth(age / 0.06);
        const twinkle = 0.78 + 0.22 * Math.sin(t * (2.2 + p.phase) + p.phase);
        const alpha = birth * twinkle;
        if (alpha <= 0.015) continue;
        const x = p.x, y = p.y;
        const glowSize = p.size * 2.2;
        const glowBin = Math.min(7, Math.floor(alpha * 8));
        glowGroups[(p.tint ? 8 : 0) + glowBin].push(x - glowSize / 2, y - glowSize / 2, glowSize);
        const coreBin = Math.min(7, Math.floor(alpha * 8));
        coreGroups[coreBin].push(x - p.size * 0.48, y - p.size * 0.48, p.size * 0.96);
        if (p.spark) {
          sparkGroups[coreBin].push(x - 0.7, y - 5.5, 1.4, 11, x - 5.5, y - 0.7, 11, 1.4);
        }
      }
      for (let i = 0; i < glowGroups.length; i++) {
        const group = glowGroups[i];
        if (!group.length) continue;
        ctx.beginPath();
        for (let j = 0; j < group.length; j += 3) ctx.rect(group[j], group[j + 1], group[j + 2], group[j + 2]);
        const bin = i % 8;
        const level = (bin + 0.5) / 8;
        ctx.fillStyle = i >= 8 ? `rgba(255,223,178,${level * 0.72})` : `rgba(166,231,255,${level * 0.76})`;
        ctx.fill();
      }
      for (let i = 0; i < coreGroups.length; i++) {
        const group = coreGroups[i];
        if (!group.length) continue;
        ctx.beginPath();
        for (let j = 0; j < group.length; j += 3) ctx.rect(group[j], group[j + 1], group[j + 2], group[j + 2]);
        ctx.fillStyle = `rgba(255,255,255,${(i + 0.5) / 8})`;
        ctx.fill();
      }
      for (let i = 0; i < sparkGroups.length; i++) {
        const group = sparkGroups[i];
        if (!group.length) continue;
        ctx.beginPath();
        for (let j = 0; j < group.length; j += 4) ctx.rect(group[j], group[j + 1], group[j + 2], group[j + 3]);
        ctx.fillStyle = `rgba(255,255,255,${(i + 0.5) / 8})`;
        ctx.fill();
      }
      ctx.restore();
    }
    function drawObserverPulse(t) {
      const age = t - 12.45;
      if (age < 0 || age > 1.7) return;
      const pulse = Math.exp(-Math.pow((age - 0.4) / 0.25, 2));
      const alpha = pulse * 0.72;
      const x = W * 0.5, y = H * 0.49;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(x, y, 0, x, y, 130 + pulse * 150);
      g.addColorStop(0, `rgba(255,255,255,${alpha * 0.46})`);
      g.addColorStop(0.04, `rgba(196,240,255,${alpha * 0.29})`);
      g.addColorStop(0.32, `rgba(73,180,246,${alpha * 0.07})`);
      g.addColorStop(1, 'rgba(73,180,246,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 300, y - 300, 600, 600);
      ctx.strokeStyle = `rgba(220,246,255,${alpha * 0.25})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const r = 18 + ((age * 120 + i * 52) % 270);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    function drawFrame(time) {
      const t = clamp(time, 0, DURATION);
      drawBackground(t);
      drawAmbientStars(t);

      drawStarFlow(t);
      drawObserverPulse(t);

      if (t > 14.2) {
        const fade = 1 - smooth((t - 14.2) / 0.8);
        ctx.fillStyle = `rgba(1,4,12,${1 - fade})`;
        ctx.fillRect(0, 0, W, H);
        const pin = clamp((t - 14.4) / 0.45);
        if (pin > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 22);
          glow.addColorStop(0, `rgba(255,255,255,${pin * 0.9})`);
          glow.addColorStop(0.12, `rgba(214,241,255,${pin * 0.55})`);
          glow.addColorStop(1, 'rgba(120,190,255,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(W / 2 - 22, H / 2 - 22, 44, 44);
          ctx.fillStyle = `rgba(245,251,255,${pin})`;
          ctx.fillRect(W / 2 - 1.5, H / 2 - 1.5, 3, 3);
          ctx.restore();
        }
      }
    }
    function drawFinalCopy() {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = COPY_LOCALE === 'en'
        ? '700 96px Arial, sans-serif'
        : '700 104px "Microsoft YaHei", "Noto Sans CJK SC", "SimHei", sans-serif';
      ctx.fillStyle = '#fff0c8';
      ctx.shadowColor = 'rgba(205,231,255,.92)';
      ctx.shadowBlur = 28;
      ctx.fillText(title, W / 2, H * 0.73, TITLE_W);
      ctx.restore();
    }

      function fail(error) {
        stop();
        if (root.console && root.console.error) root.console.error('Cosmic finale could not start.', error);
        if (typeof options.onError === 'function') options.onError(error);
      }
      async function initialize() {
        const fontSpec = COPY_LOCALE === 'en' ? '700 270px Arial, sans-serif' : '700 252px "Microsoft YaHei"';
        const fontReady = root.document.fonts && root.document.fonts.load
          ? root.document.fonts.load(fontSpec).catch(() => {})
          : Promise.resolve();
        const imageReady = new Promise((resolve, reject) => {
          background.onload = resolve;
          background.onerror = () => reject(new Error('Cosmic finale background failed to load.'));
          background.src = options.backgroundUrl || 'assets/backgrounds/finale/cosmic-ending-background.png';
        });
        await Promise.all([imageReady, fontReady]);
        if (stopped) return;
        makeScene();
        if (reducedMotion) {
          drawFrame(DURATION);
          drawFinalCopy();
          reportProgress(1);
          return;
        }
        const startTime = root.performance.now();
        function tick(now) {
          if (stopped) return;
          const elapsed = Math.min(PLAYBACK_DURATION, (now - startTime) / 1000);
          drawFrame(START_AT + elapsed);
          reportProgress(elapsed / PLAYBACK_DURATION);
          if (elapsed >= PLAYBACK_DURATION) {
            drawFrame(DURATION);
            drawFinalCopy();
            reportProgress(1);
            animationFrame = 0;
            return;
          }
          animationFrame = root.requestAnimationFrame(tick);
        }
        animationFrame = root.requestAnimationFrame(tick);
      }
      reportProgress(0);
      initialize().catch(fail);
      return { stop: stop };
    }
  };
})(typeof window !== 'undefined' ? window : this);
