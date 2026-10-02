import type { GameConfig } from "../game/config";

export interface MatchConfig {
  sessionSec: number;
  spawnSec: number;
}

export interface MatchRecord {
  id: string;
  playerId: string;
  playerName: string;
  playedAt: string;
  score: number;
  durationSec: number;
  endReason: "time" | "death";
  config: GameConfig;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type Scenario =
  | "normal"
  | "empty"
  | "slow"
  | "variable"
  | "out-of-order"
  | "ranking-error"
  | "history-error"
  | "ranking-4xx"
  | "get-timeout"
  | "connection-error"
  | "post-timeout-after-save"
  | "post-down";

export const SCENARIOS: Scenario[] = [
  "normal",
  "empty",
  "slow",
  "variable",
  "out-of-order",
  "ranking-error",
  "history-error",
  "ranking-4xx",
  "get-timeout",
  "connection-error",
  "post-timeout-after-save",
  "post-down",
];

export const PLAYER_ID = "me";
export const PAGE_SIZE = 5;
