"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { repairDuplicatedHash } from "@/lib/hash";
import { BRAND } from "@/lib/brand";
import SiteHeader from "./SiteHeader";
import ToastHost from "./ui/Toast";

/**
 * เปลือกของหน้าสาธารณะ — แถบบน เนื้อหา ท้ายหน้า
 * (สตูดิโอมีเปลือกของตัวเองที่ StudioShell, widget ไม่มีเปลือกเลย)
 */
export default function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname() ?? "/";

  /*
    ล้าง hash ที่ซ้อนกันหลังเปลี่ยนหน้า — ดู lib/hash.ts ว่ามันซ้อนได้ยังไง
    ตัวอ่านค่ายึดก้อนท้ายอยู่แล้ว ตรงนี้แค่ทำที่อยู่ให้สะอาดพอจะก๊อปไปแปะต่อได้
  */
  useEffect(() => {
    repairDuplicatedHash();
    window.addEventListener("hashchange", repairDuplicatedHash);
    return () => window.removeEventListener("hashchange", repairDuplicatedHash);
  }, [pathname]);

  const width = wide ? "max-w-[1400px]" : "max-w-[1120px]";

  return (
    <>
      <SiteHeader wide={wide} />
      <main className={`mx-auto w-full ${width} px-5 pt-6 pb-16 sm:px-8 sm:pt-10`}>
        {children}
      </main>
      <footer className="border-t border-line">
        <div
          className={`mx-auto flex ${width} flex-wrap items-center gap-x-6 gap-y-0 px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] text-sm text-muted sm:px-8`}
        >
          <span className="font-semibold text-ink">{BRAND}</span>
          <span>ขอเพลงให้ไลฟ์ที่คุณดูอยู่</span>
          <span className="flex-1" />
          <Link href="/" className="inline-flex min-h-11 items-center hover:text-ink">
            ช่องที่เปิดรับเพลง
          </Link>
          <Link href="/studio/" className="inline-flex min-h-11 items-center hover:text-ink">
            สำหรับสตรีมเมอร์
          </Link>
        </div>
      </footer>
      <ToastHost />
    </>
  );
}
