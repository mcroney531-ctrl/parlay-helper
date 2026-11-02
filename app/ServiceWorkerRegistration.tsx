"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/FormControls";
import { requireFullPageLoads } from "@/components/appNavigation";

/**
 * Which build this page's code came from, stamped on <html data-build> for
 * diagnostics ("which version is this tab running?"). Inlined at build time
 * from NEXT_PUBLIC_APP_BUILD, so builds with different labels ship different
 * client code (the two-build upgrade check relies on that).
 */
const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD || "local";

export type UpdateState =
  /** Nothing to offer. */
  | { kind: "none" }
  /** A new version is installed and waiting for this page's worker to go (waiting-worker policy). */
  | { kind: "waiting"; worker: ServiceWorker }
  /** Another tab applied the update: this page was built from the old version and should reload. */
  | { kind: "updated_elsewhere" };

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;
type Container = Listenable & { controller: ServiceWorker | null };
type Registration = Listenable & { waiting: ServiceWorker | null; installing: ServiceWorker | null };

/**
 * Watches one registration for an update and says when to offer it. Pure of
 * React so it can be tested with fakes.
 *
 * A worker that's waiting while this page has a controller is an update (on
 * a first install nothing controls the page, and nothing is offered).
 * apply() posts SKIP_WAITING to THAT waiting worker only; the page reloads
 * once, when the new worker takes control. A controller change this page
 * didn't ask for means another tab applied the update, and is reported
 * rather than acted on: reloading by surprise could lose what's being typed.
 */
export function trackServiceWorkerUpdates(
  container: Container,
  registration: Registration,
  onChange: (state: UpdateState) => void,
  reload: () => void,
): { apply: (worker: ServiceWorker) => void; stop: () => void } {
  let requested = false;
  let reloaded = false;

  const check = () => {
    if (registration.waiting && container.controller) onChange({ kind: "waiting", worker: registration.waiting });
  };

  const watchInstalling = () => {
    const worker = registration.installing;
    if (!worker) return;
    const onState = () => {
      if (worker.state === "installed") check();
      if (worker.state === "installed" || worker.state === "redundant") worker.removeEventListener("statechange", onState);
    };
    worker.addEventListener("statechange", onState);
  };

  const onControllerChange = () => {
    if (requested) {
      if (!reloaded) {
        reloaded = true;
        reload();
      }
      return;
    }
    onChange({ kind: "updated_elsewhere" });
  };

  registration.addEventListener("updatefound", watchInstalling);
  container.addEventListener("controllerchange", onControllerChange);
  check();
  watchInstalling();

  return {
    apply(worker) {
      requested = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    },
    stop() {
      registration.removeEventListener("updatefound", watchInstalling);
      container.removeEventListener("controllerchange", onControllerChange);
    },
  };
}

/** The prompt's text for each state, or null when nothing is shown. */
export function updatePromptText(state: UpdateState): string | null {
  switch (state.kind) {
    case "none":
      return null;
    case "waiting":
      return "Update available.";
    case "updated_elsewhere":
      return "The app was updated in another tab. Reload to keep using it.";
  }
}

export function ServiceWorkerRegistration() {
  const [state, setState] = useState<UpdateState>({ kind: "none" });
  const tracker = useRef<ReturnType<typeof trackServiceWorkerUpdates> | null>(null);

  useEffect(() => {
    document.documentElement.dataset.build = APP_BUILD;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    // An installed app on a phone can stay open for days: look for a new
    // version whenever it comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        const onChange = (next: UpdateState) => {
          // This page's code is now older than the server and cache it runs against.
          if (next.kind === "updated_elsewhere") requireFullPageLoads();
          setState(next);
        };
        tracker.current = trackServiceWorkerUpdates(navigator.serviceWorker, reg, onChange, () => window.location.reload());
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => {
        // Offline shell is a progressive enhancement; capture/build still
        // work without it as long as IndexedDB is available.
      });
    return () => {
      cancelled = true;
      tracker.current?.stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const text = updatePromptText(state);
  if (!text) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium"
      style={{ background: "var(--color-info-bg)", color: "var(--color-ink)" }}
    >
      <span>{text}</span>
      <Button
        variant="text"
        className="shrink-0"
        onClick={() => {
          if (state.kind === "waiting") tracker.current?.apply(state.worker);
          else window.location.reload();
        }}
      >
        Reload
      </Button>
    </div>
  );
}
