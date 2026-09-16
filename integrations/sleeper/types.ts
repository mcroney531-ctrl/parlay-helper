export type SleeperPlayer = {
  playerId: string;
  fullName: string;
  team: string | null;
  position: string | null;
  status: string | null; // Active, Questionable, Out, IR, etc.
  depthChartPosition: string | null;
};

export type SleeperSnapshot = {
  fetchedAt: string;
  players: Record<string, SleeperPlayer>;
};
