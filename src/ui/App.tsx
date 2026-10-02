import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_OPTIONS,
  LIMITS,
  makeConfig,
  type GameConfig,
} from "../game/config";
import type { Result } from "../game/controller";
import { Game } from "./Game";
import {
  PLAYER_ID,
  SCENARIOS,
  type MatchConfig,
  type MatchRecord,
  type Scenario,
} from "../api/contracts";
import {
  enqueue,
  flushPending,
  isSaving,
  pending,
  useHistory,
  usePendingRev,
  useRanking,
  useSubmitMatch,
} from "../api/client";
import { getScenario, resetMocks, setScenario } from "../api/handlers";

const SCREEN_KEY = "pb-screen";
const ls = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "") as T;
  } catch {
    return d;
  }
};
type Screen = "menu" | "options" | "play" | "result";

function initialScreen(): Screen {
  if (
    sessionStorage.getItem(SCREEN_KEY) === "result" &&
    ls<MatchRecord | null>("last-result", null)
  )
    return "result";
  return "menu";
}

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [opts, setOpts] = useState<MatchConfig>(() =>
    ls("options", DEFAULT_OPTIONS),
  );
  const [last, setLast] = useState<MatchRecord | null>(() =>
    ls("last-result", null),
  );
  const [cfg, setCfg] = useState<GameConfig>(() =>
    makeConfig(ls("options", DEFAULT_OPTIONS)),
  );
  const submit = useSubmitMatch();
  const rev = usePendingRev();
  const cfgRef = useRef(cfg);
  const submitRef = useRef(submit);
  useEffect(() => {
    cfgRef.current = cfg;
    submitRef.current = submit;
  });
  const flush = useCallback(
    () => flushPending((r) => submitRef.current.mutateAsync(r)),
    [],
  );

  useEffect(() => {
    void flush();
  }, [flush]);
  useEffect(() => {
    if (screen === "play") sessionStorage.removeItem(SCREEN_KEY);
    else sessionStorage.setItem(SCREEN_KEY, screen);
  }, [screen]);

  const start = () => {
    sessionStorage.removeItem(SCREEN_KEY);
    const next = makeConfig(opts);
    setCfg(next);
    setScreen("play");
  };
  const onEnd = useCallback(
    (r: Result) => {
      const rec: MatchRecord = {
        id: crypto.randomUUID(),
        playerId: PLAYER_ID,
        playerName: "You",
        playedAt: new Date().toISOString(),
        score: r.score,
        durationSec: r.durationSec,
        endReason: r.endReason,
        config: cfgRef.current,
      };
      localStorage.setItem("last-result", JSON.stringify(rec));
      sessionStorage.setItem(SCREEN_KEY, "result");
      enqueue(rec);
      setLast(rec);
      setScreen("result");
      void flush();
    },
    [flush],
  );
  if (screen === "play")
    return <Game cfg={cfg} onEnd={onEnd} onExit={() => setScreen("menu")} />;
  return (
    <main className="menu">
      <img
        src={`${import.meta.env.BASE_URL}assets/title_pirate_battle.png`}
        alt="Pirate Battle"
      />
      <p className="orient">
        Landscape is the supported phone orientation. The arena still fits if
        you stay in portrait.
      </p>
      {screen === "menu" && (
        <Menu
          opts={opts}
          onPlay={start}
          onOptions={() => setScreen("options")}
          rev={rev}
          onRetry={() => void flush()}
        />
      )}
      {screen === "options" && (
        <Options
          opts={opts}
          onSave={(o) => {
            localStorage.setItem("options", JSON.stringify(o));
            setOpts(o);
            setScreen("menu");
          }}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "result" && last && (
        <ResultView
          rec={last}
          rev={rev}
          onRetry={() => void flush()}
          onAgain={start}
          onMenu={() => setScreen("menu")}
        />
      )}
    </main>
  );
}

function Menu({
  opts,
  onPlay,
  onOptions,
  rev,
  onRetry,
}: {
  opts: MatchConfig;
  onPlay: () => void;
  onOptions: () => void;
  rev: number;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<"ranking" | "history">("ranking");
  const [sc, setSc] = useState<Scenario>(getScenario());
  const waiting = pending();
  void rev;
  return (
    <>
      <div className="row">
        <button autoFocus onClick={onPlay}>
          Play
        </button>
        <button onClick={onOptions}>Options</button>
      </div>
      <p className="help">
        Move: W or ↑ forward, A/D or ←/→ rotate. Fire: Space front, Q left
        broadside, E right broadside. Pause: Esc or P. On a touch screen, the
        same actions are buttons during a match.
      </p>
      {waiting.length > 0 && (
        <p role="status">
          Match record pending. <button onClick={onRetry}>Retry save</button>
        </p>
      )}
      <div role="tablist" aria-label="Records">
        <button
          role="tab"
          id="tab-ranking"
          aria-selected={tab === "ranking"}
          aria-controls="panel-records"
          onClick={() => setTab("ranking")}
        >
          Ranking
        </button>
        <button
          role="tab"
          id="tab-history"
          aria-selected={tab === "history"}
          aria-controls="panel-records"
          onClick={() => setTab("history")}
        >
          Match History
        </button>
      </div>
      <div
        role="tabpanel"
        id="panel-records"
        aria-labelledby={tab === "ranking" ? "tab-ranking" : "tab-history"}
      >
        <Board key={`${tab}:${sc}`} kind={tab} opts={opts} scenario={sc} />
      </div>
      <details className="dev">
        <summary>Network scenario</summary>
        <label htmlFor="scenario">
          Scenario
          <select
            id="scenario"
            value={sc}
            onChange={(e) => {
              const next = e.target.value as Scenario;
              setScenario(next);
              setSc(next);
            }}
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            resetMocks();
            location.reload();
          }}
        >
          Reset mock state
        </button>
      </details>
    </>
  );
}

function Board({
  kind,
  opts,
  scenario,
}: {
  kind: "ranking" | "history";
  opts: MatchConfig;
  scenario: Scenario;
}) {
  const [page, setPage] = useState(1);
  const cfg = makeConfig(opts);
  const ranking = useRanking(page, cfg, scenario, kind === "ranking");
  const history = useHistory(page, scenario, kind === "history");
  const q = kind === "ranking" ? ranking : history;
  if (q.isPending) return <p role="status">Loading…</p>;
  if (q.isError)
    return (
      <p role="alert">
        Could not load {kind}.{" "}
        <button onClick={() => void q.refetch()}>Retry</button>
      </p>
    );
  const data = q.data;
  if (!data) return <p role="status">Loading…</p>;
  const { items, total, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div>
      {q.isFetching && <p role="status">Updating…</p>}
      {!items.length ? (
        <p>No matches yet.</p>
      ) : (
        <table data-testid={`${kind}-table`}>
          <thead>
            <tr>
              <th>{kind === "ranking" ? "#" : "Date"}</th>
              {kind === "ranking" && <th>Player</th>}
              <th>Score</th>
              <th>Time</th>
              {kind === "history" && <th>Ended by</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={r.id} data-testid="match-row">
                <td>
                  {kind === "ranking"
                    ? (page - 1) * pageSize + i + 1
                    : new Date(r.playedAt).toLocaleDateString("en-US")}
                </td>
                {kind === "ranking" && <td>{r.playerName}</td>}
                <td>{r.score}</td>
                <td>{r.durationSec}s</td>
                {kind === "history" && <td>{r.endReason}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span data-testid="page-label">
          {page} / {pages}
        </span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function Options({
  opts,
  onSave,
  onBack,
}: {
  opts: MatchConfig;
  onSave: (o: MatchConfig) => void;
  onBack: () => void;
}) {
  const [s, setS] = useState(String(opts.sessionSec));
  const [p, setP] = useState(String(opts.spawnSec));
  const L = LIMITS;
  const sv = Number(s);
  const pv = Number(p);
  const es =
    !Number.isInteger(sv) || sv < L.sessionSec.min || sv > L.sessionSec.max
      ? `Enter ${L.sessionSec.min}–${L.sessionSec.max} seconds`
      : "";
  const ep = !(pv >= L.spawnSec.min && pv <= L.spawnSec.max)
    ? `Enter ${L.spawnSec.min}–${L.spawnSec.max} seconds`
    : "";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!es && !ep) onSave({ sessionSec: sv, spawnSec: pv });
      }}
    >
      <label htmlFor="session">
        Game session time (s)
        <input
          id="session"
          value={s}
          onChange={(e) => setS(e.target.value)}
          inputMode="numeric"
          aria-invalid={!!es}
          aria-describedby="es"
        />
      </label>
      <p id="es" role="alert">
        {es}
      </p>
      <label htmlFor="spawn">
        Enemy spawn time (s)
        <input
          id="spawn"
          value={p}
          onChange={(e) => setP(e.target.value)}
          inputMode="decimal"
          aria-invalid={!!ep}
          aria-describedby="ep spawn-help"
        />
      </label>
      <p id="spawn-help">
        Spawn interval must be greater than 0. Allowed range: {L.spawnSec.min}–
        {L.spawnSec.max} seconds.
      </p>
      <p id="ep" role="alert">
        {ep}
      </p>
      <div className="row">
        <button type="submit">Save</button>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  );
}

function ResultView({
  rec,
  rev,
  onRetry,
  onAgain,
  onMenu,
}: {
  rec: MatchRecord;
  rev: number;
  onRetry: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  void rev;
  const waiting = pending().some((p) => p.id === rec.id);
  const saving = isSaving(rec.id);
  const status = saving
    ? "Saving…"
    : waiting
      ? "Pending (not saved yet)"
      : "Saved";
  return (
    <section aria-label="Result">
      <h2>{rec.endReason === "death" ? "Ship sunk" : "Time is up"}</h2>
      <p data-testid="result-score">Score: {rec.score}</p>
      <p data-testid="result-time">Time played: {rec.durationSec}s</p>
      <p data-testid="result-reason">Ended by: {rec.endReason}</p>
      <p data-testid="result-status" role="status">
        Record: {status}
      </p>
      <div className="row">
        {waiting && !saving && <button onClick={onRetry}>Retry save</button>}
        <button autoFocus onClick={onAgain}>
          Play Again
        </button>
        <button onClick={onMenu}>Main Menu</button>
      </div>
    </section>
  );
}
