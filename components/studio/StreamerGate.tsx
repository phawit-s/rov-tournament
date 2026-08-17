"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { hasBackend } from "@/lib/backend/firebase";
import { useSiteRole } from "@/hooks/useRole";
import AdminGate from "@/components/auth/AdminGate";
import ProfileGate from "@/components/auth/ProfileGate";
import AuthPanel from "@/components/auth/AuthPanel";
import Panel from "@/components/ui/Panel";
import { ArtShield, EmptyState, Skeleton } from "@/components/tournament/ui";

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

  // ไม่มีแบ็กเอนด์ = เหลือทางเข้าเดียวคือรหัสผู้จัดในเครื่อง
  if (!hasBackend) return <AdminGate>{children}</AdminGate>;

  if (loading) {
    return (
      <div className="space-y-4 py-6" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (studio) return <ProfileGate>{children}</ProfileGate>;

  if (!signedIn) {
    return (
      <div className="py-6">
        <AuthPanel title={title} description={description} />
      </div>
    );
  }

  return (
    <Panel className="mx-auto max-w-xl p-6 sm:p-7">
      <EmptyState
        art={<ArtShield />}
        title={title}
        description="บัญชีนี้ยังไม่มีสิทธิ์สตรีมเมอร์ — ขอเปิดช่องได้ที่สตูดิโอ ผู้ดูแลจะกดอนุมัติให้"
        action={
          <Link href="/studio/" className="font-display text-sm text-iris hover:underline">
            ไปขอสิทธิ์ที่สตูดิโอ →
          </Link>
        }
      />
    </Panel>
  );
}
