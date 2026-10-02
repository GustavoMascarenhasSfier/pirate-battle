import axios from "axios";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { configKey, type GameConfig } from "../game/config";
import {
  PAGE_SIZE,
  type MatchRecord,
  type Page,
  type Scenario,
} from "./contracts";

const http = axios.create({ baseURL: "/api" });
http.interceptors.request.use((cfg) => {
  const raw = localStorage.getItem("mock-client-timeout");
  cfg.timeout = raw ? Number(raw) : 4000;
  return cfg;
});

const retryDelay = () => {
  const raw = localStorage.getItem("mock-retry-delay");
  return raw == null || raw === "" ? 250 : Number(raw);
};

export const useRanking = (
  page: number,
  cfg: GameConfig,
  scenario: Scenario,
  enabled = true,
) =>
  useQuery({
    queryKey: ["ranking", scenario, configKey(cfg), page],
    enabled,
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay,
    queryFn: async ({ signal }) =>
      (
        await http.get<Page<MatchRecord>>("/ranking", {
          params: { page, pageSize: PAGE_SIZE, config: configKey(cfg) },
          signal,
        })
      ).data,
  });

export const useHistory = (page: number, scenario: Scenario, enabled = true) =>
  useQuery({
    queryKey: ["history", scenario, page],
    enabled,
    placeholderData: keepPreviousData,
    retry: 2,
    retryDelay,
    queryFn: async ({ signal }) =>
      (
        await http.get<Page<MatchRecord>>("/history", {
          params: { page, pageSize: PAGE_SIZE },
          signal,
        })
      ).data,
  });

const KEY = "pending-matches";
let rev = 0;
const subs = new Set<() => void>();
const saving = new Set<string>();
const touch = () => {
  rev++;
  subs.forEach((fn) => fn());
};

export const pending = (): MatchRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as MatchRecord[];
  } catch {
    return [];
  }
};
const setPending = (rows: MatchRecord[]) => {
  localStorage.setItem(KEY, JSON.stringify(rows));
  touch();
};
export const enqueue = (r: MatchRecord) => {
  if (!pending().some((p) => p.id === r.id)) setPending([...pending(), r]);
};
export const isSaving = (id: string) => saving.has(id);
export const usePendingRev = () =>
  useSyncExternalStore(
    (fn: () => void) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => rev,
  );

let chain: Promise<void> = Promise.resolve();

export function flushPending(submit: (r: MatchRecord) => Promise<unknown>) {
  chain = chain
    .then(async () => {
      for (;;) {
        const next = pending()[0];
        if (!next) return;
        saving.add(next.id);
        touch();
        try {
          await submit(next);
        } catch {
          return;
        } finally {
          saving.delete(next.id);
          touch();
        }
      }
    })
    .catch(() => undefined);
  return chain;
}

export const useSubmitMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["submit"],
    retry: 2,
    retryDelay,
    mutationFn: async (r: MatchRecord) =>
      (await http.post<MatchRecord>("/matches", r)).data,
    onSuccess: (r) => {
      setPending(pending().filter((p) => p.id !== r.id));
      void qc.invalidateQueries({ queryKey: ["ranking"] });
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
};
