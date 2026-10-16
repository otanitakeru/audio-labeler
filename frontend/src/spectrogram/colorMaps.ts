import type { SpectrogramColorMap } from "../types";

// 弱い順に並べた色。元の表から取り出した色の間をつないで、256段階の表にする(PLAN.md 5章)
const COLOR_STOPS: Record<SpectrogramColorMap, string[]> = {
  // 弱いほど白、強いほど黒。画面の配色を灰色と黒にそろえたいとき用
  gray: ["#ffffff", "#000000"],
  // wavesurferのスペクトログラムのプラグインの既定
  roseus: ["#010101", "#001e3b", "#372586", "#8316a1", "#c32884", "#ed5757", "#fc9449", "#eed293", "#fefbf9"],
  // matplotlibの既定
  viridis: [
    "#440154",
    "#482878",
    "#3e4989",
    "#31688e",
    "#26828e",
    "#1f9e89",
    "#35b779",
    "#6ece58",
    "#b5de2b",
    "#fde725",
  ],
};

function parseHex(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

// 強さ(0が最も弱く、255が最も強い)ごとの色を、R・G・Bの順に並べた表
export function createColorTable(colorMap: SpectrogramColorMap): Uint8ClampedArray {
  const stops = COLOR_STOPS[colorMap].map(parseHex);
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const position = (i / 255) * (stops.length - 1);
    const lower = Math.min(Math.floor(position), stops.length - 2);
    const weight = position - lower;
    for (let c = 0; c < 3; c++) {
      table[i * 3 + c] = Math.round(stops[lower][c] * (1 - weight) + stops[lower + 1][c] * weight);
    }
  }
  return table;
}
