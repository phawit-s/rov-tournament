"use client";

import { useSyncExternalStore } from "react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { EmptyState, Skeleton } from "../ui/kit";
import AuthPanel from "./AuthPanel";
import ProfileGate from "./ProfileGate";

/**
 * บังคับล็อกอินก่อนเข้าถึงเนื้อหา
 *
 * - ยังไม่ได้เชื่อม Firebase = ไม่มีบัญชีให้ล็อกอิน และหน้าที่อยู่หลังด่านนี้
 *   (โปรไฟล์ ตั้งค่าช่อง) ก็อ่านเขียนฐานข้อมูลทั้งหมด บอกตรงๆ ดีกว่าปล่อยผ่านไปเจอหน้าที่ใช้ไม่ได้
 * - ล็อกอินแบบไม่ระบุตัวตน (หน้าขอเพลงสร้างให้ตอนส่งเพลง) ไม่ถือว่าล็อกอินแล้ว
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

  if (!hasBackend) {
    return (
      <EmptyState
        className="max-w-160"
        title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
        description="ตั้งค่า Firebase แล้ว build ใหม่ ถึงจะล็อกอินและใช้หน้านี้ได้"
      />
    );
  }

  // ยังไม่รู้สถานะ — วาดโครงหน้าไว้ก่อน ดีกว่าวงกลมหมุนที่ไม่บอกอะไร
  if (snapshot === "loading") return <GateSkeleton />;

  if (!user || user.anonymous) {
    return <AuthPanel title={title} description={description} />;
  }

  /*
    ล็อกอินแล้วยังไม่พอ — ต้องรู้ด้วยว่าจะให้ชื่ออะไรขึ้นจอ
    ProfileGate จะขอชื่อที่แสดงครั้งเดียวสำหรับคนที่ล็อกอินด้วย Google
    (สมัครด้วยอีเมลกรอกไปแล้วตอนสมัคร จึงผ่านฉลุย)
    วางไว้ตรงนี้ที่เดียวเพื่อให้ทุกหน้าที่ต้องล็อกอินได้เงื่อนไขเดียวกันหมด
  */
  return <ProfileGate>{children}</ProfileGate>;
}

/** โครงหัวข้อ + เนื้อความ + กล่องเนื้อหา — ปลายทางเป็นได้ทั้งฟอร์มล็อกอินและหน้าจริง */
function GateSkeleton() {
  return (
    <div className="max-w-160" aria-busy="true" aria-label="กำลังตรวจสอบบัญชี">
      <Skeleton className="h-9 w-2/3 max-w-xs" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2.5 h-4 w-4/5" />
      <Skeleton className="mt-8 h-12 w-full rounded-field" />
      <Skeleton className="mt-4 h-12 w-full rounded-field" />
      <Skeleton className="mt-6 h-13 w-full rounded-full" />
    </div>
  );
}
