// データ層。PLAN.md §5 のマッピング指針に基づく。
// キャラのステータスは「全キャラステータス一覧」レベル別ステータス早見表の値をそのまま使用。
// HP実値 = 表のHP% × 4（PLAN §1-1）。ボスはHPのみ実数（%スケール外）。
window.RPG = window.RPG || {};

RPG.Data = (function () {
  // ── 技（技リスト-3-1.md 準拠。カテゴリ: attack/breakthrough/hold/defense ）
  const SKILLS = {
    normal_attack: {
      name: "ノーマル攻撃", category: "attack", attribute: "none",
      mp: 0, power: 0.9, techBonus: 0, isMagic: false,
    },
    normal_breakthrough: {
      name: "ノーマル突破", category: "breakthrough", attribute: "none",
      mp: 0, power: 0.9, techBonus: 0, isMagic: false,
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
    mob_bite: {
      name: "かじりつき", category: "attack", attribute: "physical",
      mp: 0, power: 0.9, techBonus: 20, isMagic: false,
    },
    bandit_strike: {
      name: "一撃", category: "attack", attribute: "physical",
      mp: 0, power: 1.2, techBonus: 30, isMagic: false,
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
    kagari_bind: {
      name: "呪縛の紋", category: "hold", attribute: "physical",
      mp: 20, guaranteedHit: true, scoreDebuff: 20, debuffTurns: 3,
    },
    kagari_offering: {
      name: "供物の代償", category: "special", attribute: "none",
      mp: 0, selfHealPercent: 0.2, usesLimit: 1,
    },
  };

  // ── キャラクター（Lv1・第一章時点） ──
  const CHARACTERS = {
    seo: {
      id: "seo", name: "セオ", isBirdPerson: false,
      stats: { hp: 13, atk: 10, def: 12, spd: 15, mag: 13, men: 15, tec: 12, luck: 14 },
      // 成長：平均（指数1.0＝直線）。Lv20の値は全キャラステータス一覧の早見表
      joinLevel: 1, growthExp: 1.0,
      maxStats: { hp: 52, atk: 50, def: 50, spd: 50, mag: 42, men: 50, tec: 50, luck: 46 },
      skills: ["normal_attack", "normal_breakthrough", "step_in"],
      canCounter: false,
      picto: { bodyColor: "#5b7a9d", headColor: "#e8dcc8" },
    },
    tzelf: {
      id: "tzelf", name: "ツェルフ", isBirdPerson: true, birdType: "hawk",
      stats: { hp: 30, atk: 55, def: 25, spd: 60, mag: 45, men: 35, tec: 58, luck: 20 },
      // 成長：早熟寄り（指数0.55）
      joinLevel: 1, growthExp: 0.55,
      maxStats: { hp: 52, atk: 92, def: 40, spd: 92, mag: 72, men: 56, tec: 90, luck: 32 },
      skills: ["normal_attack", "normal_breakthrough", "double_slash", "power_strike", "step_in"],
      canCounter: false,
      picto: { bodyColor: "#a03030", headColor: "#c85050", beakColor: "#e0b040" },
    },
  };

  // ── 敵・ボス ──
  const ENEMIES = {
    ash_rat: {
      id: "ash_rat", exp: 5, name: "灰ネズミ", isBoss: false,
      stats: { hp: 22, atk: 8, def: 4, spd: 10, mag: 0, men: 6, tec: 8, luck: 10 },
      skills: ["mob_bite"],
      picto: { bodyColor: "#8a8a8a", headColor: "#b0b0a8", isAnimal: true },
    },
    straggler_bandit: {
      id: "straggler_bandit", exp: 5, name: "はぐれ賊", isBoss: false,
      stats: { hp: 26, atk: 12, def: 8, spd: 14, mag: 0, men: 8, tec: 14, luck: 12 },
      skills: ["bandit_strike"],
      picto: { bodyColor: "#6a5638", headColor: "#c8a878" },
    },
    shrine_guard: {
      id: "shrine_guard", exp: 5, name: "祭壇の守衛", isBoss: false,
      stats: { hp: 42, atk: 18, def: 12, spd: 20, mag: 0, men: 12, tec: 20, luck: 15 },
      skills: ["bandit_strike"],
      picto: { bodyColor: "#4a3a58", headColor: "#c8a878" },
    },
    tzelf_ambush: {
      id: "tzelf_ambush", exp: 0, name: "赤い鳥人", isBoss: false,
      stats: { hp: 90, atk: 50, def: 22, spd: 55, mag: 30, men: 28, tec: 52, luck: 25 },
      skills: ["bandit_strike", "double_slash"],
      picto: { bodyColor: "#a03030", headColor: "#c85050", beakColor: "#e0b040" },
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

  // ── レベルと経験値（PLAN.md「経験値テーブル」、全キャラステータス一覧「レベル成長仕様」） ──
  var MAX_LEVEL = 20;
  // そのレベルになるのに要る累計経験値（10 × Lv^2.5。Lv1＝10、Lv20＝17889）
  function expForLevel(lv) { return Math.round(10 * Math.pow(lv, 2.5)); }
  function levelForExp(exp) {
    var lv = 1;
    while (lv < MAX_LEVEL && exp >= expForLevel(lv + 1)) lv++;
    return lv;
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
  // 残り歩数が減るほど経験値が増える（100〜75%：×1.0／75〜50%：×1.4／50〜25%：×1.9／25〜0%：×2.5）
  function expRate(steps, limit) {
    var left = 1 - steps / limit;
    return left > 0.75 ? 1.0 : left > 0.5 ? 1.4 : left > 0.25 ? 1.9 : 2.5;
  }

  function cloneStats(stats) {
    return Object.assign({}, stats);
  }

  return { SKILLS: SKILLS, CHARACTERS: CHARACTERS, ENEMIES: ENEMIES, ITEMS: ITEMS, cloneStats: cloneStats,
    MAX_LEVEL: MAX_LEVEL, expForLevel: expForLevel, levelForExp: levelForExp, statsAt: statsAt, expRate: expRate };
})();
