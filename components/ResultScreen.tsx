"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { exportTeamsPng } from "@/lib/exportImage";
import { clearShareHash, shareUrl } from "@/lib/share";
import { sfx } from "@/lib/sound";
import { teamsToText } from "@/lib/teams";
import type { Tournament } from "@/hooks/useTournament";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import Corners from "./ui/Corners";
import { FigureRow } from "./ui/Figure";
import { toast } from "./ui/Toast";
import TeamBoard from "./TeamBoard";
import GoldDust from "./fx/GoldDust";

export default function ResultScreen({ t }: { t: Tournament }) {
  const { state, dispatch, derived, sharedView } = t;
  const [saving, setSaving] = useState(false);

  // ตราเวลาต้องตรงกับที่ exportImage เขียนลงรูป และต้องไม่เปลี่ยนทุกรีเรนเดอร์
  const [stamp] = useState(() =>
    new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }),
  );

  useEffect(() => {
    sfx.play("finish");
  }, []);

  const teamName = (index: number) => state.teamNames[index] ?? "";

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message, "success");
    } catch {
      toast("คัดลอกไม่สำเร็จ ลองเลือกข้อความเอง", "error");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <GoldDust />

      <Panel variant="feature" tag="Result" className="p-7 text-center sm:p-9">
        <Corners len={20} o={0.4} />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="slug"
        >
          Tournament Ready
        </motion.p>

        <motion.h2
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 font-display text-h2 font-light"
        >
          <span className="text-accent-grad">แบ่งทีมเรียบร้อย</span>
        </motion.h2>

        <p className="num mt-3 text-xs text-muted">{stamp}</p>

        <div className="mx-auto mt-6 h-px w-24 bg-[linear-gradient(90deg,transparent,rgba(230,200,148,0.45),transparent)]" />

        {/* สถิติของชุดนี้ — เลขจริงขนาดพาดหัวแทนประโยคยัดเดียว */}
        <FigureRow className="mt-7 text-left">
          <GoldFigure value={derived.total} label="ผู้เล่น" />
          <GoldFigure value={derived.teamCount} label="ทีม" className="sm:pl-6" />
          <GoldFigure value={derived.benchCount} label="สำรอง" className="sm:pl-6" />
          <div className="sm:pl-6">
            {/* seed เป็นตัวอักษรผสม จึงใช้ .num อย่างเดียว ไม่ใช้ .fig ที่บีบระยะไว้สำหรับตัวเลขล้วน */}
            <span className="num text-accent-grad block truncate font-display text-[clamp(1.5rem,3.4vw,2.2rem)] leading-tight font-light tracking-[0.08em]">
              {state.seed || "—"}
            </span>
            <p className="slug slug-2 mt-2">Seed</p>
          </div>
        </FigureRow>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Button
            onClick={() =>
              copy(
                teamsToText(derived.teams, derived.bench, state.seed),
                "คัดลอกผลลัพธ์แล้ว",
              )
            }
          >
            คัดลอกผลลัพธ์
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              copy(
                shareUrl({
                  v: 1,
                  n: state.players.map((p) => p.name),
                  s: state.seed,
                  c: state.config,
                }),
                "คัดลอกลิงก์แชร์แล้ว",
              )
            }
          >
            ลิงก์แชร์ผล
          </Button>
          <Button
            variant="ghost"
            loading={saving}
            onClick={() => {
              setSaving(true);
              void exportTeamsPng(
                derived.teams,
                derived.bench,
                state.seed,
                teamName,
              )
                .then(() => toast("บันทึกรูปแล้ว", "success"))
                .catch(() => toast("สร้างรูปไม่สำเร็จ", "error"))
                .finally(() => setSaving(false));
            }}
          >
            บันทึกเป็นรูป
          </Button>
        </div>
      </Panel>

      <TeamBoard
        teams={derived.teams}
        bench={derived.bench}
        benchCount={derived.benchCount}
        activeTeamIndex={null}
        teamName={teamName}
        stagger={0.08}
        // เปิดจากลิงก์แชร์ = ดูอย่างเดียว แก้ชื่อทีมไม่ได้
        onRenameTeam={
          sharedView
            ? undefined
            : (index, name) => dispatch({ type: "renameTeam", index, name })
        }
      />

      {sharedView ? (
        <div className="flex flex-col items-center gap-4 pt-2">
          <p className="max-w-xl text-center text-sm text-muted">
            ผลชุดนี้ถูกล็อกไว้กับ seed{" "}
            <span className="num font-display tracking-[0.16em] text-iris">
              {state.seed}
            </span>{" "}
            แก้ไขจากลิงก์นี้ไม่ได้ ใครเปิดก็เห็นเหมือนกันทุกคน
          </p>
          <Button
            onClick={() => {
              clearShareHash();
              dispatch({ type: "resetAll" });
            }}
          >
            สุ่มชุดของตัวเอง
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2.5 pt-2">
          <Button onClick={() => dispatch({ type: "redraw" })}>
            สุ่มใหม่ด้วยรายชื่อเดิม
          </Button>
          <Button variant="ghost" onClick={() => dispatch({ type: "backToSetup" })}>
            แก้ไขรายชื่อ
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/**
 * ตัวเลขพาดหัวทาไล่สีทอง นับขึ้นตอนโผล่เข้าจอ
 * เขียนค่าลง textContent ผ่าน ref เพื่อไม่ให้รีเรนเดอร์ทุกเฟรม
 */
function GoldFigure({
  value,
  label,
  className = "",
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const el = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(
    () =>
      mv.on("change", (v) => {
        if (el.current) el.current.textContent = Math.round(v).toLocaleString("th-TH");
      }),
    [mv],
  );

  const onEnter = () => {
    if (reduced) {
      mv.set(value);
      return;
    }
    animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
  };

  return (
    <motion.div
      viewport={{ once: true, amount: 0.6 }}
      onViewportEnter={onEnter}
      className={className}
    >
      {value === 0 ? (
        <span className="fig block text-[clamp(2rem,4.5vw,3.4rem)] text-muted/50">—</span>
      ) : (
        <span
          ref={el}
          className="fig num text-accent-grad block text-[clamp(2rem,4.5vw,3.4rem)]"
        >
          0
        </span>
      )}
      <p className="slug mt-2">{label}</p>
    </motion.div>
  );
}
