"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/capture", label: "Capture" },
  { href: "/bucket", label: "Bucket" },
  { href: "/builder", label: "Build" },
  { href: "/history", label: "History" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-[var(--surface)] sm:static sm:border-t-0 sm:border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-sm font-medium sm:min-h-[48px]"
                style={{
                  color: active ? "var(--accent)" : "var(--muted)",
                  borderTop: active ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
