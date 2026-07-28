/** จำนวนเกมที่ต้องชนะถึงจะจบแมตช์ */
export type BestOf = 1 | 3 | 5 | 7;

export type TeamEntry = {
  id: string;
  name: string;
  /** ชื่อผู้เล่นในทีม */
  members: string[];
  /** ชื่อผู้ติดต่อ / กัปตัน */
  contact?: string;
  logo?: string;
  /** เวลาที่สมัคร (ISO) */
  registeredAt: string;
  /** ผู้จัดยืนยันการสมัครแล้วหรือยัง */
  approved: boolean;
  seed?: number;
};

export type MatchSide = {
  /** id ของทีม — null = ยังไม่รู้ว่าใครจะเข้ามา */
  teamId: string | null;
  /** จำนวนเกมที่ชนะในแมตช์นี้ */
  score: number;
  /** มาจากแมตช์ไหน (ใช้วาดเส้นสาย) */
  fromMatch?: string;
};

export type Match = {
  id: string;
  round: number;
  /** ลำดับในรอบ เริ่มที่ 0 */
  order: number;
  bestOf: BestOf;
  a: MatchSide;
  b: MatchSide;
  /** id ทีมที่ชนะ — null = ยังไม่จบ */
  winnerId: string | null;
  /** true เมื่อฝั่งใดฝั่งหนึ่งเป็น BYE แล้วผ่านเข้ารอบอัตโนมัติ */
  bye: boolean;
  /** เวลาแข่ง (ISO) ตั้งได้จากตารางแข่ง */
  scheduledAt?: string;
  /** ลิงก์ไลฟ์เฉพาะแมตช์ */
  streamUrl?: string;
  note?: string;
};

export type Bracket = {
  /** จำนวนรอบทั้งหมด */
  rounds: number;
  matches: Match[];
  /** seed ที่ใช้สุ่มคู่ ตรวจย้อนหลังได้ */
  seed: string;
  createdAt: string;
};

export type PrizeSlot = {
  /** อันดับ 1, 2, 3... */
  place: number;
  label: string;
  /** สัดส่วน % ของเงินรางวัลรวม */
  percent: number;
  /** ถ้าตั้งจำนวนเงินตายตัว จะใช้ค่านี้แทน percent */
  fixed?: number;
};

export type PrizeConfig = {
  total: number;
  currency: string;
  slots: PrizeSlot[];
  note?: string;
};

export type LiveInfo = {
  /** กำลังไลฟ์อยู่ไหม */
  isLive: boolean;
  platform: "tiktok" | "youtube" | "facebook" | "twitch" | "other";
  url: string;
  title?: string;
};

export type TournamentStatus =
  | "draft"
  | "registration"
  | "ready"
  | "running"
  | "finished";

export type Tournament = {
  id: string;
  name: string;
  /** คำโปรย 1 บรรทัด */
  tagline?: string;
  description?: string;
  /** รูปปกเก็บเป็น data URL (ย่อแล้ว) */
  cover?: string;
  status: TournamentStatus;

  /** ขนาดทีมที่รับสมัคร */
  teamSize: number;
  /** จำนวนทีมสูงสุด 0 = ไม่จำกัด */
  maxTeams: number;

  registerOpenAt?: string;
  registerCloseAt?: string;
  startAt?: string;
  venue?: string;

  teams: TeamEntry[];
  bracket: Bracket | null;
  /** BO ของแต่ละรอบ index 0 = รอบแรก */
  roundBestOf: BestOf[];

  prize: PrizeConfig;
  live: LiveInfo;

  /** PIN โหมดผู้จัด (ทำงานฝั่ง client เท่านั้น กันมือลั่น ไม่ใช่ระบบความปลอดภัยจริง) */
  adminPin?: string;

  createdAt: string;
  updatedAt: string;
};

/** สรุปผลของผู้เล่นคนหนึ่ง รวบจากทุกทัวร์ */
export type PlayerRecord = {
  name: string;
  tournaments: {
    tournamentId: string;
    tournamentName: string;
    teamName: string;
    placement: number | null;
    status: TournamentStatus;
  }[];
  matchesPlayed: number;
  matchesWon: number;
  gamesWon: number;
  gamesLost: number;
  titles: number;
};
