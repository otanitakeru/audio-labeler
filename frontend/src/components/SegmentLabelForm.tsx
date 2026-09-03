import { useState } from 'react'

type SegmentLabelFormProps = {
  startSec: number
  endSec: number
  onSubmit: (label: string) => string | null
  onCancel: () => void
}

function formatSec(sec: number): string {
  return sec.toFixed(2)
}

function SegmentLabelForm({ startSec, endSec, onSubmit, onCancel }: SegmentLabelFormProps) {
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const result = onSubmit(label)
    if (result) setError(result)
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-300 bg-white p-3">
      <div className="text-sm text-gray-500">
        {formatSec(startSec)}s 〜 {formatSec(endSec)}s
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          autoFocus
          value={label}
          onChange={(e) => {
            // タブ・改行はフォーマットを壊すため半角スペースに置き換える
            setLabel(e.target.value.replace(/[\t\n\r]/g, ' '))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="ラベルを入力"
          className="min-w-48 flex-1 rounded-md border border-gray-300 px-2 py-1 text-gray-900"
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1 text-gray-900 hover:bg-gray-100"
        >
          追加
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1 text-gray-900 hover:bg-gray-100"
        >
          キャンセル
        </button>
      </div>
      {error && <p className="m-0 text-sm text-red-600">{error}</p>}
    </div>
  )
}

export default SegmentLabelForm
