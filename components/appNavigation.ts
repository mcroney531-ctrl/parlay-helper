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
 *
 * That covers links, code navigation, and Back/Forward (C1, B's review of
 * e004b24): see watchHistoryTraversal below.
 */
let fullPageLoads = false;

/**
 * Back/Forward in full-page-load mode. Within this document, popstate would be
 * the app router's client-side traversal (an RSC fetch with the old client);
 * by the time it fires the URL is already the target, so a reload loads that
 * screen with the new version. Registered when this module is first
 * evaluated, which is before the app router adds its own popstate listener in
 * an effect, so stopImmediatePropagation keeps the router from starting a
 * traversal at all rather than racing it. Outside the mode it does nothing.
 *
 * A document restored from the back/forward cache is this old document with
 * the mode still on (bfcache keeps its JS state), so it reloads too.
 */
export function watchHistoryTraversal(win: Pick<Window, "addEventListener">, reload: () => void, isOn: () => boolean = () => fullPageLoads) {
  win.addEventListener("popstate", (event) => {
    if (!isOn()) return;
    event.stopImmediatePropagation();
    reload();
  });
  win.addEventListener("pageshow", (event) => {
    if (isOn() && (event as PageTransitionEvent).persisted) reload();
  });
}
if (typeof window !== "undefined") watchHistoryTraversal(window, () => window.location.reload());

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
