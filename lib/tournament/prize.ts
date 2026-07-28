import type { PrizeConfig, PrizeSlot } from "./types";

export const DEFAULT_PRIZE: PrizeConfig = {
  total: 0,
  currency: "฿",
  slots: [
    { place: 1, label: "ชนะเลิศ", percent: 50 },
    { place: 2, label: "รองชนะเลิศ", percent: 30 },
    { place: 3, label: "อันดับ 3", percent: 20 },
  ],
};

/** ชุดแบ่งรางวัลสำเร็จรูป */
export const PRIZE_PRESETS: { name: string; slots: PrizeSlot[] }[] = [
  {
    name: "3 อันดับ (50/30/20)",
    slots: [
      { place: 1, label: "ชนะเลิศ", percent: 50 },
      { place: 2, label: "รองชนะเลิศ", percent: 30 },
      { place: 3, label: "อันดับ 3", percent: 20 },
    ],
  },
  {
    name: "3 อันดับ (60/25/15)",
    slots: [
      { place: 1, label: "ชนะเลิศ", percent: 60 },
      { place: 2, label: "รองชนะเลิศ", percent: 25 },
      { place: 3, label: "อันดับ 3", percent: 15 },
    ],
  },
  {
    name: "4 อันดับ (40/25/20/15)",
    slots: [
      { place: 1, label: "ชนะเลิศ", percent: 40 },
      { place: 2, label: "รองชนะเลิศ", percent: 25 },
      { place: 3, label: "อันดับ 3", percent: 20 },
      { place: 4, label: "อันดับ 4", percent: 15 },
    ],
  },
  {
    name: "ผู้ชนะรับทั้งหมด",
    slots: [{ place: 1, label: "ชนะเลิศ", percent: 100 }],
  },
];

export type PrizeBreakdown = {
  slot: PrizeSlot;
  amount: number;
}[];

/**
 * คำนวณเงินรางวัลแต่ละอันดับ
 * ช่องที่ตั้งจำนวนตายตัวจะถูกหักออกจากยอดรวมก่อน ที่เหลือค่อยแบ่งตาม %
 */
export function calcPrizes(config: PrizeConfig): {
  breakdown: PrizeBreakdown;
  allocated: number;
  remaining: number;
  percentUsed: number;
} {
  const fixedTotal = config.slots.reduce((sum, s) => sum + (s.fixed ?? 0), 0);
  const pool = Math.max(0, config.total - fixedTotal);
  const percentUsed = config.slots.reduce(
    (sum, s) => sum + (s.fixed != null ? 0 : s.percent),
    0,
  );

  const breakdown = config.slots
    .slice()
    .sort((a, b) => a.place - b.place)
    .map((slot) => ({
      slot,
      amount:
        slot.fixed != null
          ? slot.fixed
          : Math.round((pool * slot.percent) / 100),
    }));

  const allocated = breakdown.reduce((sum, row) => sum + row.amount, 0);

  return {
    breakdown,
    allocated,
    remaining: config.total - allocated,
    percentUsed,
  };
}

export function formatMoney(amount: number, currency = "฿"): string {
  return `${currency}${amount.toLocaleString("th-TH")}`;
}
