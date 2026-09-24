// 会話シーンの背景（横から見た一枚絵、人のいない場所だけ）と、その上に重ねる
// 登場人物の青い影（顔や細部を描かない単色のシルエット）。
// 画素ごとに色を決めて描き、段階を区切った色とディザで、ドット絵として仕上げる。
window.RPG = window.RPG || {};

RPG.Scenes = (function () {
  var W = 480, H = 270;

  function hash2(x, y, s) {
    var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s || 0, 982451653)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dith(x, y) { return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5; }

  // 端どうしがつながる256×256のノイズ（地形の描画と同じ作り）
  function tileableNoise(base, octaves, seed) {
    var N = 256, out = new Float32Array(N * N), total = 0;
    for (var o = 0; o < octaves; o++) {
      var cell = base >> o, L = N / cell, amp = Math.pow(0.55, o);
      total += amp;
      var lat = new Float32Array(L * L);
      for (var i = 0; i < L * L; i++) lat[i] = hash2(i % L, Math.floor(i / L), seed * 17 + o);
      for (var y = 0; y < N; y++) {
        var gy = y / cell, iy = Math.floor(gy), fy = gy - iy;
        fy = fy * fy * (3 - 2 * fy);
        var r0 = (iy % L) * L, r1 = ((iy + 1) % L) * L;
        for (var x = 0; x < N; x++) {
          var gx = x / cell, ix = Math.floor(gx), fx = gx - ix;
          fx = fx * fx * (3 - 2 * fx);
          var c0 = ix % L, c1 = (ix + 1) % L;
          var a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * fx;
          var b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * fx;
          out[y * N + x] += (a + (b - a) * fy) * amp;
        }
      }
    }
    for (var k = 0; k < out.length; k++) out[k] = Math.max(0, Math.min(1, (out[k] / total - 0.5) * 2.2 + 0.5));
    return out;
  }
  var NZ = null;
  function nz(which, x, y) {
    if (!NZ) NZ = { a: tileableNoise(64, 4, 11), b: tileableNoise(8, 2, 12), c: tileableNoise(128, 3, 13) };
    var t = NZ[which];
    return t[((Math.floor(y) & 255) << 8) | (Math.floor(x) & 255)];
  }

  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  // 色の列（暗→明）から、tの位置の色を段階を区切って選ぶ（ディザで段の境をぼかす）
  function ramp(list) { return list.map(hex); }
  function rp(r, t, x, y) {
    var n = r.length, i = Math.floor((t + dith(x, y) / n) * n);
    return r[i < 0 ? 0 : i >= n ? n - 1 : i];
  }

  function Img() { this.d = new Uint8ClampedArray(W * H * 4); this.m = new Uint8Array(W * H); }
  Img.prototype.set = function (x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    var i = (y * W + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  };
  Img.prototype.get = function (x, y) { var i = (y * W + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; };
  // 光や霞を重ねる（aは0〜1。ディザで段階を区切る）
  Img.prototype.add = function (x, y, c, a) {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    a = Math.floor((a + dith(x, y) * 0.12) * 8) / 8;
    if (a <= 0) return;
    var i = (y * W + x) * 4;
    this.d[i] += (c[0] - this.d[i]) * a; this.d[i + 1] += (c[1] - this.d[i + 1]) * a; this.d[i + 2] += (c[2] - this.d[i + 2]) * a;
  };
  Img.prototype.all = function (fn) { for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var c = fn(x, y); if (c) this.set(x, y, c); } };
  // 多角形を塗る（fnが色を返した画素だけ）
  Img.prototype.poly = function (pts, fn) {
    var y0 = Math.max(0, Math.floor(Math.min.apply(null, pts.map(function (p) { return p[1]; }))));
    var y1 = Math.min(H - 1, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p[1]; }))));
    for (var y = y0; y <= y1; y++) {
      var yc = y + 0.5, xs = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        for (var x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
          var c = fn(x, y);
          if (c) this.set(x, y, c);
        }
      }
    }
  };
  Img.prototype.rect = function (x0, y0, w, h, fn) { this.poly([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], fn); };
  Img.prototype.ellipse = function (cx, cy, rx, ry, fn) {
    for (var y = Math.floor(cy - ry); y <= cy + ry; y++) for (var x = Math.floor(cx - rx); x <= cx + rx; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) { var c = fn(x, y, dx, dy); if (c) this.set(x, y, c); }
    }
  };
  // 光源のまわりの明るみ
  Img.prototype.glow = function (cx, cy, r, c, amt) {
    for (var y = Math.floor(cy - r); y <= cy + r; y++) for (var x = Math.floor(cx - r); x <= cx + r; x++) {
      var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d < 1) this.add(x, y, c, amt * (1 - d) * (1 - d));
    }
  };
  // 差し込む光の筋（上の辺a-b から、下の辺c-d へ）
  Img.prototype.beam = function (pts, c, amt) {
    var self = this;
    var yTop = Math.min(pts[0][1], pts[1][1]), yBot = Math.max(pts[2][1], pts[3][1]);
    this.poly(pts, function (x, y) {
      var f = 1 - (y - yTop) / (yBot - yTop);
      self.add(x, y, c, amt * (0.35 + 0.65 * f) * (0.7 + 0.3 * nz("a", x * 0.5, y * 0.1)));
      return null;
    });
  };

  // ── 人物の影 ──
  // 影は一度「型」（マスク）に描いてから、まとめて黒く塗り、光源の側に細い縁の光を入れる。
  function Fig(img) { this.img = img; }
  Fig.prototype.mark = function (x, y) { if (x >= 0 && y >= 0 && x < W && y < H) this.img.m[y * W + x] = 1; };
  Fig.prototype.poly = function (pts) { var s = this; this.img.poly(pts, function (x, y) { s.mark(x, y); return null; }); };
  Fig.prototype.ellipse = function (cx, cy, rx, ry) { var s = this; this.img.ellipse(cx, cy, rx, ry, function (x, y) { s.mark(x, y); return null; }); };
  Fig.prototype.limb = function (ax, ay, bx, by, w0, w1) {
    var dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    this.poly([[ax + nx * w0, ay + ny * w0], [bx + nx * w1, by + ny * w1], [bx - nx * w1, by - ny * w1], [ax - nx * w0, ay - ny * w0]]);
  };
  // 人：足元(x,y)、背の高さh。o: robe（長衣）/ armsUp（両手を掲げる）/ hair（"spiky"|"long"|"bald"）/
  // sit（座る）/ hunch（背を丸める）/ back（後ろ姿）/ reach（片手を前へ）/ dir（向き 1=右 -1=左）
  Fig.prototype.person = function (x, y, h, o) {
    o = o || {};
    var dir = o.dir || 1;
    var sit = o.sit ? 0.28 : 0;
    var hy = y - h * (0.9 - sit), hr = h * 0.075;
    var hx = x + (o.hunch ? dir * h * 0.06 : 0);
    var sh = y - h * (0.8 - sit), wa = y - h * (0.5 - sit * 0.6);
    // 頭
    this.ellipse(hx, hy, hr, hr * 1.12);
    if (o.hair === "spiky") {
      [[-0.9, -0.2, -1.6, -1.5], [-0.3, -0.9, -0.2, -2.2], [0.3, -0.9, 0.9, -1.9], [0.8, -0.4, 1.7, -1.1]].forEach(function (s) {
        this.poly([[hx + s[0] * hr - hr * 0.35, hy + s[1] * hr], [hx + s[2] * hr, hy + s[3] * hr], [hx + s[0] * hr + hr * 0.45, hy + s[1] * hr + hr * 0.3]]);
      }, this);
    } else if (o.hair === "long") {
      this.poly([[hx - hr * 1.05, hy - hr * 0.3], [hx + hr * 1.05, hy - hr * 0.3], [hx + hr * 1.25, hy + hr * 2.6], [hx - hr * 1.25, hy + hr * 2.6]]);
    }
    // 首と胴
    this.limb(hx, hy + hr, x, sh, hr * 0.45, hr * 0.5);
    var sw = h * (o.robe ? 0.13 : 0.125), ww = h * 0.09;
    if (o.hunch) { sh += h * 0.02; }
    this.poly([[x - sw, sh], [x + sw, sh], [x + ww, wa], [x - ww, wa]]);
    if (o.robe) {
      // 長衣：腰から裾へ広がる
      this.poly([[x - ww, wa - 2], [x + ww, wa - 2], [x + h * 0.17, y], [x - h * 0.17, y]]);
    } else if (o.sit) {
      this.limb(x - ww * 0.5, wa, x + dir * h * 0.2, wa + h * 0.02, h * 0.05, h * 0.045);
      this.limb(x + dir * h * 0.2, wa + h * 0.02, x + dir * h * 0.22, y, h * 0.045, h * 0.04);
      this.ellipse(x + dir * h * 0.26, y - 1, h * 0.05, h * 0.02);
    } else {
      var st = o.walk ? h * 0.07 : h * 0.035;
      this.limb(x - ww * 0.45, wa, x - st, y - 1, h * 0.05, h * 0.035);
      this.limb(x + ww * 0.45, wa, x + st, y - 1, h * 0.05, h * 0.035);
      this.ellipse(x - st + dir * h * 0.02, y - 1, h * 0.045, h * 0.02);
      this.ellipse(x + st + dir * h * 0.02, y - 1, h * 0.045, h * 0.02);
    }
    // 腕
    var ax = sw * 0.92;
    if (o.armsUp) {
      this.limb(x - ax, sh + 2, x - h * 0.1, sh - h * 0.3, h * 0.035, h * 0.028);
      this.limb(x + ax, sh + 2, x + h * 0.1, sh - h * 0.3, h * 0.035, h * 0.028);
    } else if (o.sit) {
      this.limb(x - ax * 0.3, sh + 2, x + dir * h * 0.2, wa, h * 0.035, h * 0.028);
      this.limb(x + ax * 0.3, sh + 3, x + dir * h * 0.24, wa + 1, h * 0.035, h * 0.028);
    } else if (o.reach) {
      this.limb(x - dir * ax, sh + 2, x - dir * h * 0.16, wa + h * 0.05, h * 0.035, h * 0.028);
      this.limb(x + dir * ax, sh + 2, x + dir * h * 0.32, sh + h * 0.08, h * 0.035, h * 0.028);
    } else {
      this.limb(x - ax, sh + 2, x - h * 0.16, wa + h * 0.06, h * 0.035, h * 0.028);
      this.limb(x + ax, sh + 2, x + h * 0.16, wa + h * 0.06, h * 0.035, h * 0.028);
    }
  };
  // 鳥人：頭の後ろへ長くなびく冠羽、鉤形のくちばし、腕から垂れる長い羽根（たたんだ翼のように見える）、
  // 鉤爪のある素足。片手に剣を下げる
  Fig.prototype.birdPerson = function (x, y, h, dir) {
    var hx = x + dir * h * 0.02, hy = y - h * 0.87, hr = h * 0.068;
    this.ellipse(hx, hy, hr * 1.05, hr);
    // くちばし（顔の向きへ突き出し、先が下へ曲がる）
    this.poly([[hx + dir * hr * 0.5, hy - hr * 0.45], [hx + dir * hr * 2.3, hy + hr * 0.1], [hx + dir * hr * 1.9, hy + hr * 0.55], [hx + dir * hr * 0.6, hy + hr * 0.45]]);
    // 冠羽：後ろ上へ長く流れる3本
    [[-3.9, -1.3], [-4.4, -0.3], [-3.5, 0.7]].forEach(function (t, i) {
      var b0 = hy - hr * (1.0 - i * 0.5), b1 = hy - hr * (0.05 - i * 0.5);
      var mx = hx + dir * hr * (t[0] * 0.55), my = hy + hr * (t[1] * 0.55) - hr * 0.35;
      this.poly([[hx + dir * hr * 0.2, b0], [mx, my - hr * 0.3], [hx + dir * hr * t[0], hy + hr * t[1]], [mx + dir * hr * 0.2, my + hr * 0.45], [hx - dir * hr * 0.2, b1]]);
    }, this);
    var sh = y - h * 0.77, wa = y - h * 0.47;
    this.limb(hx, hy + hr, x, sh, hr * 0.5, hr * 0.55);
    // 胴と、肩を覆う羽のマント（裾は羽の先でぎざぎざ）
    this.poly([[x - h * 0.14, sh], [x + h * 0.14, sh], [x + h * 0.085, wa], [x - h * 0.085, wa]]);
    var mant = [[x - h * 0.16, sh - 1], [x + h * 0.16, sh - 1]];
    for (var m2 = 0; m2 <= 6; m2++) { var mx = x + h * 0.16 - m2 * h * 0.32 / 6; mant.push([mx, sh + h * (m2 % 2 ? 0.13 : 0.2)]); }
    this.poly(mant);
    // 腕と、腕から垂れる長い羽根（翼）
    for (var s = -1; s <= 1; s += 2) {
      var ax = x + s * h * 0.14, hx2 = x + s * h * 0.2, hy2 = wa + h * 0.04;
      this.limb(ax, sh + 2, hx2, hy2, h * 0.04, h * 0.03);
      var wing = [[ax, sh + 2], [ax + s * h * 0.06, sh + h * 0.04]];
      for (var f = 0; f <= 5; f++) wing.push([ax + s * h * (0.08 + f * 0.012), sh + h * (0.14 + f * 0.07) + (f % 2 ? -h * 0.03 : 0)]);
      wing.push([ax + s * h * 0.02, wa + h * 0.1]);
      this.poly(wing);
    }
    // 剣（顔の向きの手に下げ、切っ先は地面の近く）
    var gx = x + dir * h * 0.2, gy = wa + h * 0.05;
    this.limb(gx - dir * 3, gy - 1, gx + dir * 3, gy + 1, 1, 1);
    this.limb(gx, gy, gx + dir * h * 0.14, y - h * 0.06, 1.4, 0.6);
    // 脚：膝から下は細く、足首で後ろへ折れる。素足の鉤爪（前3本、後ろ1本）
    for (var k = -1; k <= 1; k += 2) {
      var kx = x + k * h * 0.05;
      this.limb(kx, wa, kx + k * h * 0.02, y - h * 0.24, h * 0.055, h * 0.035);
      this.limb(kx + k * h * 0.02, y - h * 0.24, kx - dir * h * 0.03, y - h * 0.1, h * 0.028, h * 0.022);
      this.limb(kx - dir * h * 0.03, y - h * 0.1, kx, y - 2, h * 0.022, h * 0.018);
      for (var t2 = 0; t2 < 3; t2++) this.limb(kx, y - 2, kx + dir * h * (0.05 + t2 * 0.012) + (t2 - 1) * h * 0.025, y, 1.2, 0.5);
      this.limb(kx, y - 2, kx - dir * h * 0.04, y, 1, 0.5);
    }
  };
  // 型に描いた影を塗る。light: 光の来る向き(lx,ly)、rim: 縁の光の色
  Fig.prototype.ink = function (base, rim, lx, ly) {
    var img = this.img, m = img.m;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      var nx = x + lx, ny = y + ly;
      var edge = rim && (nx < 0 || ny < 0 || nx >= W || ny >= H || !m[ny * W + nx]);
      img.set(x, y, edge ? rim : base);
    }
    m.fill(0);
  };

  // ── 共通の部品 ──
  var SKY = ramp(["#140f1e", "#1e1628", "#2a1c34", "#3c243a", "#56303c", "#763e3a", "#98543a", "#b86e40", "#d08c4c"]);
  var ROCK = ramp(["#08070a", "#0e0c10", "#141217", "#1b181e", "#232026", "#2c282e"]);

  // 人工天井と、その裂け目から見える夕空・割れた月。裂け目の位置を返す
  function ceiling(img, bottom, crackX0, crackX1) {
    var crack = function (x) { return 18 + Math.sin(x * 0.045) * 6 + (nz("a", x * 2, 7) - 0.5) * 16; };
    var wid = function (x) { var t = (x - crackX0) / (crackX1 - crackX0); return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * (14 + nz("c", x, 3) * 12); };
    img.all(function (x, y) {
      var edge = bottom + Math.sin(x * 0.02) * 5 + (nz("a", x, 40) - 0.5) * 18;
      if (y > edge) return null;
      var cy = crack(x), w = wid(x);
      if (w > 0 && Math.abs(y - cy) < w / 2) {
        // 裂け目の向こうの空（上ほど暗い）
        var t = 1 - (y - (cy - w / 2)) / Math.max(1, w) * 0.4 - 0.25 + (1 - Math.abs(x - (crackX0 + crackX1) / 2) / ((crackX1 - crackX0) / 2)) * 0.45;
        return rp(SKY, t, x, y);
      }
      // 天井：岩盤と、組み込まれた梁・板
      var t2 = 0.35 + (nz("a", x, y) - 0.5) * 0.4 + (nz("b", x, y) - 0.5) * 0.2;
      if (x % 64 < 4) t2 += 0.25;
      if (Math.abs(y - (bottom - 14)) < 2) t2 += 0.2;
      if (w > 0 && Math.abs(y - cy) < w / 2 + 3) t2 += 0.45;           // 裂け目の縁に当たる光
      t2 -= (edge - y) < 4 ? 0.2 : 0;
      return rp(ROCK, t2, x, y);
    });
    return { crack: crack, wid: wid };
  }
  // 二つに割れた月（裂け目の中に、少しずれた二つの半円）
  function splitMoon(img, cx, cy, r) {
    var MOON = ramp(["#8a7a6a", "#b0a088", "#d4c6a8", "#ece2c8"]);
    img.ellipse(cx - 1, cy, r, r, function (x, y, dx, dy) { if (dx > -0.08) return null; return rp(MOON, 0.8 - (dx + dy) * 0.2 - Math.hypot(dx, dy) * 0.3, x, y); });
    img.ellipse(cx + 4, cy - 3, r, r, function (x, y, dx, dy) { if (dx < 0.08) return null; return rp(MOON, 0.65 - (dx + dy) * 0.2 - Math.hypot(dx, dy) * 0.3, x, y); });
    img.glow(cx + 1, cy - 1, r * 3.2, [236, 210, 170], 0.18);
  }
  // 遠くの、天井を支える巨大な柱
  function pillars(img, xs, top, base, col) {
    xs.forEach(function (px, i) {
      var w = 16 + (i % 3) * 6;
      img.poly([[px - w / 2, top], [px + w / 2, top], [px + w / 2 + 3, base], [px - w / 2 - 3, base]], function (x, y) {
        var t = 0.5 + (x - px) / w * -0.3 + (nz("a", x * 2, y) - 0.5) * 0.25;
        return rp(col, t, x, y);
      });
    });
  }
  // 灰の積もった地面
  function ground(img, top, r) {
    img.all(function (x, y) {
      if (y < top + (nz("a", x, 90) - 0.5) * 6) return null;
      var t = 0.25 + (y - top) / (H - top) * 0.35 + (nz("a", x * 2, y * 2) - 0.5) * 0.3 + (nz("b", x, y) - 0.5) * 0.2;
      return rp(r, t, x, y);
    });
  }
  // 小屋の影（藁葺き屋根と、明かりの漏れる窓）
  function hutSil(img, x, base, w, h, col, lit) {
    var roof = h * 0.55;
    img.poly([[x - w / 2, base - h + roof], [x + w / 2, base - h + roof], [x + w / 2, base], [x - w / 2, base]], function () { return col; });
    img.poly([[x - w / 2 - 5, base - h + roof + 2], [x, base - h], [x + w / 2 + 5, base - h + roof + 2]], function () { return col; });
    if (lit) {
      var wx = x - w * 0.2, wy = base - h * 0.35;
      img.rect(wx, wy, 5, 4, function () { return [214, 150, 80]; });
      img.glow(wx + 2.5, wy + 2, 14, [224, 150, 80], 0.2);
    }
  }
  // 板壁（室内）
  var WOOD = ramp(["#140e08", "#1e150c", "#291d11", "#352617", "#42301d", "#4f3a24", "#5d452b"]);
  function plankWall(img, top, bottom, lightX, lightY, lightR) {
    img.all(function (x, y) {
      if (y < top || y >= bottom) return null;
      var pl = Math.floor(x / 14), px = x - pl * 14;
      var t = 0.4 + (hash2(pl, 0, 5) - 0.5) * 0.15 + (nz("a", x * 3, y * 0.3) - 0.5) * 0.25;
      if (px === 0) t = 0.05; else if (px === 1) t += 0.12;
      var d = Math.hypot(x - lightX, (y - lightY) * 1.2) / lightR;
      t += Math.max(0, 1 - d) * 0.45 - 0.15;
      return rp(WOOD, t, x, y);
    });
  }
  function plankFloor(img, top, lightX, lightR) {
    img.all(function (x, y) {
      if (y < top) return null;
      var row = Math.floor((y - top) / 6), ry = (y - top) - row * 6;
      var t = 0.35 + (hash2(row, Math.floor((x + row * 37) / 60), 6) - 0.5) * 0.15 + (nz("a", x * 0.6, y * 3) - 0.5) * 0.2;
      if (ry === 0) t = 0.08;
      t += Math.max(0, 1 - Math.abs(x - lightX) / lightR) * 0.3 * (1 - (y - top) / (H - top)) - 0.1;
      return rp(WOOD, t, x, y);
    });
  }
  // 焚き火・篝火の炎
  var FIRE = ramp(["#5a1a0a", "#9a3210", "#d0581a", "#f08a2a", "#f8c050", "#fff0b0"]);
  function flame(img, cx, base, w, h) {
    for (var y = Math.floor(base - h); y <= base; y++) {
      var f = (base - y) / h, half = w / 2 * (1 - f * f) * (0.8 + 0.3 * nz("a", cx * 3, y * 4));
      for (var x = Math.floor(cx - half); x <= cx + half; x++) {
        var d = Math.abs(x + 0.5 - cx) / Math.max(1, half);
        img.set(x, y, rp(FIRE, 1 - d * 0.6 - f * 0.55 + (nz("b", x * 2, y * 2) - 0.5) * 0.3, x, y));
      }
    }
    img.glow(cx, base - h * 0.4, h * 3.4, [240, 140, 60], 0.35);
  }

  // ── 場面 ──
  var PAINT = {};

  // 第一章の扉絵：人工天井の裂け目、割れた月、天井を支える柱、灰縁の集落
  PAINT.village = function (img) {
    img.all(function (x, y) { return rp(ramp(["#0e0b10", "#171219", "#221a22", "#2e2229"]), 0.2 + y / H * 0.5, x, y); });
    var cz = ceiling(img, 78, 150, 390);
    splitMoon(img, 262, cz.crack(262) - 1, 7);
    pillars(img, [40, 118, 408, 452], 60, 212, ramp(["#141117", "#1c181f", "#252027", "#2f2931"]));
    img.beam([[210, 30], [300, 30], [340, 230], [150, 230]], [210, 150, 110], 0.22);
    img.beam([[300, 34], [340, 34], [420, 230], [360, 230]], [210, 150, 110], 0.12);
    // 霞
    img.all(function (x, y) { if (y > 150 && y < 215) img.add(x, y, [70, 54, 58], 0.35 * (1 - Math.abs(y - 190) / 40)); return null; });
    ground(img, 212, ramp(["#141013", "#1d171a", "#272022", "#322a2a", "#3e3431"]));
    var HUT = [16, 12, 12];
    hutSil(img, 70, 216, 46, 40, HUT, true); hutSil(img, 150, 214, 38, 32, HUT, false);
    hutSil(img, 250, 218, 54, 46, HUT, true); hutSil(img, 330, 215, 40, 34, HUT, true); hutSil(img, 420, 217, 50, 42, HUT, false);
    // 柵
    for (var x = 0; x < W; x += 7) img.poly([[x, 226], [x + 3, 206 + (x % 3) * 2], [x + 5, 226]], function () { return [12, 9, 9]; });
    img.rect(0, 214, W, 2, function () { return [12, 9, 9]; });
  };

  // セオの住居：窓から薄暮の光、棚の干し肉と古びた回復薬、藁の寝床、戸口に立つミラの影
  PAINT.house = function (img) {
    plankWall(img, 0, 196, 110, 90, 150);
    // 梁
    img.rect(0, 0, W, 16, function (x, y) { return rp(WOOD, 0.15 + (nz("a", x * 2, y * 4) - 0.5) * 0.2, x, y); });
    img.rect(0, 16, W, 3, function () { return [10, 7, 4]; });
    // 窓：人工天井の裂け目の薄暮
    img.rect(84, 52, 54, 44, function (x, y) { return rp(SKY, 0.95 - (y - 52) / 44 * 0.6 + (nz("a", x * 3, y * 3) - 0.5) * 0.2, x, y); });
    img.rect(84, 72, 54, 3, function () { return [26, 18, 10]; }); img.rect(109, 52, 3, 44, function () { return [26, 18, 10]; });
    img.rect(80, 48, 62, 4, function () { return [58, 42, 26]; }); img.rect(80, 96, 62, 5, function () { return [66, 48, 30]; });
    plankFloor(img, 196, 150, 160);
    img.beam([[86, 56], [136, 56], [250, 200], [170, 200]], [220, 160, 110], 0.2);
    // 床に落ちた窓の光
    img.poly([[168, 200], [252, 200], [290, 232], [196, 232]], function (x, y) { img.add(x, y, [210, 150, 100], 0.25); return null; });
    // 棚：干し肉と古びた回復薬
    img.rect(196, 86, 88, 5, function (x, y) { return rp(WOOD, 0.75, x, y); });
    img.rect(196, 91, 88, 2, function () { return [16, 10, 6]; });
    img.rect(200, 91, 4, 14, function () { return [30, 20, 12]; }); img.rect(276, 91, 4, 14, function () { return [30, 20, 12]; });
    for (var i = 0; i < 4; i++) {
      img.poly([[206 + i * 9, 72], [212 + i * 9, 72], [211 + i * 9, 86], [207 + i * 9, 86]], function (x, y) { return rp(ramp(["#3a1a10", "#5a2a16", "#7a3c20", "#8e4c2a"]), 0.5 + (x % 3 === 0 ? 0.25 : 0) - (y - 72) / 40, x, y); });
      img.rect(208 + i * 9, 66, 2, 6, function () { return [120, 100, 70]; });
    }
    img.poly([[252, 86], [268, 86], [266, 70], [262, 64], [258, 64], [254, 70]], function (x, y) { return rp(ramp(["#1c2a24", "#2a4034", "#3c5a48", "#6a8a70"]), 0.45 + (x < 257 ? 0.35 : 0) - (y - 64) / 60, x, y); });
    img.rect(257, 58, 6, 6, function () { return [90, 66, 40]; });
    img.glow(258, 76, 10, [150, 200, 160], 0.12);
    // 藁の寝床と毛布
    img.poly([[300, 212], [470, 212], [470, 190], [306, 186]], function (x, y) { return rp(ramp(["#3a2c14", "#54401e", "#6e5428", "#886a34", "#a08040"]), 0.5 + (nz("a", x * 4, y) - 0.5) * 0.6 - (y - 186) / 60, x, y); });
    img.poly([[340, 196], [470, 196], [470, 182], [350, 180], [334, 188]], function (x, y) { return rp(ramp(["#1e2436", "#2a3248", "#38425c", "#48546e"]), 0.55 - (y - 180) / 40 + (nz("a", x * 2, y * 2) - 0.5) * 0.3, x, y); });
    // 戸口と、そこに立つミラの影（外の光を背にしている）
    img.rect(418, 30, 58, 166, function (x, y) { return rp(SKY, 0.85 - (y - 30) / 166 * 0.55, x, y); });
    img.rect(412, 26, 6, 172, function () { return [30, 20, 12]; }); img.rect(476, 26, 4, 172, function () { return [30, 20, 12]; });
    img.glow(446, 120, 90, [200, 140, 100], 0.18);
  };

  // くじ：篝火に照らされた広場。壇上で木札の箱を掲げるカガリと、見守る集落の人々
  PAINT.plaza = function (img) {
    img.all(function (x, y) { return rp(ramp(["#0e0b10", "#171219", "#221a22"]), 0.2 + y / H * 0.4, x, y); });
    var cz = ceiling(img, 60, 60, 300);
    splitMoon(img, 190, cz.crack(190) - 1, 6);
    pillars(img, [30, 440], 44, 200, ramp(["#141117", "#1c181f", "#252027"]));
    ground(img, 196, ramp(["#1a1210", "#241914", "#302119", "#3c2a1e", "#4a3424"]));
    var HUT = [18, 12, 11];
    hutSil(img, 60, 198, 60, 52, HUT, true); hutSil(img, 420, 198, 64, 56, HUT, true);
    // 壇
    img.poly([[170, 196], [310, 196], [300, 166], [180, 166]], function (x, y) { return rp(WOOD, 0.35 + (y - 166) / 40 * -0.2 + (x % 12 === 0 ? -0.2 : 0), x, y); });
    img.rect(176, 162, 128, 5, function (x, y) { return rp(WOOD, 0.7, x, y); });
    // 招竜派の垂れ幕（竜の印）
    img.rect(224, 70, 32, 70, function (x, y) { return rp(ramp(["#2a0e0c", "#44160f", "#5e2014", "#7a2c1a"]), 0.5 + (nz("a", x * 3, y) - 0.5) * 0.4 - (x - 224) / 90, x, y); });
    img.poly([[240, 86], [250, 100], [246, 100], [252, 118], [240, 108], [228, 118], [234, 100], [230, 100]], function () { return [150, 110, 60]; });
    img.rect(220, 66, 40, 4, function () { return [40, 28, 16]; });
    // 篝火
    img.rect(146, 176, 12, 20, function () { return [20, 14, 10]; }); img.rect(322, 176, 12, 20, function () { return [20, 14, 10]; });
    flame(img, 152, 176, 16, 26); flame(img, 328, 176, 16, 26);
    // 壇の上に置かれた、木札の入った箱
    img.rect(226, 150, 28, 14, function (x, y) { return rp(WOOD, 0.35 + (y === 150 ? 0.4 : 0) + (x === 226 ? 0.2 : 0) - (x > 250 ? 0.15 : 0), x, y); });
    img.rect(224, 148, 32, 3, function (x, y) { return rp(WOOD, 0.7, x, y); });
  };

  // 集落長の家：炉の火、背を丸めて座るトキ
  PAINT.chief = function (img) {
    plankWall(img, 0, 188, 200, 170, 170);
    for (var b = 0; b < 3; b++) img.rect(0, 20 + b * 44, W, 6, function (x, y) { return rp(WOOD, 0.12, x, y); });
    // 壁に掛かった道具
    img.rect(360, 60, 3, 60, function () { return [20, 14, 8]; });
    img.poly([[352, 60], [372, 60], [362, 48]], function () { return [60, 58, 54]; });
    img.rect(80, 70, 40, 28, function (x, y) { return rp(ramp(["#2a1e12", "#3a2a18", "#4c3820"]), 0.5 + (nz("a", x * 5, y) - 0.5) * 0.6, x, y); });
    plankFloor(img, 188, 200, 170);
    // 炉
    img.ellipse(200, 204, 44, 9, function (x, y) { return rp(ramp(["#1a1614", "#2a2420", "#3c342e", "#4e4439"]), 0.55 + (nz("b", x * 2, y * 2) - 0.5) * 0.5, x, y); });
    img.ellipse(200, 202, 34, 6, function () { return [18, 10, 8]; });
    flame(img, 200, 200, 30, 40);
    img.rect(170, 118, 60, 3, function () { return [26, 20, 14]; });
    img.rect(198, 121, 3, 40, function () { return [26, 20, 14]; });
    img.poly([[186, 160], [214, 160], [210, 176], [190, 176]], function () { return [22, 20, 22]; });
    // 腰掛け（炉の火を受けて縁が明るむ）
    img.rect(280, 176, 36, 6, function (x, y) { return rp(WOOD, x < 290 ? 0.55 : 0.25, x, y); });
    img.rect(284, 182, 4, 28, function () { return [22, 15, 9]; }); img.rect(308, 182, 4, 28, function () { return [18, 12, 7]; });
  };

  // 集落の門：開いた門の向こうに荒れた広域。後ろ姿で出ていくセオの影
  PAINT.gate = function (img, variant) {
    img.all(function (x, y) { return rp(ramp(["#0e0b10", "#171219", "#221a22", "#2e2229"]), 0.2 + y / H * 0.5, x, y); });
    var cz = ceiling(img, 64, 200, 470);
    splitMoon(img, 330, cz.crack(330) - 1, 6);
    // 門の向こうの荒野と、遠くの廃墟
    img.all(function (x, y) {
      if (y < 150 || y > 206) return null;
      var sky = 150 + (nz("a", x, 200) - 0.5) * 20;
      if (y < sky + 10 && hash2(Math.floor(x / 9), 0, 31) < 0.6 && y > sky - hash2(Math.floor(x / 9), 1, 32) * 26) return rp(ramp(["#1c181e", "#242028", "#2c2830"]), 0.5, x, y);
      return null;
    });
    ground(img, 190, ramp(["#141012", "#1c1619", "#251e1f", "#2f2726", "#3a302d"]));
    img.beam([[300, 40], [350, 40], [380, 210], [250, 210]], [210, 150, 110], 0.15);
    // 丸太の柵と門
    var LOG = ramp(["#0e0a08", "#18110c", "#241a12", "#302318"]);
    for (var x = 0; x < W; x += 13) {
      if (x > 180 && x < 300) continue;
      var top = 60 + hash2(x, 0, 33) * 12;
      img.poly([[x, 250], [x, top + 10], [x + 6, top], [x + 12, top + 10], [x + 12, 250]], function (px, py) { return rp(LOG, 0.3 + (px - x) / 12 * -0.25 + (nz("a", px * 4, py * 0.5) - 0.5) * 0.3, px, py); });
    }
    img.rect(0, 120, 184, 6, function (x, y) { return rp(LOG, 0.5, x, y); }); img.rect(296, 120, W - 296, 6, function (x, y) { return rp(LOG, 0.5, x, y); });
    if (variant === "closed") {
      // 閉ざされた門扉
      img.rect(184, 70, 112, 180, function (x, y) { var p = Math.floor((x - 184) / 14); return rp(LOG, 0.35 + (hash2(p, 0, 34) - 0.5) * 0.2 + ((x - 184) % 14 === 0 ? -0.3 : 0), x, y); });
      img.rect(184, 110, 112, 8, function (x, y) { return rp(LOG, 0.6, x, y); }); img.rect(184, 190, 112, 8, function (x, y) { return rp(LOG, 0.6, x, y); });
    } else {
      // 開いた門扉（左右に押し開けられている）
      img.poly([[160, 250], [160, 70], [186, 80], [186, 246]], function (x, y) { return rp(LOG, 0.25, x, y); });
      img.poly([[294, 246], [294, 80], [320, 70], [320, 250]], function (x, y) { return rp(LOG, 0.2, x, y); });
    }
    img.rect(178, 54, 124, 12, function (x, y) { return rp(LOG, 0.55 + (y === 54 ? 0.3 : 0), x, y); });
  };
  PAINT.gateClosed = function (img) { PAINT.gate(img, "closed"); };

  // 廃区画：崩れた建物が幾重にも重なる街並み
  PAINT.ruins = function (img) {
    img.all(function (x, y) { return rp(ramp(["#0c0b0e", "#141218", "#1c1a20", "#26222a"]), 0.25 + y / H * 0.5, x, y); });
    var cz = ceiling(img, 50, 250, 470);
    img.beam([[330, 26], [380, 26], [420, 240], [300, 240]], [190, 140, 110], 0.16);
    var layers = [
      { base: 210, hmin: 60, hmax: 150, col: ramp(["#16151a", "#1c1b21", "#222128"]), win: 0.06 },
      { base: 230, hmin: 40, hmax: 120, col: ramp(["#100f13", "#16151a", "#1c1a20"]), win: 0.1 },
    ];
    layers.forEach(function (L, li) {
      var x = -10;
      while (x < W) {
        var w = 30 + hash2(x, li, 41) * 50, hgt = L.hmin + hash2(x, li, 42) * (L.hmax - L.hmin);
        var top = L.base - hgt, broken = hash2(x, li, 43) < 0.6;
        var x0 = x;
        img.poly(broken ? [[x0, L.base], [x0, top + 10], [x0 + w * 0.3, top], [x0 + w * 0.55, top + 18], [x0 + w * 0.8, top + 6], [x0 + w, top + 24], [x0 + w, L.base]]
                        : [[x0, L.base], [x0, top], [x0 + w, top], [x0 + w, L.base]], function (px, py) {
          var t = 0.45 + (px - x0) / w * -0.3 + (nz("a", px * 2, py * 2) - 0.5) * 0.25;
          var wx = (px - x0) % 9, wy = (py - top) % 11;
          if (wx >= 3 && wx <= 6 && wy >= 4 && wy <= 8 && py < L.base - 8) {
            t = hash2(Math.floor((px - x0) / 9) + x0, Math.floor((py - top) / 11), 44) < L.win ? 2 : 0.05;
            if (t === 2) return [120, 96, 70];
          }
          return rp(L.col, t, px, py);
        });
        x += w + 2 + hash2(x, li, 45) * 10;
      }
      img.all(function (px, py) { if (py > L.base - 40 && py < L.base) img.add(px, py, [46, 40, 46], 0.3 * (1 - (L.base - py) / 40)); return null; });
    });
    ground(img, 228, ramp(["#0e0d10", "#16141a", "#1e1b21", "#28242a"]));
    // 手前の瓦礫の山
    [[60, 262, 70], [390, 268, 90]].forEach(function (r) {
      img.ellipse(r[0], r[1], r[2], r[2] * 0.45, function (x, y, dx, dy) { if (dy > 0.2) return null; var n = nz("b", x * 3, y * 3); return rp(ramp(["#08080a", "#121014", "#1c191d", "#262226"]), 0.5 - dy * 0.4 + (n - 0.5) * 0.6 - dx * 0.2, x, y); });
    });
    for (var k = 0; k < 6; k++) { var bx = 30 + k * 13; img.poly([[bx, 238], [bx + 2, 200 - k * 4], [bx + 3, 238]], function () { return [36, 20, 14]; }); }
  };

  // 祭壇へ続く隘路：両側に迫る廃墟の壁、瓦礫の上に立ち塞がる赤い鳥人の影
  PAINT.narrow = function (img) {
    img.all(function (x, y) { return rp(ramp(["#0e0b10", "#1a1216", "#28181a", "#3a2020"]), 0.2 + (1 - Math.abs(x - 240) / 240) * 0.3 + y / H * 0.2, x, y); });
    var cz = ceiling(img, 40, 180, 310);
    img.beam([[210, 20], [270, 20], [300, 230], [190, 230]], [220, 120, 90], 0.22);
    // 両側の壁
    var WALL = ramp(["#0a090c", "#121015", "#1a171d", "#232026", "#2d292f"]);
    img.all(function (x, y) {
      var l = 120 + Math.sin(y * 0.05) * 10 + (nz("a", 20, y * 2) - 0.5) * 30 - y * 0.25;
      var r = 360 - Math.sin(y * 0.04) * 12 - (nz("a", 80, y * 2) - 0.5) * 30 + y * 0.25;
      if (x > l && x < r) return null;
      var t = 0.3 + (nz("a", x * 2, y * 2) - 0.5) * 0.35 + (x < l ? (x - l + 60) / 200 : (r + 60 - x) / 200);
      if (Math.abs(x - l) < 3 || Math.abs(x - r) < 3) t += 0.3;
      return rp(WALL, t, x, y);
    });
    ground(img, 214, ramp(["#100c0e", "#1a1416", "#241c1d", "#2e2424"]));
    // 瓦礫の高み
    img.poly([[160, 218], [200, 188], [236, 182], [286, 190], [322, 218]], function (x, y) { return rp(WALL, 0.35 + (nz("b", x * 3, y * 3) - 0.5) * 0.5 - (y - 178) / 80, x, y); });
  };

  // 招竜の祭壇：石段の上の祭壇、竜を象った柱、青白い炎
  PAINT.shrine = function (img) {
    img.all(function (x, y) { return rp(ramp(["#07080c", "#0c0e14", "#12141c", "#1a1c26"]), 0.2 + (1 - Math.hypot(x - 240, y - 120) / 300) * 0.5, x, y); });
    var ST = ramp(["#0c0c10", "#15151b", "#1f1f26", "#2a2a32", "#36363f", "#43434c"]);
    // 竜を象った柱
    [110, 370].forEach(function (cx) {
      img.rect(cx - 16, 40, 32, 170, function (x, y) { return rp(ST, 0.4 + (x - cx) / 32 * -0.4 + (nz("a", x * 3, y) - 0.5) * 0.25, x, y); });
      img.poly([[cx - 24, 40], [cx + 24, 40], [cx + 30, 26], [cx + 10, 30], [cx, 14], [cx - 10, 30], [cx - 30, 26]], function (x, y) { return rp(ST, 0.5 - (y - 14) / 60, x, y); });
      img.rect(cx - 6, 60, 12, 6, function () { return [60, 140, 150]; });
    });
    // 石段と祭壇
    for (var s = 0; s < 6; s++) img.rect(150 - s * 18, 210 + s * 10, 180 + s * 36, 10, function (x, y) { return rp(ST, 0.55 - s * 0.05 + ((y - 210) % 10 === 0 ? 0.25 : 0) + (nz("b", x * 2, y * 2) - 0.5) * 0.2, x, y); });
    img.rect(196, 150, 88, 60, function (x, y) { return rp(ST, 0.45 + (x - 196) / 88 * -0.3 + (nz("a", x * 2, y * 2) - 0.5) * 0.3, x, y); });
    img.rect(190, 144, 100, 8, function (x, y) { return rp(ST, 0.8, x, y); });
    // 青白い炎
    var BF = ramp(["#0a2830", "#14505a", "#2a8a90", "#60c8c0", "#c0f0e0"]);
    [[172, 150], [308, 150]].forEach(function (p) {
      for (var y = p[1] - 30; y <= p[1]; y++) {
        var f2 = (p[1] - y) / 30, half = 7 * (1 - f2 * f2);
        for (var x = Math.floor(p[0] - half); x <= p[0] + half; x++) img.set(x, y, rp(BF, 1 - Math.abs(x - p[0]) / Math.max(1, half) * 0.6 - f2 * 0.5, x, y));
      }
      img.glow(p[0], p[1] - 12, 90, [90, 200, 200], 0.25);
      img.rect(p[0] - 5, p[1], 10, 60, function (x, y) { return rp(ST, 0.3, x, y); });
    });
  };

  // ── 登場人物の青い影 ──
  // 背景の上に胸から上が入る大きさで重ねる（足元は画面の下の外）。
  // 顔や服の細部は描かず、髪型・持ち物・体つきの輪郭だけで誰かが分かるようにする。
  var BLUE = ramp(["#1f3c86", "#26479a", "#2d52ac", "#355dbc"]);
  var FIG = {};
  // 2次ベジェ曲線を点列に
  function qb(p0, c, p1, n) {
    var out = [];
    for (var i = 0; i <= (n || 8); i++) { var t = i / (n || 8); out.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]); }
    return out;
  }
  // 胸から上の人の輪郭（卵形の頭・首・なで肩・胴）。o: cx, cy（頭の中心）, sw（肩幅の半分）, droop（肩の下がり）, hunch（首が前に出る）
  function bust(f, o) {
    var cx = o.cx || 240, cy = o.cy || 82, sw = o.sw || 88, dr = o.droop || 0, hn = o.hunch || 0;
    f.ellipse(cx + hn, cy, 29, 36);
    f.poly([[cx + hn - 28, cy + 6], [cx + hn + 28, cy + 6], [cx + hn + 22, cy + 26], [cx + hn + 8, cy + 39], [cx + hn - 8, cy + 39], [cx + hn - 22, cy + 26]]);
    f.poly([[cx + hn - 14, cy + 28], [cx + hn + 14, cy + 28], [cx + 18, cy + 66], [cx - 18, cy + 66]]);
    var L = [[cx - 18, cy + 58]].concat(qb([cx - 18, cy + 58], [cx - sw * 0.5, cy + 60 + dr], [cx - sw * 0.82, cy + 78 + dr]))
      .concat(qb([cx - sw * 0.82, cy + 78 + dr], [cx - sw, cy + 88 + dr], [cx - sw * 1.04, cy + 118 + dr])).concat([[cx - sw * 1.1, H + 2]]);
    var R = L.map(function (p) { return [2 * cx - p[0], p[1]]; }).reverse();
    f.poly(L.concat([[cx - sw * 1.1, H + 2], [cx + sw * 1.1, H + 2]]).concat(R));
  }
  // ミラ：いただいた立ち絵の輪郭をそのまま使う（480×270の画面に合わせて縮め、
  // 行ごとに「塗り始めのx,塗る長さ」を並べた形で持つ）。頭頂の跳ねた毛、
  // 結い上げた髪とリボン、立ち襟のブラウスとベストの肩の線が、影の形に残る。
  var MIRA_ROWS = ";;;;;;198,8;198,8;194,6;192,8;190,6,271,7;190,6,270,8;187,7,269,12;186,8,268,15,307,5;185,8,267,17,306,6;184,9,266,21,303,12;184,9,266,21,303,13;182,9,223,19,265,23,300,19;182,9,223,19,265,24,299,20;181,10,218,35,264,26,298,26;180,10,213,44,264,26,297,28;180,10,213,45,264,26,296,29;180,10,208,83,295,31;180,10,208,83,295,31;180,10,204,87,293,35;180,10,204,87,293,35;180,11,201,90,293,36;180,11,201,91,293,36;182,9,198,132;182,10,196,134;182,11,196,134;182,149;184,148;185,147;187,146;187,147;182,152;182,153;177,160;177,160;173,164;173,164;170,168;168,171;167,172;165,174;165,174;163,178;162,179;161,180;160,181;160,181;158,185;158,185;156,187;155,188;155,10,168,175;154,11,167,176;153,9,166,177;152,9,165,179;152,8,165,179;152,7,165,179;151,7,163,181;151,6,163,181;150,6,162,182;150,5,162,182;150,4,160,184;149,5,160,184;148,6,160,184;148,5,160,186;148,4,159,187;148,4,158,188;148,4,158,188;148,3,158,188;148,3,157,189;148,3,157,189;150,2,157,191;150,2,157,191;157,191;156,192;155,195;155,195;155,195;155,195;155,195;155,195;155,195;155,195;154,196;153,197;153,9,163,187;153,9,163,187;153,9,163,187;153,9,163,187;153,7,163,185;153,7,163,185;153,7,163,185;153,7,164,184;153,7,165,183;155,4,165,181;155,4,165,181;155,4,165,180;155,4,165,179;155,4,166,6,173,170;155,4,166,6,173,170;157,2,167,5,174,167;157,3,168,4,175,166;157,3,168,4,175,166;157,3,169,3,175,166;158,2,170,2,177,164;160,2,171,3,178,165;160,2,172,2,178,165;161,3,173,2,179,164;162,3,174,1,180,164;163,2,180,164;180,164;180,164;178,168;178,169;178,160,339,9;178,160,339,10,356,2;178,160,341,9,355,3;177,162,341,17;177,162,344,13;177,162,346,9;176,164,346,9;176,165;175,166;175,168;174,170;174,170;173,173;173,173;173,175;172,176;172,19,192,158;172,19,193,157;172,19,194,157;170,21,195,157;170,21,195,157;170,20,196,157;170,19,197,156;168,21,198,155;168,21,199,154;168,19,199,154;167,20,200,155;166,21,201,154;166,20,202,141,344,11;166,20,203,140,344,11;166,20,204,139,346,9;166,20,204,139,346,9;166,18,206,11,220,123,346,9;166,18,207,9,220,123,346,9;166,17,222,121,347,8;168,14,222,121,347,8;168,14,222,121,347,8;168,14,222,120,347,8;169,12,217,124,347,6;170,11,216,125,347,6;171,10,213,128,347,6;172,9,213,128,347,6;173,8,213,126,347,5;173,8,211,128,347,5;173,8,211,128,347,5;173,8,211,126,346,6;175,7,211,124,346,4;175,7,212,123,346,4;176,7,189,1,212,121,344,3;177,7,189,2,212,121,344,3;178,11,212,118,342,2;178,11,211,119,342,2;182,5,210,118;182,5,209,119;206,120;201,125;201,125;194,113,308,18;194,113,308,18;192,115,308,18;187,120,308,19;178,127,308,20;178,127,308,20;175,130,310,20,336,2;175,130,310,21,336,1;173,132,310,26;171,135,311,24;171,135,312,23;169,138,313,15;169,138,313,15;168,140,317,13;168,140,317,13;167,141,320,10;167,142,321,9;166,144,322,8;165,146,323,7;165,146,324,6;164,148,324,6;164,148,324,6;164,148,325,5;164,150,324,5;162,152,324,4;162,152,323,5;162,152,322,4;162,153,320,6;162,154,320,4;160,156;160,156;160,157;160,157;160,157;160,158;160,159;160,159;160,159;160,161;160,161;160,161;160,161;160,163;159,164;158,165;157,168;157,168;155,170;155,170;153,175;153,175;153,175;153,175;151,177;151,179;151,179;151,180;151,180;150,183;150,183;150,183;150,184;150,185;150,185;150,186;150,186;150,186;150,188;150,188;150,189;150,190;150,191;150,192;150,193;151,193;151,193;151,194;151,195;151,127,279,67;151,127,279,68;153,125,281,67;153,124,281,67;153,123,281,67;153,123,281,69;153,123,281,69;152,122,282,70;152,122,282,70;152,121,282,70;152,121,282,71;152,121,282,71;152,119,282,71;151,120,282,72;150,121,282,73;150,121,282,73";
  function markRows(f, enc) {
    enc.split(";").forEach(function (row, y) {
      if (!row) return;
      var v = row.split(",").map(Number);
      for (var i = 0; i + 1 < v.length; i += 2) for (var x = v[i]; x < v[i] + v[i + 1]; x++) f.mark(x, y);
    });
  }
  FIG.mira = function (f) { markRows(f, MIRA_ROWS); };
  FIG.kagari = function (f) {
    // 祭司：高く尖った儀式の冠と、立ち襟の長衣、張った肩
    bust(f, { sw: 96, cy: 92 });
    f.poly([[212, 70], [268, 70], [262, 40], [250, 16], [240, 4], [230, 16], [218, 40]]);
    f.poly([[206, 72], [274, 72], [270, 62], [210, 62]]);
    f.poly([[200, 134], [216, 110], [224, 150]]); f.poly([[280, 134], [264, 110], [256, 150]]);
  };
  FIG.toki = function (f) {
    // 集落長：禿げた頭をやや前へ落とし、なで肩で、長い顎ひげ
    bust(f, { sw: 78, cy: 96, droop: 10, hunch: -6 });
    f.poly(qb([214, 118], [218, 160], [234, 186], 8).concat(qb([246, 186], [262, 160], [266, 118], 8)));
  };
  FIG.elder = function (f) {
    // 竜読みの老人：頭巾をかぶり、ひげをたくわえ、杖をつく
    bust(f, { sw: 76, cy: 92, droop: 12, hunch: 4 });
    f.poly(qb([200, 116], [196, 50], [244, 38], 10).concat(qb([244, 38], [292, 50], [288, 116], 10)).concat([[270, 132], [218, 132]]));
    f.poly(qb([222, 120], [226, 158], [242, 176], 8).concat(qb([242, 176], [258, 158], [262, 120], 8)));
    f.limb(336, H + 2, 330, 40, 4, 4);
    f.ellipse(330, 38, 8, 7);
  };
  FIG.guard = function (f) {
    // 門番：兜、肩当て、立てた槍
    bust(f, { sw: 92 });
    f.poly([[206, 80], [274, 80], [272, 58], [256, 44], [240, 38], [224, 44], [208, 58]]);
    f.poly([[200, 82], [280, 82], [280, 76], [200, 76]]);
    f.ellipse(162, 162, 26, 20); f.ellipse(318, 162, 26, 20);
    f.limb(350, H + 2, 350, 34, 3, 3);
    f.poly([[341, 40], [359, 40], [350, 4]]);
  };
  FIG.tzelf = function (f) {
    // 赤い鳥人：横を向いた鉤形のくちばし、後ろへなびく冠羽、首の羽毛、羽に覆われた肩と、たたんだ翼の先
    bust(f, { sw: 90, cx: 244 });
    f.ellipse(240, 82, 28, 31);
    // くちばし：付け根が太く、先が下へ鉤形に曲がる
    f.poly(qb([220, 66], [194, 66], [174, 90], 8).concat([[176, 102]]).concat(qb([176, 102], [190, 92], [216, 102], 8)));
    [[[258, 62], [300, 34], [336, 30]], [[262, 72], [310, 58], [344, 58]], [[260, 84], [304, 86], [332, 92]]].forEach(function (q) {
      f.poly(qb([q[0][0] - 4, q[0][1] - 8], q[1], q[2], 10).concat(qb(q[2], [q[1][0] - 6, q[1][1] + 12], [q[0][0] - 2, q[0][1] + 8], 10)));
    });
    // 首回りのぎざぎざの羽毛
    var ruff = [];
    for (var i = 0; i <= 10; i++) { var a = Math.PI * (0.15 + 0.7 * i / 10); ruff.push([244 + Math.cos(a) * (i % 2 ? 40 : 30) * -1, 128 + Math.sin(a) * (i % 2 ? 22 : 12)]); }
    f.poly([[208, 118], [280, 118]].concat(ruff.reverse()));
    // 肩の後ろから立ち上がる、たたんだ翼の先
    f.poly(qb([170, 172], [126, 126], [134, 64], 10).concat(qb([134, 64], [150, 124], [190, 152], 10)));
    f.poly(qb([318, 172], [362, 126], [354, 64], 10).concat(qb([354, 64], [338, 124], [298, 152], 10)));
  };
  var SPEAKER_FIG = { "ミラ": "mira", "カガリ": "kagari", "集落長トキ": "toki", "竜読みの老人": "elder", "門番": "guard", "赤い鳥人": "tzelf", "ツェルフ": "tzelf" };

  var figCache = {};
  function figureFor(id) {
    if (!FIG[id]) return null;
    if (figCache[id]) return figCache[id];
    var img = new Img();
    var f = new Fig(img);
    FIG[id](f);
    // 単色の青。上ほどわずかに明るく、左上の縁に細く明るい線
    var m = img.m;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      var edge = x === 0 || y === 0 || !m[y * W + x - 1] || !m[(y - 1) * W + x];
      img.set(x, y, edge ? [92, 128, 214] : rp(BLUE, 0.75 - y / H * 0.5, x, y));
    }
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.className = "scene-figure";
    var ctx = cv.getContext("2d");
    var data = ctx.createImageData(W, H);
    data.data.set(img.d);
    ctx.putImageData(data, 0, 0);
    return (figCache[id] = cv);
  }
  function figureForSpeaker(name) { return SPEAKER_FIG[name] ? figureFor(SPEAKER_FIG[name]) : null; }

  var cache = {};
  // 場面名から背景の画像（canvas）を返す。同じ場面は一度だけ描く
  function canvasFor(id) {
    if (!PAINT[id]) return null;
    if (cache[id]) return cache[id];
    var img = new Img();
    PAINT[id](img);
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.className = "scene-bg";
    var ctx = cv.getContext("2d");
    var data = ctx.createImageData(W, H);
    data.data.set(img.d);
    for (var i = 3; i < data.data.length; i += 4) data.data[i] = 255;
    ctx.putImageData(data, 0, 0);
    return (cache[id] = cv);
  }

  return { canvasFor: canvasFor, figureFor: figureFor, figureForSpeaker: figureForSpeaker, ids: Object.keys(PAINT), figIds: Object.keys(FIG) };
})();
