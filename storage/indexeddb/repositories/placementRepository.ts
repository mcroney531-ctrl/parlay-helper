import type { CandidateParlay, CapturedIdea, FinalizedParlay, LiveContext } from "@/domain/types";
import { STORES } from "../schema";
import { abandonTransaction } from "../transaction";
import { liveContextReadyDB, liveContextStoreKey } from "./liveContextRepository";

/** Everything placement decides from, read inside the placing transaction. */
export type PlacementReads = {
  candidate: CandidateParlay | undefined;
  /** The finalized record already naming this candidate, if any. */
  existingFinalizedId: string | undefined;
  /** By idea id; an idea that no longer exists has no entry. */
  ideas: Map<string, CapturedIdea>;
  /** By idea id, at the candidate's sportsbook; no entry when nothing is stored. */
  liveContexts: Map<string, LiveContext>;
};

export type PlacementWrite = { finalized: FinalizedParlay; candidate: CandidateParlay };

/**
 * Places a candidate in ONE readwrite transaction over candidates, finalized,
 * ideas and liveContext: reads everything `plan` needs, lets it decide, then
 * writes the placed candidate and its finalized record together. Either both
 * commit or neither does.
 *
 * `plan` is synchronous on purpose, and nothing in here awaits anything but an
 * IndexedDB request: in a browser, awaiting any other promise inside a
 * transaction commits it early, and the check and the writes would no longer
 * be atomic. If `plan` throws, nothing is written and its error is rethrown.
 *
 * The finalized record goes in with `add` after the candidate `put`, so the
 * unique by-candidateId index is a real second guard: a record already naming
 * this candidate makes the add fail with a ConstraintError, which aborts the
 * whole transaction, the candidate write included. That error is rethrown
 * as-is for the caller to interpret.
 */
export async function commitPlacement(
  candidateId: string,
  plan: (reads: PlacementReads) => PlacementWrite,
): Promise<FinalizedParlay> {
  // Before the transaction: this may run the one-time liveContext rekey,
  // which is its own transaction.
  const db = await liveContextReadyDB();
  const tx = db.transaction(
    [STORES.candidates, STORES.finalized, STORES.ideas, STORES.liveContext],
    "readwrite",
  );
  try {
    const candidates = tx.objectStore(STORES.candidates);
    const finalized = tx.objectStore(STORES.finalized);
    const candidate = await candidates.get(candidateId);
    const existingFinalizedId = await finalized.index("by-candidateId").getKey(candidateId);

    const ideas = new Map<string, CapturedIdea>();
    const liveContexts = new Map<string, LiveContext>();
    if (candidate) {
      for (const ideaId of candidate.ideaIds) {
        const idea = await tx.objectStore(STORES.ideas).get(ideaId);
        if (idea) ideas.set(ideaId, idea);
        const context = await tx
          .objectStore(STORES.liveContext)
          .get(liveContextStoreKey(ideaId, candidate.sportsbook));
        if (context) liveContexts.set(ideaId, context);
      }
    }

    const write = plan({ candidate, existingFinalizedId, ideas, liveContexts });
    await candidates.put(write.candidate);
    await finalized.add(write.finalized);
    await tx.done;
    return write.finalized;
  } catch (error) {
    abandonTransaction(tx);
    throw error;
  }
}
