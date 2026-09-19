import { useEffect, useMemo, useRef, useState } from "react";
import type { Beat } from "./types";
import type { Combatant } from "../engine/types";
import BattleScreen from "../components/BattleScreen";
import "./StoryScreen.css";

export interface StoryScreenProps {
  beats: Beat[];
  party: Combatant[];
  onJoinParty: (characterId: "tzelf" | "mira") => void;
  onChapterEnd: (to: string) => void;
}

export default function StoryScreen({ beats, party, onJoinParty, onChapterEnd }: StoryScreenProps) {
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    beats.forEach((b, i) => {
      if (b.id) map.set(b.id, i);
    });
    return map;
  }, [beats]);

  const resolve = (target: string): number => {
    const byId = idToIndex.get(target);
    if (byId !== undefined) return byId;
    const asIndex = Number(target);
    if (!Number.isNaN(asIndex)) return asIndex;
    throw new Error(`unknown story target: ${target}`);
  };

  const [index, setIndex] = useState(0);
  const [battleKey, setBattleKey] = useState(0);
  const joinedRef = useRef<Set<string>>(new Set());

  const beat = beats[index];

  const advance = () => setIndex((i) => Math.min(i + 1, beats.length - 1));

  useEffect(() => {
    if (!beat) return;
    if (beat.kind === "goto") {
      setIndex(resolve(beat.to));
    } else if (beat.kind === "joinParty") {
      if (!joinedRef.current.has(beat.characterId)) {
        joinedRef.current.add(beat.characterId);
        onJoinParty(beat.characterId);
      }
      advance();
    } else if (beat.kind === "chapterEnd") {
      onChapterEnd(beat.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!beat) return null;

  if (beat.kind === "battle") {
    return (
      <BattleScreen
        key={battleKey}
        title={beat.title}
        party={party}
        enemyDefs={beat.enemies}
        onEnd={(result) => {
          if (result === "victory" || beat.forceProceed) {
            setIndex(resolve(beat.winGoto));
          } else {
            party.forEach((p) => {
              p.hp = p.maxHp;
              p.mp = p.maxMp;
              p.defeated = false;
            });
            setBattleKey((k) => k + 1);
          }
        }}
      />
    );
  }

  return (
    <div className="story-screen">
      {beat.kind === "sceneHeader" && (
        <div className="scene-header" onClick={advance}>
          <div className="scene-header-label">{beat.label}</div>
          <div className="story-hint">（クリックで進む）</div>
        </div>
      )}

      {beat.kind === "narration" && (
        <div className="story-box narration" onClick={advance}>
          <p>{beat.text}</p>
          <div className="story-hint">▼</div>
        </div>
      )}

      {beat.kind === "dialogue" && (
        <div className="story-box dialogue" onClick={advance}>
          <div className="speaker">{beat.speaker}</div>
          <p>{beat.text}</p>
          <div className="story-hint">▼</div>
        </div>
      )}

      {beat.kind === "choice" && (
        <div className="story-box choice">
          {beat.prompt && <p className="choice-prompt">{beat.prompt}</p>}
          <div className="choice-options">
            {beat.options.map((opt, i) => (
              <button key={i} onClick={() => setIndex(resolve(opt.goto))}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
