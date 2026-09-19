import { useEffect, useRef, useState } from "react";
import type { Combatant, Stance } from "../engine/types";
import {
  applySpecialEffect,
  canUseSkill,
  consumeTurn,
  createCombatant,
  resolveAndApply,
  spendSkillCost,
  tickAtb,
} from "../engine/battle";
import { getSkill } from "../data/skills";
import type { EnemyDef } from "../data/enemies";
import { pickDefenderStance, pickEnemyAction } from "../engine/ai";
import "./BattleScreen.css";

type Phase =
  | "intro"
  | "idle"
  | "playerTurn"
  | "enemyIncoming"
  | "message"
  | "victory"
  | "defeat";

interface PendingEnemyAction {
  enemy: Combatant;
  skillId: string;
  target: Combatant | null;
}

export interface BattleScreenProps {
  title: string;
  party: Combatant[];
  enemyDefs: EnemyDef[];
  onEnd: (result: "victory" | "defeat") => void;
}

export default function BattleScreen({ title, party, enemyDefs, onEnd }: BattleScreenProps) {
  const enemiesRef = useRef<Combatant[]>(
    enemyDefs.map((e) => createCombatant(e.name, e.stats, e.skillIds, true, e.size))
  );
  const partyRef = useRef<Combatant[]>(party);
  const [, setRenderTick] = useState(0);
  const rerender = () => setRenderTick((n) => n + 1);

  const [phase, setPhase] = useState<Phase>("intro");
  const [log, setLog] = useState<string[]>([`${title}が始まった！`]);
  const [actingCombatant, setActingCombatant] = useState<Combatant | null>(null);
  const [pendingEnemy, setPendingEnemy] = useState<PendingEnemyAction | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const pushLog = (lines: string[]) => setLog((prev) => [...prev, ...lines].slice(-8));

  const allCombatants = () => [...partyRef.current, ...enemiesRef.current];

  /** ダメージ適用直後に呼ぶ。決着していれば victory/defeat へ、そうでなければ idle へ戻す。 */
  const continueOrEndBattle = () => {
    if (partyRef.current.every((p) => p.defeated)) {
      setPhase("defeat");
    } else if (enemiesRef.current.every((e) => e.defeated)) {
      setPhase("victory");
    } else {
      setPhase("idle");
    }
  };

  // ATB ループ。
  // 注意：guaranteedHit系の自動解決は phase を 'idle' のまま維持するため、
  // setPhase('idle') は React の同値bailoutで再レンダーもeffect再起動も起きない。
  // そのため、ユーザー入力が必要になる／決着がつく場合だけ interval を止める。
  useEffect(() => {
    if (phase !== "idle") return;
    const interval = setInterval(() => {
      const ready = tickAtb(allCombatants());
      rerender();
      if (!ready) return;

      const endCheck = (): "victory" | "defeat" | null => {
        if (partyRef.current.every((p) => p.defeated)) return "defeat";
        if (enemiesRef.current.every((e) => e.defeated)) return "victory";
        return null;
      };

      if (endCheck()) {
        clearInterval(interval);
        setPhase(endCheck()!);
        return;
      }

      if (ready.isEnemy) {
        const intent = pickEnemyAction(ready, partyRef.current);
        if (!intent) return;
        const skill = getSkill(intent.skillId);
        const target = intent.targetId
          ? partyRef.current.find((p) => p.instanceId === intent.targetId) ?? null
          : null;

        if (skill.guaranteedHit || skill.selfHealPercent || !target) {
          const lines = applySpecialEffect(ready, skill, target);
          pushLog([`${ready.name}の${skill.name}！`, ...lines]);
          consumeTurn(ready);
          rerender();
          const end = endCheck();
          if (end) {
            clearInterval(interval);
            setPhase(end);
          }
          // 決着していなければ同じ interval を継続し、次tickで次の行動へ進む
        } else {
          clearInterval(interval);
          setPendingEnemy({ enemy: ready, skillId: intent.skillId, target });
          setPhase("enemyIncoming");
        }
      } else {
        clearInterval(interval);
        setActingCombatant(ready);
        setPhase("playerTurn");
      }
    }, 120);
    return () => clearInterval(interval);
  }, [phase]);

  const startBattle = () => setPhase("idle");

  const handlePlayerSkill = (skillId: string) => {
    setSelectedSkillId(skillId);
  };

  const handlePlayerTarget = (targetEnemy: Combatant) => {
    if (!actingCombatant || !selectedSkillId) return;
    const skill = getSkill(selectedSkillId);
    spendSkillCost(actingCombatant, selectedSkillId);
    const stance = pickDefenderStance();
    const outcome = resolveAndApply(actingCombatant, skill, targetEnemy, stance);
    pushLog(outcome.log);
    consumeTurn(actingCombatant);
    setSelectedSkillId(null);
    setActingCombatant(null);
    rerender();
    continueOrEndBattle();
  };

  const handleDefenderStance = (stance: Stance) => {
    if (!pendingEnemy || !pendingEnemy.target) return;
    const skill = getSkill(pendingEnemy.skillId);
    const outcome = resolveAndApply(pendingEnemy.enemy, skill, pendingEnemy.target, stance);
    pushLog(outcome.log);
    consumeTurn(pendingEnemy.enemy);
    setPendingEnemy(null);
    rerender();
    continueOrEndBattle();
  };

  useEffect(() => {
    if (phase === "victory") onEnd("victory");
    if (phase === "defeat") onEnd("defeat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const aliveEnemies = enemiesRef.current.filter((e) => !e.defeated);

  return (
    <div className="battle-screen">
      <h2 className="battle-title">{title}</h2>

      <div className="battle-field">
        <div className="combatant-column">
          {enemiesRef.current.map((e) => (
            <CombatantBar key={e.instanceId} c={e} />
          ))}
        </div>
        <div className="combatant-column">
          {partyRef.current.map((p) => (
            <CombatantBar key={p.instanceId} c={p} />
          ))}
        </div>
      </div>

      <div className="battle-log">
        {log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      <div className="battle-controls">
        {phase === "intro" && (
          <button onClick={startBattle} className="primary-btn">
            戦闘開始
          </button>
        )}

        {phase === "playerTurn" && actingCombatant && !selectedSkillId && (
          <div>
            <p className="prompt">{actingCombatant.name}の行動を選択</p>
            <div className="btn-grid">
              {actingCombatant.skills.map((s) => {
                const skill = getSkill(s.skillId);
                const usable = canUseSkill(actingCombatant, s.skillId);
                return (
                  <button
                    key={s.skillId}
                    disabled={!usable}
                    onClick={() => handlePlayerSkill(s.skillId)}
                    className="skill-btn"
                  >
                    {skill.name}
                    {skill.mpCost > 0 ? `(MP${skill.mpCost})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {phase === "playerTurn" && actingCombatant && selectedSkillId && (
          <div>
            <p className="prompt">対象を選択</p>
            <div className="btn-grid">
              {aliveEnemies.map((e) => (
                <button key={e.instanceId} onClick={() => handlePlayerTarget(e)} className="skill-btn">
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "enemyIncoming" && pendingEnemy && (
          <div>
            <p className="prompt">
              {pendingEnemy.enemy.name}が{getSkill(pendingEnemy.skillId).name}を仕掛けてくる！
              {pendingEnemy.target?.name}はどう受ける？
            </p>
            <div className="btn-grid">
              <button className="skill-btn" onClick={() => handleDefenderStance("defense")}>
                防御
              </button>
              <button className="skill-btn" onClick={() => handleDefenderStance("evade")}>
                回避
              </button>
              <button className="skill-btn" onClick={() => handleDefenderStance("counter")}>
                カウンター
              </button>
            </div>
          </div>
        )}

        {(phase === "victory" || phase === "defeat") && (
          <p className="prompt">{phase === "victory" ? "勝利した！" : "……敗北した。"}</p>
        )}
      </div>
    </div>
  );
}

function CombatantBar({ c }: { c: Combatant }) {
  const hpPct = Math.max(0, (c.hp / c.maxHp) * 100);
  const mpPct = c.maxMp > 0 ? Math.max(0, (c.mp / c.maxMp) * 100) : 0;
  const atbPct = Math.min(100, c.atb);
  return (
    <div className={`combatant-bar ${c.defeated ? "defeated" : ""}`}>
      <div className="combatant-name">{c.name}</div>
      <Bar className="hp-bar" pct={hpPct} label={`HP ${c.hp}/${c.maxHp}`} />
      {!c.isEnemy && <Bar className="mp-bar" pct={mpPct} label={`MP ${c.mp}/${c.maxMp}`} />}
      <Bar className="atb-bar" pct={atbPct} label="ATB" />
    </div>
  );
}

function Bar({ className, pct, label }: { className: string; pct: number; label: string }) {
  return (
    <div className="bar-track">
      <div className={`bar-fill ${className}`} style={{ width: `${pct}%` }} />
      <span className="bar-label">{label}</span>
    </div>
  );
}
