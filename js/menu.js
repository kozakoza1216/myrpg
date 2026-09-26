// 探索中に開くメニュー（ステータス・技・持ち物・ファストトラベル・セーブ／ロード）と、
// ブラウザへの保存。
window.RPG = window.RPG || {};

RPG.Save = (function () {
  var KEY = "ankokuRPG.save.v1";
  // ブラウザの保存領域は、設定や閲覧モードによっては使えない（例外になる）ことがある
  function read() {
    try { var raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function write(data) {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  // 戦闘キャラの状態は、元データから作り直せない部分（HP・MP・覚えた技）だけを残す
  function packGame(game) {
    return {
      steps: game.steps, stepLimit: game.stepLimit,
      party: game.party.map(function (c) { return { defId: c.defId, level: c.level, exp: c.exp, hp: c.hp, mp: c.mp, skills: c.skills.slice(), row: c.row || null }; }),
      companions: game.companions.slice(), flags: Object.assign({}, game.flags), items: Object.assign({}, game.items || {}),
      crit: game.crit ? Object.assign({}, game.crit) : null,
      encounterIn: game.encounterIn || 0,
    };
  }
  // 記録の技を今の定義に合わせる：初めから持つ技とレベルで覚える技は定義から出し直し、記憶結晶で覚えた技だけを記録から残す。
  // （以前の版では、セオ・ツェルフの「踏み込み」、ツェルフの「力押し」「二連撃」を初めから持たせていた。
  //   ツェルフの技をレベルで覚えるようにする前の記録では、3つの技を最初から全部持っている）
  function migrateSkills(m) {
    var old = m.skills.indexOf("step_in") >= 0;
    var base = RPG.Data.skillsAt(m.defId, m.level || 1);
    var learnable = {};
    Object.keys(RPG.Data.ITEMS).forEach(function (id) { if (RPG.Data.ITEMS[id].learn) learnable[RPG.Data.ITEMS[id].learn] = true; });
    m.skills.forEach(function (id) {
      if (!learnable[id] || base.indexOf(id) >= 0) return;
      if (old && m.defId === "tzelf" && id === "double_slash") return; // 以前の版で初めから持っていた分
      base.push(id);
    });
    return base;
  }
  function unpackGame(p) {
    return {
      steps: p.steps, stepLimit: p.stepLimit,
      party: p.party.map(function (m) {
        var c = RPG.Battle.createCombatant(m.defId, false);
        if (m.level) { RPG.Battle.setLevel(c, m.level); c.exp = m.exp; }
        c.hp = Math.min(m.hp, c.maxHp); c.mp = Math.min(m.mp, c.maxMp); c.skills = migrateSkills(m);
        if (m.row) c.row = m.row;
        return c;
      }),
      companions: p.companions.slice(), flags: Object.assign({}, p.flags), items: Object.assign({}, p.items || {}),
      crit: p.crit ? Object.assign({}, p.crit) : RPG.Data.newSeed(),
      encounterIn: p.encounterIn || 0,
    };
  }
  return { read: read, write: write, packGame: packGame, unpackGame: unpackGame };
})();

RPG.Menu = (function () {
  var Data = RPG.Data;
  var CATEGORY = { attack: "攻撃", breakthrough: "突破", hold: "足止め", defense: "防御", special: "特殊" };
  var ATTRIBUTE = { physical: "物理", magic: "魔法", none: "無属性" };
  var STAT_NAMES = [["atk", "攻撃"], ["def", "防御"], ["spd", "素早さ"], ["mag", "魔力"], ["men", "精神"], ["tec", "技巧"], ["luck", "運"]];

  function btn(label, onClick, cls) {
    var b = document.createElement("button");
    b.className = cls || "skill-btn";
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }
  function div(cls, text) {
    var d = document.createElement("div");
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    return d;
  }
  function bar(val, max, cls, label) {
    var track = div("bar-track");
    var fill = div("bar-fill " + cls);
    fill.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + "%";
    track.appendChild(fill);
    track.appendChild(div("bar-label", label));
    return track;
  }
  function formatTime(t) {
    var d = new Date(t);
    var z = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "/" + z(d.getMonth() + 1) + "/" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }

  // opts: onClose() / fastTravel { available(), open() } / onSave() → 保存したデータ / onLoad() / placeLabel
  function open(app, game, opts) {
    var tab = "status";
    var msg = "";
    var itemSel = null;   // 使おうとしている持ち物

    function render() {
      app.innerHTML = "";
      var wrap = div("menu-screen");
      var head = div("menu-head");
      head.appendChild(div("menu-title", "メニュー"));
      head.appendChild(div("menu-place", (opts.placeLabel || "") + "　歩数 " + game.steps + " / " + game.stepLimit));
      wrap.appendChild(head);

      var tabs = div("menu-tabs");
      var list = [["status", "ステータス"], ["skills", "技"], ["items", "持ち物"], ["formation", "配置"]];
      if (opts.fastTravel) list.push(["travel", "ファストトラベル"]);
      list.push(["save", "セーブ／ロード"]);
      list.forEach(function (t) {
        tabs.appendChild(btn(t[1], function () { tab = t[0]; msg = ""; itemSel = null; render(); }, "menu-tab" + (tab === t[0] ? " current" : "")));
      });
      wrap.appendChild(tabs);

      var body = div("menu-body");
      if (tab === "status") renderStatus(body);
      else if (tab === "skills") renderSkills(body);
      else if (tab === "items") renderItems(body);
      else if (tab === "formation") renderFormation(body);
      else if (tab === "travel") renderTravel(body);
      else renderSave(body);
      wrap.appendChild(body);

      if (msg) wrap.appendChild(div("menu-msg", msg));
      var foot = div("menu-foot");
      foot.appendChild(btn("閉じる", function () { opts.onClose(); }));
      wrap.appendChild(foot);
      app.appendChild(wrap);
    }

    function renderStatus(body) {
      game.party.forEach(function (c) {
        var card = div("menu-card");
        card.appendChild(div("menu-name", c.name + "　Lv " + c.level));
        var next = c.level < Data.MAX_LEVEL ? "次のレベルまで " + (Data.expForLevel(c.level + 1) - c.exp) : "最大レベル";
        card.appendChild(div("menu-row-sub", "経験値 " + c.exp + "　" + next));
        card.appendChild(bar(c.hp, c.maxHp, "hp", "HP " + c.hp + " / " + c.maxHp));
        card.appendChild(bar(c.mp, c.maxMp, "mp", "MP " + c.mp + " / " + c.maxMp));
        var grid = div("menu-stats");
        STAT_NAMES.forEach(function (s) {
          grid.appendChild(div("menu-stat-name", s[1]));
          grid.appendChild(div("menu-stat-val", String(c.stats[s[0]])));
        });
        card.appendChild(grid);
        body.appendChild(card);
      });
    }

    function renderSkills(body) {
      game.party.forEach(function (c) {
        var card = div("menu-card");
        card.appendChild(div("menu-name", c.name));
        c.skills.forEach(function (id) {
          var sk = Data.SKILLS[id];
          if (!sk) return;
          var row = div("menu-row");
          row.appendChild(div("menu-row-main", sk.name));
          row.appendChild(div("menu-row-sub", (CATEGORY[sk.category] || "") + "・" + (ATTRIBUTE[sk.attribute] || "") + "　MP " + (sk.mp || 0)));
          card.appendChild(row);
        });
        body.appendChild(card);
      });
    }

    // 持ち物の上限：ミラが同行していれば無制限、いなければ30個（数え方は個数。大事なものは枠の外）
    function stackCount(items) {
      return Object.keys(items).reduce(function (n, id) { var it = Data.ITEMS[id]; return n + (it && !it.key ? items[id] : 0); }, 0);
    }

    function renderItems(body) {
      var items = game.items || {};
      var ids = Object.keys(items).filter(function (id) { return items[id] > 0 && Data.ITEMS[id]; });
      var withMira = game.companions.indexOf("mira") >= 0;
      body.appendChild(div("menu-row-sub", "所持数 " + stackCount(items) + (withMira ? "（ミラが持つので上限なし）" : " / 30")));
      if (!ids.length) { body.appendChild(div("menu-empty", "持ち物はない。")); return; }
      ids.forEach(function (id) {
        var it = Data.ITEMS[id];
        var usable = !!(it.heal || it.learn);
        var row = div("menu-row" + (itemSel === id ? " selected" : ""));
        row.appendChild(div("menu-row-main", it.name + "　×" + items[id]));
        row.appendChild(div("menu-row-sub", it.desc + (it.key ? "（大事なもの）" : "")));
        if (usable) row.appendChild(btn(itemSel === id ? "やめる" : "使う", function () { itemSel = itemSel === id ? null : id; msg = ""; render(); }));
        if (itemSel === id) {
          // 誰に使うか
          var who = div("menu-targets");
          who.appendChild(div("menu-row-sub", "誰に使う？"));
          game.party.forEach(function (c) {
            var h = it.heal || {};
            var need, label;
            if (it.learn) {
              need = c.skills.indexOf(it.learn) < 0;
              label = c.name + (need ? "" : "（覚えている）");
            } else {
              need = Data.healNeeded(id, c);
              label = c.name + "（HP " + c.hp + "/" + c.maxHp + ((h.mp || h.mpPct) ? "　MP " + c.mp + "/" + c.maxMp : "") + "）";
            }
            var b = btn(label, function () {
              if (it.learn) {
                c.skills.push(it.learn);
                msg = c.name + "は〈" + Data.SKILLS[it.learn].name + "〉を覚えた。";
              } else {
                var got = Data.useHealItem(id, c);
                msg = c.name + "は" + it.name + "を使った。" + (got.hp ? "HPが" + got.hp + "回復した。" : "") + (got.mp ? "MPが" + got.mp + "回復した。" : "");
              }
              items[id] -= 1;
              if (items[id] <= 0) delete items[id];
              itemSel = null;
              render();
            });
            if (!need) b.disabled = true;
            who.appendChild(b);
          });
          row.appendChild(who);
        }
        body.appendChild(row);
      });
    }

    // 配置：戦闘での前衛・後衛。前衛は1〜2人。後衛は、前衛が残っている間は狙われないが、
    // 突破ができず、攻撃の威力が下がる
    function renderFormation(body) {
      var B = RPG.Battle;
      B.updatePositions(game.party);
      game.party.forEach(function (c) { if (!c.row) c.row = c.position; });
      body.appendChild(div("menu-row-sub", "前衛は1〜" + B.FRONT_MAX + "人。後衛は、前衛が残っている間は敵の近距離の攻撃に狙われない。ただし後衛からは突破と近距離の技が使えず、使えるのは遠距離の技と魔法（全距離）だけ。"));
      ["front", "back"].forEach(function (row) {
        var card = div("menu-card");
        card.appendChild(div("menu-name", row === "front" ? "前衛" : "後衛"));
        var members = game.party.filter(function (c) { return c.row === row; });
        if (!members.length) card.appendChild(div("menu-empty", "（いない）"));
        members.forEach(function (c) {
          var r = div("menu-row");
          r.appendChild(div("menu-row-main", c.name + "　HP " + c.hp + "/" + c.maxHp));
          var to = row === "front" ? "back" : "front";
          var b = btn(to === "front" ? "前衛へ" : "後衛へ", function () {
            c.row = to;
            B.updatePositions(game.party);
            msg = c.name + "を" + (to === "front" ? "前衛" : "後衛") + "にした。";
            render();
          });
          if (!B.canSetRow(game.party, c, to)) b.disabled = true;
          r.appendChild(b);
          card.appendChild(r);
        });
        body.appendChild(card);
      });
    }

    function renderTravel(body) {
      if (opts.fastTravel.available()) {
        body.appendChild(div("menu-row-sub", "地図を開いて、一度訪れた場所へ移動する（最短経路と同じ歩数を消費する）。"));
        body.appendChild(btn("地図を開く", function () { opts.fastTravel.open(); }));
      } else {
        body.appendChild(div("menu-empty", "まだファストトラベルで行ける場所がない。"));
      }
    }

    function renderSave(body) {
      var cur = RPG.Save.read();
      body.appendChild(div("menu-row-sub", cur ? "記録：" + cur.placeLabel + "（" + formatTime(cur.savedAt) + "）" : "記録はまだない。"));
      body.appendChild(btn("ここでセーブする", function () {
        var ok = opts.onSave();
        msg = ok ? "セーブした。" : "この環境ではブラウザに保存できないため、セーブできなかった。";
        render();
      }));
      var lb = btn("記録から再開する（ロード）", function () {
        if (!RPG.Save.read()) return;
        opts.onLoad();
      });
      if (!cur) lb.disabled = true;
      body.appendChild(lb);
    }

    render();
  }

  return { open: open };
})();
