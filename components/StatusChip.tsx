import type { ReactNode } from "react";
import { AlertCircleIcon, CheckIcon, LinkIcon, WarningIcon } from "@/components/icons";

const PILL_TONES = {
  caution: { bg: "var(--color-caution-bg)", fg: "var(--color-caution-fg)" },
  missing: { bg: "var(--color-missing-bg)", fg: "var(--color-missing-fg)" },
  neutral: { bg: "var(--confidence-unrated-bg)", fg: "var(--color-muted)" },
  success: { bg: "var(--color-selected-bg)", fg: "var(--color-brand)" },
  info: { bg: "var(--color-info-bg)", fg: "var(--color-info)" },
} as const;

/** Compact rounded status/state label — never the only signal (text always names the state). */
export function Pill({
  tone,
  children,
  icon,
}: {
  tone: keyof typeof PILL_TONES;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const { bg, fg } = PILL_TONES[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: bg, color: fg }}
    >
      {icon}
      {children}
    </span>
  );
}

const ROW_TONES = {
  info: { bg: "var(--color-info-bg)", fg: "var(--color-info)", Icon: LinkIcon },
  caution: { bg: "var(--color-caution-bg)", fg: "var(--color-caution-fg)", Icon: WarningIcon },
  missing: { bg: "var(--color-missing-bg)", fg: "var(--color-missing-fg)", Icon: AlertCircleIcon },
  danger: { bg: "var(--color-danger-bg)", fg: "var(--color-danger)", Icon: AlertCircleIcon },
  success: { bg: "var(--color-selected-bg)", fg: "var(--color-brand)", Icon: CheckIcon },
} as const;

/** Full-width message row (icon + descriptive text) for correlation, concentration, missing-data, and error states. */
export function StatusRow({
  tone,
  children,
  action,
}: {
  tone: keyof typeof ROW_TONES;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { bg, fg, Icon } = ROW_TONES[tone];
  return (
    <div
      className="flex items-start gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm"
      style={{ background: bg, color: fg }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}
