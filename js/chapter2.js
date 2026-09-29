// 第二章「ツェルフの目的に同行」の本筋①〜⑦（攻略チャート第二章／PLAN.md §7.5-2c 準拠）。
// 世界（広域マップ・廃区画・外縁・メニュー・戦闘）は第一章のものをそのまま使い、
// 第一章から渡される ctx を通して、この章の場所（枯野・灯の集落・灰の谷・アーカイブ）を足す。
window.RPG = window.RPG || {};

RPG.Chapter2 = (function () {
  function create(ctx) {
    var Story = RPG.Story, Explore = RPG.Explore, Data = RPG.Data;
    function app() { return ctx.app(); }
    function game() { return ctx.game(); }
    function F() { var g = game(); g.flags = g.flags || {}; return g.flags; }
    var say = ctx.say;

    // ── 真相の断片と好感度 ──
    // 真相（PLAN §7.5-4b）：拾った断片を flags.truths に記録する。メニューの「真相」に並ぶ
    function gainTruth(id) {
      var t = F().truths = F().truths || {};
      if (t[id]) return [];
      t[id] = true;
      return [{ kind: "narration", emph: true, text: "（真相の断片を手に入れた）" }];
    }
    // ツェルフの好感度（PLAN §7.5-4h：−10〜+20・初期0。本筋の進行には絡まない）。
    // 一つの選択で動く量は資料に数値がないため、仮に±1とする
    function affinity(d) {
      var v = (F().affinity || 0) + d;
      F().affinity = Math.max(-10, Math.min(20, v));
    }
    // ⑤でツェルフが「……無事か」と漏らす好感度（資料は「一定以上」。仮に2）
    var DERE_AT = 2;
    function tz() { return ctx.tzelfName(); }

    // ── この章の状態（セーブに含める） ──
    var st = {
      taken: { kareno: {}, tomoshi: {}, valley: {} },
      valleyDefeated: {},
      archiveFloor: "outer",
      archiveVisited: { outer: {}, inner: {} },
      archiveTaken: { outer: {}, inner: {} },
    };
    var area = null, dungeon = null, placeKind = null;

    // ── 広域マップ：第二章で行ける場所（PLAN「ノード間距離」「章ごとの解放範囲」） ──
    // 資料の距離のうち、廃区画の中を歩く分を除いた残りを、エリアの出口で消費する
    var NODES = [
      { id: "kareno", name: "枯野", x: 440, y: 205, kind: "settlement" },
      { id: "tomoshi", name: "灯の集落", x: 540, y: 160, kind: "settlement" },
      { id: "hainotani", name: "灰の谷", x: 590, y: 85, kind: "danger", fastTravel: false },
      { id: "archive", name: "アーカイブ", x: 500, y: 40, kind: "shrine" },
    ];
    var EDGES = [
      { from: "hairegion", to: "kareno", steps: 60, encounterRate: 0 },
      { from: "kareno", to: "tomoshi", steps: 40, encounterRate: 0 },
      { from: "tomoshi", to: "hainotani", steps: 55, encounterRate: 0 },
      { from: "hainotani", to: "archive", steps: 60, encounterRate: 0 },
    ];
    function extendWorld(world) {
      if (world._ch2) return;
      world._ch2 = true;
      world.width = 660;
      NODES.forEach(function (n) { world.nodes.push(n); });
      EDGES.forEach(function (e) { world.edges.push(e); });
    }
    var IDS = { kareno: true, tomoshi: true, hainotani: true, archive: true };
    var KINDS = { kareno: "枯野（狩猟隊の拠点）", tomoshi: "灯の集落", valley: "灰の谷", archive: null };

    // ── 枯野：狩猟隊の拠点（PLAN §7.5-4l0）。かつて灰色竜が留まり、命を吸い尽くして去った跡地 ──
    // 隊長室（休息・シャルラ）／枯野の野（歩ける屋外）。物資庫（購入）は雑貨屋と一緒に次以降
    var KARENO_AREA = {
      label: "枯野（狩猟隊の拠点）",
      safe: true,
      start: { tx: 3, ty: 15 },
      entryPoints: { hairegion: { tx: 3, ty: 15 }, tomoshi: { tx: 41, ty: 14 } },
      tilemap: {
        cols: 44, rows: 30, seed: 31, rubbleBase: "grass",
        // 枯れ色：色を抜き、明るい所を黄ばませる
        grade: { sat: 0.28, shadow: [-2, -2, 3], light: [14, 9, -6] },
        ops: [
          { op: "fill", t: "grass" },
          { op: "disc", x: 8, y: 6, r: 5, t: "dirt" }, { op: "disc", x: 36, y: 24, r: 5, t: "dirt" }, { op: "disc", x: 6, y: 25, r: 4, t: "dirt" },
          { op: "line", pts: [[-2, 15], [12, 15], [22, 14], [34, 14], [46, 14]], w: 3, t: "dirt" },
          { op: "disc", x: 22, y: 13, r: 3.5, t: "dirt" },
          { op: "line", pts: [[22, 13], [22, 10.5]], w: 3, t: "dirt" },
          // 野営を囲う木柵（西と東に出入り口）
          { op: "rect", x: 12, y: 3, w: 23, h: 1, t: "fence" },
          { op: "rect", x: 12, y: 21, w: 23, h: 1, t: "fence" },
          { op: "rect", x: 12, y: 3, w: 1, h: 19, t: "fence" },
          { op: "rect", x: 34, y: 3, w: 1, h: 19, t: "fence" },
          { op: "rect", x: 12, y: 13, w: 1, h: 4, t: "dirt" },
          { op: "rect", x: 34, y: 12, w: 1, h: 4, t: "dirt" },
          // 隊長室（大きな天幕）・物資庫・隊員の天幕
          { op: "hut", x: 18, y: 5, w: 8, h: 5 },
          { op: "hut", x: 28, y: 5, w: 5, h: 4 },
          { op: "hut", x: 14, y: 5, w: 3, h: 4 },
          { op: "hut", x: 15, y: 17, w: 5, h: 3 },
          { op: "hut", x: 26, y: 17, w: 5, h: 3 },
          { op: "well", x: 22, y: 15 },
          { op: "disc", x: 40, y: 5, r: 1.4, t: "rubble" }, { op: "disc", x: 4, y: 20, r: 1.2, t: "rubble" },
          { op: "tree", x: 5, y: 9 }, { op: "tree", x: 39, y: 20 }, { op: "tree", x: 9, y: 27 }, { op: "tree", x: 30, y: 27 }, { op: "tree", x: 41, y: 8 },
        ],
      },
      zones: [
        { id: "captain", kind: "talk", sprite: "none", tx: 22, ty: 11.2, r: 16, label: "隊長室" },
        { id: "hunter1", kind: "talk", sprite: "hunter", tx: 17, ty: 13.4, r: 14, label: "狩猟隊の隊員" },
        { id: "exit_hairegion", kind: "exit", to: "hairegion", tx: 1.2, ty: 15, r: 22, dir: "w", steps: 60, label: "廃区画方面へ" },
        { id: "exit_tomoshi", kind: "exit", to: "tomoshi", tx: 42.8, ty: 14, r: 22, dir: "e", steps: 40, label: "灯の集落へ" },
      ],
    };

    // ── 灯の集落：生き残りの集落（PLAN §7.5-4k5）。宿／集会所（碑文・古老）／集落の通り ──
    var TOMOSHI_AREA = {
      label: "灯の集落",
      safe: true,
      start: { tx: 3, ty: 18 },
      entryPoints: { kareno: { tx: 3, ty: 18 }, hainotani: { tx: 44, ty: 8 } },
      tilemap: {
        cols: 48, rows: 34, seed: 41, rubbleBase: "grass",
        ops: [
          { op: "fill", t: "grass" },
          { op: "line", pts: [[-2, 18], [22, 18]], w: 3, t: "dirt" },
          { op: "disc", x: 24, y: 17.5, r: 4.2, t: "dirt" },
          { op: "line", pts: [[26, 15.5], [38, 10], [48, 7]], w: 3, t: "dirt" },
          { op: "line", pts: [[24, 17], [24, 14]], w: 3, t: "dirt" },
          { op: "line", pts: [[22, 16], [10, 11]], w: 3, t: "dirt" },
          { op: "line", pts: [[26, 19], [33, 24.5]], w: 3, t: "dirt" },
          { op: "line", pts: [[22, 19], [11, 27.5]], w: 3, t: "dirt" },
          // 集落を囲う柵（西と北東に出入り口）
          { op: "rect", x: 0, y: 0, w: 48, h: 1, t: "fence" },
          { op: "rect", x: 0, y: 33, w: 48, h: 1, t: "fence" },
          { op: "rect", x: 0, y: 0, w: 1, h: 34, t: "fence" },
          { op: "rect", x: 47, y: 0, w: 1, h: 34, t: "fence" },
          { op: "rect", x: 0, y: 16, w: 1, h: 5, t: "dirt" },
          { op: "rect", x: 47, y: 4, w: 1, h: 6, t: "dirt" },
          // 宿（広場の北）・集会所（北西）・住居
          { op: "hut", x: 20, y: 8, w: 8, h: 5 },
          { op: "hut", x: 6, y: 5, w: 8, h: 5 },
          { op: "hut", x: 31, y: 19, w: 6, h: 5 },
          { op: "hut", x: 8, y: 22, w: 6, h: 5 },
          { op: "hut", x: 33, y: 2, w: 6, h: 4 },
          { op: "hut", x: 38, y: 25, w: 6, h: 4 },
          { op: "well", x: 28, y: 20 },
          { op: "tree", x: 3, y: 4 }, { op: "tree", x: 16, y: 29 }, { op: "tree", x: 44, y: 18 }, { op: "tree", x: 3, y: 29 }, { op: "tree", x: 26, y: 29 },
        ],
      },
      zones: [
        { id: "inn", kind: "talk", sprite: "none", tx: 24, ty: 13.4, r: 16, label: "宿" },
        { id: "hall", kind: "talk", sprite: "none", tx: 10, ty: 10.4, r: 16, label: "集会所" },
        { id: "farmer", kind: "talk", sprite: "villager", tx: 30, ty: 25.6, r: 14, label: "畑の男" },
        { id: "peddler", kind: "talk", sprite: "villager2", tx: 19, ty: 20.4, r: 14, label: "旅の行商人" },
        { id: "exit_kareno", kind: "exit", to: "kareno", tx: 1.2, ty: 18, r: 22, dir: "w", steps: 40, label: "枯野へ" },
        { id: "exit_hainotani", kind: "exit", to: "hainotani", tx: 46.6, ty: 7, r: 22, dir: "e", steps: 55, label: "灰の谷方面へ" },
      ],
    };

    // ── 灰の谷：竜の危険地帯（攻略チャート第二章④⑤）。灰の積もった谷底を、アーカイブへ抜ける ──
    // 敵は最上位種（enemies.md）。シンボルなので、見て避けて通れる（谷底は広く、脇を抜けられる）。
    // 東へそれた「谷の奥」に、灰化しかけた竜の眷属が埋もれている（扉⑤・T4）。竜血の眷属が番をしている
    var VALLEY_AREA = {
      label: "灰の谷",
      dragonZone: true,   // 灰色竜エンカあり（PLAN 推奨レベル表・§8-5c：屋外の危険地帯）
      start: { tx: 3, ty: 40 },
      entryPoints: { tomoshi: { tx: 3, ty: 40 }, archive: { tx: 36, ty: 3 } },
      symbols: [
        { id: "v1", tx: 13, ty: 30 }, { id: "v2", tx: 25, ty: 36 }, { id: "v3", tx: 30, ty: 22 },
        { id: "v4", tx: 20, ty: 17 }, { id: "v5", tx: 43, ty: 12 }, { id: "k1", tx: 50, ty: 32 },
      ],
      tilemap: {
        cols: 64, rows: 48, seed: 51, rubbleBase: "dirt",
        // 灰の色：ほとんど色を抜き、青みの灰にする
        grade: { sat: 0.1, shadow: [-4, -4, -1], light: [4, 5, 8] },
        ops: [
          { op: "fill", t: "rubble" },
          // 谷底の本道（西の入口から北のアーカイブへ）。広いので、敵の脇を抜けられる
          { op: "line", pts: [[-2, 40], [10, 38], [20, 32], [28, 24], [32, 14], [36, -2]], w: 12, t: "dirt" },
          { op: "disc", x: 22, y: 31, r: 7, t: "dirt" }, { op: "disc", x: 30, y: 19, r: 6, t: "dirt" },
          // 灰の吹き溜まり
          { op: "disc", x: 14, y: 36, r: 3, t: "lot" }, { op: "disc", x: 27, y: 26, r: 3, t: "lot" }, { op: "disc", x: 33, y: 9, r: 2.5, t: "lot" },
          // 東へそれる谷の奥
          { op: "line", pts: [[28, 28], [40, 30], [50, 33], [57, 37]], w: 6, t: "dirt" },
          { op: "disc", x: 57, y: 37, r: 5, t: "lot" },
          { op: "scatter", t: "rubble", on: ["dirt", "lot"], count: 40, keep: 5 },
        ],
      },
      zones: [
        // ⑤ミラが脅かされる（本道の半ば。谷底の幅いっぱいに踏むように広く取る）
        { id: "crisis", kind: "talk", sprite: "none", tx: 26, ty: 26, r: 120 },
        { id: "ash_kin", kind: "talk", sprite: "none", tx: 57.5, ty: 37.5, r: 18, label: "灰に埋もれた影" },
        { id: "exit_tomoshi", kind: "exit", to: "tomoshi", tx: 1.2, ty: 40, r: 22, dir: "w", steps: 55, label: "灯の集落へ" },
        { id: "exit_archive", kind: "exit", to: "archive", tx: 36, ty: 1.4, r: 24, dir: "n", steps: 60, label: "アーカイブへ" },
      ],
    };
    // 谷のシンボルの中身（出現率は enemies.md：賊32／牙の獣24／殻虫20／残響18。竜血の眷属は番人の1体だけ）
    var VALLEY_FOES = {
      v1: ["dragon_fang", "dragon_fang"], v2: ["cunning_bandit", "cunning_bandit", "cunning_bandit"], v3: ["dragon_echo", "dragon_echo"],
      v4: ["dragon_shell", "dragon_shell"], v5: ["cunning_bandit", "cunning_bandit"], k1: ["dragonblood_kin"],
    };

    // ── アーカイブ：旧管理者の施設跡（擬似3D）。外郭→記録庫。踏破120歩（PLAN）に近い116歩 ──
    //   外郭：入口から下りの階段まで58歩／記録庫：階段から書庫番まで58歩。蛇行する一本道と1マスの宝箱
    //   書庫番の手前に涸れ間（PLAN §8-4b：無料で全回復）
    //   探索個性の仕掛け（施錠区画・瓦礫・隠し書架＝扉⑦・T6/T7）は次以降
    var ARCHIVE_TILE = { "#": "wall", ".": "floor", E: "exit", S: "stairs:inner", U: "stairs:outer", C: "chest", R: "event:karema", B: "event:keeper" };
    var ARCHIVE_FLOORS = {
      outer: {
        start: { x: 1, y: 9, dir: 1 },
        map: [
          "##############",
          "#..........S##",
          "#.############",
          "#...........##",
          "###########.##",
          "#...........C#",
          "#.############",
          "#...........##",
          "###########.##",
          "#E..........C#",
          "##############",
        ],
      },
      inner: {
        start: { x: 1, y: 9, dir: 0 },
        map: [
          "##############",
          "#...#...#...##",
          "#.#.#.#.#.#.##",
          "#.#.#.#.#.#.##",
          "#.#.#.#.#.#.C#",
          "#.#.#.#.#.#.##",
          "#.#.#.#.#.#.##",
          "#.#.#.#.#.#.##",
          "#.#.#.#.#.#R##",
          "#U#...#...#B##",
          "#####C########",
          "##############",
        ],
      },
    };
    // 宝箱の中身は仮（資料のアーカイブの宝箱の中身は未確定）
    var ARCHIVE_CHESTS = { outer: { "12,9": "potion", "12,5": "magic_stone" }, inner: { "12,4": "potion", "5,10": "magic_stone" } };
    // アーカイブの雑魚（上位種）。出現率は enemies.md の牙の獣24／殻虫20／残響18の比
    function archiveFoes() {
      var r = Math.random() * 62, n = 1 + Math.floor(Math.random() * 3);
      var id = r < 24 ? "ash_fang" : r < 44 ? "iron_shell" : "ember_echo";
      var out = [];
      for (var i = 0; i < n; i++) out.push(id);
      return out;
    }

    // ── 場所に入る ──
    function setPlace(kind, extra, resumeFn) {
      placeKind = kind;
      ctx.setPlace(Object.assign({ kind: kind, ch2: true }, extra || {}), resumeFn);
    }
    function battleBg(kind) { return { kareno: "kareno", tomoshi: "tomoshi", valley: "valley", archive: "archive" }[kind]; }
    function fight(ids, title, next, force, eventEnd) {
      ctx.runBattle(ctx.foes(ids), ctx.timeUp() ? "竜の眷属" : title, !!force, next, eventEnd, battleBg(placeKind));
    }

    function startArea(kind, data, entry, handlers) {
      var d = Object.assign({}, data, { start: entry || data.start });
      if (kind === "valley") d.symbolDefeated = st.valleyDefeated;
      area = Explore.startFreeArea(app(), d, game(), Object.assign({ openMenu: ctx.openMenu }, handlers), st.taken[kind]);
      setPlace(kind, null, function () { area.render(); });
      return area;
    }
    function posOf(fromId, data) { return data.entryPoints[fromId] || data.start; }

    function enterPlace(id, fromId, firstVisit, point) {
      // 拠点・涸れ間へのファストトラベル（第一章の FT_POINTS）：その前に降りる
      if (point === "kareno_captain") return enterKareno({ tx: 22, ty: 12.8 });
      if (point === "tomoshi_inn") return enterTomoshi({ tx: 24, ty: 15 });
      if (point === "archive_karema") return enterArchive("inner", KAREMA_POS);
      if (id === "kareno") return enterKareno(fromId ? posOf(fromId, KARENO_AREA) : null, firstVisit);
      if (id === "tomoshi") return enterTomoshi(fromId ? posOf(fromId, TOMOSHI_AREA) : null, firstVisit);
      if (id === "hainotani") return enterValley(fromId ? posOf(fromId, VALLEY_AREA) : null, firstVisit);
      if (id === "archive") return enterArchive(st.archiveFloor, null, firstVisit);
    }

    // ── 枯野 ──
    function enterKareno(pos, firstVisit) {
      var go = function () {
        startArea("kareno", KARENO_AREA, pos, {
          onExit: function (to) { ctx.goTo(to, "kareno"); },
          onTalk: function (zone, next) {
            if (zone.id === "captain") { captainRoom(next); return; }
            if (zone.id === "hunter1") {
              Story.play(app(), [{ speaker: "狩猟隊の隊員", bg: "kareno", text: F().metSharla ? "隊長の客なら、好きに休んでいきな。ここは竜も寄りつかない。" : "隊長に用なら、奥の天幕だ。……鳥人がそんなに珍しいか？　うちの隊は、みんなこうさ。" }], next);
              return;
            }
            next();
          },
        });
      };
      if (firstVisit) {
        Story.play(app(), [
          { kind: "header", text: "枯野", bg: "kareno" },
          say("kareno", { mira: "……木も草も、枯れてる。なのに、人がいる。", tzelf: "静かな場所だ。……竜の気配がない。", alone: "枯れ果てた野に、天幕が並んでいる。" }),
          { speaker: tz(), text: "狩猟隊の野営だ。……面倒な連中に見つかる前に、抜けたかったんだがな。" },
        ], go);
        return;
      }
      go();
    }

    // 隊長室：シャルラと話す・休む（PLAN §7.5-4l0：休息・会話はここに集める）
    function captainRoom(next) {
      if (!F().metSharla) {
        F().metSharla = true;
        Story.play(app(), [
          { kind: "header", text: "隊長室", bg: "captain" },
          { kind: "choice", speaker: "シャルラ", text: "あら、どうかした？", options: ["力を貸して", "頼みたいことが", "……"] },
          { speaker: "シャルラ", text: "分かったわ……と、言いたいところだけど、仕事が忙しくてね。" },
          { speaker: "シャルラ", text: "東区狩猟隊の隊長、シャルラよ。……で、そっちの鳥人は？　うちの隊の者じゃないわね。" },
          { speaker: tz(), text: "……名乗る筋合いはない。" },
          { speaker: "ミラ", text: "ツェルフ、よ。私はミラ。こっちはセオ。灰縁の集落から……追い出されてきたの。" },
          { speaker: "シャルラ", text: "そう。ここは竜が命を吸い尽くして去った跡だから、竜も戻ってこない。休みたくなったら、いつでもいらっしゃい。" },
        ], next);
        return;
      }
      var opts = ["休む", "話す"], canAsk = F().owlRumor && !F().arwaHint;
      if (canAsk) opts.push("梟の魔女のこと");
      opts.push("出る");
      Story.play(app(), [{ kind: "choice", speaker: "シャルラ", bg: "captain", text: "あら、どうかした？", options: opts }], function (c) {
        var pick = opts[c];
        if (pick === "休む") { ctx.restAt("captain", "restCaptain", next); return; }
        if (pick === "話す") {
          Story.play(app(), [{ speaker: "シャルラ", bg: "captain", text: "旧管理者の施設跡？　灰の谷を抜けた先ね。あそこは竜の寝床に近い。……無茶はしないことね。" }], next);
          return;
        }
        if (pick === "梟の魔女のこと") {
          // ⑦の心当たり：梟の魔女＝義姉アルワ（攻略チャート第二章【道中の寄り道】）
          F().arwaHint = true;
          Story.play(app(), [
            { speaker: "シャルラ", bg: "captain", text: "梟の魔女？　……ああ、それ義姉さんのことね。" },
            { speaker: "シャルラ", text: "生きてるなら、昔いた場所にいるんじゃない。……もう長いこと、会ってないけどね。" },
            say("captain", { mira: "義姉さん……。", tzelf: "……そうか。", alone: "" }),
          ].filter(function (b) { return b.text; }), next);
          return;
        }
        next();
      });
    }

    // ── 灯の集落 ──
    function enterTomoshi(pos, firstVisit) {
      var go = function () {
        startArea("tomoshi", TOMOSHI_AREA, pos, {
          onExit: function (to) { ctx.goTo(to, "tomoshi"); },
          onTalk: function (zone, next) {
            if (zone.id === "inn") { inn(next); return; }
            if (zone.id === "hall") { hall(next); return; }
            if (zone.id === "farmer") { farmer(next); return; }
            if (zone.id === "peddler") { peddler(next); return; }
            next();
          },
        });
      };
      if (firstVisit) {
        // ②世界の手触り（本筋）：竜の脅威・三派・竜読みの実態
        Story.play(app(), [
          { kind: "header", text: "灯の集落", bg: "tomoshi" },
          say("tomoshi", { mira: "灯りがついてる……。ちゃんと、人が暮らしてる。", tzelf: "生き残りの集落だ。", alone: "灯りのともる集落だ。" }),
          { speaker: "集落の男", text: "旅の人かい。竜読みの爺さんが言うには、今年は竜がこっちへ寄ってこないらしい。……ま、当たるも八卦さ。" },
          { speaker: "集落の男", text: "竜を呼んで拝む招竜派、竜を倒すと息巻く連中、黙ってやり過ごす連中……。ここはどこにも付かない。付けば、潰し合いに巻き込まれる。" },
        ], go);
        return;
      }
      go();
    }
    function inn(next) {
      Story.play(app(), [{ kind: "choice", speaker: "宿の主人", bg: "inn", text: "泊まっていくかい。", options: ["休む", "やめておく"] }], function (c) {
        if (c !== 0) { next(); return; }
        ctx.restAt("inn", "restInn", function () {
          if (F().innNight) { next(); return; }
          F().innNight = true;
          // 扉①：道中で気遣う選択（好感度）
          Story.play(app(), [
            say("inn", { mira: "……すぅ……。", alone: "" }),
            { kind: "choice", speaker: tz(), bg: "inn", text: "……寝ておけ。見張りは俺がやる。", options: ["交代で見張ろう", "頼んだ", "信用できるか"] },
          ].filter(function (b) { return b.text || b.kind === "choice"; }), function (c2) {
            var lines = [
              [{ speaker: tz(), bg: "inn", text: "……物好きな奴だ。先に寝ろ。起こしてやる。" }],
              [{ speaker: tz(), bg: "inn", text: "ああ。" }],
              [{ speaker: tz(), bg: "inn", text: "なら、自分で起きていろ。" }],
            ];
            affinity(c2 === 0 ? 1 : c2 === 2 ? -1 : 0);
            Story.play(app(), lines[c2], next);
          });
        });
      });
    }
    function hall(next) {
      if (F().truths && F().truths.T3) {
        Story.play(app(), [{ speaker: "古老", bg: "hall", text: "碑が気になるかね。……昔話じゃよ。" }], next);
        return;
      }
      // 扉②：碑文と古老（T3：鳥人は絶滅したのではない。竜へ還った）
      Story.play(app(), [
        { kind: "header", text: "集会所", bg: "hall" },
        { kind: "narration", text: "壁に古い碑が掛かっている。「翼ある人ら、竜のもとへ還りぬ」" },
        { speaker: "古老", text: "その碑か。鳥人は滅んだと、皆は言うがな。わしの祖父は違うと言うとった。" },
        { speaker: "古老", text: "死んだんじゃない。竜のもとへ還ったんだ、と。……わずかに、還らずに残った者もおる、ともな。" },
        say("hall", { mira: "……還った……？", alone: "" }),
        { speaker: tz(), text: "……昔話だ。" },
      ].filter(function (b) { return b.text; }).concat(gainTruth("T3")), next);
    }
    function farmer(next) {
      if (F().truths && F().truths.T2) {
        Story.play(app(), [{ speaker: "畑の男", bg: "tomoshi", text: "痩せた土でも、耕さなきゃ食えないからな。" }], next);
        return;
      }
      // 扉②：住人の実務知識（T2：竜に長く留まられた土地は痩せる／竜は寝床を変える）
      Story.play(app(), [
        { speaker: "畑の男", bg: "tomoshi", text: "この辺りの畑も、年々痩せていく。竜が長く居座った土地は、命を吸われるんだ。" },
        { speaker: "畑の男", text: "竜は何十年かごとに寝床を変える。だから人も、竜の寝床から逃げて回るしかない。" },
        say("tomoshi", { mira: "……だから、枯野はあんなに……。", tzelf: "……ああ。", alone: "" }),
      ].filter(function (b) { return b.text; }).concat(gainTruth("T2")), next);
    }
    function peddler(next) {
      if (F().owlRumor) {
        Story.play(app(), [{ speaker: "旅の行商人", bg: "tomoshi", text: "梟の魔女の住処？　さあねえ。知ってる奴がいたら、あたしも聞きたいよ。" }], next);
        return;
      }
      // ⑦の手がかり：梟の魔女の噂（集落の噂＝扉②系。アルワの居場所の心当たりへの入口）
      F().owlRumor = true;
      Story.play(app(), [
        { speaker: "旅の行商人", bg: "tomoshi", text: "竜のことを調べてる？　なら、こんな噂がある。“真の名”を知る、梟の魔女がいるってね。" },
        { speaker: "旅の行商人", text: "人里には寄りつかないそうだ。どこに住んでるかまでは、誰も知らない。" },
        say("tomoshi", { mira: "梟の魔女……。鳥人のことなら、枯野のシャルラさんが何か知ってるかも。", tzelf: "……鳥人の噂なら、枯野の連中のほうが詳しいだろう。", alone: "" }),
      ].filter(function (b) { return b.text; }), next);
    }

    // ── 灰の谷 ──
    function enterValley(pos, firstVisit) {
      var go = function () {
        var a = startArea("valley", VALLEY_AREA, pos, {
          onExit: function (to) { ctx.goTo(to, "hainotani"); },
          onTalk: function (zone, next) {
            if (zone.id === "crisis") { crisis(next); return; }
            if (zone.id === "ash_kin") { ashKin(next); return; }
            next();
          },
          onSymbol: function (symbolId, done) {
            fight(VALLEY_FOES[symbolId] || ["dragon_fang"], symbolId === "k1" ? "竜血の眷属" : "灰の谷の魔物", function () {
              st.valleyDefeated[symbolId] = true;
              done(true);
            });
          },
        });
        if (firstVisit) a.playScene(valleyEntryScene, function (c) {
          affinity(c === 0 ? 1 : c === 2 ? -1 : 0);
        });
      };
      if (firstVisit) {
        Story.play(app(), [
          { kind: "header", text: "灰の谷", bg: "valley" },
          say("valley", { mira: "空から、灰が降ってる……。息をするのも、苦しい。", tzelf: "竜の寝床が近い。長居はするな。", alone: "灰が降りしきる谷だ。" }),
          { kind: "narration", text: "（この谷の魔物は強い。姿が見えたら、避けて通るのも手だ）" },
        ], go);
        return;
      }
      go();
    }
    // ④ツェルフが灰に手を止める（伏線。デレではない）
    var valleyEntryScene = [
      { spawn: "tzelf", at: { tx: 4.5, ty: 39 }, face: "right" },
      { walk: "tzelf", to: [{ tx: 9, ty: 38.4 }] },
      { face: "tzelf", dir: "down" },
      { wait: 700 },
      { say: "ミラ", actor: null, text: "……ツェルフ？" },
      { choice: true, say: "", actor: "tzelf", text: "", options: ["大丈夫か", "どうした", "置いていくぞ"] },
      { say: "ツェルフ", actor: "tzelf", text: "……何でもない。行くぞ。" },
      { walk: "tzelf", to: [{ tx: 3, ty: 40 }] },
      { remove: "tzelf" },
    ];
    // ⑤ミラが脅かされる（第二章の山場）：竜の眷属に襲われ、灰に呑まれかける。ツェルフが助けに来る
    function crisis(next) {
      if (F().valleyCrisis) { next(); return; }
      F().valleyCrisis = true;
      area.taken.crisis = true;
      area.playScene([
        { spawn: "mira", at: { tx: area.pos.x / 16 - 1.2, ty: area.pos.y / 16 }, face: "up" },
        { walk: "mira", to: [{ tx: area.pos.x / 16 - 1.2, ty: area.pos.y / 16 - 2.5 }] },
        { say: "ミラ", actor: "mira", text: "ねえ、この先……灰が、深くなって——", fx: "shake" },
        { say: "ミラ", actor: "mira", text: "きゃっ……！　足が、灰に……！　何か、いる……！", fx: "impact" },
        { choice: true, say: "", actor: "mira", text: "", options: ["ミラ！", "……！"] },
      ], function () {
        fight(["dragon_kin"], "竜の眷属", function () {
          var dere = (F().affinity || 0) >= DERE_AT;
          var beats = [
            { kind: "header", text: "灰の谷の深部", bg: "valley" },
            { speaker: tz(), text: "……下がっていろ。こいつは、人の手に負える相手じゃない。" },
            { kind: "narration", text: "眷属は灰の中へ沈み、気配が遠のいていった。" },
          ];
          if (dere) {
            beats = beats.concat([
              { speaker: tz(), text: "……無事か。" },
              { speaker: "ミラ", text: "う、うん……。ありがとう、ツェルフ。" },
              { speaker: tz(), text: "……勘違いするな。たまたま転がってただけだ。" },
            ]);
          } else {
            beats = beats.concat([
              { speaker: "ミラ", text: "……ありがとう、ツェルフ。" },
              { speaker: tz(), text: "勘違いするな。たまたま転がってただけだ。" },
            ]);
          }
          beats = beats.concat([
            // セオの守りたいものが、集落からミラへ絞られる（セオの台詞は選択肢だけ）
            { kind: "choice", speaker: "ミラ", text: "……セオ？　そんな顔、しないでよ。私、ちゃんとここにいるから。", options: ["もう二度と、失わない", "……"] },
            { speaker: "ミラ", text: "……うん。" },
          ]);
          Story.play(app(), beats, function () { area.render(); });
        }, true, { enemyActions: 3 });
      });
    }
    // 扉⑤：谷の奥・灰化しかけた眷属（T4の最初の手がかり：竜はかつて鳥人だった）
    function ashKin(next) {
      if (F().truths && F().truths.T4) {
        Story.play(app(), [say("valley", { mira: "……もう、灰になっちゃったみたい。", tzelf: "……行くぞ。", alone: "灰の塊が残っている。" })], next);
        return;
      }
      Story.play(app(), [
        say("valley", { mira: "……何か、灰に埋もれてる。竜の眷属……？　動かない……。", tzelf: "……眷属の成れの果てだ。", alone: "灰に埋もれた、竜の眷属の骸だ。" }),
        say("valley", { mira: "これ……羽じゃない？　眷属なのに、鳥人みたいな……。", alone: "崩れかけた体に、羽の形が残っている。" }),
        { speaker: tz(), text: "…………" },
        say("valley", { mira: "ツェルフ？", alone: "" }),
        { speaker: tz(), text: "……触るな。行くぞ。" },
      ].filter(function (b) { return b.text; }).concat(gainTruth("T4")), next);
    }

    // ── アーカイブ（擬似3D） ──
    function archiveGrid(floorId) {
      var taken = st.archiveTaken[floorId] || {};
      return ARCHIVE_FLOORS[floorId].map.map(function (row, y) {
        return row.split("").map(function (ch, x) {
          var t = ARCHIVE_TILE[ch];
          if (t === "chest" && taken[x + "," + y]) return "floor";
          return t;
        });
      });
    }
    var KAREMA_POS = { x: 11, y: 8, dir: 2 };
    function enterArchive(floorId, dpos, firstVisit) {
      // 涸れ間にたどり着いた後は、入口から涸れ間へ歩数を使わずに行ける（§8-4b）
      if (floorId === "outer" && !dpos && F().karemaReached && !F().keeperDown) {
        Story.play(app(), [{ kind: "choice", speaker: "", bg: "archive", text: "", options: ["涸れ間へ行く", "入口から進む"] }], function (c) {
          if (c === 0) enterArchive("inner", KAREMA_POS); else enterArchive("outer", ARCHIVE_FLOORS.outer.start);
        });
        return;
      }
      var go = function () {
        st.archiveFloor = floorId;
        var grid = archiveGrid(floorId);
        if (dpos && (!grid[dpos.y] || !grid[dpos.y][dpos.x] || grid[dpos.y][dpos.x] === "wall")) dpos = null;
        dungeon = Explore.start(app(), { start: dpos || ARCHIVE_FLOORS[floorId].start, grid: grid, theme: "facility" }, game(), {
          openMenu: ctx.openMenu,
          onExit: function () { ctx.goTo("hainotani", "archive"); },
          // 記録庫から上がると、外郭の下り階段の上に出る
          onStairs: function (to) { enterArchive(to, to === "outer" ? { x: 11, y: 1, dir: 3 } : null); },
          onChest: function (x, y) {
            var key = x + "," + y, id = ARCHIVE_CHESTS[floorId][key];
            st.archiveTaken[floorId][key] = true;
            if (!id) { dungeon.render(); return; }
            ctx.addItem(id);
            Story.play(app(), [{ kind: "narration", text: "〈" + Data.ITEMS[id].name + "〉を手に入れた。" }], function () { dungeon.render(); });
          },
          onEncounter: function () { fight(archiveFoes(), "アーカイブの魔物", function () { dungeon.render(); }); },
          onEvent: onArchiveEvent,
        }, st.archiveVisited[floorId]);
        setPlace("archive", { floor: floorId }, function () { dungeon.render(); });
      };
      if (firstVisit) {
        Story.play(app(), [
          { kind: "header", text: "アーカイブ", bg: "archive" },
          { speaker: tz(), text: "ここだ。旧管理者の施設跡……。" },
          say("archive", { mira: "中に、まだ明かりが残ってる……。千年前の建物なのに。", alone: "" }),
        ].filter(function (b) { return b.text; }), go);
        return;
      }
      go();
    }
    function onArchiveEvent(id) {
      if (id === "karema") {
        // 涸れ間（PLAN §8-4b）：竜が命を吸い尽くした区画。無料で全回復（時間もシードも変わらない）。
        // たどり着くと、入口とここを無料で行き来できるようになり、ファストトラベルの行き先にもなる
        game().party.forEach(function (c) { c.hp = c.maxHp; c.mp = c.maxMp; });
        var first = !F().karemaReached;
        F().karemaReached = true;
        var beats = first ? [
          say("archive", { mira: "ここ……空気が止まってる。何も寄ってこない感じ。", tzelf: "涸れ間だ。吸われるものが残っていない場所には、何も寄りつかない。", alone: "静まり返った区画だ。" }),
          { kind: "narration", text: "（体力と魔力が回復した。ここと施設の入口は、歩数を使わずに行き来できるようになった）" },
        ] : [{ kind: "narration", text: "（体力と魔力が回復した）" }];
        beats.push({ kind: "choice", options: ["先へ進む", "入口へ戻る"] });
        Story.play(app(), beats, function (c) {
          if (c === 1) { enterArchive("outer", { x: 1, y: 9, dir: 1 }); return; }
          dungeon.render();
        });
        return;
      }
      if (id === "keeper") {
        if (F().keeperDown) { dungeon.render(); return; }
        Story.play(app(), [
          { kind: "header", text: "記録庫", bg: "archive" },
          { speaker: tz(), text: "……動いている。千年、ここを守り続けてきたのか。" },
          say("archive", { mira: "来る……！", alone: "" }),
        ].filter(function (b) { return b.text; }), function () {
          ctx.runBattle(["archive_keeper"], "書庫番", false, function () {
            F().keeperDown = true;
            recordScene();
          }, null, "archive");
        });
      }
    }
    // ⑥本筋の記録：「決定的な答えはない。だが"真の名"に鍵がある」（アルワの名は出ない）
    // ⑦締め＝第二章の終了判定：アルワの居場所の心当たりを持っているか
    function recordScene() {
      var beats = [
        { kind: "header", text: "記録庫", bg: "archive" },
        { kind: "narration", text: "端末に、かすれた文字が残っている。「竜を鎮める術、記録になし。ただし——“真の名”に鍵あり」" },
        { speaker: tz(), text: "……決定的な答えは、ない。" },
        say("archive", { mira: "真の名……？", alone: "" }),
        { speaker: tz(), text: "名を持つ者の、本当の名だ。……それが何なのかまでは、書いていない。" },
      ];
      if (F().arwaHint) {
        F().ch2End = "main";
        beats = beats.concat([
          say("archive", { mira: "真の名……。シャルラさんの言ってた“梟の魔女”なら、知ってるかも。", alone: "" }),
          { speaker: tz(), text: "昔の住処、か。……行ってみる価値はある。" },
        ]);
      } else {
        F().ch2End = "alt";
        beats = beats.concat([{ speaker: tz(), text: "特に収穫なかったな。どうする。" }]);
      }
      Story.play(app(), beats.filter(function (b) { return b.text; }), function () { ctx.chapterEnd(); });
    }

    // ── ①同行の成立（第一章の外縁・追放直後） ──
    function begin() {
      extendWorld(ctx.world);
      Story.play(app(), [{ kind: "header", text: "第二章　ツェルフの目的に同行", bg: "gate" }], function () {
        var a = ctx.enterOutskirts({ tx: 29, ty: 12 });
        a.taken.ch2_tzelf = true;   // 寸劇の間は隠しておく（歩き去ってから、その場に立つ）
        a.playScene([
          { spawn: "mira", at: { tx: 27, ty: 12.8 }, face: "right" },
          { spawn: "tzelf", at: { tx: 30.5, ty: 12.5 }, face: "left" },
          { say: tz(), actor: "tzelf", text: "……俺は行く。" },
          { walk: "tzelf", to: [{ tx: 30.5, ty: 15.5 }, { tx: 33, ty: 18 }] },
          { face: "tzelf", dir: "left" },
          { remove: "tzelf" },
          { say: "ミラ", actor: "mira", text: "……行っちゃうよ？" },
          { walk: "mira", to: [{ tx: 29, ty: 12 }] },
          { remove: "mira" },
        ], function () { a.taken.ch2_tzelf = false; a.render(); });
      });
    }
    // 外縁に、発とうとするツェルフを立たせる（同行が決まるまで。途中でセーブして再開しても立っている）
    function outskirtsExtra() {
      if ((game().chapter || 1) < 2 || F().ch2Joined) return null;
      return {
        zones: [{ id: "ch2_tzelf", kind: "talk", sprite: "tzelf", face: "left", tx: 33, ty: 18, r: 22, label: tz() }],
        onTalk: function (zone, next) { if (zone.id !== "ch2_tzelf") return false; departTalk(next); return true; },
        // 声をかけずに外縁を出ようとしたら、ミラが引き止める
        onExit: function (to, stay) {
          Story.play(app(), [{ speaker: "ミラ", bg: "gate", text: "待って。……ツェルフに、ちゃんと声をかけていこうよ。" }], stay);
          return true;
        },
      };
    }
    function departTalk(next) {
      Story.play(app(), [
        { speaker: tz(), bg: "gate", text: "……まだ何か用か。" },
        { speaker: "ミラ", text: "どこへ行くの？" },
        { speaker: tz(), text: "旧管理者の施設跡だ。竜を止める手段の記録が、残っているかもしれん。" },
        { kind: "choice", speaker: tz(), text: "……勝手にしろ。俺は俺の用がある。", options: ["一緒に行かせてくれ", "勝手についていく", "鳥人のこと、黙っててやる"] },
      ], function (c) {
        // 扉①：素直に頼む＝好感度↑／勝手についていく＝変化なし／弱みを握る言い方＝好感度↓
        var react = [
          [{ speaker: tz(), text: "……っ。" }, { speaker: tz(), text: "……好きにしろ。" }],
          [{ speaker: tz(), text: "はぐれても知らんぞ。" }],
          [{ speaker: tz(), text: "……好きにしろ。だが、二度とその話はするな。" }],
        ][c];
        affinity(c === 0 ? 1 : c === 2 ? -1 : 0);
        F().ch2Joined = true;
        Story.play(app(), react.concat([
          { speaker: "ミラ", text: "決まりね。……で、その施設跡って、どっち？" },
          { speaker: tz(), text: "廃区画を抜けて、枯野の先だ。灯の集落を通って、灰の谷を越える。" },
          { kind: "narration", text: "（廃区画の南東の通りから、枯野へ抜けられる）" },
        ]), function () { if (ctx.outskirts()) ctx.outskirts().taken.ch2_tzelf = true; next(); });
      });
    }

    // ── セーブと再開 ──
    function snapshot() {
      var snap = JSON.parse(JSON.stringify(st));
      if (placeKind && placeKind !== "archive" && area) snap.pos = { x: area.pos.x, y: area.pos.y };
      if (placeKind === "archive" && dungeon) snap.dpos = { x: dungeon.x, y: dungeon.y, dir: dungeon.dir };
      snap.placeKind = placeKind;
      return snap;
    }
    function restore(snap) {
      extendWorld(ctx.world);
      if (!snap) return;
      ["taken", "valleyDefeated", "archiveFloor", "archiveVisited", "archiveTaken"].forEach(function (k) { if (snap[k] !== undefined) st[k] = snap[k]; });
    }
    function resumeSaved(snap) {
      var s = snap || {};
      var pos = s.pos ? { x: s.pos.x, y: s.pos.y } : null;
      if (s.placeKind === "kareno") return enterKareno(pos);
      if (s.placeKind === "tomoshi") return enterTomoshi(pos);
      if (s.placeKind === "valley") return enterValley(pos);
      if (s.placeKind === "archive") return enterArchive(st.archiveFloor, s.dpos);
      return false;
    }
    function placeLabel(p) {
      if (!p || !p.ch2) return null;
      if (p.kind === "archive") return "アーカイブ・" + (p.floor === "inner" ? "記録庫" : "外郭");
      return KINDS[p.kind];
    }
    function handlesPlace(kind) { return kind === "kareno" || kind === "tomoshi" || kind === "valley" || kind === "archive"; }

    RPG.Chapter2.AREAS = { kareno: KARENO_AREA, tomoshi: TOMOSHI_AREA, valley: VALLEY_AREA, archive: ARCHIVE_FLOORS };
    return {
      begin: begin, extendWorld: extendWorld, outskirtsExtra: outskirtsExtra, handles: function (id) { return !!IDS[id]; }, enterPlace: enterPlace,
      snapshot: snapshot, restore: restore, resumeSaved: resumeSaved, placeLabel: placeLabel, handlesPlace: handlesPlace,
    };
  }
  return { create: create };
})();
