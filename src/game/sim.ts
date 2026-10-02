import type { GameConfig } from "./config";

export interface Ship {
  id: number;
  x: number;
  y: number;
  a: number;
  hp: number;
  maxHp: number;
  r: number;
  cd: number;
  cd2: number;
  kind: "player" | "chaser" | "shooter";
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  fromPlayer: boolean;
}

export interface Island {
  x: number;
  y: number;
  r: number;
}
export type SimEvent = { t: "shot" | "hit" | "boom"; x: number; y: number };
export interface Input {
  forward: boolean;
  left: boolean;
  right: boolean;
  front: boolean;
  sideL: boolean;
  sideR: boolean;
}
export type EndReason = "time" | "death";
export const noInput = (): Input => ({
  forward: false,
  left: false,
  right: false,
  front: false,
  sideL: false,
  sideR: false,
});

const rng = (s: number) => () => {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Sim {
  player: Ship;
  enemies: Ship[] = [];
  bullets: Bullet[] = [];
  events: SimEvent[] = [];
  islands: Island[];
  time = 0;
  score = 0;
  ended: EndReason | null = null;
  private nextId = 1;
  private spawnT = 0;
  private mix = 0;
  private rand: () => number;

  constructor(
    readonly cfg: GameConfig,
    seed = 1,
  ) {
    this.rand = rng(seed);
    const { w, h } = cfg.arena;
    this.islands = [
      { x: w * 0.5, y: h * 0.5, r: 90 },
      { x: w * 0.22, y: h * 0.28, r: 60 },
      { x: w * 0.78, y: h * 0.72, r: 70 },
    ];
    this.player = {
      id: 0,
      x: w * 0.5,
      y: h * 0.85,
      a: 0,
      hp: cfg.player.hp,
      maxHp: cfg.player.hp,
      r: cfg.player.radius,
      cd: 0,
      cd2: 0,
      kind: "player",
    };
  }

  private blocked(x: number, y: number, r: number) {
    return this.islands.some((i) => Math.hypot(i.x - x, i.y - y) < i.r + r);
  }

  /** Move `dist` along `angle`. Islands push the ship out. Returns whether an island was touched. */
  private relocate(s: Ship, angle: number, dist: number) {
    const { w, h } = this.cfg.arena;
    let nx = s.x + Math.sin(angle) * dist;
    let ny = s.y - Math.cos(angle) * dist;
    const clamp = () => {
      nx = Math.min(w - s.r, Math.max(s.r, nx));
      ny = Math.min(h - s.r, Math.max(s.r, ny));
    };
    clamp();
    let blocked = false;
    for (const i of this.islands) {
      const dx = nx - i.x;
      const dy = ny - i.y;
      const m = Math.hypot(dx, dy) || 0.0001;
      const min = i.r + s.r;
      if (m < min) {
        blocked = true;
        nx = i.x + (dx / m) * min;
        ny = i.y + (dy / m) * min;
      }
    }
    clamp();
    return { nx, ny, blocked };
  }

  private fire(
    s: Ship,
    a: number,
    ox: number,
    oy: number,
    fromPlayer: boolean,
    dmg: number,
  ) {
    const b = this.cfg.bullet;
    this.bullets.push({
      id: this.nextId++,
      x: s.x + ox,
      y: s.y + oy,
      vx: Math.sin(a) * b.speed,
      vy: -Math.cos(a) * b.speed,
      life: b.life,
      dmg,
      fromPlayer,
    });
    this.events.push({ t: "shot", x: s.x + ox, y: s.y + oy });
  }

  private broadside(s: Ship, sign: number) {
    const a = s.a + (sign * Math.PI) / 2;
    const sp = this.cfg.bullet.sideSpacing;
    for (const k of [-1, 0, 1]) {
      this.fire(
        s,
        a,
        Math.sin(s.a) * k * sp,
        -Math.cos(s.a) * k * sp,
        true,
        this.cfg.bullet.damage,
      );
    }
  }

  private spawn() {
    const c = this.cfg;
    const { w, h } = c.arena;
    for (let k = 0; k < 40; k++) {
      const x = 40 + this.rand() * (w - 80);
      const y = 40 + this.rand() * (h - 80);
      if (
        this.blocked(x, y, 40) ||
        Math.hypot(x - this.player.x, y - this.player.y) < c.spawn.minPlayerDist
      )
        continue;
      const ratio = Math.min(1, Math.max(0, c.spawn.chaserRatio));
      this.mix += ratio;
      const chaser = this.mix >= 1 - 1e-9;
      if (chaser) this.mix -= 1;
      const stats = chaser ? c.chaser : c.shooter;
      this.enemies.push({
        id: this.nextId++,
        x,
        y,
        a: 0,
        hp: stats.hp,
        maxHp: stats.hp,
        r: stats.radius,
        cd: 0,
        cd2: 0,
        kind: chaser ? "chaser" : "shooter",
      });
      return;
    }
  }

  step(dt: number, inp: Input) {
    if (this.ended) return;
    const c = this.cfg;
    const p = this.player;
    this.events = [];
    if (inp.left !== inp.right)
      p.a = wrap(p.a + (inp.right ? 1 : -1) * c.player.turn * dt);
    if (inp.forward) {
      const m = this.relocate(p, p.a, c.player.speed * dt);
      p.x = m.nx;
      p.y = m.ny;
    }
    p.cd -= dt;
    p.cd2 -= dt;
    if (inp.front && p.cd <= 0) {
      p.cd = c.player.frontCd;
      this.fire(p, p.a, 0, 0, true, c.bullet.damage);
    } else p.cd = Math.max(0, p.cd);
    if ((inp.sideL || inp.sideR) && p.cd2 <= 0) {
      p.cd2 = c.player.sideCd;
      if (inp.sideL) this.broadside(p, -1);
      if (inp.sideR) this.broadside(p, 1);
    } else p.cd2 = Math.max(0, p.cd2);

    this.spawnT += dt;
    while (this.spawnT >= c.spawnSec - 1e-6) {
      this.spawnT -= c.spawnSec;
      this.spawn();
    }

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const stats = e.kind === "chaser" ? c.chaser : c.shooter;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const diff = wrap(Math.atan2(dx, -dy) - e.a);
      e.a = wrap(
        e.a + Math.max(-stats.turn * dt, Math.min(stats.turn * dt, diff)),
      );
      const step = stats.speed * dt;
      const pursue = e.kind === "chaser" || dist > c.shooter.range;
      if (pursue) {
        let m = this.relocate(e, e.a, step);
        if (m.blocked) {
          let best = m;
          let bestD = Math.hypot(m.nx - p.x, m.ny - p.y);
          for (const off of [0.8, -0.8, 1.6, -1.6]) {
            const alt = this.relocate(e, e.a + off, step);
            const d = Math.hypot(alt.nx - p.x, alt.ny - p.y);
            if (d < bestD) {
              best = alt;
              bestD = d;
            }
          }
          m = best;
        }
        e.x = m.nx;
        e.y = m.ny;
      }
      if (e.kind === "shooter") {
        e.cd -= dt;
        const now = Math.hypot(p.x - e.x, p.y - e.y);
        if (now <= c.shooter.range && e.cd <= 0) {
          e.cd = c.shooter.cd;
          this.fire(e, e.a, 0, 0, false, c.shooter.damage);
        } else e.cd = Math.max(0, e.cd);
      }
      if (
        e.kind === "chaser" &&
        e.hp > 0 &&
        Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r
      ) {
        p.hp -= c.chaser.contactDamage;
        e.hp = 0;
        this.events.push({ t: "boom", x: e.x, y: e.y });
      }
    }

    if (p.hp > 0) {
      for (const b of this.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0) continue;
        if (
          b.x < 0 ||
          b.y < 0 ||
          b.x > c.arena.w ||
          b.y > c.arena.h ||
          this.blocked(b.x, b.y, c.bullet.radius)
        ) {
          b.life = 0;
          continue;
        }
        const targets = b.fromPlayer ? this.enemies : [p];
        for (const t of targets) {
          if (
            t.hp > 0 &&
            Math.hypot(t.x - b.x, t.y - b.y) < t.r + c.bullet.radius
          ) {
            t.hp -= b.dmg;
            b.life = 0;
            this.events.push({ t: "hit", x: b.x, y: b.y });
            if (t.hp <= 0 && b.fromPlayer && t.kind !== "player") {
              this.score++;
              this.events.push({ t: "boom", x: t.x, y: t.y });
            }
            break;
          }
        }
      }
    } else {
      this.bullets = [];
    }

    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.time += dt;
    if (p.hp <= 0) {
      p.hp = 0;
      this.ended = "death";
    } else if (this.time >= c.sessionSec - 1e-4) {
      this.time = c.sessionSec;
      this.ended = "time";
    }
  }
}
