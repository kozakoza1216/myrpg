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
    appendMenuButton(wrap, this.cb);

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

  // 探索画面の「メニュー」ボタン（ステータス・技・持ち物・ファストトラベル・
  // セーブ／ロード）。ワールドマップは、メニューのファストトラベルからだけ開く。
  function appendMenuButton(wrap, cb, beforeOpen) {
    if (!cb || !cb.openMenu) return;
    var row = document.createElement("div");
    row.className = "menu-open";
    row.appendChild(ctrlBtn("メニュー", function () { if (beforeOpen) beforeOpen(); cb.openMenu(); }));
    wrap.appendChild(row);
  }

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
        if (!self.cb.fastTravelOnly) {
          var hitSelf = el("circle", {cx:0,cy:0,r:18,fill:"transparent",class:"map-node clickable"});
          hitSelf.onclick = function(){ self.reenter(); };
          g.appendChild(hitSelf);
        }
      }
      // ファストトラベル専用で開いている時は、地点をクリックして歩いて移動することはできない
      if (isNeighbor && !self.cb.fastTravelOnly) {
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
    if (this.cb.fastTravelOnly) {
      var ftc = document.createElement("div");
      ftc.className = "fast-travel-controls";
      var hd = document.createElement("p");
      hd.className = "prompt";
      hd.textContent = destinations.length ? "ファストトラベル：行き先を選ぶ（最短経路と同じ歩数を消費）" : "まだファストトラベルで行ける場所がない";
      ftc.appendChild(hd);
      destinations.forEach(function (node) {
        var cost = self.fastTravelCost(node.id);
        ftc.appendChild(ctrlBtn(node.name + "へ（" + cost + "歩）", function () { self.fastTravelTo(node.id); }));
      });
      ftc.appendChild(ctrlBtn("戻る", function () { if (self.cb.onCancel) self.cb.onCancel(); }));
      wrap.appendChild(ftc);
    } else if (destinations.length) {
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
  // 画面には出さずに作る（現在地・訪れた場所・歩数の計算だけを受け持ち、
  // ファストトラベルの時にだけ render() で開く）
  function createWorldMap(containerEl, data, gameState, callbacks) {
    return new WorldMap(containerEl, data, gameState, callbacks);
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
      // 門：柵の一部を、閉ざされた門扉にする（通れない）
      if (op.op === "gate") {
        for (x = op.x; x < op.x + op.w; x++) set(x, op.y, TT.fence);
        objects.push({ kind: "gate", x: op.x, y: op.y, w: op.w });
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

  // ── 地形の描画（高画質） ──
  // 地図の座標・当たり判定・道幅は16ドット＝1タイルのまま変えず、描く細かさ
  // だけを3倍（1タイル＝48画素）にする。模様は画素ごとに計算し、どのタイルの
  // 境目でも途切れない継ぎ目なしのノイズを使うので、格子状の繰り返しが出ない。
  // 光は左上から当て、建物などの背の高いものは右下へ影を落とす。
  var RES = 3;
  var TP = TILE * RES;            // 1タイルの画素数
  var CHUNK_T = 8;                // 描き溜めておく塊の一辺（タイル数）
  var CHUNK_P = CHUNK_T * TP;
  var CHUNK_KEEP = 30;            // 手元に残しておく塊の数（古いものから捨てる）

  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dith(x, y) { return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5; }

  // 256×256で端どうしがつながる（敷き詰めても継ぎ目の出ない）ノイズ
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
    // 平均に寄りがちな値を、0〜1いっぱいに広げる
    for (var k = 0; k < out.length; k++) out[k] = Math.max(0, Math.min(1, (out[k] / total - 0.5) * 2.2 + 0.5));
    return out;
  }
  var NOISE = null;
  function noiseTex() {
    if (!NOISE) NOISE = { a: tileableNoise(64, 4, 1), b: tileableNoise(8, 2, 2), c: tileableNoise(128, 3, 3) };
    return NOISE;
  }
  function nz(tex, x, y) { return tex[((y & 255) << 8) | (x & 255)]; }
  // 画素ごとに何度も引く乱数は、毎回計算せず256×256の表から引く（seedごとに別の表）
  var RND = {};
  function rnd(x, y, seed) {
    var t = RND[seed];
    if (!t) {
      t = RND[seed] = new Float32Array(65536);
      for (var i = 0; i < 65536; i++) t[i] = hash2(i & 255, i >> 8, seed * 7 + 1);
    }
    return t[((y & 255) << 8) | (x & 255)];
  }

  function rampOf(list) { return list.map(function (h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }); }
  var RP = {
    crack: rampOf(["#161412", "#1e1b18"]),
    sett: rampOf(["#24211c", "#302c26", "#3c3730", "#48423a", "#554e44", "#625a4e", "#6f6658"]),
    cobble: rampOf(["#2a2722", "#37332c", "#443f37", "#524c42", "#60594d", "#6e6658", "#7c7363"]),
    lot: rampOf(["#26221c", "#2f2a22", "#39332a", "#443c31", "#4f463a"]),
    grass: rampOf(["#1f2214", "#272b18", "#30351d", "#3a4023", "#454b2a", "#515832"]),
    blade: rampOf(["#58602f", "#666e38"]),
    dirt: rampOf(["#33291d", "#3e3223", "#4a3c2a", "#564633", "#62513c", "#6e5c45"]),
    water: rampOf(["#0b1417", "#0f1b1f", "#142329", "#1a2c33", "#22383f", "#2c4750"]),
    wall: rampOf(["#2a2621", "#35302a", "#403a33", "#4b443c", "#564e45", "#61594f", "#6d6459"]),
    roof: rampOf(["#23201c", "#2b2723", "#332f2a", "#3c3731", "#454039", "#4f4941"]),
    plaster: rampOf(["#2e2a23", "#3a352c", "#464036", "#524b3f", "#5e5648", "#6a6151"]),
    clay: rampOf(["#231812", "#2e1f17", "#39271c", "#443022", "#4f3828", "#5a412f"]),
    dark: rampOf(["#0b0907", "#12100c", "#1a1611", "#231e17"]),
    stone: rampOf(["#1c1814", "#2a241e", "#3a332b", "#4b4237", "#5d5244", "#706352", "#847561"]),
    brick: rampOf(["#2a1a14", "#3e261c", "#523226", "#663f30", "#7a4c3a"]),
    char: rampOf(["#0e0b08", "#1a140e", "#261d14", "#33271b"]),
    thatch: rampOf(["#3a2c18", "#4a3820", "#5a4628", "#6c5532", "#7e643c", "#907448"]),
    plank: rampOf(["#2e2214", "#3c2c1a", "#4a3822", "#58442a", "#665033", "#745c3c"]),
  };
  var o4 = [0, 0, 0, 255];
  function pick(ramp, t, x, y) {
    var n = ramp.length;
    var i = Math.floor((t + dith(x, y) / n) * n);
    var c = ramp[i < 0 ? 0 : i >= n ? n - 1 : i];
    o4[0] = c[0]; o4[1] = c[1]; o4[2] = c[2]; o4[3] = 255;
  }

  var TALL = {}; TALL[TT.bldg] = 1; TALL[TT.hut] = 1;
  var LOW = {}; LOW[TT.rubble] = 1; LOW[TT.fence] = 1; LOW[TT.well] = 1; LOW[TT.tree] = 1;
  var GROUND = {}; [TT.road, TT.plaza, TT.lot, TT.grass, TT.dirt].forEach(function (t) { GROUND[t] = 1; });
  var SOFT = {}; [TT.road, TT.plaza, TT.lot, TT.grass, TT.dirt, TT.rubble].forEach(function (t) { SOFT[t] = 1; });
  // 背の高いものの右下に落ちる影と、低いものの足元のくすみ
  function castShade(c, lx, ly) {
    var s = 0, e = TP - 1;
    if (TALL[c.up]) s = Math.max(s, 0.42 * (1 - ly / 30));
    if (TALL[c.lf]) s = Math.max(s, 0.34 * (1 - lx / 22));
    if (TALL[c.ul] && !TALL[c.up] && !TALL[c.lf]) s = Math.max(s, 0.34 * (1 - Math.hypot(lx, ly) / 26));
    if (LOW[c.up]) s = Math.max(s, 0.26 * (1 - ly / 12));
    if (LOW[c.lf]) s = Math.max(s, 0.22 * (1 - lx / 10));
    if (TALL[c.rt] || LOW[c.rt]) s = Math.max(s, 0.12 * (1 - (e - lx) / 6));
    if (TALL[c.dn] || LOW[c.dn]) s = Math.max(s, 0.12 * (1 - (e - ly) / 6));
    return s > 0 ? s : 0;
  }

  // 小石：cell画素ごとに一粒あるかどうか。2=光の当たる面 1=石 -1=石の影 0=なし
  function pebble(wx, wy, cell, dens, seed) {
    var cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
    if (rnd(cx, cy, seed) >= dens) return 0;
    var px0 = cx * cell + 2 + rnd(cx, cy, seed + 1) * (cell - 4), py0 = cy * cell + 2 + rnd(cx, cy, seed + 2) * (cell - 4);
    var r = 1.3 + rnd(cx, cy, seed + 3) * 1.8;
    var dx = wx + 0.5 - px0, dy = wy + 0.5 - py0, d2 = dx * dx + dy * dy;
    if (d2 > r * r) return (d2 < (r + 1.4) * (r + 1.4) && dx + dy > 0) ? -1 : 0;
    return dx + dy < -r * 0.4 ? 2 : 1;
  }

  // 石畳用の区画分け（一番近い点・二番目に近い点までの距離）
  var WR = { d1: 0, d2: 0, fx: 0, fy: 0, id: 0 };
  function worley(wx, wy, cell, seed) {
    var cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
    var d1 = 1e9, d2 = 1e9;
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var gx = cx + i, gy = cy + j;
      var fx = (gx + 0.2 + rnd(gx, gy, seed) * 0.6) * cell, fy = (gy + 0.2 + rnd(gx, gy, seed + 1) * 0.6) * cell;
      var d = (wx + 0.5 - fx) * (wx + 0.5 - fx) + (wy + 0.5 - fy) * (wy + 0.5 - fy);
      if (d < d1) { d2 = d1; d1 = d; WR.fx = fx; WR.fy = fy; WR.id = (gx & 255) | ((gy & 255) << 8); }
      else if (d < d2) d2 = d;
    }
    WR.d1 = Math.sqrt(d1); WR.d2 = Math.sqrt(d2);
    return WR;
  }

  // ── 素材ごとの画素の色 ──
  // 石畳の通り：長方形の敷石を、段ごとに半分ずらして並べる（目地には土が詰まる）。
  // 抜けた石の跡には土がのぞき、敷石は左上からの光で角が立って見える
  function shRoad(c, lx, ly, wx, wy, missing) {
    var N = noiseTex();
    var rowH = 10, row = Math.floor(wy / rowH), my = wy - row * rowH;
    var sw = 14 + Math.floor(rnd(row, 3, 700) * 7);
    var xo = wx + Math.floor(rnd(row, 0, 701) * sw);
    var col = Math.floor(xo / sw), mx = xo - col * sw;
    var sh = castShade(c, lx, ly);
    if (mx === 0 || my === 0 || rnd(col, row, 703) < (missing || 0.05)) {
      // 目地・抜けた石：土と砂利
      var td = 0.22 + (nz(N.b, wx, wy) - 0.5) * 0.3 - sh;
      if (mx !== 0 && my !== 0) td += 0.14;
      pick(RP.dirt, td, wx, wy); return;
    }
    var t = 0.5 + (rnd(col, row, 702) - 0.5) * 0.34 + (nz(N.b, wx, wy) - 0.5) * 0.22 + (nz(N.c, wx >> 1, wy >> 1) - 0.5) * 0.3;
    if (my === 1) t += 0.2; else if (my === rowH - 1) t -= 0.2;
    if (mx === 1) t += 0.12; else if (mx === sw - 1) t -= 0.14;
    if (rnd(col, row, 704) < 0.08 && Math.abs(mx - my * 1.3 - 2) < 0.8) t = 0.1;   // 割れた敷石
    t -= sh;
    pick(RP.sett, t, wx, wy);
  }

  // 建物の際：同じ石畳だが、人の通らない端なので石が多く抜け、土がのぞく（縁石は置かない）
  function shSidewalk(c, lx, ly, wx, wy) { shRoad(c, lx, ly, wx, wy, 0.16); }

  function shPlaza(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var w = worley(wx, wy, 13, 61);
    var t;
    if (w.d2 - w.d1 < 1.6) t = 0.08;
    else {
      t = 0.52 + (rnd(w.id & 255, w.id >> 8, 62) - 0.5) * 0.3 + (nz(N.b, wx, wy) - 0.5) * 0.2;
      t += -((wx - w.fx) + (wy - w.fy)) / 13 * 0.28;                        // 丸く盛り上がった石の光
      if (rnd(w.id & 255, w.id >> 8, 63) < 0.06) t -= 0.3;                              // 欠けた石
    }
    t -= castShade(c, lx, ly);
    pick(RP.cobble, t, wx, wy);
  }

  function shLot(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var t = 0.5 + (nz(N.a, wx, wy) - 0.5) * 0.6 + (nz(N.b, wx, wy) - 0.5) * 0.35;
    t -= castShade(c, lx, ly);
    var p = pebble(wx, wy, 7, 0.22, 71);
    if (p) {
      if (p === -1) t -= 0.18;
      else {
        // 砕けた煉瓦のかけらも混じる
        var cx = Math.floor(wx / 7), cy = Math.floor(wy / 7);
        if (rnd(cx, cy, 72) < 0.3) { pick(RP.brick, p === 2 ? 0.85 : 0.6, wx, wy); return; }
        pick(RP.stone, p === 2 ? 0.8 : 0.6, wx, wy); return;
      }
    }
    pick(RP.lot, t, wx, wy);
  }

  function shGrass(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var t = 0.5 + (nz(N.c, wx >> 1, wy >> 1) - 0.5) * 0.5 + (nz(N.a, wx, wy) - 0.5) * 0.35;
    // 草の葉：3画素幅の列ごとに、ずらした高さで短い葉を立てる
    // 草の葉：ばらばらの位置に短い葉を1本ずつ立てる（縦縞に並ばないよう、列ごとにずらす）
    var sh = castShade(c, lx, ly);
    var gx = Math.floor(wx / 4), gy = Math.floor((wy + rnd(gx, 7, 80) * 11) / 11);
    var bxp = gx * 4 + Math.floor(rnd(gx, gy, 81) * 4), byp = gy * 11 + Math.floor(rnd(gx, gy, 84) * 5) - Math.floor(rnd(gx, 7, 80) * 11);
    var bl = 3 + Math.floor(rnd(gx, gy, 85) * 3);
    if (rnd(gx, gy, 82) < 0.5 - sh && wy >= byp && wy < byp + bl) {
      var lean = Math.floor((wy - byp) * (rnd(gx, gy, 86) - 0.5));
      if (wx === bxp - lean) { if (wy === byp) { pick(RP.blade, 0.9, wx, wy); return; } t += 0.32; }
      else if (wx === bxp - lean + 1) t -= 0.1;
    }
    var p = pebble(wx, wy, 17, 0.03, 83);
    if (p) { pick(RP.stone, p === 2 ? 0.75 : p === 1 ? 0.55 : 0.2, wx, wy); return; }
    t -= sh;
    pick(RP.grass, t, wx, wy);
  }

  function shDirt(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var t = 0.5 + (nz(N.a, wx, wy) - 0.5) * 0.5 + (nz(N.b, wx, wy) - 0.5) * 0.35;
    if (nz(N.a, (wx >> 1) + 11, wy * 2) > 0.72) t -= 0.12;                  // 踏み固めた轍
    var p = pebble(wx, wy, 9, 0.1, 91);
    if (p) t += p === 2 ? 0.3 : p === 1 ? 0.15 : -0.15;
    t -= castShade(c, lx, ly);
    pick(RP.dirt, t, wx, wy);
  }

  function shWater(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var t = 0.45 + (nz(N.c, wx >> 1, wy >> 1) - 0.5) * 0.3;
    var rip = Math.sin((wy + nz(N.a, wx >> 1, wy) * 26) * 0.33 + wx * 0.04);
    if (rip > 0.93) t += 0.45; else if (rip > 0.8) t += 0.2;
    if (c.up !== TT.water) {
      // 石積みの岸と、岸の下に落ちる影
      if (ly < 7) { pick(RP.stone, ly < 2 ? 0.75 : ly < 5 ? 0.55 : 0.12, wx, wy); return; }
      if (ly < 22) t -= 0.35 * (1 - (ly - 7) / 15);
    }
    pick(RP.water, t, wx, wy);
  }

  // 石積み：段ごとに幅を変えた石を積む。st＝石の色の傾き
  function masonry(wx, wy, t0, sh) {
    var N = noiseTex();
    var rowH = 12, row = Math.floor(wy / rowH), my = wy - row * rowH;
    var bw = 15 + Math.floor(rnd(row, 5, 720) * 9);
    var xo = wx + Math.floor(rnd(row, 1, 721) * bw);
    var col = Math.floor(xo / bw), mx = xo - col * bw;
    if (mx === 0 || my === 0) { pick(RP.stone, 0.12 - sh, wx, wy); return; }           // 目地
    var t = t0 + (rnd(col, row, 722) - 0.5) * 0.3 + (nz(N.b, wx, wy) - 0.5) * 0.2;
    if (my === 1 || mx === 1) t += 0.14;
    if (my === rowH - 1 || mx === bw - 1) t -= 0.16;
    pick(RP.stone, t - sh, wx, wy);
  }

  // 建物の正面（街路に面した壁）。k＝下から何階目か（1が地上階）。
  // 地上階は石積み、上の階は木の柱・梁と漆喰の壁（木組み）。窓は小さく、ガラスはない
  function shFacade(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var e = TP - 1;
    var sh = (c.edgeR && lx >= e - 3) ? 0.3 : 0;
    var style = c.style;
    // 入口：石のアーチと、板の扉（半分ほどは壊れて奥の暗がりがのぞく）。幅28×高さ40（約1:1.4）
    var door = c.k === 1 && hash2(c.tx, c.ty, 301) < 0.18;
    if (door && lx >= 10 && lx <= 37 && ly >= 8) {
      var ax = lx - 23.5, ay = ly - 22;
      var inArch = ly >= 22 ? (lx >= 12 && lx <= 35) : (ax * ax + ay * ay <= 12 * 12);
      var inRing = ly >= 22 ? (lx >= 10 && lx <= 37) : (ax * ax + ay * ay <= 14.5 * 14.5);
      if (!inArch && inRing) { pick(RP.stone, 0.62 + (Math.floor(Math.atan2(ay, ax) * 4) % 2 ? 0.1 : -0.06), wx, wy); return; }
      if (inArch) {
        var broken = hash2(c.tx, c.ty, 305) < 0.5;
        if (broken && lx > 24) { pick(RP.dark, 0.2 + (1 - (ly - 10) / 38) * 0.4, wx, wy); return; }
        var pl = Math.floor((lx - 12) / 6);
        var tp = 0.5 + (rnd(pl, c.tx, 306) - 0.5) * 0.3 + (nz(N.a, wx * 3, wy >> 2) - 0.5) * 0.3;
        if ((lx - 12) % 6 === 0) tp = 0.08;
        if (ly === 30 || ly === 31 || ly === 42 || ly === 43) { pick(RP.stone, ly % 2 ? 0.3 : 0.45, wx, wy); return; }   // 鉄の帯
        pick(RP.plank, tp, wx, wy); return;
      }
    }
    // 窓：小さな開口。石の段では上をアーチに、木組みの段では角窓に
    var wins = style === 0 ? [[18, 30]] : style === 1 ? [[8, 17], [31, 40]] : (c.k === 1 ? [] : [[19, 29]]);
    for (var i = 0; i < wins.length; i++) {
      var a = wins[i][0], b = wins[i][1], top = 14, bot = 32;
      if (lx < a - 2 || lx > b + 2 || ly < top - 2 || ly > bot + 2) continue;
      var cxw = (a + b) / 2, rw = (b - a) / 2;
      var inside = lx >= a && lx <= b && ly <= bot && (c.k === 1 ? (ly >= top + rw ? true : (lx - cxw) * (lx - cxw) + (ly - top - rw) * (ly - top - rw) <= rw * rw) : ly >= top);
      if (!inside) {
        if (ly > bot && ly <= bot + 2 && lx >= a - 2 && lx <= b + 2) { pick(c.k === 1 ? RP.stone : RP.plank, ly === bot + 1 ? 0.75 : 0.3, wx, wy); return; }   // 窓台
        continue;
      }
      var st = hash2(c.tx * 3 + i, c.ty, 302);
      if (st < 0.3) {
        // 片方だけ残って傾いた板戸
        var pp = Math.floor((lx - a) / 4);
        if (lx - a < (b - a) * 0.55 + (ly - top) * 0.15) { pick(RP.plank, (lx - a) % 4 === 0 ? 0.1 : 0.45 + (rnd(pp, c.tx, 307) - 0.5) * 0.3, wx, wy); return; }
      } else if (st < 0.42) {
        // 板で打ち付けて塞いだ窓
        var plank = Math.floor((ly - top) / 6);
        pick(RP.plank, ((ly - top) % 6 === 5 ? 0.1 : 0.55) + (rnd(plank, c.tx, 303) - 0.5) * 0.3, wx, wy); return;
      }
      pick(RP.dark, (lx === a || ly === top) ? 0.0 : 0.25 + (1 - (ly - top) / (bot - top)) * 0.3, wx, wy); return;
    }
    if (c.k === 1) {
      if (ly >= e - 5) { masonry(wx, wy, 0.3, sh); return; }                         // 地面際の土台（暗い大石）
      masonry(wx, wy, 0.52, sh + (c.edgeL && lx <= 2 ? -0.2 : 0)); return;
    }
    // 木組み：両端と中ほどの柱、床の梁、ところどころの筋交い。漆喰は剥げて石がのぞく
    var post = lx <= 3 || lx >= e - 3 || (style !== 1 && lx >= 22 && lx <= 25);
    var beam = ly <= 4 || ly >= e - 3;
    var brace = style === 1 && Math.abs((lx - 4) * 0.9 - (ly - 5)) < 2.2 && lx < 22;
    if (post || beam || brace) {
      var tt = 0.4 + (nz(N.a, wx * 2, wy * 2) - 0.5) * 0.3;
      if (lx === 4 || lx === e - 4 || ly === 5) tt = 0.1;
      pick(RP.plank, tt - sh, wx, wy); return;
    }
    if (nz(N.c, (wx >> 1) + 13, (wy >> 1) + 57) > 0.68) { masonry(wx, wy, 0.35, sh); return; }   // 漆喰の剥げた跡
    var tpl = 0.55 + (nz(N.a, wx, wy >> 2) - 0.5) * 0.35 + (nz(N.b, wx, wy) - 0.5) * 0.2;
    pick(RP.plaster, tpl - sh, wx, wy);
  }

  var ROOF_FALL = 0.6;
  // 真上から見た屋根。区画（7×6タイル）ごとに別の建物として、縁は壁の頂（石の笠木）、
  // 内側は瓦（または石板）葺きの切妻屋根。多くが崩れ落ちて、焼けた垂木と暗い室内がのぞく
  function shRoof(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var e = TP - 1, lip = 6;
    var inU = c.lipU && ly < lip, inD = c.lipD && ly > e - lip, inL = c.lipL && lx < lip, inR = c.lipR && lx > e - lip;
    if (inU || inD || inL || inR) {
      var d = Math.min(inU ? ly : 99, inD ? e - ly : 99, inL ? lx : 99, inR ? e - lx : 99);
      var along = (inU || inD) ? wx : wy;
      var pt = d <= 0 ? 0.1 : d <= 2 ? 0.72 : 0.5;
      if (inD && d > 2) pt = 0.32;
      if (along % 16 === 0) pt = 0.12;                                                 // 笠木の継ぎ目
      pick(RP.stone, pt + (nz(N.b, wx, wy) - 0.5) * 0.18, wx, wy); return;
    }
    var shadow = (c.lipU && ly < lip + 5 ? 0.22 : 0) + (c.lipL && lx < lip + 4 ? 0.16 : 0);
    var ob = c.roofObj;
    // 崩れ落ちた屋根：いくつもの建物にまたがる大きな範囲で屋根がなく、壁の頂だけが残る。
    // 中は暗い室内で、焼け残った垂木が渡り、落ちた瓦と石が散らばる
    var hv = nz(N.a, (wx >> 3) + 50, (wy >> 3) + 20) + (nz(N.b, wx >> 1, wy >> 1) - 0.5) * 0.02;
    if (hv > ROOF_FALL) {
      var edge = hv < ROOF_FALL + 0.025;
      var rf = wx % 16;
      if (rf < 4 && !edge) { pick(RP.plank, rf === 0 ? 0.05 : rf === 1 ? 0.42 : 0.26, wx, wy); return; }   // 焼け残った垂木
      var pb = pebble(wx, wy, 7, 0.35, 731);
      if (pb > 0) { pick(RP.stone, pb === 2 ? 0.5 : 0.32, wx, wy); return; }
      pick(RP.dark, (edge ? 0.05 : 0.35) + (nz(N.a, wx, wy) - 0.5) * 0.4 - shadow, wx, wy); return;
    }
    if (hv > ROOF_FALL - 0.03) shadow += 0.22;                                          // 割れた瓦の縁
    if (ob === 1 && lx >= 13 && lx <= 34 && ly >= 11 && ly <= 32) {
      // 石積みの煙突（上面に煤けた口）
      if (lx >= 18 && lx <= 29 && ly >= 16 && ly <= 27) { pick(RP.char, 0.12 + (ly - 16) / 11 * 0.2, wx, wy); return; }
      if (lx <= 14 || ly <= 12) { pick(RP.stone, 0.8, wx, wy); return; }
      if (lx >= 33 || ly >= 31) { pick(RP.stone, 0.22, wx, wy); return; }
      masonry(wx, wy, 0.55, 0); return;
    }
    if (ob === 1 && lx >= 16 && lx <= 40 && ly > 32 && ly <= 40) shadow += 0.3;
    // 瓦：横に並んだ列ごとに、上が明るく下が暗い。北側の斜面は明るく、南側の斜面は暗い。棟には棟瓦
    var ramp = c.slate ? RP.roof : RP.clay;
    var rowH = 8, row = Math.floor(wy / rowH), ry = wy - row * rowH;
    var tw = 12, xo = wx + (row % 2) * 6, col = Math.floor(xo / tw), rx = xo - col * tw;
    var t = 0.5 + c.tint + (rnd(col, row, 733) - 0.5) * 0.18 + (nz(N.b, wx, wy) - 0.5) * 0.14;
    t += ry <= 1 ? 0.18 : ry >= rowH - 2 ? -0.22 : 0;
    if (rx === 0) t -= 0.14;
    t += c.slopeN ? 0.1 : -0.12;
    if (c.ridge && ly >= 20 && ly <= 27) t = ly === 20 ? 0.9 : ly === 27 ? 0.1 : 0.62 + ((wx % 10) === 0 ? -0.3 : 0);
    pick(ramp, t - shadow, wx, wy);
  }

  // 瓦礫：石・煉瓦の塊を積み重ねた山。塊ごとに丸みの陰影を付ける
  function shRubble(c, lx, ly, wx, wy, base) {
    var N = noiseTex();
    var e = TP - 1;
    var w = worley(wx, wy, 9, 111);
    var r = 9 * 0.55 * (0.75 + rnd(w.id & 255, w.id >> 8, 112) * 0.5);
    // 焼け焦げた梁の残骸
    if (c.rebar && Math.abs((lx - 8) * 0.5 - (ly - 6)) < 2 && lx < 36) { pick(RP.char, Math.abs((lx - 8) * 0.5 - (ly - 6)) < 0.8 ? 0.75 : 0.25, wx, wy); return; }
    if (w.d1 > r) { pick(RP.stone, 0.0, wx, wy); return; }
    var nx = (wx + 0.5 - w.fx) / r, ny = (wy + 0.5 - w.fy) / r;
    var light = -(nx * 0.6 + ny * 0.8);
    var t = 0.5 + light * 0.42 + (rnd(w.id & 255, w.id >> 8, 113) - 0.5) * 0.25 + (nz(N.b, wx, wy) - 0.5) * 0.15;
    if (rnd(w.id & 255, w.id >> 8, 114) < 0.28) pick(RP.brick, t, wx, wy); else pick(RP.stone, t * 0.85 + 0.15, wx, wy);
  }

  // 城壁の歩廊。石の床で、外側（下が抜けている側）には凸凹の胸壁が立つ。
  // deck＝見張り塔の上。歩廊より一段高い石の床で、歩廊との境に段が付く
  function shWalk(c, lx, ly, wx, wy, deck) {
    var N = noiseTex();
    var e = TP - 1;
    var dists = [c.vU ? ly : 99, c.vD ? e - ly : 99, c.vL ? lx : 99, c.vR ? e - lx : 99];
    var d = Math.min(dists[0], dists[1], dists[2], dists[3]);
    var along = (d === dists[0] || d === dists[1]) ? wx : wy;
    var t;
    // 胸壁：外側の縁から0-1は外壁の影。凸（石の塊）は床から立ち上がり、内側に影を落とす。凹は低い壁だけ
    if (d <= 15) {
      var m = along % 24, merlon = m < 13;
      if (d <= 1) { pick(RP.stone, 0.02, wx, wy); return; }
      if (merlon && d <= 11) {
        var tm = 0.9 + (nz(N.b, wx, wy) - 0.5) * 0.12;
        if (m === 0) tm = 0.35; else if (m === 12) tm = 0.45; else if (m === 1 || d === 2) tm = 1.0;
        if (d >= 9) tm = d === 9 ? 0.5 : 0.28;                                               // 内側を向いた面
        pick(RP.stone, tm, wx, wy); return;
      }
      if (!merlon && d <= 5) { pick(RP.stone, d === 2 ? 0.85 : d >= 5 ? 0.3 : 0.7, wx, wy); return; }
      if (merlon ? d <= 15 : d <= 8) { pick(RP.sett, merlon ? 0.02 + (d - 12) * 0.07 : 0.1 + (d - 6) * 0.08, wx, wy); return; }   // 胸壁の影
    }
    if (deck) {
      // 塔の上：歩廊との境に一段の段差（上が明るい縁、下が影）
      var sU = c.wU ? ly : 99, sL = c.wL ? lx : 99, sD = c.wD ? e - ly : 99, sR = c.wR ? e - lx : 99;
      var sd = Math.min(sU, sL, sD, sR);
      if (sd <= 4) { pick(RP.stone, sd <= 1 ? ((sd === sU || sd === sL) ? 0.9 : 0.1) : 0.6, wx, wy); return; }
      var gx = Math.floor(wx / 20), gy = Math.floor(wy / 20), mx2 = wx - gx * 20, my2 = wy - gy * 20;
      t = 0.55 + (rnd(gx, gy, 747) - 0.5) * 0.3 + (nz(N.b, wx, wy) - 0.5) * 0.2;
      if (mx2 === 0 || my2 === 0) t = 0.12; else if (mx2 === 1 || my2 === 1) t += 0.14;
      pick(RP.stone, t, wx, wy); return;
    }
    // 歩廊の床：大きな板石
    var rh = 16, rr = Math.floor(wy / rh), rys = wy - rr * rh;
    var sw = 24, xs = wx + (rr % 2) * 12, cs = Math.floor(xs / sw), rxs = xs - cs * sw;
    t = 0.5 + (rnd(cs, rr, 745) - 0.5) * 0.3 + (nz(N.b, wx, wy) - 0.5) * 0.22 + (nz(N.c, wx >> 1, wy >> 1) - 0.5) * 0.2;
    if (rys === 0 || rxs === 0) t = 0.12; else if (rys === 1 || rxs === 1) t += 0.14;
    pick(RP.sett, t, wx, wy);
  }

  function shHut(c, lx, ly, wx, wy) {
    var N = noiseTex();
    var e = TP - 1;
    if (c.hk > 0) {
      // 板壁（縦板と木目）。下が開いていれば地面際、2段目なら窓
      var plank = Math.floor(wx / 9), px9 = wx - plank * 9;
      var t = 0.5 + (rnd(plank, 0, 501) - 0.5) * 0.25 + (nz(N.a, wx * 3, wy >> 2) - 0.5) * 0.35;
      if (px9 === 0) t = 0.05; else if (px9 === 1) t += 0.18;
      if (c.hk === 1 && ly >= e - 4) t = 0.12;
      if (c.hk === 2 && ly <= 3) t = ly <= 1 ? 0.1 : 0.7;                                 // 軒下の梁
      if (c.hk === 2 && lx >= 12 && lx <= 35 && ly >= 14 && ly <= 34) {
        if (lx <= 13 || lx >= 34 || ly <= 15 || ly >= 33) { pick(RP.plank, 0.8, wx, wy); return; }
        if (lx === 24 || ly === 24) { pick(RP.plank, 0.55, wx, wy); return; }               // 木の格子
        pick(RP.dark, 0.2 + (ly - 16) / 18 * 0.3, wx, wy); return;
      }
      if (c.hl && lx <= 2) t -= 0.2;
      if (c.hr && lx >= e - 2) t -= 0.35;
      pick(RP.plank, t, wx, wy);
      return;
    }
    // 藁葺き屋根：段ごとに重ねた藁の房
    var row = Math.floor((wy + Math.floor(nz(N.b, wx, 0) * 3)) / 12), ry = wy - row * 12;
    var t2 = 0.55 + (nz(N.a, wx * 3, wy >> 1) - 0.5) * 0.45 + (ry < 3 ? 0.18 : ry > 9 ? -0.28 : 0);
    if (c.hu) t2 += ly < 4 ? 0.2 : 0;
    if (c.hl && lx < 4) t2 -= 0.25;
    if (c.hr && lx > e - 4) t2 -= 0.35;
    pick(RP.thatch, t2, wx, wy);
  }

  function shFence(c, lx, ly, wx, wy) {
    shGrass(c, lx, ly, wx, wy);
    var vert = c.up === TT.fence || c.dn === TT.fence;
    var horiz = c.lf === TT.fence || c.rt === TT.fence;
    if (horiz || !vert) {
      var pp = lx % 16;
      if (pp >= 5 && pp <= 10 && ly >= 6 && ly <= 44) { pick(RP.plank, pp === 5 ? 0.85 : pp >= 9 ? 0.2 : 0.55, wx, wy); if (ly <= 7) pick(RP.plank, 0.95, wx, wy); return; }
      if ((ly >= 16 && ly <= 20) || (ly >= 30 && ly <= 34)) { pick(RP.plank, ly === 16 || ly === 30 ? 0.8 : 0.4, wx, wy); return; }
      if (ly >= 45 && ly <= 47 && pp >= 4 && pp <= 12) { o4[0] *= 0.65; o4[1] *= 0.65; o4[2] *= 0.65; }
    }
    if (vert) {
      if (lx >= 18 && lx <= 22 || lx >= 28 && lx <= 32) { pick(RP.plank, lx === 18 || lx === 28 ? 0.8 : 0.4, wx, wy); return; }
      var pq = ly % 24;
      if (lx >= 15 && lx <= 35 && pq >= 6 && pq <= 12) { pick(RP.plank, pq === 6 ? 0.9 : 0.55, wx, wy); return; }
    }
  }

  // タイルごとの、描画に使う周りの情報（隣が何か、何階目の壁か、など）
  function tileCtx(grid, tx, ty) {
    var g = grid.get;
    var c = {
      t: g(tx, ty), tx: tx, ty: ty,
      up: g(tx, ty - 1), dn: g(tx, ty + 1), lf: g(tx - 1, ty), rt: g(tx + 1, ty),
      ul: g(tx - 1, ty - 1), ur: g(tx + 1, ty - 1), dl: g(tx - 1, ty + 1), dr: g(tx + 1, ty + 1),
    };
    var B = TT.bldg;
    if (c.t === TT.road) {
      var sw = function (x, y) { if (g(x, y) !== TT.road) return false; return g(x, y - 1) === B || g(x, y + 1) === B || g(x - 1, y) === B || g(x + 1, y) === B; };
      c.side = sw(tx, ty);
      if (c.side) {
        c.curbUp = c.up === TT.road && !sw(tx, ty - 1); c.curbDn = c.dn === TT.road && !sw(tx, ty + 1);
        c.curbLf = c.lf === TT.road && !sw(tx - 1, ty); c.curbRt = c.rt === TT.road && !sw(tx + 1, ty);
      }
    } else if (c.t === B) {
      var open = function (t) { return WALKABLE[t] === true || t === TT.water || t === TT.rubble; };
      c.k = 0;
      for (var k = 1; k <= 3; k++) {
        var below = g(tx, ty + k);
        if (open(below)) { c.k = k; break; }
        if (below !== B) break;
      }
      var bid = Math.floor(tx / 7) * 131 + Math.floor(ty / 6);
      c.style = Math.floor(hash2(bid, 0, 310) * 3);
      c.tint = (hash2(bid, 1, 311) - 0.5) * 0.2;
      var sameB = function (x, y) { return g(x, y) === B && Math.floor(x / 7) === Math.floor(tx / 7) && Math.floor(y / 6) === Math.floor(ty / 6); };
      if (c.k > 0) {
        c.edgeL = !(g(tx - 1, ty) === B); c.edgeR = !(g(tx + 1, ty) === B);
        c.seamL = tx % 7 === 0 && g(tx - 1, ty) === B;
      } else {
        var isFac = function (x, y) { if (g(x, y) !== B) return false; for (var k2 = 1; k2 <= 3; k2++) { var bb = g(x, y + k2); if (open(bb)) return true; if (bb !== B) return false; } return false; };
        c.lipU = !sameB(tx, ty - 1) || isFac(tx, ty - 1);
        c.lipD = !sameB(tx, ty + 1) || isFac(tx, ty + 1);
        c.lipL = !sameB(tx - 1, ty) || isFac(tx - 1, ty);
        c.lipR = !sameB(tx + 1, ty) || isFac(tx + 1, ty);
        var ro = hash2(tx, ty, 320);
        c.roofObj = ro < 0.04 ? 1 : 0;                                                    // 煙突
        c.slate = hash2(bid, 2, 312) < 0.4;                                                 // 石板葺き（それ以外は瓦）
        c.slopeN = (ty % 6) < 3;
        c.ridge = (ty % 6) === 2;
      }
    } else if (c.t === TT.rubble) {
      var R = TT.rubble;
      c.rU = c.up === R; c.rD = c.dn === R; c.rL = c.lf === R; c.rR = c.rt === R;
      c.rebar = hash2(tx, ty, 330) < 0.2;
    } else if (c.t === TT.walk || c.t === TT.deck) {
      var voidish = function (t) { return t === TT.void || t === -1; };
      c.vU = voidish(c.up); c.vD = voidish(c.dn); c.vL = voidish(c.lf); c.vR = voidish(c.rt);
      c.wU = c.up === TT.walk; c.wD = c.dn === TT.walk; c.wL = c.lf === TT.walk; c.wR = c.rt === TT.walk;
    } else if (c.t === TT.well || c.t === TT.tree) {
      // 井戸や木の足元は、周りの地面と同じ素材で描く（土の広場なら土）
      var cnt = {};
      [c.up, c.dn, c.lf, c.rt, c.ul, c.ur, c.dl, c.dr].forEach(function (t) { if (GROUND[t]) cnt[t] = (cnt[t] || 0) + 1; });
      c.base = TT.grass;
      var bestN = 0;
      Object.keys(cnt).forEach(function (k) { if (cnt[k] > bestN) { bestN = cnt[k]; c.base = +k; } });
    } else if (c.t === TT.hut) {
      var H2 = TT.hut;
      c.hk = c.dn !== H2 ? 1 : (g(tx, ty + 2) !== H2 ? 2 : 0);
      c.hu = c.up !== H2; c.hl = c.lf !== H2; c.hr = c.rt !== H2;
    }
    return c;
  }

  function shadeTile(c, lx, ly, wx, wy, spec) {
    switch (c.t) {
      case TT.road: if (c.side) shSidewalk(c, lx, ly, wx, wy); else shRoad(c, lx, ly, wx, wy); return true;
      case TT.plaza: shPlaza(c, lx, ly, wx, wy); return true;
      case TT.lot: shLot(c, lx, ly, wx, wy); return true;
      case TT.grass: shGrass(c, lx, ly, wx, wy); return true;
      case TT.well: case TT.tree:
        if (c.base === TT.dirt) shDirt(c, lx, ly, wx, wy); else if (c.base === TT.lot) shLot(c, lx, ly, wx, wy); else shGrass(c, lx, ly, wx, wy);
        return true;
      case TT.dirt: shDirt(c, lx, ly, wx, wy); return true;
      case TT.water: shWater(c, lx, ly, wx, wy); return true;
      case TT.bldg: if (c.k > 0) shFacade(c, lx, ly, wx, wy); else shRoof(c, lx, ly, wx, wy); return true;
      case TT.rubble: shRubble(c, lx, ly, wx, wy, spec.rubbleBase); return true;
      case TT.walk: shWalk(c, lx, ly, wx, wy, false); return true;
      case TT.deck: shWalk(c, lx, ly, wx, wy, true); return true;
      case TT.hut: shHut(c, lx, ly, wx, wy); return true;
      case TT.fence: shFence(c, lx, ly, wx, wy); return true;
      default: return false;   // void：何も描かない
    }
  }

  // ── 地面に置かれた物（扉・井戸・枯れ木） ──
  function drawObjectHD(ctx, o) {
    var ox = o.x * TP, oy = o.y * TP;
    var P = function (c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); };
    if (o.kind === "door") {
      // 小屋の扉：幅34×高さ48（約1:1.4）。板戸・枠・横木・取っ手
      P("#1e160c", 7, 0, 34, 48);
      P("#3a2a18", 10, 4, 28, 42);
      for (var i = 0; i < 4; i++) { P(i % 2 ? "#4a3620" : "#523c24", 10 + i * 7, 4, 7, 42); P("#2a1e10", 10 + i * 7, 4, 1, 42); }
      P("#5a4428", 10, 11, 28, 3); P("#6a5236", 10, 11, 28, 1);
      P("#5a4428", 10, 33, 28, 3); P("#6a5236", 10, 33, 28, 1);
      P("#4a3824", 7, 4, 3, 42); P("#2a1e10", 38, 4, 3, 42);
      P("#6a5236", 5, 0, 38, 4); P("#8a6a40", 5, 0, 38, 1);
      P("#c8a060", 31, 23, 3, 3); P("#6a5028", 31, 26, 3, 1);
      P("#2a1e10", 7, 46, 34, 2);
    } else if (o.kind === "well") {
      // 石積みの井戸（2×2タイル）
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(ox + 52, oy + 84, 44, 12, 0, 0, Math.PI * 2); ctx.fill();
      for (var y = 0; y < 60; y++) for (var x = 0; x < 84; x++) {
        var ex = (x - 42) / 42, ey = (y - 24) / 26;
        var dd = ex * ex + ey * ey;
        if (dd > 1) continue;
        var inner = ((x - 42) / 32) * ((x - 42) / 32) + ((y - 20) / 16) * ((y - 20) / 16);
        var gx = ox + 6 + x, gy = oy + 26 + y;
        if (inner < 1) {
          pick(RP.water, 0.1 + (y < 12 ? 0.3 * (1 - y / 12) : 0) + (Math.abs(x - 52) < 5 && y > 18 && y < 22 ? 0.5 : 0), gx, gy);
        } else {
          var w = worley(gx, gy, 8, 601);
          var t = w.d2 - w.d1 < 1.3 ? 0.08 : 0.55 - ((gx - w.fx) + (gy - w.fy)) / 8 * 0.3 + (y > 30 ? -0.2 : 0.1);
          pick(RP.stone, t, gx, gy);
        }
        ctx.fillStyle = "rgb(" + o4[0] + "," + o4[1] + "," + o4[2] + ")";
        ctx.fillRect(gx, gy, 1, 1);
      }
      // 屋根の梁と滑車
      P("#2a1e10", 10, -14, 7, 58); P("#4a3824", 11, -14, 5, 58); P("#5e4830", 11, -14, 2, 58);
      P("#2a1e10", 79, -14, 7, 58); P("#4a3824", 80, -14, 5, 58); P("#5e4830", 80, -14, 2, 58);
      P("#2a1e10", 4, -22, 88, 10); P("#6a5236", 5, -21, 86, 7); P("#8a6a40", 5, -21, 86, 2);
      P("#3a3a36", 44, -12, 8, 8); P("#6a6a60", 45, -11, 3, 3);
      P("#8a8478", 47, -4, 1, 30);
      P("#3a2c18", 41, 24, 13, 11); P("#5a4428", 42, 25, 11, 3); P("#6a5236", 42, 28, 2, 7);
    } else if (o.kind === "gate") {
      // 閉ざされた門：左右の太い門柱、上の梁、縦板の門扉2枚と横木・鉄の帯
      var gw = o.w * TP;
      P("#140e08", 0, -66, 14, 114); P("#2e2216", 2, -64, 10, 112); P("#3e2e1e", 3, -64, 3, 112);
      P("#140e08", gw - 14, -66, 14, 114); P("#2a1e14", gw - 12, -64, 10, 112); P("#3a2a1a", gw - 11, -64, 3, 112);
      P("#140e08", -6, -74, gw + 12, 12); P("#4a3824", -4, -72, gw + 8, 8); P("#6a5236", -4, -72, gw + 8, 2);
      for (var gx = 14; gx < gw - 14; gx += 9) {
        var sh = ((gx / 9) | 0) % 3;
        P("#1e160c", gx, -60, 9, 108);
        P(sh === 0 ? "#4a3620" : sh === 1 ? "#523c24" : "#44321c", gx + 1, -60, 8, 108);
        P("#5e4830", gx + 1, -60, 2, 108);
      }
      P("#140e08", gw / 2 - 1, -60, 3, 108);
      [-44, -6, 30].forEach(function (by) { P("#2a1e10", 14, by, gw - 28, 7); P("#5a4428", 14, by, gw - 28, 2); });
      [-40, -2, 34].forEach(function (by) { for (var bx = 20; bx < gw - 20; bx += 22) { P("#6a6a66", bx, by, 3, 3); P("#2a2a28", bx + 1, by + 2, 2, 1); } });
      P("#3a3a36", gw / 2 - 12, 6, 24, 6); P("#7a7a74", gw / 2 - 12, 6, 24, 1);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(ox, oy + 48, gw, 8);
    } else if (o.kind === "tree") {
      // 枯れ木：幹と、左右に張り出した細い枝
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(ox + 28, oy + 42, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
      var bark = function (x, y, w, h) { P("#1e160e", x, y, w, h); if (w > 2) P("#3a2c1c", x + 1, y, Math.max(1, w - 3), h); if (w > 4) P("#4e3c28", x + 1, y, 1, h); };
      bark(18, -40, 12, 84);
      P("#2a2014", 16, 38, 16, 6);
      var br = [[29, -30, 16, 4, 1], [42, -40, 4, 12, 0], [8, -20, 11, 4, 1], [5, -32, 4, 14, 0], [22, -62, 4, 24, 0], [26, -54, 12, 3, 1], [36, -62, 3, 10, 0], [12, -50, 10, 3, 1], [11, -58, 3, 9, 0], [29, -12, 10, 3, 1]];
      br.forEach(function (b) { bark(b[0], b[1], b[2], b[3]); });
    }
  }

  // ひび割れ：タイルごとに乱数で、短い折れ線を1本（ときどき枝分かれ）引く。
  // 暗い割れ目の右下に明るい縁を付けて、左上からの光で凹んで見せる。
  // 隣のタイルから伸びてくるひびも拾うため、塊の周り1タイル分も調べる。
  var CRACK_ON = {}; CRACK_ON[TT.road] = 0.05; CRACK_ON[TT.plaza] = 0.12; CRACK_ON[TT.lot] = 0.08; CRACK_ON[TT.walk] = 0.16;
  function paintCracks(D, grid, cx, cy) {
    var bx = cx * CHUNK_P, by = cy * CHUNK_P;
    var mark = function (x, y, f) {
      var lx = x - bx, ly = y - by;
      if (lx < 0 || ly < 0 || lx >= CHUNK_P || ly >= CHUNK_P) return;
      var t = grid.get(Math.floor(x / TP), Math.floor(y / TP));
      if (!CRACK_ON[t]) return;
      var i = (ly * CHUNK_P + lx) * 4;
      D[i] *= f; D[i + 1] *= f; D[i + 2] *= f;
      if (f > 1) { D[i] = Math.min(255, D[i]); D[i + 1] = Math.min(255, D[i + 1]); D[i + 2] = Math.min(255, D[i + 2]); }
    };
    var line = function (x, y, ang, len, seed) {
      for (var k = 0; k < len; k++) {
        ang += (hash2(seed, k, 911) - 0.5) * 0.9;
        x += Math.cos(ang); y += Math.sin(ang);
        var ix = Math.round(x), iy = Math.round(y);
        mark(ix, iy, 0.45); mark(ix + 1, iy + 1, 1.18);
        if (k > 4 && k < len - 6 && hash2(seed, k, 912) < 0.05) line(x, y, ang + (hash2(seed, k, 913) < 0.5 ? 0.9 : -0.9), Math.floor(len * 0.4), seed * 31 + k);
      }
    };
    for (var ty = cy * CHUNK_T - 1; ty <= (cy + 1) * CHUNK_T; ty++) for (var tx = cx * CHUNK_T - 1; tx <= (cx + 1) * CHUNK_T; tx++) {
      var t = grid.get(tx, ty), dens = CRACK_ON[t];
      if (!dens || hash2(tx, ty, 901) >= dens) continue;
      var seed = tx * 977 + ty * 131;
      line(tx * TP + 6 + hash2(tx, ty, 902) * 36, ty * TP + 6 + hash2(tx, ty, 903) * 36, hash2(tx, ty, 904) * 6.283, 16 + Math.floor(hash2(tx, ty, 905) * 30), seed);
    }
  }

  // ── 地形を塊ごとに描き溜める ──
  function TerrainBundle(data) {
    var spec = data.tilemap;
    var protect = (data.zones || []).concat([data.start]).concat(Object.keys(data.entryPoints || {}).map(function (k) { return data.entryPoints[k]; }))
      .map(function (p) { var q = toPx(p); return { x: q.x / TILE, y: q.y / TILE }; });
    this.spec = spec;
    this.grid = buildTileGrid(spec, protect);
    this.w = this.grid.cols * TILE;
    this.h = this.grid.rows * TILE;
    this.lower = data.underlay ? getTileBundle(data.underlay) : null;
    // 瓦礫の山は、タイルの並びそのままだと四角く見えるので、周り3×3タイルの
    // 平均でぼかした「瓦礫の濃さ」を境目の判定に使い、丸い山にする
    var g = this.grid, den = new Float32Array(g.cols * g.rows);
    for (var y = 0; y < g.rows; y++) for (var x = 0; x < g.cols; x++) {
      var n = 0;
      for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) if (g.get(x + i, y + j) === TT.rubble) n++;
      den[y * g.cols + x] = n / 9;
    }
    this.rubbleDen = function (x, y) { return (x < 0 || y < 0 || x >= g.cols || y >= g.rows) ? 0 : den[y * g.cols + x]; };
    this.chunks = {};
    this.order = [];
  }

  // 塊は、描き上がるまで何フレームかに分けて少しずつ描く（入った瞬間に
  // 画面が固まらないように）。描き上がっていない所には、タイルの平均色を
  // ぼかした仮の絵を出しておく。
  TerrainBundle.prototype.entry = function (cx, cy) {
    var key = cx + "," + cy;
    var e = this.chunks[key];
    if (e) {
      var i = this.order.indexOf(key);
      if (i >= 0) { this.order.splice(i, 1); this.order.push(key); }
      return e;
    }
    e = this.chunks[key] = { cx: cx, cy: cy, cv: null, img: null, next: 0, done: false, cache: {} };
    this.order.push(key);
    var self = this;
    while (this.order.length > CHUNK_KEEP) {
      var old = this.order[0];
      if (this._wanted && this._wanted[old]) break;
      this.order.shift(); delete self.chunks[old];
    }
    return e;
  };

  // 塊eを、deadline（performance.now()の値）まで描き進める。描き上がったらtrue
  TerrainBundle.prototype.work = function (e, deadline) {
    if (e.done) return true;
    var grid = this.grid, spec = this.spec;
    var lowerD = null;
    if (this.lower) {
      var le = this.lower.entry(e.cx, e.cy);
      if (!le.done && !this.lower.work(le, deadline)) return false;
      if (!e.lowerD) e.lowerD = le.cv.getContext("2d").getImageData(0, 0, CHUNK_P, CHUNK_P).data;
      lowerD = e.lowerD;
    }
    if (!e.cv) { e.cv = makeCanvas(CHUNK_P, CHUNK_P); e.img = e.cv.getContext("2d").createImageData(CHUNK_P, CHUNK_P); }
    var D = e.img.data, cx = e.cx, cy = e.cy;
    var N = noiseTex();
    var ctxCache = e.cache;
    var getC = function (tx, ty) { var k = (ty + 2) * 4096 + tx + 2; return ctxCache[k] || (ctxCache[k] = tileCtx(grid, tx, ty)); };
    var walkable = function (tx, ty) { return WALKABLE[grid.get(tx, ty)] === true; };
    while (e.next < CHUNK_T * CHUNK_T) {
      if (performance.now() > deadline) return false;
      var ty0 = Math.floor(e.next / CHUNK_T), tx0 = e.next % CHUNK_T;
      e.next++;
      var tx = cx * CHUNK_T + tx0, ty = cy * CHUNK_T + ty0;
      if (tx >= grid.cols || ty >= grid.rows) continue;
      var c = getC(tx, ty);
      // 地面（と瓦礫）の境目は、タイルの角ばった形のままにせず、周りの
      // タイル中心4点から素材の割合を補間して、なめらかな曲線で分ける。
      // 当たり判定はタイルのままなので、壁や建物の形はここでは変えない。
      var smooth = SOFT[c.t] && [c.up, c.dn, c.lf, c.rt, c.ul, c.ur, c.dl, c.dr].some(function (t) { return SOFT[t] && t !== c.t; });
      for (var ly = 0; ly < TP; ly++) for (var lx = 0; lx < TP; lx++) {
        var wx = tx * TP + lx, wy = ty * TP + ly;
        var use = c, rubbleNear = 0;
        if (smooth) {
          var fx = wx / TP - 0.5, fy = wy / TP - 0.5;
          var i0 = Math.floor(fx), j0 = Math.floor(fy), ax = fx - i0, ay = fy - j0;
          // 周り4点のタイル中心から、素材ごとの割合を出す（配列を作らずに済ませる）
          var t00 = grid.get(i0, j0), t10 = grid.get(i0 + 1, j0), t01 = grid.get(i0, j0 + 1), t11 = grid.get(i0 + 1, j0 + 1);
          var w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
          if (!SOFT[t00]) w00 = 0; if (!SOFT[t10]) w10 = 0; if (!SOFT[t01]) w01 = 0; if (!SOFT[t11]) w11 = 0;
          var tot = w00 + w10 + w01 + w11;
          var best = c.t, bestW = -9, bi = tx, bj = ty;
          for (var q = 0; q < 4; q++) {
            var tq = q === 0 ? t00 : q === 1 ? t10 : q === 2 ? t01 : t11;
            if (!SOFT[tq] || tq === TT.rubble) continue;
            var wv = ((t00 === tq ? w00 : 0) + (t10 === tq ? w10 : 0) + (t01 === tq ? w01 : 0) + (t11 === tq ? w11 : 0)) / tot
              + (nz(N.a, wx * 2 + tq * 37, wy * 2 + tq * 53) - 0.5) * 0.45;
            if (wv > bestW) { bestW = wv; best = tq; bi = i0 + (q & 1); bj = j0 + (q >> 1); }
          }
          // 瓦礫かどうかは、ぼかした濃さで決める（地面の候補が無い所は瓦礫のまま）
          var rd = this.rubbleDen;
          var rwd = rd(i0, j0) * (1 - ax) * (1 - ay) + rd(i0 + 1, j0) * ax * (1 - ay) + rd(i0, j0 + 1) * (1 - ax) * ay + rd(i0 + 1, j0 + 1) * ax * ay;
          var R = TT.rubble;
          var rwi = (t00 === R ? (1 - ax) * (1 - ay) : 0) + (t10 === R ? ax * (1 - ay) : 0) + (t01 === R ? (1 - ax) * ay : 0) + (t11 === R ? ax * ay : 0);
          // 瓦礫タイルそのものの位置（必ず山が見える）と、ぼかした濃さ（角が丸くなる）を半々に混ぜる
          var rw = 0.5 * rwi + 0.5 * Math.min(1, rwd * 2);
          rw += (nz(N.a, wx * 2 + 311, wy * 2 + 97) - 0.5) * 0.3 + (nz(N.c, wx + 311, wy + 97) - 0.5) * 0.25;
          rubbleNear = rw;
          if (rw > 0.42 || bestW === -9) { best = TT.rubble; bi = -1; }
          if (best === TT.rubble && c.t !== TT.rubble) {
            for (var q3 = 0; q3 < 4; q3++) {
              var tr = q3 === 0 ? t00 : q3 === 1 ? t10 : q3 === 2 ? t01 : t11;
              if (tr === TT.rubble) { bi = i0 + (q3 & 1); bj = j0 + (q3 >> 1); break; }
            }
            if (bi === -1) { best = c.t; bi = tx; bj = ty; }   // 近くに瓦礫のタイルが無ければ地面のまま
          }
          if (best === TT.rubble && c.t === TT.rubble) { bi = tx; bj = ty; }
          if (best !== c.t && best !== TT.rubble) {
            // その素材を持つ一番近いタイル（4点のうち、この画素に近い側を優先）
            var ni = ax < 0.5 ? i0 : i0 + 1, nj = ay < 0.5 ? j0 : j0 + 1;
            if (grid.get(ni, nj) === best) { bi = ni; bj = nj; }
            use = getC(bi, bj);
          } else if (best === TT.rubble && c.t !== TT.rubble) use = getC(bi, bj);
        }
        var di = ((ty0 * TP + ly) * CHUNK_P + tx0 * TP + lx) * 4;
        if (shadeTile(use, wx - use.tx * TP, wy - use.ty * TP, wx, wy, spec)) {
          // 瓦礫の山のすぐ脇の地面は、山の影で暗くする
          if (use.t !== TT.rubble && rubbleNear > 0.22) { var f = 1 - Math.min(0.35, (rubbleNear - 0.22) * 1.6); o4[0] *= f; o4[1] *= f; o4[2] *= f; }
          D[di] = o4[0]; D[di + 1] = o4[1]; D[di + 2] = o4[2]; D[di + 3] = 255;
          continue;
        }
        // 上の層の、足場の無い所：下の層を暗く沈めて見せる
        if (lowerD) {
          var r = lowerD[di] * 0.34 + 3, g = lowerD[di + 1] * 0.37 + 5, b = lowerD[di + 2] * 0.46 + 10;
          // 足場の影（左上から光が当たるので、右下へずれて落ちる）
          var sx = Math.floor((wx - 30) / TP), sy = Math.floor((wy - 54) / TP);
          if (walkable(sx, sy)) { r *= 0.5; g *= 0.5; b *= 0.55; }
          // 城壁の外壁：歩廊の南の縁から下へ、石積みの壁面が地面まで続く（下ほど暗い）
          for (var k = 0; k <= 2; k++) {
            var pty = ty - k;
            if (walkable(tx, pty) && !walkable(tx, pty + 1)) {
              var py = wy - (pty + 1) * TP;
              if (py >= 0 && py < 78) {
                masonry(wx, wy, 0.5 - py / 78 * 0.35, 0);
                r = o4[0] * 0.8; g = o4[1] * 0.8; b = o4[2] * 0.85;
              }
              break;
            }
          }
          D[di] = r; D[di + 1] = g; D[di + 2] = b; D[di + 3] = 255;
        } else {
          D[di] = 10; D[di + 1] = 8; D[di + 2] = 6; D[di + 3] = 255;
        }
      }
    }
    paintCracks(D, grid, cx, cy);
    var ctx = e.cv.getContext("2d");
    ctx.putImageData(e.img, 0, 0);
    // 地面に置かれた物は、この塊にかかる分だけ描く（はみ出す木の枝も隣の塊に描かれる）
    ctx.save();
    ctx.translate(-cx * CHUNK_P, -cy * CHUNK_P);
    grid.objects.forEach(function (o) {
      var ox = o.x * TP, oy = o.y * TP;
      var ow = ((o.w || 2) + 1) * TP;
      if (ox + ow < cx * CHUNK_P || ox - TP > (cx + 1) * CHUNK_P || oy + TP * 3 < cy * CHUNK_P || oy - TP * 2 > (cy + 1) * CHUNK_P) return;
      drawObjectHD(ctx, o);
    });
    ctx.restore();
    e.img = null; e.cache = null; e.lowerD = null;
    e.done = true;
    return true;
  };

  // 描き上がる前に見せる仮の絵（1タイル＝1画素の平均色を、ぼかして引き伸ばす）
  var PREVIEW_COLOR = {};
  PREVIEW_COLOR[TT.road] = "#443e35"; PREVIEW_COLOR[TT.plaza] = "#4e4940"; PREVIEW_COLOR[TT.lot] = "#39332a";
  PREVIEW_COLOR[TT.grass] = "#30351d"; PREVIEW_COLOR[TT.dirt] = "#4a3c2a"; PREVIEW_COLOR[TT.water] = "#142329";
  PREVIEW_COLOR[TT.bldg] = "#3a2a20"; PREVIEW_COLOR[TT.rubble] = "#3e362d"; PREVIEW_COLOR[TT.walk] = "#5e564a";
  PREVIEW_COLOR[TT.deck] = "#5d5244"; PREVIEW_COLOR[TT.hut] = "#5a4628"; PREVIEW_COLOR[TT.fence] = "#3a3524";
  PREVIEW_COLOR[TT.well] = "#30351d"; PREVIEW_COLOR[TT.tree] = "#30351d"; PREVIEW_COLOR[TT.void] = "#0c0e12";
  TerrainBundle.prototype.preview = function () {
    if (this._preview) return this._preview;
    var g = this.grid, cv = makeCanvas(g.cols, g.rows), ctx = cv.getContext("2d");
    for (var y = 0; y < g.rows; y++) for (var x = 0; x < g.cols; x++) { ctx.fillStyle = PREVIEW_COLOR[g.get(x, y)] || "#0a0806"; ctx.fillRect(x, y, 1, 1); }
    return (this._preview = cv);
  };

  // 窓（地図単位）に映る分の地形を貼る。描き上がっていない塊は仮の絵で埋める
  TerrainBundle.prototype.blit = function (ctx, cam) {
    var x0 = cam.x * RES, y0 = cam.y * RES, w = cam.vw * RES, h = cam.vh * RES;
    var wanted = {}, missing = false;
    for (var cy = Math.floor(y0 / CHUNK_P); cy * CHUNK_P < y0 + h; cy++) for (var cx = Math.floor(x0 / CHUNK_P); cx * CHUNK_P < x0 + w; cx++) {
      if (cx * CHUNK_T >= this.grid.cols || cy * CHUNK_T >= this.grid.rows) continue;
      wanted[cx + "," + cy] = true;
      var e = this.entry(cx, cy);
      if (e.done) { ctx.drawImage(e.cv, cx * CHUNK_P - x0, cy * CHUNK_P - y0); continue; }
      missing = true;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.preview(), cx * CHUNK_T, cy * CHUNK_T, CHUNK_T, CHUNK_T, cx * CHUNK_P - x0, cy * CHUNK_P - y0, CHUNK_P, CHUNK_P);
      ctx.imageSmoothingEnabled = false;
    }
    this._wanted = wanted;
    this._visible = Object.keys(wanted);
    return missing;
  };

  // 見えている塊を優先して、残りの時間で周りの塊も先に描いておく。
  // 見えている塊が1つでも描き上がったら true（描き直しが要る）
  TerrainBundle.prototype.pump = function (budgetMs) {
    var deadline = performance.now() + budgetMs;
    var changed = false, self = this;
    var vis = this._visible || [];
    for (var i = 0; i < vis.length; i++) {
      var e = this.entry(+vis[i].split(",")[0], +vis[i].split(",")[1]);
      if (e.done) continue;
      if (this.work(e, deadline)) changed = true;
      if (performance.now() > deadline) return { changed: changed, pending: true, ring: true };
    }
    // 周り一回り
    var ring = [];
    vis.forEach(function (k) {
      var p = k.split(","), x = +p[0], y = +p[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx * CHUNK_T >= self.grid.cols || ny * CHUNK_T >= self.grid.rows) return;
        var nk = nx + "," + ny;
        if (!self._wanted[nk] && ring.indexOf(nk) < 0) ring.push(nk);
      });
    });
    var ringPending = false;
    for (var j = 0; j < ring.length; j++) {
      var q = ring[j].split(","), en = this.entry(+q[0], +q[1]);
      if (en.done) continue;
      ringPending = true;
      if (!this.work(en, deadline)) return { changed: changed, pending: false, ring: true };
    }
    return { changed: changed, pending: false, ring: ringPending };
  };

  // 地形の設計図ごとに1回だけ作って使い回す
  // （階段で層を行き来したり、ノードに入り直したりしても作り直さない）。
  function getTileBundle(data) {
    var spec = data.tilemap;
    if (!spec._bundle) spec._bundle = new TerrainBundle(data);
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
  var GUARD_PAL = { k: "#1a1410", m: "#6a6a70", M: "#9a9aa0", s: "#d8b088", e: "#1a1410", a: "#4a5a6a", A: "#6a7a8a", b: "#5a4020", p: "#3a3a44", f: "#3a2c1c", t: "#8a6a40", T: "#b8b8c0" };
  var GUARD = [
    "..........T.", "....kkkk..t.", "...kmmmmk.t.", "..kmMmmmmkt.", "..kmssssmkt.", "..ksesseskt.", "...kssssk.t.",
    "..kaaaaaakt.", ".kaAaaaaAst.", ".kaaaaaaakt.", ".kbbbbbbbkt.", "..kppppppkt.", "..kppkkppkt.", "..kpk..kpkt.",
    "..kpk..kpkt.", "..kfk..kfkt.", "..kkk..kkkt.",
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
      guard: spriteCanvas(GUARD, GUARD_PAL),
      chest: spriteCanvas(CHEST, CHEST_PAL),
      signR: spriteCanvas(SIGN_RIGHT, SIGN_PAL),
      signL: spriteCanvas(SIGN_RIGHT, SIGN_PAL, true),
    };
    // 階段は地形と同じ細かさ（1タイル＝48画素）で描く。2×2タイル分。
    var S = 2 * TP;
    var up = makeCanvas(S, S), u = up.getContext("2d");
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      if (x < 12 || x >= S - 12) {
        // 両脇の石積みの袖壁
        var w = worley(x + 500, y + 500, 10, 701);
        pick(RP.stone, w.d2 - w.d1 < 1.3 ? 0.05 : 0.6 - ((x + 500 - w.fx) + (y + 500 - w.fy)) / 10 * 0.3 - (x >= S - 12 ? 0.2 : 0), x, y);
      } else {
        // 奥（上）へ向かって段が上がる。手前の段ほど明るく大きい
        var st = Math.floor((S - 1 - y) / 13), sy = (S - 1 - y) - st * 13;
        var t = sy >= 9 ? 0.85 - st * 0.04 : 0.42 - (8 - sy) * 0.02 - st * 0.03;
        if (x < 15) t -= 0.2;
        pick(RP.stone, t + (hash2(x, y, 702) - 0.5) * 0.12, x, y);
      }
      u.fillStyle = "rgb(" + o4[0] + "," + o4[1] + "," + o4[2] + ")";
      u.fillRect(x, y, 1, 1);
    }
    u.fillStyle = "#e8dcc8";
    for (var i = 0; i < 5; i++) u.fillRect(S / 2 - i, 3 + i, i * 2 + 1, 1);
    zoneSprites.stairsUp = up;
    // 下り階段：足場に開いた口から、段が暗がりへ下りていく
    var dn = makeCanvas(S, S), d = dn.getContext("2d");
    for (var y2 = 0; y2 < S; y2++) for (var x2 = 0; x2 < S; x2++) {
      var t2;
      if (y2 < 6 || x2 < 6 || x2 >= S - 6) t2 = (y2 < 2 || x2 < 2 || x2 >= S - 2) ? 0.95 : 0.55;
      else {
        var st2 = Math.floor((y2 - 6) / 15), sy2 = (y2 - 6) - st2 * 15;
        t2 = (sy2 < 4 ? 0.7 : 0.4) - st2 * 0.13;
        if (x2 < 12) t2 -= 0.15;
      }
      pick(RP.stone, Math.max(0, t2), x2, y2);
      d.fillStyle = "rgb(" + o4[0] + "," + o4[1] + "," + o4[2] + ")";
      d.fillRect(x2, y2, 1, 1);
    }
    d.fillStyle = "#e8dcc8";
    for (var j = 0; j < 5; j++) d.fillRect(S / 2 - (4 - j), S - 12 + j, (4 - j) * 2 + 1, 1);
    zoneSprites.stairsDown = dn;
    return zoneSprites;
  }

  // 危険域：地面に赤い網目（ディザ）を掛けて、踏み込む範囲そのものを示す
  function makeDangerOverlay(r0, encounter) {
    // 地形と同じ細かさ（RES倍）で作り、描く時は地図単位の大きさに合わせて貼る
    var r = r0 * RES;
    var size = Math.ceil(r * 2) + 2;
    var c = makeCanvas(size, size), ctx = c.getContext("2d");
    var cx = size / 2, cy = size / 2;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      if (d > r - 2.5) { if ((x + y) % 4 < 2) px(ctx, encounter ? "#a05a28" : "#c04a24", x, y); continue; }
      if ((x + y * 3) % 7 === 0 && (x - y) % 3 !== 0) px(ctx, encounter ? "rgba(200,136,80,0.45)" : "rgba(224,96,44,0.55)", x, y);
    }
    if (encounter) {
      [[-6, -3], [4, 4], [-1, 9]].forEach(function (p) {
        var fx = Math.round(cx + p[0] * RES), fy = Math.round(cy + p[1] * RES);
        // 足跡：肉球と4本の指
        px(ctx, "#c88850", fx, fy, 7, 6); px(ctx, "#a06a38", fx, fy + 5, 7, 1);
        [[-2, -4], [1, -6], [5, -6], [8, -4]].forEach(function (t) { px(ctx, "#c88850", fx + t[0], fy + t[1], 3, 3); });
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, cam.vw * RES, cam.vh * RES);
    this.map.blit(ctx, cam);
    this.schedulePump();
    // ここから先は地図の単位で描き、描画側で3倍に拡大する
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var sprites = getZoneSprites();
    var self = this;
    this.zones.forEach(function (z) {
      if (self.taken[z.id]) return;
      var sx = Math.round(z.x - cam.x), sy = Math.round(z.y - cam.y);
      if (sx < -z.r - 40 || sy < -z.r - 40 || sx > cam.vw + z.r + 40 || sy > cam.vh + z.r + 40) return;
      if (z.kind === "danger" || z.kind === "encounter") {
        var ov = self._dangerOverlays[z.id] || (self._dangerOverlays[z.id] = makeDangerOverlay(z.r, z.kind === "encounter"));
        ctx.drawImage(ov, sx - ov.width / 2 / RES, sy - ov.height / 2 / RES, ov.width / RES, ov.height / RES);
      } else if (z.kind === "chest") {
        px(ctx, "rgba(0,0,0,0.35)", sx - 7, sy + 4, 15, 3);
        ctx.drawImage(sprites.chest, sx - 7, sy - 6);
      } else if (z.kind === "stairs") {
        ctx.drawImage(z.toLayer === "upper" ? sprites.stairsUp : sprites.stairsDown, sx - 16, sy - 16, 32, 32);
      } else if (z.kind === "exit") {
        var sign = z.dir === "w" ? sprites.signL : sprites.signR;
        px(ctx, "rgba(0,0,0,0.35)", sx - 5, sy + 1, 11, 3);
        ctx.drawImage(sign, sx - 7, sy - 13);
        if (z.dir === "n") { px(ctx, "#e8dcc8", sx - 1, sy - 20, 2, 1); px(ctx, "#e8dcc8", sx - 2, sy - 19, 4, 1); px(ctx, "#e8dcc8", sx - 3, sy - 18, 6, 1); }
      } else if (z.kind === "talk") {
        px(ctx, "rgba(0,0,0,0.35)", sx - 5, sy, 11, 3);
        if (z.sprite === "guard") ctx.drawImage(sprites.guard, sx - 6, sy - 16);
        else ctx.drawImage(sprites.elder, sx - 6, sy - 15);
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

  // 地形の塊を、1フレームあたり数ミリ秒ずつ描き進める。見えている所が
  // 描き上がるたびに画面を描き直し、その後は周りの塊を先回りして描いておく。
  FreeArea.prototype.schedulePump = function () {
    if (this._pumpRaf) return;
    var self = this;
    var step = function () {
      self._pumpRaf = null;
      if (!self._canvasEl || !document.body.contains(self._canvasEl)) return;
      var r = self.map.pump(8);
      if (r.changed) { self._pumpRaf = -1; self.draw(); self._pumpRaf = null; }
      if (r.pending || r.ring) self._pumpRaf = requestAnimationFrame(step);
    };
    this._pumpRaf = requestAnimationFrame(step);
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
    cv.width = cam.vw * RES;
    cv.height = cam.vh * RES;
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

    appendMenuButton(wrap, this.cb, function () { self.detachKeyboard(); });

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

  return { start: start, startWorldMap: startWorldMap, createWorldMap: createWorldMap, startFreeArea: startFreeArea };
})();
