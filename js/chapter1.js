// 第一章「ミラ奪還〜追放」のコンテンツ（PLAN.md §7.5-2b 準拠）。
window.RPG = window.RPG || {};

RPG.Chapter1 = (function () {
  var Story = RPG.Story, Battle = RPG.Battle, Explore = RPG.Explore, Data = RPG.Data;
  var app, game, onChapterEnd;

  // 広域マップ＝街・集落・危険地帯のノードグラフ（PLAN.md §8-1）。
  // 各ノードは点でしかない。中に入ると局所ダンジョン（一人称グリッド探索、§8-2/8-3）に
  // 切り替わり、そこを実際に歩き回れる（廃区画＝HAIREGION_AREA、祭壇＝SHRINE_DUNGEON）。
  var WORLD = {
    label: "地下世界・南方区画",
    width: 400, height: 260,
    start: "haiberi",
    nodes: [
      { id: "haiberi", name: "灰縁の集落", x: 40, y: 210, kind: "settlement" },
      { id: "hairegion", name: "廃区画", x: 170, y: 150, kind: "danger" },
      { id: "yaketa", name: "焼けた集落跡", x: 90, y: 60, kind: "ruin" },
      { id: "saidan", name: "招竜の祭壇", x: 330, y: 70, kind: "shrine" },
    ],
    edges: [
      { from: "haiberi", to: "hairegion", steps: 35, encounterRate: 0 },
      { from: "hairegion", to: "yaketa", steps: 20, encounterRate: 0 },
      { from: "hairegion", to: "saidan", steps: 45, encounterRate: 0.2, enemy: "straggler_bandit" },
    ],
  };

  // 廃区画の内部。グリッドではなく、クリックした座標へ自由に歩ける連続座標のエリア。
  var HAIREGION_AREA = {
    label: "廃区画",
    width: 320, height: 220,
    start: { x: 70, y: 180 },
    obstacles: [
      { x: 55, y: 50, r: 16 },
      { x: 115, y: 38, r: 13 },
      { x: 265, y: 48, r: 18 },
      { x: 175, y: 95, r: 24 },
      { x: 245, y: 178, r: 15 },
      { x: 100, y: 150, r: 13 },
    ],
    zones: [
      { id: "danger1", kind: "danger", x: 210, y: 148, r: 22, encounterRate: 0.5, label: "危険な瓦礫の陰" },
      { id: "chest1", kind: "chest", x: 270, y: 105, r: 16, label: "宝箱" },
      { id: "exit1", kind: "exit", x: 30, y: 195, r: 18, label: "広域マップへ戻る" },
    ],
  };

  var SHRINE_DUNGEON = {
    id: "saidan",
    start: { x: 2, y: 5, dir: 0 },
    grid: [
      ["wall", "wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "event:kagari", "wall"],
      ["wall", "floor", "wall", "encounter", "wall"],
      ["wall", "chest", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "wall", "exit", "wall", "wall"],
    ],
  };

  function run(appEl, gameState, endCallback) {
    app = appEl; game = gameState; onChapterEnd = endCallback;
    Story.play(app, introBeats, afterIntro);
  }

  var introBeats = [
    { kind: "header", text: "第一章　灰縁（はいべり）の集落" },
    { kind: "narration", text: "人工天井の裂け目から薄暮が差し込む。二つに割れた月が、いつまでも同じ高さで止まっている。竜の脅威圏の縁に築かれた小さな集落――灰縁。" },
    { kind: "header", text: "セオの住居" },
    { speaker: "ミラ", text: "セオ、起きて。今日は「くじ」の日でしょ。寝坊したら承知しないから。" },
    { kind: "choice", prompt: "（ミラに何と返す？　――何を選んでも、話の筋は変わらない）", options: ["「わかってる。今起きる」", "「……くじ、か」と呟く", "何も言わず起き上がる"] },
    { kind: "narration", text: "ミラは肩をすくめて、先に外へ出ていった。棚には〈干し肉〉と〈古びた回復薬〉が置かれている。" },
    { kind: "header", text: "集落・井戸端" },
    { speaker: "竜読みの老人", text: "竜には逆らえん。くじは絶対だ……お前さんも、いずれわかる。" },
    { kind: "narration", text: "集落の外れで、瓦礫の陰から灰色の毛並みが動いた。灰ネズミだ。腕試しには、ちょうどいい。" },
  ];

  function afterIntro() {
    runBattle(["ash_rat"], "灰ネズミとの戦い", true, afterTutorial);
  }

  function afterTutorial() {
    Story.play(app, kujiBeats, afterKuji);
  }

  var kujiBeats = [
    { kind: "narration", text: "たいした敵ではなかった。だが、得物を振るった感触は確かに手に残った。" },
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

  function afterKuji() {
    worldMap = Explore.startWorldMap(app, WORLD, game, {
      onArrive: onWorldArrive,
      onEncounter: function (enemyId, next) {
        runBattle([enemyId || "straggler_bandit"], "はぐれ賊", false, next);
      },
    });
  }

  function onWorldArrive(id, firstVisit, next) {
    if (id === "saidan") { Story.play(app, roadBeats, afterRoad); return; }
    if (id === "hairegion" && !hairegionCleared) { enterHairegion(); return; }
    if (id === "yaketa" && firstVisit) {
      Story.play(app, [{ kind: "narration", text: "集落跡の中央に、黒く焼け焦げた石碑が残っていた。文字は読み取れない。ただ、ここで何かが起き、住人が忽然といなくなったことだけは伝わってくる。" }], next);
      return;
    }
    next();
  }

  function enterHairegion() {
    hairegionCleared = true;
    hairegionArea = Explore.startFreeArea(app, HAIREGION_AREA, game, {
      onExit: function () { worldMap.render(); },
      onChest: function (zoneId, next) {
        Story.play(app, [{ kind: "narration", text: "瓦礫の下から、色褪せた家族写真が一枚出てきた。誰のものかは、もう分からない。" }], next);
      },
      onEncounter: function (next) {
        runBattle(["straggler_bandit"], "はぐれ賊", false, next);
      },
    });
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

  function afterTeamUp() {
    game.party.push(Battle.createCombatant("tzelf", false));
    shrineDungeon = Explore.start(app, SHRINE_DUNGEON, game, {
      onExit: function () {
        if (game.flags.kagariDefeated) { afterDungeonExit(); return; }
        worldMap.render();
      },
      onEvent: onDungeonEvent,
      onChest: onDungeonChest,
      onEncounter: function () {
        runBattle(["shrine_guard"], "祭壇の守衛", false, function () { shrineDungeon.render(); });
      },
    });
  }

  function onDungeonChest() {
    var seo = game.party[0];
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
    { speaker: "赤い鳥人", text: "……名か。持ったことがない。お前たちの数字でいうと012、だったか。" },
    { kind: "narration", text: "ドイツ語で12――ツェルフ。誰からともなく、その呼び名が定まった。帰れない者同士になった瞬間、彼は名を得た。" },
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
