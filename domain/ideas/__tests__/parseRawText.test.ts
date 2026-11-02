import { describe, expect, it } from "vitest";
import { parseRawText } from "../parseRawText";

// Quick-add prefill (chunk 4b, Trevor 2026-11-02). One row per input: the
// table A brought to Trevor, with the results he decided on, plus notes.
const rows: [input: string, expected: { playerName: string | null; team: string | null; note: string | null }][] = [
  // Team-first text is a team bet: Team, never Player.
  ["Seattle Seahawks +6.5", { playerName: null, team: "Seattle Seahawks", note: null }],
  ["Seahawks +6.5", { playerName: null, team: "Seattle Seahawks", note: null }],
  ["Seahawks ML", { playerName: null, team: "Seattle Seahawks", note: null }],
  ["Rams -3", { playerName: null, team: "Los Angeles Rams", note: null }],
  ["Los Angeles Rams ML", { playerName: null, team: "Los Angeles Rams", note: null }],
  ["LA Rams -3.5", { playerName: null, team: "Los Angeles Rams", note: null }],
  ["Kansas City -3", { playerName: null, team: "Kansas City Chiefs", note: null }],
  ["New York Giants +3", { playerName: null, team: "New York Giants", note: null }],
  ["San Francisco 49ers ML", { playerName: null, team: "San Francisco 49ers", note: null }],
  // A two-word city always means the team (Trevor's review of 1c3c2e0).
  ["Tampa Bay Bucs +3", { playerName: null, team: "Tampa Bay Buccaneers", note: null }],
  ["Tampa Bay Bucks +3", { playerName: null, team: "Tampa Bay Buccaneers", note: null }],
  ["Green Bay -3", { playerName: null, team: "Green Bay Packers", note: null }],
  // Short names.
  ["Niners -6", { playerName: null, team: "San Francisco 49ers", note: null }],
  ["Bucs ML", { playerName: null, team: "Tampa Bay Buccaneers", note: null }],
  ["Pats +3", { playerName: null, team: "New England Patriots", note: null }],
  ["Jags +7", { playerName: null, team: "Jacksonville Jaguars", note: null }],
  ["Fins -2.5", { playerName: null, team: "Miami Dolphins", note: null }],
  // Codes, in capitals only; a code followed by a name is a player.
  ["KC -3", { playerName: null, team: "Kansas City Chiefs", note: null }],
  ["SF -6", { playerName: null, team: "San Francisco 49ers", note: null }],
  ["NYJ +7 - fade", { playerName: null, team: "New York Jets", note: "fade" }],
  ["KC Chiefs ML", { playerName: null, team: "Kansas City Chiefs", note: null }],
  ["kc -3", { playerName: null, team: null, note: null }],
  ["KC Concepcion over 40.5", { playerName: "KC Concepcion", team: null, note: null }],
  ["No TD Puka", { playerName: null, team: null, note: null }],
  ["Yes Puka anytime", { playerName: null, team: null, note: null }],
  // A city two teams share: the next word decides, otherwise no team (and no player).
  ["NY Jets +7", { playerName: null, team: "New York Jets", note: null }],
  ["Los Angeles ML", { playerName: null, team: null, note: null }],
  ["New York +3", { playerName: null, team: null, note: null }],
  // A city one team has, followed by a name, is a player.
  ["Dallas Goedert over 40.5", { playerName: "Dallas Goedert", team: null, note: null }],
  // A matchup names no one team.
  ["Seahawks/Rams over 47.5", { playerName: null, team: null, note: null }],
  // Over/Under (and O/U) are never a player.
  ["Over 47.5 Seahawks Rams", { playerName: null, team: null, note: null }],
  ["O 47.5", { playerName: null, team: null, note: null }],
  ["U47.5", { playerName: null, team: null, note: null }],
  ["Puka Over 63.5", { playerName: "Puka", team: null, note: null }],
  // Nor are bet words (B, on 4a01a3a).
  ["Cards ML", { playerName: "Cards", team: null, note: null }],
  ["Puka ATD", { playerName: "Puka", team: null, note: null }],
  ["Puka TD -150", { playerName: "Puka", team: null, note: null }],
  ["Bijan Robinson FTD", { playerName: "Bijan Robinson", team: null, note: null }],
  ["Kelce TT over 5.5", { playerName: "Kelce", team: null, note: null }],
  ["PK Rams", { playerName: null, team: null, note: null }],
  // Players, as before.
  ["Puka 80+ Sunday - like matchup", { playerName: "Puka", team: null, note: "like matchup" }],
  ["Puka Nacua over 63.5", { playerName: "Puka Nacua", team: null, note: null }],
  ["Amon-Ra St. Brown anytime TD", { playerName: "Amon-Ra St. Brown", team: null, note: null }],
  ["Jaxon Smith-Njigba over 5.5", { playerName: "Jaxon Smith-Njigba", team: null, note: null }],
  ["puka overs", { playerName: null, team: null, note: null }],
  // Notes: a hyphen with spaces around it, or an en/em dash with or without.
  ["Puka Nacua - lean over", { playerName: "Puka Nacua", team: null, note: "lean over" }],
  ["Puka—lean over", { playerName: "Puka", team: null, note: "lean over" }],
  ["Puka – lean over", { playerName: "Puka", team: null, note: "lean over" }],
  ["Rams -3 - revenge game", { playerName: null, team: "Los Angeles Rams", note: "revenge game" }],
];

describe("parseRawText", () => {
  it.each(rows)("%s", (input, expected) => {
    expect(parseRawText(input)).toEqual(expected);
  });
});
