"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { grandFinale } from "@/lib/confetti";
import { exportTeamsPng } from "@/lib/exportImage";
import { shareUrl } from "@/lib/share";
import { sfx } from "@/lib/sound";
import { teamsToText } from "@/lib/teams";
import type { Tournament } from "@/hooks/useTournament";
import MagneticButton from "./ui/MagneticButton";
import Panel from "./ui/Panel";
import TeamBoard from "./TeamBoard";

export default function ResultScreen({ t }: { t: Tournament }) {
  const { state, dispatch, derived, sharedView, exitSharedView } = t;
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    grandFinale();
    sfx.play("finish");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
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
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      <Panel
        accent="251 191 36"
        tag="FINAL RESULT"
        className="p-5 text-center sm:p-7"
      >
        <motion.p
          initial={{ letterSpacing: "1.2em", opacity: 0 }}
          animate={{ letterSpacing: "0.3em", opacity: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="font-display text-[11px] text-gold"
        >
          TOURNAMENT READY
        </motion.p>
        <motion.h2
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12, type: "spring", stiffness: 220, damping: 20 }}
          className="mt-2 font-display text-3xl font-bold text-white sm:text-5xl"
        >
          แบ่งทีมเรียบร้อย 🏆
        </motion.h2>
        <p className="mt-2 text-sm text-muted">
          ผู้เล่น {derived.total} คน • {derived.teamCount} ทีม
          {derived.benchCount > 0 && ` • สำรอง ${derived.benchCount} คน`} • seed{" "}
          <span className="font-display tracking-widest text-gold">{state.seed}</span>
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <MagneticButton
            variant="gold"
            strength={0.3}
            onClick={() =>
              copy(
                teamsToText(derived.teams, derived.bench, state.seed),
                "คัดลอกผลลัพธ์แล้ว ✓",
              )
            }
          >
            📋 คัดลอกผลลัพธ์
          </MagneticButton>
          <MagneticButton
            variant="ghost"
            strength={0.25}
            onClick={() =>
              copy(
                shareUrl({
                  v: 1,
                  n: state.players.map((p) => p.name),
                  s: state.seed,
                  c: state.config,
                }),
                "คัดลอกลิงก์แชร์แล้ว ✓",
              )
            }
          >
            🔗 ลิงก์แชร์ผล
          </MagneticButton>
          <MagneticButton
            variant="ghost"
            strength={0.25}
            onClick={() => {
              setToast("กำลังสร้างรูป...");
              void exportTeamsPng(
                derived.teams,
                derived.bench,
                state.seed,
                teamName,
              ).then(() => setToast("บันทึกรูปแล้ว ✓"));
            }}
          >
            🖼 บันทึกเป็นรูป
          </MagneticButton>
        </div>
      </Panel>

      <TeamBoard
        teams={derived.teams}
        bench={derived.bench}
        benchCount={derived.benchCount}
        activeTeamIndex={null}
        teamName={teamName}
        onRenameTeam={(index, name) => dispatch({ type: "renameTeam", index, name })}
        tilt
      />

      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <MagneticButton
          onClick={() => {
            if (sharedView) exitSharedView();
            dispatch({ type: "redraw" });
          }}
        >
          🔄 สุ่มใหม่ด้วยรายชื่อเดิม
        </MagneticButton>
        <MagneticButton
          variant="ghost"
          onClick={() => {
            if (sharedView) exitSharedView();
            dispatch({ type: "backToSetup" });
          }}
        >
          ✏️ แก้ไขรายชื่อ
        </MagneticButton>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed inset-x-0 bottom-[calc(1.5rem+var(--sab))] z-50 mx-auto w-fit rounded-2xl border border-cyan/40 bg-abyss/95 px-5 py-3 font-display text-sm text-white shadow-[0_20px_60px_-20px_rgba(34,211,238,0.9)] backdrop-blur"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
