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
      skills: ["normal_attack", "normal_breakthrough", "step_in"],
      canCounter: false,
      picto: { bodyColor: "#5b7a9d", headColor: "#e8dcc8" },
    },
    tzelf: {
      id: "tzelf", name: "ツェルフ", isBirdPerson: true, birdType: "hawk",
      stats: { hp: 30, atk: 55, def: 25, spd: 60, mag: 45, men: 35, tec: 58, luck: 20 },
      skills: ["normal_attack", "normal_breakthrough", "double_slash", "power_strike", "step_in"],
      canCounter: false,
      picto: { bodyColor: "#a03030", headColor: "#c85050", beakColor: "#e0b040" },
    },
  };

  // ── 敵・ボス ──
  const ENEMIES = {
    ash_rat: {
      id: "ash_rat", name: "灰ネズミ", isBoss: false,
      stats: { hp: 22, atk: 8, def: 4, spd: 10, mag: 0, men: 6, tec: 8, luck: 10 },
      skills: ["mob_bite"],
      picto: { bodyColor: "#8a8a8a", headColor: "#b0b0a8", isAnimal: true },
    },
    straggler_bandit: {
      id: "straggler_bandit", name: "はぐれ賊", isBoss: false,
      stats: { hp: 26, atk: 12, def: 8, spd: 14, mag: 0, men: 8, tec: 14, luck: 12 },
      skills: ["bandit_strike"],
      picto: { bodyColor: "#6a5638", headColor: "#c8a878" },
    },
    shrine_guard: {
      id: "shrine_guard", name: "祭壇の守衛", isBoss: false,
      stats: { hp: 42, atk: 18, def: 12, spd: 20, mag: 0, men: 12, tec: 20, luck: 15 },
      skills: ["bandit_strike"],
      picto: { bodyColor: "#4a3a58", headColor: "#c8a878" },
    },
    tzelf_ambush: {
      id: "tzelf_ambush", name: "赤い鳥人", isBoss: false,
      stats: { hp: 90, atk: 50, def: 22, spd: 55, mag: 30, men: 28, tec: 52, luck: 25 },
      skills: ["bandit_strike", "double_slash"],
      picto: { bodyColor: "#a03030", headColor: "#c85050", beakColor: "#e0b040" },
    },
    kagari: {
      id: "kagari", name: "カガリ", isBoss: true,
      stats: { hp: 300, atk: 60, def: 32, spd: 55, mag: 40, men: 32, tec: 62, luck: 50 },
      skills: ["kagari_staff", "kagari_chant", "kagari_bind", "kagari_offering"],
      picto: { bodyColor: "#7a3050", headColor: "#c89050" },
    },
  };

  function cloneStats(stats) {
    return Object.assign({}, stats);
  }

  return { SKILLS: SKILLS, CHARACTERS: CHARACTERS, ENEMIES: ENEMIES, cloneStats: cloneStats };
})();
