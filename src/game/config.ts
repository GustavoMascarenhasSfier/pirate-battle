export interface GameConfig {
  sessionSec: number;
  spawnSec: number;
  arena: { w: number; h: number };
  player: {
    hp: number;
    speed: number;
    turn: number;
    radius: number;
    frontCd: number;
    sideCd: number;
  };
  bullet: {
    speed: number;
    life: number;
    damage: number;
    radius: number;
    sideSpacing: number;
  };
  chaser: {
    hp: number;
    speed: number;
    turn: number;
    radius: number;
    contactDamage: number;
  };
  shooter: {
    hp: number;
    speed: number;
    turn: number;
    radius: number;
    range: number;
    cd: number;
    damage: number;
  };
  /** Share of spawns that are Chasers, from 0 to 1. The mix is deterministic (see ARCHITECTURE.md). */
  spawn: { minPlayerDist: number; chaserRatio: number };
}

export const LIMITS = {
  sessionSec: { min: 60, max: 180 },
  /** Enemy spawn interval in seconds. Must be > 0. The options screen accepts 1–15. */
  spawnSec: { min: 1, max: 15 },
};

export const DEFAULT_OPTIONS = { sessionSec: 90, spawnSec: 3 };

export const makeConfig = (o = DEFAULT_OPTIONS): GameConfig => ({
  sessionSec: o.sessionSec,
  spawnSec: o.spawnSec,
  arena: { w: 1280, h: 800 },
  player: {
    hp: 100,
    speed: 190,
    turn: 2.6,
    radius: 26,
    frontCd: 0.35,
    sideCd: 1.2,
  },
  bullet: { speed: 520, life: 1.4, damage: 2, radius: 5, sideSpacing: 22 },
  chaser: { hp: 2, speed: 120, turn: 2.2, radius: 24, contactDamage: 20 },
  shooter: {
    hp: 3,
    speed: 90,
    turn: 1.8,
    radius: 26,
    range: 320,
    cd: 2.8,
    damage: 3,
  },
  spawn: { minPlayerDist: 350, chaserRatio: 0.5 },
});

/** Stable identity for “same configuration” ranking comparisons. */
export const configKey = (c: GameConfig): string => JSON.stringify(c);
