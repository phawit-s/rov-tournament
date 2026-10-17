"use client";

import { useSyncExternalStore } from "react";
import { adminClaimStore } from "@/lib/backend/admin";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { streamerStore } from "@/lib/backend/roles";

export type SiteRole = "guest" | "viewer" | "streamer" | "admin";

export type RoleInfo = {
  role: SiteRole;
  /** ยังตอบไม่ได้ว่าเป็นใคร — อย่าเพิ่งวาดหน้าจอ "ไม่มีสิทธิ์" ให้เห็น */
  loading: boolean;
  /** ล็อกอินด้วยบัญชีจริงแล้ว (ไม่นับแบบไม่ระบุตัวตนที่หน้าขอเพลงสร้างให้) */
  signedIn: boolean;
  /** ของเดิมสมัยมีโหมดรหัสผู้จัดในเครื่อง — false เสมอ เก็บไว้ให้โค้ดเก่าคอมไพล์ผ่าน */
  local: boolean;
  /** เปิดสตูดิโอได้ไหม (สตรีมเมอร์หรือผู้ดูแล) */
  studio: boolean;
  /**
   * ผู้ดูแลระบบที่ Firestore ยืนยันแล้ว
   * ★ ใช้ตัวนี้ตัดสิน "เห็นของทั้งระบบไหม / แก้ของคนอื่นได้ไหม" ที่เดียว ★
   */
  admin: boolean;
  /** uid ของบัญชีที่ล็อกอินอยู่ — null เมื่อยังไม่ล็อกอินหรือเป็นบัญชีนิรนาม */
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

  const user = authStore.user();
  const signedIn = !!user && !user.anonymous;
  const uid = signedIn && user ? user.uid : null;

  // ไม่มีหลังบ้าน = ไม่มีบัญชีให้เช็ค (ระบบขอเพลงใช้ไม่ได้อยู่แล้ว)
  if (!hasBackend) {
    return {
      role: "guest",
      loading: false,
      signedIn: false,
      local: false,
      studio: false,
      admin: false,
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
    local: false,
    studio: role === "admin" || role === "streamer",
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
