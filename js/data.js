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

  // ノーマル遠距離攻撃：弓を装備しているときだけ使える（弓がないと、この行動そのものができない。遠距離の「技」は弓がなくても使える）
  SKILLS.normal_ranged = { name: "ノーマル遠距離攻撃", category: "attack", attribute: "none", mp: 0, power: 1.0, techBonus: 0, isMagic: false, requiresBow: true };

  // 距離カテゴリ（PLAN §4-11・技リストの「距離」列）。near＝近距離／far＝遠距離／all＝全距離（魔法はすべて全距離）
  var RANGE = {
    normal_attack: "near", normal_breakthrough: "near", normal_ranged: "far",
    double_slash: "near", power_strike: "near", step_in: "near", vital_strike: "near", naginata_sweep: "near",
    bandit_strike: "near", enemy_step_in: "near", enemy_full_charge: "near",
    twin_slash: "near", sonic_wave: "far", der_regen: "all", fire_bolt: "all",
    kagari_staff: "near", kagari_chant: "all", kin_power_strike: "near", kin_sweep: "near",
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
    kagari: {
      id: "kagari", exp: 350, name: "カガリ", isBoss: true,
      stats: { hp: 300, atk: 60, def: 32, spd: 55, mag: 40, men: 32, tec: 62, luck: 50 },
      skills: ["kagari_staff", "kagari_chant", "kagari_bind", "kagari_offering"],
      picto: { bodyColor: "#7a3050", headColor: "#c89050" },
    },
  };

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

  // ── 単一シード（PLAN §8-5b）：いまはクリティカル周期だけを使う（パーティ全体の累計攻撃回数で何回目に出るか）。
  // シード0〜9の周期は設計書のサンプル表のまま。新しく始めたとき・全滅したときに引き直し、ロードでは復元する（§4-11）
  var CRIT_PERIODS = [22, 33, 42, 32, 37, 42, 20, 25, 30, 37];
  function newSeed() {
    var seed = Math.floor(Math.random() * CRIT_PERIODS.length);
    return { seed: seed, period: CRIT_PERIODS[seed], count: 0 };
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

  return { SKILLS: SKILLS, CHARACTERS: CHARACTERS, ENEMIES: ENEMIES, ITEMS: ITEMS, cloneStats: cloneStats,
    useHealItem: useHealItem, healNeeded: healNeeded,
    MAX_LEVEL: MAX_LEVEL, expForLevel: expForLevel, levelForExp: levelForExp, statsAt: statsAt, skillsAt: skillsAt, expRate: expRate, strengthRate: strengthRate, newSeed: newSeed };
})();
