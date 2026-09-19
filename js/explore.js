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
    var maxDepth = blockedAt >= 0 ? blockedAt : frames.length - 1;

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

  // ── 広域マップ（ノードクリック移動） ──
  function renderWorldMap(containerEl, worldData, gameState, onTravel) {
    containerEl.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "worldmap-wrap";
    var hud = document.createElement("div");
    hud.className = "dungeon-hud";
    hud.textContent = "歩数 " + gameState.steps + " / " + gameState.stepLimit;
    wrap.appendChild(hud);

    var svg = el("svg", { viewBox: "0 0 400 300", class: "worldmap" });
    worldData.edges.forEach(function (edge) {
      var a = worldData.nodes.filter(function (n) { return n.id === edge.from; })[0];
      var b = worldData.nodes.filter(function (n) { return n.id === edge.to; })[0];
      if (!a || !b) return;
      svg.appendChild(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#6a5638", "stroke-width": 2 }));
    });
    worldData.nodes.forEach(function (node) {
      var reachable = gameState.visitedNodes[node.id] || worldData.edges.some(function (e) {
        return (e.from === node.id || e.to === node.id) && (gameState.visitedNodes[e.from] || gameState.visitedNodes[e.to]);
      });
      var isTarget = reachable && node.id !== gameState.currentNode;
      var g = el("g", { class: isTarget ? "map-node clickable" : "map-node" });
      if (isTarget) {
        g.appendChild(el("circle", { cx: node.x, cy: node.y, r: 16, fill: "transparent", "pointer-events": "all" }));
      }
      g.appendChild(el("circle", { cx: node.x, cy: node.y, r: node.id === gameState.currentNode ? 10 : 7, fill: gameState.visitedNodes[node.id] ? "#d8a860" : "#5a5244" }));
      var label = el("text", { x: node.x, y: node.y - 12, "text-anchor": "middle", fill: "#e8dcc8", "font-size": 11 });
      label.textContent = node.name;
      g.appendChild(label);
      if (isTarget) {
        g.onclick = function () { onTravel(node); };
      }
      svg.appendChild(g);
    });
    wrap.appendChild(svg);
    containerEl.appendChild(wrap);
  }

  return { start: start, renderWorldMap: renderWorldMap };
})();
