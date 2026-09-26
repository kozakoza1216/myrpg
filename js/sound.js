// 音：効果音とBGMを、音の素材なしでその場で合成して鳴らす（WebAudio）。
// ブラウザは、画面に触れるまで音を出させないので、最初のタップ・キー入力で鳴らせる状態にする。
// 音のON/OFFはこの端末に覚えておく（保存できない環境では、毎回ONから）。
window.RPG = window.RPG || {};

RPG.Sound = (function () {
  var KEY = "ankokuRPG.sound";
  var ctx = null, master = null, seBus = null, bgmBus = null, noiseBuf = null;
  var enabled = true;
  try { enabled = window.localStorage.getItem(KEY) !== "off"; } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 1 : 0; master.connect(ctx.destination);
    seBus = ctx.createGain(); seBus.gain.value = 0.32; seBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.16; bgmBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (wantBgm && !curBgm) startBgm(wantBgm);
  }
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
  // ボタンを押したときの決定音
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("button") && !t.closest("button").disabled) play("select");
  }, true);

  // ── 音の部品 ──
  function tone(type, freq, t0, dur, vol, bus, glideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || seBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, vol, freq, q, bus, sweepTo) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = "bandpass"; f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || seBus);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }
  var NOTE = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };

  // ── 効果音 ──
  var SE = {
    select: function (t) { tone("square", 880, t, 0.05, 0.12); },
    hit: function (t) { noise(t, 0.12, 0.9, 1800, 0.8); tone("sine", 140, t, 0.16, 0.7, null, 60); },
    crit: function (t) { noise(t, 0.2, 1.0, 2400, 0.7); tone("sine", 120, t, 0.25, 0.9, null, 45); tone("square", 1760, t + 0.02, 0.12, 0.25); tone("square", 2637, t + 0.08, 0.14, 0.2); },
    negate: function (t) { noise(t, 0.25, 0.5, 600, 2, null, 4000); },
    reflect: function (t) { tone("triangle", 1320, t, 0.2, 0.4); tone("triangle", 1980, t + 0.03, 0.25, 0.3); noise(t, 0.1, 0.5, 2000, 1); },
    heal: function (t) { [72, 76, 79, 84].forEach(function (n, i) { tone("sine", NOTE(n), t + i * 0.07, 0.25, 0.3); }); },
    miss: function (t) { tone("sawtooth", 300, t, 0.3, 0.2, null, 150); },
    levelup: function (t) { [67, 72, 76, 79, 84].forEach(function (n, i) { tone("square", NOTE(n), t + i * 0.09, 0.22, 0.18); }); tone("triangle", NOTE(88), t + 0.45, 0.5, 0.25); },
    caught: function (t) { tone("square", 1200, t, 0.08, 0.3); tone("square", 1600, t + 0.09, 0.14, 0.3); },
    encounter: function (t) { [76, 75, 74, 73].forEach(function (n, i) { tone("sawtooth", NOTE(n), t + i * 0.05, 0.1, 0.18); }); },
    quake: function (t) { noise(t, 1.4, 1.0, 90, 0.7); tone("sine", 45, t, 1.4, 0.9, null, 30); },
    victory: function (t) { [72, 76, 79].forEach(function (n, i) { tone("square", NOTE(n), t + i * 0.12, 0.16, 0.2); }); tone("square", NOTE(84), t + 0.38, 0.5, 0.22); tone("triangle", NOTE(60), t + 0.38, 0.5, 0.3); },
    defeat: function (t) { [67, 63, 60, 55].forEach(function (n, i) { tone("triangle", NOTE(n), t + i * 0.22, 0.4, 0.3); }); },
  };
  function play(name) {
    if (!enabled || !SE[name] || !ensure() || ctx.state !== "running") return;
    SE[name](ctx.currentTime + 0.01);
  }
  // 戦闘の演出に合わせた音（いちばん目立つものを1つ）
  function battleFx(fx) {
    if (!fx) return;
    var kinds = fx.marks.map(function (m) { return m.kind; });
    var pick = ["crit", "reflect", "hit", "negate", "heal", "miss"].filter(function (k) { return kinds.indexOf(k) >= 0; })[0];
    if (pick) play(pick);
  }

  // ── BGM：その場で音を並べて鳴らし続ける（先読みして予約する） ──
  // field＝探索（低い持続音と、まばらな鐘の音）／battle＝戦闘（短調の刻み）／boss＝ボス戦（速く暗い）
  // ruin＝時間切れの後（不協和な持続音だけ）／title＝タイトル
  var BGM = {
    title: { tempo: 60, bars: [[45, 52], [41, 48], [43, 50], [40, 47]], bell: [69, 72, 76, 74, 71], bellRate: 0.35, drum: false },
    field: { tempo: 72, bars: [[45, 52], [45, 52], [41, 48], [43, 50]], bell: [69, 72, 74, 76, 79, 81], bellRate: 0.25, drum: false },
    battle: { tempo: 132, bars: [[45, 45, 57, 45, 48, 45, 57, 47], [41, 41, 53, 41, 44, 41, 53, 43], [43, 43, 55, 43, 46, 43, 55, 45], [40, 40, 52, 40, 44, 40, 52, 43]], bell: [69, 72, 76], bellRate: 0.12, drum: true },
    boss: { tempo: 150, bars: [[45, 46, 45, 51, 45, 46, 48, 51], [44, 45, 44, 50, 44, 45, 47, 50], [42, 43, 42, 48, 42, 43, 45, 48], [41, 42, 41, 47, 45, 44, 43, 42]], bell: [69, 70, 75], bellRate: 0.15, drum: true },
    ruin: { tempo: 50, bars: [[33, 34], [33, 39], [32, 33], [33, 38]], bell: [70, 71, 75], bellRate: 0.15, drum: false },
  };
  var wantBgm = null, curBgm = null, bgmTimer = null, bgmNodes = [], nextT = 0, step = 0;
  function startBgm(name) {
    stopBgmNodes();
    curBgm = name;
    if (!enabled || !ensure() || ctx.state !== "running") { curBgm = null; return; }
    var song = BGM[name];
    var beat = 60 / song.tempo;
    // 持続音（探索・タイトル・時間切れの後）
    if (!song.drum) {
      var pad = ctx.createGain(); pad.gain.value = 0.0001; pad.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 2);
      var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
      pad.connect(lp); lp.connect(bgmBus);
      [0, 7].forEach(function (iv, k) {
        var o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = NOTE(song.bars[0][0] - 12 + iv); o.detune.value = k ? 6 : -6;
        o.connect(pad); o.start(); bgmNodes.push(o);
      });
      bgmNodes.push(pad);
      bgmNodes.padOsc = bgmNodes.slice(0, 2);
    }
    nextT = ctx.currentTime + 0.1; step = 0;
    var tick = function () {
      if (curBgm !== name) return;
      while (nextT < ctx.currentTime + 0.3) {
        var bars = song.bars, per = song.drum ? 8 : 2, bar = bars[Math.floor(step / per) % bars.length], n = bar[step % per];
        var dur = song.drum ? beat / 2 : beat * 2;
        if (song.drum) {
          tone("sawtooth", NOTE(n - 12), nextT, dur * 0.9, 0.35, bgmBus);
          if (step % 2 === 0) noise(nextT, 0.08, step % 4 === 0 ? 0.6 : 0.3, step % 4 === 0 ? 120 : 3000, 0.8, bgmBus);
        } else if (bgmNodes.padOsc) {
          // 持続音の根音を、小節ごとにゆっくり移す
          bgmNodes.padOsc[0].frequency.setTargetAtTime(NOTE(n - 12), nextT, 0.8);
          bgmNodes.padOsc[1].frequency.setTargetAtTime(NOTE(n - 5), nextT, 0.8);
        }
        if (Math.random() < song.bellRate) tone("triangle", NOTE(song.bell[Math.floor(Math.random() * song.bell.length)]), nextT, song.drum ? 0.3 : 1.6, song.drum ? 0.12 : 0.18, bgmBus);
        nextT += dur; step++;
      }
      bgmTimer = setTimeout(tick, 100);
    };
    tick();
  }
  function stopBgmNodes() {
    clearTimeout(bgmTimer);
    bgmNodes.forEach(function (n) { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) {} });
    bgmNodes = [];
    curBgm = null;
  }
  // 同じ曲なら鳴らし直さない
  function bgm(name) {
    wantBgm = name;
    if (curBgm === name) return;
    startBgm(name);
  }

  function setEnabled(on) {
    enabled = !!on;
    try { window.localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (e) {}
    if (master) master.gain.value = enabled ? 1 : 0;
    if (enabled) { unlock(); if (wantBgm) startBgm(wantBgm); } else stopBgmNodes();
  }
  function isEnabled() { return enabled; }
  // ON/OFFの切り替えボタン（タイトルとメニューで使う）
  function toggleButton(cls) {
    var b = document.createElement("button");
    b.className = cls || "skill-btn";
    var label = function () { b.textContent = "音：" + (enabled ? "ON" : "OFF"); };
    label();
    b.onclick = function () { setEnabled(!enabled); label(); };
    return b;
  }

  return { play: play, battleFx: battleFx, bgm: bgm, setEnabled: setEnabled, isEnabled: isEnabled, toggleButton: toggleButton };
})();
