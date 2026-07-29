"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { firebaseConfig, hasBackend } from "./config";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

function ensureApp(): FirebaseApp | null {
  if (!hasBackend || typeof window === "undefined") return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb(): Firestore | null {
  const instance = ensureApp();
  if (!instance) return null;
  if (!db) db = getFirestore(instance);
  return db;
}

export function getAuthClient(): Auth | null {
  const instance = ensureApp();
  if (!instance) return null;
  if (!auth) auth = getAuth(instance);
  return auth;
}

/* ---------------- สถานะผู้ใช้ ---------------- */

export type AuthUser = {
  uid: string;
  name: string;
  email: string | null;
  photo: string | null;
};

let currentUser: AuthUser | null = null;
let authReady = false;
let snapshot = "signed-out";
const listeners = new Set<() => void>();

function publish() {
  const next = currentUser ? `in:${currentUser.uid}` : authReady ? "out" : "loading";
  if (next !== snapshot) snapshot = next;
  listeners.forEach((l) => l());
}

function startWatching() {
  const client = getAuthClient();
  if (!client) {
    authReady = true;
    return;
  }
  onAuthStateChanged(client, (user: User | null) => {
    currentUser = user
      ? {
          uid: user.uid,
          name: user.displayName ?? "ผู้ใช้",
          email: user.email,
          photo: user.photoURL,
        }
      : null;
    authReady = true;
    publish();
  });
}

let started = false;

export const authStore = {
  subscribe(onChange: () => void) {
    if (!started) {
      started = true;
      startWatching();
    }
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => "loading",

  user: () => currentUser,
  ready: () => authReady,

  async signIn() {
    const client = getAuthClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    await signInWithPopup(client, new GoogleAuthProvider());
  },

  async signOut() {
    const client = getAuthClient();
    if (!client) return;
    await signOut(client);
  },

  /**
   * ล็อกอินแบบไม่ระบุตัวตนให้อัตโนมัติ
   * ใช้กับหน้าโดเนท/สมัครสมาชิก คนโอนไม่ต้องสมัครอะไรเลย
   * แต่ระบบยังได้ uid ไว้ผูกกับใบที่ส่งเข้ามา กันสแปมและตามรอยได้
   */
  async ensureSignedIn() {
    const client = getAuthClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    if (client.currentUser) return;
    await signInAnonymously(client);
  },
};

export { hasBackend };
