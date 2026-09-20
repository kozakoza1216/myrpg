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

  // initialVisited: 既に探索済みの足跡マップ（同じ参照を渡せば、フロアを行き来しても
  // 探索状況が保持される。省略時は空から始まる新規フロア扱い）。
  function Dungeon(containerEl, data, gameState, callbacks, initialVisited) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.x = data.start.x;
    this.y = data.start.y;
    this.dir = data.start.dir || 0;
    this.visited = initialVisited || {};
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
    this.lastAction = delta > 0 ? "turn-right" : "turn-left";
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
    this.lastAction = backward ? "step-back" : "step-fwd";
    var leftScreen = this.onEnterTile(tile);
    if (!leftScreen) this.render();
  };

  Dungeon.prototype.flash = function (msg) {
    this.transientMsg = msg;
    this.lastAction = "bump";
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
    if (tile.indexOf("stairs:") === 0) {
      var floorId = tile.slice(7);
      if (this.cb.onStairs) { this.cb.onStairs(floorId); return true; }
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

  // 脇の開口部の先を実際に何マス覗けるか調べる（上限PEEK_MAXまで）
  var PEEK_MAX = 2;
  function sidePeekDepth(self, x, y, dx, dy) {
    var depth = 0;
    while (depth < PEEK_MAX) {
      var nx = x + dx * (depth + 1), ny = y + dy * (depth + 1);
      if (self.isBlocking(self.tileAt(nx, ny))) break;
      depth++;
    }
    return depth;
  }

  // 脇の開口部を、実際に覗けた奥行き分だけ横に広げて描く。
  // peekDepth が浅い（すぐ突き当たる）ほど狭い窪みに、深い（まだ続く）ほど
  // 広く開けた通路に見えるようにし、突き当たりが分かる時はその壁も描く。
  function drawSidePeek(svg, f0, f1, side, peekDepth) {
    var sign = side === "left" ? -1 : 1;
    var nearX = side === "left" ? f0.l : f0.r;
    var farX = side === "left" ? f1.l : f1.r;
    var ext = 22 * (peekDepth + 1);
    var outNearX = Math.max(0, Math.min(400, nearX + sign * ext));
    var outFarX = Math.max(0, Math.min(400, farX + sign * ext * 0.55));
    svg.appendChild(el("polygon", {
      points: [nearX, f0.b, outNearX, f0.b - 3, outFarX, f1.b - 2, farX, f1.b].join(" "),
      fill: "#1c1812", opacity: 0.9,
    }));
    if (peekDepth < PEEK_MAX) {
      svg.appendChild(el("polygon", {
        points: [outNearX, f0.t, outFarX, f1.t, outFarX, f1.b - 2, outNearX, f0.b - 3].join(" "),
        fill: "#4a4438", stroke: "#201c16", "stroke-width": 1,
      }));
    }
  }

  // ── 擬似3D描画 ──
  Dungeon.prototype.renderScene = function () {
    // 直前の操作（前進/後退/旋回/衝突）に応じたアニメーションを毎回付け直すことで、
    // 全面再描画でも「今どの操作が効いたか」が視覚的に分かるようにする
    var actionClass = this.lastAction ? " act-" + this.lastAction : "";
    var svg = el("svg", { viewBox: "0 0 400 260", class: "dungeon-scene" + actionClass });

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
    svg.appendChild(el("rect", { x: 0, y: 130, width: 400, height: 130, fill: "#26221c" })); // 床

    // 奥行き0→1の縮み方がきつすぎ、1マス先（手を伸ばせば届く宝箱・敵・NPC）が
    // 実際には遠くの物のように小さく描かれていた。手前ほど緩やかに、奥ほど急に
    // すぼまる曲線に描き直す（1マス先はまだ近くに大きく見えるべき）
    var frames = [
      { l: 0, r: 400, t: 40, b: 220 },
      { l: 24, r: 376, t: 51, b: 209 },
      { l: 70, r: 330, t: 71, b: 189 },
      { l: 120, r: 280, t: 94, b: 166 },
      { l: 160, r: 240, t: 112, b: 148 },
    ];

    var blockedAt = -1;
    for (var d = 0; d < frames.length - 1; d++) {
      var cell = this.forward(d);
      var tile = this.tileAt(cell.x, cell.y);
      if (this.isBlocking(tile)) { blockedAt = d; break; }
    }
    var maxDepth = blockedAt >= 0 ? blockedAt : frames.length - 2;

    // 突き当たりの壁は、視界の中で最も奥にあるもの＝一番最初（一番奥）に描く。
    // ループの後にただ追記すると、SVGは後に描いた要素ほど手前に乗るため、
    // 本来もっと近い側壁より奥にあるはずのこの壁が常に最前面に来てしまい、
    // 「奥の壁が手前の壁より前に出て見える」という描画優先度の逆転が起きる。
    if (blockedAt >= 0) {
      var bf0 = frames[blockedAt];
      // 左右の幅は「ひとつ手前の奥行き」の枠まで広げる。frames[0]まで一律に広げると、
      // 塞がれた場所がプレイヤーから2マス以上先にある時、その手前にある本物の側壁
      // （各深度ごとの台形）より前に張り出して描かれてしまい矛盾を生む
      var nf = frames[Math.max(0, blockedAt - 1)];
      svg.appendChild(el("polygon", {
        points: [nf.l, bf0.t, nf.r, bf0.t, nf.r, bf0.b, nf.l, bf0.b].join(" "),
        fill: "#6a6050", stroke: "#201c16", "stroke-width": 1.5,
      }));
    }

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
      // 建物ファサードのディテール（窓っぽい矩形）。実際に壁がある側にだけ置く
      // （左右どちらが塞がっているか見ずに常にf0.lへ置いていたため、右だけが壁の時に
      // 壁のない左側の宙に窓が浮いて見えるバグがあった）
      if (this.isBlocking(leftTile)) {
        svg.appendChild(el("rect", {
          x: f0.l + 4, y: (f0.t + f1.t) / 2, width: 6, height: 6, fill: "#8a7a5a", opacity: 0.5,
        }));
      }
      if (this.isBlocking(rightTile)) {
        svg.appendChild(el("rect", {
          x: f0.r - 10, y: (f0.t + f1.t) / 2, width: 6, height: 6, fill: "#8a7a5a", opacity: 0.5,
        }));
      }
      // 壁がない側＝脇道の開口部。実際にその先へ何マス進めるかを見て、
      // 行き止まりならその突き当たりの壁まで、続いているならその分だけ広く覗き込ませる
      // （見せかけの縁取りではなく、実際のマス目の形を反映した描画にする）
      if (!this.isBlocking(leftTile)) {
        var leftPeek = sidePeekDepth(this, cellHere.x, cellHere.y, -rv.dx, -rv.dy);
        drawSidePeek(svg, f0, f1, "left", leftPeek);
      }
      if (!this.isBlocking(rightTile)) {
        var rightPeek = sidePeekDepth(this, cellHere.x, cellHere.y, rv.dx, rv.dy);
        drawSidePeek(svg, f0, f1, "right", rightPeek);
      }
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
      // 一度見つけた宝箱・イベント・階段・出口は、自動地図の上でも色分けして覚えておく
      if (tile === "chest") color = "#c8a030";
      else if (typeof tile === "string" && tile.indexOf("event:") === 0) color = "#c85040";
      else if (typeof tile === "string" && tile.indexOf("stairs:") === 0) color = "#5090c8";
      else if (tile === "exit") color = "#60c880";
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

  function start(containerEl, data, gameState, callbacks, initialVisited) {
    var d = new Dungeon(containerEl, data, gameState, callbacks, initialVisited);
    d.render();
    return d;
  }

  // ── 広域マップ（ノードグラフ・PLAN.md §8-1/8-3準拠） ──
  // 「広域マップの移動は、ノード間を結ぶ経路を進む形式（グリッド or ノードグラフ）」
  // 「広域：マップ上の街・ノードを直接クリックして移動」に基づき、
  // 街・集落・危険地帯・寄り道跡などのノードを経路（エッジ）で繋ぎ、
  // 現在地に隣接するノードだけをクリックして進める。危険な経路は強制エンカウントのリスクを持つ。
  function WorldMap(containerEl, data, gameState, callbacks) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.current = data.start;
    this.visited = {};
    this.visited[data.start] = true;
  }

  WorldMap.prototype.nodeById = function (id) {
    return this.data.nodes.filter(function (n) { return n.id === id; })[0];
  };

  WorldMap.prototype.edgesFrom = function (id) {
    return this.data.edges.filter(function (e) { return e.from === id || e.to === id; });
  };

  // 到着後は必ず onArrive(nodeId, firstVisit, next) を呼ぶ。呼び出し側が
  // 「その場に留まる」（局所ダンジョンへ切替／会話イベントなど）か、
  // next() を呼んで広域マップの再描画に戻るかを決める。
  WorldMap.prototype.travelTo = function (nodeId) {
    var self = this;
    var edge = this.edgesFrom(this.current).filter(function (e) {
      return e.from === nodeId || e.to === nodeId;
    })[0];
    if (!edge) return;
    this.game.steps += edge.steps || 10;
    this.current = nodeId;
    var firstVisit = !this.visited[nodeId];
    this.visited[nodeId] = true;

    var arrive = function () {
      if (self.cb.onArrive) { self.cb.onArrive(nodeId, firstVisit, function () { self.render(); }); return; }
      self.render();
    };

    if (edge.encounterRate && Math.random() < edge.encounterRate && this.cb.onEncounter) {
      this.cb.onEncounter(edge.enemy, arrive);
      return;
    }
    arrive();
  };

  // ノード内部（局所エリア）を通り抜けた結果として、経路を辿らず直接そのノードへ
  // 到着したことにする。エッジの消耗・エンカウント判定は内部側で既に済んでいる。
  WorldMap.prototype.arriveAt = function (nodeId) {
    var self = this;
    var firstVisit = !this.visited[nodeId];
    this.current = nodeId;
    this.visited[nodeId] = true;
    if (this.cb.onArrive) { this.cb.onArrive(nodeId, firstVisit, function () { self.render(); }); return; }
    this.render();
  };

  // 会話/戦闘の流れでどこか別の場所へ進んだことを、画面遷移や到着判定を発火させずに
  // 広域マップの内部状態にだけ反映する（後でこのマップに戻った時の現在地を正しくするため）。
  WorldMap.prototype.setCurrent = function (nodeId) {
    this.current = nodeId;
    this.visited[nodeId] = true;
  };

  // ノードの種別ごとの簡易ピクトグラムアイコン
  function drawSettlementIcon(g) {
    g.appendChild(el("polygon", { points: "-9,10 -9,-3 0,-12 9,-3 9,10", fill: "#d8a860", stroke: "#4a3a28", "stroke-width": 1.5 }));
    g.appendChild(el("rect", { x: -3, y: 0, width: 6, height: 10, fill: "#4a3a28" }));
  }
  function drawDangerIcon(g) {
    g.appendChild(el("circle", { cx: 0, cy: 0, r: 11, fill: "#4a2018", stroke: "#8a3020", "stroke-width": 1.5 }));
    g.appendChild(el("polyline", { points: "-5,-6 1,-1 -3,3 5,7", fill: "none", stroke: "#e0602c", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  }
  function drawRuinIcon(g) {
    g.appendChild(el("polygon", { points: "-9,9 -9,-2 -3,-9 3,-3 9,-6 9,9", fill: "#5a5048", stroke: "#241f19", "stroke-width": 1.5 }));
  }
  function drawShrineIcon(g) {
    g.appendChild(el("rect", { x: -8, y: -9, width: 3, height: 19, fill: "#d8a860" }));
    g.appendChild(el("rect", { x: 5, y: -9, width: 3, height: 19, fill: "#d8a860" }));
    g.appendChild(el("rect", { x: -11, y: -12, width: 22, height: 4, fill: "#d8a860" }));
  }
  function drawNodeIcon(g, kind) {
    if (kind === "danger") drawDangerIcon(g);
    else if (kind === "ruin") drawRuinIcon(g);
    else if (kind === "shrine") drawShrineIcon(g);
    else drawSettlementIcon(g);
  }

  WorldMap.prototype.render = function () {
    var self = this;
    this.el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "worldmap-wrap";

    var hud = document.createElement("div");
    hud.className = "dungeon-hud";
    hud.textContent = (this.data.label || "") + "　歩数 " + this.game.steps + " / " + this.game.stepLimit;
    wrap.appendChild(hud);

    var svg = el("svg", { viewBox: "0 0 " + (this.data.width || 400) + " " + (this.data.height || 260), class: "worldmap" });

    var neighborIds = this.edgesFrom(this.current).map(function (e) {
      return e.from === self.current ? e.to : e.from;
    });

    this.data.edges.forEach(function (edge) {
      var a = self.nodeById(edge.from), b = self.nodeById(edge.to);
      if (!a || !b) return;
      var danger = !!edge.encounterRate;
      svg.appendChild(el("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: danger ? "#8a3020" : "#6a5638", "stroke-width": 3,
        "stroke-dasharray": danger ? "5,4" : "none",
      }));
    });

    this.data.nodes.forEach(function (node) {
      var isCurrent = node.id === self.current;
      var isNeighbor = neighborIds.indexOf(node.id) >= 0;
      var g = el("g", { transform: "translate(" + node.x + "," + node.y + ")", class: "map-node" });
      if (!isCurrent && !isNeighbor) g.setAttribute("opacity", "0.55");
      drawNodeIcon(g, node.kind);
      if (isCurrent) g.appendChild(el("circle", { cx: 0, cy: 0, r: 15, fill: "none", stroke: "#3a6bab", "stroke-width": 2 }));
      if (isNeighbor) {
        var hit = el("circle", { cx: 0, cy: 0, r: 16, fill: "transparent", class: "map-node clickable" });
        hit.onclick = function () { self.travelTo(node.id); };
        g.appendChild(hit);
      }
      var label = el("text", { x: 0, y: 24, "text-anchor": "middle", fill: "#e8dcc8", "font-size": 11 });
      label.textContent = node.name;
      g.appendChild(label);
      svg.appendChild(g);
    });

    wrap.appendChild(svg);
    this.el.appendChild(wrap);
  };

  function startWorldMap(containerEl, data, gameState, callbacks) {
    var m = new WorldMap(containerEl, data, gameState, callbacks);
    m.render();
    return m;
  }

  // ── ノード内部の自由移動エリア（グリッド不使用） ──
  // マス目には区切らず、クリックした座標へ直接歩く。位置は連続座標(x,y)で持ち、
  // 障害物・危険域・宝箱・出口は円形の当たり判定として定義する。
  // data: { width, height, start:{x,y}, obstacles:[{x,y,r}], zones:[{id,kind,x,y,r,encounterRate?}] }
  function FreeArea(containerEl, data, gameState, callbacks) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.pos = { x: data.start.x, y: data.start.y };
    this.taken = {};
    this.insideZoneId = null;
  }

  FreeArea.prototype.isBlocked = function (x, y) {
    var margin = 12;
    if (x < margin || x > this.data.width - margin || y < margin || y > this.data.height - margin) return true;
    var obstacles = this.data.obstacles || [];
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (Math.hypot(x - o.x, y - o.y) < o.r) return true;
    }
    return false;
  };

  FreeArea.prototype.zoneAt = function (x, y) {
    var zones = this.data.zones || [];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (this.taken[z.id]) continue;
      if (Math.hypot(x - z.x, y - z.y) < z.r) return z;
    }
    return null;
  };

  // ゾーンとの当たり判定は「入った瞬間」だけ発火させる（円の中に留まっている間、
  // 毎フレーム再発火しないように現在いるゾーンidを記憶しておく）。
  FreeArea.prototype.checkZone = function (x, y) {
    var zone = this.zoneAt(x, y);
    var id = zone ? zone.id : null;
    if (id === this.insideZoneId) return;
    this.insideZoneId = id;
    if (zone) this.enterZone(zone);
  };

  FreeArea.prototype.moveTo = function (tx, ty) {
    if (this.isBlocked(tx, ty)) { this.flash("そこには進めない。"); return; }
    if (this._playerEl) this._playerEl.style.transition = "transform 0.25s ease-out";
    this.pos = { x: tx, y: ty };
    this.updateHudAndPlayer();
    this.checkZone(tx, ty);
  };

  var KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
  };

  FreeArea.prototype.attachKeyboard = function () {
    if (this._kbAttached) return;
    this._kbAttached = true;
    this._keys = {};
    var self = this;
    this._onKeyDown = function (e) {
      var dir = KEYMAP[e.key];
      if (!dir) return;
      e.preventDefault();
      self._keys[dir] = true;
      self.ensureLoop();
    };
    this._onKeyUp = function (e) {
      var dir = KEYMAP[e.key];
      if (dir) self._keys[dir] = false;
    };
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
  };

  FreeArea.prototype.detachKeyboard = function () {
    if (!this._kbAttached) return;
    this._kbAttached = false;
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._keys = {};
  };

  FreeArea.prototype.ensureLoop = function () {
    if (this._raf) return;
    if (this._playerEl) this._playerEl.style.transition = "none";
    var self = this;
    var last = null;
    function frame(t) {
      if (last === null) last = t;
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      self.tick(dt);
      var k = self._keys;
      if (k && (k.up || k.down || k.left || k.right)) self._raf = requestAnimationFrame(frame);
      else self._raf = null;
    }
    this._raf = requestAnimationFrame(frame);
  };

  // 矢印キー/WASD押下中は毎フレーム連続座標で移動する（マス目には一切吸着しない）。
  FreeArea.prototype.tick = function (dt) {
    var k = this._keys;
    var dx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    var dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    if (!dx && !dy) return;
    var len = Math.hypot(dx, dy) || 1;
    var speed = 130;
    var moved = 0;
    var nx = this.pos.x + (dx / len) * speed * dt;
    if (!this.isBlocked(nx, this.pos.y)) { moved += Math.abs(nx - this.pos.x); this.pos.x = nx; }
    var ny = this.pos.y + (dy / len) * speed * dt;
    if (!this.isBlocked(this.pos.x, ny)) { moved += Math.abs(ny - this.pos.y); this.pos.y = ny; }
    if (moved <= 0) return;
    this.updateHudAndPlayer();
    this.checkZone(this.pos.x, this.pos.y);
  };

  FreeArea.prototype.updateHudAndPlayer = function () {
    if (this._hudEl) this._hudEl.textContent = (this.data.label || "") + "　歩数 " + this.game.steps + " / " + this.game.stepLimit;
    if (this._playerEl) this._playerEl.setAttribute("transform", "translate(" + this.pos.x + "," + this.pos.y + ")");
  };

  FreeArea.prototype.enterZone = function (zone) {
    var self = this;
    this.detachKeyboard();
    // 広域マップの経路と同じ考え方：移動距離ではなく、その区画を踏破した分の
    // 固定歩数をここでまとめて消費する（ノードの経路にsteps値を持たせるのと同じ形）。
    if (zone.kind === "exit") {
      this.game.steps += zone.steps === undefined ? 15 : zone.steps;
      if (this.cb.onExit) this.cb.onExit(zone.to);
      return;
    }
    if (zone.kind === "chest") {
      this.taken[zone.id] = true;
      if (this.cb.onChest) this.cb.onChest(zone.id, function () { self.render(); });
      return;
    }
    if (zone.kind === "talk") {
      if (this.cb.onTalk) { this.cb.onTalk(zone, function () { self.render(); }); return; }
      this.attachKeyboard();
      return;
    }
    // 一度だけ確実に起きる遭遇（チュートリアル戦闘など）。「danger」と違い確率判定はしない
    if (zone.kind === "encounter") {
      this.taken[zone.id] = true;
      if (this.cb.onEncounter) { this.cb.onEncounter(function () { self.render(); }); return; }
      this.attachKeyboard();
      return;
    }
    if (zone.kind === "danger") {
      var rate = zone.encounterRate === undefined ? 0.4 : zone.encounterRate;
      if (Math.random() < rate && this.cb.onEncounter) { this.cb.onEncounter(function () { self.render(); }); return; }
      this.attachKeyboard();
    }
  };

  FreeArea.prototype.flash = function (msg) {
    this.transientMsg = msg;
    this.render();
    var self = this;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(function () { self.transientMsg = null; self.render(); }, 1200);
  };

  // 中心(cx,cy)・半径rを基準にした比率座標列(x1,y1,...)をpolygon points文字列へ
  function pts18(cx, cy, r, frac) {
    var out = [];
    for (var i = 0; i < frac.length; i += 2) out.push((cx + frac[i] * r) + "," + (cy + frac[i + 1] * r));
    return out.join(" ");
  }

  // 瓦礫の山。形状を3種類使い回し、コピペ感の出ないよう向き・付随する破片を変える。
  var RUBBLE_SHAPES = [
    [0.9, 0.4, 0.75, -0.1, 0.15, -0.15, -0.4, 0.5, -0.1, 0.9, 0.6, 0.85],
    [-0.9, 0.2, -0.5, -0.6, 0.3, -0.7, 0.85, 0.1, 0.5, 0.8, -0.2, 0.7],
    [0.1, -0.9, 0.8, -0.3, 0.6, 0.6, -0.1, 0.8, -0.75, 0.3, -0.55, -0.5],
  ];
  function drawFreeAreaObstacle(g, o, i) {
    if (o.kind === "hut") { drawHutObstacle(g, o); return; }
    var shape = RUBBLE_SHAPES[i % RUBBLE_SHAPES.length];
    g.appendChild(el("polygon", { points: pts18(o.x, o.y, o.r, shape), fill: "#4a4038", stroke: "#241f19", "stroke-width": 1.5 }));
    var ax = o.x + o.r * (i % 2 === 0 ? -0.9 : 0.9), ay = o.y + o.r * 0.7;
    g.appendChild(el("rect", { x: ax - 4, y: ay - 3, width: 8, height: 6, fill: "#5a5048", stroke: "#241f19", "stroke-width": 1, transform: "rotate(" + (i * 23) + " " + ax + " " + ay + ")" }));
  }

  // 住人のいる小屋（廃墟の瓦礫ではなく、人が暮らす建物として区別できる意匠にする）
  function drawHutObstacle(g, o) {
    var r = o.r;
    g.appendChild(el("polygon", { points: pts18(o.x, o.y, r, [-0.8, 0.9, -0.8, 0.1, 0, -0.9, 0.8, 0.1, 0.8, 0.9]), fill: "#6a5638", stroke: "#3a2e1c", "stroke-width": 1.5 }));
    g.appendChild(el("rect", { x: o.x - r * 0.2, y: o.y + r * 0.3, width: r * 0.4, height: r * 0.6, fill: "#3a2e1c" }));
  }

  function drawFreeAreaZone(g, z) {
    if (z.kind === "danger") {
      g.appendChild(el("circle", { cx: z.x, cy: z.y, r: z.r, fill: "rgba(224,96,44,0.16)", stroke: "#8a3020", "stroke-width": 1.5, "stroke-dasharray": "4,3" }));
      g.appendChild(el("polyline", { points: pts18(z.x, z.y, z.r, [-0.5, -0.5, 0.1, 0, -0.3, 0.3, 0.5, 0.6]), fill: "none", stroke: "#e0602c", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    } else if (z.kind === "chest") {
      g.appendChild(el("rect", { x: z.x - 10, y: z.y - 7, width: 20, height: 14, fill: "#8a6a30", stroke: "#4a3a28", "stroke-width": 1.5 }));
      g.appendChild(el("rect", { x: z.x - 10, y: z.y - 12, width: 20, height: 7, fill: "#a8823c", stroke: "#4a3a28", "stroke-width": 1.5 }));
    } else if (z.kind === "exit") {
      // 小さな門（左右の柱＋まぐさ）。祭壇の鳥居と混同しない簡素な形にする
      g.appendChild(el("rect", { x: z.x - 9, y: z.y - 10, width: 4, height: 20, fill: "#d8a860" }));
      g.appendChild(el("rect", { x: z.x + 5, y: z.y - 10, width: 4, height: 20, fill: "#d8a860" }));
      g.appendChild(el("rect", { x: z.x - 11, y: z.y - 13, width: 22, height: 4, fill: "#d8a860" }));
    } else if (z.kind === "talk") {
      // 吹き出し（危険ではないNPC接触点）
      g.appendChild(el("rect", { x: z.x - 11, y: z.y - 10, width: 22, height: 15, rx: 4, fill: "#3a6bab", stroke: "#e8dcc8", "stroke-width": 1.5 }));
      g.appendChild(el("polygon", { points: (z.x - 4) + "," + (z.y + 5) + " " + (z.x + 2) + "," + (z.y + 5) + " " + (z.x - 6) + "," + (z.y + 12), fill: "#3a6bab", stroke: "#e8dcc8", "stroke-width": 1.5 }));
    } else if (z.kind === "encounter") {
      // 確定遭遇（危険地帯と違い実線の円＋足跡）
      g.appendChild(el("circle", { cx: z.x, cy: z.y, r: z.r, fill: "rgba(160,90,40,0.18)", stroke: "#a05a28", "stroke-width": 1.5 }));
      g.appendChild(el("circle", { cx: z.x - 5, cy: z.y - 3, r: 4, fill: "#c88850" }));
      g.appendChild(el("circle", { cx: z.x + 5, cy: z.y + 4, r: 4, fill: "#c88850" }));
    }
    if (z.label) {
      var t = el("text", { x: z.x, y: z.y + z.r + 12, "text-anchor": "middle", fill: "#c8b898", "font-size": 10 });
      t.textContent = z.label;
      g.appendChild(t);
    }
  }

  FreeArea.prototype.render = function () {
    var self = this;
    this.detachKeyboard();
    this.el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "dungeon-wrap";

    var hud = document.createElement("div");
    hud.className = "dungeon-hud";
    hud.textContent = (this.data.label || "") + "　歩数 " + this.game.steps + " / " + this.game.stepLimit;
    wrap.appendChild(hud);
    this._hudEl = hud;

    var svg = el("svg", { viewBox: "0 0 " + this.data.width + " " + this.data.height, class: "freearea", tabindex: "0" });
    svg.appendChild(el("rect", { x: 0, y: 0, width: this.data.width, height: this.data.height, fill: "#26221c" }));

    (this.data.obstacles || []).forEach(function (o, i) { drawFreeAreaObstacle(svg, o, i); });
    (this.data.zones || []).forEach(function (z) { if (!self.taken[z.id]) drawFreeAreaZone(svg, z); });

    var pg = el("g", { class: "freearea-player", transform: "translate(" + this.pos.x + "," + this.pos.y + ")" });
    pg.appendChild(el("polygon", { points: "0,10 -6,20 6,20", fill: "#3a6bab", stroke: "#e8dcc8", "stroke-width": 1.5 }));
    pg.appendChild(el("circle", { cx: 0, cy: 6, r: 6, fill: "#e8dcc8", stroke: "#3a6bab", "stroke-width": 1.5 }));
    svg.appendChild(pg);
    this._playerEl = pg;

    svg.onclick = function (evt) {
      var rect = svg.getBoundingClientRect();
      var x = (evt.clientX - rect.left) * (self.data.width / rect.width);
      var y = (evt.clientY - rect.top) * (self.data.height / rect.height);
      self.moveTo(x, y);
      svg.focus();
    };

    wrap.appendChild(svg);

    if (this.transientMsg) {
      var msg = document.createElement("div");
      msg.className = "dungeon-msg";
      msg.textContent = this.transientMsg;
      wrap.appendChild(msg);
    }

    var hint = document.createElement("p");
    hint.className = "footnote";
    hint.textContent = "矢印キー／WASDで移動。クリックした場所へ直接歩くこともできます。";
    wrap.appendChild(hint);

    this.el.appendChild(wrap);
    this.attachKeyboard();
    svg.focus();
  };

  function startFreeArea(containerEl, data, gameState, callbacks) {
    var f = new FreeArea(containerEl, data, gameState, callbacks);
    f.render();
    return f;
  }

  return { start: start, startWorldMap: startWorldMap, startFreeArea: startFreeArea };
})();
