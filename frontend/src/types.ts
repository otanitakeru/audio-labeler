export type AudioFileInfo = {
  uploadId: string
  filename: string
  durationSec: number
  sampleRate: number
  channelCount: number
}

export type Segment = {
  id: string
  startSec: number
  endSec: number
  label: string
  // 将来のVAD/Whisperによる自動検出区間と手動区間を同じ型・同じバリデーションで扱うためのフィールド
  source: 'manual' | 'auto'
}
