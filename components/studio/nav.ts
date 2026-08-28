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

/**
 * กลุ่มเมนู — แบ่งตาม "จังหวะที่คนเข้ามาทำ" ไม่ใช่ตามชนิดข้อมูล
 *
 *  live    ของที่กดระหว่างไลฟ์ หรือเปิดค้างไว้ทั้งคืน
 *  league  งานจัดทัวร์ ซึ่งทำเป็นรอบๆ ไม่ได้แตะทุกวัน
 *  system  งานผู้ดูแล ทำนานๆ ครั้งแต่ต้องหาเจอทันทีเมื่อต้องใช้
 *
 * ของเดิมแบ่งเป็น "ช่องของฉัน / ทัวร์นาเมนต์ / ผู้ดูแลระบบ" ซึ่งฟังดูเข้าท่า
 * แต่เอา "ประวัติการทำงาน" (ของเครื่องนี้ ไม่เกี่ยวกับทัวร์) ไปไว้ใต้ทัวร์นาเมนต์
 * และเอาตัวเล่นเพลงที่ต้องกดทุกคืนไปปนกับฟอร์มตั้งค่าที่แก้ปีละครั้ง
 */
export type StudioGroup = "live" | "league" | "system";

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

/** งานที่ค้างอยู่ซึ่งเมนูนี้เป็นคนสะสาง — โชว์เป็นตัวเลขบนเมนู */
export type StudioBadge = "streamerRequests";

export type StudioItem = {
  href: string;
  label: string;
  /** คำอธิบายสั้นๆ ใช้ในหน้าภาพรวม ตัวค้นหา และ tooltip */
  detail: string;
  group: StudioGroup;
  Icon: IconType;
  /** คำพ้องสำหรับตัวค้นหา — คนพิมพ์ "โดเนท" แล้วต้องเจอหน้าช่อง */
  keywords?: string[];
  /**
   * เส้นทางอื่นที่ยังนับว่า "อยู่ในเมนูนี้"
   *
   * หน้าทัวร์รายตัวอยู่ที่ /studio/tournament/ (เอกพจน์) ซึ่งไม่ใช่ลูกของ
   * /studio/tournaments/ ตามตัวอักษร ถ้าไม่บอกไว้ แถบข้างจะไม่ไฮไลต์อะไรเลย
   * ตอนเปิดทัวร์อยู่ — ซึ่งอ่านเหมือนหลุดออกไปนอกหลังบ้านแล้ว
   */
  alsoActive?: string[];
  /** เปิดได้เฉพาะผู้ดูแลระบบ สตรีมเมอร์ไม่เห็นเมนูนี้ */
  admin?: boolean;
  /** หน้าที่ตั้งใจให้เปิดแยกหน้าต่าง (ตัวเล่นเพลงอยู่นอกสตูดิโอ) */
  external?: boolean;
  /** ส่วนย่อยของหน้านี้ — กางออกเฉพาะตอนเปิดหน้านั้นอยู่ */
  sub?: StudioSub[];
  badge?: StudioBadge;
};

/**
 * สารบัญของสตูดิโอ — แถบข้าง หน้าภาพรวม ตัวค้นหา และท้ายเล่มใช้ชุดเดียวกันนี้
 * เพิ่มเมนูทีต้องแก้ที่นี่ที่เดียว ไม่งั้นสี่ที่จะเริ่มไม่ตรงกันภายในสัปดาห์เดียว
 */
export const STUDIO_NAV: StudioItem[] = [
  {
    href: "/studio/",
    label: "ภาพรวม",
    detail: "สรุปช่องของคุณ งานที่ค้าง และทางลัดที่ใช้บ่อย",
    group: "live",
    Icon: IconGauge,
    keywords: ["dashboard", "หน้าแรก", "home"],
  },
  {
    href: "/studio/channel/",
    label: "ช่องของฉัน",
    detail: "พร้อมเพย์ แพ็กเกจสมาชิก ขอเพลง และสลิปที่รออนุมัติ",
    group: "live",
    Icon: IconHeart,
    keywords: ["โดเนท", "donate", "พร้อมเพย์", "สมาชิก", "member", "สลิป", "channel"],
    sub: [
      { hash: "home", label: "ภาพรวมช่อง" },
      { hash: "inbox", label: "สลิปโดเนท" },
      { hash: "settings", label: "ตั้งค่าช่อง" },
      { hash: "songs", label: "คิวขอเพลง" },
    ],
  },
  {
    href: "/player/",
    label: "เล่นเพลงตามคิว",
    detail: "ตัวเล่นเต็มจอ เปิดค้างไว้อีกหน้าต่างระหว่างไลฟ์",
    group: "live",
    Icon: IconMusic,
    keywords: ["เพลง", "song", "player", "คิว", "youtube"],
    external: true,
  },
  {
    href: "/studio/timer/",
    label: "จับเวลาสด",
    detail: "นาฬิกาถอยหลังบนสตรีม พร้อมวงล้อบวก/ลบเวลา",
    group: "live",
    Icon: IconTimer,
    keywords: ["timer", "นับถอยหลัง", "countdown"],
  },
  {
    href: "/studio/widgets/",
    label: "Widget",
    detail: "สร้างลิงก์กราฟิกสำหรับวางใน OBS",
    group: "live",
    Icon: IconMonitor,
    keywords: ["obs", "overlay", "streamlabs", "browser source"],
  },
  {
    href: "/studio/tournaments/",
    label: "ทัวร์นาเมนต์",
    detail: "รับสมัคร สุ่มทีม จัดสาย กรอกผล และคิดเงินรางวัล",
    group: "league",
    Icon: IconTrophy,
    keywords: ["ทัวร์", "แข่ง", "สาย", "bracket", "สมัคร", "สุ่มทีม"],
    alsoActive: ["/studio/tournament/"],
  },
  {
    href: "/studio/players/",
    label: "ผู้เล่น",
    detail: "ประวัติการแข่งของผู้เล่นแต่ละคน",
    group: "league",
    Icon: IconUsers,
    keywords: ["สถิติ", "stats", "ประวัติ"],
  },
  {
    href: "/studio/system/",
    label: "ทั้งระบบ",
    detail: "ผู้ใช้ ช่อง และทัวร์ทั้งหมดบนคลาวด์",
    group: "system",
    Icon: IconLock,
    keywords: ["backoffice", "ผู้ใช้", "users", "admin"],
    admin: true,
  },
  {
    href: "/studio/roles/",
    label: "สิทธิ์และคำขอ",
    detail: "อนุมัติสตรีมเมอร์ และจัดการผู้ดูแลระบบ",
    group: "system",
    Icon: IconShield,
    keywords: ["อนุมัติ", "streamer", "สิทธิ์", "role"],
    admin: true,
    badge: "streamerRequests",
  },
  {
    href: "/studio/activity/",
    label: "ประวัติการทำงาน",
    detail: "บันทึกทุกอย่างที่เกิดขึ้นในเครื่องนี้",
    group: "system",
    Icon: IconClock,
    keywords: ["log", "audit", "บันทึก"],
  },
];

export const STUDIO_GROUPS: { key: StudioGroup; title: string }[] = [
  { key: "live", title: "ระหว่างไลฟ์" },
  { key: "league", title: "ทัวร์นาเมนต์" },
  { key: "system", title: "ระบบ" },
];

export function studioNavFor(admin: boolean): StudioItem[] {
  return admin ? STUDIO_NAV : STUDIO_NAV.filter((item) => !item.admin);
}

function clean(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

export function isStudioActive(
  href: string,
  pathname: string | null,
  alsoActive: string[] = [],
): boolean {
  const target = clean(href);
  const current = clean(pathname ?? "/");
  const hit = (t: string) => current === t || current.startsWith(`${t}/`);
  // "/studio" เป็นหน้าภาพรวม ไม่ใช่หัวข้อรวมของทุกหน้าลูก จึงต้องตรงเป๊ะ
  if (target === "/studio") return current === "/studio";
  return hit(target) || alsoActive.map(clean).some(hit);
}

/** เมนูของหน้าปัจจุบัน — ใช้ทั้งชื่อหน้าบนแถบบนและคำอธิบายใต้ชื่อ */
export function studioPage(pathname: string | null): StudioItem | null {
  return (
    STUDIO_NAV.find((item) =>
      isStudioActive(item.href, pathname, item.alsoActive),
    ) ?? null
  );
}

/** ชื่อหน้าปัจจุบัน ใช้บนแถบบน */
export function studioTitle(pathname: string | null): string {
  return studioPage(pathname)?.label ?? "สตูดิโอ";
}

/** ค้นเมนูจากคำที่พิมพ์ — ดูทั้งชื่อ คำอธิบาย และคำพ้อง */
export function searchStudio(items: StudioItem[], raw: string): StudioItem[] {
  const q = raw.trim().toLocaleLowerCase("th");
  if (!q) return items;
  return items.filter((item) =>
    [item.label, item.detail, ...(item.keywords ?? [])]
      .join(" ")
      .toLocaleLowerCase("th")
      .includes(q),
  );
}
