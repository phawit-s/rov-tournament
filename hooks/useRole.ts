"use client";

import { useSyncExternalStore } from "react";
import { adminClaimStore } from "@/lib/backend/admin";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { streamerStore } from "@/lib/backend/roles";
import { gateStore } from "@/lib/gate";

/**
 * บทบาทของคนที่กำลังเปิดเว็บอยู่ — คำตอบเดียวที่ทั้งเว็บใช้ร่วมกัน
 *
 *  guest    ยังไม่ล็อกอิน (หรือล็อกอินแบบไม่ระบุตัวตนจากหน้าโดเนท)
 *  viewer   ล็อกอินแล้ว แต่ยังไม่มีสิทธิ์อะไรเป็นพิเศษ — ใช้หน้าสาธารณะได้ทั้งหมด
 *  streamer เปิดสตูดิโอได้ จัดการ "ช่องของตัวเอง" ได้
 *  admin    ได้ทุกอย่างของสตรีมเมอร์ + เห็นทั้งระบบและให้/ถอดสิทธิ์คนอื่น
 *
 * ตัวตัดสินจริงอยู่ที่ firestore.rules ฮุคนี้มีไว้ตัดสินว่า "จะวาดอะไรบนจอ"
 * เท่านั้น — หน้าเว็บเป็นไฟล์ static ใครเปิด devtools ก็บังคับให้เมนูโผล่ได้เสมอ
 */
export type SiteRole = "guest" | "viewer" | "streamer" | "admin";

export type RoleInfo = {
  role: SiteRole;
  /** ยังตอบไม่ได้ว่าเป็นใคร — อย่าเพิ่งวาดหน้าจอ "ไม่มีสิทธิ์" ให้เห็น */
  loading: boolean;
  /** ล็อกอินด้วยบัญชีจริงแล้ว (ไม่นับแบบไม่ระบุตัวตน) */
  signedIn: boolean;
  /** ปลดด้วยรหัสผู้จัดในเครื่องนี้ — ใช้ได้เฉพาะเครื่องมือที่ทำงานในเบราว์เซอร์ */
  local: boolean;
  /** เปิดสตูดิโอได้ไหม */
  studio: boolean;

  /**
   * ผู้ดูแลระบบที่ Firestore ยืนยันแล้ว
   *
   * ★ ใช้ตัวนี้ตัดสิน "เห็นของทั้งระบบไหม / แก้ของคนอื่นได้ไหม" เสมอ ★
   * ห้ามเทียบ useAccess() === "verified" กระจายตามหน้าอีก — ของเดิมทำแบบนั้น
   * แล้วแต่ละหน้าตีความคำว่า "แอดมิน" ไม่ตรงกัน บางหน้านับรหัสในเครื่องด้วย
   * บางหน้าไม่นับ ผลคือแอดมินคนเดียวกันเห็นเมนูครบแต่เห็นข้อมูลไม่ครบ
   */
  admin: boolean;
  /** uid ของบัญชีที่ล็อกอินอยู่ — null เมื่อเข้าด้วยรหัสเครื่องหรือยังไม่ล็อกอิน */
  uid: string | null;
};

export function useSiteRole(): RoleInfo {
  const authSnap = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  useSyncExternalStore(
    adminClaimStore.subscribe,
    adminClaimStore.getSnapshot,
    adminClaimStore.getServerSnapshot,
  );
  useSyncExternalStore(
    streamerStore.subscribe,
    streamerStore.getSnapshot,
    streamerStore.getServerSnapshot,
  );
  const access = useSyncExternalStore(
    gateStore.subscribe,
    gateStore.getSnapshot,
    gateStore.getServerSnapshot,
  );

  const user = authStore.user();
  const signedIn = !!user && !user.anonymous;
  const local = access === "local";
  const uid = signedIn && user ? user.uid : null;

  // ไม่มีแบ็กเอนด์ = ข้อมูลอยู่ในเบราว์เซอร์เครื่องเดียว รหัสผู้จัดคือกุญแจดอกเดียวที่มี
  if (!hasBackend) {
    return {
      role: local ? "admin" : "guest",
      loading: false,
      signedIn: false,
      local,
      studio: local,
      /*
        โหมดไม่มีคลาวด์ให้ถือว่าเป็นผู้ดูแล "ของเครื่องนี้" ได้
        ไม่มีข้อมูลของคนอื่นให้รั่วอยู่แล้ว และถ้าไม่ให้ผ่าน เครื่องมือทั้งชุด
        (สุ่มทีม วงล้อ widget) จะถูกล็อกทิ้งโดยไม่มีทางปลด
      */
      admin: local,
      uid: null,
    };
  }

  const adminState = adminClaimStore.status();
  const streamerState = streamerStore.state();
  const loading =
    authSnap === "loading" ||
    (signedIn && (adminState === "loading" || streamerState === "loading"));

  const admin = adminState === "admin";
  const role: SiteRole = admin
    ? "admin"
    : streamerState === "streamer"
      ? "streamer"
      : signedIn
        ? "viewer"
        : "guest";

  return {
    role,
    loading,
    signedIn,
    local,
    studio: role === "admin" || role === "streamer" || local,
    admin,
    uid,
  };
}

export const ROLE_LABEL: Record<SiteRole, string> = {
  guest: "ผู้ชม",
  viewer: "ผู้ใช้ทั่วไป",
  streamer: "สตรีมเมอร์",
  admin: "ผู้ดูแลระบบ",
};
