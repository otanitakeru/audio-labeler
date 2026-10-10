import type { AudioFileInfo } from "../types";

// 44100 → "44.1 kHz"、48000 → "48 kHz" のように、桁の多いHz表記より読みやすいkHzで出す
function formatSampleRate(sampleRate: number): string {
  return `${sampleRate / 1000} kHz`;
}

function formatBitDepth(info: AudioFileInfo): string | null {
  if (info.bitDepth === null) return null;
  return info.isFloat ? `${info.bitDepth} bit float` : `${info.bitDepth} bit`;
}

type AudioFileDetailsProps = {
  info: AudioFileInfo;
  // 波形に表示しているチャンネル
  channel: number;
};

// 読み込んだ元ファイルの形式(サンプリング周波数・ビット深度・チャンネル数)。波形表示用に変換する前の値を出す。
// 1チャンネルなら選ぶ余地がないため、複数チャンネルのときだけ表示中のチャンネルを括弧で添える(例: "2 ch (ch 0)")
function AudioFileDetails({ info, channel }: AudioFileDetailsProps) {
  const items = [
    formatSampleRate(info.sampleRate),
    formatBitDepth(info),
    info.channelCount > 1 ? `${info.channelCount} ch (ch ${channel})` : `${info.channelCount} ch`,
  ].filter((item): item is string => item !== null);
  return <span className="text-gray-500">{items.join(" · ")}</span>;
}

export default AudioFileDetails;
