import AmplitudeAxis from "./AmplitudeAxis";

type WaveformProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  amplitudeAxisRef: React.RefObject<HTMLDivElement | null>;
  peakAmplitude: number;
  mainWaveformHeight: number;
  minimapHeight: number;
};

function Waveform({ containerRef, amplitudeAxisRef, peakAmplitude, mainWaveformHeight, minimapHeight }: WaveformProps) {
  return (
    <div className="flex min-h-25 gap-2 rounded-lg border border-gray-300 bg-white p-4">
      <AmplitudeAxis
        ref={amplitudeAxisRef}
        peakAmplitude={peakAmplitude}
        mainWaveformHeight={mainWaveformHeight}
        minimapHeight={minimapHeight}
      />
      <div ref={containerRef} className="min-w-0 flex-1" />
    </div>
  );
}

export default Waveform;
