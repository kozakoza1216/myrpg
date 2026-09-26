// 戦闘フィールド・ATB進行・敵AI・戦闘UI（PLAN.md §3, §6, §7 準拠）。
window.RPG = window.RPG || {};

RPG.Battle = (function () {
  var Data = RPG.Data, Engine = RPG.Engine;
  var ATB_MAX = 100;

  function createCombatant(defId, isEnemy) {
    var src = isEnemy ? Data.ENEMIES[defId] : Data.CHARACTERS[defId];
    var level = isEnemy ? 1 : (src.joinLevel || 1);
    var stats = isEnemy ? Data.cloneStats(src.stats) : Data.statsAt(defId, level);
    var maxHp = isEnemy ? stats.hp : stats.hp * 4;
    var maxMp = stats.mag + stats.men;
    return {
      defId: defId, name: src.name, isEnemy: isEnemy, isBoss: !!src.isBoss,
      isBirdPerson: !!src.isBirdPerson, birdType: src.birdType, picto: src.picto,
      stats: stats, maxHp: maxHp, hp: maxHp, maxMp: isEnemy ? 0 : maxMp, mp: isEnemy ? 0 : maxMp,
      skills: isEnemy ? src.skills.slice() : Data.skillsAt(defId, level), canCounter: !!src.canCounter, counterSkillId: src.counterSkillId,
      // 行動ゲージは速さに単純比例で溜まる（乱数なし・PLAN §7-2 大前提2）＝開始時は全員0
      atb: 0, defeated: false, scoreDebuff: 0, debuffTurns: 0, spdMul: 1, spdDownTurns: 0,
      // カウンターを持つボスだけ、的中率を学習する（初期25%・上限70%）。カガリはカウンターなし（bosses.md）
      counterLearnRate: src.isBoss && src.canCounter ? 0.25 : 0, usesLeft: {},
      position: "front",
      level: level, exp: isEnemy ? 0 : Data.expForLevel(level), expValue: isEnemy ? (src.exp || 0) : 0,
    };
  }

  // レベルを変える：能力値を成長の式で出し直し、最大HP・MPが増えた分だけ今のHP・MPも増やす。
  // そのレベルまでに覚える技を覚え、新しく覚えた技の一覧を返す
  function setLevel(c, lv) {
    var oldMaxHp = c.maxHp, oldMaxMp = c.maxMp;
    c.level = lv;
    c.stats = Data.statsAt(c.defId, lv);
    c.maxHp = c.stats.hp * 4;
    c.maxMp = c.stats.mag + c.stats.men;
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + (c.maxHp - oldMaxHp)));
    c.mp = Math.max(0, Math.min(c.maxMp, c.mp + (c.maxMp - oldMaxMp)));
    var learned = Data.skillsAt(c.defId, lv).filter(function (id) { return c.skills.indexOf(id) < 0; });
    learned.forEach(function (id) { c.skills.push(id); });
    return learned;
  }

  // 戦闘の経験値を配る（PLAN.md「経験値と敵の強さ」）
  // ①戦闘に参加していれば、その戦闘の基本経験値（行動回数には比例させない）
  // ②1体とどめを刺すごとに、その敵の基本経験値の10%を追加
  // ③戦闘不能は不参加扱い＝何も入らない
  // rate：残り歩数による倍率。上がったレベルなどの知らせを文の配列で返す
  function awardExperience(party, enemies, rate) {
    var base = enemies.reduce(function (n, e) { return n + (e.expValue || 0); }, 0);
    var lines = [];
    if (base <= 0) return lines;
    party.forEach(function (c) {
      if (c.defeated) { lines.push(c.name + "は戦闘不能のため、経験値を得られなかった。"); return; }
      var bonus = enemies.reduce(function (n, e) { return n + (e.defeatedBy === c ? e.expValue * 0.1 : 0); }, 0);
      var gain = Math.round((base + bonus) * rate);
      c.exp += gain;
      lines.push(c.name + "は経験値を" + gain + "得た。");
      var lv = Data.levelForExp(c.exp);
      if (lv > c.level) {
        var before = Object.assign({}, c.stats), mhp = c.maxHp, mmp = c.maxMp;
        var learned = setLevel(c, lv);
        var ups = [["攻撃", "atk"], ["防御", "def"], ["素早さ", "spd"], ["魔力", "mag"], ["精神", "men"], ["技巧", "tec"], ["運", "luck"]]
          .filter(function (p) { return c.stats[p[1]] > before[p[1]]; })
          .map(function (p) { return p[0] + "+" + (c.stats[p[1]] - before[p[1]]); });
        lines.push(c.name + "はレベル" + lv + "になった！　最大HP+" + (c.maxHp - mhp) + "・最大MP+" + (c.maxMp - mmp) + (ups.length ? "・" + ups.join("・") : ""));
        learned.forEach(function (id) { lines.push(c.name + "は〈" + Data.SKILLS[id].name + "〉を覚えた！"); });
      }
    });
    return lines;
  }

  // 前衛・後衛（PLAN §3、enemies.md）。前衛は1〜2人。前衛が倒れれば、後衛が前衛へ繰り上がる。
  //   敵：並び順で前から2体までが前衛、残りは後衛（enemies.md の雑魚敵グループの配置）
  //   味方：各自の希望の列（c.row＝"front"/"back"。メニューの「配置」や戦闘中の「列を移る」「交代」で変える）。
  //         希望がなければ並び順で前から詰める
  var FRONT_MAX = 2;
  // 遠距離で後衛から後衛を撃つと威力-50%（PLAN §4-11）
  var FAR_BACK_TO_BACK = 0.5;
  function updatePositions(list) {
    var alive = list.filter(function (c) { return !c.defeated; });
    if (!alive.length || alive[0].isEnemy) {
      alive.forEach(function (c, i) { c.position = i < FRONT_MAX ? "front" : "back"; });
      return;
    }
    var front = 0;
    alive.forEach(function (c) {
      var want = c.row || (front < FRONT_MAX ? "front" : "back");
      c.position = want === "front" && front < FRONT_MAX ? "front" : "back";
      if (c.position === "front") front++;
    });
    if (!front) alive[0].position = "front";                        // 前衛がいなくなれば、後衛の先頭が繰り上がる
  }
  // 味方の希望の列を変えられるか（前衛は1〜2人）
  function canSetRow(list, c, row) {
    var alive = list.filter(function (m) { return !m.defeated; });
    var front = alive.filter(function (m) { return m !== c && (m.row || m.position) === "front"; }).length;
    return row === "front" ? front < FRONT_MAX : front >= 1;
  }
  // 狙える相手：前衛が残っている限り、後衛は狙えない（範囲技は後衛にも届く）
  function targetable(list) {
    var alive = list.filter(function (c) { return !c.defeated; });
    var front = alive.filter(function (c) { return c.position === "front"; });
    return front.length ? front : alive;
  }
  // 技の距離で届く相手（PLAN §4-11 の距離カテゴリを、前衛・後衛の2列に当てはめたもの）。
  // 盤面は 自後衛｜自前衛｜敵前衛｜敵後衛 の並び＝前衛どうしが隣接している
  //   近距離：前衛から、隣接する相手の前衛にだけ届く（後衛からは使えない）
  //   遠距離：どの列からでも、相手の前衛にも後衛にも届く（設計書の「隣接不可」は採らない）
  //   全距離（魔法）：どの列からでも使える。狙えるのは通常どおり（前衛が残っていれば前衛）
  //   範囲の技：生きている相手全員
  function reachTargets(attacker, skill, opp) {
    var alive = opp.filter(function (c) { return !c.defeated; });
    if (skill.area) return alive;
    var range = skill.range || "near";
    if (range === "far") return alive;
    if (range === "near" && attacker.position === "back") return [];
    return targetable(opp);
  }

  // opts.items：持ち物（ゲーム全体の持ち物をそのまま渡す。戦闘中に使えば減る）。opts.crit：クリティカル周期 { period, count }（ゲーム全体で数える・PLAN §8-5b）。
  // opts.eventEnd：イベント戦の打ち切り { enemyActions: 敵の行動回数, enemyHpRatio: 敵のHP割合 }
  function State(containerEl, party, enemyIds, onEnd, opts) {
    opts = opts || {};
    this.el = containerEl;
    this.party = party;
    this.items = opts.items || null;
    this.crit = opts.crit || { period: 15 + Math.floor(Math.random() * 26), count: 0 };
    this.eventEnd = opts.eventEnd || null;
    this.enemyActionCount = 0;
    this.enemies = enemyIds.map(function (id) { return createCombatant(id, true); });
    updatePositions(this.party);
    updatePositions(this.enemies);
    this.onEnd = onEnd;
    this.log = [];
    this.phase = "intro"; // intro/idle/playerAct/target/response/message/done
  }

  State.prototype.allCombatants = function () {
    return this.party.concat(this.enemies);
  };

  State.prototype.pushLog = function (lines) {
    var self = this;
    lines.forEach(function (l) { if (l) self.log.push(l); });
    this.log = this.log.slice(-8);
  };

  State.prototype.checkEnd = function () {
    if (this.party.every(function (c) { return c.defeated; })) return "defeat";
    if (this.enemies.every(function (c) { return c.defeated; })) return "victory";
    // イベント戦：一定回数耐えるか、HPを一定まで削ると打ち切り（攻略チャート第一章⑥）
    var ev = this.eventEnd;
    if (ev) {
      if (ev.enemyActions && this.enemyActionCount >= ev.enemyActions) return "event";
      if (ev.enemyHpRatio && this.enemies.some(function (e) { return e.hp <= e.maxHp * ev.enemyHpRatio; })) return "event";
    }
    return null;
  };

  // 必中の小さな効果は3回固定で切れる（その人の行動3回）。格上のボスがかけた判定低下は永続（PLAN §4-11）
  State.prototype.consumeDebuff = function (c) {
    if (c.debuffTurns > 0) {
      c.debuffTurns -= 1;
      if (c.debuffTurns === 0) c.scoreDebuff = 0;
    }
    if (c.spdDownTurns > 0) {
      c.spdDownTurns -= 1;
      if (c.spdDownTurns === 0) c.spdMul = 1;
    }
  };

  // ── ATB進行 ──
  // 「速さ比例でゲージが溜まり満タンで行動」というルール自体はPLAN.md §2-0の通りに保つが、
  // それをリアルタイムで眺めさせる必然性はない。次に誰の手番が来るかを解析的に計算し、
  // 待ち時間なしで即座にその時点まで進める（クリックへの応答性を優先）。
  State.prototype.advanceToNextReady = function () {
    var all = this.allCombatants().filter(function (c) { return !c.defeated; });
    if (all.length === 0) return null;
    var minDt = Infinity;
    all.forEach(function (c) {
      if (c.stats.spd <= 0) return;
      var dt = (ATB_MAX - c.atb) / c.stats.spd;
      if (dt < minDt) minDt = dt;
    });
    if (!isFinite(minDt)) minDt = 0;
    all.forEach(function (c) { c.atb = Math.min(ATB_MAX, c.atb + c.stats.spd * minDt); });
    var ready = all.filter(function (c) { return c.atb >= ATB_MAX - 0.001; });
    ready.sort(function (a, b) { return b.atb - a.atb; });
    return ready[0];
  };

  State.prototype.startLoop = function () {
    this.phase = "idle";
    this.advanceTurn();
  };

  State.prototype.advanceTurn = function () {
    var ready = this.advanceToNextReady();
    this.render();
    if (!ready) return;

    var end = this.checkEnd();
    if (end) { this.finish(end); return; }

    if (ready.isEnemy) {
      this.enemyActs(ready);
    } else {
      this.pending = { actor: ready };
      this.phase = "playerAct";
      this.render();
    }
  };

  State.prototype.finish = function (result) {
    this.phase = "done";
    this.render();
    var self = this;
    setTimeout(function () { self.onEnd(result); }, 700);
  };

  State.prototype.endTurn = function (actor) {
    actor.atb = 0;
    if (actor.isEnemy) this.enemyActionCount += 1;
    this.consumeDebuff(actor);
    updatePositions(this.party);
    updatePositions(this.enemies);
    var end = this.checkEnd();
    if (end) { this.finish(end); return; }
    this.phase = "idle";
    this.pending = null;
    this.advanceTurn();
  };

  // ── 敵AI：仕掛けフェーズ（§6-A） ──
  State.prototype.enemyActs = function (enemy) {
    var alive = this.party.filter(function (c) { return !c.defeated; });
    if (alive.length === 0) return;

    var skillId = this.pickEnemySkill(enemy);
    if (!skillId) {
      // 届く技がない（近距離しか持たない後衛など）：判定不発で手番を終える（PLAN §4-10）
      this.pushLog([enemy.name + "は、様子をうかがっている。"]);
      this.endTurn(enemy);
      return;
    }
    var skill = Data.SKILLS[skillId];

    if (skill.category === "special" || skill.category === "hold") {
      this.resolveSpecialOrHold(enemy, skillId, alive);
      return;
    }

    var reach = reachTargets(enemy, skill, this.party);
    var target = reach[Math.floor(Math.random() * reach.length)];
    this.pending = { actor: enemy, skillId: skillId, target: target, concealAttackType: true };
    this.phase = "response";
    this.render();
    // プレイヤー操作対象が受動を選ぶまで待機（UIのhandleStance経由でresolve）
  };

  State.prototype.pickEnemySkill = function (enemy) {
    if (enemy.defId === "kagari") {
      var hpRatio = enemy.hp / enemy.maxHp;
      if (hpRatio <= 0.3 && this.canUse(enemy, "kagari_offering")) return "kagari_offering";
      if (this.canUse(enemy, "kagari_bind") && Math.random() < 0.35) return "kagari_bind";
      if (Math.random() < 0.3) return "kagari_chant";
      return "kagari_staff";
    }
    // 後衛からは突破できない（PLAN §3：後衛は攻撃／交代のみ）。距離で届かない技も選ばない
    var self = this;
    var attackSkills = enemy.skills.filter(function (id) { return self.canReach(enemy, id); });
    return attackSkills.length ? attackSkills[Math.floor(Math.random() * attackSkills.length)] : null;
  };

  // その技を、いまの列から使えて、届く相手がいるか
  State.prototype.canReach = function (c, skillId) {
    var skill = Data.SKILLS[skillId];
    if (!skill || (skill.category !== "attack" && skill.category !== "breakthrough")) return false;
    if (skill.category === "breakthrough" && c.position === "back") return false;
    if (skill.requiresBow && !c.hasBow) return false;
    return reachTargets(c, skill, c.isEnemy ? this.party : this.enemies).length > 0;
  };

  State.prototype.canUse = function (c, skillId) {
    var skill = Data.SKILLS[skillId];
    if (skill.usesLimit !== undefined) {
      var used = c.usesLeft[skillId] || 0;
      if (used >= skill.usesLimit) return false;
    }
    if (!c.isEnemy && skill.mp > c.mp) return false;
    return true;
  };

  State.prototype.markUsed = function (c, skillId) {
    c.usesLeft[skillId] = (c.usesLeft[skillId] || 0) + 1;
    var skill = Data.SKILLS[skillId];
    if (!c.isEnemy) c.mp = Math.max(0, c.mp - skill.mp);
  };

  State.prototype.resolveSpecialOrHold = function (actor, skillId, allyList) {
    var skill = Data.SKILLS[skillId];
    this.markUsed(actor, skillId);
    var lines = [];
    if (skill.selfHealPercent) {
      var heal = Math.round(actor.maxHp * skill.selfHealPercent);
      actor.hp = Math.min(actor.maxHp, actor.hp + heal);
      lines.push(actor.name + "の" + skill.name + "！ HPを" + heal + "回復した。");
    } else if (skill.category === "hold" && skill.guaranteedHit) {
      var target = allyList[Math.floor(Math.random() * allyList.length)];
      target.scoreDebuff = (target.scoreDebuff || 0) + skill.scoreDebuff;
      target.debuffTurns = skill.permanent ? 0 : (skill.debuffTurns || 3);
      lines.push(actor.name + "の" + skill.name + "！ " + target.name + "の判定が" + skill.scoreDebuff + "下がった" + (skill.permanent ? "（戦闘が終わるまで治らない）" : "") + "。");
    }
    this.pushLog(lines);
    this.endTurn(actor);
  };

  // ── 受動フェーズの選択肢（§7-2 大前提1・1b） ──
  State.prototype.hasBackline = function (defender) {
    var side = defender.isEnemy ? this.enemies : this.party;
    return side.some(function (c) { return !c.defeated && c.position === "back" && c !== defender; });
  };

  State.prototype.availableStances = function (defender, category, concealAttackType) {
    var stances = [];
    // 敵の攻撃／突破は選択時にプレイヤーへ知らせない。伏せられた応答では、
    // 両方を読む受動を提示する。足止めは常に選べる読みの選択肢である。
    // 遠距離で撃たれた側は「反撃」（判定なし・確定）か防御で受ける（PLAN §4-11）
    if (this.pending && this.pending.target === defender && Data.SKILLS[this.pending.skillId] && Data.SKILLS[this.pending.skillId].range === "far") {
      stances.push("riposte", "defense");
      if (this.canDefenseStance(defender)) stances.push("defenseStance");
      return stances;
    }
    if (concealAttackType) {
      stances.push("defense");
      if (this.canDefenseStance(defender)) stances.push("defenseStance");
      stances.push("evade", "hold");
      if (defender.canCounter) stances.push("counter");
      if (defender.isBoss && defender.canCounter) stances.push("breakthroughCounter");
      return stances;
    }
    if (category === "attack") {
      stances.push("defense", "evade");
      if (defender.isBoss) stances.push("hold");
      if (defender.canCounter) stances.push("counter");
    } else {
      stances.push("hold", "defense");
      if (!this.hasBackline(defender)) stances.push("evade"); // 1対1（後衛なし）は例外的に回避可
      if (defender.isBoss && defender.canCounter) stances.push("breakthroughCounter");
    }
    return stances;
  };

  // 防御姿勢（防御カテゴリの技）を覚えていて、MPが足りれば、防御の代わりに選べる
  State.prototype.canDefenseStance = function (c) {
    return !c.isEnemy && c.skills.indexOf("defense_stance") >= 0 && c.mp >= Data.SKILLS.defense_stance.mp;
  };

  State.prototype.aiPickStance = function (defender, attacker, category, skill) {
    if (skill && skill.range === "far") return Math.random() < 0.35 ? "riposte" : "defense";
    if (defender.isBoss && !defender.canCounter) {
      // カウンターを持たないボス：通常の受動（防御60%／足止め20%／回避10%）。残り10%（逆のカウンター）は防御に寄せる
      var rb = Math.random();
      var pb = rb < 0.70 ? "defense" : rb < 0.90 ? "hold" : "evade";
      return this.availableStances(defender, category).indexOf(pb) >= 0 ? pb : "defense";
    }
    if (defender.isBoss) {
      var matching = category === "attack" ? "counter" : "breakthroughCounter";
      var opposite = category === "attack" ? "breakthroughCounter" : "counter";
      var picked;
      if (Math.random() < defender.counterLearnRate) {
        picked = matching;
      } else {
        var r = Math.random();
        if (r < 0.60) picked = "defense";
        else if (r < 0.80) picked = "hold";
        else if (r < 0.90) picked = "evade";
        else picked = opposite; // 逆のカウンター＝空振り
      }
      defender.counterLearnRate = Math.min(0.70, defender.counterLearnRate + 0.06);
      var valid = this.availableStances(defender, category);
      return valid.indexOf(picked) >= 0 ? picked : "defense";
    }
    // 雑魚AI（簡易・応答フェーズ§6-B）
    if (category === "breakthrough") return Math.random() < 0.7 ? "hold" : "defense";
    var rr = Math.random();
    if (rr < 0.5) return "defense";
    if (rr < 0.85) return "evade";
    return defender.canCounter ? "counter" : "defense";
  };

  // ── 判定解決の共通処理 ──
  // stance "defenseStance"＝防御姿勢で防御する（技ボーナス+30・MP消費）
  State.prototype.performResolve = function (attacker, skillId, defender, stance) {
    var skill = Data.SKILLS[skillId];
    this.markUsed(attacker, skillId);
    var lines = [];

    // クリティカル周期：パーティ全体の累計攻撃回数（攻撃・突破を行った数）で数える（PLAN §8-5b）
    var forceCrit = false;
    if (!attacker.isEnemy && (skill.category === "attack" || skill.category === "breakthrough")) {
      this.crit.count += 1;
      if (this.crit.count >= this.crit.period) { forceCrit = true; this.crit.count = 0; }
    }

    // 広範囲の技は、生きている相手全員に当たる（受け手はそれぞれ受動を選ぶ）
    var targets = [defender];
    if (skill.area) {
      var side = defender.isEnemy ? this.enemies : this.party;
      targets = side.filter(function (c) { return !c.defeated; });
    }
    var self = this;
    targets.forEach(function (t, i) {
      var st = t === defender ? stance : (t.isEnemy ? self.aiPickStance(t, attacker, skill.category === "breakthrough" ? "breakthrough" : "attack", skill) : "defense");   // 範囲技で巻き込まれた味方は防御で受ける
      self.resolveOne(attacker, skill, t, st, forceCrit && i === 0, lines, i === 0);
    });
    this.pushLog(lines);
  };

  State.prototype.resolveOne = function (attacker, skill, defender, stance, forceCrit, lines, first) {
    var isBreakthrough = skill.category === "breakthrough";
    var bonuses = {};
    if (stance === "defenseStance") {
      stance = "defense";
      bonuses.defenderBonus = Data.SKILLS.defense_stance.techBonus;
      defender.mp = Math.max(0, defender.mp - Data.SKILLS.defense_stance.mp);
    }
    var stanceLabel = { defense: "防御", evade: "回避", hold: "足止め", counter: "カウンター", breakthroughCounter: "突破カウンター", riposte: "反撃" }[stance] || "応答なし";
    if (bonuses.defenderBonus) stanceLabel = "防御姿勢";
    lines.push((first ? attacker.name + "の" + skill.name + "！ " : "") + defender.name + "は" + stanceLabel + "を選択。");

    var farMult = skill.range === "far" && attacker.position === "back" && defender.position === "back" ? FAR_BACK_TO_BACK : 1;
    if (stance === "riposte") {
      // 反撃：判定をせず、撃たれた分はそのまま受け、こちらのノーマル攻撃を確実に返す（技の威力だけで決まる）
      var hit = Math.round(Engine.applyDefenseReduction(Engine.baseDamage(attacker, skill) * farMult, defender.stats.def));
      this.applyDamage(attacker, defender, hit);
      lines.push(defender.name + "に" + hit + "のダメージ。");
      if (!defender.defeated) {
        var back = Math.round(Engine.applyDefenseReduction(Engine.baseDamage(defender, Data.SKILLS.normal_attack), attacker.stats.def));
        this.applyDamage(defender, attacker, back);
        lines.push(defender.name + "の反撃！ " + attacker.name + "に" + back + "のダメージ。");
      }
      return;
    }
    var backline = this.hasBackline(defender);
    bonuses.evadeAutoLose = backline; // 回避は突破に確定負け（後衛がいないときだけ例外）
    var result = Engine.resolveAction(attacker, skill, defender, stance, {
      forceCrit: forceCrit, bonuses: bonuses,
      powerMult: farMult,
      ignoreStanceOnWin: isBreakthrough && !backline, // 後衛なし＝前衛の背面攻撃（防御無効・§4-8）
    });

    if (result.reflected) {
      attacker.hp = Math.max(0, attacker.hp - result.damage);
      lines.push(defender.name + "のカウンターが成立！ " + attacker.name + "に" + result.damage + "のダメージ。");
      if (attacker.hp === 0) { attacker.defeated = true; attacker.defeatedBy = defender; }
      return;
    }
    if (result.negated) {
      lines.push(defender.name + "は" + skill.name + "を完全に凌いだ！");
      return;
    }
    // 突破が判定に勝ち、後ろに後衛がいる：前衛は抜かれて「おまけ」だけ受け、後衛に追撃が入る（§4-8）
    if (isBreakthrough && result.attackerWins && backline) {
      this.breakthroughFollowUp(attacker, skill, defender, lines);
      return;
    }
    this.applyDamage(attacker, defender, result.damage);
    var tag = (result.critical ? "（会心の一撃！）" : "") + (result.guaranteed ? "（保証ダメージ込み）" : "");
    if (result.damage > 0) lines.push(defender.name + "に" + result.damage + "のダメージ" + (result.hits > 1 ? "（" + result.hits + "発）" : "") + tag + (isBreakthrough && result.attackerWins ? "（背面を突いた）" : ""));
    // 速さ低下（ソニックウェーブ等）：判定に勝てば必中・3回固定（PLAN §4-11）
    if (skill.spdDown && result.attackerWins && !defender.defeated) {
      defender.spdMul = 1 - skill.spdDown;
      defender.spdDownTurns = skill.spdDownTurns || 3;
      lines.push(defender.name + "の速さが下がった。");
    }
  };

  State.prototype.applyDamage = function (attacker, defender, dmg) {
    defender.hp = Math.max(0, defender.hp - dmg);
    if (defender.hp === 0 && !defender.defeated) { defender.defeated = true; defender.defeatedBy = attacker; }
  };

  // 突破の追撃（§4-8）：後衛へ追撃（判定値×2.0・攻撃×1.5、後衛は防御／カウンターのみ）＋通過される前衛に「おまけ」（攻撃×0.3）
  State.prototype.breakthroughFollowUp = function (attacker, skill, frontDefender, lines) {
    var side = frontDefender.isEnemy ? this.enemies : this.party;
    var back = side.filter(function (c) { return !c.defeated && c.position === "back"; })[0];
    var extra = Math.round(attacker.stats.atk * 0.3);
    this.applyDamage(attacker, frontDefender, extra);
    lines.push(frontDefender.name + "を突破した！ おまけダメージ" + extra + "。");
    if (!back) return;
    var followSkill = { name: skill.name + "（追撃）", category: "attack", attribute: skill.attribute, power: (skill.power || 1) * 1.5, techBonus: (skill.techBonus || 0), isMagic: skill.isMagic };
    var stance = back.isEnemy ? this.aiPickStance(back, attacker, "attack") : "defense";
    if (["defense", "counter"].indexOf(stance) < 0) stance = "defense"; // 追撃時は防御/カウンターのみ
    var followResult = Engine.resolveAction(attacker, followSkill, back, stance, { bonuses: { judgeMult: 2.0 } });
    if (followResult.reflected) {
      attacker.hp = Math.max(0, attacker.hp - followResult.damage);
      if (attacker.hp === 0) { attacker.defeated = true; attacker.defeatedBy = back; }
      lines.push("追撃！ " + back.name + "のカウンターが成立、" + attacker.name + "に" + followResult.damage + "。");
    } else {
      this.applyDamage(attacker, back, followResult.damage);
      if (followResult.damage > 0) lines.push("追撃！ 後衛の" + back.name + "に" + followResult.damage + "のダメージ。");
    }
  };

  // ── プレイヤー操作 ──
  State.prototype.playerChooseSkill = function (skillId) {
    this.pending.skillId = skillId;
    var skill = Data.SKILLS[skillId];
    var targets = reachTargets(this.pending.actor, skill, this.enemies);
    if (targets.length === 1 || skill.area) {
      this.playerChooseTarget(targets[0]);
    } else {
      this.phase = "target";
      this.render();
    }
  };

  State.prototype.playerChooseTarget = function (target) {
    var actor = this.pending.actor;
    var skillId = this.pending.skillId;
    var category = Data.SKILLS[skillId].category === "breakthrough" ? "breakthrough" : "attack";
    var stance = this.aiPickStance(target, actor, category, Data.SKILLS[skillId]);
    this.performResolve(actor, skillId, target, stance);
    this.endTurn(actor);
  };

  // 交代：手番の者と、反対の列の味方が入れ替わる（1手を使う）
  State.prototype.swapPartners = function (actor) {
    return this.party.filter(function (c) { return !c.defeated && c !== actor && c.position !== actor.position; });
  };
  State.prototype.playerSwap = function (partner) {
    var actor = this.pending.actor, a = actor.position, b = partner.position;
    actor.row = b; partner.row = a;
    updatePositions(this.party);
    this.pushLog([actor.name + "は" + partner.name + "と交代し、" + (actor.position === "front" ? "前衛" : "後衛") + "に移った。"]);
    this.endTurn(actor);
  };
  // 列を移る：ひとりで反対の列へ（前衛は1〜2人の範囲で。1手を使う）
  State.prototype.canMoveRow = function (actor) {
    for (var i = 0; i < this.party.length; i++) { var m = this.party[i]; if (!m.row) m.row = m.position; }
    return canSetRow(this.party, actor, actor.position === "front" ? "back" : "front");
  };
  State.prototype.playerMoveRow = function () {
    var actor = this.pending.actor;
    actor.row = actor.position === "front" ? "back" : "front";
    updatePositions(this.party);
    this.pushLog([actor.name + "は" + (actor.position === "front" ? "前衛へ出た。" : "後衛へ下がった。")]);
    this.endTurn(actor);
  };

  State.prototype.playerChooseStance = function (stance) {
    var p = this.pending;
    this.performResolve(p.actor, p.skillId, p.target, stance);
    this.endTurn(p.actor);
  };

  // 戦闘中に使える持ち物（回復の品だけ。記憶結晶や食料は戦闘では使わない）
  State.prototype.battleItems = function () {
    var items = this.items || {};
    return Object.keys(items).filter(function (id) { return items[id] > 0 && Data.ITEMS[id] && Data.ITEMS[id].heal; });
  };

  State.prototype.playerUseItem = function (itemId, target) {
    var actor = this.pending.actor;
    var it = Data.ITEMS[itemId];
    var got = Data.useHealItem(itemId, target);
    this.items[itemId] -= 1;
    if (this.items[itemId] <= 0) delete this.items[itemId];
    this.pushLog([actor.name + "は" + it.name + "を使った。" + (actor === target ? "" : target.name + "の") +
      (got.hp ? "HPが" + got.hp + "回復" : "") + (got.hp && got.mp ? "、" : "") + (got.mp ? "MPが" + got.mp + "回復" : "") + "。"]);
    this.endTurn(actor);
  };

  // ── 描画 ──
  State.prototype.render = function () {
    var self = this;
    var el = this.el;
    el.innerHTML = "";

    var title = document.createElement("h2");
    title.className = "battle-title";
    title.textContent = this.enemies.map(function (e) { return e.name; }).join(" / ");
    el.appendChild(title);

    // 縦並び：上から 敵の後衛 → 敵の前衛 → ログ → 味方の前衛 → 味方の後衛 → 行動
    el.appendChild(this.renderSide(this.enemies, "enemy"));

    var log = document.createElement("div");
    log.className = "battle-log";
    // スマホの縦画面に収まるよう、直近の5行だけ見せる
    this.log.slice(-5).forEach(function (l) {
      var p = document.createElement("p");
      p.textContent = l;
      log.appendChild(p);
    });
    el.appendChild(log);

    el.appendChild(this.renderSide(this.party, "ally"));

    var controls = document.createElement("div");
    controls.className = "battle-controls";
    this.renderControls(controls);
    el.appendChild(controls);
  };

  // 陣営ごとに前衛・後衛の2列。敵は後衛が上（奥）、味方は後衛が下（手前）。
  // 倒れた者は倒れた時の列に残して薄く見せる。後衛がいなければ後衛の列は出さない
  State.prototype.renderSide = function (list, faction) {
    var side = document.createElement("div");
    side.className = "battle-side " + faction;
    var self = this;
    var lanes = faction === "enemy" ? ["back", "front"] : ["front", "back"];
    lanes.forEach(function (pos) {
      // 倒れた者は列の後ろへ回す（生きている者から並べる）
      var members = list.filter(function (c) { return c.position === pos && !c.defeated; })
        .concat(list.filter(function (c) { return c.position === pos && c.defeated; }));
      if (!members.length && pos === "back") return;
      var lane = document.createElement("div");
      lane.className = "battle-lane " + pos;
      var lab = document.createElement("div");
      lab.className = "lane-label";
      lab.textContent = pos === "front" ? "前衛" : "後衛";
      lane.appendChild(lab);
      lane.appendChild(self.renderColumn(members, faction));
      side.appendChild(lane);
    });
    return side;
  };

  State.prototype.renderColumn = function (list, faction) {
    var col = document.createElement("div");
    col.className = "combatant-column";
    var self = this;
    var reach = this.phase === "target" && faction === "enemy" ? reachTargets(this.pending.actor, Data.SKILLS[this.pending.skillId], this.enemies) : [];
    list.forEach(function (c) {
      var box = document.createElement("div");
      // 戦闘画面には人物のピクトグラムを出さず、名前とゲージだけで示す。
      // 狙いを付けている相手は、絵の代わりに枠の強調で分かるようにする。
      box.className = "combatant-box" + (c.defeated ? " defeated" : "") + (self.pending && self.pending.target === c ? " selected" : "");
      var name = document.createElement("div");
      name.className = "combatant-name";
      name.textContent = c.name;
      box.appendChild(name);
      box.appendChild(bar(c.hp, c.maxHp, "hp", "HP " + c.hp + "/" + c.maxHp));
      if (!c.isEnemy) box.appendChild(bar(c.mp, c.maxMp, "mp", "MP " + c.mp + "/" + c.maxMp));
      box.appendChild(bar(Math.min(c.atb, ATB_MAX), ATB_MAX, "atb", "ATB"));
      if (self.phase === "target" && faction === "enemy" && !c.defeated) {
        if (reach.indexOf(c) >= 0) {
          box.classList.add("clickable");
          box.onclick = function () { self.playerChooseTarget(c); };
        } else box.classList.add("unreachable");                       // 前衛の陰で狙えない
      }
      if (self.pending && self.pending.actor === c && self.phase !== "response") box.classList.add("acting");
      col.appendChild(box);
    });
    return col;
  };

  function bar(val, max, cls, label) {
    var track = document.createElement("div");
    track.className = "bar-track";
    var fill = document.createElement("div");
    fill.className = "bar-fill " + cls;
    fill.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + "%";
    var lab = document.createElement("span");
    lab.className = "bar-label";
    lab.textContent = label;
    track.appendChild(fill);
    track.appendChild(lab);
    return track;
  }

  State.prototype.renderControls = function (root) {
    var self = this;
    if (this.phase === "intro") {
      root.appendChild(button("戦闘開始", function () { self.startLoop(); }));
      return;
    }
    if (this.phase === "playerAct") {
      var p = document.createElement("p");
      p.className = "prompt";
      p.textContent = this.pending.actor.name + "の行動を選択";
      root.appendChild(p);
      var grid = document.createElement("div");
      grid.className = "btn-grid";
      this.pending.actor.skills.forEach(function (skillId) {
        var skill = Data.SKILLS[skillId];
        // 防御の技（防御姿勢など）は、自分の手番に使う行動ではないので並べない
        if (!skill || skill.category === "defense") return;
        var usable = self.canUse(self.pending.actor, skillId) && self.canReach(self.pending.actor, skillId);
        var label = skill.name + (skill.mp > 0 ? "(MP" + skill.mp + ")" : "") + (self.canReach(self.pending.actor, skillId) ? "" : "（届かない）");
        grid.appendChild(button(label, function () { self.playerChooseSkill(skillId); }, !usable));
      });
      // 列を移る（前衛は1〜2人の範囲で）／交代（反対の列の味方と入れ替わる）
      var actorNow = this.pending.actor;
      if (this.canMoveRow(actorNow)) grid.appendChild(button(actorNow.position === "front" ? "後衛へ下がる" : "前衛へ出る", function () { self.playerMoveRow(); }));
      if (this.swapPartners(actorNow).length) grid.appendChild(button("交代", function () { self.phase = "swap"; self.render(); }));
      // アイテムも1手分の行動（PLAN.md：アイテム使用も能動1回分を消費する）
      grid.appendChild(button("アイテム", function () { self.phase = "item"; self.render(); }, !this.battleItems().length));
      root.appendChild(grid);
      return;
    }
    if (this.phase === "swap") {
      var ps = document.createElement("p");
      ps.className = "prompt";
      ps.textContent = this.pending.actor.name + "と入れ替わる味方を選択";
      root.appendChild(ps);
      var gs = document.createElement("div");
      gs.className = "btn-grid";
      this.swapPartners(this.pending.actor).forEach(function (c) {
        gs.appendChild(button(c.name + "（" + (c.position === "front" ? "前衛" : "後衛") + "）", function () { self.playerSwap(c); }));
      });
      gs.appendChild(button("戻る", function () { self.phase = "playerAct"; self.render(); }));
      root.appendChild(gs);
      return;
    }
    if (this.phase === "item") {
      var pi = document.createElement("p");
      pi.className = "prompt";
      pi.textContent = this.pending.actor.name + "が使う持ち物を選択";
      root.appendChild(pi);
      var gi = document.createElement("div");
      gi.className = "btn-grid";
      this.battleItems().forEach(function (id) {
        var it = Data.ITEMS[id];
        gi.appendChild(button(it.name + "×" + self.items[id], function () { self.pending.itemId = id; self.phase = "itemTarget"; self.render(); }));
      });
      gi.appendChild(button("戻る", function () { self.phase = "playerAct"; self.render(); }));
      root.appendChild(gi);
      return;
    }
    if (this.phase === "itemTarget") {
      var itemId = this.pending.itemId;
      var pt = document.createElement("p");
      pt.className = "prompt";
      pt.textContent = Data.ITEMS[itemId].name + "（" + Data.ITEMS[itemId].desc + "）を誰に使う？";
      root.appendChild(pt);
      var gt = document.createElement("div");
      gt.className = "btn-grid";
      this.party.forEach(function (c) {
        if (c.defeated) return;
        gt.appendChild(button(c.name + "（HP" + c.hp + "/" + c.maxHp + "・MP" + c.mp + "/" + c.maxMp + "）", function () { self.playerUseItem(itemId, c); }, !Data.healNeeded(itemId, c)));
      });
      gt.appendChild(button("戻る", function () { self.phase = "item"; self.render(); }));
      root.appendChild(gt);
      return;
    }
    if (this.phase === "target") {
      var p2 = document.createElement("p");
      p2.className = "prompt";
      p2.textContent = "狙う相手を選択（敵をタップ）";
      root.appendChild(p2);
      return;
    }
    if (this.phase === "response") {
      var atk = this.pending.actor, skill = Data.SKILLS[this.pending.skillId], target = this.pending.target;
      var category = skill.category === "breakthrough" ? "breakthrough" : "attack";
      var p3 = document.createElement("p");
      p3.className = "prompt";
      p3.textContent = skill.range === "far"
        ? atk.name + "が遠くから狙っている！ " + target.name + "はどう受ける？"
        : this.pending.concealAttackType
        ? atk.name + "が仕掛けてくる。" + target.name + "はどう受ける？"
        : atk.name + "が" + skill.name + "を仕掛けてくる！ " + target.name + "はどう受ける？";
      root.appendChild(p3);
      if (target.isEnemy) {
        var stance = this.aiPickStance(target, atk, category);
        this.performResolve(atk, this.pending.skillId, target, stance);
        setTimeout(function () { self.endTurn(atk); }, 10);
        return;
      }
      var grid2 = document.createElement("div");
      grid2.className = "btn-grid";
      var labels = { riposte: "反撃", defense: "防御", defenseStance: "防御姿勢(MP" + Data.SKILLS.defense_stance.mp + ")", evade: "回避", hold: "足止め", counter: "カウンター", breakthroughCounter: "突破カウンター" };
      this.availableStances(target, category, this.pending.concealAttackType).forEach(function (st) {
        grid2.appendChild(button(labels[st], function () { self.playerChooseStance(st); }));
      });
      root.appendChild(grid2);
      return;
    }
    if (this.phase === "done") {
      var result = this.checkEnd();
      var p4 = document.createElement("p");
      p4.className = "prompt";
      p4.textContent = result === "victory" ? "勝利した！" : result === "event" ? "戦いが止んだ。" : "……敗北した。";
      root.appendChild(p4);
    }
  };

  function button(label, onClick, disabled) {
    var b = document.createElement("button");
    b.className = "skill-btn";
    b.textContent = label;
    if (disabled) b.disabled = true;
    b.onclick = onClick;
    return b;
  }

  function start(containerEl, party, enemyIds, onEnd, opts) {
    var state = new State(containerEl, party, enemyIds, onEnd, opts);
    state.render();
    return state;
  }

  return { start: start, createCombatant: createCombatant, setLevel: setLevel, awardExperience: awardExperience,
    updatePositions: updatePositions, canSetRow: canSetRow, FRONT_MAX: FRONT_MAX };
})();
