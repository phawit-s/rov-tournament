"use client";

import { useSyncExternalStore } from "react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import AuthPanel from "./AuthPanel";

/**
 * บังคับล็อกอินก่อนเข้าถึงเนื้อหา
 *
 * - ถ้ายังไม่ได้เชื่อม Firebase (โหมดออฟไลน์) ปล่อยผ่าน เพราะข้อมูลอยู่ในเครื่องคนเดียว
 * - ล็อกอินแบบไม่ระบุตัวตน (มาจากหน้าโดเนท) ไม่ถือว่าล็อกอินแล้ว
 */
export default function AuthGate({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const snapshot = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();

  if (!hasBackend) return <>{children}</>;

  // ยังไม่รู้สถานะ — กันหน้ากระพริบระหว่างเช็ค
  if (snapshot === "loading") {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin-slow rounded-full border border-champagne/20 border-t-champagne/80" />
          <p className="font-display text-xs tracking-luxe text-muted">กำลังตรวจสอบ</p>
        </div>
      </div>
    );
  }

  if (!user || user.anonymous) {
    return (
      <div className="py-6">
        <AuthPanel title={title} description={description} />
      </div>
    );
  }

  return <>{children}</>;
}
