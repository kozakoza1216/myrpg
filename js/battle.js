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
      skills: src.skills.slice(), canCounter: !!src.canCounter, counterSkillId: src.counterSkillId,
      atb: Math.random() * 30, defeated: false, scoreDebuff: 0, debuffTurns: 0,
      counterLearnRate: src.isBoss ? 0.25 : 0, usesLeft: {},
      position: "front",
      level: level, exp: isEnemy ? 0 : Data.expForLevel(level), expValue: isEnemy ? (src.exp || 0) : 0,
    };
  }

  // レベルを変える：能力値を成長の式で出し直し、最大HP・MPが増えた分だけ今のHP・MPも増やす
  function setLevel(c, lv) {
    var oldMaxHp = c.maxHp, oldMaxMp = c.maxMp;
    c.level = lv;
    c.stats = Data.statsAt(c.defId, lv);
    c.maxHp = c.stats.hp * 4;
    c.maxMp = c.stats.mag + c.stats.men;
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + (c.maxHp - oldMaxHp)));
    c.mp = Math.max(0, Math.min(c.maxMp, c.mp + (c.maxMp - oldMaxMp)));
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
        setLevel(c, lv);
        var ups = [["攻撃", "atk"], ["防御", "def"], ["素早さ", "spd"], ["魔力", "mag"], ["精神", "men"], ["技巧", "tec"], ["運", "luck"]]
          .filter(function (p) { return c.stats[p[1]] > before[p[1]]; })
          .map(function (p) { return p[0] + "+" + (c.stats[p[1]] - before[p[1]]); });
        lines.push(c.name + "はレベル" + lv + "になった！　最大HP+" + (c.maxHp - mhp) + "・最大MP+" + (c.maxMp - mmp) + (ups.length ? "・" + ups.join("・") : ""));
      }
    });
    return lines;
  }

  function updatePositions(list) {
    var alive = list.filter(function (c) { return !c.defeated; });
    alive.forEach(function (c, i) { c.position = i < 2 ? "front" : "back"; });
  }

  // opts.items：持ち物（ゲーム全体の持ち物をそのまま渡す。戦闘中に使えば減る）
  function State(containerEl, party, enemyIds, onEnd, opts) {
    this.el = containerEl;
    this.party = party;
    this.items = (opts && opts.items) || null;
    this.enemies = enemyIds.map(function (id) { return createCombatant(id, true); });
    updatePositions(this.party);
    updatePositions(this.enemies);
    this.onEnd = onEnd;
    this.log = [];
    this.phase = "intro"; // intro/idle/playerAct/target/response/message/done
    this.critPeriod = 15 + Math.floor(Math.random() * 26); // 15〜40
    this.critCount = 0;
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
    return null;
  };

  State.prototype.consumeDebuff = function (c) {
    if (c.debuffTurns > 0) {
      c.debuffTurns -= 1;
      if (c.debuffTurns === 0) c.scoreDebuff = 0;
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
    var skill = Data.SKILLS[skillId];

    if (skill.category === "special" || skill.category === "hold") {
      this.resolveSpecialOrHold(enemy, skillId, alive);
      return;
    }

    var target = alive[Math.floor(Math.random() * alive.length)];
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
    var attackSkills = enemy.skills.filter(function (id) {
      return Data.SKILLS[id].category === "attack" || Data.SKILLS[id].category === "breakthrough";
    });
    return attackSkills[Math.floor(Math.random() * attackSkills.length)];
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
      target.debuffTurns = skill.debuffTurns;
      lines.push(actor.name + "の" + skill.name + "！ " + target.name + "の判定が下がった。");
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
    if (concealAttackType) {
      stances.push("defense", "evade", "hold");
      if (defender.canCounter) stances.push("counter");
      if (defender.isBoss) stances.push("breakthroughCounter");
      return stances;
    }
    if (category === "attack") {
      stances.push("defense", "evade");
      if (defender.isBoss) stances.push("hold");
      if (defender.isBoss || defender.canCounter) stances.push("counter");
    } else {
      stances.push("hold", "defense");
      if (!this.hasBackline(defender)) stances.push("evade"); // 1対1（後衛なし）は例外的に回避可
      if (defender.isBoss) stances.push("breakthroughCounter");
    }
    return stances;
  };

  State.prototype.aiPickStance = function (defender, attacker, category) {
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
  State.prototype.performResolve = function (attacker, skillId, defender, stance) {
    var skill = Data.SKILLS[skillId];
    this.markUsed(attacker, skillId);

    var isBreakthrough = skill.category === "breakthrough";
    var lines = [];
    var stanceLabel = { defense: "防御", evade: "回避", hold: "足止め", counter: "カウンター", breakthroughCounter: "突破カウンター" }[stance] || "応答なし";
    lines.push(attacker.name + "の" + skill.name + "！ " + defender.name + "は" + stanceLabel + "を選択。");

    var isPartyAttacker = !attacker.isEnemy;
    var forceCrit = false;
    if (isPartyAttacker && (skill.category === "attack" || skill.category === "breakthrough")) {
      this.critCount += 1;
      if (this.critCount >= this.critPeriod) { forceCrit = true; this.critCount = 0; }
    }

    var result = Engine.resolveAction(attacker, skill, defender, stance, { forceCrit: forceCrit });

    if (result.reflected) {
      attacker.hp = Math.max(0, attacker.hp - result.damage);
      lines.push(defender.name + "のカウンターが成立！ " + attacker.name + "に" + result.damage + "のダメージ。");
      if (attacker.hp === 0) { attacker.defeated = true; attacker.defeatedBy = defender; }
    } else if (result.negated) {
      lines.push(defender.name + "は" + skill.name + "を完全に凌いだ！");
    } else {
      defender.hp = Math.max(0, defender.hp - result.damage);
      if (defender.hp === 0 && !defender.defeated) { defender.defeated = true; defender.defeatedBy = attacker; }
      var tag = (result.critical ? "（会心の一撃！）" : "") + (result.guaranteed ? "（保証ダメージ込み）" : "");
      if (result.damage > 0) lines.push(defender.name + "に" + result.damage + "のダメージ" + tag);

      if (isBreakthrough && result.attackerWins && !result.negated) {
        this.breakthroughFollowUp(attacker, skill, defender, lines);
      }
    }
    this.pushLog(lines);
  };

  State.prototype.breakthroughFollowUp = function (attacker, skill, frontDefender, lines) {
    var side = frontDefender.isEnemy ? this.enemies : this.party;
    var back = side.filter(function (c) { return !c.defeated && c.position === "back"; })[0];
    if (!back) return;
    var followSkill = { name: skill.name + "（追撃）", category: "attack", attribute: skill.attribute, power: (skill.power || 1) * 1.5, techBonus: (skill.techBonus || 0), isMagic: skill.isMagic };
    var stance = this.aiPickStance(back, attacker, "attack");
    if (["defense", "counter"].indexOf(stance) < 0) stance = "defense"; // 追撃時は防御/カウンターのみ
    var followResult = Engine.resolveAction(attacker, followSkill, back, stance, {});
    if (followResult.reflected) {
      attacker.hp = Math.max(0, attacker.hp - followResult.damage);
      lines.push("追撃！ " + back.name + "のカウンターが成立、" + attacker.name + "に" + followResult.damage + "。");
    } else {
      back.hp = Math.max(0, back.hp - followResult.damage);
      if (back.hp === 0 && !back.defeated) { back.defeated = true; back.defeatedBy = attacker; }
      if (followResult.damage > 0) lines.push("追撃！ 後衛の" + back.name + "に" + followResult.damage + "のダメージ。");
    }
    // 前衛へのおまけダメージ（突破が判定に勝った場合のみ）
    var extra = Math.round(attacker.stats.atk * 0.3);
    frontDefender.hp = Math.max(0, frontDefender.hp - extra);
    if (frontDefender.hp === 0 && !frontDefender.defeated) { frontDefender.defeated = true; frontDefender.defeatedBy = attacker; }
    lines.push(frontDefender.name + "にもおまけダメージ" + extra + "。");
  };

  // ── プレイヤー操作 ──
  State.prototype.playerChooseSkill = function (skillId) {
    this.pending.skillId = skillId;
    var skill = Data.SKILLS[skillId];
    var targets = this.enemies.filter(function (c) { return !c.defeated; });
    if (targets.length === 1) {
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
    var stance = this.aiPickStance(target, actor, category);
    this.performResolve(actor, skillId, target, stance);
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

    var field = document.createElement("div");
    field.className = "battle-field";
    field.appendChild(this.renderColumn(this.enemies, "enemy"));
    field.appendChild(this.renderColumn(this.party, "ally"));
    el.appendChild(field);

    var log = document.createElement("div");
    log.className = "battle-log";
    this.log.forEach(function (l) {
      var p = document.createElement("p");
      p.textContent = l;
      log.appendChild(p);
    });
    el.appendChild(log);

    var controls = document.createElement("div");
    controls.className = "battle-controls";
    this.renderControls(controls);
    el.appendChild(controls);
  };

  State.prototype.renderColumn = function (list, faction) {
    var col = document.createElement("div");
    col.className = "combatant-column";
    var self = this;
    list.forEach(function (c) {
      var box = document.createElement("div");
      // 戦闘画面には人物のピクトグラムを出さず、名前とゲージだけで示す。
      // 狙いを付けている相手は、絵の代わりに枠の強調で分かるようにする。
      box.className = "combatant-box" + (c.defeated ? " defeated" : "") + (self.pending && self.pending.target === c ? " selected" : "");
      var name = document.createElement("div");
      name.className = "combatant-name";
      name.textContent = c.name + (c.position === "back" ? "（後衛）" : "");
      box.appendChild(name);
      box.appendChild(bar(c.hp, c.maxHp, "hp", "HP " + c.hp + "/" + c.maxHp));
      if (!c.isEnemy) box.appendChild(bar(c.mp, c.maxMp, "mp", "MP " + c.mp + "/" + c.maxMp));
      box.appendChild(bar(Math.min(c.atb, ATB_MAX), ATB_MAX, "atb", "ATB"));
      if (self.phase === "target" && faction === "enemy" && !c.defeated) {
        box.classList.add("clickable");
        box.onclick = function () { self.playerChooseTarget(c); };
      }
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
        var usable = self.canUse(self.pending.actor, skillId);
        var label = skill.name + (skill.mp > 0 ? "(MP" + skill.mp + ")" : "");
        grid.appendChild(button(label, function () { self.playerChooseSkill(skillId); }, !usable));
      });
      // アイテムも1手分の行動（PLAN.md：アイテム使用も能動1回分を消費する）
      grid.appendChild(button("アイテム", function () { self.phase = "item"; self.render(); }, !this.battleItems().length));
      root.appendChild(grid);
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
      p2.textContent = "対象を選択（敵をクリック）";
      root.appendChild(p2);
      return;
    }
    if (this.phase === "response") {
      var atk = this.pending.actor, skill = Data.SKILLS[this.pending.skillId], target = this.pending.target;
      var category = skill.category === "breakthrough" ? "breakthrough" : "attack";
      var p3 = document.createElement("p");
      p3.className = "prompt";
      p3.textContent = this.pending.concealAttackType
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
      var labels = { defense: "防御", evade: "回避", hold: "足止め", counter: "カウンター", breakthroughCounter: "突破カウンター" };
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
      p4.textContent = result === "victory" ? "勝利した！" : "……敗北した。";
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

  return { start: start, createCombatant: createCombatant, setLevel: setLevel, awardExperience: awardExperience };
})();
