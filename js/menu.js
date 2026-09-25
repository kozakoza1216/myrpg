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
      party: game.party.map(function (c) { return { defId: c.defId, hp: c.hp, mp: c.mp, skills: c.skills.slice() }; }),
      companions: game.companions.slice(), flags: Object.assign({}, game.flags), items: Object.assign({}, game.items || {}),
    };
  }
  function unpackGame(p) {
    return {
      steps: p.steps, stepLimit: p.stepLimit,
      party: p.party.map(function (m) {
        var c = RPG.Battle.createCombatant(m.defId, false);
        c.hp = m.hp; c.mp = m.mp; c.skills = m.skills.slice();
        return c;
      }),
      companions: p.companions.slice(), flags: Object.assign({}, p.flags), items: Object.assign({}, p.items || {}),
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
      var list = [["status", "ステータス"], ["skills", "技"], ["items", "持ち物"]];
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
        card.appendChild(div("menu-name", c.name));
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

    function renderItems(body) {
      var items = game.items || {};
      var ids = Object.keys(items).filter(function (id) { return items[id] > 0 && Data.ITEMS[id]; });
      if (!ids.length) { body.appendChild(div("menu-empty", "持ち物はない。")); return; }
      ids.forEach(function (id) {
        var it = Data.ITEMS[id];
        var row = div("menu-row" + (itemSel === id ? " selected" : ""));
        var main = div("menu-row-main", it.name + "　×" + items[id]);
        row.appendChild(main);
        row.appendChild(div("menu-row-sub", it.desc + (it.key ? "（大事なもの）" : "")));
        if (!it.key) row.appendChild(btn(itemSel === id ? "やめる" : "使う", function () { itemSel = itemSel === id ? null : id; msg = ""; render(); }));
        if (itemSel === id) {
          // 誰に使うか
          var who = div("menu-targets");
          who.appendChild(div("menu-row-sub", "誰に使う？"));
          game.party.forEach(function (c) {
            var need = (it.heal.hp && c.hp < c.maxHp) || (it.heal.mp && c.mp < c.maxMp);
            var b = btn(c.name + "（HP " + c.hp + "/" + c.maxHp + (it.heal.mp ? "　MP " + c.mp + "/" + c.maxMp : "") + "）", function () {
              var hp0 = c.hp, mp0 = c.mp;
              if (it.heal.hp) c.hp = Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * it.heal.hp));
              if (it.heal.mp) c.mp = Math.min(c.maxMp, c.mp + Math.ceil(c.maxMp * it.heal.mp));
              items[id] -= 1;
              if (items[id] <= 0) delete items[id];
              msg = c.name + "は" + it.name + "を使った。" + (c.hp > hp0 ? "HPが" + (c.hp - hp0) + "回復した。" : "") + (c.mp > mp0 ? "MPが" + (c.mp - mp0) + "回復した。" : "");
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
