// One semantic icon set, used consistently across the app. Deliberately not
// camera/trash imagery for Capture/Bucket. All icons are decorative
// (aria-hidden) — the adjacent visible text always carries the meaning.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Capture: quick-add document. */
export function CaptureIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13 3v6h6" />
      <path d="M12 12v6M9 15h6" />
    </Base>
  );
}

/** Bucket: inbox / tray. */
export function BucketIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 4h16l-2 9H6z" />
      <path d="M4 4 2 13v6a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-6l-2-9" />
      <path d="M9 13a3 3 0 0 0 6 0" />
    </Base>
  );
}

/** Build: slip / list. */
export function BuildIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Base>
  );
}

/** History: clock. */
export function HistoryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.35-4.35" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 9l6 6 6-6" />
    </Base>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 6l6 6-6 6" />
    </Base>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 15a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M15 9a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </Base>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17.5v.01" />
    </Base>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v6M12 16.5v.01" />
    </Base>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6M12 7.5v.01" />
    </Base>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 13l4 4 10-10" />
    </Base>
  );
}

export function CloudOffIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 4l16 16" />
      <path d="M9.5 8.5A4.5 4.5 0 0 1 18 10a3.5 3.5 0 0 1-.6 6.9M6.2 8.3A4.5 4.5 0 0 0 6 17h8" />
    </Base>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.5 17a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.87-.9A3.5 3.5 0 0 1 17.5 17z" />
    </Base>
  );
}

export function UserSilhouetteIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5" />
    </svg>
  );
}
