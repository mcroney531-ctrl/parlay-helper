import { describe, expect, it, vi } from "vitest";
import { trackServiceWorkerUpdates, updatePromptText, type UpdateState } from "@/app/ServiceWorkerRegistration";

// The "Update available, reload" prompt's logic, with fake service worker
// objects: when it's offered, which worker Reload talks to, and that the page
// reloads once the new worker takes control.

class Target {
  private fns = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.fns.has(type)) this.fns.set(type, new Set());
    this.fns.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.fns.get(type)?.delete(fn);
  }
  emit(type: string) {
    for (const fn of [...(this.fns.get(type) ?? [])]) fn();
  }
}

class FakeWorker extends Target {
  state = "installing";
  postMessage = vi.fn();
  setState(state: string) {
    this.state = state;
    this.emit("statechange");
  }
}

function setup(opts: { controlled: boolean; waiting?: FakeWorker }) {
  const container = Object.assign(new Target(), { controller: opts.controlled ? (new FakeWorker() as unknown as ServiceWorker) : null });
  const registration = Object.assign(new Target(), {
    waiting: (opts.waiting ?? null) as unknown as ServiceWorker | null,
    installing: null as unknown as ServiceWorker | null,
  });
  const states: UpdateState[] = [];
  const reload = vi.fn();
  const tracker = trackServiceWorkerUpdates(container, registration, (s) => states.push(s), reload);
  return { container, registration, states, reload, tracker };
}

describe("update prompt", () => {
  it("offers an update that is already waiting when the page loads", () => {
    const waiting = new FakeWorker();
    const { states } = setup({ controlled: true, waiting });
    expect(states).toEqual([{ kind: "waiting", worker: waiting }]);
    expect(updatePromptText(states[0])).toBe("Update available.");
  });

  it("offers an update once a newly found worker finishes installing", () => {
    const { registration, states } = setup({ controlled: true });
    const worker = new FakeWorker();
    registration.installing = worker as unknown as ServiceWorker;
    registration.emit("updatefound");
    expect(states).toEqual([]);
    registration.waiting = worker as unknown as ServiceWorker;
    worker.setState("installed");
    expect(states).toEqual([{ kind: "waiting", worker }]);
  });

  it("offers nothing on a first install, when no worker controls the page", () => {
    const { states } = setup({ controlled: false, waiting: new FakeWorker() });
    expect(states).toEqual([]);
  });

  it("Reload tells the waiting worker only, then reloads once when it takes control", () => {
    const waiting = new FakeWorker();
    const { container, reload, tracker } = setup({ controlled: true, waiting });
    tracker.apply(waiting as unknown as ServiceWorker);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    container.emit("controllerchange");
    container.emit("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reports an update applied by another tab instead of reloading by surprise", () => {
    const { container, states, reload } = setup({ controlled: true });
    container.emit("controllerchange");
    expect(reload).not.toHaveBeenCalled();
    expect(states).toEqual([{ kind: "updated_elsewhere" }]);
    expect(updatePromptText(states[0])).toBe("The app was updated in another tab.");
  });

  it("stops listening when stopped", () => {
    const { container, states, tracker } = setup({ controlled: true });
    tracker.stop();
    container.emit("controllerchange");
    expect(states).toEqual([]);
  });
});
