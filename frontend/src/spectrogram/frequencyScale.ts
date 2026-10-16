// スペクトログラムの周波数軸。Audacityの既定に合わせ、Melで0Hz〜20kHzを表示する(PLAN.md 5章)
const MAX_DISPLAY_FREQUENCY = 20000;

// 表示する上端の周波数。サンプリング周波数の半分より上は音声に含まれないため、そこで止める
export function getMaxDisplayFrequency(sampleRate: number): number {
  return Math.min(MAX_DISPLAY_FREQUENCY, sampleRate / 2);
}

function toMel(frequency: number): number {
  return 2595 * Math.log10(1 + frequency / 700);
}

function fromMel(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

// 周波数を、下端(0Hz)からの高さの割合(0〜1)にする
export function frequencyToRatio(frequency: number, maxFrequency: number): number {
  return toMel(frequency) / toMel(maxFrequency);
}

// 下端からの高さの割合(0〜1)を、周波数にする
export function ratioToFrequency(ratio: number, maxFrequency: number): number {
  return fromMel(ratio * toMel(maxFrequency));
}
