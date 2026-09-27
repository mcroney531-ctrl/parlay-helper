import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/app/DataProvider", () => ({ useData: () => data.value }));

import { StorageErrorBanner } from "../StorageErrorBanner";

function render(databaseNotice: string | null, storageError: string | null): string {
  data.value = { databaseNotice, storageError, dismissStorageError: () => {} };
  return renderToStaticMarkup(<StorageErrorBanner />);
}

beforeEach(() => {
  data.value = {};
});

describe("StorageErrorBanner", () => {
  it("renders nothing when there is no problem", () => {
    expect(render(null, null)).toBe("");
  });

  it("shows an upgrade notice with no way to dismiss it", () => {
    const html = render("Close any other Parlay Helper tabs", null);
    expect(html).toContain("Close any other Parlay Helper tabs");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<button");
  });

  it("shows an ordinary storage error with a Dismiss button", () => {
    const html = render(null, "Failed to load ideas");
    expect(html).toContain("Failed to load ideas");
    expect(html).toMatch(/<button[^>]*>Dismiss<\/button>/);
  });

  it("with both, the upgrade notice stays undismissable and only the error gets Dismiss", () => {
    const html = render("Reload this page", "Failed to load ideas");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html.indexOf("Reload this page")).toBeLessThan(html.indexOf("<button"));
  });
});
