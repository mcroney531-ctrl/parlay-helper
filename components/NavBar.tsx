"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BucketIcon, BuildIcon, CaptureIcon, HistoryIcon } from "@/components/icons";

const TABS = [
  { href: "/capture", label: "Capture", Icon: CaptureIcon },
  { href: "/bucket", label: "Bucket", Icon: BucketIcon },
  { href: "/builder", label: "Build", Icon: BuildIcon },
  { href: "/history", label: "History", Icon: HistoryIcon },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{ borderColor: "var(--color-brand-raised)", background: "var(--color-shell-deep)" }}
    >
      <ul
        className="mx-auto flex"
        style={{ maxWidth: "var(--content-max-width)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-semibold"
                style={{
                  minHeight: "var(--bottom-nav-height)",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.62)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-11 items-center justify-center rounded-full"
                  style={{ background: active ? "var(--color-action)" : "transparent" }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
