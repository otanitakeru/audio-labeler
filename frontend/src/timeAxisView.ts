import type WaveSurfer from "wavesurfer.js";
import type { SpectrogramColorMap } from "./types";

// 全体波形とメイン波形の間に置く、時間の目盛りの帯の高さ(px)
export const TIME_AXIS_HEIGHT_PX = 20;
// 波形の上の補助線の色。波形の濃淡を読み取る邪魔にならないよう半透明の灰色にする
const GRID_LINE_COLOR = "rgba(156, 163, 175, 0.45)";
// スペクトログラムの上の補助線の色。Roseus・Viridisは弱いほど暗く、灰色の線は埋もれて見えないため、半透明の白にする。
// 灰色の表は弱いほど白いため、波形の上と同じ灰色にする
const SPECTROGRAM_GRID_LINE_COLORS: Record<SpectrogramColorMap, string> = {
  gray: GRID_LINE_COLOR,
  roseus: "rgba(255, 255, 255, 0.35)",
  viridis: "rgba(255, 255, 255, 0.35)",
};

// 目盛りの間隔の候補(秒)。拡大率に合わせ、隣の目盛りと MIN_TICK_GAP_PX 以上離れる最も細かいものを使う。
// 1分を超えると1・2・5の倍数より、分の区切り(15秒・30秒・1分…)の方が読みやすいため、候補を並べておく
const TICK_STEPS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];
// 「0:00.005」のような最も長い文字でも重ならない間隔
const MIN_TICK_GAP_PX = 70;

// 目盛りの間隔(秒)。pxPerSecは1秒あたりの幅(px)
function getTickStep(pxPerSec: number): number {
  return TICK_STEPS.find((step) => step * pxPerSec >= MIN_TICK_GAP_PX) ?? TICK_STEPS.at(-1)!;
}

// 目盛りの文字。再生時間の表示と同じ「分:秒」にし、間隔が1秒より細かいときは小数点以下を足す
function formatTick(sec: number, step: number): string {
  const decimals = Math.max(-Math.floor(Math.log10(step)), 0);
  // 間隔の倍数として計算した時刻の誤差(59.99999…など)で、分の繰り上がりがずれないよう先に丸める
  const rounded = Math.round(sec * 10 ** decimals) / 10 ** decimals;
  const minutes = Math.floor(rounded / 60);
  const seconds = (rounded - minutes * 60).toFixed(decimals);
  // 秒の整数部を2桁にそろえる(小数点以下があるときは、その分も含めた長さで埋める)
  return `${minutes}:${seconds.padStart(decimals > 0 ? decimals + 3 : 2, "0")}`;
}

export type TimeAxisView = {
  // 時間の目盛りの位置に縦の補助線を引くか
  setGridVisible: (visible: boolean) => void;
  // 縦の補助線を引く範囲(メイン波形+スペクトログラム)と、スペクトログラムの上の線の色を決める色の表
  setGridLayout: (mainWaveformHeight: number, spectrogramHeight: number, colorMap: SpectrogramColorMap) => void;
  destroy: () => void;
};

// 時間の目盛りと縦の補助線を、wavesurferの表示に合わせて描く。拡大率に合わせて間隔を変え、見えている範囲の分だけ置く
// (25分の音声を1秒5000pxまで拡大すると、全体に置いた場合は数十万本になるため)。
// 目盛りの帯は全体波形の直後(スクロールしない位置)に置き、スクロールに合わせて描き直す。
// 補助線は波形と一緒にスクロールするよう、波形全体の幅を持つwrapperの中に置く
export function createTimeAxisView(wavesurfer: WaveSurfer): TimeAxisView {
  const ruler = document.createElement("div");
  ruler.style.cssText = [
    "position:relative",
    `height:${TIME_AXIS_HEIGHT_PX}px`,
    "overflow:hidden",
    "font-size:12px",
    `line-height:${TIME_AXIS_HEIGHT_PX}px`,
    "font-variant-numeric:tabular-nums",
    "color:#9ca3af",
    "pointer-events:none",
  ].join(";");
  // wrapperの親(スクロールする要素)の直前に入れる。全体波形も同じ位置に先に入っているため、その直後になる
  wavesurfer.getWrapper().parentElement?.insertAdjacentElement("beforebegin", ruler);

  const grid = document.createElement("div");
  // 波形(再生済みの部分を描く要素はz-index:2)・スペクトログラムより手前、再生カーソル(z-index:5)より奥に置く
  grid.style.cssText = "position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none";
  wavesurfer.getWrapper().appendChild(grid);
  let isGridVisible = false;
  // 縦の補助線1本の背景。波形の部分とスペクトログラムの部分で色を変えるため、境目で切り替わるグラデーションにする
  let lineBackground = GRID_LINE_COLOR;

  const render = () => {
    const duration = wavesurfer.getDuration();
    const totalWidth = wavesurfer.getWrapper().clientWidth;
    if (duration <= 0 || totalWidth <= 0) {
      ruler.replaceChildren();
      grid.replaceChildren();
      return;
    }
    const pxPerSec = totalWidth / duration;
    const step = getTickStep(pxPerSec);
    const scroll = wavesurfer.getScroll();
    // 左端で目盛りの文字が途中から見える分も描くため、1つ手前から置く
    const first = Math.max(0, Math.floor(scroll / pxPerSec / step) - 1);
    const last = Math.min(Math.floor(duration / step), Math.ceil((scroll + wavesurfer.getWidth()) / pxPerSec / step));

    const labels: HTMLElement[] = [];
    const lines: HTMLElement[] = [];
    for (let i = first; i <= last; i++) {
      const sec = i * step;
      const x = sec * pxPerSec;
      const label = document.createElement("span");
      // 目盛りの位置に短い線を引き、文字はその右に置く
      label.style.cssText = `position:absolute;left:${x - scroll}px;bottom:0;height:100%;padding-left:3px;border-left:1px solid #d1d5db;white-space:nowrap`;
      label.textContent = formatTick(sec, step);
      labels.push(label);
      if (isGridVisible) {
        const line = document.createElement("div");
        line.style.cssText = `position:absolute;top:0;bottom:0;left:${x}px;width:1px;background:${lineBackground}`;
        lines.push(line);
      }
    }
    ruler.replaceChildren(...labels);
    grid.replaceChildren(...lines);
  };

  // 拡大率・表示の幅が変わったときは、波形を描き直し終えて全体の幅が決まってから描き直す
  const unsubscribeRedraw = wavesurfer.on("redrawcomplete", render);
  // 目盛りの帯は波形と一緒にスクロールしないため、遅れて見えないようスクロールのたびにすぐ描き直す(置くのは数十個)
  const unsubscribeScroll = wavesurfer.on("scroll", render);
  render();

  return {
    setGridVisible: (visible) => {
      isGridVisible = visible;
      render();
    },
    setGridLayout: (mainWaveformHeight, spectrogramHeight, colorMap) => {
      grid.style.height = `${mainWaveformHeight + spectrogramHeight}px`;
      const spectrogramColor = SPECTROGRAM_GRID_LINE_COLORS[colorMap];
      lineBackground =
        spectrogramHeight > 0
          ? `linear-gradient(${GRID_LINE_COLOR} ${mainWaveformHeight}px, ${spectrogramColor} ${mainWaveformHeight}px)`
          : GRID_LINE_COLOR;
      render();
    },
    destroy: () => {
      unsubscribeRedraw();
      unsubscribeScroll();
      ruler.remove();
      grid.remove();
    },
  };
}
