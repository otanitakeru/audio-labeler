import type { Segment } from "../types";

// ファイルに書かれる情報だけを持つ区間。id/sourceはアプリ内の状態でのみ使うため含めない
export type LabeledRange = Pick<Segment, "startSec" | "endSec" | "label">;

export class LabelFormatError extends Error {}

// タブ・改行は出力フォーマット(タブ区切り)を壊すため半角スペースに置き換える。
// 手入力(contentEditableへの貼り付けで混入しうる)と文字起こしの結果の両方で、区間に入れる前に必ず通す
export function sanitizeLabel(text: string): string {
  return text.replace(/[\t\n\r]/g, " ");
}

export function parseLabels(text: string): LabeledRange[] {
  const ranges: LabeledRange[] = [];
  text.split("\n").forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") return;

    const columns = line.split("\t");
    if (columns.length !== 3) {
      throw new LabelFormatError(`${lineNumber}行目: 開始秒・終了秒・ラベルの3列をタブ区切りで書いてください`);
    }
    const [startText, endText, label] = columns;
    const startSec = parseSec(startText);
    const endSec = parseSec(endText);
    if (startSec === null || endSec === null) {
      throw new LabelFormatError(`${lineNumber}行目: 開始秒・終了秒が数値ではありません`);
    }
    ranges.push({ startSec, endSec, label });
  });
  return ranges;
}

// Number("")は0になるため、空欄を数値として通さないよう明示的に弾く
function parseSec(text: string): number | null {
  if (text.trim() === "") return null;
  const sec = Number(text);
  return Number.isFinite(sec) ? sec : null;
}

// 秒数はNumber→文字列の標準変換をそのまま使う(PLAN.md 3章)。元の値に戻せる最短の桁数になり、桁を切り詰めない
export function serializeLabels(ranges: LabeledRange[]): string {
  return [...ranges]
    .sort((a, b) => a.startSec - b.startSec)
    .map((r) => `${r.startSec}\t${r.endSec}\t${r.label}\n`)
    .join("");
}
