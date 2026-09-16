import { NextResponse } from "next/server";
import { z } from "zod";
import { getSleeperSnapshot } from "@/integrations/sleeper/client";
import { searchPlayersByName } from "@/integrations/sleeper/search";

const MAX_PLAYER_IDS = 100;

const querySchema = z.object({
  playerIds: z
    .string()
    .transform((v) => v.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string()).max(MAX_PLAYER_IDS))
    .optional(),
  search: z.string().trim().max(80).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    playerIds: url.searchParams.get("playerIds") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  if (!parsed.success || (!parsed.data.playerIds && !parsed.data.search)) {
    return NextResponse.json({ error: "Provide either playerIds or search." }, { status: 400 });
  }

  try {
    const { snapshot, stale, error } = await getSleeperSnapshot();

    if (parsed.data.search) {
      const results = searchPlayersByName(snapshot.players, parsed.data.search);
      return NextResponse.json({ fetchedAt: snapshot.fetchedAt, stale, warning: error, results });
    }

    const players = Object.fromEntries(
      (parsed.data.playerIds ?? [])
        .map((id) => [id, snapshot.players[id]])
        .filter(([, player]) => player !== undefined),
    );
    return NextResponse.json({ fetchedAt: snapshot.fetchedAt, stale, warning: error, players });
  } catch {
    return NextResponse.json(
      { error: "Player status provider is unavailable right now.", fetchedAt: null, players: {}, results: [] },
      { status: 502 },
    );
  }
}
