import type { Stats } from "../engine/types";

// 「全キャラステータス一覧」レベル別ステータス早見表 Lv1 準拠。
// HPの実値は表の値×4（PLAN §1-1）。他ステータスは%値をそのまま使用。

export interface CharacterDef {
  id: string;
  name: string;
  stats: Stats;
  skillIds: string[];
}

export const SEO_LV1: CharacterDef = {
  id: "seo",
  name: "セオ",
  stats: {
    hp: 13 * 4,
    atk: 10,
    def: 12,
    spd: 15,
    mag: 13,
    spir: 15,
    tech: 12,
    luck: 14,
  },
  skillIds: ["normal_attack", "step_in"],
};

export const TZELF_LV1: CharacterDef = {
  id: "tzelf",
  name: "ツェルフ",
  stats: {
    hp: 30 * 4,
    atk: 55,
    def: 25,
    spd: 60,
    mag: 45,
    spir: 35,
    tech: 58,
    luck: 20,
  },
  skillIds: ["normal_attack", "double_slash", "power_strike", "step_in"],
};
