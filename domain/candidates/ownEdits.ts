// INTENTIONALLY BROAD (agreed with review): ANY edit this tab makes after the render counts as seen, not just saves in flight at the tap; do not narrow it (a save that commits just before the tap, ahead of the view refresh, would then fail as stale).
// This tab's own edits to candidates, so placement can tell "the slip changed
// because of a save the user just made here" apart from "the slip changed
// somewhere else".
//
// The case this exists for: the user types a new stake and taps Mark Placed.
// The tap blurs the stake field first, which saves the stake and bumps the
// revision, so the revision the Mark Placed button was rendered with is one
// behind by the time placement runs, although the user is looking at exactly
// the slip being placed. Placement therefore (1) waits for this tab's
// in-flight edits to the slip, and (2) accepts the revision it was given plus
// any revisions this tab itself produced from it, one after another. An edit
// from anywhere else (another tab or window) breaks that chain, so it is
// still rejected as stale. This is module state: it is per tab and is never
// persisted.
//
// Revisions of one candidate only ever increase, and each is produced by
// exactly one committed write, so "this tab produced revision r + 1 from r" is
// unambiguous.

const inFlight = new Map<string, Set<Promise<unknown>>>();
/** candidateId -> (revision this tab edited from -> revision its commit produced). */
const produced = new Map<string, Map<number, number>>();

/**
 * Registers an edit to a candidate that has been started, so a placement that
 * begins before it finishes waits for it. Must be called synchronously when
 * the edit is started (before any await), or a placement started in the same
 * tick could miss it.
 */
export function trackOwnEdit<T>(candidateId: string, edit: Promise<T>): Promise<T> {
  let pending = inFlight.get(candidateId);
  if (!pending) {
    pending = new Set();
    inFlight.set(candidateId, pending);
  }
  pending.add(edit);
  const done = () => {
    pending.delete(edit);
    if (pending.size === 0 && inFlight.get(candidateId) === pending) inFlight.delete(candidateId);
  };
  edit.then(done, done);
  return edit;
}

/** Records that a commit from this tab moved the candidate from one revision to the next. */
export function recordOwnRevision(candidateId: string, from: number, to: number): void {
  let chain = produced.get(candidateId);
  if (!chain) {
    chain = new Map();
    produced.set(candidateId, chain);
  }
  chain.set(from, to);
}

/** Resolves once this tab has no edit to the candidate in flight (whether they succeed or fail). */
export async function settleOwnEdits(candidateId: string): Promise<void> {
  for (let pending = inFlight.get(candidateId); pending && pending.size > 0; pending = inFlight.get(candidateId)) {
    await Promise.allSettled([...pending]);
  }
}

/**
 * The revisions that still count as the one the user saw: `seen` itself, then
 * each revision this tab produced from the previous one. Stops at the first
 * revision this tab didn't produce the next one from.
 */
export function revisionsSeenFrom(candidateId: string, seen: number): Set<number> {
  const revisions = new Set([seen]);
  const chain = produced.get(candidateId);
  for (let revision = chain?.get(seen); revision !== undefined; revision = chain?.get(revision)) {
    revisions.add(revision);
  }
  return revisions;
}
