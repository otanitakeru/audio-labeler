type RangeSliderProps = {
  label?: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
}

function RangeSlider({ label, min, max, step, value, onChange }: RangeSliderProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-500">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32"
      />
    </label>
  )
}

export default RangeSlider
