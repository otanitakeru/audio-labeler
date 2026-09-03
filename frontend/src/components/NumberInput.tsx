type NumberInputProps = {
  unit?: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}

function NumberInput({ unit, min, max, value, onChange }: NumberInputProps) {
  return (
    <label className="inline-flex items-center gap-2 text-gray-900">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-24 rounded-md border border-gray-300 bg-white px-2 py-2"
      />
      {unit}
    </label>
  )
}

export default NumberInput
