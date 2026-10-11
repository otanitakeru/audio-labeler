import type { ReactNode } from "react";

type ButtonProps = {
  // primaryはOKなど操作を進めるボタン、secondaryはキャンセルなど
  variant: "primary" | "secondary";
  // submitはフォームの送信ボタン(入力欄でEnterを押したときも押される)。そのときはonClickを省いてよい
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  // ダイアログを開いたときにフォーカスを当てる(Dialog.tsx参照)
  autoFocusInDialog?: boolean;
  children: ReactNode;
};

const VARIANT_CLASS_NAMES: Record<ButtonProps["variant"], string> = {
  primary: "bg-gray-900 px-6 font-semibold text-white hover:bg-gray-700",
  secondary: "border border-gray-300 bg-white px-4 text-gray-700 hover:bg-gray-100",
};

function Button({ variant, type = "button", onClick, disabled, autoFocusInDialog, children }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocusInDialog || undefined}
      className={`cursor-pointer rounded-md py-2 text-sm disabled:cursor-default disabled:opacity-50 ${VARIANT_CLASS_NAMES[variant]}`}
    >
      {children}
    </button>
  );
}

export default Button;
