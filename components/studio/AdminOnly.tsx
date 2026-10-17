"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { hasBackend } from "@/lib/backend/firebase";
import { useSiteRole } from "@/hooks/useRole";
import { EmptyState, Skeleton } from "@/components/ui/kit";

/**
 * ชั้นในสุดของสตูดิโอ — หน้าที่เปิดได้เฉพาะผู้ดูแลระบบ
 *
 * StudioShell ปล่อยสตรีมเมอร์เข้ามาถึงตรงนี้ได้ (เมนูไม่โชว์ แต่พิมพ์ URL ตรงได้)
 * จึงต้องเช็กซ้ำ และต้องเป็นสิทธิ์ที่ Firestore ยืนยันแล้วเท่านั้น —
 * กติกาฝั่งฐานข้อมูลไม่ยอมให้คนอื่นอ่านรายชื่อผู้ใช้อยู่แล้ว ปล่อยผ่านไปก็เจอแค่หน้าที่พัง
 */
export default function AdminOnly({ children }: { children: ReactNode }) {
  const { role, loading } = useSiteRole();

  if (!hasBackend) {
    return (
      <EmptyState
        className="max-w-160"
        title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
        description="หน้านี้จัดการบัญชีที่เก็บบน Firebase ตั้งค่า Firebase แล้ว build ใหม่ถึงจะใช้ได้"
      />
    );
  }

  if (loading) {
    return (
      <div className="max-w-160" aria-busy="true" aria-label="กำลังตรวจสอบสิทธิ์">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="mt-4 h-4 w-4/5" />
        <Skeleton className="mt-8 h-56 w-full rounded-sheet" />
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <EmptyState
        className="max-w-160"
        title="หน้านี้สำหรับผู้ดูแลระบบ"
        description="หน้านี้เห็นบัญชีของทุกคนในระบบ จึงเปิดให้เฉพาะผู้ดูแล สิทธิ์สตรีมเมอร์จัดการได้แค่ช่องของตัวเอง"
        action={
          <Link
            href="/studio/"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
          >
            กลับหน้าแรกของสตูดิโอ
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
