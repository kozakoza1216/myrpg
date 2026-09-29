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
    safe: true,   // 安全地帯（歩いてもエンカウントしない）
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
    { id: "upper", name: "上層　城壁の歩廊" },
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
      kareno: { tx: 106, ty: 64 },
      fromHigh: { tx: 40, ty: 45 },
    },
    // うろつくはぐれ賊（シンボルエンカウント）
    symbols: [
      { id: "s1", tx: 30, ty: 63 }, { id: "s2", tx: 44, ty: 55 }, { id: "s3", tx: 50, ty: 30 }, { id: "s4", tx: 28, ty: 29 },
      { id: "s5", tx: 70, ty: 62 }, { id: "s6", tx: 86, ty: 49 }, { id: "s7", tx: 100, ty: 40 },
    ],
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
        // 南東の水路沿いに、枯野へ抜ける通り（第二章で旅の先になる）
        { op: "line", pts: [[92, 65], [114, 64]], w: 7, t: "road" },
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
        // 大通りの北に入り込む袋小路。入口を崩れた壁（重い瓦礫）が塞いでいて、奥に宝箱が見える。
        // 怪力でどかせば入れる（攻略チャート第一章⑤。第一章には怪力持ちがいないので、今は通れない）
        { op: "line", pts: [[56, 47], [56, 41]], w: 3, t: "road" },
        { op: "rect", x: 54, y: 44, w: 5, h: 2, t: "rubble", strengthWall: true },
      ],
    },
    zones: [
      { id: "chest1", kind: "chest", tx: 13.5, ty: 23, r: 14, label: "北の住居跡" },
      { id: "chest3", kind: "chest", tx: 56, ty: 42.2, r: 14 },
      { id: "strength_wall", kind: "talk", sprite: "none", tx: 56, ty: 46.6, r: 18, label: "崩れた壁" },
      { id: "chest2", kind: "chest", tx: 91, ty: 68.5, r: 14, label: "水路脇の荷箱" },
      { id: "stairs_up", kind: "stairs", toLayer: "upper", entry: "fromStreet", tx: 40, ty: 45, r: 16, label: "城壁へ上る石段" },
      // 入ってきた側（灰縁の集落方面）へも、他の出口と同じくここを歩いて
      // 踏まないと戻れない。広域マップのノードを直接クリックするだけでは
      // 辿り着けない、この内部を経由してこそ意味のある道にする。
      { id: "exit_haiberi", kind: "exit", to: "haiberi", tx: 1.2, ty: 66, r: 22, dir: "w", steps: 10, label: "灰縁の集落へ" },
      { id: "exit_yaketa", kind: "exit", to: "yaketa", tx: 51, ty: 1.4, r: 22, dir: "n", steps: 15, label: "焼けた集落跡方面（寄り道）" },
      { id: "exit_michi", kind: "exit", to: "michi", tx: 110.8, ty: 38, r: 24, dir: "e", steps: 30, label: "祭壇方面" },
      // 第二章から：枯野へ（廃区画→枯野70歩のうち、区画の中を歩く分を除いた60歩）
      { id: "exit_kareno", kind: "exit", to: "kareno", tx: 110.8, ty: 64, r: 24, dir: "e", steps: 60, label: "枯野方面", fromChapter: 2 },
    ],
  };

  // 下層と同じ廃区画を見下ろす、崩れかけた城壁の歩廊。塔と塔を結ぶ城壁の上を歩く。
  // 下層の街並みは足元に暗く沈んで見えるだけで、歩けるのは歩廊と塔の上だけ（縁から先へは出られない）。
  var HAIREGION_UPPER_AREA = {
    label: "廃区画・城壁の歩廊",
    layer: "upper", layers: HAIREGION_LAYERS,
    start: { tx: 40, ty: 45 },
    entryPoints: { fromStreet: { tx: 40, ty: 45 } },
    underlay: HAIREGION_AREA,
    symbols: [{ id: "u1", tx: 56, ty: 34 }, { id: "u2", tx: 63, ty: 48 }, { id: "u3", tx: 89, ty: 37 }],
    tilemap: {
      cols: 112, rows: 76, seed: 9,
      ops: [
        { op: "fill", t: "void" },
        { op: "line", pts: [[40, 45], [55, 34], [73, 29], [95, 26]], w: 6, t: "walk" },
        { op: "line", pts: [[55, 34], [62, 49], [81, 56]], w: 6, t: "walk" },
        { op: "line", pts: [[73, 29], [90, 38], [102, 37]], w: 6, t: "walk" },
        { op: "disc", x: 40, y: 45, r: 4, t: "deck" },
        { op: "disc", x: 73, y: 29, r: 4.5, t: "deck" },
        { op: "disc", x: 96, y: 25, r: 4, t: "deck" },
        { op: "disc", x: 81, y: 56, r: 4, t: "deck" },
        { op: "disc", x: 102, y: 37, r: 4, t: "deck" },
        // 崩れ落ちた歩廊（穴の脇をすり抜けて進む）
        { op: "disc", x: 65, y: 31, r: 1.6, t: "void" },
        { op: "disc", x: 60, y: 45, r: 1.5, t: "void" },
        { op: "disc", x: 88, y: 37, r: 1.4, t: "void" },
      ],
    },
    zones: [
      { id: "upper_chest", kind: "chest", tx: 97, ty: 24.5, r: 14, label: "見張り塔の遺品" },
      { id: "stairs_down", kind: "stairs", toLayer: "street", entry: "fromHigh", tx: 40, ty: 45, r: 16, label: "下層街路へ戻る" },
    ],
  };

  // 灰縁の集落の外縁。追放された後に集落へ戻ろうとすると、ここに出る。
  // 柵の外の灰の野原で、柵越しに集落の家並みが見える。閉ざされた門の前には
  // 門番が立っていて、門に近づいた時にだけ拒まれる（そのまま引き返すしかない）。
  var OUTSKIRTS_AREA = {
    label: "灰縁の集落・外縁",
    safe: true,   // 安全地帯（集落の柵の外だが、門番の目が届く）
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
  // 踏破歩数は資料の70歩（PLAN ダンジョン内部の踏破歩数）に合わせる：外殿38歩＋内殿32歩＝70歩。
  // 道を間違えたときの損を小さくするため、どちらの階も蛇行する一本道にして、
  // 脇道は1〜2マスの袋小路だけにする（分かれ道から奥の突き当たりまで見える長さ）。
  // 施錠扉（攻略チャート第一章⑧の解錠の"見せ"）は近道ではなく、内殿の広間の脇の宝の小部屋の入口に置く。
  // 開けるには時間（歩数）がかかる＝「その先のお宝に時間を割く価値があるか」を選ばせる（PLAN §8-3b）。
  // 開けなくても祭壇へは行ける（本筋は解錠不要・PLAN §5-2）。
  // 地図の記号：# 壁／. 床／E 出口／S 内殿への階段／U 外殿への階段／C 宝箱／D 施錠扉／K カガリの祭壇
  var SHRINE_TILE = { "#": "wall", ".": "floor", E: "exit", S: "stairs:inner", U: "stairs:ground", C: "chest", D: "locked:altar", K: "event:kagari" };
  var SHRINE_FLOORS = {
    ground: {
      start: { x: 1, y: 11, dir: 1 },
      map: [
        "###########",
        "#.......###",
        "#.##C##.###",
        "#.###...###",
        "#.###.#####",
        "#.###.###S#",
        "#.###.###.#",
        "#.#C#.....#",
        "#.#.#######",
        "#.....#####",
        "#####.#####",
        "#E....#####",
        "###########",
      ],
    },
    inner: {
      start: { x: 6, y: 15, dir: 0 },
      map: [
        "###########",
        "######K####",
        "######.####",
        "###....####",
        "###.#######",
        "###.#######",
        "###....DC##",
        "######.####",
        "######....#",
        "#######C#.#",
        "#########.#",
        "###.......#",
        "###.#######",
        "###....####",
        "######.####",
        "######U####",
        "###########",
      ],
    },
  };
  // 宝箱の中身（場所ごと）。記憶結晶は資料どおり（装備・入手物まとめ：招竜の祭壇＝急所狙い／防御姿勢）。
  // 〈急所狙い〉は施錠扉の奥の小部屋に置く。回復薬・魔石の箱は仮（資料の祭壇の宝箱は装備品だが、装備の仕組みがまだないので消耗品を入れておく）
  var SHRINE_CHESTS = {
    ground: { "3,7": "crystal_defense_stance", "4,2": "potion" },
    inner: { "8,6": "crystal_vital_strike", "7,9": "magic_stone" },
  };
  // 取った宝箱・開けた扉を反映した、その階の地図（探索中に書き換わるので、入るたびに作り直す）
  function shrineGrid(floorId) {
    var taken = shrineTaken[floorId] || {};
    return SHRINE_FLOORS[floorId].map.map(function (row, y) {
      return row.split("").map(function (ch, x) {
        var t = SHRINE_TILE[ch];
        if ((t === "chest" || t.indexOf("locked:") === 0) && taken[x + "," + y]) return "floor";
        return t;
      });
    });
  }

  // ── 時間切れ（PLAN §8-3b） ──
  // 歩数が上限に達したその歩で、竜の活性化が起きる。ゲームオーバーにはしないが、本筋は進めなくなる。
  // その後は強い敵（竜の眷属）が出て、倒しても経験値は入らない。閉ざされていた集落の門が開き、
  // セオの家が「おまけ部屋」になる（二周目スイッチがまだないので、血まみれの部屋＝ボスとの連戦）
  var timeUpBeats = [
    { kind: "header", text: "竜の活性化", bg: "awakening", fx: "quake" },
    { kind: "narration", text: "竜の活性化は誰も止めることはできない。あなたはこの世界で飢えを待つ放浪者となる。", fx: "quake" },
  ];
  function onTimeUp(cont) { Story.play(app, timeUpBeats, cont); }
  function timeUp() { return !!(game.flags && game.flags.timeUp); }
  // 時間切れの後は、どこで出会う敵も竜の眷属に置き換わる
  function foes(ids) { return timeUp() ? ["dragon_kin"] : ids; }
  // 情景は地の文で説明せず、その場にいる仲間の台詞で見せる（ミラ→ツェルフの順に、居る者が言う）。
  // セオは台詞を持たない（PLAN §5-2）ので、ひとりのときだけ短い地の文にする
  function hasMira() { return (game.companions || []).indexOf("mira") >= 0; }
  function hasTzelf() { return game.party.some(function (c) { return c.defId === "tzelf"; }); }
  function tzelfName() { return game.flags && game.flags.named ? "ツェルフ" : "灰色の鳥人"; }
  // 戦闘やメニューに出る名前も、名乗るまでは「灰色の鳥人」（PLAN §7.5-7 で初めて名が付く）
  function syncTzelfName() {
    game.party.forEach(function (c) { if (c.defId === "tzelf") c.name = tzelfName(); });
  }
  function say(bg, lines) {
    // lines：{ mira, tzelf, alone }。居る者の台詞を選ぶ
    if (lines.mira && hasMira()) return { speaker: "ミラ", text: lines.mira, bg: bg };
    if (lines.tzelf && hasTzelf()) return { speaker: tzelfName(), text: lines.tzelf, bg: bg };
    return { kind: "narration", text: lines.alone, bg: bg };
  }

  // ── 第二章（js/chapter2.js）へ渡す、この世界の入口 ──
  var ch2 = null;
  function chapter2() {
    if (!ch2 && RPG.Chapter2) ch2 = RPG.Chapter2.create({
      app: function () { return app; }, game: function () { return game; }, world: WORLD,
      say: say, tzelfName: tzelfName, addItem: addItem, openMenu: openMenu, runBattle: runBattle, foes: foes, timeUp: timeUp,
      setPlace: function (p, resume) { place = p; resumePlace = resume; },
      goTo: goTo,
      enterOutskirts: function (pos) { enterOutskirts(pos); return outskirtsArea; },
      outskirts: function () { return outskirtsArea; },
      chapterEnd: function () { onChapterEnd(); },
    });
    return ch2;
  }

  // ── 灰色竜のランダムエンカウント（PLAN §8-5b）：屋外を移動した歩数ぶん、シードの率で判定する ──
  // 竜の姿を初めて見る第一章⑨までは出さない（第二章から）。時間切れの後も出さない（竜はもう活性化している）
  function dragonHook(n, cont) {
    if ((game.chapter || 1) < 2 || timeUp() || !game.crit || game.crit.dragonRate === undefined) return false;
    for (var i = 0; i < n; i++) {
      if (RPG.Data.seedRoll(game.crit, "dragon") < game.crit.dragonRate) { dragonEncounter(cont); return true; }
    }
    return false;
  }
  // 灰色竜に出くわした：逃げる／立ち向かう。どちらでやり過ごしても、シードが引き直される（§8-5b）
  function dragonEncounter(cont) {
    var reseed = function () { game.crit = RPG.Data.newSeed(); };
    Story.play(app, [
      { kind: "header", text: "灰色竜", bg: "dragon", fx: "shake" },
      say("dragon", { mira: "……っ、あの影……！　灰色竜……！", tzelf: "灰色竜だ。……気づかれたか。", alone: "灰色竜の影が、頭上を覆った。" }),
      hasTzelf() ? { kind: "choice", speaker: tzelfName(), text: "逃げるぞ。……それとも、やる気か。", options: ["逃げる", "立ち向かう"] }
        : { kind: "choice", options: ["逃げる", "立ち向かう"] },
    ], function (c) {
      if (c === 1) {
        // 灰の谷版の灰色竜（bosses.md）。第二章の戦力では届かない壁＝返り討ちが普通。勝てば撃退（引き継ぎエンドは準備中）
        runBattle(["grey_dragon_valley"], "灰色竜", false, function () {
          reseed();
          Story.play(app, [{ kind: "narration", bg: "dragon", text: "灰色竜は翼を広げ、灰の空へ去っていった。" }], cont);
        }, null, "dragon");
        return;
      }
      reseed();
      Story.play(app, [
        say("dragon", { tzelf: "走れ！　振り返るな！", mira: "走って……！", alone: "" }),
        { kind: "narration", bg: "dragon", text: "灰の中を駆け抜け、竜の影を振り切った。" },
      ].filter(function (b) { return b.text; }), cont);
    });
  }

  function run(appEl, gameState, endCallback) {
    app = appEl; game = gameState; onChapterEnd = endCallback;
    Explore.setDragonHook(dragonHook);
    game.onTimeUp = onTimeUp;
    Story.play(app, wakeBeats, function () { enterVillage(); villageArea.playScene(openingScene); });
  }

  var wakeBeats = [
    { kind: "header", text: "第一章　灰縁（はいべり）の集落", bg: "village" },
    { kind: "header", text: "セオの住居", bg: "house" },
    { kind: "choice", speaker: "ミラ", text: "セオ、起きて。今日は「くじ」の日でしょ。寝坊したら承知しないから。", options: ["わかってる", "……くじ、か", "……"] },
    { speaker: "ミラ", text: "竜への供物を決める日だってのに、よく寝られるわね。遅れたら、招竜派の連中に何を言われるか。" },
  ];
  // 家の前：ミラは先に広場へ向かう。歩いていく先を画面が追うので、広場の方角が分かる
  var openingScene = [
    { spawn: "mira", at: { tx: 21, ty: 25.5 }, face: "left" },
    { face: "hero", dir: "right" },
    { say: "ミラ", actor: "mira", text: "棚の干し肉と薬、持っていきなよ。くじまではまだ時間あるから。" },
    { say: "ミラ", actor: "mira", text: "私、先に広場へ行ってる。……遅れないでね。" },
    { camera: "mira" },
    { walk: "mira", speed: 96, to: [{ tx: 28, ty: 25.5 }, { tx: 28, ty: 16.5 }, { tx: 46.5, ty: 16.5 }] },
    { remove: "mira" },
    { camera: "hero" },
    { wait: 600 },
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
            { kind: "narration", text: "〈干し肉〉と〈古びた回復薬〉を手に入れた。" },
            { kind: "narration", text: "（持ち物は「メニュー」の「持ち物」から使える）" },
          ], next);
          return;
        }
        addItem("crystal_double_slash");
        Story.play(app, [
          { kind: "narration", text: "〈二連撃の記憶結晶〉を手に入れた。" },
          { kind: "narration", text: "（記憶結晶は、持ち物から使うと、選んだ仲間がその技を覚える）" },
        ], next);
      },
      onEncounter: function (next) {
        runBattle(["ash_rat"], "灰ネズミとの戦い", true, next, null, null, { tutorial: true });
      },
    }, villageTaken);
  }

  var kujiBeats = [
    { kind: "header", text: "集落中央広場・くじ", bg: "plaza" },
    { speaker: "集落の者", text: "……今度は、誰なんだろうな。" },
    { speaker: "集落の者", text: "うちじゃありませんように……うちじゃありませんように……。" },
    { speaker: "信徒", text: "静まれ。招竜派の祭司、カガリ様がくじを引かれる。" },
    { speaker: "カガリ", text: "供物を捧げれば、竜はこの地を避けて通る。此度も一人を選ぶ。" },
    { speaker: "カガリ", text: "この箱には、灰縁に住む者すべての名を刻んだ木札が入っている。老いも若きも、一人一枚。誰に当たろうと、恨みは無しだ。" },
    { kind: "choice", speaker: "ミラ", text: "……大丈夫。こんなにたくさん札があるんだもの。当たるわけない。", options: ["そうだな", "……"] },
    { speaker: "カガリ", text: "――引く。" },
    { speaker: "カガリ", text: "此度の供物は……" },
    { speaker: "カガリ", text: "セオ。お前だ。", fx: "impact" },
    { speaker: "集落の者", text: "……セオか。……うちじゃ、なかった。" },
    { speaker: "信徒", text: "来い。祭壇まで連れて行く。" },
    { speaker: "ミラ", text: "待って。……私が行く。" },
    { speaker: "カガリ", text: "ほう。供物は一人。誰が座ろうと、竜は構わぬ。" },
    { kind: "choice", speaker: "ミラ", text: "いいでしょ、それで。", options: ["自分が座るべきだった", "なんで代わったんだ", "……"] },
    { speaker: "ミラ", text: "私が座ると決めた。……だから、止めないで。" },
    { speaker: "カガリ", text: "殊勝な心がけだ。竜もきっと喜ぶだろう。連れて行け。" },
    { speaker: "ミラ", text: "……引っ張らないで。自分で歩ける。" },
    { kind: "header", text: "集落長の家", bg: "chief" },
    { kind: "choice", speaker: "集落長トキ", text: "……ミラのことだな。", options: ["取り戻しに行く", "見過ごせない"] },
    { speaker: "集落長トキ", text: "くじは絶対だ。逆らえば、集落ごと竜に潰される。……行くなら、二度と帰ってくるな。" },
    { kind: "header", text: "セオの住居", bg: "house" },
    { kind: "narration", text: "戸口に〈携行食×3〉が置かれていた。" },
    { kind: "header", text: "集落の門", bg: "gate" },
    { speaker: "門番", text: "……祭壇は、東の廃区画を抜けた先だ。行くなら、振り返るな。" },
  ];

  var worldMap = null;
  var hairegionArea = null;
  var hairegionCleared = false;
  // 廃区画も祭壇と同じく、出口から出た後にノードとしてクリックし直しても
  // 中へ戻れなくなっていた。取得済みの宝箱等の状態を保ったまま再入場
  // できるように記憶しておく。
  var hairegionTaken = {};
  // 廃区画で倒したシンボル。外（集落・焼けた集落跡・祭壇方面）から入り直すと復活する（層の行き来では復活しない）
  var hairegionSymbolsDefeated = {};

  // ワールドマップは、ファストトラベルの時にしか開かない。ふだんの移動は、
  // エリアの出口を歩いて抜けると、つながった先の場所へそのまま入る。
  // 地図そのもの（現在地・訪れた場所・ファストトラベルの歩数計算）は
  // 画面に出さずに持っておく。
  function afterKuji() {
    addItem("ration", 3);
    game.flags.exiled = true;
    createWorld();
    // くじの後、門を出たそのままの場所＝集落の外縁に立つ
    Story.play(app, [
      { kind: "narration", bg: "gate", text: "（画面上の「歩数」は、歩くほど増える。" + game.stepLimit + "に達すると竜が活性化し、先へ進めなくなる）" },
      { kind: "narration", text: "（一度訪れた場所へは、メニューの「ファストトラベル」で移れる。減る歩数は、歩いたときと同じ）" },
    ], function () { enterOutskirts(); });
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
  var PLACE_LABEL = { village: "灰縁の集落", villageRuin: "灰縁の集落（竜の活性化のあと）", outskirts: "灰縁の集落・外縁", hairegion: "廃区画", shrine: "招竜の祭壇" };

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
    if (place.ch2 && chapter2()) return ch2.placeLabel(place);
    if (place.kind === "hairegion") return place.layer === "upper" ? "廃区画・城壁の歩廊" : "廃区画・下層街路";
    if (place.kind === "shrine") return "招竜の祭壇・" + (place.floor === "inner" ? "内殿" : "外殿");
    return PLACE_LABEL[place.kind];
  }

  // セーブする内容：いる場所と位置、ワールドマップの現在地と訪れた場所、
  // 各エリアで取った宝箱など、この章の進み具合
  function snapshot() {
    var snap = {
      place: place.kind, layer: place.layer, floor: place.floor,
      villageTaken: villageTaken, hairegionTaken: hairegionTaken, hairegionCleared: hairegionCleared, hairegionSymbolsDefeated: hairegionSymbolsDefeated,
      shrineFloorId: shrineFloorId, shrineFloorVisited: shrineFloorVisited, shrineTaken: shrineTaken, shrineLayout: 4,
      world: worldMap ? { current: worldMap.current, visited: worldMap.visited } : null,
      ch2: ch2 ? ch2.snapshot() : null,
    };
    var area = place.kind === "village" ? villageArea : place.kind === "villageRuin" ? villageRuinArea : place.kind === "outskirts" ? outskirtsArea : place.kind === "hairegion" ? hairegionArea : null;
    if (area) snap.pos = { x: area.pos.x, y: area.pos.y };
    if (place.kind === "shrine" && shrineDungeon) snap.dpos = { x: shrineDungeon.x, y: shrineDungeon.y, dir: shrineDungeon.dir };
    return JSON.parse(JSON.stringify(snap));
  }

  // セーブした場所から再開する
  function resume(appEl, gameState, snap, endCallback) {
    app = appEl; game = gameState; onChapterEnd = endCallback;
    Explore.setDragonHook(dragonHook);
    game.crit = RPG.Data.upgradeSeed(game.crit);
    game.onTimeUp = onTimeUp;
    syncTzelfName();
    villageTaken = snap.villageTaken || {};
    hairegionTaken = snap.hairegionTaken || {};
    hairegionCleared = !!snap.hairegionCleared;
    hairegionSymbolsDefeated = snap.hairegionSymbolsDefeated || {};
    shrineFloorId = snap.shrineFloorId || "ground";
    // 前の版の祭壇の記録では、歩いた跡と位置が今の地図に合わないので、跡は消して宝箱だけ持ち越さない
    var sameLayout = snap.shrineLayout === 4;
    shrineFloorVisited = sameLayout && snap.shrineFloorVisited || { ground: {}, inner: {} };
    shrineTaken = sameLayout && snap.shrineTaken || { ground: {}, inner: {} };
    worldMap = null;
    // 第二章に入っていれば、広域マップに第二章の場所を足し、その章の進み具合を戻す
    if ((game.chapter || 1) >= 2 && chapter2()) ch2.restore(snap.ch2);
    if (snap.world) {
      createWorld();
      worldMap.current = snap.world.current;
      worldMap.visited = snap.world.visited;
    }
    if (ch2 && ch2.handlesPlace(snap.place) && ch2.resumeSaved(snap.ch2) !== false) return;
    if (snap.place === "village") enterVillage(snap.pos);
    else if (snap.place === "villageRuin") enterVillageRuin(snap.pos);
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
    var go = function () {
      Story.play(app, [text.speaker || text.kind ? text : { kind: "narration", bg: "narrow", text: text }], function () {
        if (Math.random() < rate) { runBattle(foes(["straggler_bandit"]), timeUp() ? "竜の眷属" : "はぐれ賊", false, then); return; }
        then();
      });
    };
    if (Explore.checkTimeUp(game, go)) return;
    go();
  }

  function enterPlace(id, fromId, firstVisit) {
    if (chapter2() && ch2.handles(id)) { ch2.enterPlace(id, fromId, firstVisit); return; }
    // 灰縁の集落はくじの前にしか歩けない。追放後は集落の外縁に出て、
    // 門に近づくと、集落長の命を受けた門番に押し戻される。
    if (id === "haiberi") { enterOutskirts(); return; }
    if (id === "hairegion") {
      var enter = function () { enterHairegion(fromId); };
      if (!hairegionCleared) {
        Story.play(app, [
          { kind: "header", text: "廃区画", bg: "ruins" },
          { kind: "narration", text: "（うろつく賊の影に触れると戦いになる。近づくと追ってくる）" },
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
        Story.play(app, [say("ruins", { mira: "焼けた石碑……文字、読めないね。ここの人たち、どこへ行っちゃったんだろ。", tzelf: "文字は焼け潰れている。何があったにせよ、ここの住人はもういない。", alone: "黒く焼けた石碑。文字は読めない。" })], back);
      } else {
        Story.play(app, [say("ruins", { mira: "……やっぱり、誰もいない。", tzelf: "前と変わらん。行くぞ。", alone: "石碑は黙ったままだ。" })], back);
      }
      return;
    }
    // 時間切れの後は、祭壇へ向かう本筋が閉ざされる
    if ((id === "michi" || id === "saidan") && timeUp()) {
      Story.play(app, [say("narrow", { mira: "息が……苦しい。この先、もう無理よ。", tzelf: "竜の瘴気だ。この先へは行けない。", alone: "隘路は竜の瘴気に呑まれていた。先へは進めない。" })], function () {
        worldMap.current = "hairegion"; enterHairegion("michi");
      });
      return;
    }
    if (id === "michi") {
      if (firstVisit) { Story.play(app, roadBeats, afterRoad); return; }
      walkRoad(say("narrow", { tzelf: "祭壇はこの先だ。遅れるなよ。", alone: "隘路を抜け、祭壇へ向かう。" }), 15, 0.2, function () { goTo("saidan", "michi"); });
      return;
    }
    // 祭壇は、出た時にいたフロア（記憶した探索状況込み）へ入り直す
    if (id === "saidan") { enterShrineFloor(shrineFloorId); return; }
  }

  // 時間切れの後の灰縁の集落。人は消え、セオの家が「おまけ部屋」への入口になる（安全地帯のまま）
  var villageRuinArea = null, villageRuinTaken = {};
  function enterVillageRuin(pos) {
    place = { kind: "villageRuin" };
    resumePlace = function () { villageRuinArea.render(); };
    var data = Object.assign({}, HAIBERI_VILLAGE, {
      label: "灰縁の集落（竜の活性化のあと）",
      start: pos || { tx: 43, ty: 16.5 },
      zones: [
        { id: "bonus", kind: "talk", tx: 19, ty: 24.6, r: 14, label: "セオの家（血に濡れた戸口）" },
        { id: "exit_out", kind: "exit", to: "outskirts", tx: 46.5, ty: 16.5, r: 22, dir: "e", steps: 0, label: "集落の外縁へ" },
      ],
    });
    var start = function () {
      villageRuinArea = Explore.startFreeArea(app, data, game, {
        openMenu: openMenu,
        onExit: function () { enterOutskirts({ tx: 27.5, ty: 13 }); },
        onTalk: function (zone, next) { bonusRoom(next); },
      }, villageRuinTaken);
    };
    if (!game.flags.ruinSeen) {
      game.flags.ruinSeen = true;
      Story.play(app, [say("village", { mira: "……誰もいない。みんな、どこへ行ったの……？", tzelf: "人の気配がない。灰だけだ。", alone: "集落には、灰だけが積もっていた。" })], start);
      return;
    }
    start();
  }

  // おまけ部屋（二周目スイッチOFF＝血まみれの部屋）：歴代ボスの連戦。倒しても経験値は入らない＝挑戦ではなく処刑。
  // いま連戦に並ぶのは、実装済みのボス（カガリ）だけ。ボスが増えたらここへ足す
  var BOSS_RUSH = [{ id: "kagari", title: "祭司カガリ" }];
  var bonusBeats = [
    { kind: "header", text: "おまけ部屋", bg: "bloodroom" },
  ];
  function bonusRoom(back) {
    var beats = bonusBeats.concat([
      say("bloodroom", { mira: "ここ……セオの家、なのに。床も壁も、全部……血？", tzelf: "血の匂いだ。……奥に何かいる。", alone: "見慣れた部屋が、血に濡れていた。" }),
      { kind: "choice", speaker: "影", text: "時間切れになるまで歩き続けられたのなら、さぞ腕を磨いてきたのだろう。――その成果を、見せてみろ。", options: ["挑む", "引き返す"] },
    ]);
    Story.play(app, beats, function (choice) {
      if (choice === 1) { back(); return; }
      var i = 0;
      (function nextBoss() {
        if (i >= BOSS_RUSH.length) {
          Story.play(app, [{ speaker: "影", bg: "bloodroom", text: "……それで、何が変わる。竜は、誰にも止められない。" }], back);
          return;
        }
        var b = BOSS_RUSH[i++];
        runBattle([b.id], b.title + "（おまけ部屋）", false, nextBoss, null, "bloodroom");
      })();
    });
  }

  // 集落の外縁を歩く。門に近づくと門番に拒まれ、門の前から押し戻される。
  // 帰り道は、東の「廃区画方面へ」を歩いて抜けるしかない。
  var outskirtsArea = null;
  function enterOutskirts(pos) {
    place = { kind: "outskirts" };
    resumePlace = function () { outskirtsArea.render(); };
    // 第二章の始め：発とうとするツェルフが外縁に立っている（同行が決まるまで）
    var extra = chapter2() && ch2.outskirtsExtra ? ch2.outskirtsExtra() : null;
    var data = Object.assign({}, OUTSKIRTS_AREA, pos ? { start: pos } : {}, extra ? { zones: OUTSKIRTS_AREA.zones.concat(extra.zones) } : {});
    outskirtsArea = Explore.startFreeArea(app, data, game, {
      openMenu: openMenu,
      onExit: function (to) {
        if (extra && extra.onExit && !(game.flags && game.flags.ch2Joined)) { extra.onExit(to, function () { outskirtsArea.render(); }); return; }
        goTo(to, "haiberi");
      },
      onTalk: function (zone, next) {
        if (extra && extra.onTalk(zone, next)) return;
        if (timeUp()) {
          Story.play(app, [say("gate", { mira: "門が開いてる……。見張りも、いない。", tzelf: "門番がいない。……開いたままだ。", alone: "門は開いたままだ。門番はいない。" })], function () { enterVillageRuin(); });
          return;
        }
        Story.play(app, [
          { speaker: "門番", bg: "gateClosed", text: "止まれ。集落長の命だ。追放された者を通すわけにはいかない。" },
        ], function () {
          if (zone.pushBack) outskirtsArea.pos = { x: zone.pushBack.tx * 16, y: zone.pushBack.ty * 16 };
          next();
        });
      },
    });
  }

  // 崩れた壁をどかした後の下層の地図（壁の瓦礫を除いた設計図。地形は設計図ごとに一度だけ作られるので、別に持つ）
  var hairegionOpenedArea = null;
  function hairegionStreetArea() {
    if (!hairegionTaken.strength_wall) return HAIREGION_AREA;
    if (!hairegionOpenedArea) {
      var tm = HAIREGION_AREA.tilemap;
      hairegionOpenedArea = Object.assign({}, HAIREGION_AREA, {
        tilemap: { cols: tm.cols, rows: tm.rows, seed: tm.seed, ops: tm.ops.filter(function (op) { return !op.strengthWall; }) },
      });
    }
    return hairegionOpenedArea;
  }

  // 探索技能（解錠・怪力・慧眼）を持つ仲間（PLAN §5-2。一人一個）
  function partyWithSkill(skill) {
    return game.party.filter(function (c) { return (Data.CHARACTERS[c.defId] || {}).exploreSkill === skill; });
  }

  // 崩れた壁：怪力を持つ仲間がいればどかす（時間は「難度×5÷怪力を持つ人数」・PLAN §8-3b）。
  // 難度は資料にないため仮に1。誰が動かしても同じ場面になるよう、地の文で「〇〇は瓦礫をどかした。」とだけ出す
  var STRENGTH_WALL_DIFFICULTY = 1;
  function onStrengthWall(next) {
    var movers = partyWithSkill("strength");
    if (!movers.length) {
      Story.play(app, [{ kind: "narration", text: "崩れた壁が道を塞いでいる。奥に何かあるが、重くて動かせない。" }], next);
      return;
    }
    var cost = Math.ceil(STRENGTH_WALL_DIFFICULTY * 5 / movers.length);
    Story.play(app, [{ kind: "narration", text: movers[0].name + "は瓦礫をどかした。" }], function () {
      hairegionTaken.strength_wall = true;
      game.steps += cost;
      var here = { x: hairegionArea.pos.x, y: hairegionArea.pos.y };
      var reenter = function () { enterHairegion(null, "street", null, here); };
      if (Explore.checkTimeUp(game, reenter)) return;
      reenter();
    });
  }

  function enterHairegion(fromNodeId, layerId, entryId, pos) {
    hairegionCleared = true;
    var areaTemplate = layerId === "upper" ? HAIREGION_UPPER_AREA : hairegionStreetArea();
    var entry = pos || areaTemplate.entryPoints[entryId] || areaTemplate.entryPoints[fromNodeId] || areaTemplate.start;
    if (fromNodeId) hairegionSymbolsDefeated = {};
    var areaData = Object.assign({}, areaTemplate, { start: entry, arrivedByStairs: !!entryId, symbolDefeated: hairegionSymbolsDefeated,
      zones: (areaTemplate.zones || []).filter(function (z) { return !z.fromChapter || (game.chapter || 1) >= z.fromChapter; }) });
    place = { kind: "hairegion", layer: layerId === "upper" ? "upper" : "street" };
    resumePlace = function () { hairegionArea.render(); };
    hairegionArea = Explore.startFreeArea(app, areaData, game, {
      openMenu: openMenu,
      onExit: function (to) { goTo(to, "hairegion"); },
      onStairs: function (toLayer, toEntry) { enterHairegion(null, toLayer, toEntry); },
      onTalk: function (zone, next) {
        if (zone.id === "strength_wall") { onStrengthWall(next); return; }
        next();
      },
      onChest: function (zoneId, next) {
        if (zoneId === "chest1") {
          addItem("crystal_naginata");
          Story.play(app, [{ kind: "narration", text: "〈薙刀払いの記憶結晶〉を手に入れた。" }], next);
          return;
        }
        addItem("potion");
        Story.play(app, [{ kind: "narration", text: "〈回復薬〉を手に入れた。" }], next);
      },
      // シンボルに触れた：はぐれ賊と戦う。勝てばそのシンボルは消える（全滅はゲームオーバー）
      onSymbol: function (symbolId, done) {
        runBattle(foes(["straggler_bandit"]), timeUp() ? "竜の眷属" : "はぐれ賊", false, function () {
          hairegionSymbolsDefeated[symbolId] = true;
          done(true);
        });
      },
    }, hairegionTaken);
  }

  var roadBeats = [
    { kind: "header", text: "祭壇へ続く隘路", bg: "narrow" },
    { kind: "choice", speaker: "灰色の鳥人", text: "灰縁の人間か。この先は招竜派の祭壇だ。信徒の使いなら、ここで止める。", options: ["鳥人……？", "通してくれ", "……"] },
    { speaker: "灰色の鳥人", text: "どうでもいい。退かないなら、退かすまでだ。" },
  ];

  function afterRoad() {
    // セオでは勝てない設計。灰色の鳥人の攻撃を3回しのぐか、HPを半分まで削れば打ち切り（攻略チャート第一章⑥。回数と割合は資料に数値がないため仮）
    runBattle(["tzelf_ambush"], "灰色の鳥人との死闘", true, afterTzelfFight, { enemyActions: 3, enemyHpRatio: 0.5 }, "narrow");
  }

  function afterTzelfFight() {
    Story.play(app, teamUpBeats, afterTeamUp);
  }

  var teamUpBeats = [
    { speaker: "灰色の鳥人", bg: "narrow", text: "……勝負にならないな。剣は収める。" },
    { kind: "choice", speaker: "灰色の鳥人", text: "その腕で、なぜ祭壇へ急ぐ。信徒の加勢には見えないが。", options: ["幼馴染を取り戻す", "供物を取り返す"] },
    { speaker: "灰色の鳥人", text: "供物を奪い返す、か。……奴らの儀式は、生贄で竜を呼び寄せる。こっちはそれが邪魔だ。" },
    { speaker: "灰色の鳥人", text: "招竜派の祭壇に用があるのはこっちも同じだ。今は敵対する理由がないだけだ。" },
    { kind: "choice", speaker: "灰色の鳥人", text: "来るなら勝手にしろ。足手まといなら置いていく。", options: ["好都合だ", "……"] },
  ];

  var shrineDungeon = null;
  var shrineFloorId = "ground";
  // フロアごとの探索済みマスを保持し、行き来しても自動地図の記憶が消えないようにする
  var shrineFloorVisited = { ground: {}, inner: {} };
  // 外殿・内殿で取った宝箱と開けた扉（階ごとに "x,y" で覚える）
  var shrineTaken = { ground: {}, inner: {} };

  function afterTeamUp() {
    game.party.push(Battle.createCombatant("tzelf", false));
    syncTzelfName();
    worldMap.current = "saidan";
    worldMap.visited.saidan = true;
    Story.play(app, [
      { kind: "narration", bg: "narrow", text: "（灰色の鳥人が戦いに加わる。前衛・後衛の並びは、メニューの「配置」で変えられる。後衛は、前衛がいるうちは近距離の攻撃で狙われないが、自分の近距離の攻撃も届かない）" },
    ], function () { enterShrineFloor("ground"); });
  }

  function enterShrineFloor(floorId, dpos) {
    shrineFloorId = floorId;
    place = { kind: "shrine", floor: floorId };
    resumePlace = function () { shrineDungeon.render(); };
    var grid = shrineGrid(floorId);
    // 保存した位置が壁の中なら（前の版の祭壇で保存した記録など）、その階の入口から始める
    if (dpos && (!grid[dpos.y] || !grid[dpos.y][dpos.x] || grid[dpos.y][dpos.x] === "wall")) dpos = null;
    var floorData = { start: dpos || SHRINE_FLOORS[floorId].start, grid: grid };
    shrineDungeon = Explore.start(app, floorData, game, {
      openMenu: openMenu,
      // 祭壇を出たら、隘路を引き返して廃区画の東の出口の前へ戻る
      onExit: function () {
        walkRoad(say("narrow", { mira: "……ここ、帰りも通るのね。足元、気をつけて。", tzelf: "引き返すのか。……道草はほどほどにしろ。", alone: "隘路を引き返す。" }), 15, 0.2, function () {
          game.steps += 10;
          worldMap.visited.michi = true;
          goTo("hairegion", "michi");
        });
      },
      onEvent: onDungeonEvent,
      onChest: onDungeonChest,
      onLocked: onDungeonLocked,
      onEncounter: function () {
        runBattle(foes(["shrine_guard", "shrine_beast"]), timeUp() ? "竜の眷属" : "祭壇の守衛", false, function () { shrineDungeon.render(); });
      },
      onStairs: function (targetFloorId) {
        if (targetFloorId === "ground" && game.flags.kagariDefeated) { afterDungeonExit(); return; }
        enterShrineFloor(targetFloorId);
      },
    }, shrineFloorVisited[floorId]);
  }

  // 宝箱：場所ごとの中身を渡す（記憶結晶は〈防御姿勢〉と〈急所狙い〉＝装備・入手物まとめ）
  function onDungeonChest(x, y) {
    var key = x + "," + y, id = (SHRINE_CHESTS[shrineFloorId] || {})[key];
    shrineTaken[shrineFloorId][key] = true;
    if (!id) { shrineDungeon.render(); return; }
    addItem(id);
    Story.play(app, [{ kind: "narration", text: "〈" + RPG.Data.ITEMS[id].name + "〉を手に入れた。" }], function () {
      shrineDungeon.render();
    });
  }

  // 施錠扉：解錠の技能を持つ仲間がいれば開ける（第一章ではツェルフだけ）。
  // かかる時間は「難度×5÷解錠を持つ人数」（端数切り上げ・PLAN §8-3b）。祭壇の扉は難度1（攻略チャート第一章⑧）。
  // 誰が開けても同じ場面になるよう、台詞ではなく地の文で「〇〇は鍵を開けた。」とだけ出す（開けるのは解錠を持つ先頭の仲間）。
  // 誰もいなければ開かない（奥は宝の小部屋なので、開けなくても祭壇へは行ける）
  var LOCK_DIFFICULTY = { altar: 1 };
  function onDungeonLocked(id, dungeon, x, y) {
    var key = x + "," + y;
    var pickers = partyWithSkill("unlock");
    if (!pickers.length) {
      Story.play(app, [{ kind: "narration", bg: "shrine", text: "扉には錠が下りている。びくともしない。" }], function () { shrineDungeon.render(); });
      return;
    }
    var cost = Math.ceil((LOCK_DIFFICULTY[id] || 1) * 5 / pickers.length);
    Story.play(app, [{ kind: "narration", bg: "shrine", text: pickers[0].name + "は鍵を開けた。" }], function () {
      shrineTaken[shrineFloorId][key] = true;
      game.steps += cost;
      var here = { x: dungeon.x, y: dungeon.y, dir: dungeon.dir };
      var reenter = function () { enterShrineFloor(shrineFloorId, here); };
      if (Explore.checkTimeUp(game, reenter)) return;
      reenter();
    });
  }

  function onDungeonEvent(id) {
    if (id === "kagari" && timeUp()) {
      Story.play(app, [say("shrine", { tzelf: "儀式の間は崩れて埋まっている。……もう誰もいない。", alone: "儀式の間は、瓦礫に埋もれていた。" })], function () { shrineDungeon.render(); });
      return;
    }
    // カガリを倒した後に祭壇の間へ入り直しても、戦いは繰り返さない
    if (id === "kagari" && game.flags.kagariDefeated) {
      Story.play(app, [say("shrine", { mira: "……もうここに用はないよ。行こう。", tzelf: "長居は無用だ。", alone: "祭壇の間は静まり返っている。" })], function () { shrineDungeon.render(); });
      return;
    }
    if (id === "kagari") {
      Story.play(app, kagariPreBeats, function () {
        runBattle(["kagari"], "祭司カガリ", false, afterKagari);
      });
    }
  }

  var kagariPreBeats = [
    { kind: "header", text: "招竜の祭壇", bg: "shrine" },
    { speaker: "ミラ", text: "セオ……！？" },
    { speaker: "カガリ", text: "追ってきたか。構わん、詠唱はじきに終わる。" },
    { speaker: "カガリ", text: "此度の供物は、思いのほか良い声で鳴きそうだ。" },
  ];

  function afterKagari() {
    game.flags.kagariDefeated = true;
    Story.play(app, kagariPostBeats, function () {
      shrineDungeon.render();
    });
  }

  var kagariPostBeats = [
    { speaker: "カガリ", bg: "shrine", text: "儀式が……竜が、お怒りに……。" },
    { speaker: "ミラ", text: "……なんで来たの、セオ。" },
    { kind: "choice", speaker: "ミラ", text: "あんたを助けるために代わったのに、来たら無駄になる。帰って。あんたは生きて。", options: ["置いていけるか", "迎えに来た"] },
    { speaker: "ミラ", text: "……ほんと、ばか。" },
    { speaker: "ミラ", text: "それで、その人は……鳥人、よね？　絶えたって聞いてたのに。" },
    { speaker: "灰色の鳥人", text: "絶えてはいない。数えるほどしか残っていないだけだ。" },
    { speaker: "ミラ", text: "……っ、揺れてる？　地の底から、何か……唸ってる。", fx: "shake" },
    { speaker: "灰色の鳥人", text: "……外だ。ここを出るぞ。" },
  ];

  function afterDungeonExit() {
    if (timeUp()) {
      Story.play(app, [say("narrow", { mira: "外も……瘴気で真っ暗。これじゃ、どこへも帰れない。", tzelf: "外の道も瘴気に呑まれた。……戻る場所はない。", alone: "外の道も、竜の瘴気に閉ざされていた。" })], function () { shrineDungeon.render(); });
      return;
    }
    game.companions.push("mira");
    game.flags.truths = game.flags.truths || {};
    game.flags.truths.T1a = true;
    Story.play(app, dragonBeats, function () {
      enterOutskirts({ tx: 40, ty: 20 });
      outskirtsArea.taken.gate_guard = true;      // この場面では門番を出さない（柵の向こうからトキが答える）
      // 名乗りのあと、そのまま第二章へ（PLAN §7.5-2c 本筋①：追放直後の門前から）
      outskirtsArea.playScene(gateScene, function () {
        game.flags.named = true; syncTzelfName();
        game.chapter = 2;
        if (chapter2()) ch2.begin(); else onChapterEnd();
      });
    });
  }

  var dragonBeats = [
    { kind: "header", text: "祭壇の外", bg: "dragon", fx: "shake" },
    { speaker: "ミラ", text: "……な、に……あれ……。" },
    { speaker: "灰色の鳥人", text: "灰色竜だ。儀式の騒ぎに寄ってきたか。……動くな。気づかれなければ、通り過ぎる。" },
    { speaker: "ミラ", text: "灰が、降ってる……。あれが、竜……。" },
    { speaker: "灰色の鳥人", text: "あれが寝床を変えてこちらへ来れば、集落ひとつ、ひとたまりもない。" },
    { speaker: "ミラ", text: "……あれさえいなくなれば、生贄なんて――" },
    { speaker: "灰色の鳥人", text: "竜は殺せない。挑んだ奴は皆、灰になった。" },
    { speaker: "ミラ", text: "……じゃあ、どうすればいいのよ。" },
    { speaker: "灰色の鳥人", text: "さあな。……行ったか。灰縁までは同じ道だ。行くぞ。" },
  ];

  var gateScene = [
    { spawn: "mira", at: { tx: 41.5, ty: 20.8 }, face: "left" },
    { spawn: "tzelf", at: { tx: 42.5, ty: 19.3 }, face: "left" },
    { walk: "hero", to: [{ tx: 29, ty: 20 }, { tx: 29, ty: 12 }], wait: false },
    { walk: "mira", to: [{ tx: 27, ty: 20.8 }, { tx: 27, ty: 12.8 }], wait: false },
    { walk: "tzelf", to: [{ tx: 30.5, ty: 19.3 }, { tx: 30.5, ty: 12.5 }], wait: false },
    { join: true },
    { camera: { tx: 27.5, ty: 9 } },
    { walk: "mira", to: [{ tx: 27.5, ty: 7.6 }] },
    { face: "mira", dir: "up" },
    { say: "ミラ", actor: "mira", text: "開けて！　ミラよ、帰ってきたの！", fx: "knock" },
    { spawn: "toki", at: { tx: 27.5, ty: 4.1 }, face: "down" },
    { say: "集落長トキ", actor: "toki", text: "帰ってくるなと言ったはずだ。" },
    { face: "mira", dir: "down" },
    { say: "ミラ", actor: "mira", text: "……言った？　セオに？　……私を追ってきたから、セオを追い出したのね。" },
    { face: "mira", dir: "up" },
    { say: "ミラ", actor: "mira", text: "上等じゃない。こっちから願い下げよ。" },
    { walk: "toki", to: [{ tx: 27.5, ty: 1.5 }] },
    { remove: "toki" },
    { camera: "hero" },
    { walk: "mira", to: [{ tx: 27, ty: 12.8 }] },
    { face: "mira", dir: "right" },
    { say: "ミラ", actor: "mira", text: "……あなたは？　帰る場所、あるの？" },
    { face: "tzelf", dir: "left" },
    { say: "灰色の鳥人", actor: "tzelf", text: "ない。はじめからな。" },
    { say: "ミラ", actor: "mira", text: "……そう。じゃあ、三人とも同じね。で、あなた。名前、まだ聞いてないんだけど。" },
    { say: "灰色の鳥人", actor: "tzelf", text: "名はない。呼ばれる必要もなかった。" },
    { face: "tzelf", dir: "up" },
    { say: "灰色の鳥人", actor: "tzelf", text: "…………借りられる名も、なかったな。" },
    { face: "tzelf", dir: "left" },
    { say: "灰色の鳥人", actor: "tzelf", text: "ツェルフ。……そう呼べ。" },
    { say: "ミラ", actor: "mira", text: "ツェルフ。……変わった名前。でも、覚えた。" },
  ];


  // forceProceed：負けても話が進む戦い（チュートリアル・イベント戦）。eventEnd：イベント戦の打ち切り条件
  // 戦闘の背景：いま居る場所の絵（会話場面の絵を使い回す）
  var BATTLE_BG = { village: "village", villageRuin: "awakening", outskirts: "gate", hairegion: "ruins", shrine: "shrine" };
  // extra：戦いに足す設定（{ tutorial: true } で戦い方の手ほどきを出す）
  function runBattle(enemyIds, title, forceProceed, next, eventEnd, bg, extra) {
    app.innerHTML = "";
    var box = document.createElement("div");
    box.className = "battle-screen";
    app.appendChild(box);
    game.items = game.items || {};
    game.crit = game.crit || RPG.Data.newSeed();
    var state = Battle.start(box, game.party, enemyIds, function (result) {
      // 全滅＝ゲームオーバー（PLAN §4-11）
      if (result === "defeat" && !forceProceed) { gameOver(); return; }
      // 戦闘が終わった時点の速さ低下・判定低下は持ち越さない
      game.party.forEach(function (c) { c.spdMul = 1; c.spdDownTurns = 0; c.scoreDebuff = 0; c.debuffTurns = 0; });
      // 経験値は、戦闘不能を戻す前（＝誰が倒れていたか分かるうち）に配る
      // 時間切れの後は、倒しても経験値は入らない
      var lines = Battle.awardExperience(game.party, state.enemies, timeUp() ? 0 : RPG.Data.expRate(game.steps, game.stepLimit));
      game.party.forEach(function (c) { c.defeated = false; c.atb = 0; if (c.hp === 0) c.hp = 1; });
      if (!lines.length) { next(); return; }
      // レベルアップと技の習得は、枠を光らせて目立たせる
      Story.play(app, lines.map(function (t) { return { kind: "narration", text: t, emph: /レベル\d+になった|を覚えた/.test(t) }; }), next);
    }, Object.assign({ items: game.items, crit: game.crit, mira: hasMira(), eventEnd: eventEnd, strength: RPG.Data.strengthRate(game.steps, game.stepLimit), bg: bg || (place && BATTLE_BG[place.kind]) || null }, extra || {}));
  }

  // 全滅：記録から再開するか、タイトルへ戻る。やり直すときはシードを引き直す（§4-11）
  // ※設計上のやり直し地点は「涸れ間」だが、第一章にはまだないため、セーブした記録を使う
  function gameOver() {
    app.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "title-screen";
    var h = document.createElement("h1");
    h.textContent = "全滅した";
    wrap.appendChild(h);
    var has = !!RPG.Save.read();
    var b1 = document.createElement("button");
    b1.className = "primary-btn";
    b1.textContent = "記録から再開する";
    b1.disabled = !has;
    b1.onclick = function () { RPG.Game.loadSaved(true); };
    wrap.appendChild(b1);
    var b2 = document.createElement("button");
    b2.className = "primary-btn";
    b2.textContent = "タイトルへ戻る";
    b2.onclick = function () { RPG.Game.toTitle(); };
    wrap.appendChild(b2);
    if (!has) {
      var p = document.createElement("p");
      p.className = "subtitle";
      p.textContent = "（セーブした記録がないため、はじめからになります）";
      wrap.appendChild(p);
    }
    app.appendChild(wrap);
  }

  return { run: run, resume: resume };
})();
