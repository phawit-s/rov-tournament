"use client";

import { motion, useReducedMotion } from "motion/react";

/* พิกัดบน viewBox 320x200 — คำนวณครั้งเดียวนอก component จะได้ไม่สร้างใหม่ทุกเฟรม */
const R1_Y = Array.from({ length: 8 }, (_, i) => 24 + i * 22);
const R2_Y = Array.from({ length: 4 }, (_, p) => (R1_Y[p * 2] + R1_Y[p * 2 + 1]) / 2);
const R3_Y = Array.from({ length: 2 }, (_, p) => (R2_Y[p * 2] + R2_Y[p * 2 + 1]) / 2);
const FINAL_Y = (R3_Y[0] + R3_Y[1]) / 2;

const R1_NAMES = [
  "ไทเกอร์",
  "ฟีนิกซ์",
  "ราชสีห์",
  "โคจร",
  "นาคา",
  "ครุฑ",
  "อัสนี",
  "วายุ",
];
const R2_NAMES = ["ไทเกอร์", "ราชสีห์", "นาคา", "วายุ"];
const R3_NAMES = ["ราชสีห์", "วายุ"];

/** เส้นโครงสาย เรียงตามลำดับที่อยากให้ค่อยๆ วาดออกมา */
const FRAME: { d: string; r1?: boolean }[] = [
  ...R1_Y.map((y) => ({ d: `M6 ${y} H78`, r1: true })),
  ...[0, 1, 2, 3].flatMap((p) => [
    { d: `M78 ${R1_Y[p * 2]} H87 V${R1_Y[p * 2 + 1]} H78`, r1: true },
    { d: `M87 ${R2_Y[p]} H96`, r1: true },
  ]),
  ...R2_Y.map((y) => ({ d: `M96 ${y} H180` })),
  ...[0, 1].flatMap((p) => [
    { d: `M180 ${R2_Y[p * 2]} H189 V${R2_Y[p * 2 + 1]} H180` },
    { d: `M189 ${R3_Y[p]} H198` },
  ]),
  ...R3_Y.map((y) => ({ d: `M198 ${y} H282` })),
  { d: `M282 ${R3_Y[0]} H291 V${R3_Y[1]} H282` },
  { d: `M291 ${FINAL_Y} H300` },
];

/** เส้นทางของแชมป์ (ทีมที่ 3 ของรอบแรก) — ย้อมทีหลังเพื่อให้เห็นว่าใครไปถึงถ้วย */
const CHAMP_PATH = [
  `M6 ${R1_Y[2]} H78`,
  `M78 ${R1_Y[2]} H87 V${R2_Y[1]}`,
  `M87 ${R2_Y[1]} H96`,
  `M96 ${R2_Y[1]} H180`,
  `M180 ${R2_Y[1]} H189 V${R3_Y[0]}`,
  `M189 ${R3_Y[0]} H198`,
  `M198 ${R3_Y[0]} H282`,
  `M282 ${R3_Y[0]} H291 V${FINAL_Y}`,
  `M291 ${FINAL_Y} H300`,
].join(" ");

const HAIR = "rgb(var(--hair) / var(--hair-a))";

/**
 * สายแข่ง 8 ทีม 3 รอบแบบย่อ วาดด้วย SVG ล้วน (static export ใช้รูปไม่สะดวก)
 * เส้นค่อยๆ ลากออกตอนเลื่อนมาถึง แล้วค่อยย้อมเส้นทางแชมป์ทีหลัง
 */
export default function BracketMini({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();

  return (
    <svg
      viewBox="0 0 320 200"
      className={`w-full ${className}`}
      role="img"
      aria-label="ตัวอย่างสายแข่งแบบแพ้คัดออก 8 ทีม"
    >
      {/* จอแคบเส้นรอบแรกจะแน่นจนอ่านไม่ออก ซ่อนทั้งคอลัมน์ทิ้ง */}
      <style>{`@media (max-width:640px){.bm-r1{opacity:0}}`}</style>

      {/* หัวคอลัมน์ — ไม่ใช้ .slug เพราะ letter-spacing .32em ทำให้ตัวไทยกางจนล้นคอลัมน์ */}
      <g
        className="fill-iris/45 font-display"
        style={{ fontSize: 6.5, letterSpacing: "0.14em" }}
      >
        <text x="6" y="10" className="bm-r1">
          รอบ 8 ทีม
        </text>
        <text x="96" y="10">
          รอบรอง
        </text>
        <text x="198" y="10">
          ชิงชนะเลิศ
        </text>
      </g>

      {/* โครงสาย */}
      <g fill="none" stroke={HAIR} strokeWidth={1.2} strokeLinecap="round">
        {FRAME.map((seg, i) =>
          reduced ? (
            <path key={i} d={seg.d} className={seg.r1 ? "bm-r1" : undefined} />
          ) : (
            <motion.path
              key={i}
              d={seg.d}
              className={seg.r1 ? "bm-r1" : undefined}
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                duration: 0.6,
                delay: i * 0.07,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ),
        )}
      </g>

      {/* ชื่อทีม */}
      <g
        className="fill-ice/70 font-display"
        style={{ fontSize: 9, letterSpacing: "0.04em" }}
      >
        {R1_NAMES.map((n, i) => (
          <text key={n} x="6" y={R1_Y[i] - 3} className="bm-r1">
            {n}
          </text>
        ))}
        {R2_NAMES.map((n, i) => (
          <text key={`r2-${i}`} x="96" y={R2_Y[i] - 3}>
            {n}
          </text>
        ))}
        {R3_NAMES.map((n, i) => (
          <text key={`r3-${i}`} x="198" y={R3_Y[i] - 3} className="fill-iris/85">
            {n}
          </text>
        ))}
      </g>

      {/* เส้นทางแชมป์ */}
      {reduced ? (
        <path
          d={CHAMP_PATH}
          fill="none"
          stroke="var(--color-iris)"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ) : (
        <motion.path
          d={CHAMP_PATH}
          fill="none"
          stroke="var(--color-iris)"
          strokeWidth={1.4}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{
            pathLength: { duration: 1.2, delay: 1.1, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 0.2, delay: 1.1 },
          }}
        />
      )}

      {/* ถ้วย — ข้าวหลามตัดที่ปลายสาย */}
      <g transform={`translate(305 ${FINAL_Y})`}>
        <rect
          x={-4}
          y={-4}
          width={8}
          height={8}
          transform="rotate(45)"
          fill="var(--color-iris)"
          opacity={0.9}
        />
        <text
          x="0"
          y="-11"
          textAnchor="middle"
          className="fill-iris/70 font-display"
          style={{ fontSize: 6, letterSpacing: "0.14em" }}
        >
          แชมป์
        </text>
      </g>
    </svg>
  );
}
