import { frequencyToRatio } from "../spectrogram/frequencyScale";

type FrequencyAxisProps = {
  // スペクトログラムの上端の周波数(Hz)。下端は0Hz
  maxFrequency: number;
  height: number;
};

// 目盛りを置く周波数の候補(Hz)。周波数軸はMelで高い周波数ほど詰まって表示されるため、
// 上から順に、前に置いた目盛りと MIN_TICK_GAP_PX 以上離れるものだけを置く
const TICK_FREQUENCIES = [0, 500, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 16000, 20000];
const MIN_TICK_GAP_PX = 18;

function formatKhz(frequency: number): string {
  return String(frequency / 1000);
}

function pickTicks(maxFrequency: number, height: number): number[] {
  const ticks: number[] = [];
  let lastPosition = Infinity;
  for (const frequency of [...TICK_FREQUENCIES].reverse()) {
    if (frequency > maxFrequency) continue;
    const position = frequencyToRatio(frequency, maxFrequency) * height;
    if (lastPosition - position < MIN_TICK_GAP_PX) continue;
    ticks.unshift(frequency);
    lastPosition = position;
  }
  return ticks;
}

function FrequencyAxis({ maxFrequency, height }: FrequencyAxisProps) {
  const ticks = maxFrequency > 0 ? pickTicks(maxFrequency, height) : [];

  return (
    <div className="relative text-right text-xs tabular-nums text-gray-400" style={{ height }}>
      {ticks.map((frequency, index) => {
        const ratio = frequencyToRatio(frequency, maxFrequency);
        // 上下の端の目盛りは、隣の振幅の目盛り・ラベル領域にはみ出さないよう内側に寄せる
        const translate = ratio === 0 ? "-translate-y-full" : ratio === 1 ? "" : "-translate-y-1/2";
        return (
          <span key={frequency} className={`absolute right-0 ${translate}`} style={{ top: `${(1 - ratio) * 100}%` }}>
            {index === ticks.length - 1 ? `${formatKhz(frequency)} kHz` : formatKhz(frequency)}
          </span>
        );
      })}
    </div>
  );
}

export default FrequencyAxis;
