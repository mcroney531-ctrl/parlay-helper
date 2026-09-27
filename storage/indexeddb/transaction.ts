import type { IDBPTransaction } from "idb";

/**
 * Aborts a transaction that is being abandoned because the code running
 * inside it threw, so nothing it wrote commits. Its `done` promise then
 * rejects; that rejection is expected and is swallowed here so it isn't
 * reported as unhandled. Aborting a transaction that already finished or
 * aborted (e.g. after a ConstraintError) throws, which is harmless here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function abandonTransaction(tx: IDBPTransaction<any, any, "readwrite">): void {
  tx.done.catch(() => {});
  try {
    tx.abort();
  } catch {
    // Already finished or aborted.
  }
}
