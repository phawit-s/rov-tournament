"use client";

import { recordActivity } from "@/lib/activity";
import { makeSeed, uid } from "@/lib/random";
import { DEFAULT_PRIZE } from "./prize";
import { defaultRoundBestOf } from "./bracket";
import type { Tournament } from "./types";

const KEY = "tourney-hub/tournaments/v1";

/** ต้องเป็นตัวเดิมทุกครั้ง ไม่งั้น useSyncExternalStore จะวนไม่จบ */
const EMPTY: Tournament[] = [];

let cache: Tournament[] | null = null;
let snapshotVersion = 0;
const listeners = new Set<() => void>();

/** ทัวร์ที่บันทึกไว้ก่อนมีฟิลด์ใหม่ ต้องเติมค่าเริ่มต้นให้ ไม่งั้นหน้าจอพัง */
function migrate(t: Tournament): Tournament {
  return {
    ...t,
    entryMode: t.entryMode ?? "team",
    soloPlayers: t.soloPlayers ?? [],
    teams: t.teams ?? [],
    adminEmails: t.adminEmails ?? [],
  };
}

function readAll(): Tournament[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Tournament[]).map(migrate) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function commit(next: Tournament[]) {
  cache = next;
  snapshotVersion++;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    // รูปปกใหญ่เกินโควตา localStorage ได้ง่ายๆ — แจ้งให้รู้ดีกว่าเงียบ
    console.warn("บันทึกทัวร์นาเมนต์ไม่สำเร็จ (พื้นที่เก็บอาจเต็ม)", err);
  }
  listeners.forEach((l) => l());
}

export function emptyTournament(name = "ทัวร์นาเมนต์ใหม่"): Tournament {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    tagline: "",
    description: "",
    status: "draft",
    teamSize: 5,
    maxTeams: 8,
    entryMode: "team",
    teams: [],
    soloPlayers: [],
    bracket: null,
    roundBestOf: defaultRoundBestOf(3),
    prize: { ...DEFAULT_PRIZE, slots: DEFAULT_PRIZE.slots.map((s) => ({ ...s })) },
    live: { isLive: false, platform: "tiktok", url: "" },
    createdAt: now,
    updatedAt: now,
  };
}

/** external store สำหรับ useSyncExternalStore */
export const tournamentStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: () => readAll(),
  getServerSnapshot: (): Tournament[] => EMPTY,
  /** ใช้ตอนอยากรู้แค่ว่ามีการเปลี่ยนแปลง */
  version: () => snapshotVersion,

  list(): Tournament[] {
    return readAll()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  get(id: string | null): Tournament | null {
    if (!id) return null;
    return readAll().find((t) => t.id === id) ?? null;
  },

  create(partial?: Partial<Tournament>): Tournament {
    const created = { ...emptyTournament(), ...partial };
    commit([...readAll(), created]);
    recordActivity("tournament.create", `สร้าง "${created.name}"`, {
      tournamentId: created.id,
      tournamentName: created.name,
    });
    return created;
  },

  update(id: string, patch: Partial<Tournament>) {
    commit(
      readAll().map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
      ),
    );
  },

  /** อัปเดตแบบอ่านค่าเดิมมาคำนวณต่อ */
  mutate(id: string, fn: (t: Tournament) => Tournament) {
    commit(
      readAll().map((t) =>
        t.id === id ? { ...fn(t), updatedAt: new Date().toISOString() } : t,
      ),
    );
  },

  remove(id: string) {
    const target = readAll().find((t) => t.id === id);
    commit(readAll().filter((t) => t.id !== id));
    if (target) {
      recordActivity("tournament.delete", `ลบ "${target.name}"`, {
        tournamentName: target.name,
      });
    }
  },

  duplicate(id: string): Tournament | null {
    const source = readAll().find((t) => t.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const copy: Tournament = {
      ...structuredClone(source),
      id: uid(),
      name: `${source.name} (สำเนา)`,
      status: "draft",
      bracket: null,
      teams: source.teams.map((team) => ({ ...team, id: uid() })),
      createdAt: now,
      updatedAt: now,
    };
    commit([...readAll(), copy]);
    return copy;
  },

  /** นำเข้าจากลิงก์แชร์ — ถ้า id ซ้ำจะเขียนทับ */
  upsert(tournament: Tournament) {
    const all = readAll();
    const exists = all.some((t) => t.id === tournament.id);
    commit(
      exists
        ? all.map((t) => (t.id === tournament.id ? tournament : t))
        : [...all, tournament],
    );
  },

  newSeed: () => makeSeed(),
};
