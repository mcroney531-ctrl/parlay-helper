import { NextResponse } from "next/server";
import { z } from "zod";
import { getSleeperSnapshot } from "@/integrations/sleeper/client";

const MAX_PLAYER_IDS = 100;

const querySchema = z.object({
  playerIds: z
    .string()
    .transform((v) => v.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string()).max(MAX_PLAYER_IDS)),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ playerIds: url.searchParams.get("playerIds") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { snapshot, stale, error } = await getSleeperSnapshot();
    const players = Object.fromEntries(
      parsed.data.playerIds
        .map((id) => [id, snapshot.players[id]])
        .filter(([, player]) => player !== undefined),
    );
    return NextResponse.json({
      fetchedAt: snapshot.fetchedAt,
      stale,
      warning: error,
      players,
    });
  } catch {
    return NextResponse.json(
      { error: "Player status provider is unavailable right now.", fetchedAt: null, players: {} },
      { status: 502 },
    );
  }
}
