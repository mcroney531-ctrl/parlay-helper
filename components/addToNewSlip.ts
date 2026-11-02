/**
 * The second half of a first add with a new slip: the slip already exists,
 * and the idea is added to it. Whether or not the add works, the new slip
 * is made current and the slips are reloaded, so it's never left as an
 * invisible empty slip that a retry would duplicate (B's 3c review, R2).
 * A retry is then the card's own "Add to <slip>".
 */
export async function addToNewSlip(
  slip: { id: string; name: string },
  ideaId: string,
  deps: {
    addLeg: (slipId: string, ideaId: string) => Promise<unknown>;
    setActive: (slipId: string) => void;
    refresh: () => Promise<void>;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  let added = true;
  try {
    await deps.addLeg(slip.id, ideaId);
  } catch {
    added = false;
  }
  deps.setActive(slip.id);
  await deps.refresh();
  return added ? { ok: true } : { ok: false, message: `Slip "${slip.name}" created, but this idea couldn't be added. Try Add again.` };
}
