// SVGピクトグラム描画（PLAN.md §2 準拠）。丸（頭）＋三角（胴体）の抽象人型。
window.RPG = window.RPG || {};

RPG.Picto = (function () {
  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // character: { picto:{bodyColor,headColor,beakColor,isAnimal}, isBirdPerson, birdType }
  // faction: 'ally' | 'enemy'
  // state: { defeated, selected, size }
  function renderPicto(character, faction, state) {
    state = state || {};
    var size = state.size || 1;
    var W = 72 * size, H = 96 * size;
    var svg = el("svg", { viewBox: "0 0 72 96", width: W, height: H, class: "picto" });

    var strokeColor = faction === "enemy" ? "#c04030" : "#3a6bab";
    var p = character.picto || {};
    var bodyColor = p.bodyColor || "#888";
    var headColor = p.headColor || "#ccc";

    var group = el("g", { class: "picto-figure" });
    if (state.defeated) {
      group.setAttribute("opacity", "0.35");
      group.setAttribute("transform", "translate(36,80) rotate(90) translate(-36,-48)");
    }
    if (state.selected) {
      var ring = el("circle", { cx: 36, cy: 26, r: 22, fill: "none", stroke: "#f0c860", "stroke-width": 2, class: "select-ring" });
      group.appendChild(ring);
    }

    // 梟系：腕そのものが翼（頭脇の翼は描かない）。それ以外の鳥人：頭脇に翼。
    var isOwl = character.isBirdPerson && character.birdType === "owl";
    var isHawkLike = character.isBirdPerson && !isOwl;

    // 胴体（下広がりの三角形）／梟系は左右に翼状の腕を伸ばす
    var bodyPoints = isOwl
      ? "36,40 8,86 12,60 60,60 64,86"
      : "36,40 14,86 58,86";
    var body = el("polygon", { points: bodyPoints, fill: bodyColor, stroke: strokeColor, "stroke-width": 2 });
    group.appendChild(body);

    // 頭
    var head = el("circle", { cx: 36, cy: 26, r: 20, fill: headColor, stroke: strokeColor, "stroke-width": 2 });
    group.appendChild(head);

    if (character.isBirdPerson) {
      // 嘴
      var beak = el("polygon", {
        points: "36,26 50,22 36,34",
        fill: p.beakColor || "#e0b040",
      });
      group.appendChild(beak);

      if (isHawkLike) {
        var wingL = el("polygon", { points: "16,20 2,12 16,32", fill: bodyColor, stroke: strokeColor, "stroke-width": 1.5 });
        var wingR = el("polygon", { points: "56,20 70,12 56,32", fill: bodyColor, stroke: strokeColor, "stroke-width": 1.5 });
        group.appendChild(wingL);
        group.appendChild(wingR);
      } else {
        // 梟系：頭頂の羽角（一対）
        var hornL = el("polygon", { points: "26,10 22,-4 32,8", fill: headColor, stroke: strokeColor, "stroke-width": 1.5 });
        var hornR = el("polygon", { points: "46,10 50,-4 40,8", fill: headColor, stroke: strokeColor, "stroke-width": 1.5 });
        group.appendChild(hornL);
        group.appendChild(hornR);
      }
    }

    if (state.statusIcon) {
      var icon = el("text", { x: 36, y: 4, "text-anchor": "middle", "font-size": 14, fill: "#f0d060" });
      icon.textContent = state.statusIcon;
      group.appendChild(icon);
    }

    svg.appendChild(group);
    return svg;
  }

  // 灰色竜専用：人型ロジックと完全に分離した作り込みSVG（PLAN.md §2-4）
  function renderDragon(state) {
    state = state || {};
    var svg = el("svg", { viewBox: "0 0 240 180", width: 240, height: 180, class: "picto-dragon" });
    var g = el("g", {});

    var hpRatio = state.hpRatio === undefined ? 1 : state.hpRatio;
    var baseGray = hpRatio > 0.3 ? "#8a8a8a" : "#5a5654";

    // 尾
    g.appendChild(el("path", { d: "M20,150 Q60,170 90,140 Q70,130 60,120 Q35,130 20,150 Z", fill: baseGray, opacity: 0.9 }));
    // 翼（左右）
    g.appendChild(el("path", { d: "M110,90 L40,40 L70,95 L40,80 L95,120 Z", fill: baseGray, opacity: 0.75 }));
    g.appendChild(el("path", { d: "M140,90 L210,40 L180,95 L210,80 L155,120 Z", fill: baseGray, opacity: 0.75 }));
    // 胴
    g.appendChild(el("ellipse", { cx: 125, cy: 110, rx: 55, ry: 34, fill: baseGray }));
    // 首＋頭
    g.appendChild(el("path", { d: "M100,90 Q90,55 115,35 Q140,20 160,35 Q145,35 138,48 Q150,50 155,62 Q135,58 125,70 Q118,82 120,100 Z", fill: baseGray }));
    // 目
    g.appendChild(el("circle", { cx: 148, cy: 40, r: 3.2, fill: hpRatio < 0.3 ? "#e04030" : "#e8d090" }));
    // 鱗ディテール
    for (var i = 0; i < 6; i++) {
      g.appendChild(el("path", {
        d: "M" + (90 + i * 16) + ",100 q6,-8 12,0",
        stroke: "#5a5654", "stroke-width": 1.5, fill: "none", opacity: 0.6,
      }));
    }
    g.setAttribute("opacity", String(0.55 + 0.45 * hpRatio));
    svg.appendChild(g);
    return svg;
  }

  return { renderPicto: renderPicto, renderDragon: renderDragon };
})();
