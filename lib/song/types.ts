/** สถานะของคำขอเพลงในคิว */
export type SongStatus = "queued" | "playing" | "played" | "rejected";

export type SongRequest = {
  id: string;
  channelId: string;

  /* ---- คลิป ---- */
  videoId: string;
  title: string;
  author: string;
  url: string;

  /* ---- คนขอ ---- */
  byUid: string;
  byName: string;
  message?: string | null;

  status: SongStatus;
  createdAt: string;
  /** เวลาที่สตรีมเมอร์กดเล่น ใช้เรียงประวัติและคิดสถิติ */
  playedAt?: string | null;
};

/** ตั้งค่าระบบขอเพลงของช่อง */
export type SongConfig = {
  enabled: boolean;
  /** คนหนึ่งขอค้างในคิวได้กี่เพลง (0 = ไม่จำกัด) */
  maxPerUser?: number;
  /** ปิดรับเมื่อคิวยาวถึงจำนวนนี้ (0 = ไม่จำกัด) */
  maxQueue?: number;
  /** ยอมให้ขอเพลงที่มีอยู่ในคิวแล้วซ้ำไหม */
  allowDuplicates?: boolean;
  /** ข้อความบอกกติกาที่หน้าขอเพลง */
  note?: string;
};

export const DEFAULT_SONG_CONFIG: SongConfig = {
  enabled: false,
  maxPerUser: 2,
  maxQueue: 30,
  allowDuplicates: false,
  note: "วางลิงก์ YouTube ได้เลย เพลงจะเข้าคิวรอสตรีมเมอร์เปิด",
};
