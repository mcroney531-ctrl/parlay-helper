import { describe, expect, it, vi } from "vitest";
import { interceptLinkClicks } from "@/components/appNavigation";

// Full-page-load mode (B's 3c review, item 2b): after another tab applied an
// update, a plain click on an in-app link becomes a full page load.

function fakeDoc() {
  let handler: ((e: Event) => void) | null = null;
  let capture: unknown = null;
  return {
    location: { origin: "http://app.test" },
    addEventListener: (type: string, fn: (e: Event) => void, opts: unknown) => {
      if (type === "click") {
        handler = fn;
        capture = opts;
      }
    },
    removeEventListener: () => {
      handler = null;
    },
    click: (e: object) => handler?.(e as Event),
    capture: () => capture,
    listening: () => handler !== null,
  };
}

function anchor(href: string, attrs: Record<string, string> = {}) {
  return {
    href: new URL(href, "http://app.test/ideas").href,
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
  };
}

function click(a: ReturnType<typeof anchor> | null, mods: Partial<Record<"button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented", unknown>> = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
    target: { closest: (sel: string) => (sel === "a[href]" ? a : null) },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe("interceptLinkClicks", () => {
  it("turns a plain click on an in-app link into a full page load, before React sees it", () => {
    const doc = fakeDoc();
    const assign = vi.fn();
    interceptLinkClicks(doc as never, assign);
    expect(doc.capture()).toBe(true);
    const e = click(anchor("/slip"));
    doc.click(e);
    expect(assign).toHaveBeenCalledWith("http://app.test/slip");
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("leaves alone what the browser handles itself: modified clicks, new tabs, downloads, other sites", () => {
    const doc = fakeDoc();
    const assign = vi.fn();
    interceptLinkClicks(doc as never, assign);
    for (const e of [
      click(anchor("/slip"), { metaKey: true }),
      click(anchor("/slip"), { ctrlKey: true }),
      click(anchor("/slip"), { button: 1 }),
      click(anchor("/slip"), { defaultPrevented: true }),
      click(anchor("/slip", { target: "_blank" })),
      click(anchor("/export", { download: "" })),
      click(anchor("https://elsewhere.test/")),
      click(null),
    ]) {
      doc.click(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(assign).not.toHaveBeenCalled();
  });

  it("stops when asked", () => {
    const doc = fakeDoc();
    const stop = interceptLinkClicks(doc as never, vi.fn());
    stop();
    expect(doc.listening()).toBe(false);
  });
});
