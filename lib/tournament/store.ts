"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { recordActivity } from "@/lib/activity";
import { authStore, getDb, hasBackend } from "@/lib/backend/firebase";
import { adminClaimStore } from "@/lib/backend/admin";
import { makeSeed, uid } from "@/lib/random";
import { DEFAULT_PRIZE } from "./prize";
import { defaultRoundBestOf } from "./bracket";
import { pushTournament, removeTournament } from "./cloud";
import type { Tournament } from "./types";

/**
 * คลังทัวร์นาเมนต์ — ต้นฉบับอยู่บนคลาวด์ ไม่ใช่ในเครื่องแล้ว
 *
 * ก่อนหน้านี้เก็บใน localStorage ทำให้ทัวร์ผูกกับเครื่องที่สร้าง
 * ผู้ดูแลอีกคนหรือเครื่องอื่นของคนเดิมจึงมองไม่เห็นเลย
 *
 * ตอนนี้เขียนลงคอลเลกชัน drafts ซึ่งไม่เปิดสาธารณะ เก็บข้อมูลเต็มรวมเบอร์ติดต่อ
 * ส่วนคอลเลกชัน tournaments ยังเป็นสำเนาที่ตัดข้อมูลติดต่อออก ไว้ให้ widget
 * กับลิงก์แชร์อ่านโดยไม่ต้องล็อกอิน — กด "เผยแพร่" ถึงจะอัปเดตสำเนานั้น
 *
 * หน้าจอไม่ต้องแก้อะไรเลย เพราะ API ของ store ยังเหมือนเดิมทุกตัว
 * และ Firestore ทำ optimistic update ให้อยู่แล้ว (onSnapshot ยิงค่าใหม่ทันที
 * ตั้งแต่ยังไม่ถึงเซิร์ฟเวอร์) การกดแก้จึงยังไวเท่าเดิม
 */

const COL = "drafts";
const LEGACY_KEY = "tourney-hub/tournaments/v1";

/** ต้องเป็นตัวเดิมทุกครั้ง ไม่งั้น useSyncExternalStore จะวนไม่จบ */
const EMPTY: Tournament[] = [];

let items: Tournament[] = EMPTY;
let snapshotVersion = 0;
const listeners = new Set<() => void>();

function emit() {
  snapshotVersion++;
  listeners.forEach((l) => l());
}

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

/* ---------------- โหมดไม่มีคลาวด์ ---------------- */

/**
 * ยังไม่ได้ตั้งค่า Firebase ก็ยังใช้งานได้ เก็บลงเครื่องเหมือนเดิม
 * (เก็บไว้เพื่อให้คนที่โคลน repo ไปลองเล่นได้โดยไม่ต้องตั้ง Firebase ก่อน)
 */
function readLocal(): Tournament[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as Tournament[]).map(migrate) : [];
  } catch {
    return [];
  }
}

function writeLocal(next: Tournament[]) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("บันทึกทัวร์นาเมนต์ไม่สำเร็จ (พื้นที่เก็บอาจเต็ม)", err);
  }
}

/* ---------------- คลาวด์ ---------------- */

let unsubDocs: Unsubscribe | null = null;
let unsubAuth: (() => void) | null = null;
let unsubClaim: (() => void) | null = null;
let watching = ""; // uid + โหมด ที่กำลังฟังอยู่ กันสมัครซ้ำ
let migrated = false;

function ownerOf(): { uid: string; name: string; email: string | null } | null {
  const u = authStore.user();
  if (!u || u.anonymous) return null;
  return { uid: u.uid, name: u.name, email: u.email };
}

/**
 * ยกทัวร์ที่ค้างอยู่ใน localStorage ขึ้นคลาวด์ครั้งเดียว
 * ทำหลังจากรู้รายการบนคลาวด์แล้ว จะได้ไม่เขียนทับของที่ใหม่กว่า
 */
async function migrateLocalOnce(cloudIds: Set<string>) {
  if (migrated) return;
  migrated = true;
  const local = readLocal();
  const owner = ownerOf();
  if (local.length === 0 || !owner) return;

  const pending = local.filter((t) => !cloudIds.has(t.id));
  if (pending.length === 0) return;

  await Promise.allSettled(pending.map((t) => writeDraft(t, owner)));
  recordActivity(
    "tournament.create",
    `ย้ายทัวร์ ${pending.length} รายการจากเครื่องขึ้นคลาวด์`,
  );
}

async function writeDraft(
  t: Tournament,
  owner: { uid: string; name: string; email: string | null },
) {
  const db = getDb();
  if (!db) return;
  await setDoc(
    doc(db, COL, t.id),
    {
      ...t,
      // ห้ามเปลี่ยนเจ้าของเดิมตอนทีมงานหรือผู้ดูแลกดแก้
      ownerUid: t.ownerUid ?? owner.uid,
      ownerEmail: t.ownerEmail ?? owner.email ?? null,
      adminEmails: (t.adminEmails ?? []).map((e) => e.toLowerCase()),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

function stopWatching() {
  unsubDocs?.();
  unsubDocs = null;
  watching = "";
  items = EMPTY;
}

function syncWatcher() {
  if (!hasBackend) {
    items = readLocal();
    emit();
    return;
  }

  const owner = ownerOf();
  const db = getDb();
  if (!owner || !db) {
    if (watching) {
      stopWatching();
      emit();
    }
    return;
  }

  const seesAll = adminClaimStore.status() === "admin";
  const key = `${owner.uid}:${seesAll ? "all" : "own"}`;
  if (key === watching) return;

  unsubDocs?.();
  watching = key;

  /*
    ผู้ดูแลระบบเห็นทุกใบ คนอื่นเห็นเฉพาะของตัวเอง
    ไม่ใส่ orderBy เพราะ Firestore จะตัดเอกสารที่ไม่มีฟิลด์นั้นทิ้งเงียบๆ
  */
  const q = seesAll
    ? collection(db, COL)
    : query(collection(db, COL), where("ownerUid", "==", owner.uid));

  unsubDocs = onSnapshot(
    q,
    (snap) => {
      items = snap.docs.map((d) => migrate({ ...(d.data() as Tournament), id: d.id }));
      emit();
      void migrateLocalOnce(new Set(items.map((t) => t.id)));
    },
    () => {
      // อ่านไม่ได้ (ยังไม่ publish กติกา / เน็ตหลุด) — ให้เป็นรายการว่างไปก่อน
      items = EMPTY;
      emit();
    },
  );
}

let started = false;

function ensureStarted() {
  if (started) return;
  started = true;
  if (hasBackend) {
    unsubAuth = authStore.subscribe(syncWatcher);
    unsubClaim = adminClaimStore.subscribe(syncWatcher);
  }
  syncWatcher();
}

/** เขียนลงคลาวด์ถ้าล็อกอินแล้ว ไม่งั้นเขียนลงเครื่อง */
function persist(next: Tournament[], changed?: Tournament) {
  if (!hasBackend) {
    items = next;
    writeLocal(next);
    emit();
    return;
  }
  const owner = ownerOf();
  if (!owner) return;

  // อัปเดตในหน่วยความจำก่อน หน้าจอจะได้ไม่กระตุกรอเน็ต
  items = next;
  emit();
  if (changed) void writeDraft(changed, owner);
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
    ensureStarted();
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) {
        unsubAuth?.();
        unsubClaim?.();
        unsubAuth = null;
        unsubClaim = null;
        stopWatching();
        started = false;
      }
    };
  },
  getSnapshot: () => items,
  getServerSnapshot: (): Tournament[] => EMPTY,
  /** ใช้ตอนอยากรู้แค่ว่ามีการเปลี่ยนแปลง */
  version: () => snapshotVersion,

  list(): Tournament[] {
    return items
      .slice()
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  },

  get(id: string | null): Tournament | null {
    if (!id) return null;
    return items.find((t) => t.id === id) ?? null;
  },

  create(partial?: Partial<Tournament>): Tournament {
    const owner = ownerOf();
    const created: Tournament = {
      ...emptyTournament(),
      ...partial,
      ...(owner
        ? { ownerUid: owner.uid, ownerEmail: owner.email ?? undefined }
        : null),
    };
    persist([...items, created], created);
    recordActivity("tournament.create", `สร้าง "${created.name}"`, {
      tournamentId: created.id,
      tournamentName: created.name,
    });
    return created;
  },

  update(id: string, patch: Partial<Tournament>) {
    let changed: Tournament | undefined;
    const next = items.map((t) => {
      if (t.id !== id) return t;
      changed = { ...t, ...patch, updatedAt: new Date().toISOString() };
      return changed;
    });
    persist(next, changed);
  },

  /** อัปเดตแบบอ่านค่าเดิมมาคำนวณต่อ */
  mutate(id: string, fn: (t: Tournament) => Tournament) {
    let changed: Tournament | undefined;
    const next = items.map((t) => {
      if (t.id !== id) return t;
      changed = { ...fn(t), updatedAt: new Date().toISOString() };
      return changed;
    });
    persist(next, changed);
  },

  remove(id: string) {
    const target = items.find((t) => t.id === id);
    const next = items.filter((t) => t.id !== id);

    if (!hasBackend) {
      persist(next);
    } else {
      items = next;
      emit();
      const db = getDb();
      if (db) {
        void deleteDoc(doc(db, COL, id));
        // ถอดสำเนาสาธารณะออกด้วย ไม่งั้นลิงก์แชร์เก่ายังเปิดได้อยู่
        void removeTournament(id);
      }
    }

    if (target) {
      recordActivity("tournament.delete", `ลบ "${target.name}"`, {
        tournamentName: target.name,
      });
    }
  },

  duplicate(id: string): Tournament | null {
    const source = items.find((t) => t.id === id);
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
    persist([...items, copy], copy);
    return copy;
  },

  /** นำเข้าจากลิงก์แชร์ — ถ้า id ซ้ำจะเขียนทับ */
  upsert(tournament: Tournament) {
    const exists = items.some((t) => t.id === tournament.id);
    persist(
      exists
        ? items.map((t) => (t.id === tournament.id ? tournament : t))
        : [...items, tournament],
      tournament,
    );
  },

  /** อัปเดตสำเนาสาธารณะที่ widget กับลิงก์แชร์อ่าน */
  async publish(id: string, isPublic = true) {
    const owner = ownerOf();
    const target = items.find((t) => t.id === id);
    if (!owner || !target) return;
    await pushTournament(target, owner, isPublic);
  },

  newSeed: () => makeSeed(),
};
