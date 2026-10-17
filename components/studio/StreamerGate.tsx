"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { hasBackend } from "@/lib/backend/firebase";
import { useSiteRole } from "@/hooks/useRole";
import ProfileGate from "@/components/auth/ProfileGate";
import AuthPanel from "@/components/auth/AuthPanel";
import { EmptyState, Skeleton } from "@/components/ui/kit";

/**
 * ด่านสิทธิ์สตรีมเมอร์สำหรับหน้าที่อยู่ "นอก" สตูดิโอ
 *
 * มีหน้าเดียวที่เข้าข่าย: ตัวเล่นเพลง /player/ ซึ่งตั้งใจให้เปิดเป็นหน้าต่างแยก
 * ทั้งหน้าต่างระหว่างไลฟ์ จึงไม่ควรมีแถบข้างของสตูดิโอมากินพื้นที่
 * นอกจากนั้นทุกหน้าใช้ด่านใน StudioShell แทน
 */
export default function StreamerGate({
  children,
  title = "หน้านี้สำหรับสตรีมเมอร์",
  description,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { studio, loading, signedIn } = useSiteRole();

  // ไม่มีแบ็กเอนด์ = ไม่มีคิวให้เล่น ไม่มีบัญชีให้ตรวจสิทธิ์ — บอกตรงๆ ว่าต้องตั้งค่าอะไร
  if (!hasBackend) {
    return (
      <EmptyState
        className="max-w-160"
        title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
        description="ตั้งค่า Firebase แล้ว build ใหม่ ตัวเล่นเพลงกับคิวถึงจะใช้ได้"
      />
    );
  }

  if (loading) {
    return (
      <div className="max-w-160" aria-busy="true" aria-label="กำลังตรวจสอบสิทธิ์">
        <Skeleton className="h-9 w-2/3 max-w-xs" />
        <Skeleton className="mt-4 h-4 w-4/5" />
        <Skeleton className="mt-8 aspect-video w-full rounded-stage" />
      </div>
    );
  }

  if (studio) return <ProfileGate>{children}</ProfileGate>;

  if (!signedIn) return <AuthPanel title={title} description={description} />;

  return (
    <EmptyState
      className="max-w-160"
      title={title}
      description="บัญชีนี้ยังไม่ได้เปิดคิวขอเพลง ส่งคำขอที่สตูดิโอแล้วรอผู้ดูแลอนุมัติ จากนั้นกลับมาเปิดหน้านี้ได้เลย"
      action={
        <Link
          href="/studio/"
          className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
        >
          ขอเปิดคิวเพลงที่สตูดิโอ
        </Link>
      }
    />
  );
}
