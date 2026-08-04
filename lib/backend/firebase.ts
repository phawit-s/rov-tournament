"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
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
  if (db) return db;

  /*
    เปิดแคชถาวร (IndexedDB) เพราะทัวร์ย้ายจาก localStorage มาอยู่บนคลาวด์แล้ว
    ถ้าไม่มีแคช ทุกครั้งที่เปิดหน้าจะเห็นรายการว่างจนกว่าเน็ตจะตอบ
    และแก้อะไรตอนเน็ตหลุดไม่ได้เลย — แคชนี้คืนสองอย่างนั้นกลับมาให้
    persistentMultipleTabManager เผื่อเปิดหลายแท็บพร้อมกัน (OBS + หน้าตั้งค่า)
  */
  try {
    db = initializeFirestore(instance, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // เบราว์เซอร์บางตัวปิด IndexedDB (โหมดส่วนตัวบางรุ่น) — ใช้แบบไม่มีแคชแทน
    db = getFirestore(instance);
  }
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
  /** ล็อกอินแบบไม่ระบุตัวตน (มาจากหน้าโดเนท) */
  anonymous: boolean;
  /**
   * ยืนยันอีเมลแล้วหรือยัง
   *
   * เข้าด้วย Google จะเป็น true ให้เลย แต่สมัครด้วยอีเมล/รหัสผ่านจะเป็น false
   * จนกว่าจะกดลิงก์ในเมล — และกติกาฝั่งเซิร์ฟเวอร์ผูกสิทธิ์เจ้าของเว็บไว้กับ
   * email_verified ในโทเคน ถ้าไม่รู้ค่านี้ก็จะงงว่าทำไมอยู่ๆ สิทธิ์หาย
   */
  emailVerified: boolean;
  /** ล็อกอินมาด้วยวิธีไหน ('password' | 'google.com' | ...) */
  provider: string | null;
};

let currentUser: AuthUser | null = null;
let authReady = false;

/*
  ค่าเริ่มต้นต้องเป็น "loading" ไม่ใช่ "signed-out"

  Firebase ใช้เวลาสักครู่กว่าจะอ่านเซสชันจาก IndexedDB เสร็จแล้วบอกกลับมาว่าใครล็อกอินอยู่
  ถ้าช่วงนั้นเราตอบว่า "ออกจากระบบแล้ว" หน้าที่มีด่านล็อกอินจะเด้งขึ้นหน้า
  "ยังไม่ได้ล็อกอิน" ทันทีทุกครั้งที่เปลี่ยนหน้า ทั้งที่เซสชันยังอยู่ครบ
  แล้วค่อยหายไปเองตอนข้อมูลกลับมา — อาการคือกะพริบเข้าหน้าล็อกอินเป็นระยะ

  ไม่มีหลังบ้าน = ไม่มีอะไรให้รอ ตอบ signed-out ได้เลย
*/
let snapshot = hasBackend ? "loading" : "signed-out";
const listeners = new Set<() => void>();

function publish() {
  const next = currentUser ? `in:${currentUser.uid}` : authReady ? "out" : "loading";
  if (next !== snapshot) snapshot = next;
  listeners.forEach((l) => l());
}

function startWatching() {
  const client = getAuthClient();
  if (!client) {
    // ไม่มีตัวจัดการล็อกอินให้รอ ต้องเลิกค้างที่ "loading" ทันที
    authReady = true;
    publish();
    return;
  }
  onAuthStateChanged(client, (user: User | null) => {
    currentUser = user
      ? {
          uid: user.uid,
          name: user.displayName ?? user.email?.split("@")[0] ?? "ผู้ใช้",
          email: user.email,
          photo: user.photoURL,
          anonymous: user.isAnonymous,
          emailVerified: user.emailVerified,
          provider: user.providerData?.[0]?.providerId ?? null,
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

  /** เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน */
  async signInWithPassword(email: string, password: string) {
    const client = getAuthClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    await signInWithEmailAndPassword(client, email.trim(), password);
  },

  /** สมัครบัญชีใหม่ด้วยอีเมล + รหัสผ่าน */
  async registerWithPassword(email: string, password: string, name?: string) {
    const client = getAuthClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    const cred = await createUserWithEmailAndPassword(client, email.trim(), password);
    if (name?.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
      currentUser = {
        uid: cred.user.uid,
        name: name.trim(),
        email: cred.user.email,
        photo: cred.user.photoURL,
        anonymous: false,
        emailVerified: cred.user.emailVerified,
        provider: cred.user.providerData?.[0]?.providerId ?? null,
      };
      publish();
    }
  },

  /** ส่งลิงก์ยืนยันอีเมลให้บัญชีที่ล็อกอินอยู่ */
  async sendVerifyEmail() {
    const client = getAuthClient();
    if (!client?.currentUser) throw new Error("ยังไม่ได้ล็อกอิน");
    await sendEmailVerification(client.currentUser);
  },

  /**
   * ดึงสถานะบัญชีใหม่จากเซิร์ฟเวอร์
   *
   * ต้องบังคับต่ออายุโทเคนด้วย (getIdToken(true)) ไม่ใช่แค่ reload() —
   * กติกา Firestore อ่าน email_verified จาก "โทเคน" ที่ออกไว้ก่อนหน้า
   * กดยืนยันในเมลแล้วโทเคนเก่ายังบอกว่ายังไม่ยืนยันอยู่ดีจนกว่าจะต่ออายุ
   * (โทเคนมีอายุ 1 ชั่วโมง ถ้าไม่บังคับก็ต้องรอครบชั่วโมงหรือล็อกอินใหม่)
   */
  async refreshUser() {
    const client = getAuthClient();
    const user = client?.currentUser;
    if (!user) return;
    await user.reload();
    await user.getIdToken(true);
    currentUser = {
      uid: user.uid,
      name: user.displayName ?? user.email?.split("@")[0] ?? "ผู้ใช้",
      email: user.email,
      photo: user.photoURL,
      anonymous: user.isAnonymous,
      emailVerified: user.emailVerified,
      provider: user.providerData?.[0]?.providerId ?? null,
    };
    publish();
  },

  async resetPassword(email: string) {
    const client = getAuthClient();
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    await sendPasswordResetEmail(client, email.trim());
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
