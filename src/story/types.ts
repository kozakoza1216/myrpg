import type { EnemyDef } from "../data/enemies";

export interface ChoiceOption {
  label: string;
  goto: string;
}

export type Beat =
  | { kind: "narration"; id?: string; text: string }
  | { kind: "dialogue"; id?: string; speaker: string; text: string }
  | { kind: "choice"; id?: string; prompt?: string; options: ChoiceOption[] }
  | {
      kind: "battle";
      id?: string;
      battleId: string;
      title: string;
      enemies: EnemyDef[];
      winGoto: string;
      /** true の場合、敗北してもwinGotoへ進む（イベント戦） */
      forceProceed?: boolean;
    }
  | { kind: "goto"; id?: string; to: string }
  | { kind: "joinParty"; id?: string; characterId: "tzelf" | "mira" }
  | { kind: "sceneHeader"; id?: string; label: string }
  | { kind: "chapterEnd"; id?: string; to: string };
