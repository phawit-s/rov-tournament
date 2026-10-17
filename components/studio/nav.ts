import type { ComponentType } from "react";
import {
  IconGauge,
  IconMonitor,
  IconPlay,
  IconQueue,
  IconShield,
  IconSliders,
} from "@/components/ui/icons";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/** งานที่ค้างอยู่ซึ่งเมนูนี้เป็นคนสะสาง — โชว์เป็นตัวเลขบนเมนู */
export type StudioBadge = "streamerRequests";

export type StudioItem = {
  href: string;
  label: string;
  Icon: IconType;
  /** เปิดได้เฉพาะผู้ดูแลระบบ */
  admin?: boolean;
  /** เปิดเป็นหน้าต่างใหม่ — ตัวเล่นต้องเปิดค้างไว้แยกจากสตูดิโอทั้งคืน */
  external?: boolean;
  badge?: StudioBadge;
};

/**
 * สารบัญของสตูดิโอ — แถบข้าง (จอกว้าง) กับแถบแท็บ (มือถือ) ใช้ชุดเดียวกัน
 * เรียงตามความถี่ที่ใช้ระหว่างไลฟ์: ดูภาพรวม → จัดคิว → เปิดตัวเล่น → ตั้งค่าที่แก้นานๆ ครั้ง
 */
export const STUDIO_NAV: StudioItem[] = [
  { href: "/studio/", label: "ภาพรวม", Icon: IconGauge },
  { href: "/studio/queue/", label: "คิวเพลง", Icon: IconQueue },
  { href: "/player/", label: "ตัวเล่น", Icon: IconPlay, external: true },
  { href: "/studio/channel/", label: "ตั้งค่าช่อง", Icon: IconSliders },
  { href: "/studio/widgets/", label: "ลิงก์สำหรับ OBS", Icon: IconMonitor },
  {
    href: "/studio/roles/",
    label: "สตรีมเมอร์",
    Icon: IconShield,
    admin: true,
    badge: "streamerRequests",
  },
];

export function studioNavFor(admin: boolean): StudioItem[] {
  return admin ? STUDIO_NAV : STUDIO_NAV.filter((item) => !item.admin);
}

function clean(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

export function isStudioActive(href: string, pathname: string | null): boolean {
  const target = clean(href);
  const current = clean(pathname ?? "/");
  // "/studio" เป็นหน้าภาพรวม ไม่ใช่หัวข้อรวมของทุกหน้าลูก จึงต้องตรงเป๊ะ
  if (target === "/studio") return current === "/studio";
  return current === target || current.startsWith(`${target}/`);
}
