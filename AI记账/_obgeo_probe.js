/* 几何扫描探针：逐步推进引导，记录 ring 与锚点 rect 的偏差（只读，不改业务） */
(function () {
  var KEY = 'ai_jizhang_onboard_v1';
  function out(obj) {
    var pre = document.getElementById('OBGEO');
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'OBGEO';
      document.body.appendChild(pre);
    }
    pre.textContent = 'OBGEO_BEGIN' + JSON.stringify(obj) + 'OBGEO_END';
  }
  function raf() { return wait(60); }   /* headless 虚拟时间下 rAF 不触发，用定时器兜底 */
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function num(v) { return Math.round(parseFloat(v || 0) * 10) / 10; }

  var PKEY = 'ai_jizhang_onboard_probe_phase';
  function phase() { try { return localStorage.getItem(PKEY); } catch (e) { return null; } }
  function mark(t) {
    var pre = document.getElementById('OBGMARK');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'OBGMARK'; document.body.appendChild(pre); }
    pre.textContent = (pre.textContent || '') + t + '@' + Date.now() + ' p=' + phase() + '; ';
  }
  mark('probe-load');

  if (phase() !== '2') {
    try { localStorage.setItem(PKEY, '2'); localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
    return;
  }
  try { localStorage.removeItem(PKEY); } catch (e) {}

  var report = { vw: innerWidth, vh: innerHeight, steps: [] };

  function snap() {
    var AJ = window.AJ || {};
    var ob = AJ.onboard;
    var root = document.querySelector('.ob-root');
    var ring = document.querySelector('.ob-ring');
    var pop = document.querySelector('.ob-pop');
    var mode = document.body.getAttribute('data-ui-mode') || 'full';
    var s = { view: document.body.getAttribute('data-view'), scrollY: Math.round(scrollY) };
    if (ob) {
      try {
        var st = ob.current(mode);
        if (st) { s.id = st.id; s.sel = ob.anchorOf(st, mode); }
      } catch (e) {}
    }
    if (ring) {
      s.ring = [num(ring.style.left), num(ring.style.top), num(ring.style.width), num(ring.style.height)];
      s.ringHidden = !!ring.hidden;
    }
    if (pop) {
      s.pop = [num(pop.style.left), num(pop.style.top)];
      s.popSize = [pop.offsetWidth, pop.offsetHeight];
      s.popClip = (pop.style.top ? (num(pop.style.top) + pop.offsetHeight > innerHeight - 12) : false);
    }
    var el = s.sel ? document.querySelector(s.sel) : null;
    if (el) {
      var r = el.getBoundingClientRect();
      s.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      s.offscreen = (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth);
      if (s.ring && !s.ringHidden) {
        /* 期望 ring = rect 外扩 8px */
        s.diff = [
          Math.round(s.ring[0] - (r.left - 8)),
          Math.round(s.ring[1] - (r.top - 8)),
          Math.round(s.ring[2] - (r.width + 16)),
          Math.round(s.ring[3] - (r.height + 16))
        ];
        s.bad = Math.abs(s.diff[0]) > 2 || Math.abs(s.diff[1]) > 2 ||
                Math.abs(s.diff[2]) > 2 || Math.abs(s.diff[3]) > 2 || s.offscreen;
      }
    } else { s.missing = !!s.sel; }
    return s;
  }

  function clickNext() {
    var pop = document.querySelector('.ob-pop');
    if (!pop) { return false; }
    var b = pop.querySelector('[data-ob="next"]');
    if (!b) { return false; }
    b.click();
    return true;
  }

  (async function run() {
    try {
      mark('run-start');
      /* 等引导首屏出现（obMaybeStart 自动弹） */
      var tries = 0;
      while (tries < 60) {
        var root = document.querySelector('.ob-root');
        if (root && !root.hidden) { break; }
        await wait(100);
        tries++;
      }
      var root = document.querySelector('.ob-root');
      mark('root=' + (root ? (!root.hidden ? 'visible' : 'hidden') : 'null'));
      if (!root || root.hidden) { out({ error: 'guide_not_started', report: report }); return; }
      await wait(900);
      for (var i = 0; i < 14; i++) {
        await raf();
        var s1 = snap();
        await wait(1000);            /* 观察「晚到回流」：ring 是否还在自己动 */
        var s2 = snap();
        s2.phase = 'settled';
        report.steps.push({ at: i, first: s1, settled: s2 });
        mark('step' + i + '=' + (s1.id || '?'));
        if (s1.id === 'map') {
          /* 布局取证：pop / 按钮区 / 主按钮的实际盒子 */
          var popEl = document.querySelector('.ob-pop');
          var rowEl = popEl && popEl.querySelector('.ob-btns');
          var pEl = popEl && popEl.querySelector('.ob-btn.primary');
          var gEl = popEl && popEl.querySelector('.ob-btn.ghost');
          function bx(e) { if (!e) return null; var r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }
          function flx(e) { if (!e) return null; var c = getComputedStyle(e); return { flex: c.flex, width: c.width, minW: c.minWidth, pad: c.padding, textAlign: c.textAlign }; }
          report.mapLayout = {
            pop: bx(popEl), popClass: popEl ? popEl.className : null,
            row: bx(rowEl), primary: bx(pEl), ghost: bx(gEl),
            primaryCss: flx(pEl), ghostCss: flx(gEl),
            cs: rowEl ? (function (c) { return { as: c.alignSelf, w: c.width, disp: c.display, wrap: c.flexWrap }; })(getComputedStyle(rowEl)) : null,
            popCs: popEl ? (function (c) { return { ai: c.alignItems, w: c.width, disp: c.display, fd: c.flexDirection }; })(getComputedStyle(popEl)) : null
          };
          break;
        }
        if (!clickNext()) { mark('no-next'); break; }
      }
      out(report);
    } catch (err) {
      out({ error: String(err && err.stack || err), report: report });
    }
  })();
})();
