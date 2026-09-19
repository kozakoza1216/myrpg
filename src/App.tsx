import { useRef, useState } from "react";
import "./App.css";
import StoryScreen from "./story/StoryScreen";
import { chapter1Beats } from "./story/chapter1";
import { SEO_LV1, TZELF_LV1 } from "./data/characters";
import { createCombatant } from "./engine/battle";
import type { Combatant } from "./engine/types";

type Screen = "title" | "chapter1" | "chapter1_end";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [companions, setCompanions] = useState<string[]>([]);
  const partyRef = useRef<Combatant[]>([
    createCombatant("セオ", SEO_LV1.stats, SEO_LV1.skillIds, false),
  ]);
  const [, forceRender] = useState(0);

  const handleJoinParty = (characterId: "tzelf" | "mira") => {
    if (characterId === "tzelf") {
      partyRef.current = [
        ...partyRef.current,
        createCombatant("ツェルフ", TZELF_LV1.stats, TZELF_LV1.skillIds, false),
      ];
      forceRender((n) => n + 1);
    } else {
      setCompanions((prev) => (prev.includes("mira") ? prev : [...prev, "mira"]));
    }
  };

  if (screen === "title") {
    return (
      <div className="title-screen">
        <h1>暗黒時代RPG</h1>
        <p className="subtitle">フウィム宇宙・プレイアブルプロトタイプ</p>
        <button className="primary-btn" onClick={() => setScreen("chapter1")}>
          第一章「ミラ奪還〜追放」を始める
        </button>
        <p className="footnote">
          判定バトルシステム(攻撃/突破/防御/回避/カウンター)を実装した縦切り版です。
        </p>
      </div>
    );
  }

  if (screen === "chapter1_end") {
    return (
      <div className="title-screen">
        <h2>第一章　― Keep your head down. への序章 ―</h2>
        <p>
          帰る場所を失った三人が、旅を続ける。ツェルフの目的に同行する第二章は準備中です。
        </p>
        <p className="footnote">
          同行者：{["ツェルフ", ...(companions.includes("mira") ? ["ミラ（非戦闘）"] : [])].join("・")}
        </p>
        <button className="primary-btn" onClick={() => window.location.reload()}>
          タイトルに戻る
        </button>
      </div>
    );
  }

  return (
    <StoryScreen
      beats={chapter1Beats}
      party={partyRef.current}
      onJoinParty={handleJoinParty}
      onChapterEnd={(to) => setScreen(to === "chapter1_end" ? "chapter1_end" : "title")}
    />
  );
}
