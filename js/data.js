// データ層。PLAN.md §5 のマッピング指針に基づく。
// キャラのステータスは「全キャラステータス一覧」加入キャラ表の「加入時→最大レベル」を使う。
// （同じ資料のレベル別早見表は、加入時の値が加入キャラ表・PLAN §7.5-1a2「セオ15→52」と合わないため使わない）
// HP実値 = 表のHP% × 4（PLAN §1-1）。敵・ボスはHPのみ実数（%スケール外）。
window.RPG = window.RPG || {};

RPG.Data = (function () {
  // ── 技（技リスト-3-1.md 準拠。カテゴリ: attack/breakthrough/hold/defense ）
  const SKILLS = {
    // ノーマル版：MP0・技ボーナス0（PLAN §4-5）。威力は1.0（PLAN §4-11「ノーマル32/行動→中技45/行動＝1.40倍」、
    // quests.md の火力表「ノーマル攻撃27／ノーマル突破54」がいずれも威力1.0で一致する）
    normal_attack: {
      name: "ノーマル攻撃", category: "attack", attribute: "none",
      mp: 0, power: 1.0, techBonus: 0, isMagic: false,
    },
    normal_breakthrough: {
      name: "ノーマル突破", category: "breakthrough", attribute: "none",
      mp: 0, power: 1.0, techBonus: 0, isMagic: false,
    },
    double_slash: {
      name: "二連撃", category: "attack", attribute: "physical",
      mp: 12, power: 1.1, techBonus: 20, isMagic: false,
    },
    power_strike: {
      name: "力押し", category: "attack", attribute: "physical",
      mp: 12, power: 1.1, techBonus: 20, isMagic: false,
    },
    step_in: {
      name: "踏み込み", category: "breakthrough", attribute: "physical",
      mp: 12, power: 1.2, techBonus: 30, isMagic: false,
    },
    fire_bolt: {
      name: "火炎弾", category: "attack", attribute: "magic",
      mp: 12, power: 1.1, techBonus: 30, isMagic: true,
    },
    // 雑魚敵の技：技リストの値に敵専用の底上げ＋0.3（enemies.md）
    // 一撃（技リスト：物理・MPなし・0.9・技+30）→ 1.2
    bandit_strike: {
      name: "一撃", category: "attack", attribute: "physical",
      mp: 0, power: 1.2, techBonus: 30, isMagic: false,
    },
    // 踏み込み（技リスト：物理・低MP・1.2・技+30）→ 1.5
    enemy_step_in: {
      name: "踏み込み", category: "breakthrough", attribute: "physical",
      mp: 0, power: 1.5, techBonus: 30, isMagic: false,
    },
    // 全力突撃（牙の獣の大技・enemies.md：威力1.9・技-30＝避けやすい）
    enemy_full_charge: {
      name: "全力突撃", category: "breakthrough", attribute: "physical",
      mp: 0, power: 1.9, techBonus: -30, isMagic: false,
    },
    // 竜の眷属の技（enemies.md：力押し1.4／薙ぎ払い1.7／踏み込み1.5。技リストの値＋敵専用の底上げ0.3）
    kin_power_strike: {
      name: "力押し", category: "attack", attribute: "physical",
      mp: 0, power: 1.4, techBonus: 20, isMagic: false,
    },
    kin_sweep: {
      name: "薙ぎ払い", category: "attack", attribute: "physical",
      mp: 0, power: 1.7, techBonus: 20, isMagic: false, area: true,
    },
    // ツェルフ（PS-012）の技（PLAN §5-2・技リスト）。中MPは20-35、高MPは45-60の帯から25・50を置く
    // ツインスラッシュ：物理・近距離・中MP・1.4・技+20。二連斬＝判定1回で2発（1発あたり威力0.7）
    twin_slash: {
      name: "ツインスラッシュ", category: "attack", attribute: "physical",
      mp: 25, power: 1.4, techBonus: 20, isMagic: false, hits: 2,
    },
    // ソニックウェーブ：攻撃＋足止め（複合）・物理・広範囲・中MP・1.19・技+20。
    // 判定に勝てば速さ低下（-20%・必中・3回固定。判定にだけ効き、行動順には効かない）
    sonic_wave: {
      name: "ソニックウェーブ", category: "attack", attribute: "physical",
      mp: 25, power: 1.19, techBonus: 20, isMagic: false, area: true, spdDown: 0.2, spdDownTurns: 3,
    },
    // デア・レーゲン（PS-012版）：魔法・広範囲・高MP・2.2・技-40。判定に勝てば必中＝軽減無視の満額
    der_regen: {
      name: "デア・レーゲン", category: "attack", attribute: "magic",
      mp: 50, power: 2.2, techBonus: -40, isMagic: true, area: true, trueHitOnWin: true,
    },
    vital_strike: {
      name: "急所狙い", category: "attack", attribute: "physical",
      mp: 12, power: 1.1, techBonus: 20, isMagic: false, critSkill: true,
    },
    // 薙刀払い（技リスト：物理・近距離/特殊・低MP・威力1.1・技+30／準汎用。廃区画・道中の宝箱の記憶結晶）
    naginata_sweep: {
      name: "薙刀払い", category: "attack", attribute: "physical",
      mp: 12, power: 1.1, techBonus: 30, isMagic: false,
    },
    // 防御姿勢（技リスト：防御カテゴリ・無属性・低MP・技+30／汎用。招竜の祭壇の記憶結晶）
    // 受動の「防御」として選ぶと、防御の判定に技ボーナスが乗る
    defense_stance: {
      name: "防御姿勢", category: "defense", attribute: "none",
      mp: 12, techBonus: 30, isMagic: false,
    },
    // カガリ固有
    kagari_staff: {
      name: "招竜の杖打ち", category: "attack", attribute: "physical",
      mp: 0, power: 1.7, techBonus: 30, isMagic: false,
    },
    kagari_chant: {
      name: "贄呼びの詠唱", category: "attack", attribute: "magic",
      mp: 60, power: 2.0, techBonus: 20, isMagic: true,
    },
    // 呪縛の紋：視界妨害型（判定-10・必中）。格上のボスの弱体化・視界妨害は永続（PLAN §4-11）。1回のみ（bosses.md）
    kagari_bind: {
      name: "呪縛の紋", category: "hold", attribute: "physical",
      mp: 20, guaranteedHit: true, scoreDebuff: 10, permanent: true, usesLimit: 1,
    },
    kagari_offering: {
      name: "供物の代償", category: "special", attribute: "none",
      mp: 0, selfHealPercent: 0.2, usesLimit: 1,
    },
  };

  // ── 第二章の雑魚敵・ボスの技（enemies.md／bosses.md。技リストの値に、雑魚は＋0.3、ボスは＋0.6の底上げ） ──
  // 状態異常（混乱の声・麻痺針・魔力封印・毒・よろめき・防御低下・地形変化）は、判定バトルの仕組みにまだ無いので、
  // 威力のある技はダメージだけを、威力のない搦め手は技ごと、いまは載せていない
  Object.assign(SKILLS, {
    e_knockdown: { name: "叩き伏せ", category: "attack", attribute: "physical", mp: 0, power: 0.9, techBonus: 30, isMagic: false },
    e_double: { name: "二連撃", category: "attack", attribute: "physical", mp: 0, power: 1.4, techBonus: 20, isMagic: false },
    e_vital: { name: "急所狙い", category: "attack", attribute: "physical", mp: 0, power: 1.4, techBonus: 20, isMagic: false },
    e_poison_arrow: { name: "毒矢", category: "attack", attribute: "physical", mp: 0, power: 1.24, techBonus: 30, isMagic: false },
    e_fire: { name: "火炎弾", category: "attack", attribute: "magic", mp: 0, power: 1.4, techBonus: 30, isMagic: true },
    e_thunder: { name: "雷撃", category: "attack", attribute: "magic", mp: 0, power: 1.4, techBonus: 30, isMagic: true },
    e_chain: { name: "チェインライトニング", category: "attack", attribute: "magic", mp: 0, power: 1.7, techBonus: 20, isMagic: true, area: true },
    e_frozen: { name: "フローズングラウンド", category: "attack", attribute: "magic", mp: 0, power: 0.7, techBonus: 20, isMagic: true },
    e_acid: { name: "アシッドクラウド", category: "attack", attribute: "magic", mp: 0, power: 0.7, techBonus: 20, isMagic: true },
    e_dark_pulse: { name: "ダークパルス", category: "attack", attribute: "magic", mp: 0, power: 1.24, techBonus: 30, isMagic: true },
    e_gehenna: { name: "ブレイズオブゲヘナ", category: "attack", attribute: "magic", mp: 0, power: 2.3, techBonus: 20, isMagic: true },
    // 牙の獣の大技：威力は全力突撃と同じ、技ボーナスだけが段階ごとに違う（enemies.md）
    e_ash_charge: { name: "灰駆", category: "breakthrough", attribute: "physical", mp: 0, power: 1.9, techBonus: -20, isMagic: false },
    e_fang_charge: { name: "竜牙駆", category: "breakthrough", attribute: "physical", mp: 0, power: 1.9, techBonus: -10, isMagic: false },
    // 書庫番（アーカイブの管理機構・bosses.md）。アクセス制限（魔力封印型）は魔力封印の仕組みがまだないので載せていない
    keeper_index: { name: "索引撃", category: "attack", attribute: "physical", mp: 0, power: 1.7, techBonus: 30, isMagic: false },
    keeper_beam: { name: "検索光線", category: "attack", attribute: "magic", mp: 0, power: 2.0, techBonus: 20, isMagic: true },
    // 灰色竜（bosses.md）：薙ぎ払い・灰塵の咆哮（広範囲の大技）・外皮再生（HP50%以下で1回、最大HPの15%）
    gd_sweep: { name: "薙ぎ払い", category: "attack", attribute: "physical", mp: 0, power: 2.0, techBonus: 20, isMagic: false, area: true },
    gd_roar: { name: "灰塵の咆哮", category: "attack", attribute: "magic", mp: 0, power: 2.8, techBonus: -30, isMagic: true, area: true },
    gd_regen: { name: "外皮再生", category: "special", attribute: "none", mp: 0, selfHealPercent: 0.15, usesLimit: 1 },
  });

  // ノーマル遠距離攻撃：弓を装備しているときだけ使える（弓がないと、この行動そのものができない。遠距離の「技」は弓がなくても使える）
  SKILLS.normal_ranged = { name: "ノーマル遠距離攻撃", category: "attack", attribute: "none", mp: 0, power: 1.0, techBonus: 0, isMagic: false, requiresBow: true };

  // 距離カテゴリ（PLAN §4-11・技リストの「距離」列）。near＝近距離／far＝遠距離／all＝全距離（魔法はすべて全距離）
  var RANGE = {
    normal_attack: "near", normal_breakthrough: "near", normal_ranged: "far",
    double_slash: "near", power_strike: "near", step_in: "near", vital_strike: "near", naginata_sweep: "near",
    bandit_strike: "near", enemy_step_in: "near", enemy_full_charge: "near",
    twin_slash: "near", sonic_wave: "far", der_regen: "all", fire_bolt: "all",
    kagari_staff: "near", kagari_chant: "all", kin_power_strike: "near", kin_sweep: "near",
    e_knockdown: "near", e_double: "near", e_vital: "near", e_poison_arrow: "far", e_fire: "all", e_thunder: "all",
    e_chain: "near", e_frozen: "all", e_acid: "near", e_dark_pulse: "all", e_gehenna: "all", e_ash_charge: "near", e_fang_charge: "near",
    keeper_index: "near", keeper_beam: "all", gd_sweep: "near", gd_roar: "all",
  };
  Object.keys(RANGE).forEach(function (id) { SKILLS[id].range = RANGE[id]; });

  // ── キャラクター（Lv1・第一章時点） ──
  const CHARACTERS = {
    seo: {
      id: "seo", name: "セオ", isBirdPerson: false,
      stats: { hp: 16, atk: 15, def: 15, spd: 15, mag: 13, men: 15, tec: 15, luck: 14 },
      // 成長：平均（指数1.0＝直線）
      joinLevel: 1, growthExp: 1.0,
      maxStats: { hp: 52, atk: 50, def: 50, spd: 50, mag: 42, men: 50, tec: 50, luck: 46 },
      // 一周目は基本カテゴリ（ノーマル攻撃・突破・防御）のみ（PLAN §7.5-4i）。ほかは記憶結晶で覚える
      skills: ["normal_attack", "normal_breakthrough"],
      canCounter: false,
      picto: { bodyColor: "#5b7a9d", headColor: "#e8dcc8" },
    },
    tzelf: {
      id: "tzelf", name: "ツェルフ", isBirdPerson: true, birdType: "hawk",
      stats: { hp: 26, atk: 46, def: 20, spd: 46, mag: 36, men: 28, tec: 45, luck: 16 },
      // 成長：早熟寄り（指数0.55）
      joinLevel: 1, growthExp: 0.55,
      maxStats: { hp: 52, atk: 92, def: 40, spd: 92, mag: 72, men: 56, tec: 90, luck: 32 },
      skills: ["normal_attack", "normal_breakthrough"],
      // 技：ツインスラッシュ／ソニックウェーブ／デア・レーゲン（PLAN §5-2）。レベルが上がると順に覚える。
      // 覚えるレベルは資料にないため、Lv1〜20に散らして置く（Lv5＝第二章の途中、Lv10＝第三章の目安、Lv15＝第四章以降の切り札）
      learnset: [{ lv: 5, skill: "twin_slash" }, { lv: 10, skill: "sonic_wave" }, { lv: 15, skill: "der_regen" }],
      // 探索技能（PLAN §5-2・探索個性は一人一個）：解錠＝体内に隠した解錠具で物理的な錠前をこじ開ける
      exploreSkill: "unlock",
      canCounter: false,
      picto: { bodyColor: "#6e6c68", headColor: "#8e8b86", beakColor: "#e0b040" },
    },
  };

  // ── 敵・ボス ──
  const ENEMIES = {
    // 第一章の雑魚。種族・技・経験値は enemies.md の通常種のまま。ただし能力値は enemies.md の値だと第一章で成立しない
    // （はぐれ賊1体に対し、単独のセオはLv1〜6で勝率0%。セオ＋ツェルフLv3でも賊3体に0%）ため、
    // 種族の能力の形はそのままに、エリアごとの倍率で縮めている（倍率は資料になく、シミュレーションで決めた仮の値）。
    //   灰ネズミ（チュートリアル・牙の獣×0.12）：Lv1のセオが必ず勝てる
    //   はぐれ賊（廃区画・隘路・賊×0.18）：Lv1のセオの勝率ほぼ100%、HPは4割ほど削られる
    //   祭壇の守衛＋使役の獣（招竜の祭壇・×0.4）：Lv1どうしのセオとツェルフで勝率99%、HPは半分ほど削られる
    ash_rat: {
      id: "ash_rat", exp: 5, name: "灰ネズミ", isBoss: false,
      stats: { hp: 19, atk: 8, def: 2, spd: 9, mag: 0, men: 1, tec: 8, luck: 4 },
      // チュートリアルは攻撃と防御だけを教える（攻略チャート第一章①）＝一撃のみ
      skills: ["bandit_strike"],
      picto: { bodyColor: "#8a8a8a", headColor: "#b0b0a8", isAnimal: true },
    },
    straggler_bandit: {
      id: "straggler_bandit", exp: 5, name: "はぐれ賊", isBoss: false,
      stats: { hp: 28, atk: 10, def: 5, spd: 11, mag: 0, men: 5, tec: 11, luck: 8 },
      skills: ["bandit_strike", "enemy_step_in"],
      picto: { bodyColor: "#6a5638", headColor: "#c8a878" },
    },
    // 祭壇守衛＝招竜派の信徒＋使役モンスター（攻略チャート第一章⑧）
    shrine_guard: {
      id: "shrine_guard", exp: 5, name: "招竜派の信徒", isBoss: false,
      stats: { hp: 63, atk: 23, def: 11, spd: 25, mag: 0, men: 11, tec: 24, luck: 17 },
      skills: ["bandit_strike", "enemy_step_in"],
      picto: { bodyColor: "#4a3a58", headColor: "#c8a878" },
    },
    shrine_beast: {
      id: "shrine_beast", exp: 5, name: "使役の獣", isBoss: false,
      stats: { hp: 65, atk: 27, def: 6, spd: 30, mag: 0, men: 5, tec: 26, luck: 12 },
      skills: ["bandit_strike", "enemy_step_in", "enemy_full_charge"],
      picto: { bodyColor: "#6a6a6a", headColor: "#9a9a90", isAnimal: true },
    },
    // 灰色の鳥人（ツェルフ）：加入時のステータスそのまま（HPは26%×4）。技も加入時と同じ（まだ技を覚えていない）
    tzelf_ambush: {
      id: "tzelf_ambush", exp: 0, name: "灰色の鳥人", isBoss: false,
      stats: { hp: 104, atk: 46, def: 20, spd: 46, mag: 36, men: 28, tec: 45, luck: 16 },
      skills: ["normal_attack", "normal_breakthrough"],
      picto: { bodyColor: "#6e6c68", headColor: "#8e8b86", beakColor: "#e0b040" },
    },
    // 時間切れの後に出る強敵：竜の眷属（enemies.md の通常種の値のまま）。倒しても経験値は0（PLAN §8-3b）
    dragon_kin: {
      id: "dragon_kin", exp: 0, name: "竜の眷属", isBoss: false,
      stats: { hp: 850, atk: 81, def: 34, spd: 51, mag: 37, men: 36, tec: 74, luck: 38 },
      skills: ["kin_power_strike", "kin_sweep", "enemy_step_in"],
      picto: { bodyColor: "#3a2a2a", headColor: "#5a4040", isAnimal: true },
    },
    // ── 第二章 ──
    // 書庫番（アーカイブ・必須ボス・3人前提。bosses.md の値のまま＝カガリと同じく倍率はかけない）。
    // カウンターあり。HP50%以下で一度だけ保守モード（攻撃・防御+20%を2行動、切れた後に1行動止まる）
    archive_keeper: {
      id: "archive_keeper", exp: 700, name: "書庫番", isBoss: true, canCounter: true, counterSkillId: "keeper_index",
      stats: { hp: 620, atk: 84, def: 54, spd: 56, mag: 50, men: 60, tec: 78, luck: 50 },
      skills: ["keeper_index", "keeper_beam"],
      picto: { bodyColor: "#4a5a6a", headColor: "#8aa0b0" },
    },
    // 灰色竜・灰の谷エンカウント版（bosses.md：最終章版の2倍＋調整。判定力だけ0.6倍）。
    // 探索中にシードの率で出会う。倒す相手ではなく、逃げる／撃退してやり過ごす
    grey_dragon_valley: {
      id: "grey_dragon_valley", exp: 0, name: "灰色竜", isBoss: true, canCounter: true, counterSkillId: "gd_sweep", judgeMul: 0.6,
      stats: { hp: 5000, atk: 180, def: 100, spd: 136, mag: 152, men: 164, tec: 168, luck: 100 },
      skills: ["gd_sweep", "gd_roar", "gd_regen"],
      picto: { bodyColor: "#6a6a6a", headColor: "#8a8a8a", isAnimal: true },
    },
    kagari: {
      id: "kagari", exp: 350, name: "カガリ", isBoss: true,
      stats: { hp: 300, atk: 60, def: 32, spd: 55, mag: 40, men: 32, tec: 62, luck: 50 },
      skills: ["kagari_staff", "kagari_chant", "kagari_bind", "kagari_offering"],
      picto: { bodyColor: "#7a3050", headColor: "#c89050" },
    },
  };

  // 第二章の雑魚（enemies.md の上位種・最上位種）。能力の形は資料のまま、第一章と同じくエリアごとの倍率で縮める
  // （倍率は資料になく、シミュレーションで決めた仮の値）。
  //   アーカイブ＝上位種×0.45（施設の中なので賊は出さない）：Lv4のセオとツェルフで勝率95%前後、HPは半分ほど削られる
  //   灰の谷＝最上位種・竜血の眷属×VALLEY：推奨Lv10-11（PLAN 推奨レベル表）で勝てる強さ。本筋のLv4-6では歯が立たない
  //   （シンボルエンカウントなので、見て避けて通れる）
  var ARCHIVE_SCALE = 0.45, VALLEY_SCALE = 0.6;
  function ch2Enemy(id, name, exp, st, skills, picto, scale) {
    var s2 = {};
    Object.keys(st).forEach(function (k) { s2[k] = Math.round(st[k] * scale); });
    ENEMIES[id] = { id: id, exp: exp, name: name, isBoss: false, stats: s2, skills: skills, picto: picto };
  }
  // 上位種（アーカイブ）
  ch2Enemy("ash_fang", "灰牙の獣", 17, { hp: 161, atk: 80, def: 19, spd: 85, mag: 0, men: 14, tec: 73, luck: 38 }, ["bandit_strike", "enemy_step_in", "e_ash_charge"], { bodyColor: "#5a5a5a", headColor: "#8a8a82", isAnimal: true }, ARCHIVE_SCALE);
  ch2Enemy("iron_shell", "鉄殻虫", 24, { hp: 149, atk: 54, def: 54, spd: 36, mag: 30, men: 15, tec: 47, luck: 22 }, ["e_knockdown", "e_frozen"], { bodyColor: "#4a4a56", headColor: "#6a6a78", isAnimal: true }, ARCHIVE_SCALE);
  ch2Enemy("ember_echo", "燼の残響", 15, { hp: 160, atk: 36, def: 22, spd: 71, mag: 66, men: 18, tec: 73, luck: 62 }, ["e_thunder"], { bodyColor: "#6a4a3a", headColor: "#c08060" }, ARCHIVE_SCALE);
  // 最上位種（灰の谷）
  ch2Enemy("cunning_bandit", "狡猾な賊", 45, { hp: 155, atk: 76, def: 35, spd: 78, mag: 0, men: 33, tec: 74, luck: 60 }, ["e_double", "e_vital"], { bodyColor: "#4a3a2a", headColor: "#c8a878" }, VALLEY_SCALE);
  ch2Enemy("dragon_fang", "竜牙の獣", 41, { hp: 160, atk: 89, def: 21, spd: 93, mag: 0, men: 15, tec: 80, luck: 44 }, ["bandit_strike", "enemy_step_in", "e_fang_charge"], { bodyColor: "#4a4040", headColor: "#7a6a60", isAnimal: true }, VALLEY_SCALE);
  ch2Enemy("dragon_shell", "竜殻虫", 59, { hp: 148, atk: 61, def: 60, spd: 40, mag: 34, men: 16, tec: 52, luck: 26 }, ["e_knockdown", "e_frozen", "e_acid"], { bodyColor: "#3a3a44", headColor: "#5a5a68", isAnimal: true }, VALLEY_SCALE);
  ch2Enemy("dragon_echo", "竜の残響", 36, { hp: 159, atk: 40, def: 24, spd: 78, mag: 76, men: 19, tec: 80, luck: 72 }, ["e_thunder", "e_chain"], { bodyColor: "#5a3a4a", headColor: "#b07090" }, VALLEY_SCALE);
  ch2Enemy("dragonblood_kin", "竜血の眷属", 285, { hp: 1100, atk: 117, def: 47, spd: 71, mag: 54, men: 52, tec: 104, luck: 54 }, ["kin_power_strike", "kin_sweep", "enemy_step_in", "e_gehenna"], { bodyColor: "#3a2020", headColor: "#6a3030", isAnimal: true }, VALLEY_SCALE);

  // ── 持ち物（PLAN.md §7.5-4k6「消耗品の価格」／装備・入手物まとめ「記憶結晶」／攻略チャート第一章） ──
  // heal: hp/mp＝回復する量、hpPct/mpPct＝最大値に対する割合。learn: 使うと覚える技。
  // food: 食料（旅の糧。回復には使わない）。key: 大事なもの（30枠の外）
  const ITEMS = {
    // 第一章の住居の棚（アイテム使用のチュートリアル）。回復量は資料に数値がないため仮
    dried_meat: { name: "干し肉", desc: "HPを30回復する。", heal: { hp: 30 } },
    old_potion: { name: "古びた回復薬", desc: "HPを40回復する。", heal: { hp: 40 } },
    // 店の消耗品
    ration: { name: "携行食", desc: "食料。旅の糧になる。", food: true },
    potion: { name: "回復薬", desc: "HPを60回復する。", heal: { hp: 60 } },
    hi_potion: { name: "上回復薬", desc: "HPを150回復する。", heal: { hp: 150 } },
    magic_stone: { name: "魔石", desc: "MPを最大値の30%回復する。", heal: { mpPct: 0.3 } },
    hi_magic_stone: { name: "上魔石", desc: "MPを最大値の50%回復する。", heal: { mpPct: 0.5 } },
    elixia: { name: "エリクシア", desc: "HPとMPを最大値の50%ずつ回復する。", heal: { hpPct: 0.5, mpPct: 0.5 } },
    // 記憶結晶（消耗品。1個で1人が、その技を覚える）
    crystal_double_slash: { name: "二連撃の記憶結晶", desc: "使うと〈二連撃〉を覚える。", learn: "double_slash" },
    crystal_naginata: { name: "薙刀払いの記憶結晶", desc: "使うと〈薙刀払い〉を覚える。", learn: "naginata_sweep" },
    crystal_vital_strike: { name: "急所狙いの記憶結晶", desc: "使うと〈急所狙い〉を覚える。", learn: "vital_strike" },
    crystal_defense_stance: { name: "防御姿勢の記憶結晶", desc: "使うと〈防御姿勢〉を覚える。", learn: "defense_stance" },
  };

  // ── 単一シード（PLAN §8-5b）：ゲームの揺らぎを一つのシードが統べる。シードが決めるのは次の5つだけ
  //   ①灰色竜のエンカウント率（一歩ごと）②ミラの全体小回復の発動率（1ターンごと）③フウィムの喀血の周期
  //   ④ランダム出現NPC ⑤クリティカルの周期（パーティ全体の累計攻撃回数）
  // 値は設計書のサンプル表（シード0〜9）のまま。新しく始めたとき・拠点で休んだとき・灰色竜から逃げた／撃退したとき・
  // 全滅からやり直すときに引き直す（ロードでは復元）。引き直すと、周期を数えるカウンターも0に戻る。
  // 率で決まる①②も、シードと「何回目の判定か」から決まる擬似乱数で判定する＝同じシード・同じカウンターなら結果も同じ
  var DRAGON_RATE = { "極小": 0.001, "小": 0.003, "中": 0.006, "大": 0.010, "特大": 0.020 };
  var MIRA_RATE = { "極小": 0.02, "小": 0.04, "中": 0.07, "大": 0.12, "特大": 0.20 };
  var SEED_TABLE = [
    { dragon: "中", mira: "大", cough: 10, npcs: [4, 8, 9], crit: 22 },
    { dragon: "大", mira: "小", cough: 11, npcs: [1, 3, 6], crit: 33 },
    { dragon: "特大", mira: "中", cough: 11, npcs: [2, 5, 7], crit: 42 },
    { dragon: "小", mira: "中", cough: 11, npcs: [1, 3, 6], crit: 32 },
    { dragon: "小", mira: "中", cough: 12, npcs: [2, 5, 9], crit: 37 },
    { dragon: "大", mira: "小", cough: 26, npcs: [4, 5, 8], crit: 42 },
    { dragon: "大", mira: "中", cough: 15, npcs: [7, 8, 9], crit: 20 },
    { dragon: "極小", mira: "特大", cough: 30, npcs: [3, 5, 7], crit: 25 },
    { dragon: "特大", mira: "中", cough: 15, npcs: [1, 6, 8], crit: 30 },
    { dragon: "中", mira: "中", cough: 15, npcs: [2, 4], crit: 37 },
  ];
  // シードの状態（セーブに入る）。period/count はクリティカルの周期とカウンター（以前の版と同じ名前）
  function seedState(n) {
    var t = SEED_TABLE[n];
    return { seed: n, period: t.crit, count: 0, dragonRate: DRAGON_RATE[t.dragon], miraRate: MIRA_RATE[t.mira],
      coughPeriod: t.cough, coughCount: 0, npcs: t.npcs.slice(), dragonN: 0, miraN: 0 };
  }
  function newSeed() { return seedState(Math.floor(Math.random() * SEED_TABLE.length)); }
  // 以前の版の記録（クリティカルの周期しか持たない）を、同じシード番号の全要素に広げる（カウンターは持ち越す）
  function upgradeSeed(sd) {
    if (!sd || sd.seed === undefined || !SEED_TABLE[sd.seed]) return newSeed();
    if (sd.dragonRate !== undefined) return sd;
    var full = seedState(sd.seed);
    full.count = sd.count || 0;
    return full;
  }
  // シードと判定の回数から決まる 0〜1 の値（kind：dragon／mira）。呼ぶたびにその判定のカウンターが1進む
  var KIND_SALT = { dragon: 0x9e3779b1, mira: 0x85ebca77 };
  function seedRoll(sd, kind) {
    var key = kind + "N";
    sd[key] = (sd[key] || 0) + 1;
    var h = (Math.imul(sd.seed + 1, 0x27d4eb2d) ^ Math.imul(sd[key], 0x165667b1) ^ (KIND_SALT[kind] || 0)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // ── レベルと経験値（PLAN.md「経験値テーブル」、全キャラステータス一覧「レベル成長仕様」） ──
  var MAX_LEVEL = 20;
  // そのレベルになるのに要る累計経験値（10 × Lv^2.5。Lv1＝10、Lv20＝17889）
  function expForLevel(lv) { return Math.round(10 * Math.pow(lv, 2.5)); }
  function levelForExp(exp) {
    var lv = 1;
    while (lv < MAX_LEVEL && exp >= expForLevel(lv + 1)) lv++;
    return lv;
  }
  // そのレベルで使える技：初めから持つ技＋そのレベルまでに覚える技
  function skillsAt(defId, lv) {
    var c = CHARACTERS[defId];
    var list = c.skills.slice();
    (c.learnset || []).forEach(function (l) { if (l.lv <= lv && list.indexOf(l.skill) < 0) list.push(l.skill); });
    return list;
  }
  // 値(Lv) = 加入時 + (最大 - 加入時) × t^e　（t = (Lv - 加入Lv) / (20 - 加入Lv)）
  function statsAt(defId, lv) {
    var c = CHARACTERS[defId];
    if (!c.maxStats) return Object.assign({}, c.stats);
    var j = c.joinLevel || 1;
    var t = Math.max(0, Math.min(1, (lv - j) / (MAX_LEVEL - j)));
    var f = Math.pow(t, c.growthExp || 1);
    var out = {};
    Object.keys(c.stats).forEach(function (k) { out[k] = Math.round(c.stats[k] + (c.maxStats[k] - c.stats[k]) * f); });
    return out;
  }
  // 残り歩数が減るほど敵が強くなる（PLAN §8-3b：100〜75%×1.0／75〜50%×1.15／50〜25%×1.3／25〜0%×1.5）
  function strengthRate(steps, limit) {
    var left = 1 - steps / limit;
    return left > 0.75 ? 1.0 : left > 0.5 ? 1.15 : left > 0.25 ? 1.3 : 1.5;
  }
  // 残り歩数が減るほど経験値が増える（100〜75%：×1.0／75〜50%：×1.4／50〜25%：×1.9／25〜0%：×2.5）
  function expRate(steps, limit) {
    var left = 1 - steps / limit;
    return left > 0.75 ? 1.0 : left > 0.5 ? 1.4 : left > 0.25 ? 1.9 : 2.5;
  }

  // 回復の品を使う（メニューと戦闘で共通）。実際に回復した量を返す
  function useHealItem(itemId, c) {
    var h = ITEMS[itemId].heal || {};
    var hp0 = c.hp, mp0 = c.mp;
    c.hp = Math.min(c.maxHp, c.hp + (h.hp || 0) + Math.ceil(c.maxHp * (h.hpPct || 0)));
    c.mp = Math.min(c.maxMp, c.mp + (h.mp || 0) + Math.ceil(c.maxMp * (h.mpPct || 0)));
    return { hp: c.hp - hp0, mp: c.mp - mp0 };
  }
  // その相手に使って意味があるか（減っていない値しか回復しない品は使わせない）
  function healNeeded(itemId, c) {
    var h = ITEMS[itemId].heal || {};
    return !!(((h.hp || h.hpPct) && c.hp < c.maxHp) || ((h.mp || h.mpPct) && c.mp < c.maxMp));
  }

  function cloneStats(stats) {
    return Object.assign({}, stats);
  }

  // 真相の断片（PLAN §7.5-4b の一覧。メニューに出す文）。T1は前半（殺せない）と完成（役目が移る）の二段
  var TRUTHS = {
    T1a: "灰色竜は殺せない。挑んだ者は、皆灰になった。",
    T2: "竜に長く留まられた土地は、命を吸われて痩せる。竜は何十年かごとに寝床を変える。",
    T3: "鳥人は滅んだのではない。竜のもとへ還った。わずかに、還らずに残った者もいる。",
    T4: "灰の谷の奥に埋もれた眷属には、鳥人の羽の形が残っていた。",
  };
  var TRUTH_ORDER = ["T1a", "T2", "T3", "T4"];

  return { SKILLS: SKILLS, TRUTHS: TRUTHS, TRUTH_ORDER: TRUTH_ORDER, CHARACTERS: CHARACTERS, ENEMIES: ENEMIES, ITEMS: ITEMS, cloneStats: cloneStats,
    useHealItem: useHealItem, healNeeded: healNeeded,
    MAX_LEVEL: MAX_LEVEL, expForLevel: expForLevel, levelForExp: levelForExp, statsAt: statsAt, skillsAt: skillsAt, expRate: expRate, strengthRate: strengthRate, newSeed: newSeed, upgradeSeed: upgradeSeed, seedRoll: seedRoll, SEED_TABLE: SEED_TABLE };
})();
