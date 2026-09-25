// 判定バトルエンジン（PLAN.md §4 準拠・純粋関数群）。
window.RPG = window.RPG || {};

RPG.Engine = (function () {
  // ── §4-1 判定力 ──
  function judgeValue(stats, kind, isMagic) {
    var base;
    switch (kind) {
      case "attack": base = (stats.atk + stats.tec) / 2; break;
      case "breakthrough": base = (stats.atk + stats.spd) / 2; break;
      case "hold": base = (stats.spd + stats.tec) / 2; break;
      case "evade": base = (stats.spd + stats.tec) / 2; break;
      case "defense": base = (stats.def + stats.men) / 2; break;
      default: base = 0;
    }
    if (isMagic) base += stats.mag / 2;
    return base;
  }

  function rng() {
    return Math.random() * 20 - 10; // -10〜+10
  }

  // ── §4-3 相性係数。不利側の (判定力+技ボーナス) にのみ乗算 ──
  // 戻り値: { attackerMul, defenderMul }
  function affinityCoef(atkCategory, atkAttr, defStance) {
    var noAttr = atkAttr === "none" || atkAttr === undefined;
    if (defStance === "defense") {
      if (atkCategory === "attack") {
        return noAttr ? { attackerMul: 1, defenderMul: 1 } : { attackerMul: 0.75, defenderMul: 1 };
      }
      if (atkCategory === "breakthrough") {
        return { attackerMul: 1, defenderMul: 0.75 };
      }
    }
    if (defStance === "evade" && atkCategory === "attack") {
      return noAttr ? { attackerMul: 1, defenderMul: 1 } : { attackerMul: 0.75, defenderMul: 1 };
    }
    if (defStance === "hold" && atkCategory === "breakthrough") {
      return { attackerMul: 0.75, defenderMul: 1 };
    }
    return { attackerMul: 1, defenderMul: 1 };
  }

  // 異属性（物理⇔魔法）補正。同属性表で処理済みのものは対象外。
  function crossAttributeCoef(atkCategory, atkAttr, defAttr, defStance) {
    if (atkAttr === "none" || defAttr === "none" || atkAttr === defAttr) {
      return { attackerMul: 1, defenderMul: 1 };
    }
    if (defStance === "defense" && atkCategory === "attack") return { attackerMul: 1, defenderMul: 0.85 };
    if (defStance === "hold" && atkCategory === "attack") return { attackerMul: 1, defenderMul: 0.75 };
    if (defStance === "hold" && atkCategory === "breakthrough") return { attackerMul: 1, defenderMul: 0.85 };
    return { attackerMul: 1, defenderMul: 1 };
  }

  // ── §4-2 スコア解決 ──
  // attacker/defender: { stats, luck等 }, skill: SKILLS定義, defStance: 'defense'|'evade'|'hold'|'counter'|'breakthroughCounter'
  function resolveJudgment(attacker, skill, defender, defStance, bonuses) {
    bonuses = bonuses || {};
    var atkKind = skill.category === "breakthrough" ? "breakthrough" : "attack";
    var atkBase = judgeValue(attacker.stats, atkKind, skill.isMagic) + (skill.techBonus || 0) + (bonuses.attackerBonus || 0) - (attacker.scoreDebuff || 0);

    var isCounter = defStance === "counter" || defStance === "breakthroughCounter";
    // 逆のカウンターは成立せず、攻め側の行動がそのまま通る。
    var counterMiss = (defStance === "counter" && atkKind === "breakthrough") ||
      (defStance === "breakthroughCounter" && atkKind === "attack");
    var defKind = isCounter ? atkKind : defStance; // カウンターは攻撃側と同じ判定式を使う
    var defBase = judgeValue(defender.stats, defKind, false) + (bonuses.defenderBonus || 0) - (defender.scoreDebuff || 0);
    if (isCounter) defBase += 20; // 後出しボーナス（§7-2 大前提1d・検証済み値）

    var coefA = affinityCoef(skill.category, skill.attribute, isCounter ? "none" : defStance);
    var coefB = crossAttributeCoef(skill.category, skill.attribute, isCounter ? "none" : "physical", isCounter ? "none" : defStance);

    var attackerScore = atkBase * coefA.attackerMul * coefB.attackerMul + rng();
    var defenderScore = defBase * coefA.defenderMul * coefB.defenderMul + rng();

    var attackerWins;
    if (counterMiss || skill.guaranteedHit) {
      attackerWins = true;
    } else if (attackerScore === defenderScore) {
      attackerWins = attacker.stats.spd === defender.stats.spd
        ? true // 速さも同値なら能動側（攻撃/突破）が勝つ
        : attacker.stats.spd > defender.stats.spd;
    } else {
      attackerWins = attackerScore > defenderScore;
    }

    return { attackerScore: attackerScore, defenderScore: defenderScore, attackerWins: attackerWins, isCounter: isCounter, counterMiss: counterMiss };
  }

  // ── §4-7 ダメージ計算 ──
  function baseDamage(attacker, skill) {
    var atk = skill.isMagic ? attacker.stats.atk + attacker.stats.mag / 2 : attacker.stats.atk;
    return atk * 100 / (100 + 0) * (skill.power || 0); // defは適用先（受け手）の値を呼び出し側で乗算
  }

  function applyDefenseReduction(rawBase, defenderDef) {
    return rawBase * 100 / (100 + defenderDef);
  }

  var CATEGORY_MULT = { normal: 1.0 };

  // 受け手が判定に勝てば attackerWins=false。
  // 防御：勝てば半分に軽減（×0.5）、負けても3割は軽減（×0.7）＝振れ幅が小さい
  function judgeResultMult(defStance, attackerWins) {
    if (defStance === "defense") return attackerWins ? 0.7 : 0.5;
    if (defStance === "evade") return attackerWins ? 0.7 : 0;
    if (defStance === "hold") return attackerWins ? 1.0 : 0;
    return attackerWins ? 1.0 : 0; // フォールバック
  }

  // クリティカル：急所狙い等の専用技のみ運依存。通常攻撃はシード周期側(battle.js)で判定する。
  function skillCritChance(attackerLuck, defenderLuck) {
    return Math.max(0.01, 0.05 + (attackerLuck - defenderLuck) / 5 / 100);
  }

  // ── 攻撃1回分の解決（判定→ダメージ）を一括で行う ──
  // opts: { forceCrit: bool(シード周期クリティカル), powerMult, judgeMult, backlineOnly }
  function resolveAction(attacker, skill, defender, defStance, opts) {
    opts = opts || {};
    var judgment = resolveJudgment(attacker, skill, defender, defStance, opts.bonuses);
    var result = {
      attackerWins: judgment.attackerWins,
      attackerScore: Math.round(judgment.attackerScore),
      defenderScore: Math.round(judgment.defenderScore),
      isCounter: judgment.isCounter, counterMiss: judgment.counterMiss,
      damage: 0, reflected: false, negated: false, critical: false, guaranteed: false,
    };

    if (skill.selfHealPercent) return result; // 特殊技は呼び出し側で処理

    var mult = judgeResultMult(defStance, judgment.attackerWins);

    if (judgment.isCounter && !judgment.counterMiss) {
      if (!judgment.attackerWins) {
        // カウンター成立：技のダメージがそのまま反射
        var reflectRaw = baseDamage(attacker, skill) * (opts.powerMult || 1);
        reflectRaw = applyDefenseReduction(reflectRaw, attacker.stats.def);
        result.damage = Math.round(reflectRaw);
        result.reflected = true;
      } else {
        var failRaw = baseDamage(attacker, skill) * (opts.powerMult || 1);
        failRaw = applyDefenseReduction(failRaw, defender.stats.def);
        result.damage = Math.round(failRaw);
      }
      return result;
    }

    if (mult === 0) {
      result.negated = true;
      return result;
    }

    var raw = baseDamage(attacker, skill) * (opts.powerMult || 1) * (opts.judgeMult ? 1 : 1);
    raw = applyDefenseReduction(raw, defender.stats.def);

    // 最低保証ダメージ（攻撃力×1.0・防御で受けたときのみ・PLAN.md §4-7）。
    // 保証も防御の軽減（×0.5／×0.7）を受ける。保証を軽減の外で足すと、防御が
    // 回避より、さらには素で受けるより重くなり「安全な受け」にならないため。
    var guaranteed = defStance === "defense" ? attacker.stats.atk * 1.0 : 0;
    if (guaranteed > 0) result.guaranteed = true;

    var total = (raw + guaranteed) * mult;

    var crit = opts.forceCrit || (skill.critSkill && Math.random() < skillCritChance(attacker.stats.luck, defender.stats.luck));
    if (crit && total > 0) {
      total *= (opts.critMult || 1.5);
      result.critical = true;
    }

    result.damage = Math.round(Math.max(0, total));
    return result;
  }

  return {
    judgeValue: judgeValue,
    affinityCoef: affinityCoef,
    crossAttributeCoef: crossAttributeCoef,
    resolveJudgment: resolveJudgment,
    baseDamage: baseDamage,
    applyDefenseReduction: applyDefenseReduction,
    judgeResultMult: judgeResultMult,
    skillCritChance: skillCritChance,
    resolveAction: resolveAction,
    rng: rng,
  };
})();
