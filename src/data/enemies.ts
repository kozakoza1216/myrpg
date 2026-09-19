import type { Stats } from "../engine/types";

export interface EnemyDef {
  id: string;
  name: string;
  stats: Stats;
  skillIds: string[];
  size?: "normal" | "giant";
  isBoss?: boolean;
}

// チュートリアル用の雑魚（章1①・仮称）。enemies.md には存在しない導入専用の弱敵。
export const ASH_RAT: EnemyDef = {
  id: "ash_rat",
  name: "灰ネズミ",
  stats: { hp: 22, atk: 8, def: 4, spd: 10, mag: 0, spir: 6, tech: 8, luck: 10 },
  skillIds: ["mob_bite"],
};

// 第一章・セオ単独時の道中専用。enemies.md「賊」は3〜4体パーティ前提の数値のため、
// ソロのLv1が受けると即死する。素性の劣るはぐれ者として単体・弱体版を別途用意する。
export const STRAGGLER_BANDIT: EnemyDef = {
  id: "straggler_bandit",
  name: "はぐれ賊",
  stats: { hp: 30, atk: 14, def: 8, spd: 14, mag: 0, spir: 8, tech: 14, luck: 10 },
  skillIds: ["bandit_strike"],
};

// enemies.md「1. 賊」通常種（3〜4体パーティ前提）
export const BANDIT: EnemyDef = {
  id: "bandit",
  name: "賊",
  stats: { hp: 158, atk: 58, def: 27, spd: 63, mag: 0, spir: 27, tech: 60, luck: 42 },
  skillIds: ["bandit_strike", "bandit_rush"],
};

// bosses.md「カガリ（招竜の祭壇・第一章）」
export const KAGARI: EnemyDef = {
  id: "kagari",
  name: "カガリ",
  isBoss: true,
  stats: { hp: 300, atk: 60, def: 32, spd: 55, mag: 40, spir: 32, tech: 62, luck: 50 },
  skillIds: ["kagari_staff", "kagari_chant", "kagari_bind", "kagari_offering"],
};
