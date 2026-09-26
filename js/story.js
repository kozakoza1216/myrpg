// 会話・ナレーション・選択肢の逐次再生（PLAN.md §7-0, §8-5 準拠の簡易ダイアログUI）。
window.RPG = window.RPG || {};

RPG.Story = (function () {
  function play(containerEl, beats, onDone) {
    var index = 0;
    var lastChoice = null;
    // いま映している背景（場面の見出しなどの bg で切り替わり、次に変わるまで続く）
    var bgId = null;
    // 画面に出ている人物（左・右の2枠）。last はその人物が最後に話した順番
    var slots = [null, null], turn = 0;

    // 話者の青い影を左右に置く。
    // ・最初に話す人物は左、次に話す別の人物は右に出る
    // ・3人目の新しい人物は、左右のうち長く話していないほうと入れ替わる
    // ・話していない側は暗くして、誰が話しているかを分かりやすくする
    //   （地の文の間は、話者がいないので両方とも暗くする）
    function placeFigures(frame, beat) {
      if (beat.kind === "header") slots = [null, null];
      var id = beat.figure || (beat.speaker && RPG.Scenes.figIdForSpeaker ? RPG.Scenes.figIdForSpeaker(beat.speaker) : null);
      var speaking = -1, entered = -1;
      if (id) {
        turn++;
        for (var i = 0; i < 2; i++) if (slots[i] && slots[i].id === id) speaking = i;
        if (speaking < 0) {
          if (!slots[0]) speaking = 0;
          else if (!slots[1]) speaking = 1;
          else speaking = slots[0].last <= slots[1].last ? 0 : 1;
          slots[speaking] = { id: id };
          entered = speaking;
        }
        slots[speaking].last = turn;
      }
      for (var j = 0; j < 2; j++) {
        if (!slots[j]) continue;
        var cv = RPG.Scenes.figureFor(slots[j].id);
        if (!cv) continue;
        cv.classList.remove("slot-left", "slot-right", "dim", "fig-enter");
        cv.classList.add(j === 0 ? "slot-left" : "slot-right");
        if (j !== speaking) cv.classList.add("dim");
        if (j === entered) { void cv.offsetWidth; cv.classList.add("fig-enter"); }
        frame.appendChild(cv);
      }
    }

    function renderBeat() {
      var beat = beats[index];
      if (!beat) {
        // 会話クリックのイベント処理中に次の探索画面を同期描画すると、
        // Android系ブラウザで入力イベントとDOM差し替えが競合して
        // 「最後の文章から先へ進まない」状態になることがある。
        // 会話終了後の画面遷移はイベント処理を抜けてから行う。
        setTimeout(function () { onDone(lastChoice); }, 0);   // 最後に選んだ選択肢の番号（選択肢がなければ null）を渡す
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
        // 壊れた人工天井の空：走査線の帯が流れ、ときどき表示がちらつく（絵の上、人物の影の下）
        if (RPG.Scenes.hasSky && RPG.Scenes.hasSky(bgId)) {
          var skyFx = document.createElement("div");
          skyFx.className = "scene-sky";
          skyFx.appendChild(document.createElement("div")).className = "cl-scan";
          frame.appendChild(skyFx);
        }
        stage.appendChild(frame);
        containerEl.appendChild(stage);
        if (beat.kind !== "choice") frame.onclick = advance;
        placeFigures(frame, beat);
      }
      // 演出：fx:"quake"＝画面が揺れて赤く光る（暗転はしない）
      if (beat.emph && RPG.Sound) RPG.Sound.play("levelup");
      if (beat.fx) { var fxEl = frame || containerEl; fxEl.classList.add("fx-" + beat.fx); if (RPG.Sound) RPG.Sound.play(beat.fx); }
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
        beat.options.forEach(function (opt, oi) {
          var b = document.createElement("button");
          b.textContent = opt;
          b.onclick = function () { lastChoice = oi; advance(); };
          opts.appendChild(b);
        });
        box.appendChild(opts);
      } else {
        box.className = "story-box " + (beat.speaker ? "dialogue" : "narration") + (beat.emph ? " emph" : "");
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
