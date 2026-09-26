"use client";

import { useSyncExternalStore } from "react";
import { CloudIcon, CloudOffIcon } from "@/components/icons";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

// Server has a bare `navigator` global without a real `.onLine`, so the
// snapshot used for SSR/first-paint must be a fixed, safe default rather
// than reading it — otherwise server and client can render different
// icons/text for the same first paint and React discards the SSR tree.
function getServerSnapshot() {
  return true;
}

/**
 * Persistent header status chip. Parlay Helper is local-first — everything
 * is always "saved locally" regardless of connectivity — so the chip is
 * always visible; only its icon/copy reflect actual online/offline state.
 */
export function OfflineChip() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <span
      role="status"
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium"
      style={{
        borderColor: "rgba(255,255,255,0.25)",
        background: "rgba(0,0,0,0.18)",
        color: "#ffffff",
      }}
    >
      {online ? <CloudIcon className="h-3.5 w-3.5" /> : <CloudOffIcon className="h-3.5 w-3.5" />}
      {online ? "Online · saved locally" : "Offline · saved locally"}
    </span>
  );
}
