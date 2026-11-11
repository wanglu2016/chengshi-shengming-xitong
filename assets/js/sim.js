/* 故障连锁推演。
   每个系统有一个 0–1 的“能力”。切断某个系统后，依赖它的系统先靠储备撑一段时间（buf 小时），
   储备按缺口大小消耗，耗尽后能力按依赖强度 w 下降，再继续向下游传导。 */
(function (root) {
  'use strict';
  function run(D, cut, hours, dt) {
    hours = hours || 72; dt = dt || 0.1;
    var ids = D.order, n = Math.round(hours / dt) + 1;
    var H = {}, cur = {}, i, k;
    ids.forEach(function (id) { H[id] = new Float32Array(n); H[id][0] = 1; cur[id] = 1; });
    var deps = D.deps.map(function (d) {
      return { to: d.to, on: d.on, w: d.w, buf: d.buf, text: d.text, expo: 0, fired: false, ramp: Math.max(.5, d.buf * .25) };
    });
    var events = [], half = {}, dead = {};
    cut.forEach(function (id) {
      events.push({ t: 0, sys: id, kind: 'cut', text: D.systems[id].name + '被切断' });
    });
    for (k = 1; k < n; k++) {
      var t = k * dt, next = {};
      ids.forEach(function (id) {
        var prev = cur[id], target = 1;
        if (cut.indexOf(id) >= 0) {
          next[id] = Math.max(0, prev - dt / .25);
          return;
        }
        for (i = 0; i < deps.length; i++) {
          var d = deps[i];
          if (d.to !== id) continue;
          var def = 1 - cur[d.on];
          d.expo += def * dt;
          var eff = d.w * def * Math.min(1, Math.max(0, (d.expo - d.buf) / d.ramp));
          target *= (1 - eff);
          if (eff > .1 && !d.fired) {
            d.fired = true;
            events.push({ t: t, sys: id, from: d.on, kind: 'dep', text: d.text });
          }
        }
        next[id] = prev + (target - prev) * Math.min(1, dt / .4);
      });
      ids.forEach(function (id) {
        cur[id] = next[id]; H[id][k] = cur[id];
        if (cut.indexOf(id) < 0) {
          if (!half[id] && cur[id] < .5) { half[id] = 1; events.push({ t: t, sys: id, kind: 'half', text: D.systems[id].name + '只剩不到一半的能力' }); }
          if (!dead[id] && cur[id] < .2) { dead[id] = 1; events.push({ t: t, sys: id, kind: 'dead', text: D.systems[id].name + '基本停摆' }); }
        }
      });
    }
    events.sort(function (a, b) { return a.t - b.t; });
    return { hours: hours, dt: dt, n: n, H: H, events: events };
  }
  function sample(res, id, t) {
    var x = Math.max(0, Math.min(res.n - 1.001, t / res.dt)), i = Math.floor(x), f = x - i;
    var a = res.H[id];
    return a[i] + (a[i + 1] - a[i]) * f;
  }
  root.Sim = { run: run, sample: sample };
})(typeof window !== 'undefined' ? window : globalThis);
