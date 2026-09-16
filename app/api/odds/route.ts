import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchEventOdds } from "@/integrations/odds-api/client";
import { bookmakerKeyForSportsbook, sportKeyForLeague } from "@/integrations/odds-api/sportKeys";
import { DEFAULT_MAX_REQUESTS, DEFAULT_WINDOW_MS, checkRateLimit, clientKeyFromRequest } from "@/integrations/rateLimit";

const MAX_LEGS_PER_REQUEST = 50;
const MAX_EVENTS_PER_REQUEST = 15;

const requestSchema = z.object({
  sportsbook: z.string().min(1).max(80),
  legs: z
    .array(
      z.object({
        ideaId: z.string().min(1).max(200),
        league: z.string().min(1).max(40),
        // Interpolated as a URL path segment in integrations/odds-api/client.ts —
        // restrict to a safe charset so it can never smuggle a path traversal or
        // extra path segments into the upstream request (the host/protocol are
        // always hardcoded regardless, but this keeps the path itself honest too).
        eventId: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[A-Za-z0-9_-]+$/, "eventId must be alphanumeric (with - or _)"),
        marketKey: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(MAX_LEGS_PER_REQUEST),
});

type EventGroup = {
  league: string;
  eventId: string;
  marketKeys: Set<string>;
  ideaIds: string[];
};

// Groups by event + market set, per the handoff's "18 legs != 18 requests" rule.
export function groupLegsByEvent(legs: { ideaId: string; league: string; eventId: string; marketKey: string }[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const leg of legs) {
    const key = `${leg.league}::${leg.eventId}`;
    const group = groups.get(key) ?? { league: leg.league, eventId: leg.eventId, marketKeys: new Set(), ideaIds: [] };
    group.marketKeys.add(leg.marketKey);
    group.ideaIds.push(leg.ideaId);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function POST(request: Request) {
  const clientKey = clientKeyFromRequest(request);
  const rateLimit = checkRateLimit(clientKey, DEFAULT_MAX_REQUESTS, DEFAULT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues }, { status: 400 });
  }

  const { sportsbook, legs } = parsed.data;
  const groups = groupLegsByEvent(legs);

  if (groups.length > MAX_EVENTS_PER_REQUEST) {
    return NextResponse.json({ error: "Too many distinct events in one request." }, { status: 413 });
  }

  const bookmakerKey = bookmakerKeyForSportsbook(sportsbook);
  if (!bookmakerKey) {
    return NextResponse.json(
      {
        results: groups.map((g) => ({
          eventId: g.eventId,
          ideaIds: g.ideaIds,
          status: "not_configured",
          fetchedAt: new Date().toISOString(),
          warning: `Sportsbook "${sportsbook}" is not supported by the odds provider yet.`,
          outcomes: [],
        })),
      },
      { status: 200 },
    );
  }

  const results = await Promise.all(
    groups.map(async (group) => {
      const sportKey = sportKeyForLeague(group.league);
      if (!sportKey) {
        return {
          eventId: group.eventId,
          ideaIds: group.ideaIds,
          status: "not_configured" as const,
          fetchedAt: new Date().toISOString(),
          warning: `League "${group.league}" is not supported by the odds provider yet.`,
          outcomes: [],
        };
      }

      const fetchResult = await fetchEventOdds({
        sportKey,
        eventId: group.eventId,
        bookmakerKey,
        sportsbookLabel: sportsbook,
        marketKeys: [...group.marketKeys],
      });

      return {
        eventId: group.eventId,
        ideaIds: group.ideaIds,
        status: fetchResult.status,
        fetchedAt: fetchResult.fetchedAt,
        warning: fetchResult.warning,
        outcomes: fetchResult.odds?.outcomes ?? [],
      };
    }),
  );

  return NextResponse.json({ results });
}
