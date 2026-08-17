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

  /**
   * ความยาวคลิปเป็นวินาที — ตัวเล่นเขียนให้ตอนเริ่มเล่นจริง
   *
   * oEmbed ไม่บอกข้อมูลนี้ มีแต่ตัวเล่นที่รู้ widget จึงต้องรอให้ตัวเล่น
   * บอกมาก่อนถึงจะวาดแถบความคืบหน้าได้ (ใบเก่าไม่มีฟิลด์นี้ ก็แค่ไม่มีแถบ)
   */
  duration?: number;

  /**
   * ใครเป็นคนใส่เข้าคิว — ใบเก่าไม่มีฟิลด์นี้ ถือว่ามาจากคนดู
   *
   * filler คือเพลงจากเพลย์ลิสต์สำรองที่ระบบหยิบมาเล่นเองตอนไม่มีใครขอ
   * ต้องอยู่ท้ายคิวเสมอ พอมีคนขอจริงเข้ามาจะได้แทรกขึ้นก่อน
   *
   * tiktok คือใบที่มาจากการพิมพ์ในแชทไลฟ์ ไม่ได้มาจากหน้าเว็บ
   * (Worker เป็นคนเขียนให้ ดู worker/song-ingest.js) จัดคิวเหมือน viewer
   * ทุกอย่าง แยกไว้เพื่อให้สตรีมเมอร์เห็นว่าใบไหนมาจากไหน — ชื่อคนขอ
   * เป็นชื่อ TikTok ซึ่งกดตามไปดูในแชทได้ ต่างจากชื่อที่พิมพ์เองในหน้าเว็บ
   */
  source?: "viewer" | "streamer" | "filler" | "tiktok";

  /**
   * คีย์ที่ใช้เรียงคิว — มีเฉพาะใบที่ถูกสลับลำดับด้วยมือ
   *
   * ปกติคิวเรียงตามเวลาที่ขอ (มาก่อนได้ก่อน) พอสตรีมเมอร์เลื่อนลำดับเอง
   * จะเขียนคีย์นี้ทับ ใบที่ไม่มีคีย์ก็ใช้ createdAt ไปตามเดิม
   * เก็บเป็นสตริงเวลาแบบเดียวกับ createdAt จะได้เทียบกันตรงๆ ได้
   */
  orderKey?: string;
};

/** เพลงในเพลย์ลิสต์สำรองของช่อง */
export type FillerTrack = {
  videoId: string;
  title: string;
  author: string;
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

  /**
   * เพลย์ลิสต์สำรอง — เอาไว้เล่นตอนไม่มีใครขอเพลง จะได้ไม่เงียบทั้งไลฟ์
   * ระบบจะหยิบมาต่อคิวให้เองทีละเพลงเมื่อคิวว่าง
   */
  filler?: FillerTrack[];
  /** off = ไม่เล่นสำรองเลย · order = ไล่ตามลำดับ · shuffle = สุ่ม */
  fillerMode?: "off" | "order" | "shuffle";

  /**
   * ลิงก์ Worker ที่ใช้ค้นหาเพลง — ว่างไว้ = ไม่มีช่องค้นหา ใช้วางลิงก์แทน
   * คีย์ YouTube อยู่ใน Worker ไม่ได้อยู่ในหน้าเว็บ
   */
  searchEndpoint?: string;
};

export const DEFAULT_SONG_CONFIG: SongConfig = {
  enabled: false,
  maxPerUser: 2,
  maxQueue: 30,
  allowDuplicates: false,
  note: "วางลิงก์ YouTube ได้เลย เพลงจะเข้าคิวรอสตรีมเมอร์เปิด",
  filler: [],
  fillerMode: "off",
};
