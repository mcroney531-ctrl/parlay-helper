import { NextResponse } from "next/server";
import { z } from "zod";
import { listUpcomingEvents } from "@/integrations/odds-api/events";
import { sportKeyForLeague } from "@/integrations/odds-api/sportKeys";
import { checkRateLimit, clientKeyFromRequest } from "@/integrations/rateLimit";

const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const querySchema = z.object({
  league: z.string().trim().min(1).max(40),
});

export async function GET(request: Request) {
  const clientKey = clientKeyFromRequest(request);
  if (!checkRateLimit(clientKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ league: url.searchParams.get("league") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a league." }, { status: 400 });
  }

  const sportKey = sportKeyForLeague(parsed.data.league);
  if (!sportKey) {
    return NextResponse.json({ status: "not_configured", events: [] });
  }

  try {
    const events = await listUpcomingEvents(sportKey);
    return NextResponse.json({ status: process.env.ODDS_API_KEY ? "ok" : "not_configured", events });
  } catch {
    return NextResponse.json({ status: "provider_error", events: [] });
  }
}
