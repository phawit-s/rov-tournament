import type { DonateConfig, LiveInfo, MemberConfig } from "@/lib/tournament/types";
import { DEFAULT_SONG_CONFIG, type SongConfig } from "@/lib/song/types";

/**
 * ช่อง = โปรไฟล์ของผู้จัด/สตรีมเมอร์ หนึ่งบัญชีหนึ่งช่อง
 *
 * ระบบโดเนทกับสมาชิกอยู่ที่ระดับช่อง ไม่ใช่ระดับทัวร์
 * จะได้ตั้งพร้อมเพย์กับแพ็กเกจสมาชิกครั้งเดียว แล้วใช้ได้ทุกทัวร์
 * และ widget แจ้งเตือนใน OBS ใช้ลิงก์เดียวตลอด ไม่ต้องเปลี่ยนทุกครั้งที่จัดทัวร์ใหม่
 */
export type Channel = {
  /** ใช้ uid ของเจ้าของเป็น id เลย จะได้ไม่ต้องจัดการ id ซ้ำ */
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
  donate: DonateConfig;
  member: MemberConfig;
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
    donate: {
      enabled: false,
      promptPayId: "",
      displayName: "",
      note: "โอนแล้วแนบสลิป ชื่อจะขึ้นหน้าจอสตรีม",
      quickAmounts: [20, 50, 100, 300, 500],
    },
    member: {
      enabled: false,
      headline: "สมัครสมาชิก",
      description: "สมัครรายเดือน รับป้ายสมาชิกและสิทธิพิเศษ",
      tiers: [],
      showMemberList: true,
    },
    songs: { ...DEFAULT_SONG_CONFIG },
  };

/** ทำ handle ให้ปลอดภัยสำหรับใส่ใน URL */
export function normalizeHandle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}
