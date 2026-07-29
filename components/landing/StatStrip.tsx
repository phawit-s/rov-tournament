"use client";

import { useSyncExternalStore } from "react";
import { activityStore } from "@/lib/activity";
import { tournamentStore } from "@/lib/tournament/store";
import Figure, { FigureRow } from "../ui/Figure";

/** จำนวน widget ที่มีให้ใช้จริงในโฟลเดอร์ app/widget */
const WIDGET_COUNT = 5;

/**
 * แถบตัวเลขคั่นฮีโร่กับฟีเจอร์ — อ่านค่าจริงจากเครื่องผู้ใช้ ไม่ใช่ตัวเลขโฆษณา
 * ค่าที่ยังเป็นศูนย์ Figure จะขึ้นขีดให้เอง จะได้ไม่เป็น 0 เรียงกันสี่ช่อง
 */
export default function StatStrip({ className = "" }: { className?: string }) {
  const tournaments = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const activity = useSyncExternalStore(
    activityStore.subscribe,
    activityStore.getSnapshot,
    activityStore.getServerSnapshot,
  );

  const draws = activity.filter((a) => a.type === "draw.finish").length;
  const spins = activity.filter((a) => a.type === "wheel.spin").length;

  return (
    <section className={`border-y border-hair py-9 ${className}`}>
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <p className="slug">ตัวเลขในเครื่องนี้</p>
        <p className="slug slug-2">อัปเดตทันทีที่ใช้งาน</p>
      </div>

      <FigureRow>
        <Figure
          value={tournaments.length}
          label="ทัวร์ในเครื่อง"
          ratio={Math.min(1, tournaments.length / 6)}
          className="sm:px-6 sm:first:pl-0"
        />
        <Figure
          value={draws}
          label="ครั้งที่สุ่มทีม"
          ratio={Math.min(1, draws / 20)}
          className="sm:px-6 sm:first:pl-0"
        />
        <Figure
          value={spins}
          label="รอบวงล้อ"
          ratio={Math.min(1, spins / 30)}
          className="sm:px-6 sm:first:pl-0"
        />
        <Figure
          value={WIDGET_COUNT}
          label="Widget พร้อมใช้"
          ratio={1}
          tone="platinum"
          className="sm:px-6 sm:first:pl-0"
        />
      </FigureRow>
    </section>
  );
}
