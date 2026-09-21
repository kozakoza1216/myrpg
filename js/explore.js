// 擬似3Dダンジョン探索（PLAN.md §8 準拠）。SVG遠近レイヤーで一人称視点の街路を描く。
window.RPG = window.RPG || {};

RPG.Explore = (function () {
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
  // FreeAreaで実際に画面に映る窓の大きさ（固定）。マップ自体はこれより
  // 大きく作れる（プレイヤーを追いかけるカメラで、はみ出した分は歩いて見る）。
  var FREEAREA_VIEW_W = 480, FREEAREA_VIEW_H = 320;
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

  // 一様に塗った矩形＋当たり判定のためだけの縁、では「ただの四角い原っぱ」に
  // 見えてしまう。地面の質感（濃淡のむら）と、外周の不揃いな瓦礫の縁取りを
  // 加えて、境界そのものは矩形のままでも見た目は崩れた廃墟らしくする。
  // 毎回re-renderするたびに配置が変わると落ち着かないので、シード付き
  // 疑似乱数でエリアごとに決まった配置を1回だけ作り、使い回す。
  function seededRandom(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildGroundTexture(data) {
    var rng = seededRandom(Math.floor(data.width * 7 + data.height * 13) || 1);
    var patches = [];
    var count = Math.round((data.width * data.height) / 9000);
    for (var i = 0; i < count; i++) {
      patches.push({
        x: rng() * data.width, y: rng() * data.height,
        r: 10 + rng() * 16, rot: Math.floor(rng() * 4),
        dark: rng() < 0.5,
      });
    }
    var edge = [];
    var step = 46;
    for (var x = 0; x < data.width; x += step) { edge.push({ x: x + rng() * 20, y: -4 + rng() * 10, r: 14 + rng() * 10 }); edge.push({ x: x + rng() * 20, y: data.height + 4 - rng() * 10, r: 14 + rng() * 10 }); }
    for (var y = 0; y < data.height; y += step) { edge.push({ x: -4 + rng() * 10, y: y + rng() * 20, r: 14 + rng() * 10 }); edge.push({ x: data.width + 4 - rng() * 10, y: y + rng() * 20, r: 14 + rng() * 10 }); }
    return { patches: patches, edge: edge };
  }

  function drawFreeAreaGround(svg, data, texture) {
    svg.appendChild(el("rect", { x: 0, y: 0, width: data.width, height: data.height, fill: "#26221c" }));
    texture.patches.forEach(function (p) {
      var shape = RUBBLE_SHAPES[p.rot % RUBBLE_SHAPES.length];
      svg.appendChild(el("polygon", {
        points: pts18(p.x, p.y, p.r, shape),
        fill: p.dark ? "#201c16" : "#2e2921", opacity: 0.6,
      }));
    });
    // 外周を瓦礫でぼかし、まっすぐな矩形の縁に見えないようにする
    // （歩ける範囲そのものは変えず、見た目だけを崩す）
    texture.edge.forEach(function (p, i) {
      var shape = RUBBLE_SHAPES[i % RUBBLE_SHAPES.length];
      svg.appendChild(el("polygon", { points: pts18(p.x, p.y, p.r, shape), fill: "#1c1812", stroke: "#100c08", "stroke-width": 1 }));
    });
  }

  // ── ノード内部の自由移動エリア（グリッド不使用） ──
  // マス目には区切らず、クリックした座標へ直接歩く。位置は連続座標(x,y)で持ち、
  // 障害物・危険域・宝箱・出口は円形の当たり判定として定義する。
  // data: { width, height, start:{x,y}, obstacles:[{x,y,r}], zones:[{id,kind,x,y,r,encounterRate?}] }
  // initialTaken: 既に消化済みのゾーン（宝箱を開けた等）を渡せば、
  // このエリアへ出入りし直しても「もう取った」状態が保たれる
  // （渡さなければ、Dungeonの visited 同様、空から始まる扱いになる）。
  function FreeArea(containerEl, data, gameState, callbacks, initialTaken) {
    this.el = containerEl;
    this.data = data;
    this.game = gameState;
    this.cb = callbacks || {};
    this.pos = { x: data.start.x, y: data.start.y };
    this.taken = initialTaken || {};
    this.insideZoneId = null;
    this._groundTexture = buildGroundTexture(data);
  }

  // 画面に見える窓は固定サイズ。マップ（data.width/height）がこれより
  // 大きければ、全体を縮小して収めるのではなく、プレイヤーを中心に
  // 窓だけが動く（＝マップ全体は一画面に収まらず、歩いて見て回る
  // 必要がある）。窓の方が大きい／同じ場合は今まで通り全体表示になる。
  FreeArea.prototype.cameraViewBox = function () {
    var vw = Math.min(FREEAREA_VIEW_W, this.data.width);
    var vh = Math.min(FREEAREA_VIEW_H, this.data.height);
    var x = Math.max(0, Math.min(this.data.width - vw, this.pos.x - vw / 2));
    var y = Math.max(0, Math.min(this.data.height - vh, this.pos.y - vh / 2));
    return { x: x, y: y, vw: vw, vh: vh };
  };

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
    // moveTo()は毎フレームrender()し直すのではなく、この軽量更新だけで
    // プレイヤー表示を動かす。カメラ（viewBox）もここで一緒に更新しないと、
    // マップが画面より大きい場合に、歩いてもカメラが追従しなくなる。
    if (this._svgEl) {
      var cam = this.cameraViewBox();
      this._svgEl.setAttribute("viewBox", cam.x + " " + cam.y + " " + cam.vw + " " + cam.vh);
    }
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

    var cam = this.cameraViewBox();
    var vw = cam.vw, vh = cam.vh, camX = cam.x, camY = cam.y;

    var svg = el("svg", { viewBox: camX + " " + camY + " " + vw + " " + vh, class: "freearea", tabindex: "0" });
    this._svgEl = svg;
    drawFreeAreaGround(svg, this.data, this._groundTexture);

    (this.data.obstacles || []).forEach(function (o, i) { drawFreeAreaObstacle(svg, o, i); });
    (this.data.zones || []).forEach(function (z) { if (!self.taken[z.id]) drawFreeAreaZone(svg, z); });

    var pg = el("g", { class: "freearea-player", transform: "translate(" + this.pos.x + "," + this.pos.y + ")" });
    pg.appendChild(el("polygon", { points: "0,10 -6,20 6,20", fill: "#3a6bab", stroke: "#e8dcc8", "stroke-width": 1.5 }));
    pg.appendChild(el("circle", { cx: 0, cy: 6, r: 6, fill: "#e8dcc8", stroke: "#3a6bab", "stroke-width": 1.5 }));
    svg.appendChild(pg);
    this._playerEl = pg;

    svg.onclick = function (evt) {
      var rect = svg.getBoundingClientRect();
      var x = camX + (evt.clientX - rect.left) * (vw / rect.width);
      var y = camY + (evt.clientY - rect.top) * (vh / rect.height);
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

  function startFreeArea(containerEl, data, gameState, callbacks, initialTaken) {
    var f = new FreeArea(containerEl, data, gameState, callbacks, initialTaken);
    f.render();
    return f;
  }

  return { start: start, startWorldMap: startWorldMap, startFreeArea: startFreeArea };
})();
