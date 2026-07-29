"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BEST_OF_OPTIONS, roundLabel } from "@/lib/tournament/bracket";
import type { BestOf, Bracket, Match } from "@/lib/tournament/types";
import MatchPlate, {
  PLATE_GAP,
  PLATE_H,
  PLATE_W,
  PLATE_W_FINAL,
  type PlateHooks,
} from "./MatchPlate";

/** ระยะห่างระหว่างคอลัมน์รอบ — ต้องกว้างพอให้เส้นหักมุมได้สวย */
const COL_GAP = 68;
const HEAD_H = 38;
const ROW = PLATE_H + PLATE_GAP;
/** ไล่สีเส้นตอน hover ต้องนุ่ม ส่วนการลากเส้นค่อยต่อท้ายเฉพาะตอนเพิ่งรู้ผล */
const COLOR_TR = "stroke .25s, opacity .25s";

type Props = PlateHooks & {
  bracket: Bracket;
  rounds: Match[][];
  championName: string | null;
  onChangeBo: (round: number, bo: BestOf) => void;
};

type Link = {
  key: string;
  from: string;
  to: string;
  /** ผู้ชนะไหลผ่านเส้นนี้แล้ว */
  flowed: boolean;
  /** id ทีมที่ไหลผ่านเส้นนี้ ใช้ไล่ไฟตอน hover โดยไม่ต้องวัด DOM ใหม่ */
  teamId: string | null;
  round: number;
};

/**
 * ผังสายแบบคำนวณตำแหน่งเอง — แมตช์รอบหลังอยู่กึ่งกลางของสองแมตช์ต้นทางพอดี
 * (flex justify-around ทำไม่ได้ เพราะมันเฉลี่ยตามจำนวนใบไม่ใช่ตามคู่ที่ผูกกันจริง)
 */
export default function BracketCanvas({
  bracket,
  rounds,
  championName,
  onChangeBo,
  ...hooks
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const plateRefs = useRef(new Map<string, HTMLDivElement | null>());
  const pathRefs = useRef(new Map<string, SVGPathElement | null>());
  const drawnRef = useRef(new Set<string>());
  const reduced = useReducedMotion();

  const firstRow = rounds[0]?.length ?? 1;
  const stageH = (firstRow - 1) * ROW + PLATE_H;
  const totalW =
    rounds.reduce(
      (sum, _m, i) => sum + (i === rounds.length - 1 ? PLATE_W_FINAL : PLATE_W),
      0,
    ) +
    COL_GAP * Math.max(0, rounds.length - 1);

  const byId = useMemo(
    () => new Map(bracket.matches.map((m) => [m.id, m])),
    [bracket.matches],
  );

  /**
   * รายการเส้นต้องไม่ผูกกับ hoverTeamId — ไม่งั้นขยับเมาส์ทีเดียวจะไปวัด DOM
   * ใหม่ทั้งผัง สีตอน hover คำนวณตอนเรนเดอร์เอาก็พอ
   */
  const links = useMemo<Link[]>(() => {
    const out: Link[] = [];
    for (const match of bracket.matches) {
      for (const side of ["a", "b"] as const) {
        const from = match[side].fromMatch;
        if (!from) continue;
        const src = byId.get(from);
        out.push({
          key: `${match.id}:${side}`,
          from,
          to: match.id,
          flowed: !!src?.winnerId,
          teamId: src?.winnerId ?? null,
          round: match.round,
        });
      }
    }
    return out;
  }, [bracket.matches, byId]);

  /**
   * วาดเส้นด้วยการวัด DOM จริงแล้ว setAttribute('d') ผ่าน ref
   * ห้าม setState ที่นี่ (ESLint react-hooks/set-state-in-effect) และการวัดหลัง
   * layout จริงแม่นกว่าคำนวณจากตัวเลขล้วน เพราะการ์ดสูงตามฟอนต์ของเครื่องผู้ใช้
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const compute = () => {
      const rr = root.getBoundingClientRect();
      for (const link of links) {
        const path = pathRefs.current.get(link.key);
        const a = plateRefs.current.get(link.from);
        const b = plateRefs.current.get(link.to);
        if (!path || !a || !b) continue;

        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const x1 = ra.right - rr.left;
        const y1 = ra.top + ra.height / 2 - rr.top;
        const x2 = rb.left - rr.left;
        const y2 = rb.top + rb.height / 2 - rr.top;
        const mid = (x1 + x2) / 2;
        const dy = y2 - y1;

        let d: string;
        if (Math.abs(dy) < 2) {
          d = `M ${x1} ${y1} H ${x2}`;
        } else {
          const s = dy > 0 ? 1 : -1;
          const rad = Math.max(
            0,
            Math.min(8, Math.abs(dy) / 2, mid - x1, x2 - mid),
          );
          d =
            `M ${x1} ${y1} H ${mid - rad} Q ${mid} ${y1} ${mid} ${y1 + s * rad}` +
            ` V ${y2 - s * rad} Q ${mid} ${y2} ${mid + rad} ${y2} H ${x2}`;
        }
        path.setAttribute("d", d);

        // เส้นที่ผู้ชนะเพิ่งไหลผ่านให้ลากออกมาให้เห็นครั้งเดียว ไม่วิ่งซ้ำตอน resize
        if (!link.flowed) {
          if (drawnRef.current.delete(link.key)) {
            path.style.transition = COLOR_TR;
            path.style.strokeDasharray = "";
            path.style.strokeDashoffset = "";
          }
        } else if (drawnRef.current.has(link.key)) {
          // ลากไปแล้ว — แต่ resize ทำให้ความยาวเส้นเปลี่ยน ต้องยืด dash ตามไม่งั้นหางหาย
          if (path.style.strokeDasharray) {
            path.style.strokeDasharray = `${path.getTotalLength()}`;
            path.style.strokeDashoffset = "0";
          }
        } else if (reduced) {
          drawnRef.current.add(link.key);
          path.style.transition = COLOR_TR;
          path.style.strokeDasharray = "";
          path.style.strokeDashoffset = "";
        } else {
          const len = path.getTotalLength();
          path.style.transition = "none";
          path.style.strokeDasharray = `${len}`;
          path.style.strokeDashoffset = `${len}`;
          void path.getBoundingClientRect();
          path.style.transition = `${COLOR_TR}, stroke-dashoffset .85s cubic-bezier(.16,1,.3,1) ${
            0.1 + link.round * 0.08
          }s`;
          path.style.strokeDashoffset = "0";
          drawnRef.current.add(link.key);
        }
      }
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    return () => ro.disconnect();
  }, [links, reduced]);

  return (
    <div className="overflow-x-auto pb-24">
      <div
        ref={rootRef}
        className="relative"
        style={{ width: totalW, minWidth: totalW }}
      >
        <div className="flex" style={{ gap: COL_GAP }}>
          {rounds.map((matches, i) => {
            const round = i + 1;
            const last = round === rounds.length;
            return (
              <motion.div
                key={round}
                id={`bracket-round-${round}`}
                // เผยทีละคอลัมน์ — ใช้ opacity อย่างเดียว เพราะ transform จะทำให้
                // ตำแหน่งที่วัดไปวาดเส้นเพี้ยนไปทั้งผัง
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                style={{ width: last ? PLATE_W_FINAL : PLATE_W }}
                className="shrink-0 scroll-mt-24"
              >
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ height: HEAD_H }}
                >
                  <h3 className="font-display text-sm text-ice">
                    {roundLabel(round, bracket.rounds)}
                  </h3>
                  {hooks.isAdmin ? (
                    <select
                      value={matches[0]?.bestOf ?? 3}
                      aria-label={`จำนวนเกมของ${roundLabel(round, bracket.rounds)}`}
                      onChange={(e) =>
                        onChangeBo(round, Number(e.target.value) as BestOf)
                      }
                      className="field num cursor-pointer rounded-lg px-2 py-1 font-display text-xs text-champagne outline-none"
                    >
                      {BEST_OF_OPTIONS.map((bo) => (
                        <option key={bo} value={bo}>
                          BO{bo}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="num font-display text-xs text-champagne">
                      BO{matches[0]?.bestOf ?? 3}
                    </span>
                  )}
                </div>

                <div className="relative" style={{ height: stageH }}>
                  {matches.map((match, idx) => (
                    <div
                      key={match.id}
                      ref={(el) => {
                        plateRefs.current.set(match.id, el);
                      }}
                      className="absolute inset-x-0"
                      style={{
                        top: Math.pow(2, round - 1) * (idx + 0.5) * ROW - ROW / 2,
                      }}
                    >
                      <MatchPlate
                        match={match}
                        variant={last ? "final" : "default"}
                        championName={last ? championName : null}
                        {...hooks}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* เส้นเชื่อมวาดทับทั้งผัง — ไม่รับคลิกเพื่อไม่ให้บังปุ่มคะแนน */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {links.map((link) => {
            const lit = !!hooks.hoverTeamId && link.teamId === hooks.hoverTeamId;
            return (
              <path
                key={link.key}
                ref={(el) => {
                  pathRefs.current.set(link.key, el);
                }}
                fill="none"
                stroke={
                  lit
                    ? "var(--color-champagne)"
                    : link.flowed
                      ? "rgb(var(--st-win))"
                      : "rgb(var(--hair) / var(--hair-a))"
                }
                strokeWidth={lit ? 2 : link.flowed ? 1.6 : 1}
                strokeDasharray={link.flowed ? undefined : "3 3"}
                opacity={link.flowed ? (lit ? 1 : 0.75) : 1}
                style={{ transition: "stroke .25s, opacity .25s" }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
