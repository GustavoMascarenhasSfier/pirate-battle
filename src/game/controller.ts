import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  TilingSprite,
} from "pixi.js";
import { Sfx } from "./audio";
import { Sim, noInput, type EndReason, type Input, type Ship } from "./sim";
import type { GameConfig } from "./config";

export interface Hud {
  score: number;
  hp: number;
  timeLeft: number;
  paused: boolean;
}
export interface Result {
  score: number;
  durationSec: number;
  endReason: EndReason;
}
export interface PublicState {
  score: number;
  hp: number;
  time: number;
  timeLeft: number;
  paused: boolean;
  ended: EndReason | null;
  x: number;
  y: number;
  a: number;
  enemies: {
    id: number;
    kind: Ship["kind"];
    x: number;
    y: number;
    hp: number;
  }[];
  bullets: { id: number; fromPlayer: boolean; x: number; y: number }[];
  entities: number;
}
export interface PirateHook {
  id: number;
  ready: boolean;
  testClock: boolean;
  advance: (seconds: number) => void;
  state: () => PublicState;
}

const base = import.meta.env.BASE_URL;
const SHIP = { player: "ship_1", chaser: "ship_3", shooter: "ship_5" } as const;
const SHIP_SCALE = 0.5;
const SHIP_HALF = (113 * SHIP_SCALE) / 2;
const KEYS: Record<string, keyof Input> = {
  ArrowUp: "forward",
  w: "forward",
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
  " ": "front",
  q: "sideL",
  e: "sideR",
};
const STEP = 1 / 60;
let hookSeq = 0;

export const ASSET_URLS = [
  ...Object.values(SHIP).map((n) => `${base}assets/ships/${n}.png`),
  `${base}assets/cannon_ball.png`,
  `${base}assets/effects/explosion_1.png`,
  `${base}assets/effects/explosion_2.png`,
  `${base}assets/effects/explosion_3.png`,
  `${base}assets/effects/fire_1.png`,
  `${base}assets/effects/fire_2.png`,
];

export async function preload(
  onProgress?: (progress: number) => void,
): Promise<void> {
  const win = window as unknown as { __failAssets?: boolean };
  if (win.__failAssets) {
    win.__failAssets = false;
    await Assets.load(`${base}assets/ships/missing-ship.png`);
  }
  await Assets.load(ASSET_URLS, onProgress);
}

export async function resetAssets(): Promise<void> {
  Assets.reset();
}

function waterTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1b6f99";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#2f8eb8";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 18);
  g.bezierCurveTo(16, 10, 32, 26, 64, 16);
  g.stroke();
  g.beginPath();
  g.moveTo(0, 44);
  g.bezierCurveTo(20, 36, 40, 52, 64, 40);
  g.stroke();
  return Texture.from(c);
}

type Fx = {
  s: Sprite;
  t: number;
  life: number;
  frames: Texture[];
  scale: number;
};

export class GameController {
  private app = new Application();
  private sim: Sim;
  private input = noInput();
  private paused = false;
  private world = new Container();
  private bars = new Graphics();
  private sprites = new Map<string, Sprite>();
  private fx: Fx[] = [];
  private acc = 0;
  private lastHud = 0;
  private disposed = false;
  private ready = false;
  private endedSent = false;
  private sfx = new Sfx();
  private hookId = 0;
  readonly testClock: boolean;

  constructor(
    private host: HTMLElement,
    cfg: GameConfig,
    private onHud: (h: Hud) => void,
    private onEnd: (r: Result) => void,
    opts?: { seed?: number; testClock?: boolean },
  ) {
    this.sim = new Sim(cfg, opts?.seed ?? Date.now() % 1_000_000_007);
    this.testClock = opts?.testClock === true;
    if (this.testClock) this.sfx.muted = true;
  }

  async start() {
    const { w, h } = this.sim.cfg.arena;
    await this.app.init({
      resizeTo: this.host,
      background: "#14597c",
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preserveDrawingBuffer: this.testClock,
    });
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.host.appendChild(this.app.canvas);
    const water = new TilingSprite({
      texture: waterTexture(),
      width: w,
      height: h,
    });
    const land = new Graphics();
    for (const i of this.sim.islands) {
      land
        .circle(i.x, i.y, i.r)
        .fill(0xd7c08a)
        .stroke({ width: 8, color: 0x5f8f45 });
      land.circle(i.x, i.y, i.r * 0.68).fill(0x3f8f45);
      land.circle(i.x - i.r * 0.15, i.y - i.r * 0.1, 8).fill(0x245c30);
    }
    this.world.addChild(water, land, this.bars);
    this.app.stage.addChild(this.world);
    this.fit();
    this.app.renderer.on("resize", this.fit);
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.vis);
    this.app.ticker.add(() => this.frame(this.app.ticker.deltaMS / 1000));
    void this.sfx.load(base).then(() => {
      if (!this.disposed && !this.testClock) this.sfx.startAmbience();
    });
    this.draw(0);
    this.ready = true;
    this.emit();
    this.publish();
  }

  private publish() {
    this.hookId = ++hookSeq;
    const hook: PirateHook = {
      id: this.hookId,
      ready: true,
      testClock: this.testClock,
      advance: this.advance,
      state: () => this.snapshot(),
    };
    (window as unknown as { __pirate?: PirateHook }).__pirate = hook;
  }

  private fit = () => {
    const { w, h } = this.sim.cfg.arena;
    const s = Math.min(this.app.screen.width / w, this.app.screen.height / h);
    this.world.scale.set(s);
    this.world.position.set(
      (this.app.screen.width - w * s) / 2,
      (this.app.screen.height - h * s) / 2,
    );
  };

  private kd = (e: KeyboardEvent) => {
    if (!this.ready || this.sim.ended) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    this.sfx.resume();
    const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (k) {
      this.input[k] = true;
      e.preventDefault();
    }
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (this.paused) this.resume();
      else this.pause();
    }
  };

  private ku = (e: KeyboardEvent) => {
    const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (k) this.input[k] = false;
  };

  private onBlur = () => {
    if (this.ready && !this.sim.ended) this.pause();
  };
  private vis = () => {
    if (document.hidden) this.pause();
  };
  setInput(k: keyof Input, v: boolean) {
    this.input[k] = v;
    this.sfx.resume();
  }
  pause = () => {
    if (this.ready && !this.sim.ended) {
      this.paused = true;
      this.input = noInput();
      this.acc = 0;
      this.emit();
    }
  };
  resume = () => {
    this.paused = false;
    this.acc = 0;
    this.input = noInput();
    this.emit();
  };

  private emit() {
    const s = this.sim;
    this.onHud({
      score: s.score,
      hp: s.player.hp,
      timeLeft: Math.max(0, Math.ceil(s.cfg.sessionSec - s.time)),
      paused: this.paused,
    });
  }

  private snapshot(): PublicState {
    const s = this.sim;
    return {
      score: s.score,
      hp: s.player.hp,
      time: s.time,
      timeLeft: Math.max(0, s.cfg.sessionSec - s.time),
      paused: this.paused,
      ended: s.ended,
      x: s.player.x,
      y: s.player.y,
      a: s.player.a,
      enemies: s.enemies.map((e) => ({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        hp: e.hp,
      })),
      bullets: s.bullets.map((b) => ({
        id: b.id,
        fromPlayer: b.fromPlayer,
        x: b.x,
        y: b.y,
      })),
      entities: 1 + s.enemies.length + s.bullets.length,
    };
  }

  /** Runs the real fixed step. No-ops while paused or after the match ends. */
  advance = (seconds: number) => {
    if (!this.ready || this.disposed || this.paused || this.sim.ended) {
      this.emit();
      return;
    }
    let left = seconds;
    while (left > 1e-8 && !this.sim.ended) {
      const d = Math.min(STEP, left);
      this.sim.step(d, this.input);
      left -= d;
      this.consume();
    }
    this.finish();
    this.draw(Math.min(seconds, 0.05));
    this.emit();
  };

  private frame(dt: number) {
    if (!this.testClock && !this.paused && !this.sim.ended) {
      this.acc += Math.min(dt, 0.25);
      while (this.acc >= STEP && !this.sim.ended) {
        this.sim.step(STEP, this.input);
        this.acc -= STEP;
        this.consume();
      }
      this.finish();
    }
    this.draw(this.paused ? 0 : dt);
    const now = performance.now();
    if (now - this.lastHud > 150) {
      this.lastHud = now;
      this.emit();
    }
  }

  private consume() {
    let shot = false;
    for (const e of this.sim.events) {
      if (e.t === "shot") {
        if (!shot) {
          this.sfx.play("shot");
          shot = true;
        }
        this.burst(e.x, e.y, "shot");
      } else if (e.t === "hit") {
        this.sfx.play("hit");
        this.burst(e.x, e.y, "hit");
      } else {
        this.sfx.play("boom");
        this.burst(e.x, e.y, "boom");
      }
    }
  }

  private finish() {
    if (!this.sim.ended || this.endedSent) return;
    this.endedSent = true;
    this.input = noInput();
    this.onEnd({
      score: this.sim.score,
      durationSec: Math.round(this.sim.time),
      endReason: this.sim.ended,
    });
  }

  private tex(path: string) {
    return Texture.from(`${base}assets/${path}`);
  }
  private sprite(key: string, path: string): Sprite {
    let s = this.sprites.get(key);
    if (!s) {
      s = new Sprite(this.tex(path));
      s.anchor.set(0.5);
      this.world.addChild(s);
      this.sprites.set(key, s);
    }
    return s;
  }

  private burst(x: number, y: number, kind: "shot" | "hit" | "boom") {
    const frames =
      kind === "boom"
        ? [
            this.tex("effects/explosion_1.png"),
            this.tex("effects/explosion_2.png"),
            this.tex("effects/explosion_3.png"),
          ]
        : [this.tex("effects/fire_1.png"), this.tex("effects/fire_2.png")];
    const s = new Sprite(frames[0]!);
    s.anchor.set(0.5);
    s.position.set(x, y);
    const scale = kind === "boom" ? 1.15 : kind === "shot" ? 0.45 : 0.7;
    s.scale.set(scale);
    this.world.addChild(s);
    this.fx.push({
      s,
      t: kind === "boom" ? 0.48 : 0.2,
      life: kind === "boom" ? 0.48 : 0.2,
      frames,
      scale,
    });
  }

  private draw(dt: number) {
    const live = new Set<string>();
    const g = this.bars;
    g.clear();
    const ship = (e: Ship, id: string, file: string) => {
      live.add(id);
      const sp = this.sprite(id, `ships/${file}.png`);
      sp.position.set(e.x, e.y);
      sp.rotation = e.a;
      sp.scale.set(SHIP_SCALE);
      const damage = Math.min(1, Math.max(0, 1 - e.hp / e.maxHp));
      const channel = Math.round(255 - damage * 170);
      sp.tint = (255 << 16) | (channel << 8) | channel;
      if (damage > 0.45) {
        live.add(`f${id}`);
        const fire = this.sprite(`f${id}`, "effects/fire_1.png");
        fire.position.set(e.x, e.y + 8);
        fire.rotation = 0;
        fire.scale.set(0.45);
        fire.alpha = 0.55 + damage * 0.4;
        fire.tint = 0xffffff;
      }
      const top = e.y - SHIP_HALF - 8;
      const ratio = Math.max(0, e.hp / e.maxHp);
      g.rect(e.x - 22, top, 44, 6).fill(0x142028);
      g.rect(e.x - 22, top, 44 * ratio, 6).fill(
        e.kind === "player" ? 0x43a047 : 0xe53935,
      );
    };
    ship(this.sim.player, "p", SHIP.player);
    for (const e of this.sim.enemies) ship(e, `e${e.id}`, SHIP[e.kind]);
    for (const b of this.sim.bullets) {
      const id = `b${b.id}`;
      live.add(id);
      const sp = this.sprite(id, "cannon_ball.png");
      sp.position.set(b.x, b.y);
      sp.rotation = 0;
      sp.scale.set(1);
      sp.tint = 0xffffff;
      sp.alpha = 1;
    }
    for (const [k, sp] of this.sprites)
      if (!live.has(k)) {
        sp.destroy();
        this.sprites.delete(k);
      }
    this.fx = this.fx.filter((f) => {
      f.t -= dt;
      const p = 1 - f.t / f.life;
      const frame =
        f.frames[
          Math.min(
            f.frames.length - 1,
            Math.max(0, Math.floor(p * f.frames.length)),
          )
        ];
      if (frame) f.s.texture = frame;
      f.s.alpha = Math.max(0, f.t / f.life);
      f.s.scale.set(f.scale * (0.85 + Math.max(0, p) * 0.4));
      if (f.t <= 0) {
        f.s.destroy();
        return false;
      }
      return true;
    });
    this.world.addChild(this.bars);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("keydown", this.kd);
    window.removeEventListener("keyup", this.ku);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.vis);
    this.sfx.dispose();
    const hook = (window as unknown as { __pirate?: PirateHook }).__pirate;
    if (hook?.id === this.hookId)
      delete (window as unknown as { __pirate?: PirateHook }).__pirate;
    if (this.ready) {
      this.app.ticker.stop();
      this.app.destroy(true, { children: true });
    }
  }
}
