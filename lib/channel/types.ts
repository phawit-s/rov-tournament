import { DEFAULT_SONG_CONFIG, type SongConfig } from "@/lib/song/types";

/** ไลฟ์ของช่อง — ใช้ทำป้าย "ไลฟ์อยู่" ที่กดแล้วพาไปดูได้ */
export type LiveInfo = {
  /** กำลังไลฟ์อยู่ไหม */
  isLive: boolean;
  platform: "tiktok" | "youtube" | "facebook" | "twitch" | "other";
  url: string;
  title?: string;
};

/**
 * ช่อง = หน้าขอเพลงของสตรีมเมอร์หนึ่งคน
 *
 * เอกสารเก่าบน Firestore ยังมีฟิลด์ donate / member / timer ค้างอยู่
 * (สมัยที่เว็บยังมีโดเนทกับนาฬิกา) ตั้งใจไม่ลบ — การบันทึกช่องใช้ merge
 * ของพวกนั้นจึงอยู่ครบ แค่เว็บไม่อ่านแล้ว
 */
export type Channel = {
  /** ช่องแรกของบัญชีใช้ uid เป็นชื่อเอกสาร ช่องที่สองเป็นต้นไปเป็นรหัสสุ่ม */
  id: string;
  /** ชื่อสั้นในลิงก์ เช่น affarain */
  handle: string;
  name: string;
  tagline?: string;
  about?: string;
  avatar?: string;
  cover?: string;
  /** ลิงก์โซเชียล */
  links: { label: string; url: string }[];

  live: LiveInfo;
  /** ระบบขอเพลง YouTube — ช่องเก่าที่ยังไม่มีฟิลด์นี้ให้ถือว่าปิดอยู่ */
  songs?: SongConfig;

  ownerUid: string;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_CHANNEL: Omit<Channel, "id" | "ownerUid" | "createdAt" | "updatedAt"> =
  {
    handle: "",
    name: "",
    tagline: "",
    about: "",
    links: [],
    live: { isLive: false, platform: "tiktok", url: "" },
    songs: { ...DEFAULT_SONG_CONFIG },
  };

/** ทำ handle ให้ปลอดภัยสำหรับใส่ใน URL */
export function normalizeHandle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}
