// 戦闘の攻撃エフェクト：斬撃・打撃・爪・突き・薙ぎ・衝撃波・炎・光の雨・呪い・紋・矢・回復・火花・灰。
// 48×48の小さな画面にドットで描き、拡大して見せる（画像の素材は使わない）。
// 1コマ50msで描き替えるので、ドット絵のアニメのように段がついて動く。
window.RPG = window.RPG || {};

RPG.BattleFx = (function () {
  var S = 48, C = S / 2, FRAME_MS = 50;

  function rng(seed) {
    return function () { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function P(ctx) {
    var p = {
      dot: function (x, y, c, w) { w = w || 1; ctx.fillStyle = c; ctx.fillRect(Math.round(x - (w - 1) / 2), Math.round(y - (w - 1) / 2), w, w); },
      line: function (x0, y0, x1, y1, c, w) {
        var n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (var i = 0; i <= n; i++) p.dot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, w);
      },
      ring: function (cx, cy, rx, ry, c, w, a0, a1) {
        a0 = a0 || 0; a1 = a1 === undefined ? Math.PI * 2 : a1;
        var n = Math.max(8, Math.ceil(Math.max(rx, ry) * Math.abs(a1 - a0)));
        for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; p.dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c, w); }
      },
    };
    return p;
  }
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  // 色：味方の攻撃は白〜金、敵の攻撃は白〜赤
  function pal(o) { return o.hostile ? { core: "#fff4ea", edge: "#ff5a40", deep: "#8a1c14" } : { core: "#fffbe8", edge: "#ffc860", deep: "#8a5a18" }; }

  // 1本の斬撃：(x0,y0)から(x1,y1)へ、先が走って、後ろから消えていく
  function slashStroke(p, f, x0, y0, x1, y1, col, w) {
    var head = clamp(f / 0.45), tail = clamp((f - 0.35) / 0.55);
    if (head <= tail) return;
    var ax = x0 + (x1 - x0) * tail, ay = y0 + (y1 - y0) * tail, bx = x0 + (x1 - x0) * head, by = y0 + (y1 - y0) * head;
    p.line(ax, ay, bx, by, col.edge, w + 2);
    p.line(ax, ay, bx, by, col.core, w);
    if (head < 1) { p.dot(bx + 2, by - 1, col.core); p.dot(bx - 1, by + 2, col.edge); }
  }

  function shieldArc(p, f, o, breaks, r) {
    var top = (o.from || "top") === "top", cy = top ? 16 : 32, bulge = top ? -1 : 1;
    var alive = breaks ? f < 0.45 : f < 0.85;
    if (alive) {
      var a = f < 0.15 ? f / 0.15 : 1, flash = f < 0.3;
      var col = flash ? "#ffffff" : "#8ac0f0", edge = flash ? "#c8e8ff" : "#4a80c0";
      // 盾の弧（攻撃の来る側へふくらむ）と、中の六角の格子
      p.ring(C, cy, 20 * a, 7 * a, edge, 2, top ? Math.PI : 0, top ? Math.PI * 2 : Math.PI);
      p.ring(C, cy, 19 * a, 6 * a, col, 1, top ? Math.PI : 0, top ? Math.PI * 2 : Math.PI);
      for (var x = -14; x <= 14; x += 7) for (var k = 0; k < 2; k++) {
        var yy = cy + bulge * (1 + k * 3) * a;
        if (((x / 7) + k) % 2 === 0) p.dot(C + x * a, yy, flash ? "#ffffff" : "#6aa0e0");
      }
      if (breaks && f > 0.22) {
        // ひび
        p.line(C - 2, cy + bulge * 5, C + 3, cy + bulge * 1, "#ffffff", 1);
        p.line(C + 3, cy + bulge * 1, C - 1, cy - bulge * 3, "#ffffff", 1);
        p.line(C + 3, cy + bulge * 1, C + 9, cy + bulge * 3, "#ffffff", 1);
      }
    } else if (breaks) {
      // 砕けた破片が散る
      var g = (f - 0.45) / 0.55;
      for (var i = 0; i < 14; i++) {
        var ax = (r() - 0.5) * 40, ay = bulge * (r() * 6) + g * 18 * (top ? 1 : -1) * (0.4 + r());
        if (r() < g * 0.8) continue;
        p.dot(C + ax * (1 + g), cy + ay, i % 2 ? "#8ac0f0" : "#e0f0ff", 2);
      }
    }
  }
  function bars(p, f, o, breaks, r) {
    var top = (o.from || "top") === "top", cy = top ? 16 : 32;
    if (!breaks || f < 0.45) {
      var a = Math.min(1, f / 0.18), c = f < 0.25 ? "#fff0c0" : "#d0a050";
      p.line(C - 14 * a, cy - 6 * a, C + 14 * a, cy + 6 * a, "#6a4a20", 4);
      p.line(C - 14 * a, cy + 6 * a, C + 14 * a, cy - 6 * a, "#6a4a20", 4);
      p.line(C - 14 * a, cy - 6 * a, C + 14 * a, cy + 6 * a, c, 2);
      p.line(C - 14 * a, cy + 6 * a, C + 14 * a, cy - 6 * a, c, 2);
    } else {
      var g = (f - 0.45) / 0.55, s = 10 + g * 10;
      p.line(C - s - 8, cy - 4 + g * 8, C - s, cy + g * 10, "#d0a050", 2);
      p.line(C + s, cy + g * 10, C + s + 8, cy - 4 + g * 8, "#d0a050", 2);
      for (var i = 0; i < 6; i++) p.dot(C + (r() - 0.5) * 30, cy + g * 14 * r(), "#8a6a30", 2);
    }
  }

  var DRAW = {
    slash: function (p, f, o, r) { var c = pal(o); slashStroke(p, f, 42, 5, 6, 43, c, o.big ? 2 : 1); if (f > 0.3 && f < 0.7) for (var i = 0; i < 5; i++) p.dot(C + (r() - 0.5) * 20, C + (r() - 0.5) * 20, c.edge); },
    twin: function (p, f, o) { var c = pal(o); slashStroke(p, f * 1.25, 42, 5, 6, 43, c, 1); slashStroke(p, (f - 0.22) * 1.25, 6, 5, 42, 43, c, 1); },
    claw: function (p, f, o) {
      var c = pal(o);
      for (var k = 0; k < 3; k++) { var d = (k - 1) * 7, g = f * 1.2 - k * 0.07; slashStroke(p, g, 36 + d, 6, 20 + d, 24, c, 1); slashStroke(p, g - 0.12, 20 + d, 24, 12 + d, 42, c, 1); }
    },
    strike: function (p, f, o, r) {
      var c = pal(o), big = o.big ? 1.3 : 1;
      if (f < 0.3) { var s = (2 + f * 30) * big; for (var y = -s; y <= s; y += 1) p.line(C - (s - Math.abs(y)), C + y, C + (s - Math.abs(y)), C + y, f < 0.12 ? c.core : c.edge); }
      if (f > 0.1) p.ring(C, C, (6 + f * 20) * big, (5 + f * 16) * big, f < 0.55 ? c.core : c.edge, f < 0.5 ? 2 : 1);
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2 + 0.3, r0 = (4 + f * 14) * big, r1 = r0 + (10 - f * 8) * big;
        if (f < 0.8) p.line(C + Math.cos(a) * r0, C + Math.sin(a) * r0, C + Math.cos(a) * r1, C + Math.sin(a) * r1, c.edge, 1);
      }
      if (f > 0.4) for (var j = 0; j < 10; j++) { var aa = r() * 6.28, rr = f * 22 * big * (0.5 + r() * 0.5); p.dot(C + Math.cos(aa) * rr, C + Math.sin(aa) * rr + f * 6, "#8a8078"); }
    },
    thrust: function (p, f, o) {
      var c = pal(o), dir = o.dir || -1, from = dir > 0 ? -4 : S + 4, head = from + (C - from) * clamp(f / 0.4);
      var tail = from + (C - from) * clamp((f - 0.3) / 0.4);
      p.line(C, tail, C, head, c.edge, 3); p.line(C, tail, C, head, c.core, 1);
      for (var k = -1; k <= 1; k += 2) if (f < 0.6) p.line(C + k * 7, head - dir * 16, C + k * 7, head - dir * 6, c.edge, 1);
      if (f > 0.38 && f < 0.85) { var s = (f - 0.38) * 30; p.line(C - s, C, C + s, C, c.core, 1); p.line(C, C - s, C, C + s, c.core, 1); p.line(C - s * 0.6, C - s * 0.6, C + s * 0.6, C + s * 0.6, c.edge, 1); p.line(C - s * 0.6, C + s * 0.6, C + s * 0.6, C - s * 0.6, c.edge, 1); }
    },
    sweep: function (p, f, o) {
      var c = pal(o), a0 = Math.PI * 1.05, span = Math.PI * 0.9, head = clamp(f / 0.5), tail = clamp((f - 0.35) / 0.55);
      if (head > tail) { p.ring(C, 30, 22, 10, c.edge, 3, a0 + span * tail, a0 + span * head); p.ring(C, 30, 21, 9, c.core, 1, a0 + span * tail, a0 + span * head); }
    },
    wave: function (p, f, o) {
      var cols = o.hostile ? ["#ffd0c8", "#ff8a78"] : ["#e0f4ff", "#8ac8e8"];
      for (var k = 0; k < 3; k++) { var g = f * 1.3 - k * 0.18; if (g <= 0 || g >= 1) continue; p.ring(C, C, 4 + g * 22, 3 + g * 12, g < 0.5 ? cols[0] : cols[1], g < 0.4 ? 2 : 1); }
    },
    fire: function (p, f, o, r) {
      var cols = ["#fff4c0", "#ffd050", "#ff9030", "#e04818", "#7a2410", "#3a1a10"];
      if (f < 0.25) p.ring(C, C, 2 + f * 30, 2 + f * 30, "#fff4c0", 3);
      for (var i = 0; i < 26; i++) {
        var a = r() * Math.PI * 2, sp = 0.4 + r() * 0.6, d = f * 24 * sp, lift = f * f * 14 * r();
        var ci = Math.min(cols.length - 1, Math.floor(f * cols.length + r() * 1.5));
        p.dot(C + Math.cos(a) * d, C + Math.sin(a) * d * 0.8 - lift, cols[ci], f < 0.5 ? 2 : 1);
      }
    },
    rain: function (p, f, o, r) {
      for (var i = 0; i < 12; i++) {
        var x = 4 + r() * 40, t0 = r() * 0.5, g = clamp((f - t0) / 0.35), y = -6 + g * 40;
        if (g <= 0) continue;
        if (g < 1) { p.line(x, y - 8, x, y, "#b8e0ff", 1); p.dot(x, y, "#ffffff"); }
        else if (f - t0 < 0.55) { p.dot(x - 2, 35, "#b8e0ff"); p.dot(x + 2, 35, "#b8e0ff"); p.dot(x, 33, "#ffffff"); }
      }
      if (f > 0.45 && f < 0.7) p.ring(C, 36, 18, 4, "#d8f0ff", 1);
    },
    curse: function (p, f, o, r) {
      var rot = f * 5, rr = 18 - f * 6;
      p.ring(C, C, rr, rr, "#5a1020", 1);
      for (var i = 0; i < 8; i++) { var a = rot + i / 8 * Math.PI * 2; p.dot(C + Math.cos(a) * rr, C + Math.sin(a) * rr, "#ff5070", 2); }
      if (f > 0.5) for (var j = 0; j < 18; j++) { var aa = r() * 6.28, d = (f - 0.5) * 44 * r(); p.dot(C + Math.cos(aa) * d, C + Math.sin(aa) * d, j % 2 ? "#c02040" : "#2a0810", 2); }
    },
    sigil: function (p, f, o) {
      var rr = 20 - f * 10, rot = -f * 3;
      p.ring(C, C, rr, rr * 0.55, "#b04070", 1); p.ring(C, C, rr * 0.6, rr * 0.33, "#e070a0", 1);
      for (var i = 0; i < 6; i++) { var a = rot + i / 6 * Math.PI * 2, x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr * 0.55; p.line(x - 2, y, x + 2, y, "#ffb0d0", 1); p.line(x, y - 2, x, y + 2, "#ffb0d0", 1); }
    },
    arrow: function (p, f, o) {
      var c = pal(o), dir = o.dir || -1, g = clamp(f / 0.35), y = (dir > 0 ? -10 : S + 10) + (C - (dir > 0 ? -10 : S + 10)) * g, x = C + (1 - g) * 10;
      if (g < 1) { p.line(x, y, x + dir * -0.1, y - dir * 12, "#c8b890", 1); p.dot(x, y, c.core, 2); }
      else if (f < 0.75) { var s = (f - 0.35) * 26; p.line(C - s, C, C + s, C, c.core, 1); p.line(C, C - s, C, C + s, c.edge, 1); }
    },
    heal: function (p, f, o, r) {
      for (var i = 0; i < 9; i++) {
        var x = 6 + r() * 36, t0 = r() * 0.4, g = clamp((f - t0) / 0.6), y = 42 - g * 34;
        if (g <= 0 || g >= 1) continue;
        var c = g < 0.6 ? "#c8ffc0" : "#60c060";
        p.line(x - 2, y, x + 2, y, c, 1); p.line(x, y - 2, x, y + 2, c, 1);
      }
    },
    spark: function (p, f, o) {
      var c = o.hostile ? { core: "#ffffff", edge: "#ff7050" } : { core: "#ffffff", edge: "#ffd060" };
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2, r0 = f * 10, r1 = r0 + (i % 2 ? 6 : 12) * (1 - f);
        p.line(C + Math.cos(a) * r0, C + Math.sin(a) * r0, C + Math.cos(a) * r1, C + Math.sin(a) * r1, i % 2 ? c.edge : c.core, 1);
      }
      if (f < 0.3) p.dot(C, C, c.core, 5 - f * 10);
    },
    // 受けの反応（受けた本人の枠の上に出す）。o.from＝攻撃が来る向き（"top"／"bottom"）
    // 盾：攻撃の来る側に、光の盾が張られて弾く
    shield: function (p, f, o) { shieldArc(p, f, o, false); },
    // 盾が破れる：張った盾にひびが入り、砕けて散る
    shieldBreak: function (p, f, o, r) { shieldArc(p, f, o, true, r); },
    // かわす：横へ流れる残像の線
    speed: function (p, f, o, r) {
      for (var i = 0; i < 9; i++) {
        var y = 10 + r() * 28, len = 6 + r() * 12, x = 4 + f * 30 + r() * 10;
        if (f > 0.85) continue;
        p.line(x, y, x + len * (1 - f), y, i % 2 ? "#a8d0ff" : "#e8f4ff", 1);
      }
    },
    // 足止め：攻撃の前に、交差した柵が立ちはだかる
    barricade: function (p, f, o) { bars(p, f, o, false); },
    barricadeBreak: function (p, f, o, r) { bars(p, f, o, true, r); },
    ash: function (p, f, o, r) {
      for (var i = 0; i < 30; i++) {
        var x = 6 + r() * 36, y0 = 14 + r() * 26, sp = 0.5 + r();
        var y = y0 - f * 26 * sp, dx = Math.sin(f * 6 + i) * 3;
        if (r() < f * 0.9) continue;
        p.dot(x + dx, y, i % 3 ? "#8a8784" : "#c8c4bc", r() < 0.3 ? 2 : 1);
      }
    },
  };

  // 再生：host（戦う者の箱など）の上に重ねて、durミリ秒で描き切ったら消える
  function play(type, host, opts) {
    opts = opts || {};
    var draw = DRAW[type];
    if (!draw || !host || !document.createElement) return null;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    var cv = document.createElement("canvas");
    if (!cv.getContext) return null;
    cv.width = S; cv.height = S;
    cv.className = "fx-sprite" + (opts.cls ? " " + opts.cls : "");
    host.appendChild(cv);
    var ctx = cv.getContext("2d"), p = P(ctx), dur = opts.dur || 450, seed = (opts.seed || 7) * 7919, t0 = null, lastFrame = -1, stopped = false;
    var step = function (now) {
      if (stopped) return;
      if (t0 === null) t0 = now;
      var el = now - t0, fr = Math.floor(el / FRAME_MS);
      if (fr !== lastFrame) {
        lastFrame = fr;
        ctx.clearRect(0, 0, S, S);
        draw(p, clamp(fr * FRAME_MS / dur), opts, rng(seed));
      }
      if (el < dur + FRAME_MS) requestAnimationFrame(step);
      else if (cv.parentNode) cv.parentNode.removeChild(cv);
    };
    requestAnimationFrame(step);
    return { stop: function () { stopped = true; if (cv.parentNode) cv.parentNode.removeChild(cv); } };
  }

  return { play: play, types: Object.keys(DRAW) };
})();
