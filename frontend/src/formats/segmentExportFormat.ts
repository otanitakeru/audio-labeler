import type { LabeledRange } from "./labelFormat";

// 切り出す区間に、wavのファイル名(拡張子を除く)を兼ねるidを付けたもの
export type NamedRange = LabeledRange & { name: string };

// 開始時刻順に1から番号を振る。ゼロ埋めするときは、ファイル名の並び順が番号順と食い違わないよう、
// 最大の番号(件数)の桁数にそろえる(10〜99件なら01、100〜999件なら001)
export function nameRanges(ranges: LabeledRange[], zeroPad: boolean): NamedRange[] {
  const digits = zeroPad ? String(ranges.length).length : 0;
  return [...ranges]
    .sort((a, b) => a.startSec - b.startSec)
    .map((r, index) => ({ ...r, name: String(index + 1).padStart(digits, "0") }));
}

function delimiterText(delimiter: "tab" | "space"): string {
  return delimiter === "tab" ? "\t" : " ";
}

// segment.txt: id・開始秒・終了秒。秒数はラベルファイルと同じくNumber→文字列の標準変換をそのまま使う(PLAN.md 3章)
export function serializeSegmentList(ranges: NamedRange[], delimiter: "tab" | "space"): string {
  const d = delimiterText(delimiter);
  return ranges.map((r) => `${r.name}${d}${r.startSec}${d}${r.endSec}\n`).join("");
}

// text.txt: id・ラベル。ラベルは最後の列なので、スペース区切りでもラベル中の空白はエスケープしない(最初の区切りでidと分けられる)。
// ラベルが空の区間はidだけの行にする。行末に区切りが残ると、後段のツールでエラーになることがあるため
export function serializeTextList(ranges: NamedRange[], delimiter: "tab" | "space"): string {
  const d = delimiterText(delimiter);
  return ranges.map((r) => (r.label === "" ? `${r.name}\n` : `${r.name}${d}${r.label}\n`)).join("");
}
