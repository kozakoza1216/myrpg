import type {
  Combatant,
  Stats,
  Skill,
  Stance,
  SkillCategory,
} from "./types";
import { getSkill } from "../data/skills";

let instanceCounter = 0;

export function createCombatant(
  name: string,
  stats: Stats,
  skillIds: string[],
  isEnemy: boolean,
  size: "normal" | "giant" = "normal"
): Combatant {
  instanceCounter += 1;
  return {
    instanceId: `${name}-${instanceCounter}`,
    name,
    isEnemy,
    stats,
    maxHp: stats.hp,
    hp: stats.hp,
    maxMp: stats.mag + stats.spir,
    mp: stats.mag + stats.spir,
    skills: skillIds.map((id) => ({
      skillId: id,
      usesLeft: getSkill(id).usesLimit,
    })),
    atb: Math.random() * 40, // 初手が横並びにならないよう少しばらす
    ready: false,
    defeated: false,
    scoreModifier: 0,
    scoreModifierTurns: 0,
    size,
  };
}

const ATB_THRESHOLD = 100;
const STANCE_BONUS: Record<Stance, number> = {
  defense: 25,
  evade: 20,
  counter: 20,
};
const COUNTER_BACK_BONUS = 30;
const GUARANTEED_DAMAGE_COEF = 1.0;

/** 判定力。PLAN §4-2 系の各種判定式。 */
function judgmentValue(
  stats: Stats,
  kind: "attack" | "breakthrough" | "defense" | "evade"
): number {
  switch (kind) {
    case "attack":
      return (stats.atk + stats.tech) / 2;
    case "breakthrough":
      return (stats.atk + stats.spd) / 2;
    case "defense":
      return (stats.def + stats.spir) / 2;
    case "evade":
      return (stats.spd + stats.tech) / 2;
  }
}

function rollRandom(): number {
  return Math.floor(Math.random() * 21) - 10; // -10〜+10
}

/** 相性係数。同属性表を基準にした簡易実装（無属性の構えは中立が既定）。 */
function affinity(
  attackerCategory: SkillCategory,
  stance: Stance
): { atkMul: number; defMul: number } {
  if (attackerCategory === "attack" && stance === "defense") return { atkMul: 0.75, defMul: 1 };
  if (attackerCategory === "attack" && stance === "evade") return { atkMul: 0.75, defMul: 1 };
  if (attackerCategory === "breakthrough" && stance === "defense") return { atkMul: 1, defMul: 0.75 };
  return { atkMul: 1, defMul: 1 };
}

export interface ActionOutcome {
  attackerWins: boolean;
  attackerScore: number;
  defenderScore: number;
  damage: number;
  guaranteedApplied: boolean;
  critical: boolean;
  negated: boolean;
  reflected: boolean;
  log: string[];
}

function critRoll(attacker: Combatant, defender: Combatant): boolean {
  const chance = 0.05 + (attacker.stats.luck - defender.stats.luck) / 500;
  return Math.random() < Math.max(0.01, chance);
}

function stanceJudgmentKind(stance: Stance): "defense" | "evade" | "attack" {
  if (stance === "defense") return "defense";
  if (stance === "evade") return "evade";
  return "attack"; // counter は反撃技の攻撃判定を使う
}

/** 攻撃側の行動を、受動側の構えに対して解決する。 */
export function resolveAction(
  attacker: Combatant,
  skill: Skill,
  defender: Combatant,
  stance: Stance
): ActionOutcome {
  const log: string[] = [];
  const category = skill.category === "hold" ? "attack" : skill.category;
  const atkKind = category === "breakthrough" ? "breakthrough" : "attack";
  const { atkMul, defMul } = affinity(category as SkillCategory, stance);

  const attackerBase =
    judgmentValue(attacker.stats, atkKind) + (skill.techBonus ?? 0) + attacker.scoreModifier;
  const attackerScore = attackerBase * atkMul + rollRandom();

  const stanceKind = stanceJudgmentKind(stance);
  let defenderBase = judgmentValue(defender.stats, stanceKind) + STANCE_BONUS[stance] + defender.scoreModifier;
  if (stance === "counter") defenderBase += COUNTER_BACK_BONUS;
  const defenderScore = defenderBase * defMul + rollRandom();

  const attackerWins = skill.guaranteedHit ? true : attackerScore > defenderScore;

  let damage = 0;
  let guaranteedApplied = false;
  let negated = false;
  let reflected = false;

  const basePower = attacker.stats.atk * (skill.power ?? 0);

  if (stance === "counter" && !skill.guaranteedHit) {
    if (!attackerWins) {
      // カウンター成立：技のダメージがそのまま攻撃者へ返る
      damage = Math.round(basePower);
      reflected = true;
      log.push(`${defender.name}のカウンターが成立！ ${attacker.name}に${damage}のダメージ。`);
    } else {
      damage = Math.round(basePower); // カウンター失敗＝軽減なしで受ける
      log.push(`${defender.name}のカウンターは不発。まともに受けてしまった。`);
    }
  } else if (stance === "defense") {
    if (attackerWins) {
      damage = Math.round(basePower * 0.5 + attacker.stats.atk * GUARANTEED_DAMAGE_COEF);
      guaranteedApplied = true;
    } else {
      damage = Math.round(basePower * 0.3);
    }
  } else {
    // evade
    if (attackerWins) {
      damage = Math.round(basePower * 0.7);
    } else {
      damage = 0;
      negated = true;
    }
  }

  let critical = false;
  if (damage > 0 && skill.power && critRoll(attacker, defender)) {
    critical = true;
    damage = Math.round(damage * 1.5);
  }

  return {
    attackerWins,
    attackerScore: Math.round(attackerScore),
    defenderScore: Math.round(defenderScore),
    damage,
    guaranteedApplied,
    critical,
    negated,
    reflected,
    log,
  };
}

/** resolveAction を呼び、結果に応じて正しい対象へダメージを適用し、表示用ログも組み立てる。 */
export function resolveAndApply(
  attacker: Combatant,
  skill: Skill,
  defender: Combatant,
  stance: Stance
): ActionOutcome {
  const outcome = resolveAction(attacker, skill, defender, stance);
  const stanceLabel = { defense: "防御", evade: "回避", counter: "カウンター" }[stance];
  const lines: string[] = [
    `${attacker.name}の${skill.name}！ ${defender.name}は${stanceLabel}を選択。`,
    ...outcome.log,
  ];

  if (outcome.reflected) {
    applyDamage(attacker, outcome.damage);
  } else {
    applyDamage(defender, outcome.damage);
    if (outcome.negated) {
      lines.push(`${defender.name}は${skill.name}を完全に凌いだ！`);
    } else if (outcome.damage > 0) {
      lines.push(
        `${defender.name}に${outcome.damage}のダメージ${outcome.critical ? "（会心の一撃！）" : ""}${
          outcome.guaranteedApplied ? "（保証ダメージ込み）" : ""
        }`
      );
    }
  }
  outcome.log = lines;
  return outcome;
}

export function tickAtb(combatants: Combatant[], amount = 6): Combatant | null {
  for (const c of combatants) {
    if (c.defeated) continue;
    c.atb += c.stats.spd * (amount / 100);
    if (c.atb >= ATB_THRESHOLD) c.ready = true;
  }
  const readyOnes = combatants.filter((c) => c.ready && !c.defeated);
  if (readyOnes.length === 0) return null;
  readyOnes.sort((a, b) => b.atb - a.atb);
  return readyOnes[0];
}

export function consumeTurn(c: Combatant): void {
  c.atb -= ATB_THRESHOLD;
  if (c.atb < 0) c.atb = 0;
  c.ready = false;
  if (c.scoreModifierTurns > 0) {
    c.scoreModifierTurns -= 1;
    if (c.scoreModifierTurns === 0) c.scoreModifier = 0;
  }
}

export function applyDamage(target: Combatant, damage: number): void {
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp === 0) target.defeated = true;
}

export function applyHeal(target: Combatant, amount: number): void {
  target.hp = Math.min(target.maxHp, target.hp + amount);
}

export function findSkillState(c: Combatant, skillId: string) {
  return c.skills.find((s) => s.skillId === skillId);
}

export function canUseSkill(c: Combatant, skillId: string): boolean {
  const state = findSkillState(c, skillId);
  if (!state) return false;
  const skill = getSkill(skillId);
  if (state.usesLeft !== undefined && state.usesLeft <= 0) return false;
  if (!c.isEnemy && c.mp < skill.mpCost) return false;
  return true;
}

/** guaranteedHit の搦め手・自己回復技など、判定を介さない特殊効果の適用。 */
export function applySpecialEffect(
  attacker: Combatant,
  skill: Skill,
  target: Combatant | null
): string[] {
  const log: string[] = [];
  if (skill.selfHealPercent) {
    const heal = Math.round(attacker.maxHp * skill.selfHealPercent);
    applyHeal(attacker, heal);
    log.push(`${attacker.name}は${skill.name}でHPを${heal}回復した。`);
    return log;
  }
  if (skill.guaranteedHit && target) {
    target.scoreModifier -= 20;
    target.scoreModifierTurns = 3;
    log.push(`${attacker.name}の${skill.name}が${target.name}の判定を下げた！`);
    return log;
  }
  return log;
}

export function spendSkillCost(c: Combatant, skillId: string): void {
  const skill = getSkill(skillId);
  const state = findSkillState(c, skillId);
  if (state && state.usesLeft !== undefined) state.usesLeft -= 1;
  if (!c.isEnemy) c.mp = Math.max(0, c.mp - skill.mpCost);
}
