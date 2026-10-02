import { delay, http, HttpResponse } from "msw";
import {
  PLAYER_ID,
  type MatchRecord,
  type Page,
  type Scenario,
} from "./contracts";
import { buildFixtures, compareRank } from "./fixtures";
import { configKey } from "../game/config";

const DB = "mock-db";
const SC = "mock-scenario";
export const LATENCY_KEY = "mock-latency";
export const SEED_KEY = "mock-seed";

export const getScenario = (): Scenario =>
  (localStorage.getItem(SC) as Scenario) ?? "normal";
export const setScenario = (s: Scenario) => localStorage.setItem(SC, s);
export const resetMocks = () => {
  localStorage.removeItem(DB);
  localStorage.removeItem(SC);
  localStorage.removeItem("pending-matches");
  localStorage.removeItem(LATENCY_KEY);
  localStorage.removeItem(SEED_KEY);
};

const load = (): MatchRecord[] => {
  try {
    const raw = localStorage.getItem(DB);
    if (!raw) return buildFixtures();
    return JSON.parse(raw) as MatchRecord[];
  } catch {
    return buildFixtures();
  }
};
const save = (rows: MatchRecord[]) =>
  localStorage.setItem(DB, JSON.stringify(rows));

const paginate = <T>(all: T[], u: URL): Page<T> => {
  const page = +(u.searchParams.get("page") ?? 1);
  const pageSize = +(u.searchParams.get("pageSize") ?? 5);
  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: all.length,
  };
};

/** Seeded unit interval stored back to localStorage so tests can reproduce variable latency. */
function nextUnit(): number {
  let s = Number(localStorage.getItem(SEED_KEY) ?? "1") | 0;
  s = (s + 0x6d2b79f5) | 0;
  localStorage.setItem(SEED_KEY, String(s));
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

let seq = 0;
async function waitFor(scenario: Scenario) {
  const pinned = localStorage.getItem(LATENCY_KEY);
  if (pinned != null && pinned !== "") {
    await delay(Number(pinned));
    return;
  }
  if (scenario === "slow") {
    await delay(1600);
    return;
  }
  if (scenario === "variable") {
    await delay(40 + Math.floor(nextUnit() * 280));
    return;
  }
  if (scenario === "out-of-order") {
    await delay(seq++ % 2 === 0 ? 1400 : 40);
    return;
  }
  await delay(20);
}

function pageOf(request: Request) {
  return new URL(request.url);
}

export const handlers = [
  http.get("/api/ranking", async ({ request }) => {
    const s = getScenario();
    const u = pageOf(request);
    if (s === "connection-error") return HttpResponse.error();
    if (s === "get-timeout") {
      await delay("infinite");
    }
    await waitFor(s);
    if (s === "ranking-error")
      return HttpResponse.json(
        { message: "Ranking unavailable" },
        { status: 503 },
      );
    if (s === "ranking-4xx")
      return HttpResponse.json(
        { message: "Bad ranking request" },
        { status: 400 },
      );
    const key = u.searchParams.get("config");
    const all =
      s === "empty"
        ? []
        : load()
            .filter((r) => configKey(r.config) === key)
            .sort(compareRank);
    return HttpResponse.json(paginate(all, u));
  }),
  http.get("/api/history", async ({ request }) => {
    const s = getScenario();
    const u = pageOf(request);
    if (s === "connection-error") return HttpResponse.error();
    if (s === "get-timeout") {
      await delay("infinite");
    }
    await waitFor(s);
    if (s === "history-error")
      return HttpResponse.json(
        { message: "History unavailable" },
        { status: 500 },
      );
    const all =
      s === "empty"
        ? []
        : load()
            .filter((r) => r.playerId === PLAYER_ID)
            .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    return HttpResponse.json(paginate(all, u));
  }),
  http.post("/api/matches", async ({ request }) => {
    const s = getScenario();
    if (s === "connection-error") return HttpResponse.error();
    await waitFor(s);
    if (s === "post-down")
      return HttpResponse.json(
        { message: "Service unavailable" },
        { status: 503 },
      );
    const rec = (await request.json()) as MatchRecord;
    const all = load();
    const found = all.find((r) => r.id === rec.id);
    if (!found) save([...all, rec]);
    if (s === "post-timeout-after-save") await delay("infinite");
    return HttpResponse.json(found ?? rec, { status: found ? 200 : 201 });
  }),
];
