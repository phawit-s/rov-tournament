export type Player = {
  id: string;
  name: string;
};

/** โหมดกำหนดขนาดทีม */
export type SizeMode = "perTeam" | "teamCount";

/** จัดการคนที่เหลือเศษ หารทีมไม่ลงตัว */
export type RemainderMode = "bench" | "extraTeam" | "balance";

/** ลำดับการเติมคนเข้าทีม */
export type FillMode = "sequential" | "roundRobin";

export type Phase = "setup" | "draw" | "result";

export type Config = {
  sizeMode: SizeMode;
  perTeam: number;
  teamCount: number;
  remainderMode: RemainderMode;
  fillMode: FillMode;
  assignLanes: boolean;
};

/** เป้าหมายของการจับสลากครั้งที่ i */
export type Slot = {
  /** index ของทีม, null = ตัวสำรอง */
  teamIndex: number | null;
  /** ตำแหน่งที่นั่งในทีมนั้น */
  seat: number;
};

export type TeamPlan = {
  /** จำนวนที่นั่งของแต่ละทีม */
  sizes: number[];
  /** จำนวนตัวสำรอง */
  benchCount: number;
  /** ลำดับการเรียกคนเข้าช่อง ความยาว = จำนวนผู้เล่นทั้งหมด */
  slots: Slot[];
};

export type TeamIdentity = {
  name: string;
  short: string;
  /** "R G B" สำหรับใส่ใน rgb() และ color-mix */
  rgb: string;
  hex: string;
  glyph: string;
};

export type Member = {
  player: Player;
  seat: number;
  lane?: string;
};

export type BuiltTeam = {
  index: number;
  identity: TeamIdentity;
  size: number;
  members: Member[];
  isFull: boolean;
};
