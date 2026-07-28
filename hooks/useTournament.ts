"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { makeSeed, uid } from "@/lib/random";
import { buildTeams, clamp, drawOrder, planTeams } from "@/lib/teams";
import { readShareFromHash } from "@/lib/share";
import { useHydrated } from "./useClient";
import type { Config, Phase, Player } from "@/lib/types";

const STORAGE_KEY = "rov-randomizer/v1";

export const DEFAULT_CONFIG: Config = {
  sizeMode: "perTeam",
  perTeam: 5,
  teamCount: 4,
  remainderMode: "bench",
  fillMode: "sequential",
  assignLanes: false,
};

export type State = {
  phase: Phase;
  players: Player[];
  config: Config;
  seed: string;
  revealed: number;
  teamNames: Record<number, string>;
  /** เปิดมาจากลิงก์แชร์ — ยังไม่เขียนทับข้อมูลที่ผู้ใช้บันทึกไว้ */
  sharedView: boolean;
};

type Action =
  | { type: "exitShared" }
  | { type: "addNames"; names: string[] }
  | { type: "removePlayer"; id: string }
  | { type: "renamePlayer"; id: string; name: string }
  | { type: "clearPlayers" }
  | { type: "setConfig"; patch: Partial<Config> }
  | { type: "setSeed"; seed: string }
  | { type: "reseed" }
  | { type: "renameTeam"; index: number; name: string }
  | { type: "start" }
  | { type: "reveal"; count?: number }
  | { type: "revealAll" }
  | { type: "undo" }
  | { type: "finish" }
  | { type: "backToSetup" }
  | { type: "redraw" }
  | { type: "resetAll" };

const initialState: State = {
  phase: "setup",
  players: [],
  config: DEFAULT_CONFIG,
  seed: "",
  revealed: 0,
  teamNames: {},
  sharedView: false,
};

/**
 * อ่านค่าเริ่มต้นตอน render แรกฝั่ง client (ลิงก์แชร์ก่อน แล้วค่อย localStorage)
 * ทำใน initializer แทน effect เพื่อไม่ให้เกิด cascading render
 * ฝั่ง server คืนค่า default เสมอ และ UI จะโชว์ splash จนกว่าจะ hydrate เสร็จ
 */
function createInitialState(): State {
  if (typeof window === "undefined") return initialState;

  const shared = readShareFromHash();
  if (shared) {
    return {
      phase: "result",
      players: shared.n.map((name) => ({ id: uid(), name })),
      config: { ...DEFAULT_CONFIG, ...shared.c },
      seed: shared.s,
      revealed: shared.n.length,
      teamNames: {},
      sharedView: true,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<State>;
      return {
        ...initialState,
        ...saved,
        config: { ...DEFAULT_CONFIG, ...(saved.config ?? {}) },
        seed: saved.seed || makeSeed(),
        sharedView: false,
      };
    }
  } catch {
    /* ข้อมูลเก่าพัง — เริ่มใหม่ */
  }
  return { ...initialState, seed: makeSeed() };
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 24);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "exitShared":
      return { ...state, sharedView: false };

    case "addNames": {
      const existing = new Set(
        state.players.map((p) => p.name.toLocaleLowerCase("th")),
      );
      const added: Player[] = [];
      for (const raw of action.names) {
        const name = normalizeName(raw);
        if (!name) continue;
        const key = name.toLocaleLowerCase("th");
        if (existing.has(key)) continue;
        existing.add(key);
        added.push({ id: uid(), name });
      }
      if (!added.length) return state;
      return { ...state, players: [...state.players, ...added], revealed: 0 };
    }

    case "removePlayer":
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.id),
        revealed: 0,
      };

    case "renamePlayer": {
      const name = normalizeName(action.name);
      if (!name) return state;
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.id ? { ...p, name } : p)),
      };
    }

    case "clearPlayers":
      return { ...state, players: [], revealed: 0 };

    case "setConfig":
      return {
        ...state,
        config: { ...state.config, ...action.patch },
        revealed: 0,
      };

    case "setSeed":
      return { ...state, seed: action.seed.toUpperCase().slice(0, 16), revealed: 0 };

    case "reseed":
      return { ...state, seed: makeSeed(), revealed: 0 };

    case "renameTeam": {
      const name = action.name.trim().slice(0, 18);
      const next = { ...state.teamNames };
      if (name) next[action.index] = name;
      else delete next[action.index];
      return { ...state, teamNames: next };
    }

    case "start":
      return {
        ...state,
        phase: "draw",
        revealed: 0,
        seed: state.seed || makeSeed(),
      };

    case "reveal":
      return { ...state, revealed: state.revealed + (action.count ?? 1) };

    case "revealAll":
      return { ...state, revealed: state.players.length };

    case "undo":
      return { ...state, revealed: Math.max(0, state.revealed - 1) };

    case "finish":
      return { ...state, phase: "result", revealed: state.players.length };

    case "backToSetup":
      return { ...state, phase: "setup", revealed: 0, sharedView: false };

    case "redraw":
      return {
        ...state,
        phase: "draw",
        revealed: 0,
        seed: makeSeed(),
        sharedView: false,
      };

    case "resetAll":
      return { ...initialState, seed: makeSeed() };

    default:
      return state;
  }
}

export function useTournament() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const hydrated = useHydrated();

  useEffect(() => {
    if (state.sharedView) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* โควตาเต็มหรือโหมดส่วนตัว — ไม่ใช่เรื่องคอขาดบาดตาย */
    }
  }, [state]);

  const total = state.players.length;
  const plan = useMemo(() => planTeams(total, state.config), [total, state.config]);
  const order = useMemo(
    () => drawOrder(state.players, state.seed || "seed"),
    [state.players, state.seed],
  );
  const { teams, bench } = useMemo(
    () =>
      buildTeams(
        order,
        plan,
        state.revealed,
        state.seed || "seed",
        state.config.assignLanes,
      ),
    [order, plan, state.revealed, state.seed, state.config.assignLanes],
  );

  const remaining = useMemo(
    () => order.slice(state.revealed),
    [order, state.revealed],
  );

  const nextSlot = plan.slots[state.revealed] ?? null;
  const isComplete = total > 0 && state.revealed >= total;

  const teamLabel = useCallback(
    (index: number) => state.teamNames[index] ?? "",
    [state.teamNames],
  );

  return {
    state,
    dispatch,
    hydrated,
    sharedView: state.sharedView,
    exitSharedView: () => dispatch({ type: "exitShared" }),
    derived: {
      total,
      plan,
      order,
      teams,
      bench,
      remaining,
      nextSlot,
      isComplete,
      teamLabel,
      teamCount: plan.sizes.length,
      benchCount: plan.benchCount,
    },
  };
}

export type Tournament = ReturnType<typeof useTournament>;

export function configSummary(total: number, config: Config) {
  const plan = planTeams(total, config);
  return {
    teams: plan.sizes.length,
    bench: plan.benchCount,
    sizes: plan.sizes,
    even: plan.sizes.length > 0 && new Set(plan.sizes).size === 1,
  };
}

export { clamp };
