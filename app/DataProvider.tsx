"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CandidateParlay, CapturedIdea, FinalizedParlay, LiveContext } from "@/domain/types";
import { listIdeas } from "@/domain/ideas/ideaService";
import { listCandidates } from "@/domain/candidates/candidateService";
import { listFinalizedParlays } from "@/domain/history/finalizeService";
import { getAllLiveContext, liveContextKey } from "@/storage/indexeddb/repositories/liveContextRepository";

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
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ideas, setIdeas] = useState<CapturedIdea[]>([]);
  const [candidates, setCandidates] = useState<CandidateParlay[]>([]);
  const [finalized, setFinalized] = useState<FinalizedParlay[]>([]);
  const [liveContextByKey, setLiveContextByKey] = useState<Record<string, LiveContext>>({});
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

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
    }),
    [ideas, candidates, finalized, liveContextByKey, loading, storageError, refreshIdeas, refreshCandidates, refreshFinalized, refreshLiveContext],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
