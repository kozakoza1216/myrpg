// 第一章「ミラ奪還〜追放」のコンテンツ（PLAN.md §7.5-2b 準拠）。
window.RPG = window.RPG || {};

RPG.Chapter1 = (function () {
  var Story = RPG.Story, Battle = RPG.Battle, Explore = RPG.Explore, Data = RPG.Data;
  var app, game, onChapterEnd;

  // 灰縁の集落。PLAN.md §7.5-2b「①日常：移動・会話・簡易戦闘のチュートリアル」に基づき、
  // くじが引かれる前に自由に歩ける（＝追放されたら二度と戻れない、ここでしか拾えないアイテムがある）。
  var HAIBERI_VILLAGE = {
    label: "灰縁の集落",
    width: 480, height: 320,
    start: { x: 240, y: 280 },
    obstacles: [
      { x: 240, y: 210, r: 20, kind: "hut" },
      { x: 120, y: 230, r: 20, kind: "hut" },
      { x: 350, y: 230, r: 18, kind: "hut" },
      { x: 90, y: 110, r: 18, kind: "hut" },
      { x: 260, y: 100, r: 18, kind: "hut" },
      // 集落の家並みからは離れた、瓦礫の残る外れ（灰ネズミが出るのはここ）
      { x: 60, y: 60, r: 16 },
      { x: 40, y: 100, r: 12 },
    ],
    zones: [
      { id: "well", kind: "talk", x: 230, y: 140, r: 20, label: "井戸端の老人",
        speaker: "竜読みの老人", text: "竜には逆らえん。くじは絶対だ……お前さんも、いずれわかる。" },
      { id: "chest_shelf", kind: "chest", x: 400, y: 60, r: 16, label: "住居の棚" },
      { id: "rat", kind: "encounter", x: 45, y: 170, r: 26, label: "集落の外れ・灰色の気配" },
      { id: "exit_plaza", kind: "exit", to: "plaza", x: 420, y: 170, r: 22, steps: 5, label: "広場へ（くじの刻限）" },
    ],
  };

  // 広域マップ＝街・集落・危険地帯のノードグラフ（PLAN.md §8-1）。
  // 廃区画へ初めて入るときだけ内部（HAIREGION_AREA）を実際に歩き、
  // どちらの出口から抜けたかで到着ノードが決まる（＝踏破＝広域マップ上を前進する）。
  // 二度目以降は既に通り抜け済みなので、隣接ノードとして直接クリックで行き来できる。
  var WORLD = {
    label: "地下世界・南方区画",
    width: 400, height: 260,
    start: "haiberi",
    nodes: [
      { id: "haiberi", name: "灰縁の集落", x: 30, y: 220, kind: "settlement" },
      { id: "hairegion", name: "廃区画", x: 160, y: 160, kind: "danger" },
      { id: "yaketa", name: "焼けた集落跡", x: 80, y: 55, kind: "ruin" },
      { id: "michi", name: "祭壇へ続く道", x: 260, y: 110, kind: "danger" },
      { id: "saidan", name: "招竜の祭壇", x: 360, y: 55, kind: "shrine" },
    ],
    edges: [
      { from: "haiberi", to: "hairegion", steps: 10, encounterRate: 0 },
      { from: "hairegion", to: "yaketa", steps: 10, encounterRate: 0 },
      { from: "hairegion", to: "michi", steps: 10, encounterRate: 0 },
      { from: "michi", to: "saidan", steps: 15, encounterRate: 0.2, enemy: "straggler_bandit" },
    ],
  };

  // 廃区画の内部。左から入り、複数の出口へ抜ける（歩数・エンカウントはここで消化する）。
  // 「祭壇方面」は最終目的地の祭壇へ直接ではなく、途中の中継ノード（祭壇へ続く道＝michi）へ
  // 出る＝先で道がどう分岐していてもおかしくない、という含みを持たせる。
  // 画面の窓（480x320）より大きく作ってあるため、全体は一画面に収まらず、
  // プレイヤーを追いかけるカメラで実際に歩いて見て回ることになる。
  var HAIREGION_AREA = {
    label: "廃区画",
    width: 900, height: 600,
    start: { x: 47, y: 525 },
    obstacles: [
      { x: 225, y: 244, r: 20 },
      { x: 413, y: 413, r: 24 },
      { x: 619, y: 169, r: 18 },
      { x: 169, y: 413, r: 14 },
      { x: 488, y: 263, r: 16 },
      { x: 713, y: 431, r: 15 },
      { x: 320, y: 520, r: 18 },
      { x: 620, y: 490, r: 16 },
      { x: 780, y: 250, r: 14 },
    ],
    zones: [
      { id: "danger1", kind: "danger", x: 441, y: 291, r: 28, encounterRate: 0.5, label: "危険な瓦礫の陰" },
      { id: "chest1", kind: "chest", x: 131, y: 197, r: 16, label: "宝箱" },
      { id: "exit_yaketa", kind: "exit", to: "yaketa", x: 413, y: 47, r: 20, steps: 15, label: "焼けた集落跡方面（寄り道）" },
      { id: "exit_michi", kind: "exit", to: "michi", x: 853, y: 300, r: 24, steps: 30, label: "祭壇方面" },
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
    Story.play(app, wakeBeats, enterVillage);
  }

  var wakeBeats = [
    { kind: "header", text: "第一章　灰縁（はいべり）の集落" },
    { kind: "narration", text: "人工天井の裂け目から薄暮が差し込む。二つに割れた月が、いつまでも同じ高さで止まっている。竜の脅威圏の縁に築かれた小さな集落――灰縁。" },
    { kind: "header", text: "セオの住居" },
    { speaker: "ミラ", text: "セオ、起きて。今日は「くじ」の日でしょ。寝坊したら承知しないから。" },
    { kind: "choice", prompt: "（ミラに何と返す？　――何を選んでも、話の筋は変わらない）", options: ["「わかってる。今起きる」", "「……くじ、か」と呟く", "何も言わず起き上がる"] },
    { kind: "narration", text: "ミラは肩をすくめて、先に外へ出ていった。棚には〈干し肉〉と〈古びた回復薬〉が置かれている。戸口を出ると、くじの刻限まではまだ間があった。" },
  ];

  var villageArea = null;

  function enterVillage() {
    villageArea = Explore.startFreeArea(app, HAIBERI_VILLAGE, game, {
      onExit: function () { Story.play(app, kujiBeats, afterKuji); },
      onTalk: function (zone, next) {
        Story.play(app, [{ speaker: zone.speaker, text: zone.text }], next);
      },
      onChest: function (zoneId, next) {
        var seo = game.party[0];
        if (seo.skills.indexOf("double_slash") < 0) seo.skills.push("double_slash");
        Story.play(app, [{ kind: "narration", text: "棚の奥に、古い記憶結晶が仕舞われていた。〈二連撃の記憶結晶〉――セオはこの技を覚えた。" }], next);
      },
      onEncounter: function (next) {
        runBattle(["ash_rat"], "灰ネズミとの戦い", true, next);
      },
    });
  }

  var kujiBeats = [
    { kind: "header", text: "集落中央広場・くじ" },
    { kind: "narration", text: "招竜派の祭司カガリが、儀式めいた仕草で木札の箱を掲げる。集落中が息を呑んで見守る。" },
    { speaker: "カガリ", text: "此度の供物は……セオ、お前だ。" },
    { kind: "narration", text: "どよめきが走る。連行しようとする信徒たちの手が伸びる――その時だった。" },
    { speaker: "ミラ", text: "待って。……私が行く。" },
    { kind: "narration", text: "ミラが割って入り、信徒の手を自ら取った。止める間もなく、彼女は祭壇へ向けて連れ去られていく。" },
    { speaker: "カガリ", text: "殊勝な心がけだ。竜もきっと喜ぶだろう。" },
    { kind: "header", text: "集落長の家" },
    { kind: "choice", prompt: "集落長トキに詰め寄る。", options: ["「ミラを取り戻しに行く」", "「見過ごせるわけがないだろう」"] },
    { kind: "narration", text: "トキは長く沈黙した後、絞り出すように言った。" },
    { speaker: "集落長トキ", text: "くじは絶対だ。逆らえば、集落ごと竜に潰される。……行くなら、二度と帰ってくるな。" },
    { kind: "narration", text: "追放。それが答えだった。家に戻ると、誰の仕業か〈携行食×3〉が黙って置かれていた。" },
    { kind: "header", text: "集落の門" },
    { kind: "narration", text: "門を出ると、荒れ果てた広域の景色が広がった。目的地は招竜の祭壇。もう振り返る場所はない。" },
  ];

  var worldMap = null;
  var hairegionArea = null;
  var hairegionCleared = false;
  // 廃区画も祭壇と同じく、出口から出た後にノードとしてクリックし直しても
  // 中へ戻れなくなっていた。取得済みの宝箱等の状態を保ったまま再入場
  // できるように記憶しておく。
  var hairegionTaken = {};

  function afterKuji() {
    worldMap = Explore.startWorldMap(app, WORLD, game, {
      onArrive: onWorldArrive,
      // 今いるノードをもう一度クリックした時の専用処理。廃区画は、
      // 隣接ノードとして立ち止まれる（＝灰縁の集落など他のノードへ
      // 移動する選択肢を保つ）のと、内部をもう一度歩き直せることの
      // 両方を成り立たせる必要があるため、ここで内部へ入らせる。
      onReenter: function (id, next) {
        if (id === "hairegion") { enterHairegion(); return; }
        next();
      },
      onEncounter: function (enemyId, next) {
        runBattle([enemyId || "straggler_bandit"], "はぐれ賊", false, next);
      },
    });
  }

  // 広域マップ上のノードに着いた時の処理。廃区画は初回だけ内部を歩かせ、
  // どちらの出口へ抜けたかで実際の到着ノードを決める（＝踏破が前進そのもの）。
  // 二度目以降は既に踏破済みなので、隣接ノードとして直接クリックで行き来できる。
  function onWorldArrive(id, firstVisit, next) {
    // 灰縁の集落はくじの前にしか歩けない。追放後は「門が勝手に閉ざされている」
    // という説明のつかない物理現象ではなく、集落長の命を受けた門番が
    // 実際に押し戻す、という筋の通った拒絶にする
    // （終盤、集落長トキ本人が門で直接拒む場面と矛盾しないように）。
    if (id === "haiberi") {
      Story.play(app, [
        { kind: "narration", text: "門番が槍の柄で道を塞いだ。" },
        { speaker: "門番", text: "集落長の命だ。追放された者を通すわけにはいかない。" },
      ], next);
      return;
    }
    // 廃区画は初回だけ内部を歩かせる。二度目以降は、内部へ強制的に
    // 戻すのではなく、ここに書いてある元々の設計どおり、ただの中継
    // ノードとしてワールドマップ上に留まらせる。そうしないと、廃区画
    // だけに繋がっている灰縁の集落へ二度と辿り着けなくなってしまう
    // （廃区画に着くたび自動で内部へ潜ってしまい、隣接ノードを
    // クリックできる「ワールドマップ上に立ち止まる瞬間」が
    // 一度も存在しなくなるため）。
    if (id === "hairegion" && !hairegionCleared) {
      Story.play(app, [
        { kind: "header", text: "廃区画" },
        { kind: "narration", text: "崩れた区画の入り口に着いた。瓦礫に埋もれた道の先に何があるのかは、まだ分からない。" },
      ], enterHairegion);
      return;
    }
    if (id === "michi" && firstVisit) { Story.play(app, roadBeats, afterRoad); return; }
    if (id === "yaketa" && firstVisit) {
      Story.play(app, [{ kind: "narration", text: "集落跡の中央に、黒く焼け焦げた石碑が残っていた。文字は読み取れない。ただ、ここで何かが起き、住人が忽然といなくなったことだけは伝わってくる。" }], next);
      return;
    }
    // 祭壇は出口タイルで一度外へ抜けられるが、その後ノードとして
    // クリックし直しても分岐がなくnext()止まりになり、中へ二度と
    // 戻れなくなっていた。出た時にいたフロア（記憶した探索状況込み）へ
    // 再入場させる。
    if (id === "saidan") { enterShrineFloor(shrineFloorId); return; }
    next();
  }

  function enterHairegion() {
    hairegionCleared = true;
    hairegionArea = Explore.startFreeArea(app, HAIREGION_AREA, game, {
      onExit: function (to) { worldMap.arriveAt(to); },
      onChest: function (zoneId, next) {
        Story.play(app, [{ kind: "narration", text: "瓦礫の下から、色褪せた家族写真が一枚出てきた。誰のものかは、もう分からない。" }], next);
      },
      onEncounter: function (next) {
        runBattle(["straggler_bandit"], "はぐれ賊", false, next);
      },
    }, hairegionTaken);
  }

  var roadBeats = [
    { kind: "header", text: "祭壇へ続く隘路" },
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
    { kind: "narration", text: "セオは膝をつく。勝てる相手ではなかった。だが鳥人はとどめを刺さず、剣を収めた。" },
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
    worldMap.setCurrent("saidan");
    enterShrineFloor("ground");
  }

  function enterShrineFloor(floorId) {
    shrineFloorId = floorId;
    shrineDungeon = Explore.start(app, SHRINE_FLOORS[floorId], game, {
      onExit: function () { worldMap.render(); },
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

  function onDungeonChest() {
    var seo = game.party[0];
    if (shrineFloorId === "ground") {
      if (seo.skills.indexOf("power_strike") < 0) seo.skills.push("power_strike");
      Story.play(app, [{ kind: "narration", text: "宝箱を開けた。〈力押しの記憶結晶〉――セオはこの技を覚えた。" }], function () {
        shrineDungeon.render();
      });
      return;
    }
    if (seo.skills.indexOf("vital_strike") < 0) seo.skills.push("vital_strike");
    Story.play(app, [{ kind: "narration", text: "宝箱を開けた。〈急所狙いの記憶結晶〉――セオはこの技を覚えた。" }], function () {
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
    { kind: "header", text: "招竜の祭壇" },
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
    { kind: "narration", text: "カガリは崩れ落ちた。儀式は止まり、ミラの拘束が解かれる。" },
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
    { kind: "header", text: "灰縁の集落・門" },
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
    var state = Battle.start(box, game.party, enemyIds, function (result) {
      if (result === "defeat" && !forceProceed) {
        game.party.forEach(function (c) {
          c.hp = c.maxHp; c.mp = c.maxMp; c.defeated = false; c.atb = 0;
        });
        runBattle(enemyIds, title, forceProceed, next);
        return;
      }
      game.party.forEach(function (c) { c.defeated = false; c.atb = 0; if (c.hp === 0) c.hp = 1; });
      next();
    });
  }

  return { run: run };
})();
