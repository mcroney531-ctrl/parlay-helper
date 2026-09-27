// Schema version history. Bump SCHEMA_VERSION and add an upgrade step in db.ts
// whenever a store or index changes shape. Never mutate past steps.

export const DB_NAME = "parlay-helper";
export const SCHEMA_VERSION = 3;

export const STORES = {
  ideas: "ideas",
  liveContext: "liveContext",
  candidates: "candidates",
  finalized: "finalized",
  meta: "meta",
} as const;
