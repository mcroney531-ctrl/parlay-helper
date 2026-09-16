# Parlay Helper

A personal, local-first parlay planning PWA: capture prop ideas quickly, see what changed by game day, assemble book-specific candidate slips deliberately, and keep an immutable record of what you actually placed.

This app never scores, recommends, or optimizes a bet. It organizes and shows context; you decide.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/capture`.

## Scripts

- `npm run dev` — dev server (a `predev` hook first writes a minimal `public/sw.js`/`precache-manifest.json` for dev-mode offline support)
- `npm run build` — production build (a `postbuild` hook then writes the real `public/sw.js`/`precache-manifest.json` from this build's actual rendered output — see **Offline** below)
- `npm run test` — run the Vitest suite once
- `npm run test:watch` — Vitest in watch mode
- `npm run lint` — ESLint

## Environment variables

Both integrations degrade gracefully with no configuration — the core capture → build → finalize loop never depends on them.

- `ODDS_API_KEY` — [The Odds API](https://the-odds-api.com/) key, used only server-side in `app/api/odds/route.ts`. Without it, the odds route returns an explicit `not_configured` status per event instead of failing.
- Sleeper's public player endpoint needs no key; `app/api/sleeper/route.ts` calls it directly and caches the full payload in-memory for ~24h.

## Architecture

```
app/            Next.js App Router pages (capture, bucket, builder, history) + API routes
components/     Presentational + lightly-stateful UI components
domain/         Business logic: ideas, candidates, odds math, rules, history — framework-free, unit tested
integrations/   Server-side adapters for The Odds API and Sleeper (secrets stay here)
storage/        IndexedDB repository layer, schema versioning, migrations
```

- **Storage**: IndexedDB via `idb`, schema-versioned (`storage/indexeddb/schema.ts`). Add a migration by bumping `SCHEMA_VERSION` and appending an `if (oldVersion < N)` block in `storage/indexeddb/db.ts` — never edit a past step. `liveContext` is keyed by `(ideaId, sportsbook)`, not just `ideaId` — the same idea in a FanDuel candidate and a DraftKings candidate must never share one cached price.
- **Odds math**: `domain/odds/` — American/decimal conversion, combined parlay estimate, payout, and same-game-parlay detection are pure functions with no I/O, covered by unit tests.
- **Rules**: `domain/rules/` — correlation and concentration signals are deterministic and named-threshold-driven (`domain/rules/config.ts`). They only ever surface context; they never filter or reorder legs.
- **Odds API route**: groups legs by `sport + event + market set` before calling the provider (never one request per leg), caches per-key with a short TTL, and dedupes concurrent identical requests. Matching a fetched outcome back to a leg (`domain/odds/refreshService.ts`) requires player-identity confirmation on player-prop markets — it refuses to guess when a market has more than one player and identity can't be confirmed, rather than silently attaching the wrong player's price.
- **Market/league fields**: the Bucket's structured-details form picks markets from a curated list of real Odds API keys (`integrations/odds-api/marketKeys.ts`) instead of deriving a key from free text, and has an explicit League field — required for both the odds and event-lookup refresh to have anything to match against.
- **Player and game resolution**: `PlayerSearchField` resolves a typed name to a real player id via `/api/sleeper?search=` — there is no raw player-id input anywhere; if nothing matches, the field just says so and the leg proceeds without one. `EventPickerField` resolves a league + team search to a real event id via `/api/events?league=`; if the lookup is unavailable it shows a message and leaves the field blank by default, with a raw event-id input available only behind an explicit "enter an event id manually" link — an opt-in escape hatch, not something shown automatically. Both invalidate the resolved id the moment the visible text changes, so a stale id can never silently stick to a different name/game.
- **Sleeper route**: caches the full player payload in-memory for ~24h and only ever returns the requested player-id subset (or name-search results) to the client — never the full snapshot.
- **Events route**: `/api/events` lists a league's upcoming events (no markets/bookmakers, so it stays cheap even as a live-search source) with its own short in-memory cache.
- **Refresh ordering**: odds and player-status refreshes run sequentially (never `Promise.all`) against the same LiveContext record, and track their own freshness (`oddsFetchedAt`/`playerStatusFetchedAt`) independently so refreshing one never overstates the freshness of the other.
- **Offline**: `scripts/sw-template.js` is the tracked service-worker source; `scripts/generate-app-shell.mjs` (run via `predev`/`postbuild`) reads each route's actual rendered HTML for its real JS/CSS/font asset URLs, writes them to `public/precache-manifest.json`, hashes that list, and stamps the hash into `public/sw.js`'s `CACHE_NAME` — both are gitignored build artifacts, never hand-maintained. This means a route a user has never visited online still renders correctly offline, verified with a real cold-offline test (install visiting only Capture, go offline, hard-navigate to Bucket/Build/History fresh). Baking the version into the served script's own bytes (rather than reading it at runtime) is what makes the SW lifecycle actually work across deploys, all independently verified in a real browser:
  - a new deploy's differently-hashed `sw.js` triggers the standard install/activate cycle, and the new cache sits under a distinct name from the old one;
  - `activate`'s cleanup then deletes every cache that isn't the current one — confirmed the old build's cache is gone after the new one takes over;
  - a missing or malformed `precache-manifest.json` makes the install reject (worker ends in `redundant`, page never gets a controller, no cache — even an empty one — gets created) instead of silently precaching a smaller, possibly-stale fallback list. `predev`/`postbuild` always write a valid manifest first, so this path should only ever trip on a genuine deploy/serving problem, and it's meant to be loud when it does.
- **API input handling**: none of `/api/odds`, `/api/sleeper`, or `/api/events` proxy an arbitrary upstream URL — the provider host is always a hardcoded constant, and league/sportsbook/market values are only ever used after passing through a fixed allowlist lookup (`sportKeyForLeague`, `bookmakerKeyForSportsbook`) that fails closed on anything unrecognized. The one field that reaches the upstream path directly, `eventId`, is restricted to a safe charset (zod regex) so it can't smuggle extra path segments. All three routes are read-only and validate/cap every input (array/string length limits, capped distinct-event count) via zod.
- **Rate limiting**: `integrations/rateLimit.ts` caps `/api/odds` and `/api/events` (the two routes that spend `ODDS_API_KEY` quota) at 20 requests/minute per client IP, returning `429` past that. This is explicitly a *second* layer, not the primary control: it's an in-process `Map`, so on a multi-instance/serverless deployment (Vercel functions, etc.) each instance holds its own counters and a distributed attacker can multiply the effective limit by the instance count. **If deploying this publicly with a real, quota-bearing `ODDS_API_KEY`, put platform/edge-level rate limiting in front of it** (e.g. a Vercel Firewall rate-limit rule, or your reverse proxy/CDN) — that's the control that actually holds under horizontal scaling. For a single-instance deployment or private/local testing, this in-repo layer is sufficient on its own.

## Testing

`npm run test` runs the full Vitest suite: odds conversion/estimate math, correlation/concentration rules, change-radar diffing, the IndexedDB-backed idea/candidate/finalize services (via `fake-indexeddb`), per-book LiveContext isolation, and the `/api/odds`, `/api/sleeper`, and `/api/events` route handlers (mocked `fetch`). Service-worker lifecycle behavior (deploy invalidation, activate cleanup, loud failure on a broken manifest) and the cold-offline hard-navigation path are verified with real-browser Playwright scripts rather than Vitest, since they depend on actual Cache Storage/registration lifecycle.
