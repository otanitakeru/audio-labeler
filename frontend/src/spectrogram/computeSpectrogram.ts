import { getMaxDisplayFrequency, ratioToFrequency } from "./frequencyScale";

// 窓の長さに対する、計算する間隔の割合。窓を重ねて細かく計算し、拡大したときに時間方向が粗く見えないようにする(PLAN.md 5章)
const HOP_PER_WINDOW = 1 / 4;
// 高い周波数ほど強めて表示する量(dB/oct。Praatの既定と同じ。1kHzで0dB)。弱い摩擦音などの高い成分を見えやすくするため
const PRE_EMPHASIS_DB_PER_OCTAVE = 6;
// 周波数をまとめる帯の数(Melの目盛りで等間隔)。FFTの分割のまま持つと、画面の縦の画素よりずっと多く、描くたびに扱うと遅いため。
// 既定の縦幅(200px)を高精細な画面で表示したときの画素数(400)より多くする(PLAN.md 5章)
const BAND_COUNT = 512;

// 強さは0.5dB刻みの整数(0〜255)で持つ(音声全体ぶんを持つため、メモリを抑える)。0が LEVEL_FLOOR_DB を表す
export const LEVEL_STEP_DB = 0.5;
const LEVEL_FLOOR_DB = -110;

export type SpectrogramData = {
  // フレームごとに、周波数の低い順に bandCount 個の強さを並べたもの。帯は0Hzから表示する上端の周波数までを、
  // Melの目盛りで等間隔に分けたもの
  levels: Uint8Array;
  frameCount: number;
  bandCount: number;
  // 最初のフレームの窓の中心の時刻と、フレームの間隔(秒)。時刻を窓の中心に合わせ、波形とずれないようにする
  firstFrameSec: number;
  hopSec: number;
  // 音声全体での強さの最大値。表示の濃さの基準にする
  maxLevel: number;
};

// フレームの取り方。音声を分けてWeb Workerに渡すとき、どのサンプルがどのフレームに要るかを決めるのにも使う
export type SpectrogramLayout = {
  windowLength: number;
  hopLength: number;
  fftSize: number;
  binCount: number;
  frameCount: number;
};

// windowSecは分析の窓の長さ(秒)。短いほど時間方向が、長いほど周波数方向が細かくなる
export function getSpectrogramLayout(sampleCount: number, sampleRate: number, windowSec: number): SpectrogramLayout {
  const windowLength = Math.round(windowSec * sampleRate);
  const hopLength = Math.max(1, Math.round(windowLength * HOP_PER_WINDOW));
  // 窓の外を0で埋めて点数を倍にし、周波数方向の見た目をなめらかにする(分解能自体は窓の長さで決まる。Audacityの既定と同じ)
  const fftSize = 2 ** Math.ceil(Math.log2(windowLength * 2));
  const binHz = sampleRate / fftSize;
  const binCount = Math.min(fftSize / 2, Math.ceil(getMaxDisplayFrequency(sampleRate) / binHz)) + 1;
  const frameCount = sampleCount < windowLength ? 0 : Math.floor((sampleCount - windowLength) / hopLength) + 1;
  return { windowLength, hopLength, fftSize, binCount, frameCount };
}

export type SpectrogramComputer = {
  // samplesは firstFrame 番目のフレームの窓の先頭から始まる音声。そこから frameCount 個のフレームを計算する
  computeFrames: (samples: Float32Array, firstFrame: number, frameCount: number) => void;
  finish: () => SpectrogramData;
};

// 音声を少しずつ受け取って計算する(全体をまとめて受け取ると、渡すための複製でメモリが倍になるため)
export function createSpectrogramComputer(layout: SpectrogramLayout, sampleRate: number): SpectrogramComputer {
  const { windowLength, hopLength, fftSize, binCount, frameCount } = layout;
  const hannWindow = new Float64Array(windowLength);
  let windowSum = 0;
  for (let i = 0; i < windowLength; i++) {
    hannWindow[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / windowLength);
    windowSum += hannWindow[i];
  }
  const binHz = sampleRate / fftSize;
  // 分割ごとに、パワーにかける量。振幅1の正弦波がその分割に出す強さを0dBにし、高い周波数ほど強める
  // (0Hzの分割は対数が取れないため、隣の分割と同じ量にする)
  const referencePower = (windowSum / 2) ** 2;
  const binGains = new Float64Array(binCount);
  for (let k = 0; k < binCount; k++) {
    const preEmphasisDb = PRE_EMPHASIS_DB_PER_OCTAVE * Math.log2((Math.max(k, 1) * binHz) / 1000);
    binGains[k] = 10 ** (preEmphasisDb / 10) / referencePower;
  }
  const bands = createBands(BAND_COUNT, getMaxDisplayFrequency(sampleRate), binHz, binCount);

  const powerSpectrum = createPowerSpectrum(fftSize, binCount);
  // 窓の外(windowLength以降)は0のまま使う
  const signal = new Float64Array(fftSize);
  const power = new Float64Array(binCount);
  const levels = new Uint8Array(frameCount * BAND_COUNT);
  let maxLevel = 0;

  return {
    computeFrames: (samples, firstFrame, count) => {
      for (let i = 0; i < count; i++) {
        const offset = i * hopLength;
        for (let j = 0; j < windowLength; j++) signal[j] = samples[offset + j] * hannWindow[j];
        powerSpectrum(signal, power);
        for (let k = 0; k < binCount; k++) power[k] *= binGains[k];
        const base = (firstFrame + i) * BAND_COUNT;
        for (let b = 0; b < BAND_COUNT; b++) {
          const db = 10 * Math.log10(bands.valueOf(power, b) + 1e-30);
          const level = Math.min(255, Math.max(0, Math.round((db - LEVEL_FLOOR_DB) / LEVEL_STEP_DB)));
          levels[base + b] = level;
          if (level > maxLevel) maxLevel = level;
        }
      }
    },
    finish: () => ({
      levels,
      frameCount,
      bandCount: BAND_COUNT,
      firstFrameSec: windowLength / 2 / sampleRate,
      hopSec: hopLength / sampleRate,
      maxLevel,
    }),
  };
}

// FFTの分割を、Melの目盛りで等間隔な帯にまとめる。帯の中に複数の分割が入る(高い周波数の)ところはその中で最も強い値
// (Audacityが縦の1画素に複数の分割が入るときに最大値を描くのと同じ)、分割より帯が細かい(低い周波数の)ところは、
// 帯の中央をはさむ2つの分割の値をつなぐ
function createBands(
  bandCount: number,
  maxFrequency: number,
  binHz: number,
  binCount: number,
): { valueOf: (power: Float64Array, band: number) => number } {
  const firstBins = new Uint32Array(bandCount);
  const lastBins = new Uint32Array(bandCount);
  const upperWeights = new Float64Array(bandCount);
  const takesMax = new Uint8Array(bandCount);
  const clampBin = (bin: number) => Math.min(binCount - 1, Math.max(0, bin));
  for (let b = 0; b < bandCount; b++) {
    const lowBin = ratioToFrequency(b / bandCount, maxFrequency) / binHz;
    const highBin = ratioToFrequency((b + 1) / bandCount, maxFrequency) / binHz;
    if (Math.floor(highBin) - Math.ceil(lowBin) >= 1) {
      takesMax[b] = 1;
      firstBins[b] = clampBin(Math.ceil(lowBin));
      lastBins[b] = clampBin(Math.floor(highBin));
    } else {
      const position = Math.min(binCount - 1, (lowBin + highBin) / 2);
      firstBins[b] = clampBin(Math.floor(position));
      lastBins[b] = clampBin(Math.floor(position) + 1);
      upperWeights[b] = position - Math.floor(position);
    }
  }

  return {
    valueOf: (power, b) => {
      if (!takesMax[b]) {
        return power[firstBins[b]] * (1 - upperWeights[b]) + power[lastBins[b]] * upperWeights[b];
      }
      let value = 0;
      for (let k = firstBins[b]; k <= lastBins[b]; k++) if (power[k] > value) value = power[k];
      return value;
    },
  };
}

// 点数sizeの実数の信号のパワースペクトルを、0〜binCount-1番目のビンについて求める。
// 実数の信号は、偶数番目・奇数番目のサンプルを実部・虚部にした半分の点数の複素FFTから求められるため、計算がおよそ半分で済む
function createPowerSpectrum(size: number, binCount: number): (signal: Float64Array, power: Float64Array) => void {
  const half = size / 2;
  const fft = createFft(half);
  const re = new Float64Array(half);
  const im = new Float64Array(half);
  const cos = new Float64Array(binCount);
  const sin = new Float64Array(binCount);
  for (let k = 0; k < binCount; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / size);
    sin[k] = -Math.sin((2 * Math.PI * k) / size);
  }

  return (signal, power) => {
    for (let m = 0; m < half; m++) {
      re[m] = signal[2 * m];
      im[m] = signal[2 * m + 1];
    }
    fft(re, im);
    for (let k = 0; k < binCount; k++) {
      // 偶数番目(even)・奇数番目(odd)のサンプルのFFTを取り出し、X[k] = E[k] + e^(-2πik/size)·O[k] で合わせる
      const a = k % half;
      const b = (half - k) % half;
      const evenRe = (re[a] + re[b]) / 2;
      const evenIm = (im[a] - im[b]) / 2;
      const oddRe = (im[a] + im[b]) / 2;
      const oddIm = -(re[a] - re[b]) / 2;
      const xRe = evenRe + cos[k] * oddRe - sin[k] * oddIm;
      const xIm = evenIm + cos[k] * oddIm + sin[k] * oddRe;
      power[k] = xRe * xRe + xIm * xIm;
    }
  };
}

// 点数sizeの複素FFT(基数2・その場で書き換える)。並べ替えの表と回転因子は最初に1回だけ作る
function createFft(size: number): (re: Float64Array, im: Float64Array) => void {
  const bits = Math.log2(size);
  const reversed = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reversed[i] = r;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / size);
    sin[i] = Math.sin((-2 * Math.PI * i) / size);
  }

  return (re, im) => {
    for (let i = 0; i < size; i++) {
      const j = reversed[i];
      if (j <= i) continue;
      const r = re[i];
      re[i] = re[j];
      re[j] = r;
      const m = im[i];
      im[i] = im[j];
      im[j] = m;
    }
    for (let blockSize = 2; blockSize <= size; blockSize <<= 1) {
      const half = blockSize >> 1;
      const step = size / blockSize;
      for (let start = 0; start < size; start += blockSize) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = start + j;
          const b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  };
}
