import type { ComponentType } from "react";
import {
  IconClock,
  IconGauge,
  IconHeart,
  IconLock,
  IconMonitor,
  IconMusic,
  IconShield,
  IconTimer,
  IconTrophy,
  IconUsers,
} from "@/components/ui/icons";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export type StudioGroup = "channel" | "league" | "system";

/**
 * ส่วนย่อยในหน้าเดียวกัน — โผล่เป็นเมนูลูกใต้เมนูแม่ตอนอยู่ในหน้านั้น
 *
 * หน้าช่องยาวเกินกว่าจะอ่านรวดเดียว แต่ถ้าให้มันมีแถบแท็บของตัวเองอีกชุด
 * หน้าจอจะมีที่ให้กดเปลี่ยนเรื่องสองแถวซ้อนกัน (แถบข้าง + แท็บในหน้า)
 * ซึ่งอ่านไม่ออกว่าอันไหนคุมอะไร — ยกมาไว้ในแถบข้างชุดเดียวจบ
 */
export type StudioSub = {
  /** ค่าใน #tab= ของหน้านั้น */
  hash: string;
  label: string;
};

export type StudioItem = {
  href: string;
  label: string;
  /** คำอธิบายสั้นๆ ใช้ในหน้าภาพรวมและ tooltip */
  detail: string;
  group: StudioGroup;
  Icon: IconType;
  /** เปิดได้เฉพาะผู้ดูแลระบบ สตรีมเมอร์ไม่เห็นเมนูนี้ */
  admin?: boolean;
  /** หน้าที่ตั้งใจให้เปิดแยกหน้าต่าง (ตัวเล่นเพลงอยู่นอกสตูดิโอ) */
  external?: boolean;
  /** ส่วนย่อยของหน้านี้ — กางออกเฉพาะตอนเปิดหน้านั้นอยู่ */
  sub?: StudioSub[];
};

/**
 * สารบัญของสตูดิโอ — แถบข้าง หน้าภาพรวม และท้ายเล่มใช้ชุดเดียวกันนี้
 * เพิ่มเมนูทีต้องแก้ที่นี่ที่เดียว ไม่งั้นสามที่จะเริ่มไม่ตรงกันภายในสัปดาห์เดียว
 */
export const STUDIO_NAV: StudioItem[] = [
  {
    href: "/studio/",
    label: "ภาพรวม",
    detail: "สรุปช่องของคุณและทางลัดที่ใช้บ่อย",
    group: "channel",
    Icon: IconGauge,
  },
  {
    href: "/studio/channel/",
    label: "ช่องของฉัน",
    detail: "พร้อมเพย์ แพ็กเกจสมาชิก ขอเพลง และสลิปที่รออนุมัติ",
    group: "channel",
    Icon: IconHeart,
    sub: [
      { hash: "home", label: "ภาพรวมช่อง" },
      { hash: "inbox", label: "สลิปโดเนท" },
      { hash: "settings", label: "ตั้งค่าช่อง" },
      { hash: "songs", label: "คิวขอเพลง" },
    ],
  },
  {
    href: "/studio/timer/",
    label: "จับเวลาสด",
    detail: "นาฬิกาถอยหลังบนสตรีม พร้อมวงล้อบวก/ลบเวลา",
    group: "channel",
    Icon: IconTimer,
  },
  {
    href: "/studio/widgets/",
    label: "Widget",
    detail: "สร้างลิงก์กราฟิกสำหรับวางใน OBS",
    group: "channel",
    Icon: IconMonitor,
  },
  {
    href: "/player/",
    label: "เล่นเพลงตามคิว",
    detail: "ตัวเล่นเต็มจอ เปิดค้างไว้อีกหน้าต่างระหว่างไลฟ์",
    group: "channel",
    Icon: IconMusic,
    external: true,
  },
  {
    href: "/studio/tournaments/",
    label: "ทัวร์นาเมนต์",
    detail: "รับสมัคร จัดสาย กรอกผล และคิดเงินรางวัล",
    group: "league",
    Icon: IconTrophy,
  },
  {
    href: "/studio/players/",
    label: "ผู้เล่น",
    detail: "ประวัติการแข่งของผู้เล่นแต่ละคน",
    group: "league",
    Icon: IconUsers,
  },
  {
    href: "/studio/activity/",
    label: "ประวัติการทำงาน",
    detail: "บันทึกทุกอย่างที่เกิดขึ้นในเครื่องนี้",
    group: "league",
    Icon: IconClock,
  },
  {
    href: "/studio/system/",
    label: "ทั้งระบบ",
    detail: "ผู้ใช้ ช่อง และทัวร์ทั้งหมดบนคลาวด์",
    group: "system",
    Icon: IconLock,
    admin: true,
  },
  {
    href: "/studio/roles/",
    label: "สิทธิ์และคำขอ",
    detail: "อนุมัติสตรีมเมอร์ และจัดการผู้ดูแลระบบ",
    group: "system",
    Icon: IconShield,
    admin: true,
  },
];

export const STUDIO_GROUPS: { key: StudioGroup; title: string }[] = [
  { key: "channel", title: "ช่องของฉัน" },
  { key: "league", title: "ทัวร์นาเมนต์" },
  { key: "system", title: "ผู้ดูแลระบบ" },
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

/** ชื่อหน้าปัจจุบัน ใช้บนแถบบนของจอเล็ก */
export function studioTitle(pathname: string | null): string {
  const hit = STUDIO_NAV.find((item) => isStudioActive(item.href, pathname));
  return hit?.label ?? "สตูดิโอ";
}
