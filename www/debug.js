// www/debug.js — opt-in performance telemetry overlay.
//
// ENABLE by adding #debug to the URL (e.g. .../index.html#debug) then reload. Off otherwise (no probe, no
// overlay, zero cost). It installs window.__archeProbe, which arche-web.js's reactor calls once per RENDERED
// frame with (arche_frame duration in ms, callback timestamp). That duration is the whole diagnosis: if it is
// LOW while fps is bad, the cost is OUTSIDE js (the browser compositing iframes / the canvas) — if it is HIGH,
// the cost is INSIDE the wasm frame (sim + canvas render/blit).
//
// Walk to the slow area, watch the live readout, hit MARK (or press "m") when it lags, then COPY and paste the
// JSON to Claude.
(function () {
  if (!/(^|[#&])debug\b/.test(location.hash)) return;

  const T0 = performance.now();
  const nowRel = () => performance.now() - T0;

  // Ring buffer (index-based — no per-frame Array.shift, which would itself cause lag).
  const CAP = 12000;                 // ~200s at 60fps
  const buf = new Array(CAP);
  let widx = 0, count = 0;
  const pushSample = (s) => { buf[widx] = s; widx = (widx + 1) % CAP; if (count < CAP) count++; };
  const allSamples = () => { const out = []; const start = count < CAP ? 0 : widx; for (let i = 0; i < count; i++) out.push(buf[(start + i) % CAP]); return out; };

  const longtasks = [];
  const marks = [];
  let lastT = T0;

  // Per-seam timing. Each host seam (gfx_be_present, embed_be_render, textview_be_render, ...) runs
  // SYNCHRONOUSLY inside arche_frame, so its cost is part of the measured frame ms. Wrap every seam BEFORE the
  // reactor starts (debug.js loads before the archeRun call) and accumulate wall time per name. This is what
  // names the culprit instead of guessing. `seamCum[name] = { ms, frames }` -> ms/frame is its share.
  const seamCum = {};
  let frameSeam = Object.create(null);
  (function instrumentSeams() {
    const hosts = (globalThis.archeHosts ||= []);
    for (const h of hosts) {
      if (!h || typeof h.seams !== 'function' || h.__timed) continue;
      h.__timed = true;
      const orig = h.seams.bind(h);
      h.seams = (rt) => {
        const seams = orig(rt) || {};
        const wrapped = {};
        for (const k of Object.keys(seams)) {
          const fn = seams[k];
          if (typeof fn !== 'function') { wrapped[k] = fn; continue; }
          wrapped[k] = function () {
            const a = performance.now();
            const r = fn.apply(this, arguments);
            frameSeam[k] = (frameSeam[k] || 0) + (performance.now() - a);
            return r;
          };
        }
        return wrapped;
      };
    }
  })();

  // Which ui-embed-* are on screen -> bitmask. Reads the INLINE style.display the embed host sets (no layout
  // flush, unlike getComputedStyle). Cache the element list once all four exist.
  let embedEls = [];
  const mask = () => {
    if (embedEls.length < 4) embedEls = Array.prototype.slice.call(document.querySelectorAll('[id^="ui-embed-"]'));
    let m = 0;
    for (const e of embedEls) if (e.style.display !== 'none') m |= (1 << (+e.id.slice(9)));
    return m;
  };

  window.__archeProbe = (ms, t) => {
    const iv = t - lastT; lastT = t;
    for (const k in frameSeam) { const c = seamCum[k] || (seamCum[k] = { ms: 0, frames: 0 }); c.ms += frameSeam[k]; c.frames++; }
    frameSeam = Object.create(null);
    pushSample({ t: Math.round(t - T0), ms: +ms.toFixed(2), iv: +iv.toFixed(2), vem: mask() });
  };

  // Top seams by total ms — the breakdown of where each frame goes.
  const seamTop = (n) => Object.keys(seamCum)
    .map((k) => ({ seam: k, totalMs: +seamCum[k].ms.toFixed(1), msPerFrame: +(seamCum[k].ms / seamCum[k].frames).toFixed(2), frames: seamCum[k].frames }))
    .sort((a, b) => b.totalMs - a.totalMs).slice(0, n);

  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) longtasks.push({ t: Math.round(e.startTime - T0), dur: Math.round(e.duration) }); })
      .observe({ entryTypes: ['longtask'] });
  } catch (e) {}

  // Estimate display refresh over the first ~90 rAF ticks.
  let refresh = 0;
  (function () {
    const ivs = []; let prev = performance.now(), n = 0;
    const step = () => {
      const t = performance.now(); ivs.push(t - prev); prev = t;
      if (++n < 90) requestAnimationFrame(step);
      else { ivs.sort((a, b) => a - b); refresh = Math.round(1000 / ivs[ivs.length >> 1]); }
    };
    requestAnimationFrame(step);
  })();

  const summarize = () => {
    const s = allSamples();
    const now = s.length ? s[s.length - 1].t : 0;
    const win = s.filter((x) => x.t > now - 1000);
    const ivs = win.map((x) => x.iv).filter((x) => x > 0).sort((a, b) => a - b);
    const mss = win.map((x) => x.ms).sort((a, b) => a - b);
    const avg = (a) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : 0);
    const p = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0);
    return {
      fps: ivs.length ? Math.round(1000 / avg(ivs)) : 0,
      frameMsAvg: +avg(mss).toFixed(2), frameMsP95: +p(mss, 0.95).toFixed(2), frameMsMax: +(mss[mss.length - 1] || 0).toFixed(2),
      intervalP95: +p(ivs, 0.95).toFixed(2), longtasks5s: longtasks.filter((l) => l.t > now - 5000).length,
      visibleEmbeds: win.length ? win[win.length - 1].vem : 0, samples: count,
    };
  };

  // ---- overlay ----
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;font:11px/1.35 ui-monospace,monospace;' +
    'background:rgba(10,12,20,.86);color:#cdd6f4;padding:8px 10px;border:1px solid #333a5a;border-radius:6px;' +
    'min-width:190px;white-space:pre;user-select:none;';
  const stat = document.createElement('div'); box.appendChild(stat);
  const row = document.createElement('div'); box.appendChild(row);
  const mkBtn = (label, fn) => {
    const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'font:11px ui-monospace,monospace;margin:6px 6px 0 0;padding:3px 8px;background:#232a44;' +
      'color:#cdd6f4;border:1px solid #3a4570;border-radius:4px;cursor:pointer;';
    b.onclick = fn; return b;
  };

  const render = () => {
    const x = summarize();
    const bits = []; for (let i = 0; i < 4; i++) if (x.visibleEmbeds & (1 << i)) bits.push(i);
    stat.textContent =
      'fps ' + x.fps + '   frame ' + x.frameMsAvg + 'ms\n' +
      'frame p95 ' + x.frameMsP95 + '  max ' + x.frameMsMax + '\n' +
      'interval p95 ' + x.intervalP95 + 'ms\n' +
      'longtasks/5s ' + x.longtasks5s + '\n' +
      'embeds visible [' + bits.join(',') + ']\n' +
      'refresh ~' + refresh + 'Hz   samples ' + x.samples + '\n' +
      'marks ' + marks.length + '\n' +
      '─ seam ms/frame ─\n' +
      seamTop(5).map((sm) => '  ' + sm.seam.replace(/_be_/, '.') + ' ' + sm.msPerFrame).join('\n');
    stat.style.color = (x.fps && x.fps < 50) || x.frameMsAvg > 8 ? '#f38ba8' : '#a6e3a1';
  };
  setInterval(render, 250);

  const doMark = () => { marks.push({ t: Math.round(nowRel()), fps: summarize().fps, vem: mask() }); render(); };
  addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') doMark(); }, true);

  row.appendChild(mkBtn('COPY', async () => {
    const payload = {
      device: { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, refreshHz: refresh,
                cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory },
      summary: summarize(), seams: seamTop(20), marks, longtasks, samples: allSamples(),
    };
    const text = JSON.stringify(payload);
    try { await navigator.clipboard.writeText(text); alert('Copied ' + text.length + ' chars. Paste it to Claude.'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text;
      ta.style.cssText = 'position:fixed;inset:5%;z-index:100000;width:90%;height:90%;'; document.body.appendChild(ta); ta.focus(); ta.select();
    }
  }));
  row.appendChild(mkBtn('MARK', doMark));
  row.appendChild(mkBtn('CLEAR', () => { widx = 0; count = 0; longtasks.length = 0; marks.length = 0; render(); }));

  (document.body || document.documentElement).appendChild(box);
})();
