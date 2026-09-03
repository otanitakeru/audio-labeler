import { useState } from 'react'
import type { Segment } from '../types'

type AddSegmentResult = { success: true } | { success: false; error: string }

export function useSegments() {
  const [segments, setSegments] = useState<Segment[]>([])

  function overlapsExisting(startSec: number, endSec: number): boolean {
    return segments.some((s) => startSec < s.endSec && endSec > s.startSec)
  }

  function addSegment(startSec: number, endSec: number, label: string): AddSegmentResult {
    if (endSec <= startSec) {
      return { success: false, error: '区間の長さが不正です' }
    }
    if (overlapsExisting(startSec, endSec)) {
      return { success: false, error: '既存の区間と重なっています' }
    }
    setSegments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), startSec, endSec, label, source: 'manual' },
    ])
    return { success: true }
  }

  return { segments, addSegment }
}
