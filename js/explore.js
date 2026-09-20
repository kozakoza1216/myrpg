// 擬似3Dダンジョン探索（PLAN.md §8 準拠）。SVG遠近レイヤーで一人称視点の街路を描く。
window.RPG = window.RPG || {};

RPG.Explore = (function () {
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  var DIR_NAMES = ["北", "東", "南", "西"];

  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function Dungeon(containerEl, data, gameState, callbacks) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.x = data.start.x;
    this.y = data.start.y;
    this.dir = data.start.dir || 0;
    this.visited = {};
    this.markVisited(this.x, this.y);
  }

  Dungeon.prototype.tileAt = function (x, y) {
    var row = this.data.grid[y];
    if (!row) return "wall";
    var t = row[x];
    return t === undefined ? "wall" : t;
  };

  Dungeon.prototype.markVisited = function (x, y) {
    this.visited[x + "," + y] = true;
  };

  Dungeon.prototype.isBlocking = function (tile) {
    return tile === "wall" || (typeof tile === "string" && tile.indexOf("locked") === 0);
  };

  Dungeon.prototype.forward = function (steps) {
    var v = DIRS[this.dir];
    return { x: this.x + v.dx * steps, y: this.y + v.dy * steps };
  };

  Dungeon.prototype.right = function () {
    var v = DIRS[(this.dir + 1) % 4];
    return v;
  };

  Dungeon.prototype.turn = function (delta) {
    this.dir = (this.dir + delta + 4) % 4;
    this.render();
  };

  Dungeon.prototype.step = function (backward) {
    var target = this.forward(backward ? -1 : 1);
    var tile = this.tileAt(target.x, target.y);
    if (this.isBlocking(tile)) {
      this.flash("壁に阻まれた。");
      return;
    }
    this.x = target.x; this.y = target.y;
    this.markVisited(this.x, this.y);
    this.game.steps += 1;
    var leftScreen = this.onEnterTile(tile);
    if (!leftScreen) this.render();
  };

  Dungeon.prototype.flash = function (msg) {
    this.transientMsg = msg;
    this.render();
    var self = this;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(function () { self.transientMsg = null; self.render(); }, 1400);
  };

  // 戻り値 true = 画面遷移が起きた（呼び出し側は自分のrender()を呼んではいけない）
  Dungeon.prototype.onEnterTile = function (tile) {
    if (typeof tile !== "string") return false;
    if (tile === "exit") { if (this.cb.onExit) this.cb.onExit(); return true; }
    if (tile.indexOf("event:") === 0) {
      var id = tile.slice(6);
      if (this.cb.onEvent) this.cb.onEvent(id);
      return true;
    }
    if (tile === "encounter" || tile === "floor") {
      var rate = tile === "encounter" ? 0.35 : 0.06;
      if (Math.random() < rate && this.cb.onEncounter) { this.cb.onEncounter(); return true; }
    }
    return false;
  };

  Dungeon.prototype.interactFront = function () {
    var target = this.forward(1);
    var tile = this.tileAt(target.x, target.y);
    if (tile === "chest") {
      this.data.grid[target.y][target.x] = "floor";
      if (this.cb.onChest) this.cb.onChest();
      return;
    }
    if (typeof tile === "string" && tile.indexOf("npc:") === 0) {
      if (this.cb.onNpc) this.cb.onNpc(tile.slice(4));
      return;
    }
    if (typeof tile === "string" && tile.indexOf("locked:") === 0) {
      if (this.cb.onLocked) this.cb.onLocked(tile.slice(7), this);
      return;
    }
    this.step(false);
  };

  // ── 擬似3D描画 ──
  Dungeon.prototype.renderScene = function () {
    var svg = el("svg", { viewBox: "0 0 400 260", class: "dungeon-scene" });

    // 壊れた人工天井（§8-2 常時表現）
    svg.appendChild(el("rect", { x: 0, y: 0, width: 400, height: 130, fill: "url(#skyGrad)" }));
    var defs = el("defs", {});
    var grad = el("linearGradient", { id: "skyGrad", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el("stop", { offset: "0%", "stop-color": "#3a3630" }));
    grad.appendChild(el("stop", { offset: "100%", "stop-color": "#6a6258" }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    // 割れた月
    svg.appendChild(el("circle", { cx: 90, cy: 40, r: 14, fill: "#cfc7b0", opacity: 0.8 }));
    svg.appendChild(el("circle", { cx: 96, cy: 42, r: 14, fill: "#3a3630", opacity: 0.5 }));
    svg.appendChild(el("rect", { x: 130, y: 130, width: 400, height: 130, fill: "#26221c" })); // 床

    var frames = [
      { l: 0, r: 400, t: 40, b: 220 },
      { l: 70, r: 330, t: 70, b: 190 },
      { l: 130, r: 270, t: 92, b: 168 },
      { l: 165, r: 235, t: 108, b: 152 },
      { l: 185, r: 215, t: 118, b: 142 },
    ];

    var blockedAt = -1;
    for (var d = 0; d < frames.length - 1; d++) {
      var cell = this.forward(d);
      var tile = this.tileAt(cell.x, cell.y);
      if (this.isBlocking(tile)) { blockedAt = d; break; }
    }
    var maxDepth = blockedAt >= 0 ? blockedAt : frames.length - 2;

    for (var depth = maxDepth; depth >= 0; depth--) {
      var f0 = frames[depth], f1 = frames[depth + 1];
      var cellHere = this.forward(depth);
      var rv = this.right();

      var leftTile = this.tileAt(cellHere.x - rv.dx, cellHere.y - rv.dy);
      var rightTile = this.tileAt(cellHere.x + rv.dx, cellHere.y + rv.dy);

      if (this.isBlocking(leftTile)) {
        svg.appendChild(el("polygon", {
          points: [f0.l, f0.t, f1.l, f1.t, f1.l, f1.b, f0.l, f0.b].join(" "),
          fill: "#4a4438", stroke: "#201c16", "stroke-width": 1,
        }));
      }
      if (this.isBlocking(rightTile)) {
        svg.appendChild(el("polygon", {
          points: [f0.r, f0.t, f1.r, f1.t, f1.r, f1.b, f0.r, f0.b].join(" "),
          fill: "#5a5244", stroke: "#201c16", "stroke-width": 1,
        }));
      }
      // 建物ファサードのディテール（窓っぽい矩形）
      if (this.isBlocking(leftTile) || this.isBlocking(rightTile)) {
        svg.appendChild(el("rect", {
          x: f0.l + 4, y: (f0.t + f1.t) / 2, width: 6, height: 6, fill: "#8a7a5a", opacity: 0.5,
        }));
      }
    }

    if (blockedAt >= 0) {
      var bf = frames[blockedAt + 1] || frames[frames.length - 1];
      var bf0 = frames[blockedAt];
      svg.appendChild(el("polygon", {
        points: [bf0.l, bf0.t, bf0.r, bf0.t, bf0.r, bf0.b, bf0.l, bf0.b].join(" "),
        fill: "#6a6050", stroke: "#201c16", "stroke-width": 1.5,
      }));
    }

    // 前方のシンボル（扉／宝箱／NPC／段）
    var frontCell = this.forward(1);
    var frontTile = this.tileAt(frontCell.x, frontCell.y);
    var symFrame = frames[1];
    var cx = (symFrame.l + symFrame.r) / 2;
    if (frontTile === "chest") {
      svg.appendChild(el("rect", { x: cx - 14, y: symFrame.b - 20, width: 28, height: 18, fill: "#b08040", stroke: "#402c14", "stroke-width": 2 }));
    } else if (typeof frontTile === "string" && frontTile.indexOf("npc:") === 0) {
      svg.appendChild(el("circle", { cx: cx, cy: symFrame.b - 34, r: 10, fill: "#e8dcc8" }));
      svg.appendChild(el("polygon", { points: [cx - 10, symFrame.b - 24, cx + 10, symFrame.b - 24, cx, symFrame.b].join(" "), fill: "#5b7a9d" }));
    } else if (typeof frontTile === "string" && frontTile.indexOf("locked") === 0) {
      svg.appendChild(el("rect", { x: cx - 12, y: symFrame.t + 6, width: 24, height: (symFrame.b - symFrame.t) - 12, fill: "#3a3228", stroke: "#c89050", "stroke-width": 2 }));
    } else if (frontTile === "exit") {
      svg.appendChild(el("rect", { x: symFrame.l, y: symFrame.t, width: symFrame.r - symFrame.l, height: symFrame.b - symFrame.t, fill: "#d8c898", opacity: 0.5 }));
    }

    return svg;
  };

  Dungeon.prototype.renderAutomap = function () {
    var size = 10;
    var minX = 0, minY = 0, maxX = 0, maxY = 0;
    var self = this;
    Object.keys(this.visited).forEach(function (k) {
      var parts = k.split(",").map(Number);
      minX = Math.min(minX, parts[0]); maxX = Math.max(maxX, parts[0]);
      minY = Math.min(minY, parts[1]); maxY = Math.max(maxY, parts[1]);
    });
    var w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
    var svg = el("svg", { viewBox: "0 0 " + w + " " + h, width: w, height: h, class: "automap" });
    Object.keys(this.visited).forEach(function (k) {
      var parts = k.split(",").map(Number);
      var tile = self.tileAt(parts[0], parts[1]);
      var color = self.isBlocking(tile) ? "#221e18" : "#8a7a5a";
      svg.appendChild(el("rect", {
        x: (parts[0] - minX) * size, y: (parts[1] - minY) * size, width: size - 1, height: size - 1, fill: color,
      }));
    });
    svg.appendChild(el("circle", {
      cx: (this.x - minX) * size + size / 2, cy: (this.y - minY) * size + size / 2, r: 3, fill: "#e04030",
    }));
    return svg;
  };

  Dungeon.prototype.render = function () {
    var self = this;
    this.el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "dungeon-wrap";

    var hud = document.createElement("div");
    hud.className = "dungeon-hud";
    hud.textContent = "歩数 " + this.game.steps + " / " + this.game.stepLimit + "　向き: " + DIR_NAMES[this.dir];
    wrap.appendChild(hud);

    wrap.appendChild(this.renderScene());

    if (this.transientMsg) {
      var msg = document.createElement("div");
      msg.className = "dungeon-msg";
      msg.textContent = this.transientMsg;
      wrap.appendChild(msg);
    }

    var mapBox = document.createElement("div");
    mapBox.className = "automap-box";
    mapBox.appendChild(this.renderAutomap());
    wrap.appendChild(mapBox);

    var controls = document.createElement("div");
    controls.className = "dungeon-controls";
    controls.appendChild(ctrlBtn("↺", function () { self.turn(-1); }));
    controls.appendChild(ctrlBtn("▲ 進む", function () { self.interactFront(); }));
    controls.appendChild(ctrlBtn("↻", function () { self.turn(1); }));
    controls.appendChild(ctrlBtn("▼ 戻る", function () { self.step(true); }));
    wrap.appendChild(controls);

    this.el.appendChild(wrap);
  };

  function ctrlBtn(label, onClick) {
    var b = document.createElement("button");
    b.className = "skill-btn";
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  function start(containerEl, data, gameState, callbacks) {
    var d = new Dungeon(containerEl, data, gameState, callbacks);
    d.render();
    return d;
  }

  // ── 広域マップ（見下ろし・自由移動） ──
  // PLAN.md §8-1「広域マップの移動は、ノード間を結ぶ経路を進む形式（グリッド or ノードグラフ）」
  // のうち、グリッド歩行を採用。ノードをクリックして飛ぶのではなく、実際にタイルを踏んで進む。
  function Overworld(containerEl, data, gameState, callbacks) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.x = data.start.x;
    this.y = data.start.y;
    this.visited = {};
    this.markVisited(this.x, this.y);
  }

  Overworld.prototype.tileAt = function (x, y) {
    var row = this.data.grid[y];
    if (!row) return "wall";
    var t = row[x];
    return t === undefined ? "wall" : t;
  };

  Overworld.prototype.markVisited = function (x, y) { this.visited[x + "," + y] = true; };
  Overworld.prototype.isBlocking = function (tile) { return tile === "wall"; };

  Overworld.prototype.moveBy = function (dx, dy) {
    var tx = this.x + dx, ty = this.y + dy;
    var tile = this.tileAt(tx, ty);
    if (this.isBlocking(tile)) { this.flash("これ以上は進めない。"); return; }
    this.x = tx; this.y = ty;
    this.markVisited(this.x, this.y);
    this.game.steps += 1;
    var left = this.onEnterTile(tile);
    if (!left) this.render();
  };

  Overworld.prototype.flash = function (msg) {
    this.transientMsg = msg;
    this.render();
    var self = this;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(function () { self.transientMsg = null; self.render(); }, 1200);
  };

  // 戻り値 true = 画面遷移が起きた（呼び出し側は自分のrender()を呼んではいけない）
  Overworld.prototype.onEnterTile = function (tile) {
    if (typeof tile !== "string") return false;
    if (tile.indexOf("arrive:") === 0) {
      if (this.cb.onArrive) { this.cb.onArrive(tile.slice(7)); return true; }
      return false;
    }
    if (tile === "danger") {
      var rate = this.data.encounterRate === undefined ? 0.22 : this.data.encounterRate;
      if (Math.random() < rate && this.cb.onEncounter) { this.cb.onEncounter(); return true; }
    }
    return false;
  };

  // frac の並び [x1,y1,x2,y2,...]（タイル幅wに対する比率）を points 文字列に変換
  function pts(w, frac) {
    var out = [];
    for (var i = 0; i < frac.length; i += 2) out.push((frac[i] * w) + "," + (frac[i + 1] * w));
    return out.join(" ");
  }

  // 廃墟の瓦礫（進入不可マス）
  function drawWallTile(g, w) {
    g.appendChild(el("rect", { x: 0, y: 0, width: w, height: w, fill: "#171310" }));
    g.appendChild(el("polygon", { points: pts(w, [0.10, 0.90, 0.05, 0.50, 0.35, 0.35, 0.45, 0.75]), fill: "#4a4038", stroke: "#241f19", "stroke-width": 1 }));
    g.appendChild(el("polygon", { points: pts(w, [0.40, 0.85, 0.50, 0.30, 0.75, 0.40, 0.70, 0.90]), fill: "#5a5048", stroke: "#241f19", "stroke-width": 1 }));
    g.appendChild(el("polygon", { points: pts(w, [0.65, 0.90, 0.72, 0.55, 0.95, 0.60, 0.90, 0.92]), fill: "#3a342c", stroke: "#241f19", "stroke-width": 1 }));
  }

  // ひび割れた危険地帯（エンカウント発生マス）
  function drawDangerTile(g, w) {
    g.appendChild(el("rect", { x: 0, y: 0, width: w, height: w, fill: "#4a2018" }));
    g.appendChild(el("polyline", {
      points: pts(w, [0.15, 0.10, 0.45, 0.40, 0.25, 0.55, 0.60, 0.85, 0.85, 0.90]),
      fill: "none", stroke: "#e0602c", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    g.appendChild(el("polygon", { points: pts(w, [0.5, 0.12, 0.62, 0.32, 0.38, 0.32]), fill: "#e0a030" }));
  }

  // 荒れた地面（通行可能マス）
  function drawPlainTile(g, w) {
    g.appendChild(el("rect", { x: 0, y: 0, width: w, height: w, fill: "#3a3226" }));
    g.appendChild(el("circle", { cx: w * 0.3, cy: w * 0.7, r: w * 0.05, fill: "#5a5040" }));
    g.appendChild(el("circle", { cx: w * 0.65, cy: w * 0.35, r: w * 0.04, fill: "#4a4234" }));
    g.appendChild(el("circle", { cx: w * 0.55, cy: w * 0.78, r: w * 0.03, fill: "#5a5040" }));
  }

  // 到達地点の鳥居状の目印
  function drawArriveIcon(g, w) {
    g.appendChild(el("rect", { x: w * 0.3, y: w * 0.35, width: w * 0.08, height: w * 0.5, fill: "#d8a860" }));
    g.appendChild(el("rect", { x: w * 0.62, y: w * 0.35, width: w * 0.08, height: w * 0.5, fill: "#d8a860" }));
    g.appendChild(el("rect", { x: w * 0.22, y: w * 0.28, width: w * 0.56, height: w * 0.09, fill: "#d8a860" }));
  }

  Overworld.prototype.render = function () {
    var self = this;
    this.el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "worldmap-wrap";

    var hud = document.createElement("div");
    hud.className = "dungeon-hud";
    hud.textContent = (this.data.label || "") + "　歩数 " + this.game.steps + " / " + this.game.stepLimit;
    wrap.appendChild(hud);

    var size = 34, w = size - 2;
    var rows = this.data.grid.length, cols = this.data.grid[0].length;
    var svg = el("svg", { viewBox: "0 0 " + cols * size + " " + rows * size, class: "worldmap" });

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var tile = this.tileAt(x, y);
        var known = this.visited[x + "," + y];
        var g = el("g", { transform: "translate(" + x * size + "," + y * size + ")" });
        if (!known) {
          g.appendChild(el("rect", { x: 0, y: 0, width: w, height: w, fill: "#0c0906" }));
        } else if (this.isBlocking(tile)) {
          drawWallTile(g, w);
        } else if (tile === "danger") {
          drawDangerTile(g, w);
        } else {
          drawPlainTile(g, w);
          if (typeof tile === "string" && tile.indexOf("arrive:") === 0) drawArriveIcon(g, w);
        }
        var isAdjacent = Math.abs(x - this.x) + Math.abs(y - this.y) === 1 && !this.isBlocking(tile);
        if (isAdjacent) {
          var overlay = el("rect", { x: 0, y: 0, width: w, height: w, fill: "transparent", class: "map-node clickable" });
          overlay.onclick = (function (dx, dy) { return function () { self.moveBy(dx, dy); }; })(x - this.x, y - this.y);
          g.appendChild(overlay);
        }
        svg.appendChild(g);
        if (typeof tile === "string" && tile.indexOf("arrive:") === 0 && known) {
          var label = el("text", { x: x * size + size / 2, y: y * size - 4, "text-anchor": "middle", fill: "#d8a860", "font-size": 10 });
          label.textContent = this.data.labels && this.data.labels[tile.slice(7)] || "?";
          svg.appendChild(label);
        }
      }
    }
    var pg = el("g", { transform: "translate(" + (this.x * size + size / 2 - 7) + "," + (this.y * size + size / 2 - 10) + ")" });
    pg.appendChild(el("polygon", { points: "7,10 1,20 13,20", fill: "#3a6bab", stroke: "#e8dcc8", "stroke-width": 1.5 }));
    pg.appendChild(el("circle", { cx: 7, cy: 6, r: 6, fill: "#e8dcc8", stroke: "#3a6bab", "stroke-width": 1.5 }));
    svg.appendChild(pg);

    wrap.appendChild(svg);

    if (this.transientMsg) {
      var msg = document.createElement("div");
      msg.className = "dungeon-msg";
      msg.textContent = this.transientMsg;
      wrap.appendChild(msg);
    }

    var controls = document.createElement("div");
    controls.className = "dungeon-controls overworld-controls";
    controls.appendChild(ctrlBtn("←", function () { self.moveBy(-1, 0); }));
    var vgrid = document.createElement("div");
    vgrid.className = "vgrid";
    vgrid.appendChild(ctrlBtn("↑", function () { self.moveBy(0, -1); }));
    vgrid.appendChild(ctrlBtn("↓", function () { self.moveBy(0, 1); }));
    controls.appendChild(vgrid);
    controls.appendChild(ctrlBtn("→", function () { self.moveBy(1, 0); }));
    wrap.appendChild(controls);

    this.el.appendChild(wrap);
  };

  function startOverworld(containerEl, data, gameState, callbacks) {
    var o = new Overworld(containerEl, data, gameState, callbacks);
    o.render();
    return o;
  }

  return { start: start, startOverworld: startOverworld };
})();
