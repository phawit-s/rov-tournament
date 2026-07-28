"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { exportTeamsPng } from "@/lib/exportImage";
import { clearShareHash, shareUrl } from "@/lib/share";
import { sfx } from "@/lib/sound";
import { teamsToText } from "@/lib/teams";
import type { Tournament } from "@/hooks/useTournament";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import TeamBoard from "./TeamBoard";
import GoldDust from "./fx/GoldDust";

export default function ResultScreen({ t }: { t: Tournament }) {
  const { state, dispatch, derived, sharedView } = t;
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    sfx.play("finish");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const teamName = (index: number) => state.teamNames[index] ?? "";

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(message);
    } catch {
      setToast("คัดลอกไม่สำเร็จ ลองเลือกข้อความเอง");
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

      <Panel tag="Result" className="p-7 text-center sm:p-9">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase"
        >
          Tournament Ready
        </motion.p>

        <motion.h2
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 font-display text-3xl font-light sm:text-5xl"
        >
          <span className="text-gold-grad">แบ่งทีมเรียบร้อย</span>
        </motion.h2>

        <p className="mt-3.5 text-sm text-muted">
          ผู้เล่น {derived.total} คน · {derived.teamCount} ทีม
          {derived.benchCount > 0 && ` · สำรอง ${derived.benchCount} คน`} · seed{" "}
          <span className="font-display tracking-[0.16em] text-champagne">
            {state.seed}
          </span>
        </p>

        <div className="mx-auto mt-6 h-px w-24 bg-[linear-gradient(90deg,transparent,rgba(230,200,148,0.45),transparent)]" />

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
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
            onClick={() => {
              setToast("กำลังสร้างรูป…");
              void exportTeamsPng(
                derived.teams,
                derived.bench,
                state.seed,
                teamName,
              ).then(() => setToast("บันทึกรูปแล้ว"));
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
            <span className="font-display tracking-[0.16em] text-champagne">
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

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-0 bottom-[calc(1.75rem+var(--sab))] z-50 mx-auto w-fit rounded-xl border border-champagne/25 bg-ink-2/95 px-6 py-3 text-sm text-ice shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
