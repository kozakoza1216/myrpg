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
    var oldFrame = this.el.querySelector(".dungeon-scene-frame");
    var oldPane = oldFrame ? oldFrame.querySelector(".dungeon-scene-pane") : null;
    // 幅は、これから作り直される新しい要素ではなく、既に一度描画済みで
    // 安定しているこちら（old）から先に測っておく。新しくrender()した
    // 直後の要素に対してgetBoundingClientRect等のレイアウト読み取りを
    // 挟んでからtransformを変更すると、以後のtransform変更がcomputed
    // styleに反映されなくなる（それでいてinline styleの値自体は正しく
    // 入っている）という、実際に検証で再現したブラウザの癖があったため。
    var panWidth = oldFrame ? oldFrame.getBoundingClientRect().width : 0;

    this.dir = (this.dir + delta + 4) % 4;
    this.lastAction = delta > 0 ? "turn-right" : "turn-left";
    this.render();

    // 回頭＝視点が回る、その途中の動きを見せる。新しい景色（newPane）は
    // 普通に描かれたそのままにしておき、今まで見えていた景色（oldPane、
    // 既に一度描画済みで安定した要素）だけをその上に重ねて回した側へ
    // スライドさせて退かす。退けるにつれて新しい景色が反対側から
    // 現れてくるように見える。newPane自身のtransformは一切いじらない
    // （できたばかりの要素のtransformを操作しようとすると、上のpanWidth
    // 計測の件と同種の癖でトランジションが発火しないことがあったため）。
    if (!oldPane) return;
    var newFrame = this.el.querySelector(".dungeon-scene-frame");
    var sign = delta > 0 ? 1 : -1; // 右へ回頭するなら、景色は左へ流れ去る
    oldPane.classList.add("pan-out");
    newFrame.appendChild(oldPane); // 新しいフレームに移し、その上に重ねる
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        oldPane.style.transform = "translateX(" + -sign * panWidth + "px)";
      });
    });
    setTimeout(function () {
      if (oldPane.parentNode) oldPane.parentNode.removeChild(oldPane);
    }, 340);
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
  // 広く開けた通路に見える。奥行きの上限（PEEK_MAX）に達した＝その先まだ
  // 通路が続いている場合も、壁面を省略すると開口部がほぼ何も見えない
  // （真っ暗闇に沈んで、あたかも行き止まりしかないかのように見える）ため、
  // 実際に続いている以上、壁は必ず描く（奥へ続く通路として見せる）。
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
    // 覗き穴の奥に見える壁面は、自分の視線に対して正面（垂直）に立っている壁。
    // 側壁（視線と平行に奥へすぼまっていく台形）と同じ形で描くと、まるで
    // もう一枚別の平行な壁＝ドアのようなものが飛び出て見えてしまうため、
    // 手前と奥で高さが変わらない、まっすぐな矩形として描く。
    // 内側の縁は突き当たりの壁の実際の端（farX）にぴったり合わせる。
    // 台形時代の名残りでoutFarX（farXよりさらに外側にオフセットした点）を
    // 使っていたため、突き当たりの壁との間に埋まらない隙間ができていた。
    // 正面を向いた壁という点では突き当たりの壁と同じ種類なので、同じ色を使う
    // （視線と平行な側壁の色を流用すると、ここだけ別の壁に見えてしまう）。
    svg.appendChild(el("polygon", {
      points: [outNearX, f1.t, farX, f1.t, farX, f1.b, outNearX, f1.b - 2].join(" "),
      fill: "#5c5446", stroke: "#201c16", "stroke-width": 1,
    }));
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

    // 突き当たりの壁は、視界の中で最も奥にあるもの＝一番最初（一番奥）に描く。
    // ループの後にただ追記すると、SVGは後に描いた要素ほど手前に乗るため、
    // 本来もっと近い側壁より奥にあるはずのこの壁が常に最前面に来てしまい、
    // 「奥の壁が手前の壁より前に出て見える」という描画優先度の逆転が起きる。
    if (blockedAt >= 0) {
      var bf0 = frames[blockedAt];
      // 突き当たりの壁は、その奥行きなりの自然な大きさ（frames[blockedAt]）で描く。
      // 以前はここを手前の枠まで無理に広げていたが、脇の開口部は今はdrawSidePeekが
      // 実際の形を描くようになっているので、その代わりに壁を膨らませる必要はなく、
      // むしろ角のような場面で不自然に巨大な壁になってしまっていた
      // 色は周りの側壁（#4a4438／#5a5244）と同じ系統の色みに揃える。
      // 以前は暖色寄りの明るい色（#6a6050）を使っていたため、
      // 同じ壁のはずなのに正面だけ別の材質に見えてしまっていた。
      svg.appendChild(el("polygon", {
        points: [bf0.l, bf0.t, bf0.r, bf0.t, bf0.r, bf0.b, bf0.l, bf0.b].join(" "),
        fill: "#5c5446", stroke: "#201c16", "stroke-width": 1.5,
      }));
    }

    // depth=blockedAt（突き当たりの壁そのもののマス）はループ対象に含めない。
    // そのマスは壁で占められていて実在する空間ではないため、その「隣」を見て
    // 側壁や覗き穴を描くと、壁の向こう側にたまたまある無関係な通路を誤って
    // 壁の脇の開口部として描いてしまう（行き止まりの壁に幽霊のような
    // 切れ込みが入って見えるバグの原因だった）。実際に描画すべきなのは
    // 突き当たりより手前の、本当に歩けるマスの分だけ。
    var loopStart = blockedAt >= 0 ? blockedAt - 1 : maxDepth;
    for (var depth = loopStart; depth >= 0; depth--) {
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

    var frame = document.createElement("div");
    frame.className = "dungeon-scene-frame";
    var pane = document.createElement("div");
    pane.className = "dungeon-scene-pane";
    pane.appendChild(this.renderScene());
    frame.appendChild(pane);
    wrap.appendChild(frame);

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

    // 方向転換は、絵そのものを動かすアニメーションではなく、一瞬の暗転から
    // 元に戻るトランジションで表現する。
    // 暗くする方（0→0.85）も、戻す方（0.85→0）と同じようにきちんと
    // トランジションさせないと、暗転そのものは一瞬で切り替わり、
    // 戻る方だけが滑らかという中途半端な見え方になってしまう。
    // 要素挿入直後の初期値（0のまま）からreflowを挟んで0.85へ変える
    // ことで暗くなる過程も、少し間を置いてから0へ戻す過程も、
    // どちらもCSSのtransitionとして発火させる。
    if (this.lastAction === "turn-left" || this.lastAction === "turn-right") {
      var flash = document.createElement("div");
      flash.className = "dungeon-flash";
      frame.appendChild(flash);
      void flash.offsetHeight;
      flash.style.opacity = "0.85";
      setTimeout(function () {
        flash.style.opacity = "0";
      }, 190);
    }
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
    var fromNodeId = this.current;
    var edge = this.edgesFrom(this.current).filter(function (e) {
      return e.from === nodeId || e.to === nodeId;
    })[0];
    if (!edge) return;
    this.game.steps += edge.steps || 10;
    this.current = nodeId;
    var firstVisit = !this.visited[nodeId];
    this.visited[nodeId] = true;

    var arrive = function () {
      if (self.cb.onArrive) { self.cb.onArrive(nodeId, firstVisit, function () { self.render(); }, { from: fromNodeId, fastTravel: false }); return; }
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
    if (this.cb.onArrive) { this.cb.onArrive(nodeId, firstVisit, function () { self.render(); }, { from: null, viaInterior: true, fastTravel: false }); return; }
    this.render();
  };

  // 現在地（今まさに立っているノード）をもう一度クリックした時の処理。
  // 隣接ノードから移動してきた瞬間（travelTo／onArrive）とは意味が違う
  // ため、別のコールバック（onReenter）で受ける。例えば「一度歩いた
  // エリアに、もう一度中へ入って歩き直したい」という操作はこちらが担う
  // （onArriveの方は初回到達時の判定やエンカウント消化を伴う「移動」の
  // 意味を持つため、そこに無理に混ぜると移動していないのに歩数や
  // 初回判定が絡んでしまう）。
  WorldMap.prototype.reenter = function () {
    var self = this;
    if (this.cb.onReenter) { this.cb.onReenter(this.current, function () { self.render(); }); return; }
    this.render();
  };

  // 会話/戦闘の流れでどこか別の場所へ進んだことを、画面遷移や到着判定を発火させずに
  // 広域マップの内部状態にだけ反映する（後でこのマップに戻った時の現在地を正しくするため）。
  WorldMap.prototype.setCurrent = function (nodeId) {
    this.current = nodeId;
    this.visited[nodeId] = true;
  };

  // 訪問済みランドマーク間の最短歩数。ファストトラベルは操作を省くだけで、
  // 世界の時間は徒歩の最短経路と同じだけ進む（PLAN.md §8-4）。
  WorldMap.prototype.shortestTravelCost = function (fromId, toId) {
    var ids = this.data.nodes.map(function (n) { return n.id; });
    var dist = {}, used = {};
    ids.forEach(function (id) { dist[id] = Infinity; });
    dist[fromId] = 0;
    while (true) {
      var current = null;
      ids.forEach(function (id) {
        if (!used[id] && (current === null || dist[id] < dist[current])) current = id;
      });
      if (current === null || !isFinite(dist[current])) return Infinity;
      if (current === toId) return dist[current];
      used[current] = true;
      this.edgesFrom(current).forEach(function (edge) {
        var next = edge.from === current ? edge.to : edge.from;
        var candidate = dist[current] + (edge.steps || 10);
        if (candidate < dist[next]) dist[next] = candidate;
      });
    }
  };

  WorldMap.prototype.fastTravelCost = function (nodeId) {
    var cost = this.shortestTravelCost(this.current, nodeId);
    // ミラは常時同行なので、人間は最低2人（セオ＋ミラ）。鳥人が人間以上なら
    // 鳥人が全員を運べ、資料どおり移動時間を半減する。
    var party = this.game.party || [];
    var birds = party.filter(function (c) { return c.isBirdPerson; }).length;
    var humans = Math.max(2, party.filter(function (c) { return !c.isBirdPerson; }).length);
    return birds >= humans ? Math.ceil(cost / 2) : cost;
  };

  WorldMap.prototype.fastTravelTo = function (nodeId) {
    var self = this;
    var node = this.nodeById(nodeId);
    if (!node || !this.visited[nodeId] || node.fastTravel === false || nodeId === this.current) return;
    var cost = this.fastTravelCost(nodeId);
    if (!isFinite(cost)) return;
    var fromNodeId = this.current;
    this.game.steps += cost;
    this.current = nodeId;
    if (this.cb.onArrive) {
      this.cb.onArrive(nodeId, false, function () { self.render(); }, { from: fromNodeId, fastTravel: true, cost: cost });
      return;
    }
    this.render();
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

    var w = this.data.width || 400, h = this.data.height || 260;
    var svg = el("svg", { viewBox: "0 0 " + w + " " + h, class: "worldmap" });

    // ── 地形 ──
    svg.appendChild(el("rect", { x: 0, y: 0, width: w, height: h, fill: "#c2ad82" }));

    // 左右の森林帯
    svg.appendChild(el("path", {
      d: "M0 0 L150 0 Q130 35 148 70 Q118 105 130 145 Q104 178 116 220 L88 260 L0 260 Z",
      fill: "#8f9f6c", opacity: 0.9
    }));
    svg.appendChild(el("path", {
      d: "M400 0 L272 0 Q292 32 275 66 Q300 95 280 125 Q308 160 287 195 Q315 225 300 260 L400 260 Z",
      fill: "#819364", opacity: 0.9
    }));

    // 焼けた集落跡の灰地
    svg.appendChild(el("path", {
      d: "M28 22 Q70 5 112 24 Q132 46 110 78 Q76 94 42 78 Q18 58 28 22 Z",
      fill: "#a79a84", opacity: 0.82
    }));

    // 廃区画の岩場
    svg.appendChild(el("path", {
      d: "M105 175 Q130 145 168 150 Q205 133 238 151 Q262 170 250 202 Q220 222 185 211 Q150 230 120 214 Z",
      fill: "#8b7d68", stroke: "#685b49", "stroke-width": 2, opacity: 0.9
    }));

    // 地下水路
    var river = "M215 -10 Q190 35 212 75 Q232 112 205 148 Q183 188 210 225 Q222 245 214 270";
    svg.appendChild(el("path", { d: river, fill: "none", stroke: "#617982", "stroke-width": 17, opacity: 0.8 }));
    svg.appendChild(el("path", { d: river, fill: "none", stroke: "#9bb5ad", "stroke-width": 9, opacity: 0.9 }));

    // 森林の木
    function forest(cx, cy, rx, ry) {
      svg.appendChild(el("ellipse", { cx: cx, cy: cy, rx: rx, ry: ry, fill: "#71835c", opacity: 0.65 }));
      var trees = [[-0.7,-0.1],[-0.35,-0.45],[0,-0.2],[0.35,-0.48],[0.68,-0.1],[-0.5,0.32],[-0.1,0.45],[0.35,0.28],[0.62,0.45]];
      trees.forEach(function(p, i) {
        var x = cx + p[0] * rx, y = cy + p[1] * ry;
        svg.appendChild(el("polygon", {
          points: (x-5)+","+(y+5)+" "+x+","+(y-8-(i%2)*3)+" "+(x+5)+","+(y+5),
          fill: "#4f6247"
        }));
        svg.appendChild(el("rect", { x:x-1, y:y+4, width:2, height:5, fill:"#5b4b37" }));
      });
    }
    forest(65, 150, 48, 34);
    forest(345, 155, 42, 32);

    // 瓦礫
    [[22,112],[54,105],[118,118],[286,42],[322,88],[370,102],[275,218],[155,238],[248,235],[88,225]].forEach(function(p,i) {
      svg.appendChild(el("polygon", {
        points: (p[0]-5)+","+(p[1]+3)+" "+(p[0]-1)+","+(p[1]-5-(i%3)*2)+" "+(p[0]+5)+","+(p[1]-1)+" "+(p[0]+2)+","+(p[1]+5),
        fill: i%2 ? "#766b59" : "#685d4e", opacity: 0.8
      }));
    });

    // ── 道路 ──
    function roadPath(a, b, bend) {
      var mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      var dx = b.x-a.x, dy = b.y-a.y, len = Math.hypot(dx,dy) || 1;
      var nx = -dy/len, ny = dx/len;
      return "M"+a.x+" "+a.y+" Q"+(mx+nx*bend)+" "+(my+ny*bend)+" "+b.x+" "+b.y;
    }

    var neighborIds = this.edgesFrom(this.current).map(function(e) {
      return e.from === self.current ? e.to : e.from;
    });

    this.data.edges.forEach(function(edge,i) {
      var a = self.nodeById(edge.from), b = self.nodeById(edge.to);
      if (!a || !b) return;
      var d = roadPath(a,b,(i%2 ? -1 : 1) * (8+(i%3)*4));
      var danger = !!edge.encounterRate;

      svg.appendChild(el("path", {
        d:d, fill:"none", stroke:"#4e3d29", "stroke-width":10,
        "stroke-linecap":"round", "stroke-linejoin":"round", opacity:0.8
      }));
      svg.appendChild(el("path", {
        d:d, fill:"none", stroke:danger ? "#a3482d" : "#c49b62",
        "stroke-width":5, "stroke-linecap":"round",
        "stroke-linejoin":"round", "stroke-dasharray":danger ? "8 5" : "none"
      }));
    });

    // ── コンパス ──
    var compass = el("g", { transform:"translate("+(w-30)+",30)" });
    compass.appendChild(el("circle", {cx:0,cy:0,r:18,fill:"#d8c69d",stroke:"#514632","stroke-width":2}));
    compass.appendChild(el("polygon", {points:"0,-14 -4,4 0,1 4,4",fill:"#6b3328"}));
    var nt = el("text", {x:0,y:-19,"text-anchor":"middle",fill:"#3f3526","font-size":9,"font-weight":"bold"});
    nt.textContent = "N";
    compass.appendChild(nt);
    svg.appendChild(compass);

    // ── 地点 ──
    this.data.nodes.forEach(function(node) {
      var isCurrent = node.id === self.current;
      var isNeighbor = neighborIds.indexOf(node.id) >= 0;
      var g = el("g", {
        transform:"translate("+node.x+","+node.y+")",
        class:"map-node"
      });
      if (!isCurrent && !isNeighbor) g.setAttribute("opacity","0.7");

      g.appendChild(el("circle", {cx:0,cy:0,r:13,fill:"#d8c69d",stroke:"#514632","stroke-width":2}));
      drawNodeIcon(g,node.kind);

      if (isCurrent) {
        g.appendChild(el("circle", {cx:0,cy:0,r:17,fill:"none",stroke:"#315f91","stroke-width":3}));
        var hitSelf = el("circle", {cx:0,cy:0,r:18,fill:"transparent",class:"map-node clickable"});
        hitSelf.onclick = function(){ self.reenter(); };
        g.appendChild(hitSelf);
      }
      if (isNeighbor) {
        g.appendChild(el("circle", {cx:0,cy:0,r:16,fill:"none",stroke:"#8a6334","stroke-width":2,"stroke-dasharray":"3 2"}));
        var hit = el("circle", {cx:0,cy:0,r:18,fill:"transparent",class:"map-node clickable"});
        hit.onclick = function(){ self.travelTo(node.id); };
        g.appendChild(hit);
      }

      var labelBg = el("rect", {x:-40,y:16,width:80,height:15,rx:4,fill:"#3e3528",opacity:0.82});
      g.appendChild(labelBg);
      var label = el("text", {
        x:0,y:27,"text-anchor":"middle",fill:"#f0e4c7",
        "font-size":9.5,"font-weight":isCurrent ? "bold" : "normal"
      });
      label.textContent = node.name;
      g.appendChild(label);
      svg.appendChild(g);
    });

    // ── 凡例 ──
    var legend = el("g", {transform:"translate(12,"+(h-25)+")"});
    legend.appendChild(el("rect",{x:0,y:-13,width:215,height:20,rx:5,fill:"#3e3528",opacity:0.82}));
    var lt = el("text",{x:8,y:1,fill:"#eadfca","font-size":9});
    lt.textContent = "実線: 通常道　 破線: 危険な道　 青枠: 現在地";
    legend.appendChild(lt);
    svg.appendChild(legend);

    wrap.appendChild(svg);

    // すでに訪れたランドマークだけを移動先にする。通常の隣接移動と並べて
    // 表示することで、「未知の場所へ飛ぶ」ことや経路を無視した徒歩移動と
    // 混同させない。
    var destinations = this.data.nodes.filter(function (node) {
      return node.id !== self.current && self.visited[node.id] && node.fastTravel !== false;
    });
    if (destinations.length) {
      var fastTravel = document.createElement("div");
      fastTravel.className = "fast-travel-controls";
      var heading = document.createElement("p");
      heading.className = "prompt";
      heading.textContent = "ファストトラベル（最短経路と同じ歩数を消費）";
      fastTravel.appendChild(heading);
      destinations.forEach(function (node) {
        var cost = self.fastTravelCost(node.id);
        fastTravel.appendChild(ctrlBtn(node.name + "へ（" + cost + "歩）", function () { self.fastTravelTo(node.id); }));
      });
      wrap.appendChild(fastTravel);
    }
    this.el.appendChild(wrap);
  };

  function startWorldMap(containerEl, data, gameState, callbacks) {
    var m = new WorldMap(containerEl, data, gameState, callbacks);
    m.render();
    return m;
  }

  // ── ノード内部の自由移動エリア（ドット絵のタイルマップ） ──
  // 地形は16×16ドットのタイルを敷き詰めて作り、描画も当たり判定もこの
  // タイルに従う。見た目だけ道を描いて実際はどこでも歩ける、という
  // ことはなく、建物・瓦礫・水路・（上層なら）足場の外は踏み込めない。
  // 位置そのものは連続座標(x,y)で持つので、マス目に吸着はしない。
  var TILE = 16;

  // タイルの種類。WALKABLEに含まれるものだけが歩ける。
  var TT = {
    void: 0, road: 1, plaza: 2, lot: 3, bldg: 4, rubble: 5, water: 6,
    walk: 7, deck: 8, grass: 9, dirt: 10, hut: 11, fence: 12, well: 13, tree: 14,
  };
  var WALKABLE = {};
  [TT.road, TT.plaza, TT.lot, TT.walk, TT.deck, TT.grass, TT.dirt].forEach(function (t) { WALKABLE[t] = true; });

  // 毎回描き直すたびに模様が変わると落ち着かないので、タイル座標から
  // 決まる疑似乱数で模様・ひび・小石の位置を決める。
  function seededRandom(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s || 0, 982451653)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  // 地形の設計図（塗りつぶし・矩形・円・太線・散らし）からタイル配列を作る。
  // 座標はタイル単位。protectに渡した地点（入口・ゾーン）の近くには
  // 散らした瓦礫を置かない（出入口や宝箱が埋まって辿り着けなくならないように）。
  function buildTileGrid(spec, protect) {
    var cols = spec.cols, rows = spec.rows;
    var g = new Uint8Array(cols * rows);
    var objects = [];
    var rng = seededRandom(spec.seed || 1);
    function set(x, y, t) { if (x >= 0 && y >= 0 && x < cols && y < rows) g[y * cols + x] = t; }
    function get(x, y) { return (x >= 0 && y >= 0 && x < cols && y < rows) ? g[y * cols + x] : -1; }
    function nearProtected(x, y, d) {
      for (var i = 0; i < protect.length; i++) if (Math.hypot(x + 0.5 - protect[i].x, y + 0.5 - protect[i].y) < d) return true;
      return false;
    }
    spec.ops.forEach(function (op) {
      var t = TT[op.t];
      var x, y;
      if (op.op === "fill") { g.fill(t); return; }
      if (op.op === "rect") {
        for (y = op.y; y < op.y + op.h; y++) for (x = op.x; x < op.x + op.w; x++) set(x, y, t);
        return;
      }
      if (op.op === "disc") {
        for (y = Math.floor(op.y - op.r - 1); y <= op.y + op.r + 1; y++)
          for (x = Math.floor(op.x - op.r - 1); x <= op.x + op.r + 1; x++)
            if (Math.hypot(x + 0.5 - op.x, y + 0.5 - op.y) <= op.r) set(x, y, t);
        return;
      }
      if (op.op === "line") {
        var hw = op.w / 2;
        for (var i = 0; i < op.pts.length - 1; i++) {
          var a = op.pts[i], b = op.pts[i + 1];
          for (y = Math.floor(Math.min(a[1], b[1]) - hw - 1); y <= Math.max(a[1], b[1]) + hw + 1; y++)
            for (x = Math.floor(Math.min(a[0], b[0]) - hw - 1); x <= Math.max(a[0], b[0]) + hw + 1; x++)
              if (distToSeg(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]) <= hw) set(x, y, t);
        }
        return;
      }
      if (op.op === "scatter") {
        var on = (op.on || []).map(function (n) { return TT[n]; });
        for (var k = 0; k < op.count; k++) {
          x = Math.floor(rng() * cols); y = Math.floor(rng() * rows);
          if (on.indexOf(get(x, y)) < 0) continue;
          if (nearProtected(x, y, op.keep || 3)) continue;
          set(x, y, t);
        }
        return;
      }
      // 小屋：屋根と正面の壁を持つ建物。扉は正面の中央に付く
      if (op.op === "hut") {
        for (y = op.y; y < op.y + op.h; y++) for (x = op.x; x < op.x + op.w; x++) set(x, y, TT.hut);
        objects.push({ kind: "door", x: op.x + Math.floor(op.w / 2), y: op.y + op.h - 1 });
        return;
      }
      if (op.op === "well") {
        set(op.x, op.y, TT.well); set(op.x + 1, op.y, TT.well); set(op.x, op.y + 1, TT.well); set(op.x + 1, op.y + 1, TT.well);
        objects.push({ kind: "well", x: op.x, y: op.y });
        return;
      }
      if (op.op === "tree") {
        set(op.x, op.y, TT.tree);
        objects.push({ kind: "tree", x: op.x, y: op.y });
      }
    });
    return { cols: cols, rows: rows, g: g, objects: objects, get: get };
  }

  // ── ドット描画の下請け ──
  function px(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w || 1, h || 1); }

  // 文字列で書いたドット絵を描く（'.'は透明、それ以外はパレットの色）
  function drawPixels(ctx, rows, pal, ox, oy, flip) {
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var c = pal[r[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + (flip ? r.length - 1 - x : x), oy + y, 1, 1);
      }
    }
  }
  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return c;
  }
  function spriteCanvas(rows, pal, flip) {
    var w = 0;
    rows.forEach(function (r) { w = Math.max(w, r.length); });
    var c = makeCanvas(w, rows.length);
    drawPixels(c.getContext("2d"), rows, pal, 0, 0, flip);
    return c;
  }

  // 建物の屋根色（区画ごとに違う建物に見えるよう、何棟分かの色を使い回す）
  var ROOF_COLORS = [["#3a342c", "#2e2922", "#4a4338"], ["#34302b", "#29251f", "#453f36"], ["#3d3530", "#2f2823", "#4e443c"], ["#333530", "#282a25", "#43463f"]];

  function isWalk(grid, x, y) { return WALKABLE[grid.get(x, y)] === true; }

  function drawGroundRoad(ctx, ox, oy, x, y, grid) {
    px(ctx, "#4a443a", ox, oy, TILE, TILE);
    for (var i = 0; i < 7; i++) {
      var h = hash2(x * 7 + i, y * 3 + i, 11);
      px(ctx, h < 0.5 ? "#433d34" : "#534c41", ox + Math.floor(hash2(x, y, i) * 16), oy + Math.floor(hash2(y, x, i + 5) * 16), 1, 1);
    }
    var r = hash2(x, y, 3);
    if (r < 0.07) {
      // ひび割れ
      var cx = ox + 3 + Math.floor(hash2(x, y, 4) * 8), cy = oy + 3 + Math.floor(hash2(x, y, 5) * 6);
      for (var k = 0; k < 7; k++) { px(ctx, "#2c2822", cx, cy); cx += 1; cy += (hash2(x + k, y, 6) < 0.5) ? 1 : 0; }
    } else if (r < 0.12) {
      // 小石
      var sx = ox + 2 + Math.floor(hash2(x, y, 8) * 11), sy = oy + 2 + Math.floor(hash2(x, y, 9) * 11);
      px(ctx, "#6a6150", sx, sy, 2, 2); px(ctx, "#2c2822", sx, sy + 2, 2, 1);
    }
  }
  function drawGroundPlaza(ctx, ox, oy, x, y) {
    px(ctx, "#5a5244", ox, oy, TILE, TILE);
    for (var row = 0; row < 2; row++) {
      var off = ((y + row) % 2) * 4;
      px(ctx, "#463f34", ox, oy + row * 8, TILE, 1);
      px(ctx, "#463f34", ox + off, oy + row * 8, 1, 8);
      px(ctx, "#463f34", ox + off + 8, oy + row * 8, 1, 8);
      px(ctx, "#655c4c", ox + off + 1, oy + row * 8 + 1, 6, 1);
    }
    if (hash2(x, y, 21) < 0.1) px(ctx, "#2e2922", ox + 9, oy + 1, 7, 7);
  }
  function drawGroundLot(ctx, ox, oy, x, y) {
    px(ctx, "#3b352c", ox, oy, TILE, TILE);
    for (var i = 0; i < 10; i++) {
      var c = hash2(x, y, i + 30) < 0.5 ? "#2e2922" : "#4c4538";
      px(ctx, c, ox + Math.floor(hash2(x, y, i + 40) * 15), oy + Math.floor(hash2(x, y, i + 50) * 15), hash2(x, y, i) < 0.3 ? 2 : 1, 1);
    }
  }
  function drawGroundGrass(ctx, ox, oy, x, y) {
    px(ctx, "#3a3a26", ox, oy, TILE, TILE);
    for (var i = 0; i < 6; i++) {
      var gx = ox + Math.floor(hash2(x, y, i + 60) * 14), gy = oy + 2 + Math.floor(hash2(x, y, i + 70) * 12);
      px(ctx, "#4f4e30", gx, gy, 1, 2); px(ctx, "#4f4e30", gx + 1, gy - 1, 1, 2);
      px(ctx, "#2c2c1c", ox + Math.floor(hash2(x, y, i + 80) * 16), oy + Math.floor(hash2(x, y, i + 90) * 16));
    }
  }
  function drawGroundDirt(ctx, ox, oy, x, y, grid) {
    px(ctx, "#5a4a34", ox, oy, TILE, TILE);
    for (var i = 0; i < 8; i++) {
      px(ctx, hash2(x, y, i + 100) < 0.5 ? "#4a3c2a" : "#6a5840", ox + Math.floor(hash2(x, y, i + 110) * 16), oy + Math.floor(hash2(x, y, i + 120) * 16));
    }
    // 草地との境目は、まっすぐな線にせず草をはみ出させる
    var nb = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    nb.forEach(function (d, j) {
      if (grid.get(x + d[0], y + d[1]) !== TT.grass) return;
      for (var k = 0; k < 16; k += 2) {
        var depth = 1 + Math.floor(hash2(x * 3 + k, y * 5 + j, 130) * 3);
        if (d[1] === -1) px(ctx, "#3a3a26", ox + k, oy, 2, depth);
        if (d[1] === 1) px(ctx, "#3a3a26", ox + k, oy + 16 - depth, 2, depth);
        if (d[0] === -1) px(ctx, "#3a3a26", ox, oy + k, depth, 2);
        if (d[0] === 1) px(ctx, "#3a3a26", ox + 16 - depth, oy + k, depth, 2);
      }
    });
  }

  // 壁際の足元に落ちる影（建物・柵などの固いものに接している側）
  function drawContactShadow(ctx, ox, oy, x, y, grid) {
    if (!isWalk(grid, x, y - 1) && grid.get(x, y - 1) !== TT.void && grid.get(x, y - 1) !== -1) px(ctx, "rgba(0,0,0,0.35)", ox, oy, TILE, 3);
    if (!isWalk(grid, x - 1, y) && grid.get(x - 1, y) !== TT.void && grid.get(x - 1, y) !== -1) px(ctx, "rgba(0,0,0,0.25)", ox, oy, 2, TILE);
  }

  function drawBuilding(ctx, ox, oy, x, y, grid) {
    var bx = Math.floor(x / 7), by = Math.floor(y / 6);
    var pal = ROOF_COLORS[Math.floor(hash2(bx, by, 200) * ROOF_COLORS.length)];
    var belowWalk = isWalk(grid, x, y + 1) || grid.get(x, y + 1) === TT.water;
    var below2Walk = !belowWalk && (isWalk(grid, x, y + 2) || grid.get(x, y + 2) === TT.water) && grid.get(x, y + 1) === grid.get(x, y);
    if (belowWalk || below2Walk) {
      // 正面の壁（窓の並ぶ面）。下が道なら1段目、2つ下が道なら2段目
      px(ctx, "#4a4238", ox, oy, TILE, TILE);
      px(ctx, "#3e372e", ox, oy + (belowWalk ? 0 : 15), TILE, 1);
      [3, 10].forEach(function (wx, i) {
        var broken = hash2(x, y, 210 + i) < 0.3;
        px(ctx, "#15120f", ox + wx, oy + 4, 4, 6);
        if (broken) px(ctx, "#6a7a80", ox + wx + 1, oy + 5, 1, 1);
        else px(ctx, "#2a2a2c", ox + wx, oy + 4, 4, 1);
        px(ctx, "#5a5246", ox + wx - 1, oy + 10, 6, 1);
      });
      if (belowWalk) px(ctx, "#2e2922", ox, oy + 13, TILE, 3);
      if (!isBldgLike(grid, x - 1, y)) px(ctx, "#241f19", ox, oy, 1, TILE);
      if (!isBldgLike(grid, x + 1, y)) px(ctx, "#241f19", ox + 15, oy, 1, TILE);
      if (hash2(x, y, 220) < 0.12) { px(ctx, "#2a241d", ox + 5, oy + 1, 1, 12); px(ctx, "#2a241d", ox + 6, oy + 6, 1, 7); }
      return;
    }
    // 屋根（上から見下ろした屋上）
    px(ctx, pal[0], ox, oy, TILE, TILE);
    for (var i = 0; i < 5; i++) px(ctx, pal[1], ox + Math.floor(hash2(x, y, i + 230) * 16), oy + Math.floor(hash2(x, y, i + 240) * 16), 2, 1);
    if (x % 7 === 0) px(ctx, "#1c1814", ox, oy, 1, TILE);
    if (y % 6 === 0) px(ctx, "#1c1814", ox, oy, TILE, 1);
    if (isWalk(grid, x, y - 1)) px(ctx, pal[2], ox, oy, TILE, 2);
    if (isWalk(grid, x - 1, y)) px(ctx, "#1c1814", ox, oy, 2, TILE);
    if (isWalk(grid, x + 1, y)) px(ctx, "#1c1814", ox + 14, oy, 2, TILE);
    var d = hash2(x, y, 250);
    if (d < 0.06) { px(ctx, "#0e0c0a", ox + 4, oy + 5, 7, 5); px(ctx, "#1c1814", ox + 5, oy + 10, 5, 1); }
    else if (d < 0.14) { px(ctx, pal[1], ox + 5, oy + 5, 5, 5); px(ctx, pal[2], ox + 5, oy + 5, 5, 1); }
  }
  function isBldgLike(grid, x, y) { var t = grid.get(x, y); return t === TT.bldg || t === -1; }

  // 瓦礫の山。隣も瓦礫ならそちらへ切れ目なく続け、瓦礫でない側だけ
  // 縁をガタガタに欠けさせる（ひとつずつ置いた判子に見えないように）。
  var RUBBLE_SHADES = ["#5e5244", "#6e6050", "#4e443a", "#7a6c5a", "#564b3f"];
  function drawRubble(ctx, ox, oy, x, y, grid, base) {
    if (base === "grass") drawGroundGrass(ctx, ox, oy, x, y); else drawGroundRoad(ctx, ox, oy, x, y, grid);
    var R = TT.rubble;
    var up = grid.get(x, y - 1) === R, dn = grid.get(x, y + 1) === R, lf = grid.get(x - 1, y) === R, rt = grid.get(x + 1, y) === R;
    for (var py = 0; py < 16; py++) for (var pxx = 0; pxx < 16; pxx++) {
      var gx = x * 16 + pxx, gy = y * 16 + py;
      var iT = up ? -9 : 1 + Math.floor(hash2(gx >> 1, y, 310) * 4);
      var iB = dn ? -9 : 1 + Math.floor(hash2(gx >> 1, y, 311) * 3);
      var iL = lf ? -9 : 1 + Math.floor(hash2(x, gy >> 1, 312) * 4);
      var iR = rt ? -9 : 1 + Math.floor(hash2(x, gy >> 1, 313) * 4);
      var dT = py - iT, dB = 15 - iB - py, dL = pxx - iL, dR = 15 - iR - pxx;
      var d = Math.min(dT, dB, dL, dR);
      if (d < 0) continue;
      var row = Math.floor(gy / 3);
      var bx = Math.floor((gx + (row % 2) * 2) / 4);
      var c = RUBBLE_SHADES[Math.floor(hash2(bx, row, 320) * RUBBLE_SHADES.length)];
      if ((gx + (row % 2) * 2) % 4 === 0 || gy % 3 === 0) c = "#2e2820";
      else if ((gx + (row % 2) * 2) % 4 === 1 && gy % 3 === 1) c = "#8a7c68";
      if (d === 0) c = dB === 0 ? "#1a1612" : "#241f19";
      px(ctx, c, ox + pxx, oy + py);
    }
    // 突き出た鉄骨
    if (hash2(x, y, 303) < 0.18) { px(ctx, "#6a4a38", ox + 4, oy + 1, 1, 7); px(ctx, "#8a5a40", ox + 5, oy + 1, 1, 2); px(ctx, "#6a4a38", ox + 9, oy + 3, 5, 1); }
  }

  // 建物に接する道の端は歩道（敷石と縁石）にして、街路の輪郭を見せる
  function isSidewalk(grid, x, y) {
    if (grid.get(x, y) !== TT.road) return false;
    return [[0, -1], [0, 1], [-1, 0], [1, 0]].some(function (d) { return grid.get(x + d[0], y + d[1]) === TT.bldg; });
  }
  function drawSidewalk(ctx, ox, oy, x, y, grid) {
    px(ctx, "#5c5548", ox, oy, TILE, TILE);
    px(ctx, "#4a443a", ox, oy + 7, TILE, 1); px(ctx, "#4a443a", ox + (y % 2) * 8, oy, 1, 7); px(ctx, "#4a443a", ox + 8 - (y % 2) * 8, oy + 8, 1, 8);
    if (hash2(x, y, 330) < 0.15) px(ctx, "#3a352c", ox + 1 + Math.floor(hash2(x, y, 331) * 7), oy + 9, 6, 6);
    [[0, -1, 0, 0, 16, 2], [0, 1, 0, 14, 16, 2], [-1, 0, 0, 0, 2, 16], [1, 0, 14, 0, 2, 16]].forEach(function (e) {
      var t = grid.get(x + e[0], y + e[1]);
      if (t === TT.road && !isSidewalk(grid, x + e[0], y + e[1])) { px(ctx, "#77705e", ox + e[2], oy + e[3], e[4], e[5]); }
    });
  }

  function drawWater(ctx, ox, oy, x, y, grid) {
    px(ctx, "#1c2a2e", ox, oy, TILE, TILE);
    for (var r = 0; r < 4; r++) {
      var wy = oy + 2 + r * 4, wx = ox + ((x * 5 + r * 7 + y * 3) % 12);
      px(ctx, "#2e4a50", wx, wy, 4, 1);
    }
    if (grid.get(x, y - 1) !== TT.water) { px(ctx, "#6a6150", ox, oy, TILE, 2); px(ctx, "#15120f", ox, oy + 2, TILE, 1); }
  }

  // 上層の足場（高架歩道）。足場の外側には手すりを付け、そこが縁だと分かるようにする
  function drawWalkway(ctx, ox, oy, x, y, grid, deck) {
    if (deck) {
      px(ctx, "#6e6a5e", ox, oy, TILE, TILE);
      px(ctx, "#5a574c", ox, oy + 7, TILE, 1); px(ctx, "#5a574c", ox + 7, oy, 1, TILE);
      [[2, 2], [12, 2], [2, 12], [12, 12]].forEach(function (p) { px(ctx, "#8e8a7a", ox + p[0], oy + p[1]); });
    } else {
      px(ctx, "#7d7060", ox, oy, TILE, TILE);
      for (var i = 0; i < 4; i++) px(ctx, "#6a5e50", ox, oy + i * 4 + 3, TILE, 1);
      for (var j = 0; j < 5; j++) px(ctx, hash2(x, y, j + 400) < 0.5 ? "#8c7f6c" : "#665a4c", ox + Math.floor(hash2(x, y, j + 410) * 16), oy + Math.floor(hash2(x, y, j + 420) * 16));
      if (hash2(x, y, 430) < 0.08) { px(ctx, "#4a4034", ox + 4, oy + 6, 6, 1); px(ctx, "#4a4034", ox + 9, oy + 7, 3, 1); }
    }
    var edge = function (dx, dy) { return grid.get(x + dx, y + dy) === TT.void || grid.get(x + dx, y + dy) === -1; };
    if (edge(0, -1)) { px(ctx, "#3a3128", ox, oy, TILE, 2); for (var a = 0; a < 16; a += 4) px(ctx, "#b09a70", ox + a, oy, 1, 2); px(ctx, "#b09a70", ox, oy, TILE, 1); }
    if (edge(0, 1)) { px(ctx, "#3a3128", ox, oy + 13, TILE, 3); px(ctx, "#b09a70", ox, oy + 13, TILE, 1); for (var b = 0; b < 16; b += 4) px(ctx, "#b09a70", ox + b, oy + 13, 1, 3); }
    if (edge(-1, 0)) { px(ctx, "#3a3128", ox, oy, 2, TILE); px(ctx, "#b09a70", ox, oy, 1, TILE); }
    if (edge(1, 0)) { px(ctx, "#3a3128", ox + 14, oy, 2, TILE); px(ctx, "#b09a70", ox + 15, oy, 1, TILE); }
  }

  function drawHut(ctx, ox, oy, x, y, grid) {
    var belowOpen = grid.get(x, y + 1) !== TT.hut;
    var below2Open = !belowOpen && grid.get(x, y + 2) !== TT.hut;
    if (belowOpen || below2Open) {
      // 木の板壁
      px(ctx, "#6a5236", ox, oy, TILE, TILE);
      for (var i = 0; i < 16; i += 4) px(ctx, "#4a3824", ox + i, oy, 1, TILE);
      px(ctx, "#7a6242", ox, oy + (belowOpen ? 0 : 8), TILE, 1);
      if (belowOpen) px(ctx, "#3a2c1c", ox, oy + 14, TILE, 2);
      if (below2Open) { px(ctx, "#15120f", ox + 5, oy + 5, 6, 5); px(ctx, "#8a6a40", ox + 5, oy + 10, 6, 1); }
      if (grid.get(x - 1, y) !== TT.hut) px(ctx, "#2a2014", ox, oy, 1, TILE);
      if (grid.get(x + 1, y) !== TT.hut) px(ctx, "#2a2014", ox + 15, oy, 1, TILE);
      return;
    }
    // 藁葺き屋根
    px(ctx, "#7a6038", ox, oy, TILE, TILE);
    for (var k = -16; k < 16; k += 4) for (var t = 0; t < 16; t++) { var xx = k + t; if (xx >= 0 && xx < 16) px(ctx, "#5a4428", ox + xx, oy + t); }
    px(ctx, "#8e7448", ox, oy + 2 + Math.floor(hash2(x, y, 500) * 4), TILE, 1);
    if (grid.get(x, y - 1) !== TT.hut) px(ctx, "#a08450", ox, oy, TILE, 2);
    if (grid.get(x - 1, y) !== TT.hut) px(ctx, "#3a2c1c", ox, oy, 2, TILE);
    if (grid.get(x + 1, y) !== TT.hut) px(ctx, "#3a2c1c", ox + 14, oy, 2, TILE);
  }

  function drawFence(ctx, ox, oy, x, y, grid) {
    drawGroundGrass(ctx, ox, oy, x, y);
    var vert = grid.get(x, y - 1) === TT.fence || grid.get(x, y + 1) === TT.fence;
    var horiz = grid.get(x - 1, y) === TT.fence || grid.get(x + 1, y) === TT.fence;
    if (horiz || !vert) {
      px(ctx, "#4a3824", ox, oy + 6, TILE, 2); px(ctx, "#4a3824", ox, oy + 11, TILE, 2);
      [1, 7, 13].forEach(function (sx) { px(ctx, "#6a5236", ox + sx, oy + 2, 2, 13); px(ctx, "#2a2014", ox + sx, oy + 15, 2, 1); px(ctx, "#8a6a40", ox + sx, oy + 2, 2, 1); });
    }
    if (vert) {
      px(ctx, "#4a3824", ox + 6, oy, 2, TILE); px(ctx, "#4a3824", ox + 10, oy, 2, TILE);
      [2, 10].forEach(function (sy) { px(ctx, "#6a5236", ox + 7, oy + sy, 4, 4); px(ctx, "#8a6a40", ox + 7, oy + sy, 4, 1); });
    }
  }

  function drawTileAt(ctx, grid, x, y, spec) {
    var t = grid.get(x, y);
    var ox = x * TILE, oy = y * TILE;
    switch (t) {
      case TT.road:
        if (isSidewalk(grid, x, y)) drawSidewalk(ctx, ox, oy, x, y, grid); else drawGroundRoad(ctx, ox, oy, x, y, grid);
        drawContactShadow(ctx, ox, oy, x, y, grid); break;
      case TT.plaza: drawGroundPlaza(ctx, ox, oy, x, y); drawContactShadow(ctx, ox, oy, x, y, grid); break;
      case TT.lot: drawGroundLot(ctx, ox, oy, x, y); drawContactShadow(ctx, ox, oy, x, y, grid); break;
      case TT.grass: drawGroundGrass(ctx, ox, oy, x, y); drawContactShadow(ctx, ox, oy, x, y, grid); break;
      case TT.dirt: drawGroundDirt(ctx, ox, oy, x, y, grid); drawContactShadow(ctx, ox, oy, x, y, grid); break;
      case TT.bldg: drawBuilding(ctx, ox, oy, x, y, grid); break;
      case TT.rubble: drawRubble(ctx, ox, oy, x, y, grid, spec.rubbleBase); break;
      case TT.water: drawWater(ctx, ox, oy, x, y, grid); break;
      case TT.walk: drawWalkway(ctx, ox, oy, x, y, grid, false); break;
      case TT.deck: drawWalkway(ctx, ox, oy, x, y, grid, true); break;
      case TT.hut: drawHut(ctx, ox, oy, x, y, grid); break;
      case TT.fence: drawFence(ctx, ox, oy, x, y, grid); break;
      case TT.well: case TT.tree: drawGroundGrass(ctx, ox, oy, x, y); break;
      default: break; // void：何も描かない（下の層が透けて見える）
    }
  }

  function drawMapObject(ctx, o) {
    var ox = o.x * TILE, oy = o.y * TILE;
    if (o.kind === "door") {
      px(ctx, "#2a2014", ox + 4, oy + 3, 8, 13);
      px(ctx, "#4a3420", ox + 5, oy + 4, 6, 12);
      px(ctx, "#c8a060", ox + 9, oy + 10, 1, 1);
    } else if (o.kind === "well") {
      px(ctx, "rgba(0,0,0,0.35)", ox + 2, oy + 26, 30, 5);
      px(ctx, "#5a564c", ox + 3, oy + 8, 26, 20);
      px(ctx, "#101418", ox + 7, oy + 11, 18, 11);
      px(ctx, "#2a3a44", ox + 9, oy + 16, 8, 1);
      for (var i = 0; i < 26; i += 5) { px(ctx, "#7a7466", ox + 3 + i, oy + 8, 4, 2); px(ctx, "#3a3730", ox + 3 + i, oy + 24, 4, 1); }
      px(ctx, "#4a3824", ox + 3, oy - 4, 2, 14); px(ctx, "#4a3824", ox + 27, oy - 4, 2, 14);
      px(ctx, "#6a5236", ox + 1, oy - 6, 30, 3);
      px(ctx, "#8a8a80", ox + 15, oy - 3, 1, 9);
      px(ctx, "#6a5236", ox + 13, oy + 5, 5, 4);
    } else if (o.kind === "tree") {
      px(ctx, "rgba(0,0,0,0.35)", ox + 2, oy + 12, 12, 4);
      px(ctx, "#3a2c1c", ox + 6, oy - 8, 4, 22);
      px(ctx, "#4a3824", ox + 7, oy - 8, 1, 22);
      [[0, -12, 7, 1], [-1, -13, 2, 2], [9, -10, 6, 1], [13, -12, 2, 2], [4, -18, 2, 8], [9, -20, 2, 10], [2, -5, 5, 1], [10, -3, 4, 1]].forEach(function (b) {
        px(ctx, "#3a2c1c", ox + b[0], oy + b[1], b[2], b[3]);
      });
    }
  }

  // 上の層に描き込む、下の層の街並み（暗く沈め、足場の影と支柱を落とす）
  function paintUnderlay(ctx, lowerCanvas, grid, w, h) {
    ctx.drawImage(lowerCanvas, 0, 0);
    ctx.fillStyle = "rgba(6,8,12,0.62)";
    ctx.fillRect(0, 0, w, h);
    // 下の層は網目状に暗くして、手前の足場とは別の高さにあると見せる
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (var y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
    var shadow = makeCanvas(w, h), sctx = shadow.getContext("2d");
    sctx.fillStyle = "#000";
    for (var ty = 0; ty < grid.rows; ty++) for (var tx = 0; tx < grid.cols; tx++) {
      if (WALKABLE[grid.get(tx, ty)]) sctx.fillRect(tx * TILE + 10, ty * TILE + 18, TILE, TILE);
    }
    ctx.globalAlpha = 0.5;
    ctx.drawImage(shadow, 0, 0);
    ctx.globalAlpha = 1;
    // 足場を支える柱（足場の下端から、下の層へ向かって伸びる）
    for (var py = 0; py < grid.rows; py++) for (var pxx = 0; pxx < grid.cols; pxx++) {
      if (!WALKABLE[grid.get(pxx, py)] || WALKABLE[grid.get(pxx, py + 1)]) continue;
      if ((pxx + py) % 5 !== 0) continue;
      px(ctx, "#2c2822", pxx * TILE + 5, py * TILE + 16, 6, 26);
      px(ctx, "#3e382e", pxx * TILE + 5, py * TILE + 16, 2, 26);
    }
  }

  // 地形の描画は重いので、エリアの設計図ごとに1回だけ作って使い回す
  // （階段で層を行き来したり、ノードに入り直したりしても作り直さない）。
  function getTileBundle(data) {
    var spec = data.tilemap;
    if (spec._bundle) return spec._bundle;
    // 入口・ゾーンの位置は、どの入口から入ってきたかに関わらず同じ地形に
    // なるよう、エリアの定義そのものから集める
    var protect = (data.zones || []).concat([data.start]).concat(Object.keys(data.entryPoints || {}).map(function (k) { return data.entryPoints[k]; }))
      .map(function (p) { var q = toPx(p); return { x: q.x / TILE, y: q.y / TILE }; });
    var grid = buildTileGrid(spec, protect);
    var w = grid.cols * TILE, h = grid.rows * TILE;
    var canvas = makeCanvas(w, h);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, w, h);
    if (data.underlay) {
      var lower = getTileBundle(data.underlay);
      paintUnderlay(ctx, lower.canvas, grid, w, h);
    }
    for (var y = 0; y < grid.rows; y++) for (var x = 0; x < grid.cols; x++) drawTileAt(ctx, grid, x, y, spec);
    grid.objects.forEach(function (o) { drawMapObject(ctx, o); });
    spec._bundle = { grid: grid, canvas: canvas, w: w, h: h };
    return spec._bundle;
  }

  // ── キャラクターと目印のドット絵 ──
  var HERO_PAL = { k: "#1a1410", h: "#4a3222", s: "#e0b890", e: "#1a1410", b: "#3a6bab", B: "#28508a", w: "#8a6a30", p: "#2c2a36", f: "#3a2c1c" };
  var HERO_BODY = [
    "..kbbbbbbk..",
    ".kbbbbbbbbk.",
    ".kbBbbbbBbk.",
    ".ksbwwwwbsk.",
    "..kbbbbbbk..",
    "..kppkkppk..",
  ];
  var HERO_LEGS = {
    idle: ["..kpk..kpk..", "..kfk..kfk..", "..kkk..kkk.."],
    a: ["..kpk..kfk..", "..kfk..kkk..", "..kkk......."],
    b: ["..kfk..kpk..", "..kkk..kfk..", ".......kkk.."],
  };
  var HERO_HEAD = {
    down: ["....kkkk....", "...khhhhk...", "..khhhhhhk..", "..khsssshk..", "..ksessesk..", "..kssssssk..", "...kssssk..."],
    up: ["....kkkk....", "...khhhhk...", "..khhhhhhk..", "..khhhhhhk..", "..khhhhhhk..", "..khhhhhhk..", "...kssssk..."],
    side: ["....kkkk....", "...khhhhk...", "..khhhhhhk..", "..khhhhssk..", "..khhhsesk..", "..khhssssk..", "...kssssk..."],
  };
  var SIDE_BODY = ["...kbbbbk...", "..kbbbbbbk..", "..kbBbbbbk..", "..kbwwsbwk..", "...kbbbbk...", "...kppppk..."];
  var SIDE_LEGS = {
    idle: ["...kppk.....", "...kffk.....", "...kkkk....."],
    a: ["..kpk.kpk...", ".kfk...kfk..", ".kk.....kk.."],
    b: ["...kppk.....", "...kffk.....", "...kkkk....."],
  };
  var heroSprites = null;
  function getHeroSprites() {
    if (heroSprites) return heroSprites;
    heroSprites = {};
    ["down", "up", "left", "right"].forEach(function (dir) {
      heroSprites[dir] = {};
      ["idle", "a", "b"].forEach(function (fr) {
        var side = dir === "left" || dir === "right";
        var rows = (side ? HERO_HEAD.side : HERO_HEAD[dir]).concat(side ? SIDE_BODY : HERO_BODY).concat(side ? SIDE_LEGS[fr] : HERO_LEGS[fr]);
        heroSprites[dir][fr] = spriteCanvas(rows, HERO_PAL, dir === "left");
      });
    });
    return heroSprites;
  }

  var ELDER_PAL = { k: "#1a1410", w: "#b8b0a0", s: "#d8b088", e: "#1a1410", o: "#6a5236", O: "#4a3824", t: "#8a6a40" };
  var ELDER = [
    "....kkkk....", "...kwwwwk...", "..kwwwwwwk..", "..kwsssswkt.", "..ksesseskt.", "..kswwwwskt.",
    "...kwwwwk.t.", "..kookkook.t", ".koooooooskt", ".kooOooOook.", ".kooOooOoot.", ".kooOooOoot.",
    ".koooooooot.", ".kOOOOOOOOt.", ".kkkkkkkkkt.", "..........t.",
  ];
  var CHEST_PAL = { k: "#1a1410", y: "#a8823c", Y: "#8a6a30", m: "#7a5a28", M: "#5a4020", g: "#e0c060" };
  var CHEST = [".kkkkkkkkkkkk.", "kyyyyyyyyyyyyk", "kyYyyyyyyyyYyk", "kkkkkkggkkkkkk", "kmmmmmggmmmmmk", "kmmmmmkkmmmmmk", "kmMmmmmmmmmMmk", "kmMmmmmmmmmMmk", "kMMMMMMMMMMMMk", ".kkkkkkkkkkkk."];
  var SIGN_PAL = { k: "#1a1410", b: "#8a6a40", B: "#6a5236", a: "#e8dcc8", p: "#4a3824" };
  var SIGN_RIGHT = [
    "kkkkkkkkkkkkkk", "kbbbbbbbabbbbk", "kbbbbbbbaabbbk", "kbaaaaaaaaabbk", "kbbbbbbbaabbbk", "kbbbbbbbabbbbk", "kBBBBBBBBBBBBk", "kkkkkkkkkkkkkk",
    "......kpk.....", "......kpk.....", "......kpk.....", "......kpk.....", "......kpk.....", ".....kkkkk....",
  ];
  var zoneSprites = null;
  function getZoneSprites() {
    if (zoneSprites) return zoneSprites;
    zoneSprites = {
      elder: spriteCanvas(ELDER, ELDER_PAL),
      chest: spriteCanvas(CHEST, CHEST_PAL),
      signR: spriteCanvas(SIGN_RIGHT, SIGN_PAL),
      signL: spriteCanvas(SIGN_RIGHT, SIGN_PAL, true),
    };
    // 上り階段（2×2タイル）：奥へ向かって段が上がっていく
    var up = makeCanvas(32, 32), u = up.getContext("2d");
    px(u, "#2a241d", 0, 0, 32, 32);
    for (var i = 0; i < 6; i++) {
      var y = 27 - i * 5;
      px(u, "#a89878", 4, y, 24, 2);
      px(u, "#6a5e4a", 4, y + 2, 24, 3);
    }
    px(u, "#4a4034", 0, 0, 4, 32); px(u, "#4a4034", 28, 0, 4, 32);
    px(u, "#6a5e4a", 0, 0, 1, 32); px(u, "#1a1410", 31, 0, 1, 32);
    px(u, "#e8dcc8", 15, 2, 2, 1); px(u, "#e8dcc8", 14, 3, 4, 1); px(u, "#e8dcc8", 13, 4, 6, 1);
    zoneSprites.stairsUp = up;
    // 下り階段：床に開いた口から、段が暗がりへ下りていく
    var dn = makeCanvas(32, 32), d = dn.getContext("2d");
    px(d, "#3a3128", 0, 0, 32, 32);
    for (var j = 0; j < 6; j++) {
      var shade = [0x8a, 0x74, 0x60, 0x4c, 0x38, 0x26][j];
      var c = "rgb(" + shade + "," + Math.round(shade * 0.9) + "," + Math.round(shade * 0.75) + ")";
      px(d, c, 4, 2 + j * 5, 24, 3);
      px(d, "#15120f", 4, 5 + j * 5, 24, 2);
    }
    px(d, "#b09a70", 0, 0, 32, 1); px(d, "#b09a70", 0, 0, 1, 32); px(d, "#b09a70", 31, 0, 1, 32);
    px(d, "#e8dcc8", 13, 26, 6, 1); px(d, "#e8dcc8", 14, 27, 4, 1); px(d, "#e8dcc8", 15, 28, 2, 1);
    zoneSprites.stairsDown = dn;
    return zoneSprites;
  }

  // 危険域：地面に赤い網目（ディザ）を掛けて、踏み込む範囲そのものを示す
  function makeDangerOverlay(r, encounter) {
    var size = Math.ceil(r * 2) + 2;
    var c = makeCanvas(size, size), ctx = c.getContext("2d");
    var cx = size / 2, cy = size / 2;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      if (d > r - 1.5) { if ((x + y) % 3 === 0) px(ctx, encounter ? "#a05a28" : "#b04020", x, y); continue; }
      if ((x + y * 3) % 6 === 0) px(ctx, encounter ? "rgba(200,136,80,0.55)" : "rgba(224,96,44,0.55)", x, y);
    }
    if (encounter) {
      [[-6, -3], [4, 4], [-1, 9]].forEach(function (p) {
        var fx = Math.round(cx + p[0]), fy = Math.round(cy + p[1]);
        px(ctx, "#c88850", fx, fy, 3, 3); px(ctx, "#c88850", fx - 1, fy - 2, 1, 1); px(ctx, "#c88850", fx + 1, fy - 2, 1, 1); px(ctx, "#c88850", fx + 3, fy - 2, 1, 1);
      });
    }
    return c;
  }

  // タイル単位（tx,ty）で書かれた地点を、ドット座標(x,y)に直す
  function toPx(p) {
    if (!p) return p;
    if (p.tx === undefined) return { x: p.x, y: p.y };
    return { x: p.tx * TILE, y: p.ty * TILE };
  }

  // data: { label, layer?, tilemap:{cols,rows,seed,ops}, underlay?, start, entryPoints?, zones:[{id,kind,tx,ty,r,...}] }
  // initialTaken: 既に消化済みのゾーン（宝箱を開けた等）。渡せば、
  // このエリアへ出入りし直しても「もう取った」状態が保たれる。
  function FreeArea(containerEl, data, gameState, callbacks, initialTaken) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.taken = initialTaken || {};
    this.zones = (data.zones || []).map(function (z) { var p = toPx(z); return Object.assign({}, z, { x: p.x, y: p.y }); });
    this.pos = toPx(data.start);
    this.map = getTileBundle(data);
    this.mapW = this.map.w;
    this.mapH = this.map.h;
    this.facing = "down";
    this._walkDist = 0;
    this._dangerOverlays = {};
    // 階段で層を移ると、到着地点が移動先の階段ゾーンの内側になる。
    // ここを空で始めると一歩動いた瞬間に「階段に入った」と判定され、
    // 元の層へ送り返され続ける。開始地点のゾーンには既に入っている扱いにし、
    // 一度離れてから踏み直したときだけ発動させる。
    var startZone = this.zoneAt(this.pos.x, this.pos.y);
    this.insideZoneId = startZone ? startZone.id : null;
  }

  // 画面に映る窓は固定サイズ（24×16タイル）。マップがこれより大きければ
  // プレイヤーを中心に窓だけが動き、歩いて見て回ることになる。
  var VIEW_W = 24 * TILE, VIEW_H = 16 * TILE;
  FreeArea.prototype.cameraViewBox = function () {
    var vw = Math.min(VIEW_W, this.mapW);
    var vh = Math.min(VIEW_H, this.mapH);
    var x = Math.round(Math.max(0, Math.min(this.mapW - vw, this.pos.x - vw / 2)));
    var y = Math.round(Math.max(0, Math.min(this.mapH - vh, this.pos.y - vh / 2)));
    return { x: x, y: y, vw: vw, vh: vh };
  };

  // 当たり判定は足元の小さな箱（幅10×高さ6ドット）。四隅のどれかが
  // 歩けないタイルに掛かれば進めない（上層なら、描かれた足場の外へは出られない）。
  var FOOT_HW = 5, FOOT_UP = 5, FOOT_DN = 1;
  FreeArea.prototype.isBlocked = function (x, y) {
    if (x - FOOT_HW < 0 || x + FOOT_HW >= this.mapW || y - FOOT_UP < 0 || y + FOOT_DN >= this.mapH) return true;
    var grid = this.map.grid;
    var xs = [x - FOOT_HW, x + FOOT_HW], ys = [y - FOOT_UP, y + FOOT_DN];
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
      if (!WALKABLE[grid.get(Math.floor(xs[i] / TILE), Math.floor(ys[j] / TILE))]) return true;
    }
    return false;
  };

  FreeArea.prototype.zoneAt = function (x, y) {
    var zones = this.zones;
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

  // 画面（クライアント）座標を、今のカメラ位置を踏まえたマップ座標に直す。
  FreeArea.prototype.screenToMap = function (clientX, clientY) {
    var cv = this._canvasEl;
    if (!cv) return null;
    var rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var cam = this.cameraViewBox();
    return {
      x: cam.x + (clientX - rect.left) * (cam.vw / rect.width),
      y: cam.y + (clientY - rect.top) * (cam.vh / rect.height),
    };
  };

  // 指定地点へ「歩いて」向かう（瞬間移動はしない。途中に壁があればそこで止まる）。
  FreeArea.prototype.moveTo = function (tx, ty) {
    if (this.isBlocked(tx, ty)) { this.flash("そこには進めない。"); return; }
    this._walkTarget = { x: tx, y: ty };
    this.ensureLoop();
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

  // 画面をなぞっている間、指（マウス）の位置へ向かって歩き続ける。
  // 軽く触れただけ（タップ）なら、その地点まで歩いて向かう。
  FreeArea.prototype.attachPointer = function (cv) {
    var self = this;
    this._pointerActive = false;
    this._pointerScreen = null;

    cv.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      cv.focus();
      if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 捕捉できなくても追従自体は動く */ } }
      self._pointerActive = true;
      self._pointerScreen = { x: e.clientX, y: e.clientY };
      self._walkTarget = null;
      self._pointerMoved = false;
      self.ensureLoop();
    });

    cv.addEventListener("pointermove", function (e) {
      if (!self._pointerActive) return;
      e.preventDefault();
      var prev = self._pointerScreen;
      if (prev && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 2) self._pointerMoved = true;
      self._pointerScreen = { x: e.clientX, y: e.clientY };
    });

    var release = function (e) {
      if (!self._pointerActive) return;
      self._pointerActive = false;
      if (!self._pointerMoved) {
        var p = self.screenToMap(e.clientX, e.clientY);
        if (p && !self.isBlocked(p.x, p.y)) { self._walkTarget = p; self.ensureLoop(); }
      }
      self._pointerScreen = null;
    };
    cv.addEventListener("pointerup", release);
    cv.addEventListener("pointercancel", release);
  };

  // キーボードとポインタ、両方の入力を止める（画面遷移や会話に入る時など）。
  FreeArea.prototype.detachKeyboard = function () {
    this._pointerActive = false;
    this._pointerScreen = null;
    this._walkTarget = null;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (!this._kbAttached) return;
    this._kbAttached = false;
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    this._keys = {};
  };

  FreeArea.prototype.isMoving = function () {
    var k = this._keys;
    if (k && (k.up || k.down || k.left || k.right)) return true;
    return !!(this._pointerActive || this._walkTarget);
  };

  FreeArea.prototype.ensureLoop = function () {
    if (this._raf) return;
    var self = this;
    var last = null;
    function frame(t) {
      if (last === null) last = t;
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      self.tick(dt);
      if (self._raf === null) return; // tick中にゾーンへ入り、画面が切り替わった
      if (self.isMoving()) self._raf = requestAnimationFrame(frame);
      else { self._raf = null; self._walkDist = 0; self.draw(); }
    }
    this._raf = requestAnimationFrame(frame);
  };

  // このフレームで進むべき向き。キー入力が最優先で、無ければ
  // なぞっている指の位置、それも無ければタップで指定した目的地へ向かう。
  FreeArea.prototype.currentMoveDir = function () {
    var k = this._keys || {};
    var kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    var ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    if (kx || ky) {
      var klen = Math.hypot(kx, ky) || 1;
      return { dx: kx / klen, dy: ky / klen, target: null };
    }
    var target = null;
    if (this._pointerActive && this._pointerScreen) {
      target = this.screenToMap(this._pointerScreen.x, this._pointerScreen.y);
    } else if (this._walkTarget) {
      target = this._walkTarget;
    }
    if (!target) return null;
    var dx = target.x - this.pos.x, dy = target.y - this.pos.y;
    var len = Math.hypot(dx, dy);
    if (len < 3) { this._walkTarget = null; return null; }
    return { dx: dx / len, dy: dy / len, target: target, dist: len };
  };

  var WALK_SPEED = 120; // ドット／秒

  // 毎フレーム連続座標で移動する。縦横を別々に判定するので、
  // 斜めに壁へ当たっても壁沿いに滑って進める。
  FreeArea.prototype.tick = function (dt) {
    var dir = this.currentMoveDir();
    if (!dir) return;
    var step = WALK_SPEED * dt;
    if (dir.dist !== undefined) step = Math.min(step, dir.dist);
    // ループ初回フレームは dt=0。ここで「進めなかった」と判定すると
    // 歩き出す前に目的地を捨ててしまうため、距離0のフレームは何もしない。
    if (step <= 0) return;
    if (Math.abs(dir.dx) > Math.abs(dir.dy)) this.facing = dir.dx > 0 ? "right" : "left";
    else this.facing = dir.dy > 0 ? "down" : "up";
    var moved = 0;
    var nx = this.pos.x + dir.dx * step;
    if (!this.isBlocked(nx, this.pos.y)) { moved += Math.abs(nx - this.pos.x); this.pos.x = nx; }
    var ny = this.pos.y + dir.dy * step;
    if (!this.isBlocked(this.pos.x, ny)) { moved += Math.abs(ny - this.pos.y); this.pos.y = ny; }
    if (moved <= 0) { this._walkTarget = null; this._walkDist = 0; this.draw(); return; }
    this._walkDist += moved;
    this.updateHudAndPlayer();
    this.checkZone(this.pos.x, this.pos.y);
  };

  FreeArea.prototype.updateHudAndPlayer = function () {
    if (this._hudEl) this._hudEl.textContent = (this.data.label || "") + "　歩数 " + this.game.steps + " / " + this.game.stepLimit;
    this.draw();
  };

  // 1フレーム分を描く：地形（作り置きの画像から窓の分だけ切り出す）→ 目印 → 主人公。
  FreeArea.prototype.draw = function () {
    var cv = this._canvasEl;
    if (!cv) return;
    var ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    var cam = this.cameraViewBox();
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, cam.vw, cam.vh);
    ctx.drawImage(this.map.canvas, cam.x, cam.y, cam.vw, cam.vh, 0, 0, cam.vw, cam.vh);
    var sprites = getZoneSprites();
    var self = this;
    this.zones.forEach(function (z) {
      if (self.taken[z.id]) return;
      var sx = Math.round(z.x - cam.x), sy = Math.round(z.y - cam.y);
      if (sx < -z.r - 40 || sy < -z.r - 40 || sx > cam.vw + z.r + 40 || sy > cam.vh + z.r + 40) return;
      if (z.kind === "danger" || z.kind === "encounter") {
        var ov = self._dangerOverlays[z.id] || (self._dangerOverlays[z.id] = makeDangerOverlay(z.r, z.kind === "encounter"));
        ctx.drawImage(ov, sx - Math.floor(ov.width / 2), sy - Math.floor(ov.height / 2));
      } else if (z.kind === "chest") {
        px(ctx, "rgba(0,0,0,0.35)", sx - 7, sy + 4, 15, 3);
        ctx.drawImage(sprites.chest, sx - 7, sy - 6);
      } else if (z.kind === "stairs") {
        ctx.drawImage(z.toLayer === "upper" ? sprites.stairsUp : sprites.stairsDown, sx - 16, sy - 16);
      } else if (z.kind === "exit") {
        var sign = z.dir === "w" ? sprites.signL : sprites.signR;
        px(ctx, "rgba(0,0,0,0.35)", sx - 5, sy + 1, 11, 3);
        ctx.drawImage(sign, sx - 7, sy - 13);
        if (z.dir === "n") { px(ctx, "#e8dcc8", sx - 1, sy - 20, 2, 1); px(ctx, "#e8dcc8", sx - 2, sy - 19, 4, 1); px(ctx, "#e8dcc8", sx - 3, sy - 18, 6, 1); }
      } else if (z.kind === "talk") {
        px(ctx, "rgba(0,0,0,0.35)", sx - 5, sy, 11, 3);
        ctx.drawImage(sprites.elder, sx - 6, sy - 15);
      }
    });
    var hero = getHeroSprites()[this.facing];
    var frame = "idle";
    if (this._walkDist > 0) {
      var ph = Math.floor(this._walkDist / 7) % 4;
      frame = ph === 0 ? "a" : (ph === 2 ? "b" : "idle");
    }
    var hx = Math.round(this.pos.x - cam.x), hy = Math.round(this.pos.y - cam.y);
    px(ctx, "rgba(0,0,0,0.4)", hx - 5, hy, 10, 2);
    ctx.drawImage(hero[frame], hx - 6, hy - 15);
    this.placeLabels(cam);
  };

  // 目印の名前は、ドット絵の中に小さく描くと読めないので、画面の上に
  // 重ねた文字として出し、カメラの動きに合わせて位置を合わせる。
  FreeArea.prototype.placeLabels = function (cam) {
    var self = this;
    (this._labelEls || []).forEach(function (item) {
      var z = item.zone;
      var lx = z.x - cam.x, ly = z.y - cam.y + (z.kind === "stairs" ? 18 : Math.min(z.r, 22) + 4);
      var visible = !self.taken[z.id] && lx > -60 && lx < cam.vw + 60 && ly > -10 && ly < cam.vh + 10;
      item.el.style.display = visible ? "" : "none";
      if (!visible) return;
      // 画面の端にある目印は、名前が枠の外へはみ出さないよう内側へ寄せる
      var fw = self._frameEl ? self._frameEl.clientWidth : 0;
      var scale = fw ? fw / cam.vw : 1;
      var half = item.el.offsetWidth / 2;
      var left = lx * scale;
      if (fw) left = Math.max(half + 2, Math.min(fw - half - 2, left));
      item.el.style.left = left + "px";
      item.el.style.top = (ly / cam.vh * 100) + "%";
    });
  };

  FreeArea.prototype.enterZone = function (zone) {
    var self = this;
    // 危険域を踏んでも何も起きなかった時は、なぞって歩いている指の追従を
    // 切らずにそのまま歩き続けられるようにする（画面が切り替わる時だけ止める）。
    if (zone.kind === "danger") {
      var rate = zone.encounterRate === undefined ? 0.4 : zone.encounterRate;
      if (Math.random() < rate && this.cb.onEncounter) { this.detachKeyboard(); this.cb.onEncounter(function () { self.render(); }); }
      return;
    }
    this.detachKeyboard();
    // 広域マップの経路と同じ考え方：移動距離ではなく、その区画を踏破した分の
    // 固定歩数をここでまとめて消費する（ノードの経路にsteps値を持たせるのと同じ形）。
    if (zone.kind === "exit") {
      this.game.steps += zone.steps === undefined ? 15 : zone.steps;
      if (this.cb.onExit) this.cb.onExit(zone.to);
      return;
    }
    if (zone.kind === "stairs") {
      if (this.cb.onStairs) { this.cb.onStairs(zone.toLayer, zone.entry); return; }
      this.attachKeyboard();
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
    }
  };

  // 一時的な一言。画面全体を作り直すと、なぞって歩いている最中の
  // 指の追従まで切れてしまうので、文言の欄だけを書き換える。
  FreeArea.prototype.flash = function (msg) {
    var self = this;
    if (this._msgEl) this._msgEl.textContent = msg;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(function () { if (self._msgEl) self._msgEl.textContent = ""; }, 1200);
  };

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

    var cam = this.cameraViewBox();
    var frameEl = document.createElement("div");
    frameEl.className = "freearea-frame";
    frameEl.style.aspectRatio = cam.vw + " / " + cam.vh;
    var cv = document.createElement("canvas");
    cv.className = "freearea";
    cv.width = cam.vw;
    cv.height = cam.vh;
    cv.tabIndex = 0;
    frameEl.appendChild(cv);
    this._canvasEl = cv;
    this._frameEl = frameEl;

    this._labelEls = [];
    this.zones.forEach(function (z) {
      if (!z.label) return;
      var lab = document.createElement("div");
      lab.className = "freearea-label freearea-label-" + z.kind;
      lab.textContent = z.label;
      frameEl.appendChild(lab);
      self._labelEls.push({ zone: z, el: lab });
    });

    // いまどの層にいるか。下層・上層を持つエリアでは常に表示し、
    // 階段で移ってきた直後は、層の名前を大きく重ねて知らせる。
    if (this.data.layers) {
      var badge = document.createElement("div");
      badge.className = "layer-badge";
      this.data.layers.forEach(function (ly) {
        var row = document.createElement("div");
        row.className = "layer-row" + (ly.id === self.data.layer ? " current" : "");
        row.textContent = (ly.id === self.data.layer ? "▶ " : "　 ") + ly.name;
        badge.appendChild(row);
      });
      frameEl.appendChild(badge);
      if (this.data.arrivedByStairs && !this._bannerShown) {
        this._bannerShown = true;
        var banner = document.createElement("div");
        banner.className = "layer-banner";
        var cur = this.data.layers.filter(function (ly) { return ly.id === self.data.layer; })[0];
        banner.textContent = cur ? cur.name : "";
        frameEl.appendChild(banner);
      }
    }

    wrap.appendChild(frameEl);
    this.attachPointer(cv);

    var msg = document.createElement("div");
    msg.className = "dungeon-msg";
    msg.textContent = "";
    wrap.appendChild(msg);
    this._msgEl = msg;

    var hint = document.createElement("p");
    hint.className = "footnote";
    hint.textContent = "画面をなぞると、その方向へ歩き続けます（指を離すと停止）。タップした地点へ歩くことも、矢印キー／WASDで動くこともできます。";
    wrap.appendChild(hint);

    this.el.appendChild(wrap);
    this.draw();
    this.attachKeyboard();
    cv.focus();
  };

  function startFreeArea(containerEl, data, gameState, callbacks, initialTaken) {
    var f = new FreeArea(containerEl, data, gameState, callbacks, initialTaken);
    f.render();
    return f;
  }

  return { start: start, startWorldMap: startWorldMap, startFreeArea: startFreeArea };
})();
