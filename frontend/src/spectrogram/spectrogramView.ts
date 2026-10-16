import type WaveSurfer from "wavesurfer.js";
import { createColorTable } from "./colorMaps";
import { LEVEL_STEP_DB, type SpectrogramData } from "./computeSpectrogram";
import type { SpectrogramColorMap } from "../types";

// 最も強い色にする強さを、音声全体の最大値からどれだけ下にするか(dB)と、そこから最も弱い色にするまでの幅(dB)
const STRONGEST_BELOW_MAX_DB = 10;
const DYNAMIC_RANGE_DB = 50;
// 描いたキャンバスがこれより増えたら捨てて描き直す(wavesurferの波形と同じく、長い音声をスクロールしてもメモリを使い続けないため)
const MAX_DRAWN_CANVASES = 10;
// 拡大縮小・スクロールが止まってから、前後の画面ぶんを描くまでの待ち時間(ms)。続けて拡大縮小している間に描いても、
// 次の段階ですぐ捨てることになるため
const NEIGHBOR_DRAW_DELAY_MS = 150;

export type SpectrogramView = {
  // 計算が終わったら渡す。渡すまでは何も描かない
  setData: (data: SpectrogramData) => void;
  destroy: () => void;
};

// スペクトログラムの表示を、wavesurferの波形の描画領域の直下に置く(wrapperの末尾に足すと、ラベル領域の余白の上に入る)。
// 描き方は波形と同じにする。画面の幅ごとのキャンバスを見えている位置のまわりだけ描き、拡大率が変わったら描き直す(PLAN.md 5章)
export function createSpectrogramView(
  wavesurfer: WaveSurfer,
  height: number,
  colorMap: SpectrogramColorMap,
): SpectrogramView {
  const container = document.createElement("div");
  container.style.cssText = `position:relative;height:${height}px;overflow:hidden`;
  wavesurfer.getWrapper().appendChild(container);

  let data: SpectrogramData | null = null;
  const colorTable = createColorTable(colorMap);
  // 強さ(0〜255)ごとの色(R・G・Bの順)。音声全体の最大値に合わせて、setDataで作る
  const colorByLevel = new Uint8ClampedArray(256 * 3);
  // 描いたキャンバス(画面の幅ごとの番号で引く)と、そのときの1枚の幅
  const drawnCanvases = new Map<number, HTMLCanvasElement>();
  let canvasWidth = 0;

  const clearCanvases = () => {
    drawnCanvases.forEach((canvas) => canvas.remove());
    drawnCanvases.clear();
  };

  const drawCanvas = (index: number, totalWidth: number) => {
    if (!data) return;
    const left = index * canvasWidth;
    const width = Math.min(canvasWidth, totalWidth - left);
    if (width <= 0) return;
    // 縦は高精細な画面の画素の細かさで描き、横はCSSの1pxを1画素で描く(ブラウザが引き伸ばす)。横は1pxに入る時刻が
    // 多くても数個で、画面の画素の細かさで描いても見た目はほとんど変わらず、描く量だけが倍になるため(PLAN.md 5章)
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height * (window.devicePixelRatio || 1));
    canvas.style.cssText = `position:absolute;top:0;left:${left}px;width:${width}px;height:${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(canvas.width, canvas.height);
    const secPerPixel = wavesurfer.getDuration() / totalWidth;
    paint(image, data, colorByLevel, left * secPerPixel, secPerPixel);
    context.putImageData(image, 0, 0);
    container.appendChild(canvas);
    drawnCanvases.set(index, canvas);
  };

  // 見えている範囲を描く。withNeighborsなら前後1画面ぶんも描く(スクロールしたときにすぐ見えるように)
  const drawVisible = (withNeighbors: boolean) => {
    const totalWidth = wavesurfer.getWrapper().clientWidth;
    if (!data || totalWidth <= 0 || canvasWidth <= 0) return;
    if (drawnCanvases.size > MAX_DRAWN_CANVASES) clearCanvases();
    const scroll = wavesurfer.getScroll();
    const margin = withNeighbors ? canvasWidth : 0;
    const first = Math.max(0, Math.floor((scroll - margin) / canvasWidth));
    const last = Math.min(
      Math.ceil(totalWidth / canvasWidth) - 1,
      Math.floor((scroll + canvasWidth + margin) / canvasWidth),
    );
    for (let index = first; index <= last; index++) {
      if (!drawnCanvases.has(index)) drawCanvas(index, totalWidth);
    }
  };

  // 前後の画面ぶんは、拡大縮小・スクロールが止まってから描く(スクロールしたときにすぐ見えるように)
  let neighborTimer = 0;
  const scheduleDrawNeighbors = () => {
    window.clearTimeout(neighborTimer);
    neighborTimer = window.setTimeout(() => drawVisible(true), NEIGHBOR_DRAW_DELAY_MS);
  };

  // スクロール中は、見えている範囲を1フレームに1回だけ描く
  let frameRequest = 0;
  const onScroll = () => {
    scheduleDrawNeighbors();
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(() => {
      frameRequest = 0;
      drawVisible(false);
    });
  };

  const redraw = () => {
    clearCanvases();
    canvasWidth = wavesurfer.getWidth();
    drawVisible(false);
    scheduleDrawNeighbors();
  };
  // 拡大率・表示の幅が変わったときは、波形を描き直し終えて全体の幅が決まってから描き直す
  const unsubscribeRedraw = wavesurfer.on("redrawcomplete", redraw);
  const unsubscribeScroll = wavesurfer.on("scroll", onScroll);

  return {
    setData: (next) => {
      data = next;
      const strongestLevel = next.maxLevel - STRONGEST_BELOW_MAX_DB / LEVEL_STEP_DB;
      const weakestLevel = strongestLevel - DYNAMIC_RANGE_DB / LEVEL_STEP_DB;
      for (let level = 0; level < 256; level++) {
        // 0は計算の下限(無音)なので、無音だけの音声でも最も強い色にならないよう常に最も弱い色にする
        const strength =
          level === 0 ? 0 : Math.min(1, Math.max(0, (level - weakestLevel) / (strongestLevel - weakestLevel)));
        const color = Math.round(strength * 255) * 3;
        colorByLevel.set(colorTable.subarray(color, color + 3), level * 3);
      }
      redraw();
    },
    destroy: () => {
      cancelAnimationFrame(frameRequest);
      window.clearTimeout(neighborTimer);
      unsubscribeRedraw();
      unsubscribeScroll();
      clearCanvases();
      container.remove();
    },
  };
}

// 1枚のキャンバスぶんの画素を塗る。startSecはキャンバスの左端の時刻、secPerPixelは(キャンバスの)1画素あたりの秒数
function paint(
  image: ImageData,
  data: SpectrogramData,
  colorByLevel: Uint8ClampedArray,
  startSec: number,
  secPerPixel: number,
): void {
  const { width, height, data: pixels } = image;
  const { levels, frameCount, bandCount, firstFrameSec, hopSec } = data;

  // 行ごとに、どの帯の値を使うか。帯も行もMelの目盛りで等間隔なので、高さの割合で対応づける。
  // 1行に複数の帯が入るときはその中で最も強い値を使い、1つも入らないときは行の中央をはさむ2つの帯の値をつなぐ
  const firstBands = new Uint16Array(height);
  const lastBands = new Uint16Array(height);
  const upperWeights = new Float32Array(height);
  const takesMax = new Uint8Array(height);
  const clampBand = (band: number) => Math.min(bandCount - 1, Math.max(0, band));
  for (let y = 0; y < height; y++) {
    const lowBand = (1 - (y + 1) / height) * bandCount;
    const highBand = (1 - y / height) * bandCount;
    if (Math.ceil(highBand) - Math.floor(lowBand) > 1) {
      takesMax[y] = 1;
      firstBands[y] = clampBand(Math.floor(lowBand));
      lastBands[y] = clampBand(Math.ceil(highBand) - 1);
    } else {
      // 帯の値は帯の中央の周波数のものなので、帯の番号から0.5を引いた位置で前後の帯をつなぐ
      const position = Math.min(bandCount - 1, Math.max(0, (lowBand + highBand) / 2 - 0.5));
      firstBands[y] = clampBand(Math.floor(position));
      lastBands[y] = clampBand(Math.floor(position) + 1);
      upperWeights[y] = position - Math.floor(position);
    }
  }

  // 窓より短い音声はフレームがないため、無音と同じ色で塗る
  const column = new Float32Array(bandCount);
  const clampFrame = (frame: number) => Math.min(frameCount - 1, Math.max(0, frame));
  for (let x = 0; x < width; x++) {
    const sec = startSec + x * secPerPixel;
    // 窓の中心がこの画素の範囲に入るフレーム。複数あれば最も強い値を使う(縮小しても短い破裂音などが消えないように)。
    // 1つもなければ(拡大していて1フレームが何画素にもまたがるとき)、画素の中央をはさむ2つのフレームの値を、
    // 中央からの近さに応じてつなぐ(ブロック状に見えないように)
    const firstFrame = Math.ceil((sec - firstFrameSec) / hopSec);
    const endFrame = Math.ceil((sec + secPerPixel - firstFrameSec) / hopSec);
    if (frameCount === 0) {
      column.fill(0);
    } else if (endFrame > firstFrame) {
      column.fill(0);
      for (let frame = clampFrame(firstFrame); frame <= clampFrame(endFrame - 1); frame++) {
        const base = frame * bandCount;
        for (let b = 0; b < bandCount; b++) if (levels[base + b] > column[b]) column[b] = levels[base + b];
      }
    } else {
      const position = (sec + secPerPixel / 2 - firstFrameSec) / hopSec;
      const before = clampFrame(Math.floor(position)) * bandCount;
      const after = clampFrame(Math.floor(position) + 1) * bandCount;
      const weight = Math.min(1, Math.max(0, position - Math.floor(position)));
      for (let b = 0; b < bandCount; b++) {
        column[b] = levels[before + b] * (1 - weight) + levels[after + b] * weight;
      }
    }

    for (let y = 0; y < height; y++) {
      const first = firstBands[y];
      const last = lastBands[y];
      let level: number;
      if (takesMax[y]) {
        level = 0;
        for (let b = first; b <= last; b++) if (column[b] > level) level = column[b];
      } else {
        level = column[first] * (1 - upperWeights[y]) + column[last] * upperWeights[y];
      }
      const color = Math.round(level) * 3;
      const offset = (y * width + x) * 4;
      pixels[offset] = colorByLevel[color];
      pixels[offset + 1] = colorByLevel[color + 1];
      pixels[offset + 2] = colorByLevel[color + 2];
      pixels[offset + 3] = 255;
    }
  }
}
