// 第一章「ミラ奪還〜追放」のコンテンツ（PLAN.md §7.5-2b 準拠）。
window.RPG = window.RPG || {};

RPG.Chapter1 = (function () {
  var Story = RPG.Story, Battle = RPG.Battle, Explore = RPG.Explore, Data = RPG.Data;
  var app, game, onChapterEnd;

  // 灰縁の集落。PLAN.md §7.5-2b「①日常：移動・会話・簡易戦闘のチュートリアル」に基づき、
  // くじが引かれる前に自由に歩ける（＝追放されたら二度と戻れない、ここでしか拾えないアイテムがある）。
  // 地形はタイル単位（1タイル＝16ドット）で組む。座標もタイル単位。
  var HAIBERI_VILLAGE = {
    label: "灰縁の集落",
    start: { tx: 19.5, ty: 25.5 },
    tilemap: {
      cols: 48, rows: 32, seed: 3, rubbleBase: "grass",
      ops: [
        { op: "fill", t: "grass" },
        // 集落の家並みからは離れた、瓦礫の残る外れ（灰ネズミが出るのはここ）
        { op: "disc", x: 4, y: 8, r: 6, t: "lot" },
        { op: "disc", x: 2.5, y: 4.5, r: 1.8, t: "rubble" },
        { op: "disc", x: 6.5, y: 8, r: 1.3, t: "rubble" },
        { op: "disc", x: 2, y: 11.5, r: 1.2, t: "rubble" },
        // 踏み固められた小道
        { op: "line", pts: [[19.5, 25.5], [27.5, 25.5], [29.5, 16.5], [47, 16.5]], w: 3, t: "dirt" },
        { op: "line", pts: [[29.5, 16.5], [22, 15]], w: 3, t: "dirt" },
        { op: "line", pts: [[22, 15], [12.5, 11.5]], w: 3, t: "dirt" },
        { op: "line", pts: [[27, 15.5], [26.5, 9.5]], w: 3, t: "dirt" },
        { op: "line", pts: [[29.5, 16.5], [39.5, 8.5]], w: 3, t: "dirt" },
        { op: "line", pts: [[19.5, 25.5], [9.5, 25.5]], w: 3, t: "dirt" },
        { op: "line", pts: [[27.5, 25.5], [35.5, 26.5]], w: 3, t: "dirt" },
        { op: "disc", x: 22, y: 15, r: 3.5, t: "dirt" },
        // 集落を囲う柵。東の切れ目が広場への道
        { op: "rect", x: 0, y: 0, w: 48, h: 1, t: "fence" },
        { op: "rect", x: 0, y: 31, w: 48, h: 1, t: "fence" },
        { op: "rect", x: 0, y: 0, w: 1, h: 32, t: "fence" },
        { op: "rect", x: 47, y: 0, w: 1, h: 32, t: "fence" },
        { op: "rect", x: 47, y: 14, w: 1, h: 5, t: "dirt" },
        // 住居（いちばん南がセオの家）
        { op: "hut", x: 16, y: 19, w: 6, h: 5 },
        { op: "hut", x: 6, y: 20, w: 6, h: 5 },
        { op: "hut", x: 32, y: 21, w: 6, h: 5 },
        { op: "hut", x: 9, y: 6, w: 6, h: 5 },
        { op: "hut", x: 23, y: 4, w: 6, h: 5 },
        { op: "hut", x: 36, y: 3, w: 6, h: 5 },
        { op: "well", x: 21, y: 13 },
        { op: "tree", x: 3, y: 27 }, { op: "tree", x: 13, y: 28 }, { op: "tree", x: 44, y: 27 },
        { op: "tree", x: 29, y: 29 }, { op: "tree", x: 44, y: 4 }, { op: "tree", x: 19, y: 2 }, { op: "tree", x: 33, y: 12 },
      ],
    },
    zones: [
      { id: "well", kind: "talk", tx: 25, ty: 13.5, r: 18, label: "井戸端の老人",
        speaker: "竜読みの老人", text: "竜には逆らえん。くじは絶対だ……お前さんも、いずれわかる。" },
      // セオの住居の棚（アイテム使用のチュートリアル）
      { id: "house_shelf", kind: "chest", tx: 23, ty: 24.6, r: 14, label: "住居の棚" },
      // 二連撃の記憶結晶（集落に1個だけ。追放されると二度と取れない）
      { id: "chest_shelf", kind: "chest", tx: 41.5, ty: 9, r: 14, label: "物置の木箱" },
      { id: "rat", kind: "encounter", tx: 4, ty: 15.5, r: 30, label: "集落の外れ・灰色の気配" },
      { id: "exit_plaza", kind: "exit", to: "plaza", tx: 46.5, ty: 16.5, r: 22, dir: "e", steps: 5, label: "広場へ（くじの刻限）" },
    ],
  };

  // 広域マップ＝街・集落・危険地帯のノードグラフ（PLAN.md §8-1）。
  // 廃区画はノードではなく局所探索エリア。どの方向から入っても内部を実際に
  // 歩き、出口から抜ける（通常移動で踏破済みの区画を飛び越えない）。
  var WORLD = {
    label: "地下世界・南方区画",
    width: 400, height: 260,
    start: "haiberi",
    nodes: [
      { id: "haiberi", name: "灰縁の集落", x: 30, y: 220, kind: "settlement", fastTravel: false },
      { id: "hairegion", name: "廃区画", x: 160, y: 160, kind: "danger", fastTravel: false },
      { id: "yaketa", name: "焼けた集落跡", x: 80, y: 55, kind: "ruin" },
      { id: "michi", name: "祭壇へ続く道", x: 260, y: 110, kind: "danger", fastTravel: false },
      { id: "saidan", name: "招竜の祭壇", x: 360, y: 55, kind: "shrine" },
    ],
    edges: [
      { from: "haiberi", to: "hairegion", steps: 10, encounterRate: 0 },
      { from: "hairegion", to: "yaketa", steps: 10, encounterRate: 0 },
      { from: "hairegion", to: "michi", steps: 10, encounterRate: 0 },
      { from: "michi", to: "saidan", steps: 15, encounterRate: 0.2, enemy: "straggler_bandit" },
    ],
  };

  // 廃区画の内部。西の門から入り、複数の出口へ抜ける（歩数・エンカウントはここで消化する）。
  // 「祭壇方面」は最終目的地の祭壇へ直接ではなく、途中の中継ノード（祭壇へ続く道＝michi）へ
  // 出る＝先で道がどう分岐していてもおかしくない、という含みを持たせる。
  // 街区はすべて建物で埋まっていて、歩けるのは切り開かれた街路だけ。
  // 画面の窓（24×16タイル）よりずっと大きく、カメラで追いながら歩いて見て回る。
  var HAIREGION_LAYERS = [
    { id: "upper", name: "上層　高架歩道" },
    { id: "street", name: "下層　街路" },
  ];
  var HAIREGION_AREA = {
    label: "廃区画・下層街路",
    layer: "street", layers: HAIREGION_LAYERS,
    start: { tx: 5, ty: 66 },
    // どこから入ってきたかで、区画内のどこに立つかが決まる
    entryPoints: {
      haiberi: { tx: 5, ty: 66 },
      yaketa: { tx: 51, ty: 6 },
      michi: { tx: 105, ty: 39 },
      fromHigh: { tx: 40, ty: 45 },
    },
    tilemap: {
      cols: 112, rows: 76, seed: 7,
      ops: [
        { op: "fill", t: "bldg" },
        // 西の門から東の祭壇方面へ抜ける大通り
        { op: "line", pts: [[-2, 66], [22, 65], [37, 56], [54, 52], [73, 51], [106, 38], [114, 38]], w: 12, t: "road" },
        // 北の焼けた集落跡へ向かう通り
        { op: "line", pts: [[37, 56], [44, 38], [51, 8], [51, -2]], w: 10, t: "road" },
        // 南東の水路へ下りる通り
        { op: "line", pts: [[54, 52], [68, 63], [92, 65]], w: 9, t: "road" },
        // 北の住居跡へ入り込む路地と、その奥の中庭
        { op: "line", pts: [[43, 36], [28, 29], [16, 25]], w: 7, t: "road" },
        { op: "disc", x: 15, y: 24, r: 5, t: "lot" },
        // 中央広場と市場跡
        { op: "disc", x: 45, y: 52, r: 9, t: "plaza" },
        { op: "disc", x: 86, y: 46, r: 7, t: "lot" },
        // 水路
        { op: "rect", x: 60, y: 70, w: 52, h: 6, t: "water" },
        // 崩れて道を塞ぐ瓦礫（通りの幅は残る）
        { op: "disc", x: 30, y: 61, r: 2.2, t: "rubble" }, { op: "disc", x: 48, y: 47, r: 2.5, t: "rubble" },
        { op: "disc", x: 60, y: 53, r: 2, t: "rubble" }, { op: "disc", x: 80, y: 48, r: 2.2, t: "rubble" },
        { op: "disc", x: 90, y: 44, r: 1.8, t: "rubble" }, { op: "disc", x: 49, y: 20, r: 2.5, t: "rubble" },
        { op: "disc", x: 53, y: 27, r: 1.8, t: "rubble" }, { op: "disc", x: 75, y: 64, r: 2, t: "rubble" },
        { op: "disc", x: 18, y: 63, r: 1.6, t: "rubble" }, { op: "disc", x: 97, y: 42, r: 2, t: "rubble" },
        { op: "disc", x: 46, y: 33, r: 2, t: "rubble" }, { op: "disc", x: 24, y: 28, r: 1.4, t: "rubble" },
        { op: "scatter", t: "rubble", on: ["road", "plaza", "lot"], count: 140, keep: 4 },
      ],
    },
    zones: [
      { id: "danger1", kind: "danger", tx: 45, ty: 34, r: 70, encounterRate: 0.5, label: "崩落した交差路" },
      { id: "danger2", kind: "danger", tx: 86, ty: 46, r: 80, encounterRate: 0.35, label: "見通しの悪い市場跡" },
      { id: "chest1", kind: "chest", tx: 13.5, ty: 23, r: 14, label: "北の住居跡" },
      { id: "chest2", kind: "chest", tx: 91, ty: 68.5, r: 14, label: "水路脇の荷箱" },
      { id: "stairs_up", kind: "stairs", toLayer: "upper", entry: "fromStreet", tx: 40, ty: 45, r: 16, label: "崩れた高架への石段" },
      // 入ってきた側（灰縁の集落方面）へも、他の出口と同じくここを歩いて
      // 踏まないと戻れない。広域マップのノードを直接クリックするだけでは
      // 辿り着けない、この内部を経由してこそ意味のある道にする。
      { id: "exit_haiberi", kind: "exit", to: "haiberi", tx: 1.2, ty: 66, r: 22, dir: "w", steps: 10, label: "灰縁の集落へ" },
      { id: "exit_yaketa", kind: "exit", to: "yaketa", tx: 51, ty: 1.4, r: 22, dir: "n", steps: 15, label: "焼けた集落跡方面（寄り道）" },
      { id: "exit_michi", kind: "exit", to: "michi", tx: 110.8, ty: 38, r: 24, dir: "e", steps: 30, label: "祭壇方面" },
    ],
  };

  // 下層と同じ廃区画を見下ろす高架歩道。下層の街並みは足元に暗く沈んで
  // 見えるだけで、歩けるのは描かれた歩道と足場の上だけ（縁から先へは出られない）。
  var HAIREGION_UPPER_AREA = {
    label: "廃区画・高架歩道",
    layer: "upper", layers: HAIREGION_LAYERS,
    start: { tx: 40, ty: 45 },
    entryPoints: { fromStreet: { tx: 40, ty: 45 } },
    underlay: HAIREGION_AREA,
    tilemap: {
      cols: 112, rows: 76, seed: 9,
      ops: [
        { op: "fill", t: "void" },
        { op: "line", pts: [[40, 45], [55, 34], [73, 29], [95, 26]], w: 7, t: "walk" },
        { op: "line", pts: [[55, 34], [62, 49], [81, 56]], w: 7, t: "walk" },
        { op: "line", pts: [[73, 29], [90, 38], [102, 37]], w: 7, t: "walk" },
        { op: "disc", x: 40, y: 45, r: 4, t: "deck" },
        { op: "disc", x: 73, y: 29, r: 4.5, t: "deck" },
        { op: "disc", x: 96, y: 25, r: 4, t: "deck" },
        { op: "disc", x: 81, y: 56, r: 4, t: "deck" },
        { op: "disc", x: 102, y: 37, r: 4, t: "deck" },
        // 抜け落ちた歩道（穴の脇をすり抜けて進む）
        { op: "disc", x: 65, y: 31, r: 1.6, t: "void" },
        { op: "disc", x: 60, y: 45, r: 1.5, t: "void" },
        { op: "disc", x: 88, y: 37, r: 1.4, t: "void" },
      ],
    },
    zones: [
      { id: "upper_danger", kind: "danger", tx: 73, ty: 29, r: 72, encounterRate: 0.55, label: "崩れた連絡橋" },
      { id: "upper_chest", kind: "chest", tx: 97, ty: 24.5, r: 14, label: "見張り台の遺品" },
      { id: "stairs_down", kind: "stairs", toLayer: "street", entry: "fromHigh", tx: 40, ty: 45, r: 16, label: "下層街路へ戻る" },
    ],
  };

  // 灰縁の集落の外縁。追放された後に集落へ戻ろうとすると、ここに出る。
  // 柵の外の灰の野原で、柵越しに集落の家並みが見える。閉ざされた門の前には
  // 門番が立っていて、門に近づいた時にだけ拒まれる（そのまま引き返すしかない）。
  var OUTSKIRTS_AREA = {
    label: "灰縁の集落・外縁",
    start: { tx: 50, ty: 35 },
    entryPoints: { hairegion: { tx: 50, ty: 35 } },
    tilemap: {
      cols: 56, rows: 40, seed: 21, rubbleBase: "grass",
      ops: [
        { op: "fill", t: "grass" },
        // 柵の内側（入れない）：集落の家並み
        { op: "hut", x: 5, y: 0, w: 6, h: 5 }, { op: "hut", x: 15, y: 1, w: 6, h: 4 },
        { op: "hut", x: 37, y: 0, w: 6, h: 5 }, { op: "hut", x: 46, y: 1, w: 5, h: 4 },
        { op: "tree", x: 33, y: 3 },
        // 灰の積もった荒れ地
        { op: "disc", x: 10, y: 30, r: 7, t: "lot" }, { op: "disc", x: 40, y: 21, r: 6, t: "lot" }, { op: "disc", x: 22, y: 36, r: 4, t: "lot" },
        // 門から東の廃区画へ延びる道と、脇道
        { op: "line", pts: [[27.5, 7], [27.5, 18], [40, 28], [57, 35]], w: 4, t: "dirt" },
        { op: "line", pts: [[27.5, 18], [14, 26]], w: 3, t: "dirt" },
        // 集落を囲う柵と、閉ざされた門
        { op: "rect", x: 0, y: 6, w: 56, h: 1, t: "fence" },
        { op: "gate", x: 26, y: 6, w: 4 },
        // 外縁の果て：崩れた瓦礫の土手（東の道だけが開いている）
        { op: "line", pts: [[0.5, 7], [0.5, 40]], w: 3, t: "rubble" },
        { op: "line", pts: [[0, 39], [56, 39]], w: 3, t: "rubble" },
        { op: "line", pts: [[55.5, 7], [55.5, 31]], w: 2.4, t: "rubble" },
        { op: "disc", x: 18, y: 14, r: 1.8, t: "rubble" }, { op: "disc", x: 44, y: 12, r: 2.2, t: "rubble" },
        { op: "disc", x: 33, y: 31, r: 1.6, t: "rubble" }, { op: "disc", x: 8, y: 18, r: 2, t: "rubble" },
        { op: "scatter", t: "rubble", on: ["grass", "lot"], count: 50, keep: 4 },
        { op: "tree", x: 6, y: 11 }, { op: "tree", x: 21, y: 24 }, { op: "tree", x: 36, y: 15 }, { op: "tree", x: 47, y: 18 },
        { op: "tree", x: 12, y: 35 }, { op: "tree", x: 45, y: 29 }, { op: "tree", x: 30, y: 36 },
      ],
    },
    zones: [
      { id: "gate_guard", kind: "talk", sprite: "guard", tx: 27.5, ty: 8.6, r: 26, label: "集落の門", pushBack: { tx: 27.5, ty: 13 } },
      { id: "exit_hairegion", kind: "exit", to: "hairegion", tx: 55.2, ty: 35, r: 24, dir: "e", steps: 10, label: "廃区画方面へ" },
    ],
  };

  // 招竜の祭壇＝入口の外殿（ground）と、カガリと対峙する奥の内殿（inner）の2階層。
  // inner の階段は、カガリを倒した後は「外へ出る」に化ける（もう外殿を歩き直す必要はない）。
  var SHRINE_FLOORS = {
    ground: {
      start: { x: 1, y: 7, dir: 0 },
      grid: [
        ["wall", "wall", "wall", "wall", "wall", "wall", "wall"],
        ["wall", "floor", "floor", "chest", "floor", "floor", "wall"],
        ["wall", "floor", "wall", "wall", "wall", "floor", "wall"],
        ["wall", "floor", "wall", "wall", "wall", "floor", "wall"],
        ["wall", "floor", "wall", "wall", "wall", "floor", "wall"],
        ["wall", "floor", "wall", "wall", "wall", "floor", "wall"],
        ["wall", "floor", "floor", "encounter", "floor", "floor", "wall"],
        ["wall", "exit", "wall", "wall", "wall", "stairs:inner", "wall"],
      ],
    },
    inner: {
      start: { x: 2, y: 6, dir: 0 },
      grid: [
        ["wall", "wall", "wall", "wall", "wall", "wall", "wall"],
        ["wall", "floor", "floor", "event:kagari", "floor", "floor", "wall"],
        ["wall", "floor", "wall", "wall", "wall", "floor", "wall"],
        ["wall", "chest", "floor", "floor", "floor", "floor", "wall"],
        ["wall", "floor", "wall", "wall", "wall", "floor", "wall"],
        ["wall", "floor", "floor", "floor", "floor", "floor", "wall"],
        ["wall", "wall", "stairs:ground", "wall", "wall", "wall", "wall"],
      ],
    },
  };

  function run(appEl, gameState, endCallback) {
    app = appEl; game = gameState; onChapterEnd = endCallback;
    Story.play(app, wakeBeats, function () { enterVillage(); });
  }

  var wakeBeats = [
    { kind: "header", text: "第一章　灰縁（はいべり）の集落", bg: "village" },
    { kind: "narration", text: "人工天井の裂け目から薄暮が差し込む。二つに割れた月が、いつまでも同じ高さで止まっている。竜の脅威圏の縁に築かれた小さな集落――灰縁。" },
    { kind: "header", text: "セオの住居", bg: "house" },
    { speaker: "ミラ", text: "セオ、起きて。今日は「くじ」の日でしょ。寝坊したら承知しないから。" },
    { kind: "choice", prompt: "（ミラに何と返す？　――何を選んでも、話の筋は変わらない）", options: ["「わかってる。今起きる」", "「……くじ、か」と呟く", "何も言わず起き上がる"] },
    { kind: "choice", prompt: "ミラは肩をすくめて、先に外へ出ていった。棚には〈干し肉〉と〈古びた回復薬〉が置かれている。戸口を出ると、くじの刻限まではまだ間があった。", options: ["外へ出る"] },
  ];

  function addItem(id, n) {
    game.items = game.items || {};
    game.items[id] = (game.items[id] || 0) + (n || 1);
  }

  var villageArea = null;

  var villageTaken = {};
  function enterVillage(pos) {
    place = { kind: "village" };
    resumePlace = function () { villageArea.render(); };
    villageArea = Explore.startFreeArea(app, pos ? Object.assign({}, HAIBERI_VILLAGE, { start: pos }) : HAIBERI_VILLAGE, game, {
      openMenu: openMenu,
      onExit: function () { Story.play(app, kujiBeats, afterKuji); },
      onTalk: function (zone, next) {
        Story.play(app, [{ speaker: zone.speaker, text: zone.text, bg: "village" }], next);
      },
      onChest: function (zoneId, next) {
        if (zoneId === "house_shelf") {
          addItem("dried_meat"); addItem("old_potion");
          Story.play(app, [
            { kind: "narration", text: "棚の〈干し肉〉と〈古びた回復薬〉を荷に入れた。" },
            { kind: "narration", text: "（持ち物は「メニュー」の「持ち物」から使える）" },
          ], next);
          return;
        }
        addItem("crystal_double_slash");
        Story.play(app, [
          { kind: "narration", text: "木箱の奥に、古い記憶結晶が仕舞われていた。〈二連撃の記憶結晶〉を手に入れた。" },
          { kind: "narration", text: "（記憶結晶は、持ち物から使うと、選んだ仲間がその技を覚える）" },
        ], next);
      },
      onEncounter: function (next) {
        runBattle(["ash_rat"], "灰ネズミとの戦い", true, next);
      },
    }, villageTaken);
  }

  var kujiBeats = [
    { kind: "header", text: "集落中央広場・くじ", bg: "plaza" },
    { kind: "narration", text: "招竜派の祭司カガリが、儀式めいた仕草で木札の箱を掲げる。集落中が息を呑んで見守る。" },
    { speaker: "カガリ", text: "此度の供物は……セオ、お前だ。" },
    { kind: "narration", text: "どよめきが走る。連行しようとする信徒たちの手が伸びる――その時だった。" },
    { speaker: "ミラ", text: "待って。……私が行く。" },
    { kind: "narration", text: "ミラが割って入り、信徒の手を自ら取った。止める間もなく、彼女は祭壇へ向けて連れ去られていく。" },
    { speaker: "カガリ", text: "殊勝な心がけだ。竜もきっと喜ぶだろう。" },
    { kind: "header", text: "集落長の家", bg: "chief" },
    { kind: "choice", prompt: "集落長トキに詰め寄る。", options: ["「ミラを取り戻しに行く」", "「見過ごせるわけがないだろう」"] },
    { kind: "narration", text: "トキは長く沈黙した後、絞り出すように言った。" },
    { speaker: "集落長トキ", text: "くじは絶対だ。逆らえば、集落ごと竜に潰される。……行くなら、二度と帰ってくるな。" },
    { kind: "narration", text: "追放。それが答えだった。家に戻ると、誰の仕業か〈携行食×3〉が黙って置かれていた。" },
    { kind: "header", text: "集落の門", bg: "gate" },
    { kind: "narration", text: "門を出ると、荒れ果てた広域の景色が広がった。目的地は招竜の祭壇。もう振り返る場所はない。" },
  ];

  var worldMap = null;
  var hairegionArea = null;
  var hairegionCleared = false;
  // 廃区画も祭壇と同じく、出口から出た後にノードとしてクリックし直しても
  // 中へ戻れなくなっていた。取得済みの宝箱等の状態を保ったまま再入場
  // できるように記憶しておく。
  var hairegionTaken = {};

  // ワールドマップは、ファストトラベルの時にしか開かない。ふだんの移動は、
  // エリアの出口を歩いて抜けると、つながった先の場所へそのまま入る。
  // 地図そのもの（現在地・訪れた場所・ファストトラベルの歩数計算）は
  // 画面に出さずに持っておく。
  function afterKuji() {
    addItem("ration", 3);
    game.flags.exiled = true;
    createWorld();
    // くじの後、門を出たそのままの場所＝集落の外縁に立つ
    enterOutskirts();
  }
  function createWorld() {
    worldMap = Explore.createWorldMap(app, WORLD, game, {
      fastTravelOnly: true,
      onArrive: function (id) { enterPlace(id, null); },
      onCancel: function () { if (resumePlace) resumePlace(); },
    });
  }

  // いまいる場所へ戻る（メニューやファストトラベルの地図を閉じた時）
  var resumePlace = null;
  // いまいる場所（セーブのため）。kind: village / outskirts / hairegion / shrine
  var place = null;
  var PLACE_LABEL = { village: "灰縁の集落", outskirts: "灰縁の集落・外縁", hairegion: "廃区画", shrine: "招竜の祭壇" };

  function openMenu() {
    RPG.Menu.open(app, game, {
      placeLabel: placeLabel(),
      onClose: function () { if (resumePlace) resumePlace(); },
      fastTravel: worldMap ? FAST_TRAVEL : null,
      onSave: function () {
        return RPG.Save.write({ version: 1, savedAt: Date.now(), placeLabel: placeLabel(), game: RPG.Save.packGame(game), chapter: snapshot() });
      },
      onLoad: function () { RPG.Game.loadSaved(); },
    });
  }
  function placeLabel() {
    if (!place) return "";
    if (place.kind === "hairegion") return place.layer === "upper" ? "廃区画・高架歩道" : "廃区画・下層街路";
    if (place.kind === "shrine") return "招竜の祭壇・" + (place.floor === "inner" ? "内殿" : "外殿");
    return PLACE_LABEL[place.kind];
  }

  // セーブする内容：いる場所と位置、ワールドマップの現在地と訪れた場所、
  // 各エリアで取った宝箱など、この章の進み具合
  function snapshot() {
    var snap = {
      place: place.kind, layer: place.layer, floor: place.floor,
      villageTaken: villageTaken, hairegionTaken: hairegionTaken, hairegionCleared: hairegionCleared,
      shrineFloorId: shrineFloorId, shrineFloorVisited: shrineFloorVisited,
      world: worldMap ? { current: worldMap.current, visited: worldMap.visited } : null,
    };
    var area = place.kind === "village" ? villageArea : place.kind === "outskirts" ? outskirtsArea : place.kind === "hairegion" ? hairegionArea : null;
    if (area) snap.pos = { x: area.pos.x, y: area.pos.y };
    if (place.kind === "shrine" && shrineDungeon) snap.dpos = { x: shrineDungeon.x, y: shrineDungeon.y, dir: shrineDungeon.dir };
    return JSON.parse(JSON.stringify(snap));
  }

  // セーブした場所から再開する
  function resume(appEl, gameState, snap, endCallback) {
    app = appEl; game = gameState; onChapterEnd = endCallback;
    villageTaken = snap.villageTaken || {};
    hairegionTaken = snap.hairegionTaken || {};
    hairegionCleared = !!snap.hairegionCleared;
    shrineFloorId = snap.shrineFloorId || "ground";
    shrineFloorVisited = snap.shrineFloorVisited || { ground: {}, inner: {} };
    worldMap = null;
    if (snap.world) {
      createWorld();
      worldMap.current = snap.world.current;
      worldMap.visited = snap.world.visited;
    }
    if (snap.place === "village") enterVillage(snap.pos);
    else if (snap.place === "outskirts") enterOutskirts(snap.pos);
    else if (snap.place === "hairegion") enterHairegion(null, snap.layer, null, snap.pos);
    else enterShrineFloor(snap.floor || shrineFloorId, snap.dpos);
  }
  var FAST_TRAVEL = {
    available: function () {
      return WORLD.nodes.some(function (n) { return n.id !== worldMap.current && worldMap.visited[n.id] && n.fastTravel !== false; });
    },
    open: function () { worldMap.render(); },
  };

  // エリアの出口を抜けて、つながった先の場所へ入る
  function goTo(id, fromId) {
    var firstVisit = !worldMap.visited[id];
    worldMap.current = id;
    worldMap.visited[id] = true;
    enterPlace(id, fromId, firstVisit);
  }

  // 祭壇へ続く道（祭壇⇔隘路は危険な道。歩数を使い、はぐれ賊に出くわすことがある）
  function walkRoad(text, steps, rate, then) {
    game.steps += steps;
    Story.play(app, [{ kind: "narration", bg: "narrow", text: text }], function () {
      if (Math.random() < rate) { runBattle(["straggler_bandit"], "はぐれ賊", false, then); return; }
      then();
    });
  }

  function enterPlace(id, fromId, firstVisit) {
    // 灰縁の集落はくじの前にしか歩けない。追放後は集落の外縁に出て、
    // 門に近づくと、集落長の命を受けた門番に押し戻される。
    if (id === "haiberi") { enterOutskirts(); return; }
    if (id === "hairegion") {
      var enter = function () { enterHairegion(fromId); };
      if (!hairegionCleared) {
        Story.play(app, [
          { kind: "header", text: "廃区画", bg: "ruins" },
          { kind: "narration", text: "崩れた区画の入り口に着いた。瓦礫に埋もれた道の先に何があるのかは、まだ分からない。" },
        ], enter);
      } else {
        enter();
      }
      return;
    }
    // 焼けた集落跡は、廃区画の北の端から覗く行き止まりの寄り道。
    // 見終えたら、廃区画の北の出口の前に戻る。
    if (id === "yaketa") {
      var back = function () { worldMap.current = "hairegion"; enterHairegion("yaketa"); };
      if (firstVisit) {
        Story.play(app, [{ kind: "narration", bg: "ruins", text: "集落跡の中央に、黒く焼け焦げた石碑が残っていた。文字は読み取れない。ただ、ここで何かが起き、住人が忽然といなくなったことだけは伝わってくる。" }], back);
      } else {
        Story.play(app, [{ kind: "narration", bg: "ruins", text: "焼け焦げた石碑は、前に見た時のまま黙っていた。" }], back);
      }
      return;
    }
    if (id === "michi") {
      if (firstVisit) { Story.play(app, roadBeats, afterRoad); return; }
      walkRoad("瓦礫の隘路を抜け、招竜の祭壇へ向かう。", 15, 0.2, function () { goTo("saidan", "michi"); });
      return;
    }
    // 祭壇は、出た時にいたフロア（記憶した探索状況込み）へ入り直す
    if (id === "saidan") { enterShrineFloor(shrineFloorId); return; }
  }

  // 集落の外縁を歩く。門に近づくと門番に拒まれ、門の前から押し戻される。
  // 帰り道は、東の「廃区画方面へ」を歩いて抜けるしかない。
  var outskirtsArea = null;
  function enterOutskirts(pos) {
    place = { kind: "outskirts" };
    resumePlace = function () { outskirtsArea.render(); };
    outskirtsArea = Explore.startFreeArea(app, pos ? Object.assign({}, OUTSKIRTS_AREA, { start: pos }) : OUTSKIRTS_AREA, game, {
      openMenu: openMenu,
      onExit: function (to) { goTo(to, "haiberi"); },
      onTalk: function (zone, next) {
        Story.play(app, [
          { kind: "narration", bg: "gateClosed", text: "門番が槍の柄で道を塞いだ。" },
          { speaker: "門番", text: "集落長の命だ。追放された者を通すわけにはいかない。" },
        ], function () {
          if (zone.pushBack) outskirtsArea.pos = { x: zone.pushBack.tx * 16, y: zone.pushBack.ty * 16 };
          next();
        });
      },
    });
  }

  function enterHairegion(fromNodeId, layerId, entryId, pos) {
    hairegionCleared = true;
    var areaTemplate = layerId === "upper" ? HAIREGION_UPPER_AREA : HAIREGION_AREA;
    var entry = pos || areaTemplate.entryPoints[entryId] || areaTemplate.entryPoints[fromNodeId] || areaTemplate.start;
    var areaData = Object.assign({}, areaTemplate, { start: entry, arrivedByStairs: !!entryId });
    place = { kind: "hairegion", layer: layerId === "upper" ? "upper" : "street" };
    resumePlace = function () { hairegionArea.render(); };
    hairegionArea = Explore.startFreeArea(app, areaData, game, {
      openMenu: openMenu,
      onExit: function (to) { goTo(to, "hairegion"); },
      onStairs: function (toLayer, toEntry) { enterHairegion(null, toLayer, toEntry); },
      onChest: function (zoneId, next) {
        if (zoneId === "chest1") {
          addItem("crystal_naginata");
          Story.play(app, [{ kind: "narration", text: "崩れた住居跡の奥に、記憶結晶が埋もれていた。〈薙刀払いの記憶結晶〉を手に入れた。" }], next);
          return;
        }
        addItem("potion");
        Story.play(app, [{ kind: "narration", text: zoneId === "chest2" ? "荷箱の底に〈回復薬〉が一つ残っていた。" : "見張り台に置き去りにされた荷から、〈回復薬〉を見つけた。" }], next);
      },
      onEncounter: function (next) {
        runBattle(["straggler_bandit"], "はぐれ賊", false, next);
      },
    }, hairegionTaken);
  }

  var roadBeats = [
    { kind: "header", text: "祭壇へ続く隘路", bg: "narrow" },
    { kind: "narration", text: "赤い羽を持つ鳥人が、前触れもなく道を塞いだ。絶滅したはずの種族が、目の前に立っている。素足のまま瓦礫を踏みしめ、鋭い目でセオを見据える。" },
    { speaker: "赤い鳥人", text: "そこを通してもらう。お前に用はないが、邪魔なら退かす。" },
  ];

  function afterRoad() {
    runBattle(["tzelf_ambush"], "赤い鳥人との死闘", true, afterTzelfFight);
  }

  function afterTzelfFight() {
    Story.play(app, teamUpBeats, afterTeamUp);
  }

  var teamUpBeats = [
    { kind: "narration", bg: "narrow", text: "セオは膝をつく。勝てる相手ではなかった。だが鳥人はとどめを刺さず、剣を収めた。" },
    { speaker: "赤い鳥人", text: "……招竜派の祭壇に用があるのはこっちも同じだ。今は敵対する理由がないだけだ。" },
    { kind: "choice", prompt: "利害が一致した、ということらしい。", options: ["「好都合だ」と手を貸す", "黙って頷く"] },
    { kind: "narration", text: "こうして二人は、目的の違う共闘を始めた。祭壇の入口はすぐそこだった。" },
  ];

  var shrineDungeon = null;
  var shrineFloorId = "ground";
  // フロアごとの探索済みマスを保持し、行き来しても自動地図の記憶が消えないようにする
  var shrineFloorVisited = { ground: {}, inner: {} };

  function afterTeamUp() {
    game.party.push(Battle.createCombatant("tzelf", false));
    worldMap.current = "saidan";
    worldMap.visited.saidan = true;
    enterShrineFloor("ground");
  }

  function enterShrineFloor(floorId, dpos) {
    shrineFloorId = floorId;
    place = { kind: "shrine", floor: floorId };
    resumePlace = function () { shrineDungeon.render(); };
    var floorData = dpos ? Object.assign({}, SHRINE_FLOORS[floorId], { start: dpos }) : SHRINE_FLOORS[floorId];
    shrineDungeon = Explore.start(app, floorData, game, {
      openMenu: openMenu,
      // 祭壇を出たら、隘路を引き返して廃区画の東の出口の前へ戻る
      onExit: function () {
        walkRoad("祭壇を後にし、瓦礫の隘路を引き返す。", 15, 0.2, function () {
          game.steps += 10;
          worldMap.visited.michi = true;
          goTo("hairegion", "michi");
        });
      },
      onEvent: onDungeonEvent,
      onChest: onDungeonChest,
      onEncounter: function () {
        runBattle(["shrine_guard"], "祭壇の守衛", false, function () { shrineDungeon.render(); });
      },
      onStairs: function (targetFloorId) {
        if (targetFloorId === "ground" && game.flags.kagariDefeated) { afterDungeonExit(); return; }
        enterShrineFloor(targetFloorId);
      },
    }, shrineFloorVisited[floorId]);
  }

  // 招竜の祭壇の記憶結晶は〈防御姿勢〉と〈急所狙い〉（装備・入手物まとめ）
  function onDungeonChest() {
    var id = shrineFloorId === "ground" ? "crystal_defense_stance" : "crystal_vital_strike";
    addItem(id);
    Story.play(app, [{ kind: "narration", text: "宝箱を開けた。〈" + RPG.Data.ITEMS[id].name + "〉を手に入れた。" }], function () {
      shrineDungeon.render();
    });
  }

  function onDungeonEvent(id) {
    if (id === "kagari") {
      Story.play(app, kagariPreBeats, function () {
        runBattle(["kagari"], "祭司カガリ", false, afterKagari);
      });
    }
  }

  var kagariPreBeats = [
    { kind: "header", text: "招竜の祭壇", bg: "shrine" },
    { kind: "narration", text: "祭壇の奥、儀式の間近くで信徒たちが最後の詠唱を始めていた。カガリがミラを見下ろしている。" },
    { speaker: "カガリ", text: "此度の供物は、思いのほか良い声で鳴きそうだ。" },
  ];

  function afterKagari() {
    game.flags.kagariDefeated = true;
    Story.play(app, kagariPostBeats, function () {
      shrineDungeon.render();
    });
  }

  var kagariPostBeats = [
    { kind: "narration", bg: "shrine", text: "カガリは崩れ落ちた。儀式は止まり、ミラの拘束が解かれる。" },
    { speaker: "ミラ", text: "……なんで来たの、セオ。" },
    { kind: "choice", prompt: "ミラの問いに答える。", options: ["「置いて生きろって？　できるわけないだろ」", "「決まってるだろ」とだけ言う"] },
    { kind: "narration", text: "ミラは何か言いかけて、結局は小さく笑っただけだった。" },
    { kind: "narration", text: "奪還は成ったが、儀式の余波か、遠くの空に巨大な影がよぎった。灰色の竜だ。誰も、あれには手を出せない。" },
    { speaker: "赤い鳥人", text: "竜は殺せない。挑んだ奴は皆、灰になった。" },
    { kind: "narration", text: "世界が、静かに詰んでいるという事実だけが突きつけられた。祭壇を出よう。" },
  ];

  function afterDungeonExit() {
    game.companions.push("mira");
    Story.play(app, endBeats, function () { onChapterEnd(); });
  }

  var endBeats = [
    { kind: "header", text: "灰縁の集落・門", bg: "gateClosed" },
    { kind: "narration", text: "帰り着いた門は、開かなかった。" },
    { speaker: "集落長トキ", text: "帰ってくるなと言ったはずだ。" },
    { speaker: "ミラ", text: "上等じゃない。こっちから願い下げよ。" },
    { kind: "narration", text: "奪還は成功したのに、帰る場所を失った。帰れない三人が、旅を続ける理由だけがここに残った。" },
    { kind: "narration", text: "赤い鳥人が、ふと口を開いた。" },
    { speaker: "赤い鳥人", text: "……名か。持ったことがない。招竜派に、要らぬものだとずっと言われてきた。" },
    { kind: "narration", text: "ミラは少し考えて、口にした。" },
    { speaker: "ミラ", text: "……ツェルフ、なんてどう？　特に意味はないけど。" },
    { kind: "narration", text: "鳥人は小さく頷いた。理由なんて要らなかった。帰れない者同士になった瞬間、彼は名を得た。" },
  ];

  function runBattle(enemyIds, title, forceProceed, next) {
    app.innerHTML = "";
    var box = document.createElement("div");
    box.className = "battle-screen";
    app.appendChild(box);
    game.items = game.items || {};
    var state = Battle.start(box, game.party, enemyIds, function (result) {
      if (result === "defeat" && !forceProceed) {
        game.party.forEach(function (c) {
          c.hp = c.maxHp; c.mp = c.maxMp; c.defeated = false; c.atb = 0;
        });
        runBattle(enemyIds, title, forceProceed, next);
        return;
      }
      // 経験値は、戦闘不能を戻す前（＝誰が倒れていたか分かるうち）に配る
      var lines = Battle.awardExperience(game.party, state.enemies, RPG.Data.expRate(game.steps, game.stepLimit));
      game.party.forEach(function (c) { c.defeated = false; c.atb = 0; if (c.hp === 0) c.hp = 1; });
      if (!lines.length) { next(); return; }
      Story.play(app, lines.map(function (t) { return { kind: "narration", text: t }; }), next);
    }, { items: game.items });
  }

  return { run: run, resume: resume };
})();
