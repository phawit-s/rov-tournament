import type { ComponentType } from "react";
import {
  IconGauge,
  IconMonitor,
  IconPlay,
  IconShield,
  IconSliders,
} from "@/components/ui/icons";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/** งานที่ค้างอยู่ซึ่งเมนูนี้เป็นคนสะสาง — โชว์เป็นตัวเลขบนเมนู */
export type StudioBadge = "streamerRequests";

export type StudioItem = {
  href: string;
  label: string;
  /** ชื่อสั้นใต้ไอคอนบน dock มือถือ (~60px ต่อช่อง) — ไม่ใส่ = ใช้ label */
  short?: string;
  Icon: IconType;
  /** เปิดได้เฉพาะผู้ดูแลระบบ */
  admin?: boolean;
  /** เปิดเป็นหน้าต่างใหม่ — ตัวเล่นต้องเปิดค้างไว้แยกจากสตูดิโอทั้งคืน */
  external?: boolean;
  badge?: StudioBadge;
};

/**
 * สารบัญของสตูดิโอ — dock ล่างจอ (ทั้งจอกว้างและมือถือ) ใช้ชุดนี้
 * เรียงตามความถี่ที่ใช้ระหว่างไลฟ์: ดูภาพรวม → คิว/ตัวเล่น → ตั้งค่าที่แก้นานๆ ครั้ง
 *
 * ตัวเล่นอยู่ในหน้าคิวแล้ว (ต.ค. 2569) ไม่มีเมนูแยก — /player/ ยังเปิดเป็นหน้าต่างแยกได้
 * จากปุ่มในหน้าคิว สำหรับคนที่จับหน้าต่างตัวเล่นเข้า OBS
 */
export const STUDIO_NAV: StudioItem[] = [
  { href: "/studio/", label: "ภาพรวม", Icon: IconGauge },
  { href: "/studio/queue/", label: "คิวและตัวเล่น", short: "คิวเพลง", Icon: IconPlay },
  { href: "/studio/channel/", label: "ตั้งค่าช่อง", short: "ตั้งค่า", Icon: IconSliders },
  { href: "/studio/widgets/", label: "ลิงก์สำหรับ OBS", short: "OBS", Icon: IconMonitor },
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
