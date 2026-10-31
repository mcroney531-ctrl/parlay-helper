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

/**
 * A slip with legs whose idea no longer exists can't be placed: those legs
 * have no details and no price. Consent to unpriced legs (INV-17) never
 * covers them. Nothing was written.
 */
export class DeletedLegsError extends Error {
  constructor(
    readonly candidateId: string,
    readonly missingLegIds: string[],
  ) {
    super(
      `Cannot place: ${missingLegIds.length} leg${missingLegIds.length === 1 ? "" : "s"} reference${missingLegIds.length === 1 ? "s" : ""} an idea that no longer exists. Remove ${missingLegIds.length === 1 ? "it" : "them"} from the slip first.`,
    );
    this.name = "DeletedLegsError";
  }
}

/**
 * INV-17: at commit, legs had no current price that the user wasn't warned
 * about when they confirmed. Usually a price disappeared in between, but the
 * leg may never have had one, or no consent was passed at all, so the message
 * doesn't claim which. Placement never goes ahead on prices the user didn't
 * agree to; nothing was written, and the confirm has to be shown again with
 * the current set.
 */
export class UnpricedConsentError extends Error {
  constructor(
    readonly candidateId: string,
    /** Every present leg with no price at commit. */
    readonly unpricedLegIds: string[],
    /** The ones the user wasn't warned about. */
    readonly unacknowledgedLegIds: string[],
  ) {
    super(
      unacknowledgedLegIds.length === 1
        ? "A leg has no current price that you didn't confirm. Review the slip and confirm again."
        : `${unacknowledgedLegIds.length} legs have no current price that you didn't confirm. Review the slip and confirm again.`,
    );
    this.name = "UnpricedConsentError";
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
