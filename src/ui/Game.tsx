import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  GameController,
  preload,
  resetAssets,
  type Hud,
  type Result,
} from "../game/controller";
import type { GameConfig } from "../game/config";
import type { Input } from "../game/sim";

const BTN: [string, keyof Input, string][] = [
  ["⟲", "left", "Turn left"],
  ["⟳", "right", "Turn right"],
  ["▲", "forward", "Forward"],
  ["◀", "sideL", "Fire left"],
  ["●", "front", "Fire front"],
  ["▶", "sideR", "Fire right"],
];

function readLaunch() {
  const q = new URLSearchParams(window.location.search);
  const seedRaw = q.get("seed");
  return {
    seed: seedRaw == null || seedRaw === "" ? undefined : Number(seedRaw),
    testClock: q.get("testClock") === "1",
    failAssets: q.get("failAssets") === "1",
  };
}

export function Game({
  cfg,
  onEnd,
  onExit,
}: {
  cfg: GameConfig;
  onEnd: (r: Result) => void;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<GameController | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({
    score: 0,
    hp: cfg.player.hp,
    timeLeft: cfg.sessionSec,
    paused: false,
  });
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const announce = hud.paused ? "Game paused" : "Game running";

  useEffect(() => {
    const coarse =
      window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0;
    document.documentElement.classList.toggle("touch-ui", coarse);
    return () => document.documentElement.classList.remove("touch-ui");
  }, []);

  useEffect(() => {
    let cancelled = false;
    let c: GameController | null = null;
    const launch = readLaunch();
    const run = async () => {
      if (launch.failAssets && attempt === 0)
        (window as unknown as { __failAssets?: boolean }).__failAssets = true;
      if (attempt > 0) resetAssets();
      await preload((p) => {
        if (!cancelled) setProgress(p);
      });
      if (cancelled || !host.current) return;
      c = new GameController(host.current, cfg, setHud, onEnd, launch);
      ctl.current = c;
      await c.start();
      if (!cancelled) setPhase("ready");
    };
    run().catch(() => {
      if (!cancelled) setPhase("error");
    });
    return () => {
      cancelled = true;
      c?.dispose();
      ctl.current = null;
    };
  }, [attempt, cfg, onEnd]);

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>("button")];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="game" data-testid="game">
      <p className="orient">Landscape is the supported phone orientation.</p>
      <div ref={host} className="canvas" />
      <div className="hud" role="group" aria-label="Match status">
        <span data-testid="hud-score">Score {hud.score}</span>
        <span data-testid="hud-time">Time {hud.timeLeft}s</span>
        <span data-testid="hud-hp">HP {hud.hp}</span>
        {!hud.paused && phase === "ready" && (
          <button onClick={() => ctl.current?.pause()}>Pause</button>
        )}
      </div>
      <p className="sr" role="status">
        {announce}
      </p>
      <p className="sr">
        Score {hud.score}. Time {hud.timeLeft} seconds. Health {hud.hp}.
      </p>
      {phase === "loading" && (
        <div className="overlay" role="status">
          Loading assets… {Math.round(progress * 100)}%
        </div>
      )}
      {phase === "error" && (
        <div className="overlay" role="alert">
          Failed to load assets
          <button
            onClick={() => {
              setPhase("loading");
              setProgress(0);
              setAttempt((a) => a + 1);
            }}
          >
            Retry
          </button>
          <button onClick={onExit}>Main Menu</button>
        </div>
      )}
      {hud.paused && phase === "ready" && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Paused"
          ref={dialog}
          onKeyDown={trap}
        >
          Paused
          <button autoFocus onClick={() => ctl.current?.resume()}>
            Resume
          </button>
          <button onClick={onExit}>Main Menu</button>
        </div>
      )}
      <div className="touch">
        {BTN.map(([label, key, name]) => (
          <button
            key={key}
            aria-label={name}
            onPointerDown={(e) => {
              e.preventDefault();
              ctl.current?.setInput(key, true);
            }}
            onPointerUp={() => ctl.current?.setInput(key, false)}
            onPointerCancel={() => ctl.current?.setInput(key, false)}
            onPointerLeave={() => ctl.current?.setInput(key, false)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
