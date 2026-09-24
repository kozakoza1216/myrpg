// 会話・ナレーション・選択肢の逐次再生（PLAN.md §7-0, §8-5 準拠の簡易ダイアログUI）。
window.RPG = window.RPG || {};

RPG.Story = (function () {
  function play(containerEl, beats, onDone) {
    var index = 0;
    // いま映している背景（場面の見出しなどの bg で切り替わり、次に変わるまで続く）
    var bgId = null;

    function renderBeat() {
      var beat = beats[index];
      if (!beat) {
        // 会話クリックのイベント処理中に次の探索画面を同期描画すると、
        // Android系ブラウザで入力イベントとDOM差し替えが競合して
        // 「最後の文章から先へ進まない」状態になることがある。
        // 会話終了後の画面遷移はイベント処理を抜けてから行う。
        setTimeout(function () { onDone(); }, 0);
        return;
      }
      containerEl.innerHTML = "";
      if (beat.bg !== undefined) bgId = beat.bg;
      // 背景の絵があれば、絵を上に、文章の欄をその下に置く。
      // 場面の見出しは、絵の上に重ねて出す。絵をタップしても先へ進む。
      var bgCanvas = bgId && RPG.Scenes ? RPG.Scenes.canvasFor(bgId) : null;
      var stage = containerEl, frame = null;
      if (bgCanvas) {
        stage = document.createElement("div");
        stage.className = "story-stage";
        frame = document.createElement("div");
        frame.className = "scene-frame";
        frame.appendChild(bgCanvas);
        stage.appendChild(frame);
        containerEl.appendChild(stage);
        if (beat.kind !== "choice") frame.onclick = advance;
      }
      var box = document.createElement("div");

      if (beat.kind === "header") {
        box.className = "scene-header" + (frame ? " over-bg" : "");
        var label = document.createElement("div");
        label.className = "scene-header-label";
        label.textContent = beat.text;
        box.appendChild(label);
        var hint = document.createElement("div");
        hint.className = "story-hint";
        hint.textContent = "（クリックで進む）";
        box.appendChild(hint);
        box.onclick = advance;
      } else if (beat.kind === "choice") {
        box.className = "story-box choice";
        if (beat.prompt) {
          var pr = document.createElement("p");
          pr.className = "choice-prompt";
          pr.textContent = beat.prompt;
          box.appendChild(pr);
        }
        var opts = document.createElement("div");
        opts.className = "choice-options";
        beat.options.forEach(function () {
          // どれを選んでも同じ流れへ（§5-2 セオの台詞は画面に出さない）
        });
        beat.options.forEach(function (opt) {
          var b = document.createElement("button");
          b.textContent = opt;
          b.onclick = advance;
          opts.appendChild(b);
        });
        box.appendChild(opts);
      } else {
        box.className = "story-box " + (beat.speaker ? "dialogue" : "narration");
        if (beat.speaker) {
          var sp = document.createElement("div");
          sp.className = "speaker";
          sp.textContent = beat.speaker;
          box.appendChild(sp);
        }
        var p = document.createElement("p");
        p.textContent = beat.text;
        box.appendChild(p);
        var hint2 = document.createElement("div");
        hint2.className = "story-hint";
        hint2.textContent = "▼";
        box.appendChild(hint2);

        var nextBtn = document.createElement("button");
        nextBtn.className = "story-next-btn";
        nextBtn.type = "button";
        nextBtn.textContent = "次へ";
        nextBtn.onclick = function (e) {
          e.stopPropagation();
          advance();
        };
        box.appendChild(nextBtn);
        box.onclick = advance;
      }
      if (frame && beat.kind === "header") { box.onclick = null; frame.appendChild(box); }
      else stage.appendChild(box);
    }

    function advance() {
      index += 1;
      renderBeat();
    }

    renderBeat();
  }

  return { play: play };
})();
