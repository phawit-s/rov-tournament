"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { championId } from "@/lib/tournament/bracket";
import { calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { mixWhite, shade } from "@/lib/crest";
import { identityFor } from "@/lib/game";
import Crest from "@/components/team/Crest";
import GoldDust from "@/components/fx/GoldDust";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** ป้ายแชมป์ ขึ้นตอนปิดรายการ — ทำเป็นหน้าไตเติล ไม่ใช่การ์ดข้อมูล */
export default function ChampionWidget() {
  const { tournament } = useLiveTournament();
  const { accent } = useWidgetOptions();
  const reduced = useReducedMotion();

  const bracket = tournament?.bracket ?? null;
  const champ = championId(bracket);
  const index = champ ? (tournament?.teams.findIndex((t) => t.id === champ) ?? -1) : -1;
  const team = index >= 0 ? tournament?.teams[index] : null;

  if (!tournament || !team) {
    return (
      <WidgetShell align="center">
        <WidgetHint title="ยังไม่มีแชมป์">
          รอผลรอบชิงชนะเลิศ แล้วป้ายนี้จะขึ้นเอง
        </WidgetHint>
      </WidgetShell>
    );
  }

  const identity = identityFor(index);
  const prize = calcPrizes(tournament.prize).breakdown[0];
  const final = bracket?.matches.find((m) => m.round === bracket.rounds) ?? null;
  const hasFinalScore = !!final && !final.bye && final.a.teamId && final.b.teamId;

  // ไล่เฉดจากสีเน้นที่ผู้ใช้ตั้งเอง จะได้ไม่ล็อกเป็นทองอย่างเดียวเวลาสตรีมใช้ธีมสีอื่น
  const grad = `linear-gradient(100deg, ${shade(accent, -0.4)} 0%, ${accent} 22%, ${mixWhite(accent, 0.6)} 42%, ${accent} 62%, ${shade(accent, -0.4)} 100%)`;

  return (
    <WidgetShell align="center">
      <GoldDust count={26} />

      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
        className="relative z-50"
      >
        <WidgetCard accent={accent} frame="crest" className="w-190 px-10 pt-9 text-center">
          {/* หัวเรื่องบนเส้นทองหนา — จังหวะเดียวกับแผ่นชื่อรางวัลจริง */}
          <div className="flex items-center justify-center gap-4">
            <span
              className="h-0.5 flex-1"
              style={{ background: `linear-gradient(90deg, transparent, ${accent})` }}
            />
            <Crest identity={identity} size={34} className="shrink-0" />
            <span className="slug whitespace-nowrap">Champion</span>
            <span
              className="h-0.5 flex-1"
              style={{ background: `linear-gradient(270deg, transparent, ${accent})` }}
            />
          </div>

          {/* ชื่อทีมกับของประดับหลังชื่อ */}
          <div className="relative mt-4 flex min-h-55 items-center justify-center">
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.14]"
              aria-hidden
            >
              <Laurel color={accent} spin={!reduced} />
            </span>

            <motion.p
              initial={reduced ? false : { letterSpacing: "0.4em", opacity: 0 }}
              animate={{ letterSpacing: "0.01em", opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="fig text-accent-grad relative px-4 text-[clamp(2.5rem,7vw,5rem)]"
              style={{ backgroundImage: grad, backgroundSize: "220% 100%" }}
            >
              {team.name}
            </motion.p>
          </div>

          {/* สมาชิกเป็นชิปทีละคน อ่านง่ายกว่าประโยคยาวคั่นด้วยจุด */}
          {team.members.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {team.members.map((name, i) => (
                <motion.span
                  key={`${name}-${i}`}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.4 }}
                  className="rounded-full px-3 py-1 font-display text-sm text-white/85"
                  style={{
                    background: `${accent}14`,
                    boxShadow: `inset 0 0 0 1px ${accent}4d`,
                  }}
                >
                  {name}
                </motion.span>
              ))}
            </div>
          )}

          {/* เงินรางวัลกับสกอร์นัดชิง — ตัวเลขคือพระเอกรองจากชื่อทีม */}
          <div className="mt-7 flex items-end justify-center gap-8">
            {tournament.prize.total > 0 && prize && (
              <div>
                <p className="slug slug-2">{prize.slot.label}</p>
                <p className="fig num mt-2 text-4xl" style={{ color: accent }}>
                  {formatMoney(prize.amount, tournament.prize.currency)}
                </p>
              </div>
            )}

            {hasFinalScore && final && (
              <>
                <span className="rule-v h-10 self-center" />
                <div>
                  <p className="slug slug-2">สกอร์นัดชิง</p>
                  <p className="fig num mt-2 text-4xl text-white/90">
                    {final.a.score} : {final.b.score}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* ชื่อรายการเป็นแถบท้ายเต็มความกว้าง มีเส้นทองคั่น */}
          <div
            className="mt-8 -mx-10 px-10 py-3"
            style={{
              borderTop: `1px solid ${accent}44`,
              background: "linear-gradient(180deg, rgb(255 255 255 / 0.03), transparent)",
            }}
          >
            <p className="slug text-white/45">{tournament.name}</p>
          </div>
        </WidgetCard>
      </motion.div>
    </WidgetShell>
  );
}

/** ช่อลอเรลกับวงแหวนขีดองศา วาดเองด้วยเส้นบาง จะได้ไม่ต้องพึ่งรูปภาพ (static export) */
function Laurel({ color, spin }: { color: string; spin: boolean }) {
  const leaves = Array.from({ length: 7 }, (_, i) => i);
  const leaf = (i: number, side: 1 | -1) => {
    const t = i / 6;
    const deg = 200 - 74 * t;
    const a = ((side === 1 ? deg : 180 - deg) * Math.PI) / 180;
    const x = 110 + Math.cos(a) * 82;
    const y = 110 - Math.sin(a) * 82;
    return (
      <ellipse
        key={`${side}-${i}`}
        cx={x}
        cy={y}
        rx="13"
        ry="5"
        transform={`rotate(${side === 1 ? 90 - deg : deg - 90} ${x} ${y})`}
      />
    );
  };

  return (
    <span className="relative grid h-55 w-55 place-items-center" aria-hidden>
      <svg
        viewBox="0 0 220 220"
        width={220}
        height={220}
        className={`absolute ${spin ? "animate-spin-slow" : ""}`}
      >
        <g fill="none" stroke={color} strokeWidth="1">
          <circle cx="110" cy="110" r="104" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 24;
            const r0 = i % 3 === 0 ? 92 : 98;
            return (
              <line
                key={i}
                x1={110 + Math.cos(a) * r0}
                y1={110 + Math.sin(a) * r0}
                x2={110 + Math.cos(a) * 104}
                y2={110 + Math.sin(a) * 104}
              />
            );
          })}
        </g>
      </svg>

      <svg viewBox="0 0 220 220" width={220} height={220} className="absolute">
        <g fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round">
          <path d="M76 182 C 40 148, 34 90, 68 46" />
          <path d="M144 182 C 180 148, 186 90, 152 46" />
          {leaves.map((i) => leaf(i, 1))}
          {leaves.map((i) => leaf(i, -1))}
        </g>
      </svg>
    </span>
  );
}
