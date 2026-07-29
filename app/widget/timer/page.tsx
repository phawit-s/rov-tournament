"use client";

import { useEffect, useState } from "react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { upcomingMatches } from "@/lib/tournament/bracket";
import WidgetShell, { WidgetCard } from "@/components/widget/WidgetShell";

/**
 * นับถอยหลัง — ใช้ได้ 3 แบบ
 *   ?until=2026-08-03T20:00:00+07:00  นับถึงเวลาที่กำหนด
 *   ?mins=5                            นับถอยหลังจากตอนเปิดหน้า (พักเบรก)
 *   #c=<id>                            นับถึงแมตช์ถัดไปที่ตั้งเวลาไว้
 */
export default function TimerWidget() {
  const { tournament } = useLiveTournament();
  const { accent, until, minutes, label } = useWidgetOptions();
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  let targetMs: number | null = null;
  let caption = label ?? "เริ่มใน";

  if (until) {
    const parsed = new Date(until).getTime();
    if (!Number.isNaN(parsed)) targetMs = parsed;
  } else if (minutes > 0) {
    targetMs = startedAt + minutes * 60_000;
    caption = label ?? "พักเบรก";
  } else if (tournament?.bracket) {
    const next = upcomingMatches(tournament.bracket, 1)[0];
    if (next?.scheduledAt) {
      targetMs = new Date(next.scheduledAt).getTime();
      const nameOf = (id: string | null) =>
        id ? (tournament.teams.find((t) => t.id === id)?.name ?? "TBD") : "TBD";
      caption = label ?? `${nameOf(next.a.teamId)} พบ ${nameOf(next.b.teamId)}`;
    }
  }

  if (targetMs === null) {
    return <WidgetShell>{null}</WidgetShell>;
  }

  const remain = Math.max(0, targetMs - now);
  const totalSec = Math.floor(remain / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const done = remain <= 0;
  const urgent = remain > 0 && remain < 60_000;

  return (
    <WidgetShell>
      <WidgetCard accent={accent} className="min-w-80 text-center">
        <p
          className="font-display text-[11px] tracking-[0.3em] uppercase"
          style={{ color: accent }}
        >
          {done ? "เริ่มแล้ว" : caption}
        </p>
        <p
          className="mt-2 font-display text-6xl tabular-nums"
          style={{
            color: urgent ? "#e0566b" : "#fff",
            textShadow: `0 0 26px ${urgent ? "rgba(224,86,107,0.5)" : "rgba(230,200,148,0.35)"}`,
          }}
        >
          {hh > 0 && `${pad(hh)}:`}
          {pad(mm)}:{pad(ss)}
        </p>
      </WidgetCard>
    </WidgetShell>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
