import { baht } from "./easydonate";
import type { SongRequest } from "./types";

/** เหรียญ TikTok แบบสั้น 1,000 เหรียญ */
export const coins = (n: number): string =>
  `${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })} เหรียญ`;

/** ยอดลัดคิวของใบนี้ตามหน่วย — ฿100 (โดเนท) หรือ 🎁 30 เหรียญ (ของขวัญ TikTok) */
export function paidText(s: Pick<SongRequest, "paid" | "paidUnit">): string {
  const n = s.paid ?? 0;
  return s.paidUnit === "coin" ? `🎁 ${coins(n)}` : baht(n);
}
