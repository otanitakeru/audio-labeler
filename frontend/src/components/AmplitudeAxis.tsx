type AmplitudeAxisProps = {
  // 表示中チャンネルの絶対振幅ピーク値(0〜1)。波形はnormalize:trueとverticalZoomの効果で
  // この値を上限に描画しているため、目盛りもこの値を基準にした絶対値として表示する
  peakAmplitude: number;
  mainWaveformHeight: number;
  minimapHeight: number;
  // このメモリ上でのCmd/Ctrl+スクロールをverticalZoomに反映するため、useWavesurfer側に公開する
  ref: React.RefObject<HTMLDivElement | null>;
};

// 中心(0)から端までに置きたい目盛りの目安の数
const TARGET_TICK_COUNT = 4;

// 目盛りの間隔を1・2・5の倍数(桁違い含む)の「きりのいい」値に丸める
function getNiceStep(roughStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized = [1, 2, 5, 10].find((n) => n >= normalized) ?? 10;
  return niceNormalized * magnitude;
}

function getDecimalsForStep(step: number): number {
  return Math.min(Math.max(-Math.floor(Math.log10(step)), 0), 6);
}

function AmplitudeAxis({ peakAmplitude, mainWaveformHeight, minimapHeight, ref }: AmplitudeAxisProps) {
  const ticks: number[] = [0];
  let decimals = 2;

  if (peakAmplitude > 0) {
    const step = getNiceStep(peakAmplitude / TARGET_TICK_COUNT);
    decimals = getDecimalsForStep(step);
    const maxIndex = Math.floor(peakAmplitude / step + 1e-9);

    for (let i = 1; i <= maxIndex; i++) {
      ticks.push(i * step, -i * step);
    }
  }

  return (
    <div className="flex w-14 shrink-0 flex-col">
      <div style={{ height: minimapHeight }} />
      <div
        ref={ref}
        className="relative text-right text-xs tabular-nums text-gray-400"
        style={{ height: mainWaveformHeight }}
      >
        {ticks.map((value) => {
          const ratio = peakAmplitude > 0 ? value / peakAmplitude : 0;
          const topPercent = 50 * (1 - ratio);
          return (
            <span key={value} className="absolute right-0 -translate-y-1/2" style={{ top: `${topPercent}%` }}>
              {value.toFixed(decimals)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default AmplitudeAxis;
