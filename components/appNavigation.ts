"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * FULL-PAGE-LOAD MODE (B's 3c review, item 2b). Once another tab has applied
 * an update, this page is old code running against a server and a cache that
 * no longer hold its lazy chunks or matching RSC payloads, so a client-side
 * navigation is exactly what would break. From then on every in-app
 * navigation is a full page load, which picks up the new version; the user is
 * leaving the screen anyway, so nothing typed is lost to a surprise reload.
 */
let fullPageLoads = false;

/** Switches this page to full page loads for the rest of its life. Idempotent. */
export function requireFullPageLoads(doc: Document = document, assign: (href: string) => void = (href) => window.location.assign(href)) {
  if (fullPageLoads) return;
  fullPageLoads = true;
  interceptLinkClicks(doc, assign);
}

/** For tests: back to client-side navigation. */
export function resetFullPageLoadsForTest() {
  fullPageLoads = false;
}

/** router.push, or a full page load while in full-page-load mode. Use for every in-app navigation made from code. */
export function useAppNavigate(): (href: string) => void {
  const router = useRouter();
  return useCallback((href: string) => (fullPageLoads ? window.location.assign(href) : router.push(href)), [router]);
}

type ClickLike = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
};

/**
 * Turns plain clicks on same-origin links (next/link included) into full page
 * loads. Listens in the capture phase on the document, so it runs before
 * React's own handler at the root and stops it. Clicks the browser would
 * handle itself (new tab, download, another site) are left alone.
 */
export function interceptLinkClicks(doc: Pick<Document, "addEventListener" | "removeEventListener"> & { location: { origin: string } }, assign: (href: string) => void): () => void {
  const onClick = (event: Event) => {
    const e = event as unknown as ClickLike;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as { closest?: (selector: string) => Element | null } | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
    if (!anchor) return;
    const linkTarget = anchor.getAttribute("target");
    if ((linkTarget && linkTarget !== "_self") || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href);
    if (url.origin !== doc.location.origin) return;
    e.preventDefault();
    e.stopPropagation();
    assign(url.href);
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
