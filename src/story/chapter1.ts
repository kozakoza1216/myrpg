import type { Beat } from "./types";
import { ASH_RAT, KAGARI, STRAGGLER_BANDIT } from "../data/enemies";
import type { EnemyDef } from "../data/enemies";

// イベント戦専用。セオ単独では勝てない設計（攻略チャート①⑥）。
const TZELF_AMBUSH: EnemyDef = {
  id: "tzelf_ambush",
  name: "赤い鳥人",
  stats: { hp: 90, atk: 50, def: 22, spd: 55, mag: 30, spir: 28, tech: 52, luck: 25 },
  skillIds: ["bandit_strike", "bandit_rush"],
};

export const chapter1Beats: Beat[] = [
  { kind: "sceneHeader", id: "start", label: "第一章　灰縁（はいべり）の集落" },
  {
    kind: "narration",
    text: "人工天井の裂け目から薄暮が差し込む。二つに割れた月が、いつまでも同じ高さで止まっている。竜の脅威圏の縁に築かれた小さな集落――灰縁。",
  },
  { kind: "sceneHeader", label: "セオの住居" },
  { kind: "dialogue", speaker: "ミラ", text: "セオ、起きて。今日は「くじ」の日でしょ。寝坊したら承知しないから。" },
  {
    kind: "choice",
    prompt: "（ミラに何と返す？　――何を選んでも、話の筋は変わらない）",
    options: [
      { label: "「わかってる。今起きる」", goto: "rise" },
      { label: "「……くじ、か」と呟く", goto: "rise" },
      { label: "何も言わず起き上がる", goto: "rise" },
    ],
  },
  { kind: "narration", id: "rise", text: "ミラは肩をすくめて、先に外へ出ていった。セオは身支度を整え、住居を出る。" },
  {
    kind: "narration",
    text: "棚には〈干し肉〉と〈古びた回復薬〉が置かれている。旅の前に、こういうものは持てるだけ持っておくものだ。",
  },
  { kind: "sceneHeader", label: "集落・井戸端" },
  {
    kind: "dialogue",
    speaker: "竜読みの老人",
    text: "竜には逆らえん。くじは絶対だ……お前さんも、いずれわかる。",
  },
  { kind: "narration", text: "集落の外れで、瓦礫の陰から灰色の毛並みが動いた。灰ネズミだ。腕試しには、ちょうどいい。" },
  {
    kind: "battle",
    battleId: "tutorial_rat",
    title: "灰ネズミとの戦い",
    enemies: [ASH_RAT],
    winGoto: "after_tutorial",
  },
  { kind: "narration", id: "after_tutorial", text: "たいした敵ではなかった。だが判定バトルの手応えは、確かに覚えた。" },

  { kind: "sceneHeader", label: "集落中央広場・くじ" },
  {
    kind: "narration",
    text: "招竜派の祭司カガリが、儀式めいた仕草で木札の箱を掲げる。集落中が息を呑んで見守る。",
  },
  { kind: "dialogue", speaker: "カガリ", text: "此度の供物は……セオ、お前だ。" },
  { kind: "narration", text: "どよめきが走る。連行しようとする信徒たちの手が伸びる――その時だった。" },
  { kind: "dialogue", speaker: "ミラ", text: "待って。……私が行く。" },
  { kind: "narration", text: "ミラが割って入り、信徒の手を自ら取った。止める間もなく、彼女は祭壇へ向けて連れ去られていく。" },
  { kind: "dialogue", speaker: "カガリ", text: "殊勝な心がけだ。竜もきっと喜ぶだろう。" },

  { kind: "sceneHeader", label: "集落長の家" },
  {
    kind: "choice",
    prompt: "集落長トキに詰め寄る。",
    options: [
      { label: "「ミラを取り戻しに行く」", goto: "tell_toki" },
      { label: "「見過ごせるわけがないだろう」", goto: "tell_toki" },
    ],
  },
  {
    kind: "narration",
    id: "tell_toki",
    text: "トキは長く沈黙した後、絞り出すように言った。",
  },
  {
    kind: "dialogue",
    speaker: "集落長トキ",
    text: "くじは絶対だ。逆らえば、集落ごと竜に潰される。……行くなら、二度と帰ってくるな。",
  },
  { kind: "narration", text: "追放。それが答えだった。家に戻ると、誰の仕業か〈携行食×3〉が黙って置かれていた。" },

  { kind: "sceneHeader", label: "集落の門" },
  {
    kind: "narration",
    text: "門を出ると、荒れ果てた広域の景色が広がった。目的地は〈招竜の祭壇〉。もう振り返る場所はない。",
  },
  {
    kind: "narration",
    text: "道中の廃区画で、はぐれ者らしい賊が一人、行く手を塞いだ。",
  },
  {
    kind: "battle",
    battleId: "road_bandit",
    title: "はぐれ賊",
    enemies: [STRAGGLER_BANDIT],
    winGoto: "after_bandit",
  },
  { kind: "narration", id: "after_bandit", text: "追い払った。祭壇へ続く隘路はもうすぐそこだ。" },

  { kind: "sceneHeader", label: "祭壇へ続く隘路" },
  {
    kind: "narration",
    text: "赤い羽を持つ鳥人が、前触れもなく道を塞いだ。絶滅したはずの種族が、目の前に立っている。素足のまま瓦礫を踏みしめ、鋭い目でセオを見据える。",
  },
  { kind: "dialogue", speaker: "赤い鳥人", text: "そこを通してもらう。お前に用はないが、邪魔なら退かす。" },
  {
    kind: "battle",
    id: "tzelf_fight",
    battleId: "tzelf_ambush",
    title: "赤い鳥人との死闘",
    enemies: [TZELF_AMBUSH],
    winGoto: "after_tzelf_fight",
    forceProceed: true,
  },
  {
    kind: "narration",
    id: "after_tzelf_fight",
    text: "セオは膝をつく。勝てる相手ではなかった。だが鳥人はとどめを刺さず、剣を収めた。",
  },
  { kind: "dialogue", speaker: "赤い鳥人", text: "……招竜派の祭壇に用があるのはこっちも同じだ。今は敵対する理由がないだけだ。" },
  {
    kind: "choice",
    prompt: "利害が一致した、ということらしい。",
    options: [
      { label: "「好都合だ」と手を貸す", goto: "team_up" },
      { label: "黙って頷く", goto: "team_up" },
    ],
  },
  { kind: "narration", id: "team_up", text: "こうして二人は、目的の違う共闘を始めた。" },
  {
    kind: "dialogue",
    speaker: "赤い鳥人",
    text: "……名か。持ったことがない。お前たちの数字でいうと012、だったか。",
  },
  { kind: "narration", text: "ドイツ語で12――ツェルフ。誰からともなく、その呼び名が定まった。" },
  { kind: "joinParty", characterId: "tzelf" },

  { kind: "sceneHeader", label: "招竜の祭壇" },
  { kind: "narration", text: "祭壇の奥、儀式の間近くで信徒たちが最後の詠唱を始めていた。カガリがミラを見下ろしている。" },
  { kind: "dialogue", speaker: "カガリ", text: "此度の供物は、思いのほか良い声で鳴きそうだ。" },
  {
    kind: "battle",
    id: "kagari_fight",
    battleId: "kagari",
    title: "祭司カガリ",
    enemies: [KAGARI],
    winGoto: "after_kagari",
  },
  { kind: "narration", id: "after_kagari", text: "カガリは崩れ落ちた。儀式は止まり、ミラの拘束が解かれる。" },
  { kind: "dialogue", speaker: "ミラ", text: "……なんで来たの、セオ。" },
  {
    kind: "choice",
    prompt: "ミラの問いに答える。",
    options: [
      { label: "「置いて生きろって？　できるわけないだろ」", goto: "mira_join" },
      { label: "「決まってるだろ」とだけ言う", goto: "mira_join" },
    ],
  },
  { kind: "narration", id: "mira_join", text: "ミラは何か言いかけて、結局は小さく笑っただけだった。" },
  { kind: "joinParty", characterId: "mira" },

  { kind: "sceneHeader", label: "祭壇の外" },
  {
    kind: "narration",
    text: "奪還は成ったが、儀式の余波か、遠くの空に巨大な影がよぎった。灰色の竜だ。誰も、あれには手を出せない。",
  },
  { kind: "dialogue", speaker: "ツェルフ", text: "竜は殺せない。挑んだ奴は皆、灰になった。" },
  { kind: "narration", text: "世界が、静かに詰んでいるという事実だけが突きつけられた。" },

  { kind: "sceneHeader", label: "灰縁の集落・門" },
  { kind: "narration", text: "帰り着いた門は、開かなかった。" },
  { kind: "dialogue", speaker: "集落長トキ", text: "帰ってくるなと言ったはずだ。" },
  { kind: "dialogue", speaker: "ミラ", text: "上等じゃない。こっちから願い下げよ。" },
  {
    kind: "narration",
    text: "奪還は成功したのに、帰る場所を失った。帰れない三人が、旅を続ける理由だけがここに残った。",
  },
  { kind: "chapterEnd", to: "chapter1_end" },
];
