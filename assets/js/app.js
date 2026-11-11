/* 城市的生命系统：界面、镜头、时间与故障推演。 */
(function () {
  'use strict';
  var D = window.CITY_DATA, W = window.World, T = THREE;
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = $('#scene');

  var glOK = false;
  try { var tc = document.createElement('canvas'); glOK = !!(tc.getContext('webgl2') || tc.getContext('webgl')); } catch (e) { }
  if (glOK) { try { W.init(canvas); } catch (e) { console.error(e); glOK = false; } }
  if (!glOK) { $('#nogl').hidden = false; $('#intro').hidden = true; document.body.classList.add('no-gl'); return; }

  var SYS = D.systems, ORDER = D.order;
  function sname(id) { return SYS[id].short || SYS[id].name; }

  /* ---------- 状态 ---------- */
  var st = {
    mode: 'overview', focus: null, hour: 19.6, playing: !reduce, rate: .16, ghost: false, intro: true,
    fault: { cut: [], t: 0, playing: false, res: null, h0: 18, speed: 1.5 },
    tour: -1, ride: null, sel: null
  };
  var levels = {};
  ORDER.forEach(function (id) { levels[id] = { act: 1, health: 1 }; });
  function act(id, h) { var c = SYS[id].curve, i = Math.floor(h) % 24, f = h - Math.floor(h); return c[i] + (c[(i + 1) % 24] - c[i]) * f; }

  /* ---------- 镜头 ---------- */
  var HOME = { tx: 6, ty: 0, tz: -10, az: -1.02, pol: .9, dist: 395 };
  var cam = { cur: { tx: 0, ty: 8, tz: 0, az: -1.5, pol: 1.13, dist: 300 }, goal: {}, rate: 1.2, sx: 0, sy: 0 };
  Object.keys(HOME).forEach(function (k) { cam.goal[k] = cam.cur[k]; });
  function fly(o, rate) {
    Object.keys(o).forEach(function (k) { cam.goal[k] = o[k]; });
    cam.rate = rate || 2;
    if (reduce) Object.keys(cam.goal).forEach(function (k) { cam.cur[k] = cam.goal[k]; });
  }
  function camApply(dt) {
    var k = Math.min(1, dt * cam.rate), c = cam.cur, g = cam.goal;
    Object.keys(c).forEach(function (key) { c[key] += (g[key] - c[key]) * k; });
    var fit = Math.max(1, .95 / W.camera.aspect), d = c.dist * fit, sp = Math.sin(c.pol);
    W.camera.position.set(c.tx + d * sp * Math.cos(c.az), c.ty + d * Math.cos(c.pol), c.tz + d * sp * Math.sin(c.az));
    W.camera.lookAt(c.tx, c.ty, c.tz);
    // 让城市落在没被面板挡住的那块区域的中间
    var vw = canvas.clientWidth, vh = canvas.clientHeight, gx = 0, gy = 0, open = panelOpen();
    if (vw <= 820) {
      var bottom = st.intro ? 0 : 127 + (open ? open.offsetHeight : 0);
      gy = (bottom - (st.intro ? 0 : 96)) / 2;
    } else {
      var left = st.intro ? vw * .34 : st.ride ? 0 : (vw <= 1080 ? 268 : 312), right = open ? (vw <= 1080 ? 332 : 360) : 0;
      gx = (right - left) / 2; gy = st.intro ? 0 : 14;
    }
    cam.sx += (gx - cam.sx) * Math.min(1, dt * 3); cam.sy += (gy - cam.sy) * Math.min(1, dt * 3);
    W.camera.setViewOffset(vw, vh, cam.sx, cam.sy, vw, vh);
    W.scene.fog.near = d * .85 + 80; W.scene.fog.far = d * 2.4 + 520;
  }
  function panelOpen() {
    if (st.ride) return null;
    var d = $('#detail'), f = $('#fault');
    if (!f.hidden && st.tour < 0) return f;
    if (st.tour >= 0) return $('#tour');
    if (!d.hidden) return d;
    return null;
  }
  function sysView(id) {
    var ns = W.systems[id].nodes, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    ns.forEach(function (n) { x0 = Math.min(x0, n.pos.x); x1 = Math.max(x1, n.pos.x); z0 = Math.min(z0, n.pos.z); z1 = Math.max(z1, n.pos.z); });
    var ext = Math.max(x1 - x0, z1 - z0);
    return { tx: (x0 + x1) / 2 * .6 + 4, ty: 0, tz: (z0 + z1) / 2 * .6 - 8, az: -1.02 + (ORDER.indexOf(id) - 4) * .07, pol: .8, dist: clamp(ext * 1.5 + 110, 280, 385) };
  }

  var ptr = new Map(), drag = null, pinch = null;
  function userMoved() { cam.rate = 12; }
  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { }
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { t: performance.now(), moved: 0, btn: e.button, shift: e.shiftKey, x: e.clientX, y: e.clientY };
    if (ptr.size === 2) { var a = Array.from(ptr.values()); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 }; }
    hideHover();
  });
  function pan(dx, dy) {
    var g = cam.goal, s = g.dist * .0016, az = g.az;
    g.tx = clamp(g.tx - Math.sin(az) * dx * s - Math.cos(az) * dy * s, -150, 150);
    g.tz = clamp(g.tz + Math.cos(az) * dx * s - Math.sin(az) * dy * s, -150, 150);
  }
  canvas.addEventListener('pointermove', function (e) {
    var p = ptr.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') hover(e.clientX, e.clientY); return; }
    var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 1 && drag) {
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved < 4) return;
      if (drag.btn === 2 || drag.btn === 1 || drag.shift) pan(dx, dy);
      else { cam.goal.az += dx * .005; cam.goal.pol = clamp(cam.goal.pol - dy * .004, .1, 1.46); }
      userMoved();
    } else if (ptr.size === 2 && pinch) {
      var a = Array.from(ptr.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
      if (d > 0 && pinch.d > 0) cam.goal.dist = clamp(cam.goal.dist * pinch.d / d, 28, 900);
      pan(cx - pinch.cx, cy - pinch.cy);
      pinch.d = d; pinch.cx = cx; pinch.cy = cy; if (drag) drag.moved = 99; userMoved();
    }
  });
  function ptrEnd(e) {
    if (!ptr.has(e.pointerId)) return;
    ptr.delete(e.pointerId);
    if (ptr.size < 2) pinch = null;
    if (ptr.size === 0 && drag && drag.moved < 7 && performance.now() - drag.t < 500 && e.type === 'pointerup') clickAt(e.clientX, e.clientY);
    if (ptr.size === 0) drag = null;
  }
  canvas.addEventListener('pointerup', ptrEnd); canvas.addEventListener('pointercancel', ptrEnd);
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); cam.goal.dist = clamp(cam.goal.dist * Math.exp(e.deltaY * .0012), 28, 900); userMoved(); }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerleave', hideHover);
  canvas.addEventListener('keydown', function (e) {
    var g = cam.goal, used = true;
    if (e.key === 'ArrowLeft') g.az -= .12; else if (e.key === 'ArrowRight') g.az += .12;
    else if (e.key === 'ArrowUp') g.pol = clamp(g.pol - .08, .1, 1.46); else if (e.key === 'ArrowDown') g.pol = clamp(g.pol + .08, .1, 1.46);
    else if (e.key === '+' || e.key === '=') g.dist = clamp(g.dist * .88, 28, 900); else if (e.key === '-') g.dist = clamp(g.dist * 1.14, 28, 900);
    else used = false;
    if (used) { e.preventDefault(); userMoved(); }
  });

  /* ---------- 左侧：生命体征 ---------- */
  var rows = {}, WW = 120, WH = 28;
  function wavePath(vals) {
    var n = vals.length, d = '';
    for (var i = 0; i < n; i++) d += (i ? 'L' : 'M') + (i / (n - 1) * WW).toFixed(1) + ' ' + (WH - 2 - vals[i] * (WH - 5)).toFixed(1);
    return d;
  }
  function dayVals(id) { return SYS[id].curve.concat([SYS[id].curve[0]]); }
  ORDER.forEach(function (id) {
    var s = SYS[id], li = el('li'), b = el('button', 'row');
    b.type = 'button'; b.dataset.sys = id; b.style.setProperty('--c', s.color); b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span class="dot"></span><span class="nm">' + sname(id) + '<small>' + s.organ + '</small></span>' +
      '<svg class="wave" viewBox="0 0 ' + WW + ' ' + WH + '" preserveAspectRatio="none" aria-hidden="true"><path class="ln"/><line class="cur" y1="0" y2="' + WH + '"/><circle class="pt" r="2.2"/></svg>' +
      '<span class="val"></span>';
    li.appendChild(b); $('#rows').appendChild(li);
    rows[id] = { btn: b, ln: $('.ln', b), cur: $('.cur', b), pt: $('.pt', b), val: $('.val', b), vals: null };
    b.addEventListener('click', function () { setFocus(st.focus === id ? null : id, true); });
  });
  function setWaves() {
    var f = st.mode === 'fault' && st.fault.res;
    ORDER.forEach(function (id) {
      var vals;
      if (f) { vals = []; for (var i = 0; i <= 72; i++) vals.push(Sim.sample(st.fault.res, id, i)); }
      else if (st.mode === 'fault') vals = [1, 1];
      else vals = dayVals(id);
      rows[id].vals = vals; rows[id].ln.setAttribute('d', wavePath(vals));
    });
    $('#valHead').textContent = st.mode === 'fault' ? '剩余能力' : '当前负荷';
    $('#monHint').textContent = st.mode === 'fault' ? '曲线是这张网在 72 小时里剩下的能力。' : '点一行，单独看这张网。';
  }
  function tickMonitor() {
    var f = st.mode === 'fault', frac = f ? st.fault.t / 72 : st.hour / 24;
    ORDER.forEach(function (id) {
      var r = rows[id], x = frac * WW, v = f ? levels[id].health : levels[id].act;
      r.cur.setAttribute('x1', x); r.cur.setAttribute('x2', x);
      r.pt.setAttribute('cx', x); r.pt.setAttribute('cy', WH - 2 - v * (WH - 5));
      r.val.textContent = Math.round(v * 100);
      r.btn.classList.toggle('low', f && v < .5);
      r.btn.classList.toggle('dead', f && v < .2);
    });
  }

  /* ---------- 右侧：系统详情 ---------- */
  function bufText(b) { return b < 1 ? '储备约 ' + Math.round(b * 60) + ' 分钟' : '储备约 ' + b + ' 小时'; }
  function depList(list, key) {
    if (!list.length) return '<p class="none">没有别的网靠它运转。受影响的直接是人。</p>';
    return '<ul class="deps">' + list.sort(function (a, b) { return b.w - a.w; }).map(function (d) {
      var o = d[key];
      return '<li><button type="button" data-go="' + o + '" style="--c:' + SYS[o].color + '"><span class="dot"></span><b>' + sname(o) + '</b>' +
        '<span class="bar"><i style="width:' + Math.round(d.w * 100) + '%"></i></span><small>' + bufText(d.buf) + '</small><em>' + d.text + '</em></button></li>';
    }).join('') + '</ul>';
  }
  function bigChart(id) {
    var c = dayVals(id), w = 280, h = 74, d = '', a;
    for (var i = 0; i < c.length; i++) d += (i ? 'L' : 'M') + (i / 24 * w).toFixed(1) + ' ' + (h - 4 - c[i] * (h - 12)).toFixed(1);
    a = d + 'L' + w + ' ' + h + 'L0 ' + h + 'Z';
    var ticks = [0, 6, 12, 18, 24].map(function (t) { return '<text x="' + (t / 24 * w) + '" y="' + (h + 13) + '" text-anchor="' + (t === 0 ? 'start' : t === 24 ? 'end' : 'middle') + '">' + t + ' 时</text>'; }).join('');
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + (h + 16) + '" aria-hidden="true"><path class="area" d="' + a + '"/><path class="ln" d="' + d + '"/><line class="cur" id="chartCur" y1="0" y2="' + h + '"/>' + ticks + '</svg>';
  }
  function renderDetail() {
    var p = $('#detail'), id = st.focus;
    if (!id || st.mode === 'fault') { p.hidden = true; return; }
    var s = SYS[id];
    p.style.setProperty('--c', s.color);
    p.innerHTML = '<button type="button" class="x" aria-label="关闭">×</button>' +
      '<p class="organ"><span class="dot"></span>城市的' + s.organ + '</p><h2>' + s.name + '</h2>' +
      '<p class="lead">' + s.lead + '</p><p>' + s.body + '</p>' +
      '<h3>一天的节律</h3>' + bigChart(id) + '<p>' + s.rhythm + '</p>' +
      '<div class="acts"><button type="button" class="btn" id="actRide">' + s.journey.label + '</button><button type="button" class="btn ghost" id="actCut">切断它，看连锁反应</button></div>' +
      '<h3>它靠谁</h3>' + depList(D.deps.filter(function (d) { return d.to === id; }), 'on') +
      '<h3>谁靠它</h3>' + depList(D.deps.filter(function (d) { return d.on === id; }), 'to') +
      '<h3>如果它停了</h3><p>' + s.down + '</p>';
    p.hidden = false; p.scrollTop = 0;
    $('.x', p).addEventListener('click', function () { setFocus(null, true); });
    $('#actRide').addEventListener('click', function () { startRide(id); });
    $('#actCut').addEventListener('click', function () { setMode('fault'); setCut([id]); });
    p.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { setFocus(b.dataset.go, true); }); });
  }

  function setFocus(id, moveCam) {
    st.focus = id; st.sel = null; $('#nodecard').hidden = true;
    ORDER.forEach(function (k) { rows[k].btn.setAttribute('aria-pressed', k === id ? 'true' : 'false'); });
    document.body.classList.toggle('has-focus', !!id);
    renderDetail(); buildLabels();
    if (moveCam && st.mode === 'overview' && !st.ride) fly(id ? sysView(id) : HOME, 2);
  }

  /* ---------- 模式 ---------- */
  function setMode(m) {
    if (st.ride) endRide();
    var prev = st.mode; st.mode = m;
    document.body.dataset.mode = m;
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'); });
    $('#fault').hidden = m !== 'fault';
    if (m === 'fault') { st.fault.h0 = st.hour; st.fault.t = 0; if (prev !== 'fault') { st.fault.cut = []; st.fault.res = null; st.fault.playing = false; } renderFault(); }
    if (prev === 'fault' && m !== 'fault') { ORDER.forEach(function (id) { levels[id].health = 1; }); }
    if (m === 'layers') { var tall = W.camera.aspect < .8; W.layerGap = tall ? 25 : 13; fly(tall ? { tx: 0, ty: 104, tz: 0, az: -.82, pol: 1.24, dist: 455 } : { tx: 0, ty: 60, tz: 0, az: -.82, pol: 1.2, dist: 470 }, 1.6); }
    else if (m === 'fault') fly({ tx: 6, ty: 0, tz: -10, az: -1.02, pol: .86, dist: 400 }, 1.6);
    else fly(st.focus ? sysView(st.focus) : HOME, 1.6);
    var t = $('#time');
    if (m === 'fault') { t.max = 72; t.step = .05; t.value = st.fault.t; } else { t.max = 24; t.step = .02; t.value = st.hour; }
    setWaves(); renderDetail(); buildLabels(); syncPlay(); tickUI(true);
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });
  $('#btnGhost').addEventListener('click', function () { st.ghost = !st.ghost; this.setAttribute('aria-pressed', st.ghost); });

  /* ---------- 故障推演 ---------- */
  var ringEls = { nodes: {}, edges: [] }, logItems = [];
  (function buildFaultUI() {
    var cuts = $('#cuts');
    ORDER.forEach(function (id) {
      var b = el('button', 'cut', '<span class="dot"></span>' + sname(id)); b.type = 'button'; b.dataset.sys = id; b.style.setProperty('--c', SYS[id].color); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { var c = st.fault.cut.slice(), i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else c.push(id); setCut(c); });
      cuts.appendChild(b);
    });
    var svg = $('#ring'), NS = 'http://www.w3.org/2000/svg', R = 80, pos = {};
    ORDER.forEach(function (id, i) { var a = -Math.PI / 2 + i / ORDER.length * Math.PI * 2; pos[id] = [Math.cos(a) * R, Math.sin(a) * R]; });
    var ge = document.createElementNS(NS, 'g'); svg.appendChild(ge);
    D.deps.forEach(function (d) {
      var a = pos[d.on], b = pos[d.to], p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'Q' + ((a[0] + b[0]) * .12).toFixed(1) + ' ' + ((a[1] + b[1]) * .12).toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1));
      p.setAttribute('stroke', SYS[d.on].color); p.setAttribute('stroke-width', (.4 + d.w * 1.6).toFixed(2)); p.setAttribute('class', 'edge');
      ge.appendChild(p); ringEls.edges.push({ el: p, d: d });
    });
    ORDER.forEach(function (id) {
      var g = document.createElementNS(NS, 'g'), c = document.createElementNS(NS, 'circle'), t = document.createElementNS(NS, 'text'), p = pos[id];
      g.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')'); g.setAttribute('class', 'rnode');
      c.setAttribute('r', 9); c.setAttribute('fill', SYS[id].color);
      t.textContent = sname(id); t.setAttribute('y', p[1] < -10 ? -15 : p[1] > 10 ? 24 : 4); t.setAttribute('x', Math.abs(p[1]) <= 60 && Math.abs(p[0]) > 40 ? (p[0] > 0 ? 14 : -14) : 0);
      t.setAttribute('text-anchor', Math.abs(p[1]) <= 60 && Math.abs(p[0]) > 40 ? (p[0] > 0 ? 'start' : 'end') : 'middle');
      if (Math.abs(p[1]) <= 60 && Math.abs(p[0]) > 40) t.setAttribute('y', 4);
      g.appendChild(c); g.appendChild(t); svg.appendChild(g); ringEls.nodes[id] = { g: g, c: c };
    });
    $('#btnRestore').addEventListener('click', function () { setCut([]); });
  })();
  function fmtT(t) { var h = Math.floor(t), m = Math.round((t - h) * 60); if (m === 60) { h++; m = 0; } return '+' + h + ':' + (m < 10 ? '0' : '') + m; }
  function fmtSpan(t) { var h = Math.floor(t), m = Math.round((t - h) * 60); if (m === 60) { h++; m = 0; } return h ? h + ' 小时' + (m ? ' ' + m + ' 分' : '') : m + ' 分钟'; }
  function setCut(list) {
    var f = st.fault; f.cut = list; f.t = 0; f.h0 = st.mode === 'fault' ? f.h0 : st.hour;
    f.res = list.length ? Sim.run(D, list, 72, .1) : null; f.playing = !!list.length;
    renderFault(); setWaves(); syncPlay();
  }
  function renderFault() {
    var f = st.fault, log = $('#log');
    document.querySelectorAll('#cuts .cut').forEach(function (b) { b.setAttribute('aria-pressed', f.cut.indexOf(b.dataset.sys) >= 0 ? 'true' : 'false'); });
    $('#btnRestore').hidden = !f.cut.length;
    log.innerHTML = ''; logItems = [];
    if (!f.res) { log.appendChild(el('li', 'empty', '还没有故障。在上面选一个系统切断。')); return; }
    f.res.events.forEach(function (ev) {
      var li = el('li', 'ev ' + ev.kind, '<time>' + fmtT(ev.t) + '</time><span class="dot" style="background:' + SYS[ev.sys].color + '"></span><span><b>' + sname(ev.sys) + '</b>' + (ev.kind === 'dep' ? '：' + ev.text : ev.kind === 'cut' ? '被切断' : ev.kind === 'half' ? '只剩不到一半的能力' : '基本停摆') + '</span>');
      li.hidden = true; log.appendChild(li); logItems.push({ el: li, t: ev.t, ev: ev });
    });
    var onlyEnd = f.res.events.every(function (e) { return e.kind === 'cut'; });
    if (onlyEnd) log.appendChild(el('li', 'empty', '没有别的网靠它运转，所以没有连锁反应。受影响的直接是人。'));
  }
  var lastLog = -1;
  function tickFault() {
    var f = st.fault, shown = -1;
    logItems.forEach(function (it, i) { var on = it.t <= f.t + 1e-6; if (it.el.hidden === on) it.el.hidden = !on; if (on) shown = i; });
    if (shown !== lastLog) { lastLog = shown; var log = $('#log'); log.scrollTop = log.scrollHeight; }
    ORDER.forEach(function (id) {
      var h = levels[id].health, n = ringEls.nodes[id];
      n.c.setAttribute('r', (4 + 6 * h).toFixed(1)); n.c.setAttribute('fill-opacity', (.25 + .75 * h).toFixed(2));
      n.g.classList.toggle('cut', f.cut.indexOf(id) >= 0);
    });
    ringEls.edges.forEach(function (e) {
      var on = false;
      if (f.res) for (var i = 0; i < logItems.length; i++) { var ev = logItems[i].ev; if (ev.kind === 'dep' && ev.sys === e.d.to && ev.from === e.d.on && ev.t <= f.t) { on = true; break; } }
      e.el.classList.toggle('on', on);
    });
  }

  /* ---------- 时间条 ---------- */
  var timeEl = $('#time'), scrubbing = false;
  function isPlaying() { return st.mode === 'fault' ? st.fault.playing : st.playing; }
  function syncPlay() { var p = isPlaying(); $('#btnPlay').classList.toggle('paused', !p); $('#btnPlay').setAttribute('aria-label', p ? '暂停' : '播放'); }
  $('#btnPlay').addEventListener('click', function () {
    if (st.mode === 'fault') { var f = st.fault; if (!f.res) return; if (f.t >= 72) f.t = 0; f.playing = !f.playing; }
    else st.playing = !st.playing;
    syncPlay();
  });
  timeEl.addEventListener('input', function () {
    var v = parseFloat(timeEl.value);
    if (st.mode === 'fault') { st.fault.t = st.fault.res ? v : 0; } else st.hour = v % 24;
    tickUI(true);
  });
  timeEl.addEventListener('pointerdown', function () { scrubbing = true; });
  window.addEventListener('pointerup', function () { scrubbing = false; });
  function phaseText(h) { var p = D.phases[0][1]; D.phases.forEach(function (x) { if (h >= x[0]) p = x[1]; }); return p; }
  function clockText(h) { var hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
  var lastUI = 0;
  function tickUI(force) {
    var now = performance.now();
    if (!force && now - lastUI < 90) return; lastUI = now;
    $('#clock').textContent = clockText(st.hour);
    if (st.mode === 'fault') {
      var f = st.fault;
      if (!scrubbing) timeEl.value = f.t;
      timeEl.disabled = !f.res;
      $('#day').textContent = f.res ? '故障后 ' + fmtSpan(f.t) : '';
      var last = null; logItems.forEach(function (it) { if (it.t <= f.t) last = it; });
      $('#phase').textContent = !f.res ? '先在右侧选一个要切断的系统。' : last ? sname(last.ev.sys) + (last.ev.kind === 'dep' ? '：' + last.ev.text : last.ev.kind === 'cut' ? '被切断。' : last.ev.kind === 'half' ? '只剩不到一半的能力。' : '基本停摆。') : '';
      tickFault();
    } else {
      if (!scrubbing) timeEl.value = st.hour;
      timeEl.disabled = false;
      $('#day').textContent = ''; $('#phase').textContent = phaseText(st.hour);
      var cc = $('#chartCur'); if (cc) { cc.setAttribute('x1', st.hour / 24 * 280); cc.setAttribute('x2', st.hour / 24 * 280); }
    }
    tickMonitor();
  }

  /* ---------- 标签、点选 ---------- */
  var labelBox = $('#labels'), labels = [], tmpV = new T.Vector3();
  function buildLabels() {
    labelBox.innerHTML = ''; labels = [];
    if (st.mode === 'layers') {
      ORDER.forEach(function (id) {
        var e = el('span', 'lab layer', sname(id)); e.style.setProperty('--c', SYS[id].color); labelBox.appendChild(e);
        labels.push({ el: e, layer: id });
      });
    } else if (st.focus) {
      var seen = {};
      W.systems[st.focus].nodes.forEach(function (n) {
        if (!n.label) return;
        var e = el('span', 'lab', n.name); e.style.setProperty('--c', SYS[st.focus].color); labelBox.appendChild(e);
        labels.push({ el: e, node: n });
      });
    }
  }
  var CORNERS = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  function placeLabels() {
    var corner = CORNERS[0];
    if (st.mode === 'layers') {
      var bx = 1e9;
      CORNERS.forEach(function (c) { tmpV.set(c[0], (10 + 4 * W.layerGap) * W.explode, c[1]); var q = W.project(tmpV); if (q.x < bx) { bx = q.x; corner = c; } });
    }
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i], s;
      if (L.layer) { var S = W.systems[L.layer]; tmpV.set(corner[0], S.group.position.y, corner[1]); s = W.project(tmpV); s.x = Math.max(s.x, canvas.clientWidth <= 820 ? 4 : 76); L.el.style.opacity = (st.focus && st.focus !== L.layer ? .35 : 1) * W.explode; }
      else { W.nodeAnchor(L.node, tmpV); s = W.project(tmpV, 1.6); }
      L.el.style.display = s.ok ? '' : 'none';
      L.el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px)';
    }
    if (st.sel) {
      W.nodeAnchor(st.sel, tmpV); var p = W.project(tmpV, 1.2), card = $('#nodecard');
      var w = card.offsetWidth, x = clamp(p.x - w / 2, 8, window.innerWidth - w - 8), y = clamp(p.y - card.offsetHeight - 18, 64, window.innerHeight - card.offsetHeight - 8);
      card.style.transform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px)';
    }
  }
  function clickAt(x, y) {
    if (st.ride || st.mode === 'layers') return;
    var n = W.pick(x, y, st.focus, 34);
    if (!n) { st.sel = null; $('#nodecard').hidden = true; return; }
    st.sel = n;
    var card = $('#nodecard'), s = SYS[n.sys];
    card.style.setProperty('--c', s.color);
    card.innerHTML = '<p class="organ"><span class="dot"></span>' + s.name + '</p><h3>' + n.name + '</h3><p>' + n.note + '</p>' +
      (st.focus === n.sys || st.mode === 'fault' ? '' : '<button type="button" class="btn small" id="cardGo">看这张网</button>');
    card.hidden = false;
    var go = $('#cardGo'); if (go) go.addEventListener('click', function () { setFocus(n.sys, true); });
  }
  var hoverTip = $('#hovertip');
  function hideHover() { hoverTip.hidden = true; canvas.style.cursor = ''; }
  function hover(x, y) {
    if (st.ride || st.mode === 'layers') { hideHover(); return; }
    var n = W.pick(x, y, st.focus, 26);
    if (!n) { hideHover(); return; }
    canvas.style.cursor = 'pointer'; hoverTip.textContent = n.name; hoverTip.hidden = false;
    hoverTip.style.transform = 'translate(' + (x + 14) + 'px,' + (y + 14) + 'px)';
  }

  /* ---------- 跟随镜头 ---------- */
  function startRide(id) {
    if (st.mode !== 'overview') setMode('overview');
    if (st.focus !== id) setFocus(id, false);
    var pts = W.journeys[id], cum = [0], i;
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    var n = pts.length, xyz = new Float32Array(n * 3);
    pts.forEach(function (p, k) { xyz[k * 3] = p.x; xyz[k * 3 + 1] = p.y; xyz[k * 3 + 2] = p.z; });
    var len = cum[n - 1];
    st.ride = { id: id, path: { xyz: xyz, cum: Float32Array.from(cum), len: len, n: n }, d: 0, speed: len / (reduce ? 14 : 26), caps: SYS[id].journey.caps, cap: -1, back: cam.goal.dist };
    W.tracerMat.uniforms.uColor.value.set(SYS[id].color);
    W.tracer.visible = true;
    document.body.classList.add('riding'); $('#ride').hidden = false; $('#ride').style.setProperty('--c', SYS[id].color);
    st.sel = null; $('#nodecard').hidden = true;
  }
  function endRide() {
    if (!st.ride) return;
    var id = st.ride.id; st.ride = null; W.tracer.visible = false;
    document.body.classList.remove('riding'); $('#ride').hidden = true;
    fly(sysView(id), 1.6);
  }
  $('#rideEnd').addEventListener('click', endRide);
  var rp = [0, 0, 0], rq = [0, 0, 0];
  function tickRide(dt) {
    var r = st.ride; if (!r) return;
    r.d += r.speed * dt;
    if (r.d >= r.path.len) { r.d = r.path.len; if (!r.done) { r.done = performance.now(); } else if (performance.now() - r.done > 2600) { endRide(); return; } }
    var f = r.d / r.path.len, ci = -1;
    r.caps.forEach(function (c, i) { if (f >= c[0]) ci = i; });
    if (ci !== r.cap) { r.cap = ci; $('#rideCap').textContent = r.caps[ci][1]; }
    $('#rideProg').style.width = (f * 100).toFixed(1) + '%';
    W.pointAt(r.path, r.d, rp, 0); W.pointAt(r.path, Math.min(r.path.len, r.d + 14), rq, 0);
    var arr = W.tracer.geometry.attributes.position.array, tmp = [0, 0, 0];
    for (var k = 0; k < W.tracerN; k++) { W.pointAt(r.path, Math.max(0, r.d - k * 1.1), tmp, 0); arr[k * 3] = tmp[0]; arr[k * 3 + 1] = tmp[1]; arr[k * 3 + 2] = tmp[2]; }
    W.tracer.geometry.attributes.position.needsUpdate = true;
    var g = cam.goal, dx = rq[0] - rp[0], dz = rq[2] - rp[2];
    g.tx = rp[0]; g.ty = rp[1]; g.tz = rp[2];
    if (Math.hypot(dx, dz) > .5) {
      var want = Math.atan2(-dz, -dx) + .5, cur = g.az, diff = want - cur;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      g.az = cur + diff * Math.min(1, dt * 1.2);
    }
    g.pol = 1.05; g.dist = clamp(g.dist, 40, 95); if (!r.zoomed) { g.dist = 62; r.zoomed = true; }
    cam.rate = 3;
  }

  /* ---------- 导览 ---------- */
  function tourGo(i) {
    var steps = D.tour; i = clamp(i, 0, steps.length - 1); st.tour = i;
    var s = steps[i];
    document.body.classList.add('touring'); $('#tour').hidden = false;
    $('#tourCount').textContent = (i + 1) + ' / ' + steps.length;
    $('#tourTitle').textContent = s.t;
    $('#tourText').textContent = s.sys ? SYS[s.sys].lead + SYS[s.sys].rhythm : s.p;
    $('#tourPrev').disabled = i === 0;
    $('#tourNext').textContent = i === steps.length - 1 ? '开始自由探索' : '下一步';
    if (s.sys) { if (st.mode !== 'overview') setMode('overview'); st.playing = true; setFocus(s.sys, true); }
    else if (s.act === 'layers') { setFocus(null, false); setMode('layers'); }
    else if (s.act === 'fault') { setFocus(null, false); st.hour = 18; setMode('fault'); setCut(['power']); }
    else { if (st.mode !== 'overview') setMode('overview'); setFocus(null, true); if (s.act === 'intro') { st.hour = 19.6; } st.playing = !reduce; }
    syncPlay();
  }
  function tourEnd() {
    st.tour = -1; document.body.classList.remove('touring'); $('#tour').hidden = true;
    renderDetail();
  }
  $('#tourPrev').addEventListener('click', function () { tourGo(st.tour - 1); });
  $('#tourNext').addEventListener('click', function () { if (st.tour >= D.tour.length - 1) tourEnd(); else tourGo(st.tour + 1); });
  $('#tourExit').addEventListener('click', tourEnd);
  $('#btnTour').addEventListener('click', function () { if (st.tour >= 0) tourEnd(); else { leaveIntro(); tourGo(0); } });

  function leaveIntro() {
    if (!st.intro) return;
    st.intro = false; document.body.classList.remove('is-intro'); $('#intro').classList.add('gone');
    setTimeout(function () { $('#intro').hidden = true; }, 700);
    fly(HOME, 1.1);
    var t = $('#toast'), touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    t.textContent = touch ? '单指拖动旋转，双指缩放和平移' : '拖动旋转，滚轮缩放，按住 Shift 拖动平移';
    t.classList.remove('gone'); setTimeout(function () { t.classList.add('gone'); }, 6500);
  }
  $('#goTour').addEventListener('click', function () { leaveIntro(); tourGo(0); });
  $('#goFree').addEventListener('click', function () { leaveIntro(); });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (st.ride) endRide(); else if (st.tour >= 0) tourEnd(); else if (st.sel) { st.sel = null; $('#nodecard').hidden = true; } else if (st.focus) setFocus(null, true); }
  });

  /* ---------- 声音：城市的心跳 ---------- */
  var audio = null;
  function soundStart() {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    var ctx = new AC(), master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(.55, ctx.currentTime + 1.2);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = .7;
    var dg = ctx.createGain(); dg.gain.value = .045; lp.connect(dg); dg.connect(master);
    [55, 55.5, 82.6, 110.4].forEach(function (f) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); });
    audio = { ctx: ctx, master: master, lp: lp, dg: dg, next: ctx.currentTime + .4 };
    return true;
  }
  function beat(time, strength) {
    [0, .17].forEach(function (off, i) {
      var c = audio.ctx, o = c.createOscillator(), g = c.createGain(), t0 = time + off;
      o.type = 'sine'; o.frequency.setValueAtTime(i ? 120 : 150, t0); o.frequency.exponentialRampToValueAtTime(52, t0 + .16);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime((i ? .3 : .45) * strength + .0002, t0 + .014); g.gain.exponentialRampToValueAtTime(.0001, t0 + .24);
      o.connect(g); g.connect(audio.master); o.start(t0); o.stop(t0 + .27);
    });
  }
  function tickAudio() {
    if (!audio || audio.ctx.state !== 'running') return;
    var a = 0, h = 0; ORDER.forEach(function (id) { a += levels[id].act; h += levels[id].health; }); a /= 9; h /= 9;
    var now = audio.ctx.currentTime, bpm = (46 + 36 * a) * (.5 + .5 * h);
    if (audio.next < now) audio.next = now + .05;
    while (audio.next < now + .25) { beat(audio.next, .35 + .65 * h); audio.next += 60 / bpm * (1 + (Math.random() - .5) * (1 - h) * .9); }
    audio.lp.frequency.setTargetAtTime(130 + 300 * a * h, now, .5);
    audio.dg.gain.setTargetAtTime(.045 * (.2 + .8 * levels.power.health), now, .5);
  }
  $('#btnSound').addEventListener('click', function () {
    var on = this.getAttribute('aria-pressed') !== 'true';
    if (on) { if (!audio) { if (!soundStart()) return; } else { audio.ctx.resume(); audio.master.gain.setTargetAtTime(.55, audio.ctx.currentTime, .3); } }
    else if (audio) { audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, .15); setTimeout(function () { if ($('#btnSound').getAttribute('aria-pressed') !== 'true') audio.ctx.suspend(); }, 600); }
    this.setAttribute('aria-pressed', on);
  });

  /* ---------- 主循环 ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    if (st.mode === 'fault') {
      var f = st.fault;
      if (f.playing && f.res && !scrubbing) { f.t += dt * f.speed; if (f.t >= 72) { f.t = 72; f.playing = false; syncPlay(); } }
      st.hour = (f.h0 + f.t) % 24;
      ORDER.forEach(function (id) { levels[id].health = f.res ? Sim.sample(f.res, id, f.t) : 1; });
    } else if (st.playing && !scrubbing) st.hour = (st.hour + dt * st.rate) % 24;
    ORDER.forEach(function (id) { levels[id].act = act(id, st.hour); });
    if (st.intro && !reduce) cam.goal.az += dt * .035;
    tickRide(dt);
    camApply(dt);
    W.setTime(st.hour);
    W.update(dt, { hour: st.hour, levels: levels, focus: st.focus, layers: st.mode === 'layers', ghost: st.ghost });
    W.render();
    placeLabels(); tickUI(false); tickAudio();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', function () { W.resize(); });
  document.body.dataset.mode = 'overview';
  setWaves(); syncPlay(); tickUI(true);
  requestAnimationFrame(frame);

  window.__city = { st: st, cam: cam, setMode: setMode, setFocus: setFocus, setCut: setCut, startRide: startRide, tourGo: tourGo, leaveIntro: leaveIntro, fly: fly };
})();
