// ブートストラップ：タイトル→第一章→終了画面の画面遷移。
window.RPG = window.RPG || {};

(function () {
  var app;

  function createGameState() {
    return {
      steps: 0, stepLimit: 3000,
      party: [RPG.Battle.createCombatant("seo", false)],
      companions: [],
      visitedNodes: { haiberi: true },
      currentNode: "haiberi",
      flags: {},
    };
  }

  function renderTitle() {
    app.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "title-screen";
    var h1 = document.createElement("h1");
    h1.textContent = "暗黒時代RPG";
    var sub = document.createElement("p");
    sub.className = "subtitle";
    sub.textContent = "ピクトグラム判定バトルRPG・プレイアブルプロトタイプ";
    var btn = document.createElement("button");
    btn.className = "primary-btn";
    btn.textContent = "第一章「ミラ奪還〜追放」を始める";
    btn.onclick = function () {
      var game = createGameState();
      RPG.Chapter1.run(app, game, function () { renderChapterEnd(game); });
    };
    var foot = document.createElement("p");
    foot.className = "footnote";
    foot.textContent = "判定バトル（攻撃/突破/防御/回避/足止め/カウンター）と擬似3D探索を実装した第一章の縦切り版です。";
    wrap.appendChild(h1);
    wrap.appendChild(sub);
    wrap.appendChild(btn);
    wrap.appendChild(foot);
    app.appendChild(wrap);
  }

  function renderChapterEnd(game) {
    app.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "title-screen";
    var h2 = document.createElement("h2");
    h2.textContent = "第一章　― Keep your head down. への序章 ―";
    var p = document.createElement("p");
    p.textContent = "帰る場所を失った三人が、旅を続ける。ツェルフの目的に同行する第二章は準備中です。";
    var foot = document.createElement("p");
    foot.className = "footnote";
    var names = ["ツェルフ"].concat(game.companions.indexOf("mira") >= 0 ? ["ミラ（非戦闘）"] : []);
    foot.textContent = "同行者：" + names.join("・") + "　／　総歩数：" + game.steps;
    var btn = document.createElement("button");
    btn.className = "primary-btn";
    btn.textContent = "タイトルに戻る";
    btn.onclick = renderTitle;
    wrap.appendChild(h2);
    wrap.appendChild(p);
    wrap.appendChild(foot);
    wrap.appendChild(btn);
    app.appendChild(wrap);
  }

  document.addEventListener("DOMContentLoaded", function () {
    app = document.getElementById("app");
    renderTitle();
  });
})();
