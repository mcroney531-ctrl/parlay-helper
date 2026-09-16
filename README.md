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

- `npm run dev` — dev server
- `npm run build` — production build
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
- **Market/league fields**: the Bucket's structured-details form picks markets from a curated list of real Odds API keys (`integrations/odds-api/marketKeys.ts`) instead of deriving a key from free text, and has explicit League and Player ID fields — both required for the odds/Sleeper refresh to have anything to match against.
- **Sleeper route**: caches the full player payload in-memory for ~24h and only ever returns the requested player-id subset to the client.
- **Refresh ordering**: odds and player-status refreshes run sequentially (never `Promise.all`) against the same LiveContext record, and track their own freshness (`oddsFetchedAt`/`playerStatusFetchedAt`) independently so refreshing one never overstates the freshness of the other.
- **Offline**: `public/sw.js` precaches all four top-level routes (capture, bucket, builder, history) plus the manifest on install, then caches further same-origin GETs network-first; it never intercepts `/api/*`. Capture, bucket, and builder work fully offline since they only touch IndexedDB.

## Testing

`npm run test` runs the full Vitest suite: odds conversion/estimate math, correlation/concentration rules, change-radar diffing, the IndexedDB-backed idea/candidate/finalize services (via `fake-indexeddb`), and the `/api/odds` and `/api/sleeper` route handlers (mocked `fetch`).
