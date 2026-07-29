import type { Tournament } from "./types";

export type Role = "owner" | "staff" | "member" | "guest";

export type Viewer = {
  uid?: string;
  email?: string | null;
  /** ล็อกอินแบบไม่ระบุตัวตน (หน้าโดเนทใช้) */
  anonymous?: boolean;
} | null;

/**
 * ประเมินสิทธิ์ของคนที่กำลังเปิดหน้าอยู่
 *
 *  owner  = เจ้าของทัวร์ (บัญชี Google ที่กดเผยแพร่)          — ทำได้ทุกอย่าง
 *  staff  = ทีมงานที่เจ้าของเพิ่มอีเมลไว้                      — กรอกผล/อนุมัติได้ แต่ลบทัวร์ไม่ได้
 *  member = ล็อกอิน Google แล้ว แต่ไม่ได้อยู่ในทีมงาน          — สมัครทีม/โดเนทได้
 *  guest  = ไม่ได้ล็อกอิน หรือล็อกอินแบบไม่ระบุตัวตน           — ดูอย่างเดียว + โดเนทได้
 */
export function roleFor(tournament: Tournament, viewer: Viewer): Role {
  // ยังไม่เคยเผยแพร่ขึ้นคลาวด์ = ทัวร์อยู่ในเครื่องนี้เครื่องเดียว
  // คนที่เปิดอยู่คือคนสร้าง ไม่ต้องล็อกอินก็จัดการได้
  if (!tournament.ownerUid) return "owner";

  if (!viewer?.uid || viewer.anonymous) return "guest";

  if (tournament.ownerUid === viewer.uid) return "owner";

  const email = viewer.email?.toLowerCase();
  if (email && (tournament.adminEmails ?? []).some((e) => e.toLowerCase() === email)) {
    return "staff";
  }

  return "member";
}

export const ROLE_META: Record<Role, { label: string; rgb: string; hint: string }> = {
  owner: {
    label: "เจ้าของทัวร์",
    rgb: "221 175 100",
    hint: "แก้ได้ทุกอย่าง รวมถึงลบทัวร์และเพิ่มทีมงาน",
  },
  staff: {
    label: "ทีมงาน",
    rgb: "109 146 219",
    hint: "กรอกผล จัดสาย อนุมัติสลิปได้ แต่ลบทัวร์หรือเพิ่มทีมงานไม่ได้",
  },
  member: {
    label: "ผู้ใช้ทั่วไป",
    rgb: "155 160 179",
    hint: "สมัครทีม โดเนท และดูผลได้",
  },
  guest: {
    label: "ผู้ชม",
    rgb: "155 160 179",
    hint: "ดูสายและผลได้ โดเนทได้ (ไม่ต้องล็อกอิน)",
  },
};

/** สิทธิ์ที่ใช้เช็คในหน้าจอ */
export const CAN = {
  /** แก้ข้อมูลทัวร์ จัดสาย กรอกผล อนุมัติสลิป */
  manage: (role: Role) => role === "owner" || role === "staff",
  /** ลบทัวร์ เพิ่ม/ลบทีมงาน เปลี่ยนเจ้าของ */
  own: (role: Role) => role === "owner",
  /** สมัครทีมเข้าแข่ง */
  register: (role: Role) => role !== "guest",
};

/** ตารางสิทธิ์ไว้โชว์ในหน้าเว็บ */
export const PERMISSION_MATRIX: {
  action: string;
  owner: boolean;
  staff: boolean;
  member: boolean;
  guest: boolean;
}[] = [
  { action: "ดูสาย ตารางแข่ง ผลการแข่ง", owner: true, staff: true, member: true, guest: true },
  { action: "โดเนท / สมัครสมาชิก", owner: true, staff: true, member: true, guest: true },
  { action: "สมัครทีมเข้าแข่ง", owner: true, staff: true, member: true, guest: false },
  { action: "กรอกผลแมตช์ / จัดสาย", owner: true, staff: true, member: false, guest: false },
  { action: "อนุมัติสลิปและใบสมัคร", owner: true, staff: true, member: false, guest: false },
  { action: "แก้ข้อมูลทัวร์ / เงินรางวัล", owner: true, staff: true, member: false, guest: false },
  { action: "เพิ่ม-ลบทีมงาน", owner: true, staff: false, member: false, guest: false },
  { action: "ลบทัวร์นาเมนต์", owner: true, staff: false, member: false, guest: false },
];
