"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { hasBackend } from "@/lib/backend/firebase";
import { useSiteRole } from "@/hooks/useRole";
import { ArtShield, EmptyState, Skeleton } from "@/components/tournament/ui";
import Panel from "@/components/ui/Panel";

/**
 * ชั้นในสุดของสตูดิโอ — หน้าที่เปิดได้เฉพาะผู้ดูแลระบบ
 *
 * StudioShell ปล่อยสตรีมเมอร์เข้ามาถึงตรงนี้ได้ (เมนูไม่โชว์ แต่พิมพ์ URL ตรงได้)
 * จึงต้องเช็กซ้ำ และต้องเป็น "ยืนยันจาก Firestore" เท่านั้น —
 * รหัสผู้จัดในเครื่องไม่ได้ทำให้อ่านรายชื่อผู้ใช้บนคลาวด์ได้ ต่อให้หน้าจอยอมให้ผ่าน
 */
export default function AdminOnly({ children }: { children: ReactNode }) {
  const { role, loading } = useSiteRole();

  if (!hasBackend) {
    return (
      <Panel className="p-6">
        <EmptyState
          art={<ArtShield />}
          title="หน้านี้ต้องเชื่อม Firebase ก่อน"
          description="โหมดไม่มีหลังบ้านเก็บข้อมูลไว้ในเบราว์เซอร์เครื่องเดียว จึงไม่มีระบบให้ดูแล"
        />
      </Panel>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <Panel className="p-6">
        <EmptyState
          art={<ArtShield />}
          title="เฉพาะผู้ดูแลระบบ"
          description="ส่วนนี้เห็นข้อมูลของทุกคนในระบบ จึงเปิดให้เฉพาะบัญชีที่อยู่ในรายชื่อผู้ดูแลบนคลาวด์ — สิทธิ์สตรีมเมอร์ครอบคลุมแค่ช่องของตัวเอง"
          action={
            <Link
              href="/studio/"
              className="font-display text-sm text-iris hover:underline"
            >
              กลับหน้าภาพรวม →
            </Link>
          }
        />
      </Panel>
    );
  }

  return <>{children}</>;
}
