"use client";

import { useSyncExternalStore } from "react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { Skeleton } from "../tournament/ui";
import AuthPanel from "./AuthPanel";
import ProfileGate from "./ProfileGate";

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

  // ยังไม่รู้สถานะ — วาดโครงหน้าปลายทางไว้ก่อน ดีกว่าวงกลมหมุนที่ไม่บอกอะไร
  if (snapshot === "loading") return <GateSkeleton />;

  if (!user || user.anonymous) {
    return (
      <div className="py-6">
        <AuthPanel title={title} description={description} />
      </div>
    );
  }

  /*
    ล็อกอินแล้วยังไม่พอ — ต้องรู้ด้วยว่าใครเป็นใคร
    ProfileGate จะขอชื่อในเกมครั้งเดียวสำหรับคนที่ล็อกอินด้วย Google
    (สมัครด้วยอีเมลกรอกไปแล้วตอนสมัคร จึงผ่านฉลุย)
    วางไว้ตรงนี้ที่เดียวเพื่อให้ทุกหน้าที่ต้องล็อกอินได้เงื่อนไขเดียวกันหมด
  */
  return <ProfileGate>{children}</ProfileGate>;
}

function GateSkeleton() {
  return (
    <div className="space-y-6 py-2" aria-busy="true" aria-label="กำลังตรวจสอบสิทธิ์">
      {/* หัวข้อ */}
      <div className="border-t border-hair pt-4">
        <div className="grid grid-cols-12 items-end gap-x-3 gap-y-4">
          <Skeleton className="col-span-2 h-10 lg:col-span-1" />
          <div className="col-span-10 space-y-3 lg:col-span-7">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-px w-28" />
          </div>
        </div>
      </div>

      {/* เนื้อความ 3 แถบ */}
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-full max-w-xl" />
        <Skeleton className="h-3 w-4/5 max-w-lg" />
        <Skeleton className="h-3 w-3/5 max-w-md" />
      </div>

      {/* การ์ด 2 ใบ */}
      <div className="grid gap-5 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="surface hairline-top rounded-2xl p-6">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-5 w-1/2" />
            <Skeleton className="mt-6 h-3 w-full" />
            <Skeleton className="mt-2.5 h-3 w-5/6" />
            <Skeleton className="mt-6 h-9 w-32 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
