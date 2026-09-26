// Typed failures for candidate writes and placement, so callers (and the UI)
// can tell "this slip was already placed" apart from "it changed under you"
// without matching on message text.

export class CandidateNotFoundError extends Error {
  constructor(readonly candidateId: string) {
    super("This slip no longer exists.");
    this.name = "CandidateNotFoundError";
  }
}

/** An edit to a placed candidate. Placed slips are frozen (INV-2); clone one to change it. */
export class CandidatePlacedError extends Error {
  constructor(readonly candidateId: string) {
    super("This slip has been placed and can no longer be changed. Clone it to make a new slip.");
    this.name = "CandidatePlacedError";
  }
}

/**
 * A second placement of the same candidate (INV-3). Carries the id of the
 * History record that already placed it; nothing new was written.
 */
export class AlreadyPlacedError extends Error {
  constructor(
    readonly candidateId: string,
    readonly existingFinalizedId: string | null,
  ) {
    super("This slip has already been placed. It's in History.");
    this.name = "AlreadyPlacedError";
  }
}

/** The candidate changed after the version the user confirmed (INV-6). Nothing was written. */
export class StaleCandidateError extends Error {
  constructor(
    readonly candidateId: string,
    readonly seenRevision: number,
    readonly currentRevision: number,
  ) {
    super("This slip changed since you last saw it. Review it and try again.");
    this.name = "StaleCandidateError";
  }
}
