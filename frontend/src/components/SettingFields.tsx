import type { ReactNode } from "react";

export function SettingItem({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-semibold text-gray-900">{title}</div>
      <p className="m-0 text-sm text-gray-500">{description}</p>
      {children}
    </div>
  );
}

export function Radio({
  name,
  checked,
  label,
  onSelect,
}: {
  name: string;
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-gray-900">
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      {label}
    </label>
  );
}

export function Checkbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? "text-gray-400" : "cursor-pointer text-gray-900"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
