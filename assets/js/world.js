/* 城市的生命系统：三维世界。
   程序生成一座 16×16 街区、有一条河穿过的城市，再在上面铺九张网。 */
(function () {
  'use strict';
  var T = THREE, D = window.CITY_DATA;
  T.ColorManagement.enabled = false;
  var W = window.World = { systems: {}, nodes: [], journeys: {}, explode: 0, ghost: 0, layerGap: 13 };

  var P = 12, NN = 17, HALF = 96, NODE_N = NN * NN;
  var UP = new T.Vector3(0, 1, 0), QI = new T.Quaternion();
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry(20261110);
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function V(x, z, y) { return new T.Vector3(x, y || 0, z); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- 河 ---------- */
  var RHW = 7;
  function riverX(z) { return 34 + 10 * Math.sin((z + 20) / 38); }
  function riverD(x, z) { return Math.abs(x - riverX(z)); }

  /* ---------- 路网 ---------- */
  var adj = [];
  (function () {
    var i, j, a, c;
    for (i = 0; i < NODE_N; i++) adj.push([]);
    function wet(x, z) { return riverD(x, z) < RHW + 2.5; }
    for (j = 0; j < NN; j++) for (i = 0; i < NN; i++) {
      a = i + j * NN;
      var x = -HALF + i * P, z = -HALF + j * P;
      if (i < NN - 1) {
        var w1 = wet(x, z) || wet(x + P, z) || wet(x + P / 2, z);
        if (!w1 || j % 3 === 1) { c = j % 4 === 0 ? .8 : 1; adj[a].push([a + 1, c]); adj[a + 1].push([a, c]); }
      }
      if (j < NN - 1) {
        if (!wet(x, z) && !wet(x, z + P) && !wet(x, z + P / 2)) { c = i % 4 === 0 ? .8 : 1; adj[a].push([a + NN, c]); adj[a + NN].push([a, c]); }
      }
    }
  })();
  function nX(id) { return -HALF + (id % NN) * P; }
  function nZ(id) { return -HALF + Math.floor(id / NN) * P; }
  function nodeDry(id) { return riverD(nX(id), nZ(id)) >= RHW + 2.5 && adj[id].length > 0; }
  var djCache = {};
  function dijkstra(src) {
    if (djCache[src]) return djCache[src];
    var dist = new Float32Array(NODE_N).fill(1e9), prev = new Int16Array(NODE_N).fill(-1), done = new Uint8Array(NODE_N);
    dist[src] = 0;
    for (; ;) {
      var u = -1, b = 1e9, k;
      for (k = 0; k < NODE_N; k++) if (!done[k] && dist[k] < b) { b = dist[k]; u = k; }
      if (u < 0) break;
      done[u] = 1;
      for (k = 0; k < adj[u].length; k++) { var e = adj[u][k], nd = b + e[1]; if (nd < dist[e[0]] - 1e-6) { dist[e[0]] = nd; prev[e[0]] = u; } }
    }
    return (djCache[src] = { dist: dist, prev: prev });
  }
  function nearestNode(x, z) {
    var best = -1, bd = 1e9;
    for (var k = 0; k < NODE_N; k++) { if (!nodeDry(k)) continue; var dx = nX(k) - x, dz = nZ(k) - z, d = dx * dx + dz * dz; if (d < bd - 1e-6) { bd = d; best = k; } }
    return best;
  }
  function routeIds(a, b) {
    var r = dijkstra(a), out = [], u = b;
    if (r.dist[b] > 1e8) return [a];
    while (u !== -1) { out.push(u); if (u === a) break; u = r.prev[u]; }
    return out.reverse();
  }
  function route(A, B) {
    var ids = routeIds(nearestNode(A.x, A.z), nearestNode(B.x, B.z));
    var pts = [new T.Vector3(A.x, A.y || 0, A.z)];
    ids.forEach(function (id) { pts.push(V(nX(id), nZ(id))); });
    pts.push(new T.Vector3(B.x, B.y || 0, B.z));
    return pts;
  }
  function routeFromNode(id, B, reverse) {
    var ids = routeIds(id, nearestNode(B.x, B.z)), pts = [];
    ids.forEach(function (k) { pts.push(V(nX(k), nZ(k))); });
    pts.push(new T.Vector3(B.x, 0, B.z));
    return reverse ? pts.reverse() : pts;
  }
  function hopsFrom(x, z, maxH) {
    var src = nearestNode(x, z), seen = {}, q = [[src, 0]], out = [];
    seen[src] = 1;
    while (q.length) {
      var c = q.shift();
      if (c[1] > 0) out.push({ id: c[0], h: c[1] });
      if (c[1] >= maxH) continue;
      adj[c[0]].forEach(function (e) { if (!seen[e[0]] && nodeDry(e[0])) { seen[e[0]] = 1; q.push([e[0], c[1] + 1]); } });
    }
    return out;
  }

  /* ---------- 街区与地块 ---------- */
  function district(x, z) {
    if (x > riverX(z)) return 'ind';
    var d = Math.hypot(x + 30, z + 6);
    if (d < 25) return 'cbd';
    if (d < 43) return 'mid';
    if (x < -50 && z < -36) return 'campus';
    return 'res';
  }
  var blocks = [], LOT = [[-2.35, -2.35], [2.35, -2.35], [-2.35, 2.35], [2.35, 2.35]];
  (function () {
    for (var bj = 0; bj < 16; bj++) for (var bi = 0; bi < 16; bi++) {
      var cx = -90 + bi * P, cz = -90 + bj * P;
      blocks.push({ cx: cx, cz: cz, type: riverD(cx, cz) < 12.9 ? 'bank' : 'land', claimed: false, lots: [0, 0, 0, 0], taken: 0, dist: district(cx, cz) });
    }
  })();
  function claimBlock(x, z) {
    var best = null, bd = 1e9;
    blocks.forEach(function (b) { if (b.type !== 'land' || b.claimed || b.taken) return; var d = Math.hypot(b.cx - x, b.cz - z); if (d < bd) { bd = d; best = b; } });
    best.claimed = true;
    return { x: best.cx, z: best.cz };
  }
  function claimLot(x, z) {
    var best = null, bd = 1e9;
    blocks.forEach(function (b) { if (b.type !== 'land' || b.claimed || b.taken >= 2) return; var d = Math.hypot(b.cx - x, b.cz - z) + b.taken * 3; if (d < bd) { bd = d; best = b; } });
    var li = -1, ld = 1e9;
    LOT.forEach(function (l, i) { if (best.lots[i]) return; var d = Math.hypot(best.cx + l[0] - x, best.cz + l[1] - z); if (d < ld) { ld = d; li = i; } });
    best.lots[li] = 1; best.taken++;
    return { x: best.cx + LOT[li][0], z: best.cz + LOT[li][1] };
  }

  /* ---------- 几何合并 ---------- */
  var BOX = new T.BoxGeometry(1, 1, 1).toNonIndexed(), cylCache = {};
  function cylGeo(rt, rb, seg) { var k = rt + '_' + rb + '_' + seg; return cylCache[k] || (cylCache[k] = new T.CylinderGeometry(rt, rb, 1, seg).toNonIndexed()); }
  function Merger(flat) { this.p = []; this.c = []; this.flat = flat; }
  var _v = new T.Vector3(), _n = new T.Vector3(), _nm = new T.Matrix3(), _c = new T.Color(), _m = new T.Matrix4(), _p = new T.Vector3(), _s = new T.Vector3(), _q = new T.Quaternion();
  Merger.prototype.add = function (geo, m, color) {
    var src = geo.attributes.position, ns = geo.attributes.normal;
    _c.set(color); _nm.getNormalMatrix(m);
    for (var i = 0; i < src.count; i++) {
      _v.fromBufferAttribute(src, i).applyMatrix4(m);
      _n.fromBufferAttribute(ns, i).applyMatrix3(_nm).normalize();
      var f = this.flat ? 1 : Math.min(1.08, Math.max(.5, .74 + .28 * _n.y + .1 * _n.x - .07 * _n.z));
      this.p.push(_v.x, _v.y, _v.z); this.c.push(_c.r * f, _c.g * f, _c.b * f);
    }
  };
  Merger.prototype.mesh = function (mat) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    var m = new T.Mesh(g, mat); m.frustumCulled = false; return m;
  };
  function bx(M, x, y, z, w, h, d, col) { _m.compose(_p.set(x, y + h / 2, z), QI, _s.set(w, h, d)); M.add(BOX, _m, col); }
  function cy(M, x, y, z, rt, rb, h, col, seg) { _m.compose(_p.set(x, y + h / 2, z), QI, _s.set(1, h, 1)); M.add(cylGeo(rt, rb, seg || 14), _m, col); }

  /* ---------- 系统对象 ---------- */
  var SYS_CFG = {
    water: { y: .22, off: -1.0 }, transport: { y: .3, off: 0 }, telecom: { y: .36, off: -.55 }, logistics: { y: .44, off: .5 },
    power: { y: .5, off: 1.0 }, retail: { y: .56, off: -.28 }, hospital: { y: .62, off: .25 }, school: { y: .68, off: .75 }, finance: { y: 0, off: 0 }
  };
  D.order.forEach(function (id) {
    var cfg = SYS_CFG[id];
    W.systems[id] = {
      id: id, hex: D.systems[id].color, color: new T.Color(D.systems[id].color), group: new T.Group(), y: cfg.y, off: cfg.off,
      paths: [], segs: [], segKey: {}, flows: [], nodes: [], body: new Merger(false), glow: new Merger(true),
      layer: D.layers.indexOf(id), clock: rnd() * 100, cur: { line: .5, part: 1, fac: 1, beacon: 0 }, j: {}
    };
  });
  function addNode(S, o) {
    var n = { sys: S.id, name: o.name, note: o.note, kind: o.kind, pos: o.pos, h: o.h, label: !!o.label };
    S.nodes.push(n); W.nodes.push(n); return n;
  }
  function addSeg(S, a, b, w, tone) {
    var k1 = Math.round(a[0] * 10) + ',' + Math.round(a[1] * 10) + ',' + Math.round(a[2] * 10), k2 = Math.round(b[0] * 10) + ',' + Math.round(b[1] * 10) + ',' + Math.round(b[2] * 10);
    var key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1, ex = S.segKey[key];
    if (ex) { if (w > ex.w) ex.w = w; if (tone > ex.tone) ex.tone = tone; return; }
    S.segs.push(S.segKey[key] = { a: a, b: b, w: w, tone: tone });
  }
  function addPath(S, pts, o) {
    o = o || {};
    var off = o.off == null ? S.off : o.off, y = o.y == null ? S.y : o.y, n = pts.length, i;
    var xyz = new Float32Array(n * 3), cum = new Float32Array(n), len = 0;
    for (i = 0; i < n; i++) {
      xyz[i * 3] = pts[i].x + off + (o.dx || 0); xyz[i * 3 + 1] = pts[i].y + y; xyz[i * 3 + 2] = pts[i].z + off + (o.dz || 0);
      if (i) len += Math.hypot(xyz[i * 3] - xyz[i * 3 - 3], xyz[i * 3 + 1] - xyz[i * 3 - 2], xyz[i * 3 + 2] - xyz[i * 3 - 1]);
      cum[i] = len;
    }
    var path = { xyz: xyz, cum: cum, len: len, n: n };
    S.paths.push(path);
    if (o.w) for (i = 0; i < n - 1; i++) addSeg(S, [xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]], [xyz[i * 3 + 3], xyz[i * 3 + 4], xyz[i * 3 + 5]], o.w, o.tone == null ? 1 : o.tone);
    if (o.flow) {
      var f = o.flow, cnt = f.n || Math.max(1, Math.round(len / f.every));
      S.flows.push({ path: path, n: cnt, speed: f.speed, size: f.size, dir: f.dir || 1, tidal: !!f.tidal, always: !!f.always });
      if (f.both) S.flows.push({ path: path, n: cnt, speed: f.speed, size: f.size, dir: -1, tidal: false, always: !!f.always });
    }
    return path;
  }
  function pathPts(path, reverse) {
    var out = [];
    for (var i = 0; i < path.n; i++) out.push(new T.Vector3(path.xyz[i * 3], path.xyz[i * 3 + 1], path.xyz[i * 3 + 2]));
    return reverse ? out.reverse() : out;
  }
  function pointAt(path, d, out, o) {
    var cum = path.cum, lo = 0, hi = path.n - 1;
    if (d <= 0) { lo = 0; } else if (d >= path.len) { lo = hi - 1; } else {
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    }
    var seg = cum[lo + 1] - cum[lo], t = seg > 0 ? (d - cum[lo]) / seg : 0, a = lo * 3, x = path.xyz;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out[o] = x[a] + (x[a + 3] - x[a]) * t; out[o + 1] = x[a + 1] + (x[a + 4] - x[a + 1]) * t; out[o + 2] = x[a + 2] + (x[a + 5] - x[a + 2]) * t;
  }
  W.pointAt = pointAt;
  function arc(A, B, lift) {
    var pts = [], n = 22, d = Math.hypot(B.x - A.x, B.z - A.z), h = lift == null ? 8 + d * .34 : lift;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      pts.push(new T.Vector3(lerp(A.x, B.x, t), lerp(A.y, B.y, t) + 4 * h * t * (1 - t), lerp(A.z, B.z, t)));
    }
    return pts;
  }

  /* ---------- 设施模型：返回高度 ---------- */
  var WALL = '#d5dae0', DARK = '#7c8794', PALE = '#eef1f4', TANK = '#b8c2cc', SHED = '#c9d0d8';
  var MODELS = {
    plant: function (S, x, z) {
      var B = S.body, G = S.glow;
      bx(B, x - 1.4, 0, z + 2.3, 5.2, 2.6, 3.2, WALL); bx(B, x - 1.4, 2.6, z + 2.3, 3, 1, 2, '#c3cad3');
      cy(B, x - 2.2, 0, z - 1.9, 1.25, 2.1, 5.4, '#cdd3d9', 18); cy(B, x + 2.1, 0, z - 1.9, 1.25, 2.1, 5.4, '#cdd3d9', 18);
      cy(B, x + 3.2, 0, z + 2.4, .32, .5, 9.5, DARK, 8);
      cy(G, x - 2.2, 5.4, z - 1.9, 1.32, 1.32, .14, S.hex, 18); cy(G, x + 2.1, 5.4, z - 1.9, 1.32, 1.32, .14, S.hex, 18);
      cy(G, x + 3.2, 9.5, z + 2.4, .42, .42, .35, S.hex, 8);
      return 10;
    },
    solar: function (S, x, z) {
      var B = S.body, G = S.glow, i, j;
      for (i = 0; i < 3; i++) for (j = 0; j < 4; j++) bx(B, x - 2.9 + i * 2.1, .25, z - 3 + j * 2, 1.8, .1, 1.7, '#2b4a9c');
      for (i = 0; i < 3; i++) bx(B, x + 3.4, 0, z - 2.6 + i * 2.6, 1.3, 1.2, 2.1, PALE);
      for (i = 0; i < 3; i++) bx(G, x + 3.4, 1.2, z - 2.6 + i * 2.6, 1.3, .1, .4, S.hex);
      return 3;
    },
    hubsub: function (S, x, z) {
      var B = S.body, G = S.glow, i;
      for (i = 0; i < 3; i++) { bx(B, x - 2.6 + i * 2.6, 0, z + 2, 1.7, 1.8, 2.4, DARK); bx(G, x - 2.6 + i * 2.6, 1.8, z + 2, 1.2, .14, 1.8, S.hex); }
      for (i = 0; i < 4; i++) { bx(B, x - 3.6 + i * 2.4, 0, z - 2.2, .18, 5, .18, DARK); bx(G, x - 3.6 + i * 2.4, 5, z - 2.2, .35, .35, .35, S.hex); }
      bx(B, x, 4.6, z - 2.2, 7.6, .16, .16, DARK); bx(B, x, 3.4, z - 2.2, 7.6, .12, .12, DARK);
      bx(B, x + 2.6, 0, z - .2, 2.4, 2, 1.6, WALL);
      return 6;
    },
    sub: function (S, x, z) {
      var B = S.body, G = S.glow;
      bx(B, x, 0, z - .4, 2.8, 1.6, 2, WALL); bx(B, x - 1.2, 0, z + 1.3, .14, 3.4, .14, DARK); bx(B, x + 1.2, 0, z + 1.3, .14, 3.4, .14, DARK);
      bx(B, x, 3.3, z + 1.3, 2.7, .12, .12, DARK); bx(G, x, 1.6, z - .4, 2.2, .12, 1.4, S.hex);
      bx(G, x - 1.2, 3.4, z + 1.3, .3, .3, .3, S.hex); bx(G, x + 1.2, 3.4, z + 1.3, .3, .3, .3, S.hex);
      return 4.4;
    },
    dc: function (S, x, z) {
      var B = S.body, G = S.glow, i;
      for (i = 0; i < 3; i++) {
        bx(B, x, 0, z - 2.7 + i * 2.7, 7.8, 2.3, 2.1, '#c3cad3'); bx(G, x, 2.3, z - 2.7 + i * 2.7, 7.8, .1, .28, S.hex);
        bx(B, x - 2, 2.3, z - 2.7 + i * 2.7 + .6, 1.2, .6, .6, DARK); bx(B, x + 1.5, 2.3, z - 2.7 + i * 2.7 + .6, 1.2, .6, .6, DARK);
      }
      return 3.6;
    },
    telehub: function (S, x, z) {
      var B = S.body, G = S.glow;
      bx(B, x, 0, z, 7.6, 2.6, 7.6, WALL); bx(B, x, 2.6, z, 4.2, 14, 4.2, '#bfc7d1'); cy(B, x, 16.6, z, .12, .22, 8, DARK, 6);
      cy(G, x, 19, z, .95, .95, .14, S.hex, 12); cy(G, x, 21, z, .7, .7, .14, S.hex, 12); cy(G, x, 23, z, .45, .45, .14, S.hex, 12);
      bx(G, x, 24.6, z, .4, .4, .4, S.hex); bx(G, x, 16.6, z, 4.3, .16, 4.3, S.hex);
      return 26;
    },
    mast: function (S, x, z, y0) {
      cy(S.body, x, y0, z, .07, .13, 4.6, DARK, 6);
      bx(S.glow, x + .28, y0 + 3.6, z, .14, .9, .28, S.hex); bx(S.glow, x - .2, y0 + 3.6, z + .22, .14, .9, .28, S.hex); bx(S.glow, x - .2, y0 + 3.6, z - .22, .14, .9, .28, S.hex);
      return y0 + 5;
    },
    waterplant: function (S, x, z) {
      var B = S.body, G = S.glow;
      [[-2.2, -2.1], [2.2, -2.1], [-2.2, 2.2]].forEach(function (o) { cy(B, x + o[0], 0, z + o[1], 1.85, 1.85, .9, TANK, 22); cy(G, x + o[0], .9, z + o[1], 1.6, 1.6, .06, S.hex, 22); });
      bx(B, x + 2.2, 0, z + 2.2, 3.2, 2.3, 3.2, WALL); bx(G, x + 2.2, 2.3, z + 2.2, 3.2, .1, .4, S.hex);
      return 3.6;
    },
    pump: function (S, x, z) {
      bx(S.body, x, 0, z, 2.6, 1.8, 2.6, WALL); cy(S.body, x, 1.8, z, .75, .75, .9, TANK, 14); cy(S.glow, x, 2.7, z, .78, .78, .12, S.hex, 14);
      return 3.8;
    },
    sewage: function (S, x, z) {
      var B = S.body, G = S.glow, i;
      cy(B, x - 2, 0, z - 1.8, 2.3, 2.3, .7, TANK, 24); cy(G, x - 2, .7, z - 1.8, 2, 2, .05, '#2b6f9f', 24);
      cy(B, x + 2.4, 0, z + 2.3, 1.7, 1.7, .7, TANK, 20); cy(G, x + 2.4, .7, z + 2.3, 1.45, 1.45, .05, S.hex, 20);
      for (i = 0; i < 3; i++) { bx(B, x - 2.6 + i * 1.5, 0, z + 2.6, 1.2, .6, 2.6, TANK); bx(G, x - 2.6 + i * 1.5, .6, z + 2.6, .9, .05, 2.3, '#2b6f9f'); }
      bx(B, x + 2.6, 0, z - 2.4, 2.6, 1.8, 2, WALL);
      return 3.2;
    },
    hospital: function (S, x, z) {
      var B = S.body, G = S.glow;
      bx(B, x - 2.7, 0, z, 2.4, 9, 7.6, PALE); bx(B, x + 2.7, 0, z, 2.4, 7, 7.6, PALE); bx(B, x, 0, z, 3.2, 5, 2.6, '#e3e7ec');
      cy(B, x - 2.7, 9, z - 2, 1.05, 1.05, .12, DARK, 16); cy(G, x - 2.7, 9.12, z - 2, .75, .75, .05, '#ffffff', 16);
      bx(G, x + 2.7, 7, z, .6, .14, 2.2, S.hex); bx(G, x + 2.7, 7, z, 2.2, .14, .6, S.hex);
      bx(G, x, 3.2, z + 1.34, .5, 1.6, .06, S.hex); bx(G, x, 3.75, z + 1.34, 1.6, .5, .06, S.hex);
      return 10.5;
    },
    clinic: function (S, x, z) {
      bx(S.body, x, 0, z, 3, 2.4, 3, PALE); bx(S.glow, x, 2.4, z, .45, .12, 1.5, S.hex); bx(S.glow, x, 2.4, z, 1.5, .12, .45, S.hex);
      return 3.6;
    },
    port: function (S, x, z) {
      var B = S.body, G = S.glow, i, j, k, cols = ['#c8553d', '#3d6fc8', '#d9a441', '#4f9d69', '#8f6bb5'];
      bx(B, x, 0, z, 8.4, .3, 8.4, '#8f99a5');
      for (i = 0; i < 4; i++) for (j = 0; j < 3; j++) { var hh = 1 + Math.floor(rnd() * 3); for (k = 0; k < hh; k++) bx(B, x - 2.9 + i * 1.9, .3 + k * .78, z + .6 + j * 1.2, 1.6, .74, .95, pick(cols)); }
      for (i = 0; i < 2; i++) {
        var cx = x - 2.2 + i * 4.4;
        bx(B, cx - .9, .3, z - 2.6, .2, 5, .2, DARK); bx(B, cx + .9, .3, z - 2.6, .2, 5, .2, DARK); bx(B, cx, 5.1, z - 2.6, 2.2, .25, .4, DARK);
        bx(G, cx, 5.35, z - 2.2, .28, .22, 4.6, S.hex);
      }
      return 7;
    },
    hub: function (S, x, z) {
      var B = S.body, G = S.glow, i;
      bx(B, x, 0, z - .6, 8, 3, 6, SHED);
      for (i = 0; i < 4; i++) bx(G, x - 3 + i * 2, 3, z - .6, .35, .08, 6, S.hex);
      for (i = 0; i < 5; i++) bx(B, x - 3.2 + i * 1.6, 0, z + 3.3, .9, .85, 1.6, PALE);
      return 4.6;
    },
    depot: function (S, x, z) {
      bx(S.body, x, 0, z - .4, 3.3, 1.6, 2.4, SHED); bx(S.glow, x, 1.6, z - .4, 3.3, .1, .5, S.hex); bx(S.body, x + .9, 0, z + 1.4, .7, .7, 1.1, PALE);
      return 3;
    },
    tcenter: function (S, x, z) {
      bx(S.body, x, 0, z, 3, 1.6, 3, WALL); bx(S.body, x, 1.6, z, 1.6, 5, 1.6, '#bfc7d1'); cy(S.body, x, 6.6, z, 1.3, .9, .9, '#aab3bd', 10);
      cy(S.glow, x, 7.5, z, 1.34, 1.34, .14, S.hex, 10);
      return 8.2;
    },
    station: function (S, x, z) {
      cy(S.body, x, 0, z, 1.35, 1.35, .28, '#e8eef2', 18); cy(S.glow, x, .28, z, .85, .85, .08, S.hex, 18);
      return 1.2;
    },
    mall: function (S, x, z) {
      var B = S.body, G = S.glow;
      bx(B, x, 0, z, 7.8, 4.2, 6.4, '#d9d2cc'); cy(B, x, 4.2, z, 1.7, 2.1, 1.2, '#b9d6e2', 18);
      bx(G, x, 1.9, z + 3.22, 7.8, .5, .08, S.hex); bx(G, x, 1.9, z - 3.22, 7.8, .5, .08, S.hex); bx(G, x + 3.92, 1.9, z, .08, .5, 6.4, S.hex); bx(G, x - 3.92, 1.9, z, .08, .5, 6.4, S.hex);
      cy(G, x, 5.4, z, 1.72, 1.72, .1, S.hex, 18);
      return 6.6;
    },
    market: function (S, x, z) {
      bx(S.body, x, 0, z, 3.4, 1.9, 3.2, '#ddd6cf'); bx(S.glow, x, 1.15, z + 1.62, 3.4, .36, .08, S.hex); bx(S.glow, x, 1.9, z, 1.4, .5, .22, S.hex);
      return 3.4;
    },
    store: function (S, x, z) {
      bx(S.body, x, 0, z, 2, 1.2, 2, '#e6ded6'); bx(S.glow, x, 1.2, z, 2.1, .2, 2.1, S.hex);
      return 2.4;
    },
    univ: function (S, x, z) {
      var B = S.body, G = S.glow, c = '#c9b9a6';
      bx(B, x, 0, z, 8.4, .14, 8.4, '#5f8f66');
      bx(B, x - 3, 0, z + .4, 1.8, 3.4, 6.8, c); bx(B, x + 3, 0, z + .4, 1.8, 3.4, 6.8, c); bx(B, x, 0, z - 3, 4, 4.4, 1.7, c);
      bx(B, x, 4.4, z - 3, 1.1, 4.4, 1.1, c); bx(G, x, 8.8, z - 3, 1.2, .5, 1.2, S.hex); bx(G, x, 0.16, z + .8, 2.6, .05, 4, '#7fb087');
      return 10;
    },
    mschool: function (S, x, z) {
      var B = S.body, G = S.glow, c = '#d8cdbd';
      bx(B, x - 3, 0, z - .4, 1.8, 3.8, 6.4, c); bx(B, x + 3, 0, z - .4, 1.8, 3.8, 6.4, c); bx(B, x, 0, z - 2.9, 4.2, 3.8, 1.8, c);
      cy(B, x, 0, z + 1.2, 1.9, 1.9, .1, '#b5533f', 22); cy(B, x, .1, z + 1.2, 1.3, 1.3, .04, '#5f9a63', 22);
      bx(B, x - 1.6, 0, z + 3.6, .08, 3, .08, DARK); bx(G, x - 1.25, 2.5, z + 3.6, .7, .45, .06, S.hex); bx(G, x, 3.8, z - 2.9, 4.2, .1, .35, S.hex);
      return 5.4;
    },
    primary: function (S, x, z) {
      var c = '#e0d6c4';
      bx(S.body, x - .9, 0, z, 1.6, 2.6, 3.6, c); bx(S.body, x + .8, 0, z - 1, 1.8, 2.6, 1.6, c); bx(S.body, x + .9, 0, z + .9, 1.7, .08, 1.7, '#b5533f');
      bx(S.glow, x - .9, 2.6, z, 1.6, .1, .35, S.hex);
      return 4;
    },
    clearing: function (S, x, z) {
      var B = S.body, G = S.glow;
      bx(B, x, 0, z, 8, 3, 8, '#c5cdd8'); bx(B, x, 3, z, 5, 31, 5, '#aeb9c9'); bx(B, x, 34, z, 3.2, 4, 3.2, '#aeb9c9');
      bx(G, x + 2.54, 3, z, .08, 31, .5, S.hex); bx(G, x - 2.54, 3, z, .08, 31, .5, S.hex); bx(G, x, 3, z + 2.54, .5, 31, .08, S.hex); bx(G, x, 3, z - 2.54, .5, 31, .08, S.hex);
      bx(G, x, 38, z, 3.4, .3, 3.4, S.hex);
      return 40;
    },
    bankhq: function (S, x, z) {
      bx(S.body, x, 0, z, 7.6, 2.4, 7.6, '#c5cdd8'); bx(S.body, x, 2.4, z, 6, 24, 4.4, '#b7c0cc'); bx(S.glow, x, 26.4, z, 6.1, .35, 4.5, S.hex);
      bx(S.glow, x, 2.4, z, 6.1, .2, 4.5, S.hex);
      return 28.5;
    },
    bank: function (S, x, z) {
      var i; bx(S.body, x, 0, z, 3.2, 3, 3, '#d0d5dc');
      for (i = 0; i < 4; i++) bx(S.body, x - 1.2 + i * .8, 0, z + 1.65, .22, 2.6, .22, PALE);
      bx(S.glow, x, 3, z, 3.3, .14, 3.1, S.hex);
      return 4.6;
    }
  };

  function placeAll() {
    D.order.forEach(function (id) {
      var S = W.systems[id];
      (D.systems[id].fac || []).forEach(function (f) {
        var spot = f.big ? claimBlock(f.x, f.z) : claimLot(f.x, f.z);
        var h = MODELS[f.k](S, spot.x, spot.z);
        f.node = addNode(S, { name: f.n, note: f.t, kind: f.k, pos: V(spot.x, spot.z), h: h, label: !!f.big });
      });
    });
  }
  function facs(id, kind) { return D.systems[id].fac.filter(function (f) { return f.k === kind; }).map(function (f) { return f.node; }); }

  /* ---------- 普通楼房 ---------- */
  var bldgs = [];
  var TINT = {
    cbd: ['#b8c4d2', '#a9b7c9', '#c9d1da', '#9fb0c4'], mid: ['#c9c5bf', '#bfc3c8', '#cfc9c0'],
    res: ['#d6cdc0', '#cfc7bd', '#d9d3c8', '#c9c0b4'], campus: ['#c9b9a6', '#d3c6b4'], ind: ['#aab0b6', '#9da6ae', '#b5b0a6']
  };
  function addB(x, z, w, d, h, dist) { bldgs.push({ x: x, z: z, w: w, d: d, h: h, seed: rnd(), tint: pick(TINT[dist]) }); }
  function genBuildings() {
    blocks.forEach(function (b) {
      if (b.type !== 'land' || b.claimed) return;
      var dc = Math.hypot(b.cx + 30, b.cz + 6), i, free = b.taken === 0, r = rnd();
      if (b.dist === 'cbd' && free && r < .5) {
        var h = Math.max(22, 66 - dc * 1.5) * rr(.72, 1.1), w = rr(6.2, 7.6);
        addB(b.cx, b.cz, w, w * rr(.8, 1), h * .8, 'cbd'); addB(b.cx, b.cz, w * .68, w * .62, h, 'cbd');
        return;
      }
      if (b.dist === 'ind' && free && r < .7) {
        if (r < .35) addB(b.cx, b.cz, 8, 7.4, rr(2.6, 4.6), 'ind');
        else { addB(b.cx, b.cz - 2.3, 8, 3.6, rr(2.4, 4.2), 'ind'); addB(b.cx, b.cz + 2.3, 8, 3.6, rr(2.4, 4.2), 'ind'); }
        return;
      }
      if (b.dist === 'res' && free && r < .4) {
        var hs = rr(6, 10);
        for (i = 0; i < 3; i++) addB(b.cx, b.cz - 3 + i * 3, 8, 1.9, hs + rr(-1, 1), 'res');
        return;
      }
      for (i = 0; i < 4; i++) {
        if (b.lots[i]) continue;
        var hh;
        if (b.dist === 'cbd') hh = Math.max(14, 50 - dc * 1.2) * rr(.5, 1.05);
        else if (b.dist === 'mid') hh = rnd() < .14 ? rr(22, 30) : rr(9, 20);
        else if (b.dist === 'res') hh = rnd() < .08 ? rr(16, 24) : rr(4.5, 12);
        else if (b.dist === 'campus') { if (rnd() < .3) continue; hh = rr(3, 6); }
        else hh = rr(2.4, 6);
        addB(b.cx + LOT[i][0], b.cz + LOT[i][1], rr(3.3, 4.1), rr(3.3, 4.1), hh, b.dist);
      }
    });
  }

  /* ---------- 九张网 ---------- */
  function liftPts(pts, y, y0, y1) {
    return pts.map(function (p, i) { return new T.Vector3(p.x, i === 0 ? y0 : i === pts.length - 1 ? y1 : y, p.z); });
  }
  var pylonSeen = {};
  function pylons(S, pts, y) {
    for (var i = 1; i < pts.length - 1; i++) {
      var k = pts[i].x + ',' + pts[i].z; if (pylonSeen[k]) continue; pylonSeen[k] = 1;
      var x = pts[i].x + S.off, z = pts[i].z + S.off;
      bx(S.body, x, 0, z, .22, y + .4, .22, '#8f99a5'); bx(S.body, x, y - .1, z, 1.3, .1, .1, '#8f99a5'); bx(S.body, x, y - .1, z, .1, .1, 1.3, '#8f99a5');
      bx(S.glow, x, y + .4, z, .28, .28, .28, S.hex);
    }
  }
  function buildPower() {
    var S = W.systems.power, plant = facs('power', 'plant')[0], solar = facs('power', 'solar')[0], hub = facs('power', 'hubsub')[0], subs = facs('power', 'sub');
    var r1 = liftPts(route(plant.pos, hub.pos), 9, 6, 5);
    pylons(S, r1, 9);
    S.j.a = addPath(S, r1, { y: 0, w: .34, flow: { every: 5, speed: 26, size: 1.6 } });
    var east = subs[subs.length - 1];
    subs.forEach(function (s) {
      var r = liftPts(route(hub.pos, s.pos), 7.2, 5, 3.4); pylons(S, r, 7.2);
      var p = addPath(S, r, { y: 0, w: .24, flow: { every: 6, speed: 22, size: 1.3 } });
      if (s.name === '中心变电站') S.j.b = p;
      var leaves = hopsFrom(s.pos.x, s.pos.z, 3).filter(function (h) { return h.h === 3; });
      leaves.forEach(function (h, i) {
        var f = addPath(S, routeFromNode(h.id, s.pos, true), { w: .13, tone: .8, flow: { every: 7, speed: 10, size: .85 } });
        if (s.name === '中心变电站' && (i === 2 || !S.j.c)) S.j.c = f;
      });
    });
    var rs = liftPts(route(solar.pos, east.pos), 7.2, 2, 3.4); pylons(S, rs, 7.2);
    addPath(S, rs, { y: 0, w: .24, flow: { every: 6, speed: 22, size: 1.3 } });
    W.journeys.power = pathPts(S.j.a).concat(pathPts(S.j.b), pathPts(S.j.c));
  }
  function buildTelecom() {
    var S = W.systems.telecom, hub = facs('telecom', 'telehub')[0], dc = facs('telecom', 'dc')[0];
    S.j.dc = addPath(S, route(hub.pos, dc.pos), { w: .36, flow: { every: 6, speed: 36, size: 1.2, both: true } });
    S.masts = [];
    D.systems.telecom.masts.forEach(function (m, i) {
      var best = null, bd = 1e9;
      bldgs.forEach(function (b) { if (b.h < 5 || b.w < 3) return; var d = Math.hypot(b.x - m[0], b.z - m[1]); if (d < bd) { bd = d; best = b; } });
      var top = MODELS.mast(S, best.x, best.z, best.h);
      var node = addNode(S, { name: '基站', note: D.systems.telecom.mastNote, kind: 'mast', pos: V(best.x, best.z), h: top });
      S.masts.push(new T.Vector3(best.x, top - .6, best.z));
      var r = route(hub.pos, node.pos); r[r.length - 1].y = best.h;
      var p = addPath(S, r, { w: .15, tone: .85, flow: { every: 16, speed: 34, size: .8, both: true } });
      if (i === 5) S.j.m = p;
    });
    W.journeys.telecom = pathPts(S.j.m, true).concat(pathPts(S.j.dc));
  }
  function buildWater() {
    var S = W.systems.water, plant = facs('water', 'waterplant')[0], sew = facs('water', 'sewage')[0], pumps = facs('water', 'pump');
    pumps.forEach(function (pm) {
      var p = addPath(S, route(plant.pos, pm.pos), { w: .42, flow: { every: 3.4, speed: 7, size: 1.3 } });
      if (pm.name === '中心加压泵站') S.j.a = p;
      hopsFrom(pm.pos.x, pm.pos.z, 3).filter(function (h) { return h.h === 3; }).forEach(function (h, i) {
        var f = addPath(S, routeFromNode(h.id, pm.pos, true), { w: .16, tone: .85, flow: { every: 5, speed: 4.5, size: .8 } });
        if (pm.name === '中心加压泵站' && (i === 4 || !S.j.b)) { S.j.b = f; S.j.leaf = h.id; }
      });
    });
    [[-84, -60], [-84, 36], [-36, -24], [-36, 84], [72, -60], [84, 60]].forEach(function (c) {
      addPath(S, route({ x: c[0], z: c[1] }, sew.pos), { w: .28, tone: .5, dx: .5, dz: .5, flow: { every: 5.5, speed: 3.4, size: .9 } });
    });
    S.j.c = addPath(S, routeFromNode(S.j.leaf, sew.pos), { w: .28, tone: .5, dx: .5, dz: .5, flow: { every: 5.5, speed: 3.4, size: .9 } });
    W.journeys.water = pathPts(S.j.a).concat(pathPts(S.j.b), pathPts(S.j.c));
  }
  function buildHospital() {
    var S = W.systems.hospital, hs = facs('hospital', 'hospital'), cl = facs('hospital', 'clinic');
    hs.forEach(function (h, hi) {
      var cand = hopsFrom(h.pos.x, h.pos.z, 5).filter(function (c) { return c.h >= 3; });
      for (var i = 0; i < 8 && cand.length; i++) {
        var c = cand.splice(Math.floor(rnd() * cand.length), 1)[0];
        var p = addPath(S, routeFromNode(c.id, h.pos, true), { w: .1, tone: .6, flow: { n: 1, speed: 17, size: 1.6, both: true, always: true } });
        if (hi === 1 && i === 0) S.j.a = p;
      }
    });
    cl.forEach(function (c) {
      var best = hs[0], bd = 1e9;
      hs.forEach(function (h) { var d = Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z); if (d < bd) { bd = d; best = h; } });
      addPath(S, route(c.pos, best.pos), { w: .16, flow: { every: 22, speed: 7, size: .8 } });
    });
    W.journeys.hospital = pathPts(S.j.a).concat(pathPts(S.j.a, true));
  }
  function nearestOf(list, pos) {
    var best = list[0], bd = 1e9;
    list.forEach(function (h) { var d = Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z); if (d < bd) { bd = d; best = h; } });
    return best;
  }
  function buildLogistics() {
    var S = W.systems.logistics, port = facs('logistics', 'port')[0], hubs = facs('logistics', 'hub'), depots = facs('logistics', 'depot');
    hubs.forEach(function (h, i) {
      var p = addPath(S, route(port.pos, h.pos), { w: .42, flow: { every: 5, speed: 9, size: 1.35 } });
      if (i === 1) S.j.a = p;
    });
    var shops = W.systems.retail.nodes;
    depots.forEach(function (d) {
      var onEast = d.pos.x > riverX(d.pos.z), h = onEast ? hubs[0] : hubs[1];
      var p = addPath(S, route(h.pos, d.pos), { w: .26, flow: { every: 7, speed: 8, size: 1.05 } });
      var shop = nearestOf(shops, d.pos);
      var q = addPath(S, route(d.pos, shop.pos), { w: .13, tone: .8, flow: { every: 8, speed: 5, size: .75 } });
      if (!onEast && !S.j.b && d.pos.x > -30) { S.j.b = p; S.j.c = q; }
      var leaves = hopsFrom(d.pos.x, d.pos.z, 2).filter(function (x) { return x.h === 2; });
      for (var i = 0; i < 4 && leaves.length; i++) {
        var c = leaves.splice(Math.floor(rnd() * leaves.length), 1)[0];
        addPath(S, routeFromNode(c.id, d.pos, true), { w: .1, tone: .7, flow: { every: 9, speed: 5, size: .7 } });
      }
    });
    W.journeys.logistics = pathPts(S.j.a).concat(pathPts(S.j.b), pathPts(S.j.c));
  }
  function buildTransport() {
    var S = W.systems.transport, i, j;
    function line(pts) { return pts.map(function (p) { return V(p[0], p[1]); }); }
    var l1 = [], l2 = [];
    for (i = 0; i < NN; i++) { l1.push([-HALF + i * P, -12]); l2.push([-36, -HALF + i * P]); }
    var ring = [];
    for (i = -72; i <= 0; i += P) ring.push([i, -48]);
    for (j = -36; j <= 48; j += P) ring.push([0, j]);
    for (i = -12; i >= -72; i -= P) ring.push([i, 48]);
    for (j = 36; j >= -48; j -= P) ring.push([-72, j]);
    var named = {};
    D.systems.transport.stations.forEach(function (s) { named[s.x + ',' + s.z] = s; });
    [l1, l2, ring].forEach(function (l, li) {
      var p = addPath(S, line(l), { w: .6, flow: { n: li === 2 ? 6 : 5, speed: 22, size: 2.2, both: true } });
      if (li === 0) S.j.a = p;
      l.forEach(function (pt, k) {
        var key = pt[0] + ',' + pt[1], nm = named[key];
        if (!nm && k % 2) return;
        if (riverD(pt[0], pt[1]) < RHW + 2.5) return;
        if (named[key] === 1) return;
        MODELS.station(S, pt[0], pt[1]);
        if (nm) addNode(S, { name: nm.n, note: nm.t, kind: 'station', pos: V(pt[0], pt[1]), h: 1.2, label: true });
        named[key] = 1;
      });
    });
    // 路面车流：沿每条街的连续路段
    function runs(horizontal) {
      for (var a = 0; a < NN; a++) {
        var start = -1, major = a % 4 === 0;
        for (var b = 0; b <= NN; b++) {
          var id = horizontal ? b + a * NN : a + b * NN, ok = false;
          if (b < NN - 1) { var nxt = horizontal ? id + 1 : id + NN; ok = adj[id].some(function (e) { return e[0] === nxt; }); }
          if (ok && start < 0) start = b;
          if (!ok && start >= 0) {
            var x0 = horizontal ? -HALF + start * P : -HALF + a * P, z0 = horizontal ? -HALF + a * P : -HALF + start * P;
            var x1 = horizontal ? -HALF + b * P : x0, z1 = horizontal ? z0 : -HALF + b * P;
            var f = major ? { every: 3.2, speed: 11, size: .62 } : { every: 10, speed: 8, size: .5 };
            addPath(S, [V(x0, z0), V(x1, z1)], { off: 0, dx: horizontal ? 0 : .45, dz: horizontal ? .45 : 0, flow: f });
            addPath(S, [V(x1, z1), V(x0, z0)], { off: 0, dx: horizontal ? 0 : -.45, dz: horizontal ? -.45 : 0, flow: f });
            start = -1;
          }
        }
      }
    }
    runs(true); runs(false);
    W.journeys.transport = pathPts(S.j.a);
  }
  function buildRetail() {
    var S = W.systems.retail;
    S.nodes.forEach(function (n, ni) {
      var reach = n.kind === 'mall' ? 3 : n.kind === 'market' ? 2 : 1;
      hopsFrom(n.pos.x, n.pos.z, reach).filter(function (h) { return h.h === reach; }).forEach(function (h, i) {
        var p = addPath(S, routeFromNode(h.id, n.pos), { w: n.kind === 'store' ? .09 : .13, tone: .8, flow: { every: 4, speed: 2.6, size: .5, both: true } });
        if (n.kind === 'market' && n.pos.x < -30 && (!S.j.a || (i === 1 && !S.j.set))) { S.j.a = p; if (i === 1) S.j.set = 1; }
      });
    });
    W.journeys.retail = pathPts(S.j.a);
  }
  function buildSchool() {
    var S = W.systems.school;
    S.nodes.forEach(function (n) {
      var reach = n.kind === 'univ' ? 4 : n.kind === 'mschool' ? 3 : 2;
      hopsFrom(n.pos.x, n.pos.z, reach).filter(function (h) { return h.h === reach; }).forEach(function (h, i) {
        var p = addPath(S, routeFromNode(h.id, n.pos), { w: .12, tone: .8, flow: { every: 3, speed: 2.8, size: .5, tidal: true } });
        if (n.kind === 'primary' && n.pos.x < 0 && (!S.j.a || (i === 2 && !S.j.set))) { S.j.a = p; if (i === 2) S.j.set = 1; }
      });
    });
    W.journeys.school = pathPts(S.j.a);
  }
  function buildFinance() {
    var S = W.systems.finance, cl = facs('finance', 'clearing')[0], hqs = facs('finance', 'bankhq'), br = facs('finance', 'bank');
    function top(n) { return new T.Vector3(n.pos.x, n.h, n.pos.z); }
    var dc = W.systems.telecom.nodes[1];
    addPath(S, arc(top(cl), top(dc), 30), { w: .16, flow: { n: 6, speed: 60, size: 1.2, both: true, always: true } });
    hqs.forEach(function (h, i) {
      var p = addPath(S, arc(top(cl), top(h), 12), { w: .14, flow: { n: 3, speed: 40, size: 1.1, both: true } });
      if (i === 0) S.j.b = p;
    });
    br.forEach(function (b) { addPath(S, arc(top(b), top(nearestOf(hqs, b.pos))), { w: .07, tone: .7, flow: { n: 2, speed: 50, size: .95, both: true } }); });
    var first = null;
    W.systems.retail.nodes.forEach(function (n) {
      var p = addPath(S, arc(top(n), top(cl)), { w: .055, tone: .6, flow: { n: n.kind === 'mall' ? 4 : 2, speed: 55, size: .95 } });
      if (n.kind === 'store' && !first && n.pos.x < -40 && n.pos.z > 10) first = { p: p, n: n };
    });
    if (!first) first = { p: S.paths[S.paths.length - 1], n: W.systems.retail.nodes[W.systems.retail.nodes.length - 1] };
    var back = addPath(S, arc(top(hqs[0]), top(first.n)), { w: .055, tone: .6, flow: { n: 2, speed: 55, size: .95 } });
    W.journeys.finance = pathPts(first.p).concat(pathPts(S.j.b), pathPts(back));
  }

  /* ---------- 材质 ---------- */
  var partMats = [];
  function partMat(color, shape, minPx) {
    var m = new T.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uScale: { value: 500 }, uOpacity: { value: 1 }, uMin: { value: minPx || 0 }, uMax: { value: 64 }, uShape: { value: shape || 0 } },
      vertexShader: 'attribute float aSize;attribute float aVis;uniform float uScale;uniform float uMin;uniform float uMax;varying float vVis;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uScale/-mv.z,uMin,uMax)*step(.001,aVis);vVis=aVis;}',
      fragmentShader: 'uniform vec3 uColor;uniform float uOpacity;uniform float uShape;varying float vVis;void main(){vec2 c=gl_PointCoord-.5;float d=mix(length(c),(abs(c.x)+abs(c.y))*.72,uShape);if(d>.5)discard;float a=mix(smoothstep(.5,.16,d),smoothstep(.5,.4,d),uShape);vec3 col=mix(uColor,vec3(1.),smoothstep(.26,.0,d)*mix(.75,.35,uShape));gl_FragColor=vec4(col,a*uOpacity*vVis);}',
      transparent: true, depthWrite: false
    });
    partMats.push(m); return m;
  }
  var bldgMat, ringMat, mats = {};

  function finalize(S) {
    var g = S.group, i;
    // 管线
    S.lineMat = new T.MeshBasicMaterial({ color: S.color.clone(), transparent: true, opacity: .5, depthWrite: false });
    var im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), S.lineMat, S.segs.length), dir = new T.Vector3(), Z = new T.Vector3(0, 0, 1), col = new T.Color();
    S.segs.forEach(function (s, k) {
      dir.set(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]); var len = dir.length(); dir.normalize();
      _q.setFromUnitVectors(Z, dir);
      _m.compose(_p.set((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2), _q, _s.set(s.w, s.w * .7, len + s.w * .8));
      im.setMatrixAt(k, _m); im.setColorAt(k, col.setScalar(s.tone));
    });
    im.frustumCulled = false; im.renderOrder = 3; g.add(im); S.lines = im;
    // 设施
    S.bodyMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true });
    S.glowMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true });
    if (S.body.p.length) { S.bodyMesh = S.body.mesh(S.bodyMat); g.add(S.bodyMesh); }
    if (S.glow.p.length) { S.glowMesh = S.glow.mesh(S.glowMat); g.add(S.glowMesh); }
    // 流动粒子
    var total = 0; S.flows.forEach(function (f) { total += f.n; });
    var pd = S.pd = { n: total, path: new Array(total), d0: new Float32Array(total), sp: new Float32Array(total), r: new Float32Array(total), dir: new Int8Array(total), tidal: new Uint8Array(total), always: new Uint8Array(total) };
    var pos = new Float32Array(total * 3), size = new Float32Array(total), vis = new Float32Array(total), k = 0;
    S.flows.forEach(function (f) {
      for (var q = 0; q < f.n; q++, k++) {
        pd.path[k] = f.path; pd.d0[k] = rnd() * f.path.len; pd.sp[k] = f.speed * rr(.8, 1.2); pd.r[k] = rnd(); pd.dir[k] = f.dir; pd.tidal[k] = f.tidal ? 1 : 0; pd.always[k] = f.always ? 1 : 0;
        size[k] = f.size * rr(.85, 1.15) * 1.5;
      }
    });
    var pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(pos, 3)); pg.setAttribute('aSize', new T.BufferAttribute(size, 1)); pg.setAttribute('aVis', new T.BufferAttribute(vis, 1));
    S.partMat = partMat(S.color);
    S.points = new T.Points(pg, S.partMat); S.points.frustumCulled = false; S.points.renderOrder = 5; g.add(S.points);
    // 设施标记
    var nn = S.nodes.length, bp = new Float32Array(nn * 3), bs = new Float32Array(nn), bv = new Float32Array(nn), stem = [];
    S.nodes.forEach(function (n, q) {
      var y = n.h + 2.4; bp[q * 3] = n.pos.x; bp[q * 3 + 1] = y; bp[q * 3 + 2] = n.pos.z; bs[q] = n.label ? 3.2 : 2.2; bv[q] = 1;
      stem.push(n.pos.x, n.h + .1, n.pos.z, n.pos.x, y - .7, n.pos.z);
      n.top = new T.Vector3(n.pos.x, y, n.pos.z);
    });
    var bg = new T.BufferGeometry();
    bg.setAttribute('position', new T.BufferAttribute(bp, 3)); bg.setAttribute('aSize', new T.BufferAttribute(bs, 1)); bg.setAttribute('aVis', new T.BufferAttribute(bv, 1));
    S.beaconMat = partMat(S.color, 1, 9);
    S.beacons = new T.Points(bg, S.beaconMat); S.beacons.frustumCulled = false; S.beacons.renderOrder = 6; g.add(S.beacons);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(stem, 3));
    S.stemMat = new T.LineBasicMaterial({ color: S.color.clone(), transparent: true, opacity: 0, depthWrite: false });
    S.stems = new T.LineSegments(sg, S.stemMat); S.stems.frustumCulled = false; S.stems.renderOrder = 4; g.add(S.stems);
    // 分层视图的底框
    var fp = [], E = 100, z;
    fp.push(-E, 0, -E, E, 0, -E, E, 0, -E, E, 0, E, E, 0, E, -E, 0, E, -E, 0, E, -E, 0, -E);
    for (z = -E; z < E; z += 5) { fp.push(riverX(z) - RHW, 0, z, riverX(z + 5) - RHW, 0, z + 5, riverX(z) + RHW, 0, z, riverX(z + 5) + RHW, 0, z + 5); }
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fp, 3));
    S.frameMat = new T.LineBasicMaterial({ color: S.color.clone(), transparent: true, opacity: 0, depthWrite: false });
    S.frame = new T.LineSegments(fg, S.frameMat); S.frame.frustumCulled = false; g.add(S.frame);
    S.sheetMat = new T.MeshBasicMaterial({ color: S.color.clone(), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
    S.sheet = new T.Mesh(new T.PlaneGeometry(2 * E, 2 * E).rotateX(-Math.PI / 2), S.sheetMat); S.sheet.renderOrder = 2; g.add(S.sheet);
    S.anchor = new T.Vector3(-E, 0, E);
    W.scene.add(g);
  }

  /* ---------- 场景 ---------- */
  var KEYS = [
    [0, '#050816', '#1a2038', '#141a30', 1, .28], [2, '#050816', '#1a2038', '#141a30', 1, .12], [5, '#0a0f24', '#1c2240', '#161c34', 1, .10],
    [6.3, '#4d4768', '#57526a', '#8a6a5e', .55, .22], [7.6, '#8ea4b8', '#7d8791', '#9a8f80', 0, 0], [12, '#9fb3c4', '#858e97', '#a39c92', 0, 0],
    [16.5, '#a8adb4', '#85888d', '#aa967a', 0, 0], [18.2, '#7d6170', '#665d6c', '#b0705a', .45, .34], [19.4, '#171b3c', '#232845', '#1a1f3a', 1, .74],
    [22, '#080c1e', '#1b2139', '#141a30', 1, .55], [24, '#050816', '#1a2038', '#141a30', 1, .28]
  ].map(function (k) { return { h: k[0], sky: new T.Color(k[1]), amb: new T.Color(k[2]), sun: new T.Color(k[3]), night: k[4], lit: k[5] }; });
  var DN = {
    terrain: [new T.Color('#68777f'), new T.Color('#070b14')], slab: [new T.Color('#39414b'), new T.Color('#0b0f1c')],
    plate: [new T.Color('#ffffff'), new T.Color('#2a3048')], river: [new T.Color('#4f86a8'), new T.Color('#0d1f3a')],
    body: [new T.Color('#ffffff'), new T.Color('#3d4563')], bridge: [new T.Color('#8a949f'), new T.Color('#1b2135')]
  };
  W.env = { night: 1, sky: new T.Color() };

  W.init = function (canvas) {
    var renderer = W.renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = W.scene = new T.Scene();
    scene.fog = new T.Fog(0x050816, 300, 1100);
    W.camera = new T.PerspectiveCamera(36, 1, 2, 3000);

    placeAll();
    placeStores();
    genBuildings();

    // 地面
    mats.terrain = new T.MeshBasicMaterial({ color: 0x070b14 });
    var terrain = new T.Mesh(new T.CircleGeometry(1800, 64).rotateX(-Math.PI / 2), mats.terrain); terrain.position.y = -.05; scene.add(terrain);
    mats.slab = new T.MeshBasicMaterial({ color: 0x0b0f1c });
    var slab = new T.Mesh(new T.PlaneGeometry(204, 204).rotateX(-Math.PI / 2), mats.slab); slab.position.y = 0; scene.add(slab);
    mats.plate = new T.MeshBasicMaterial({ color: 0xffffff });
    var plates = new T.InstancedMesh(new T.BoxGeometry(9, .14, 9), mats.plate, blocks.length), pc = new T.Color();
    blocks.forEach(function (b, i) {
      _m.makeTranslation(b.cx, .07, b.cz); plates.setMatrixAt(i, _m);
      plates.setColorAt(i, pc.set(b.type === 'bank' ? '#4d7a58' : b.dist === 'campus' ? '#66856a' : b.dist === 'ind' ? '#6b737c' : '#77818c'));
    });
    scene.add(plates);
    // 河
    var rp = [], ri = [], z, k = 0;
    for (z = -600; z <= 600; z += 6) { rp.push(riverX(z) - RHW, 0, z, riverX(z) + RHW, 0, z); if (z > -600) { ri.push(k - 2, k, k - 1, k - 1, k, k + 1); } k += 2; }
    var rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(rp, 3)); rg.setIndex(ri);
    mats.river = new T.MeshBasicMaterial({ color: 0x0d1f3a });
    var river = new T.Mesh(rg, mats.river); river.position.y = .16; scene.add(river);
    // 桥
    mats.bridge = new T.MeshBasicMaterial({ color: 0x1b2135 });
    var bm = new Merger(true);
    for (var j = 1; j < NN; j += 3) { var bz = -HALF + j * P; bx(bm, riverX(bz), .22, bz, RHW * 2 + 6, .2, 2.6, '#ffffff'); }
    scene.add(bm.mesh(mats.bridge));

    // 楼
    var bg = new T.BoxGeometry(1, 1, 1), nb = bldgs.length, seed = new Float32Array(nb), tint = new Float32Array(nb * 3), tc = new T.Color();
    bldgMat = new T.ShaderMaterial({
      uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
        uSun: { value: new T.Vector3(.4, .8, .3) }, uSunCol: { value: new T.Color() }, uAmb: { value: new T.Color() }, uNight: { value: 1 }, uLit: { value: .5 },
        uPower: { value: 1 }, uGhost: { value: 0 }, uFlat: { value: 0 }, uGhostCol: { value: new T.Color('#5d6c94') }
      }]),
      vertexShader: [
        'attribute float aSeed;attribute vec3 aTint;uniform float uFlat;',
        'varying vec3 vN;varying vec3 vL;varying float vSeed;varying vec3 vTint;varying vec3 vWP;',
        '#include <fog_pars_vertex>',
        'void main(){',
        ' vec3 scl=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));',
        ' vec4 wp=instanceMatrix*vec4(position,1.); wp.y*=mix(1.,.05,uFlat); wp=modelMatrix*wp;',
        ' vL=(position+.5)*scl; vN=normal; vSeed=aSeed; vTint=aTint; vWP=wp.xyz;',
        ' vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;',
        ' #include <fog_vertex>',
        '}'].join('\n'),
      fragmentShader: [
        'uniform vec3 uSun;uniform vec3 uSunCol;uniform vec3 uAmb;uniform float uNight;uniform float uLit;uniform float uPower;uniform float uGhost;uniform vec3 uGhostCol;',
        'varying vec3 vN;varying vec3 vL;varying float vSeed;varying vec3 vTint;varying vec3 vWP;',
        '#include <fog_pars_fragment>',
        'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
        'void main(){',
        ' vec3 n=normalize(vN); float diff=max(dot(n,uSun),0.);',
        ' vec3 col=vTint*(uAmb+uSunCol*diff); float glow=0.;',
        ' if(abs(n.y)<.5){',
        '  float side=step(.5,abs(n.x)); vec2 uv=vec2(mix(vL.x,vL.z,side),vL.y);',
        '  vec2 g=uv/vec2(.95,.85); vec2 c=floor(g), f=fract(g);',
        '  float win=step(.2,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.82);',
        '  float r=hash(c+vSeed*91.7+side*13.);',
        '  float lit=step(r,uLit)*step(hash(vec2(vSeed,7.3)),uPower);',
        '  col=mix(col,col*vec3(.5,.6,.74),win*.5);',
        '  glow=win*lit*uNight;',
        '  col+=glow*mix(vec3(1.,.78,.46),vec3(.76,.88,1.),step(.82,hash(c.yx+vSeed)))*1.1;',
        ' }',
        ' float alpha=1.;',
        ' if(uGhost>0.001){ vec3 v=normalize(cameraPosition-vWP); float fr=1.-abs(dot(n,v));',
        '  float ga=.035+.2*fr*fr; vec3 gc=uGhostCol+glow*.2;',
        '  col=mix(col,gc,uGhost); alpha=mix(1.,ga,uGhost); }',
        ' gl_FragColor=vec4(col,alpha);',
        ' #include <fog_fragment>',
        '}'].join('\n'),
      fog: true, transparent: true
    });
    var bim = new T.InstancedMesh(bg, bldgMat, nb);
    bldgs.forEach(function (b, i) {
      _m.compose(_p.set(b.x, b.h / 2 + .14, b.z), QI, _s.set(b.w, b.h, b.d)); bim.setMatrixAt(i, _m);
      seed[i] = b.seed; tc.set(b.tint); tint[i * 3] = tc.r; tint[i * 3 + 1] = tc.g; tint[i * 3 + 2] = tc.b;
    });
    bg.setAttribute('aSeed', new T.InstancedBufferAttribute(seed, 1)); bg.setAttribute('aTint', new T.InstancedBufferAttribute(tint, 3));
    bim.frustumCulled = false; bim.renderOrder = 1; scene.add(bim); W.buildings = bim;

    // 九张网（零售要先于物流和金融，电信要先于金融）
    buildRetail(); buildPower(); buildTelecom(); buildWater(); buildHospital(); buildLogistics(); buildTransport(); buildSchool(); buildFinance();
    D.order.forEach(function (id) { finalize(W.systems[id]); });

    // 基站电波
    var S = W.systems.telecom;
    ringMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: S.color.clone() } },
      vertexShader: 'varying vec2 vUv;varying float vPh;void main(){vUv=uv*2.-1.;vPh=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime;uniform float uOpacity;uniform vec3 uColor;varying vec2 vUv;varying float vPh;void main(){float r=length(vUv);if(r>1.)discard;float a=0.;for(int k=0;k<3;k++){float ph=fract(uTime*.2+vPh+float(k)/3.);a+=smoothstep(.04,.0,abs(r-ph))*(1.-ph);}gl_FragColor=vec4(uColor,a*uOpacity*.85);}',
      transparent: true, depthWrite: false, side: T.DoubleSide
    });
    var rings = new T.InstancedMesh(new T.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), ringMat, S.masts.length);
    S.masts.forEach(function (m, i) { _m.compose(m, QI, _s.set(17, 1, 17)); rings.setMatrixAt(i, _m); });
    rings.frustumCulled = false; rings.renderOrder = 4; S.group.add(rings);

    // 跟随镜头的光点
    var tg = new T.BufferGeometry(), TN = 14, tp = new Float32Array(TN * 3), ts = new Float32Array(TN), tv = new Float32Array(TN);
    for (var q = 0; q < TN; q++) { ts[q] = q === 0 ? 5.5 : 3.4 * (1 - q / TN); tv[q] = q === 0 ? 1 : .55 * (1 - q / TN); }
    tg.setAttribute('position', new T.BufferAttribute(tp, 3)); tg.setAttribute('aSize', new T.BufferAttribute(ts, 1)); tg.setAttribute('aVis', new T.BufferAttribute(tv, 1));
    W.tracerMat = partMat(new T.Color('#ffffff'), 0, 5);
    W.tracer = new T.Points(tg, W.tracerMat); W.tracer.frustumCulled = false; W.tracer.renderOrder = 9; W.tracer.visible = false; W.tracerMat.depthTest = false; scene.add(W.tracer);
    W.tracerN = TN;

    W.stats = { buildings: nb, nodes: W.nodes.length, particles: D.order.reduce(function (a, id) { return a + W.systems[id].pd.n; }, 0), segs: D.order.reduce(function (a, id) { return a + W.systems[id].segs.length; }, 0) };
    W.resize();
  };
  function placeStores() {
    var S = W.systems.retail;
    // 便利店：占一个小地块
    var spots = [];
    for (var tries = 0; spots.length < 12 && tries < 400; tries++) {
      var x = rr(-92, 92), z = rr(-92, 92);
      if (riverD(x, z) < 20) continue;
      if (spots.some(function (s) { return Math.hypot(s[0] - x, s[1] - z) < 34; })) continue;
      if (S.nodes.some(function (n) { return Math.hypot(n.pos.x - x, n.pos.z - z) < 20; })) continue;
      spots.push([x, z]);
    }
    spots.forEach(function (s) {
      var spot = claimLot(s[0], s[1]), h = MODELS.store(S, spot.x, spot.z);
      addNode(S, { name: '便利店', note: D.systems.retail.storeNote, kind: 'store', pos: V(spot.x, spot.z), h: h });
    });
  }

  W.resize = function () {
    var c = W.renderer.domElement, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    W.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    W.renderer.setSize(w, h, false);
    W.camera.aspect = w / h; W.camera.updateProjectionMatrix();
    var s = W.renderer.getDrawingBufferSize(new T.Vector2()).y * .5 / Math.tan(W.camera.fov * Math.PI / 360);
    partMats.forEach(function (m) { m.uniforms.uScale.value = s; });
    W.dpr = W.renderer.getPixelRatio();
    partMats.forEach(function (m) { var b = m.uniforms.uShape.value > 0; if (m.uniforms.uMin.value) m.uniforms.uMin.value = (m === W.tracerMat ? 5 : 9) * W.dpr; m.uniforms.uMax.value = (b ? 22 : m === W.tracerMat ? 90 : 46) * W.dpr; });
  };

  var sunDir = new T.Vector3(), tmpC = new T.Color();
  W.setTime = function (h) {
    h = ((h % 24) + 24) % 24;
    var i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    var a = KEYS[i], b = KEYS[i + 1], t = (h - a.h) / (b.h - a.h); t = t * t * (3 - 2 * t);
    var night = lerp(a.night, b.night, t), lit = lerp(a.lit, b.lit, t), u = bldgMat.uniforms;
    W.env.night = night; W.env.sky.copy(a.sky).lerp(b.sky, t);
    W.renderer.setClearColor(W.env.sky); W.scene.fog.color.copy(W.env.sky);
    u.uAmb.value.copy(a.amb).lerp(b.amb, t); u.uSunCol.value.copy(a.sun).lerp(b.sun, t); u.uNight.value = Math.min(1, night * 1.6); u.uLit.value = lit;
    var ang = (h - 6) / 12 * Math.PI;
    if (night < .9) sunDir.set(Math.cos(ang) * .75, Math.max(.18, Math.sin(ang)), .42).normalize(); else sunDir.set(-.4, .8, .35).normalize();
    u.uSun.value.copy(sunDir);
    ['terrain', 'slab', 'plate', 'river', 'bridge'].forEach(function (k) { mats[k].color.copy(DN[k][0]).lerp(DN[k][1], night); });
    tmpC.copy(DN.body[0]).lerp(DN.body[1], night);
    D.order.forEach(function (id) { W.systems[id].bodyMat.color.copy(tmpC); });
  };

  /* st: {hour, levels:{id:{act,health}}, focus, layers(bool), ghost(bool)} */
  var GREY = new T.Color('#4a5266');
  W.update = function (dt, st) {
    var k = Math.min(1, dt * 5), exT = st.layers ? 1 : 0;
    W.explode += (exT - W.explode) * Math.min(1, dt * 3.2);
    if (Math.abs(exT - W.explode) < .001) W.explode = exT;
    var ghostT = st.layers ? 1 : (st.ghost || st.focus) ? .92 : 0;
    W.ghost += (ghostT - W.ghost) * k;
    var u = bldgMat.uniforms;
    u.uGhost.value = W.ghost; u.uFlat.value = W.explode; u.uPower.value = st.levels.power.health;
    bldgMat.depthWrite = W.ghost < .5;
    ringMat.uniforms.uTime.value += dt;
    var tidalDir = st.hour < 12.5 ? 1 : -1;
    D.order.forEach(function (id) {
      var S = W.systems[id], lv = st.levels[id], c = S.cur, isF = st.focus === id, dim = st.focus && !isF;
      var tl, tp, tf, tb;
      if (st.layers) { tl = dim ? .1 : .95; tp = dim ? .12 : 1; tf = dim ? .12 : 1; tb = dim ? 0 : .0; }
      else if (st.focus) { tl = isF ? 1 : 0; tp = isF ? 1 : 0; tf = isF ? 1 : .16; tb = isF ? 1 : 0; }
      else { tl = .5; tp = 1; tf = 1; tb = 0; }
      c.line += (tl - c.line) * k; c.part += (tp - c.part) * k; c.fac += (tf - c.fac) * k; c.beacon += (tb - c.beacon) * k;
      var hl = lv.health;
      S.lineMat.color.copy(GREY).lerp(S.color, hl); S.lineMat.opacity = c.line * (.4 + .6 * hl); S.lines.visible = c.line > .01;
      S.partMat.uniforms.uOpacity.value = c.part; S.points.visible = c.part > .01;
      S.bodyMat.opacity = c.fac; S.bodyMat.depthWrite = c.fac > .9; S.glowMat.opacity = c.fac * (.25 + .75 * hl); S.glowMat.depthWrite = c.fac > .9;
      S.beaconMat.uniforms.uOpacity.value = c.beacon; S.beacons.visible = c.beacon > .02; S.stemMat.opacity = c.beacon * .55; S.stems.visible = c.beacon > .02;
      S.frameMat.opacity = W.explode * (dim ? .12 : .55); S.frame.visible = W.explode > .01;
      S.sheetMat.opacity = W.explode * (dim ? .01 : .05); S.sheet.visible = W.explode > .01;
      S.group.position.y = W.explode * (10 + S.layer * W.layerGap);
      if (id === 'telecom') ringMat.uniforms.uOpacity.value = c.part * hl * (.35 + .65 * lv.act);
      if (!S.points.visible) return;
      S.clock += dt * (.25 + .75 * hl);
      var pd = S.pd, n = pd.n, pos = S.points.geometry.attributes.position.array, vis = S.points.geometry.attributes.aVis.array;
      var level = lv.act * hl, clock = S.clock;
      for (var i = 0; i < n; i++) {
        var lvl = pd.always[i] ? Math.max(level, .6 * hl) : level, v = (lvl - pd.r[i]) * 8;
        v = v < 0 ? 0 : v > 1 ? 1 : v; vis[i] = v;
        if (v === 0) continue;
        var p = pd.path[i], dir = pd.tidal[i] ? tidalDir : pd.dir[i], d = (pd.d0[i] + dir * pd.sp[i] * clock) % p.len;
        if (d < 0) d += p.len;
        pointAt(p, d, pos, i * 3);
      }
      S.points.geometry.attributes.position.needsUpdate = true; S.points.geometry.attributes.aVis.needsUpdate = true;
    });
  };

  var pv = new T.Vector3();
  W.project = function (v, yOff) {
    pv.set(v.x, v.y + (yOff || 0), v.z).project(W.camera);
    var c = W.renderer.domElement;
    return { x: (pv.x * .5 + .5) * c.clientWidth, y: (-pv.y * .5 + .5) * c.clientHeight, ok: pv.z > -1 && pv.z < 1 };
  };
  W.nodeAnchor = function (n, out) { return out.set(n.top.x, n.top.y + W.systems[n.sys].group.position.y, n.top.z); };
  var av = new T.Vector3();
  W.pick = function (x, y, sysId, radius) {
    var best = null, bd = radius || 30;
    W.nodes.forEach(function (n) {
      if (sysId && n.sys !== sysId) return;
      if (!sysId && !n.label) return;
      W.nodeAnchor(n, av); if (!sysId) av.y -= 2.4 + n.h * .4;
      var s = W.project(av); if (!s.ok) return;
      var d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  };
  W.render = function () { W.renderer.render(W.scene, W.camera); };
})();
