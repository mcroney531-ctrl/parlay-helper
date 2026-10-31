// The sportsbook of the last slip started on this device, offered as the
// default the next time a slip is started (kept beside the current-slip
// pointer in localStorage). A convenience only: unavailable storage just
// means an empty default.
const LAST_SPORTSBOOK_KEY = "parlay-helper:last-sportsbook";

export function readLastSportsbook(): string {
  try {
    return window.localStorage.getItem(LAST_SPORTSBOOK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberSportsbook(sportsbook: string): void {
  try {
    if (sportsbook.trim()) window.localStorage.setItem(LAST_SPORTSBOOK_KEY, sportsbook.trim());
  } catch {
    // see above
  }
}
