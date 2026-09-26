"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CandidateParlay, CapturedIdea, FinalizedParlay, LiveContext } from "@/domain/types";
import { listIdeas } from "@/domain/ideas/ideaService";
import { listCandidates } from "@/domain/candidates/candidateService";
import { listFinalizedParlays } from "@/domain/history/finalizeService";
import { getAllLiveContext, liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";
import { resolveActiveCandidateId } from "@/domain/candidates/activeCandidate";
import { UPGRADE_BLOCKED_MESSAGE, subscribeToDatabaseNotices } from "@/storage/indexeddb/db";

type DataContextValue = {
  ideas: CapturedIdea[];
  candidates: CandidateParlay[];
  finalized: FinalizedParlay[];
  /** Keyed by liveContextKey(ideaId, sportsbook) — never just ideaId, since the same idea can carry different prices per book. */
  liveContextByKey: Record<string, LiveContext>;
  loading: boolean;
  storageError: string | null;
  refreshIdeas: () => Promise<void>;
  refreshCandidates: () => Promise<void>;
  refreshFinalized: () => Promise<void>;
  refreshLiveContext: () => Promise<void>;
  /**
   * The "current slip" — one candidate treated as the default target for
   * "add to slip" across Capture/Bucket/Builder. Falls back to the most
   * recently updated candidate when nothing's explicitly chosen yet or the
   * remembered one no longer exists (deleted); null only when there are no
   * candidates at all.
   */
  activeCandidateId: string | null;
  setActiveCandidateId: (id: string | null) => void;
  activeCandidate: CandidateParlay | null;
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
      subscribeToDatabaseNotices((notice) => {
        if (notice.kind === "upgrade-unblocked") {
          setStorageError((current) => (current === UPGRADE_BLOCKED_MESSAGE ? null : current));
        } else {
          setStorageError(notice.message);
        }
      }),
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

  const value = useMemo(
    () => ({
      ideas,
      candidates,
      finalized,
      liveContextByKey,
      loading,
      storageError,
      refreshIdeas,
      refreshCandidates,
      refreshFinalized,
      refreshLiveContext,
      activeCandidateId,
      setActiveCandidateId,
      activeCandidate,
    }),
    [
      ideas,
      candidates,
      finalized,
      liveContextByKey,
      loading,
      storageError,
      refreshIdeas,
      refreshCandidates,
      refreshFinalized,
      refreshLiveContext,
      activeCandidateId,
      setActiveCandidateId,
      activeCandidate,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
