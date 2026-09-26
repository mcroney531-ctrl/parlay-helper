import { forwardRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]";
const fieldStyle = { borderColor: "var(--color-border)", background: "var(--color-surface)" };

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`${fieldClass} ${className}`} style={fieldStyle} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = "", ...props }, ref) {
    return <textarea ref={ref} className={`${fieldClass} ${className}`} style={fieldStyle} {...props} />;
  },
);

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${className}`} style={fieldStyle} {...props} />;
}

type ButtonVariant = "primary" | "secondary" | "text" | "destructive";

const BUTTON_VARIANT: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "var(--color-action)", color: "#ffffff", border: "1px solid transparent" },
  secondary: { background: "transparent", color: "var(--color-action)", border: "1px solid var(--color-border)" },
  text: { background: "transparent", color: "var(--color-action)", border: "none", textDecoration: "underline" },
  destructive: { background: "transparent", color: "var(--color-danger)", border: "none", textDecoration: "underline" },
};

export function Button({
  variant = "primary",
  className = "",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const isText = variant === "text" || variant === "destructive";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 font-semibold disabled:opacity-50 ${
        isText ? "text-sm" : "min-h-[44px] rounded-[var(--radius-control)] px-4 py-2 text-sm"
      } ${className}`}
      style={{ ...BUTTON_VARIANT[variant], ...style }}
      {...props}
    />
  );
}
