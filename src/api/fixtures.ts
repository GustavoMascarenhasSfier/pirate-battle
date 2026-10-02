import { configKey, makeConfig, type GameConfig } from "../game/config";
import { PLAYER_ID, type MatchRecord } from "./contracts";

const base = (): GameConfig => makeConfig({ sessionSec: 90, spawnSec: 3 });

/** Other players plus 12 matches for the local player (3 history pages at page size 5). */
export function buildFixtures(): MatchRecord[] {
  const config = base();
  const names = [
    "Calico",
    "Drake",
    "Edward",
    "Flint",
    "Grace",
    "Henry",
    "Ivy",
    "Jack",
  ];
  const opponents: MatchRecord[] = [
    {
      id: "tie-anne",
      playerId: "p-anne",
      playerName: "Anne",
      playedAt: "2026-08-01T12:00:00.000Z",
      score: 50,
      durationSec: 70,
      endReason: "time",
      config,
    },
    {
      id: "tie-bart",
      playerId: "p-bart",
      playerName: "Bart",
      playedAt: "2026-08-02T12:00:00.000Z",
      score: 50,
      durationSec: 90,
      endReason: "time",
      config,
    },
  ];
  for (let i = 0; i < 16; i++) {
    opponents.push({
      id: `opp-${i}`,
      playerId: `p-${i}`,
      playerName: names[i % names.length]!,
      playedAt: new Date(Date.UTC(2026, 6, 1 + i, 12, 0, 0)).toISOString(),
      score: 40 - i,
      durationSec: 80,
      endReason: i % 2 ? "death" : "time",
      config,
    });
  }
  const history: MatchRecord[] = [];
  for (let i = 0; i < 12; i++) {
    history.push({
      id: `me-${i}`,
      playerId: PLAYER_ID,
      playerName: "You",
      playedAt: new Date(Date.UTC(2026, 8, 1 + i, 12, 0, 0)).toISOString(),
      score: 4 + i,
      durationSec: 60 + i,
      endReason: i % 2 ? "death" : "time",
      config,
    });
  }
  return [...opponents, ...history];
}

/** Score desc, then shorter duration, then earlier date, then id. */
export const compareRank = (a: MatchRecord, b: MatchRecord) =>
  b.score - a.score ||
  a.durationSec - b.durationSec ||
  a.playedAt.localeCompare(b.playedAt) ||
  a.id.localeCompare(b.id);

export const sameConfig = (a: GameConfig, b: GameConfig) =>
  configKey(a) === configKey(b);

export function ranked(
  records: MatchRecord[],
  key: string | null,
): MatchRecord[] {
  return records
    .filter((r) => (key ? configKey(r.config) === key : true))
    .sort(compareRank);
}
