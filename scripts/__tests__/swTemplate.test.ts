import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import routes from "@/config/routes.json";

// The service worker template, run against fake browser globals: the alias
// redirects, the offline fallbacks, and the waiting-worker lifecycle.

const ORIGIN = "https://app.test";
const template = readFileSync(path.resolve(__dirname, "..", "sw-template.js"), "utf8");

type FakeRequest = { method: string; url: string; mode: string };

function loadWorker(version: string, network: (url: string) => Promise<Response>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: string | FakeRequest) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const openCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      async put(r: FakeRequest, res: Response) {
        store.set(key(r), res);
      },
      async match(r: string | FakeRequest) {
        return store.get(key(r))?.clone();
      },
      async addAll(urls: string[]) {
        for (const u of urls) store.set(key(u), new Response(`page ${u}`));
      },
    };
  };
  const caches = {
    open: async (name: string) => openCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const self = {
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  const fetch = (input: string | FakeRequest) => {
    const url = key(input);
    if (url.endsWith("/precache-manifest.json")) {
      return Promise.resolve(new Response(JSON.stringify(["/ideas", "/slip", "/history"])));
    }
    return network(url);
  };
  const src = template.replaceAll("__CACHE_VERSION__", version).replace("__ROUTES__", JSON.stringify(routes));
  new Function("self", "caches", "fetch", src)(self, caches, fetch);

  async function run(type: string, data?: unknown) {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]({ data, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }
  async function request(pathAndQuery: string, mode = "navigate"): Promise<Response | undefined> {
    let response: Promise<Response> | undefined;
    listeners.fetch({
      request: { method: "GET", url: ORIGIN + pathAndQuery, mode },
      respondWith: (r: Promise<Response> | Response) => (response = Promise.resolve(r)),
    });
    return response;
  }
  return { self, caches, stores, run, request };
}

const offline = () => Promise.reject(new TypeError("Failed to fetch"));
const online = (url: string) => Promise.resolve(new Response(`net ${new URL(url).pathname}`));

describe("service worker: old screen names", () => {
  it.each(Object.entries(routes.aliases))("redirects %s to %s with its query, online and offline", async (alias, target) => {
    for (const network of [online, offline]) {
      const sw = loadWorker("v1", network);
      await sw.run("install");
      const res = (await sw.request(`${alias}?slip=abc`))!;
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe(`${ORIGIN}${target}?slip=abc`);
    }
  });

  it("only precaches canonical routes, never an alias", async () => {
    const sw = loadWorker("v1", online);
    await sw.run("install");
    const cached = [...sw.stores.get("parlay-helper-shell-v1")!.keys()].map((u) => new URL(u).pathname);
    expect(cached.sort()).toEqual([...routes.canonical].sort());
  });

  it("doesn't redirect a non-navigation request for an old name", async () => {
    const sw = loadWorker("v1", online);
    const res = (await sw.request("/capture", "cors"))!;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("net /capture");
  });
});

describe("service worker: offline navigation", () => {
  it("serves a screen opened with a query from that screen's own cached page", async () => {
    const sw = loadWorker("v1", offline);
    await sw.run("install");
    expect(await (await sw.request("/slip?from=history"))!.text()).toBe("page /slip");
    expect(await (await sw.request("/history?q=x"))!.text()).toBe("page /history");
  });

  it("never falls back from one screen to another", async () => {
    const sw = loadWorker("v1", offline);
    await sw.run("install");
    sw.stores.get("parlay-helper-shell-v1")!.delete(`${ORIGIN}/slip`);
    await expect(sw.request("/slip")).rejects.toThrow("offline and not cached");
  });

  it("lands any other path on Ideas", async () => {
    const sw = loadWorker("v1", offline);
    await sw.run("install");
    expect(await (await sw.request("/"))!.text()).toBe("page /ideas");
  });

  it("never stores a response that followed a redirect", async () => {
    const redirected = new Response("net /ideas");
    Object.defineProperty(redirected, "redirected", { value: true });
    const sw = loadWorker("v1", () => Promise.resolve(redirected));
    await sw.request("/");
    expect(sw.stores.get("parlay-helper-shell-v1")?.has(`${ORIGIN}/`) ?? false).toBe(false);
  });
});

describe("service worker: waiting-worker lifecycle", () => {
  it("installs without skipping the wait, and activates without claiming pages", async () => {
    const sw = loadWorker("v2", online);
    await sw.run("install");
    await sw.run("activate");
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    expect(sw.self.clients.claim).not.toHaveBeenCalled();
  });

  it("skips the wait only when the update prompt asks", async () => {
    const sw = loadWorker("v2", online);
    await sw.run("message", { type: "something else" });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    await sw.run("message", { type: "SKIP_WAITING" });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("deletes every other cache on activate", async () => {
    const sw = loadWorker("v2", online);
    await sw.caches.open("parlay-helper-shell-v1");
    await sw.caches.open("something-else");
    await sw.run("install");
    await sw.run("activate");
    expect(await sw.caches.keys()).toEqual(["parlay-helper-shell-v2"]);
  });
});
