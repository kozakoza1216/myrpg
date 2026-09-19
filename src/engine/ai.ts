import type { Combatant, Stance } from "./types";
import { canUseSkill } from "./battle";

export interface EnemyIntent {
  skillId: string;
  targetId: string | null; // null = 自分自身（回復等）
}

export function pickEnemyAction(enemy: Combatant, partyAlive: Combatant[]): EnemyIntent | null {
  const alive = partyAlive.filter((c) => !c.defeated);
  if (alive.length === 0) return null;
  const target = alive[Math.floor(Math.random() * alive.length)];

  if (enemy.name === "カガリ") {
    const hpRatio = enemy.hp / enemy.maxHp;
    if (hpRatio <= 0.3 && canUseSkill(enemy, "kagari_offering")) {
      return { skillId: "kagari_offering", targetId: null };
    }
    if (canUseSkill(enemy, "kagari_bind") && Math.random() < 0.4) {
      return { skillId: "kagari_bind", targetId: target.instanceId };
    }
    if (Math.random() < 0.3) {
      return { skillId: "kagari_chant", targetId: target.instanceId };
    }
    return { skillId: "kagari_staff", targetId: target.instanceId };
  }

  const usable = enemy.skills.filter((s) => canUseSkill(enemy, s.skillId));
  const pool = usable.length > 0 ? usable : enemy.skills;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  return { skillId: choice.skillId, targetId: target.instanceId };
}

export function pickDefenderStance(): Stance {
  const roll = Math.random();
  if (roll < 0.45) return "defense";
  if (roll < 0.8) return "evade";
  return "counter";
}
