"use client";

import { uid } from "./random";

export type WheelEntry = {
  id: string;
  name: string;
  /** น้ำหนัก ยิ่งมากยิ่งกินพื้นที่วงล้อมาก */
  weight: number;
};

export type WheelHistory = {
  id: string;
  name: string;
  at: string;
};

export type WheelState = {
  entries: WheelEntry[];
  history: WheelHistory[];
  /** เอาชื่อที่ออกแล้วออกจากวงล้ออัตโนมัติ */
  removeWinner: boolean;
  /** ความยาวการหมุน (วินาที) */
  duration: number;
  useWeights: boolean;
};

const KEY = "rov-randomizer/wheel/v1";

export const DEFAULT_WHEEL: WheelState = {
  entries: [],
  history: [],
  removeWinner: false,
  duration: 5,
  useWeights: false,
};

let cache: WheelState | null = null;
const listeners = new Set<() => void>();

function read(): WheelState {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULT_WHEEL;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULT_WHEEL, ...(JSON.parse(raw) as WheelState) } : DEFAULT_WHEEL;
  } catch {
    cache = DEFAULT_WHEEL;
  }
  return cache;
}

function commit(next: WheelState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ไม่ซีเรียส */
  }
  listeners.forEach((l) => l());
}

export const wheelStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: () => read(),
  getServerSnapshot: () => DEFAULT_WHEEL,

  set(patch: Partial<WheelState>) {
    commit({ ...read(), ...patch });
  },

  addNames(raw: string[]) {
    const state = read();
    const existing = new Set(
      state.entries.map((e) => e.name.toLocaleLowerCase("th")),
    );
    const added: WheelEntry[] = [];
    for (const item of raw) {
      const name = item.trim().replace(/\s+/g, " ").slice(0, 28);
      if (!name) continue;
      const key = name.toLocaleLowerCase("th");
      if (existing.has(key)) continue;
      existing.add(key);
      added.push({ id: uid(), name, weight: 1 });
    }
    if (!added.length) return;
    commit({ ...state, entries: [...state.entries, ...added] });
  },

  remove(id: string) {
    const state = read();
    commit({ ...state, entries: state.entries.filter((e) => e.id !== id) });
  },

  setWeight(id: string, weight: number) {
    const state = read();
    commit({
      ...state,
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, weight: Math.max(1, Math.min(20, weight)) } : e,
      ),
    });
  },

  clear() {
    commit({ ...read(), entries: [] });
  },

  pushHistory(name: string) {
    const state = read();
    commit({
      ...state,
      history: [
        { id: uid(), name, at: new Date().toISOString() },
        ...state.history,
      ].slice(0, 50),
    });
  },

  clearHistory() {
    commit({ ...read(), history: [] });
  },
};

/** ขอบเขตมุมของแต่ละช่อง (เรเดียน) เริ่มจาก 0 */
export function segments(entries: WheelEntry[], useWeights: boolean) {
  const total = entries.reduce(
    (sum, e) => sum + (useWeights ? e.weight : 1),
    0,
  );
  let cursor = 0;
  return entries.map((entry) => {
    const share = ((useWeights ? entry.weight : 1) / total) * Math.PI * 2;
    const seg = { entry, start: cursor, end: cursor + share, mid: cursor + share / 2 };
    cursor += share;
    return seg;
  });
}

/** สุ่มผู้ชนะตามน้ำหนัก */
export function pickWinnerIndex(
  entries: WheelEntry[],
  useWeights: boolean,
): number {
  const weights = entries.map((e) => (useWeights ? e.weight : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const buf = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    buf[0] = Math.floor(Math.random() * 0xffffffff);
  }
  let roll = (buf[0] / 0x100000000) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return entries.length - 1;
}
