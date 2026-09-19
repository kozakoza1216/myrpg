import type { Skill } from "../engine/types";

// 技リスト-3-1.md 準拠。威力係数・技ボーナスは同文書の確定値。
// 敵専用技は bosses.md の「敵専用底上げ+0.6」「雑魚+0.3」を反映済みの値をそのまま採用。

export const SKILLS: Record<string, Skill> = {
  // ── 汎用（プレイヤー） ──
  normal_attack: {
    id: "normal_attack",
    name: "ノーマル攻撃",
    category: "attack",
    attribute: "physical",
    mpCost: 0,
    power: 0.9,
    techBonus: 30,
    description: "武器で殴る基本の一撃。MP消費なし。",
  },
  double_slash: {
    id: "double_slash",
    name: "二連撃",
    category: "attack",
    attribute: "physical",
    mpCost: 12,
    power: 1.1,
    techBonus: 20,
    description: "二連続で斬りつける。",
  },
  power_strike: {
    id: "power_strike",
    name: "力押し",
    category: "attack",
    attribute: "physical",
    mpCost: 12,
    power: 1.1,
    techBonus: 20,
    description: "防御を無視して押し切る一撃。",
  },
  vital_strike: {
    id: "vital_strike",
    name: "急所狙い",
    category: "attack",
    attribute: "physical",
    mpCost: 12,
    power: 1.1,
    techBonus: 20,
    description: "急所を狙う。会心の可能性がやや高い。",
  },
  fire_bolt: {
    id: "fire_bolt",
    name: "火炎弾",
    category: "attack",
    attribute: "magic",
    mpCost: 12,
    power: 1.1,
    techBonus: 30,
    description: "炎の塊を放つ基礎魔法。",
  },
  step_in: {
    id: "step_in",
    name: "踏み込み",
    category: "breakthrough",
    attribute: "physical",
    mpCost: 12,
    power: 1.2,
    techBonus: 30,
    description: "前衛を突破し後衛を狙う。",
  },
  guard_stance: {
    id: "guard_stance",
    name: "防御姿勢",
    category: "defense",
    attribute: "none",
    mpCost: 12,
    techBonus: 30,
    description: "構えて防御判定を積む（受動選択用）。",
  },

  // ── カガリ（第一章ボス）固有技 ──
  kagari_staff: {
    id: "kagari_staff",
    name: "招竜の杖打ち",
    category: "attack",
    attribute: "physical",
    mpCost: 0,
    power: 1.7,
    techBonus: 30,
    description: "祭儀の杖で打ち据える。",
  },
  kagari_chant: {
    id: "kagari_chant",
    name: "贄呼びの詠唱",
    category: "attack",
    attribute: "magic",
    mpCost: 60,
    power: 2.0,
    techBonus: 20,
    description: "竜を呼ぶ儀式の詠唱を戦闘に転用した大技。",
  },
  kagari_bind: {
    id: "kagari_bind",
    name: "呪縛の紋",
    category: "hold",
    attribute: "physical",
    mpCost: 20,
    guaranteedHit: true,
    usesLimit: 1,
    description: "必中の紋様。相手の判定を一定ターン下げる（視界妨害）。",
  },
  kagari_offering: {
    id: "kagari_offering",
    name: "供物の代償",
    category: "passive",
    attribute: "none",
    mpCost: 0,
    selfHealPercent: 0.2,
    usesLimit: 1,
    description: "信徒から捧げられた供物で自らを癒す。1回のみ。",
  },

  // ── 雑魚敵 ──
  mob_bite: {
    id: "mob_bite",
    name: "かじりつき",
    category: "attack",
    attribute: "physical",
    mpCost: 0,
    power: 0.9,
    techBonus: 20,
    description: "灰ネズミの体当たり。",
  },
  bandit_strike: {
    id: "bandit_strike",
    name: "一撃",
    category: "attack",
    attribute: "physical",
    mpCost: 0,
    power: 1.2,
    techBonus: 30,
    description: "賊の粗雑な一撃。",
  },
  bandit_rush: {
    id: "bandit_rush",
    name: "踏み込み",
    category: "breakthrough",
    attribute: "physical",
    mpCost: 12,
    power: 1.5,
    techBonus: 30,
    description: "賊が前衛を突破しにかかる。",
  },
};

export function getSkill(id: string): Skill {
  const skill = SKILLS[id];
  if (!skill) throw new Error(`unknown skill: ${id}`);
  return skill;
}
