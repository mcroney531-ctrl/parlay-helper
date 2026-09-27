"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CandidateParlay, CapturedIdea, FinalizedParlay, LiveContext } from "@/domain/types";
import { listIdeas } from "@/domain/ideas/ideaService";
import { listCandidates } from "@/domain/candidates/candidateService";
import { listFinalizedParlays } from "@/domain/history/finalizeService";
import { getAllLiveContext, liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";
import { noCurrentSlipBecausePlaced, resolveActiveCandidateId } from "@/domain/candidates/activeCandidate";
import { nextDatabaseNotice, subscribeToDatabaseNotices } from "@/storage/indexeddb/db";

type DataContextValue = {
  ideas: CapturedIdea[];
  candidates: CandidateParlay[];
  finalized: FinalizedParlay[];
  /** Keyed by liveContextKey(ideaId, sportsbook) — never just ideaId, since the same idea can carry different prices per book. */
  liveContextByKey: Record<string, LiveContext>;
  loading: boolean;
  /** A failed load or write. The user can dismiss it. */
  storageError: string | null;
  dismissStorageError: () => void;
  /**
   * An upgrade problem the user has to act on (close other tabs, or reload).
   * Kept apart from storageError so it can't be dismissed while unresolved;
   * only the database notices themselves clear it.
   */
  databaseNotice: string | null;
  refreshIdeas: () => Promise<void>;
  refreshCandidates: () => Promise<void>;
  refreshFinalized: () => Promise<void>;
  refreshLiveContext: () => Promise<void>;
  /**
   * The "current slip" — one DRAFT treated as the default target for "add to
   * slip" across Capture/Bucket/Builder (see resolveActiveCandidateId). Never
   * a placed slip. Null right after a placement (the pointer is
   * NO_CURRENT_SLIP) until the user picks or starts a slip, and when there is
   * no draft at all; otherwise it falls back to the most recently updated
   * draft when nothing is remembered or the remembered one was deleted.
   */
  activeCandidateId: string | null;
  /** Remembers the current slip. Pass NO_CURRENT_SLIP right after a placement. */
  setActiveCandidateId: (id: string | null) => void;
  activeCandidate: CandidateParlay | null;
  /** True when there is no current slip because the last one was placed (not merely because there's no draft). */
  lastSlipPlaced: boolean;
};

const DataContext = createContext<DataContextValue | null>(null);

const ACTIVE_CANDIDATE_KEY = "parlay-helper:active-candidate-id";

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ideas, setIdeas] = useState<CapturedIdea[]>([]);
  const [candidates, setCandidates] = useState<CandidateParlay[]>([]);
  const [finalized, setFinalized] = useState<FinalizedParlay[]>([]);
  const [liveContextByKey, setLiveContextByKey] = useState<Record<string, LiveContext>>({});
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [databaseNotice, setDatabaseNotice] = useState<string | null>(null);
  const [activeCandidateIdRaw, setActiveCandidateIdRaw] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_CANDIDATE_KEY);
    } catch {
      return null;
    }
  });

  const refreshIdeas = useCallback(async () => {
    try {
      const all = await listIdeas();
      setIdeas(all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : "Failed to load ideas");
    }
  }, []);

  const refreshCandidates = useCallback(async () => {
    try {
      setCandidates(await listCandidates());
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : "Failed to load candidates");
    }
  }, []);

  const refreshFinalized = useCallback(async () => {
    try {
      setFinalized(await listFinalizedParlays());
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : "Failed to load history");
    }
  }, []);

  const refreshLiveContext = useCallback(async () => {
    try {
      const all = await getAllLiveContext();
      const byKey: Record<string, LiveContext> = {};
      for (const ctx of all) byKey[liveContextKey(ctx.ideaId, ctx.sportsbook)] = ctx;
      setLiveContextByKey(byKey);
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : "Failed to load live context");
    }
  }, []);

  // Storage problems the user has to act on (another tab blocking an upgrade,
  // this tab closed for a newer version) arrive as notices, not as a failed
  // load, so they would otherwise leave the app sitting on "Loading".
  useEffect(
    () =>
      subscribeToDatabaseNotices((notice) => setDatabaseNotice((current) => nextDatabaseNotice(current, notice))),
    [],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([refreshIdeas(), refreshCandidates(), refreshFinalized(), refreshLiveContext()]);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshIdeas, refreshCandidates, refreshFinalized, refreshLiveContext]);

  const dismissStorageError = useCallback(() => setStorageError(null), []);

  const setActiveCandidateId = useCallback((id: string | null) => {
    setActiveCandidateIdRaw(id);
    try {
      if (id) window.localStorage.setItem(ACTIVE_CANDIDATE_KEY, id);
      else window.localStorage.removeItem(ACTIVE_CANDIDATE_KEY);
    } catch {
      // Remembering the current slip across reloads is a convenience, not a requirement.
    }
  }, []);

  const activeCandidateId = useMemo(
    () => resolveActiveCandidateId(candidates, activeCandidateIdRaw),
    [activeCandidateIdRaw, candidates],
  );

  const activeCandidate = useMemo(
    () => candidates.find((c) => c.id === activeCandidateId) ?? null,
    [candidates, activeCandidateId],
  );

  const lastSlipPlaced = useMemo(
    () => noCurrentSlipBecausePlaced(candidates, activeCandidateIdRaw),
    [candidates, activeCandidateIdRaw],
  );

  const value = useMemo(
    () => ({
      ideas,
      candidates,
      finalized,
      liveContextByKey,
      loading,
      storageError,
      dismissStorageError,
      databaseNotice,
      refreshIdeas,
      refreshCandidates,
      refreshFinalized,
      refreshLiveContext,
      activeCandidateId,
      setActiveCandidateId,
      activeCandidate,
      lastSlipPlaced,
    }),
    [
      ideas,
      candidates,
      finalized,
      liveContextByKey,
      loading,
      storageError,
      dismissStorageError,
      databaseNotice,
      refreshIdeas,
      refreshCandidates,
      refreshFinalized,
      refreshLiveContext,
      activeCandidateId,
      setActiveCandidateId,
      activeCandidate,
      lastSlipPlaced,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
