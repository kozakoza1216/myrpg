// 判定バトルシステムの型定義。PLAN.md / bosses.md / 技リスト-3-1.md の仕様に基づく。

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  mag: number;
  spir: number;
  tech: number;
  luck: number;
}

export type SkillCategory = "attack" | "breakthrough" | "hold" | "defense" | "passive";
export type Attribute = "physical" | "magic" | "none";

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  attribute: Attribute;
  mpCost: number;
  /** 威力係数。ダメージを持たない技は undefined */
  power?: number;
  /** 技ボーナス。判定対象外の技は undefined */
  techBonus?: number;
  description: string;
  /** true の場合、判定なしで必ず成立する（呪縛の紋 等） */
  guaranteedHit?: boolean;
  /** 全体攻撃か */
  hitsAll?: boolean;
  /** 自己回復（最大HP割合） */
  selfHealPercent?: number;
  /** 使用回数制限 */
  usesLimit?: number;
}

/** 受動側が選べる構え */
export type Stance = "defense" | "evade" | "counter";

export interface CombatantSkillState {
  skillId: string;
  usesLeft?: number;
}

export interface Combatant {
  instanceId: string;
  name: string;
  isEnemy: boolean;
  stats: Stats;
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  skills: CombatantSkillState[];
  atb: number;
  /** ATBが一定値に達したら行動可能 */
  ready: boolean;
  defeated: boolean;
  /** 1戦闘中の状態変化（技ボーナスやスコアへの一時補正） */
  scoreModifier: number;
  scoreModifierTurns: number;
  size?: "normal" | "giant";
}

export interface JudgmentResult {
  attackerScore: number;
  defenderScore: number;
  attackerWins: boolean;
  attackerRoll: number;
  defenderRoll: number;
}

export interface ActionLogEntry {
  message: string;
}
