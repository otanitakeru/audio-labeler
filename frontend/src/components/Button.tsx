import type { ReactNode } from "react";

type ButtonProps = {
  // primaryはOKなど操作を進めるボタン、secondaryはキャンセルなど
  variant: "primary" | "secondary";
  onClick: () => void;
  children: ReactNode;
};

const VARIANT_CLASS_NAMES: Record<ButtonProps["variant"], string> = {
  primary: "bg-gray-900 px-6 font-semibold text-white hover:bg-gray-700",
  secondary: "border border-gray-300 bg-white px-4 text-gray-700 hover:bg-gray-100",
};

function Button({ variant, onClick, children }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-md py-2 text-sm ${VARIANT_CLASS_NAMES[variant]}`}
    >
      {children}
    </button>
  );
}

export default Button;
