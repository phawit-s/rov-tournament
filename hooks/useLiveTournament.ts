"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useHashParam } from "./useClient";
import { cloudReady, watchTournament } from "@/lib/tournament/cloud";
import { decodeTournament } from "@/lib/tournament/share";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";

export type LiveSource = "cloud" | "snapshot" | "local" | "none";

/**
 * หาทัวร์จาก hash ตามลำดับ:
 *   #c=<id>   ดึงสดจากคลาวด์ (widget ใน OBS ใช้ตัวนี้ ผลอัปเดตเองทันที)
 *   #s=<data> ข้อมูลฝังมาในลิงก์ (ใช้ได้แม้ไม่มีหลังบ้าน แต่ไม่อัปเดตเอง)
 *   #t=<id>   ทัวร์ที่เก็บไว้ในเบราว์เซอร์เครื่องนี้
 */
export function useLiveTournament(): {
  tournament: Tournament | null;
  source: LiveSource;
  error: string | null;
} {
  const cloudId = useHashParam("c");
  const snapshotRaw = useHashParam("s");
  const localId = useHashParam("t");

  const local = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );

  const [cloud, setCloud] = useState<Tournament | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);

  const handleData = useCallback((data: Tournament | null) => setCloud(data), []);
  const handleError = useCallback((err: Error) => setWatchError(err.message), []);

  useEffect(() => {
    if (!cloudId || !cloudReady()) return;
    return watchTournament(cloudId, handleData, handleError);
  }, [cloudId, handleData, handleError]);

  // คำนวณตอน render ไม่ต้อง setState ใน effect
  const error = cloudId && !cloudReady()
    ? "ยังไม่ได้ตั้งค่า Firebase เลยดึงข้อมูลสดไม่ได้"
    : watchError;

  if (cloudId) {
    return { tournament: cloud, source: "cloud", error };
  }

  if (snapshotRaw) {
    return { tournament: decodeTournament(snapshotRaw), source: "snapshot", error };
  }

  if (localId) {
    return {
      tournament: local.find((t) => t.id === localId) ?? null,
      source: "local",
      error,
    };
  }

  return { tournament: null, source: "none", error };
}

/** อ่านค่า config ของ widget จาก query string เช่น ?accent=ddaf64&scale=1.2 */
export function useWidgetOptions() {
  const subscribe = () => () => {};
  const raw = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );

  const params = new URLSearchParams(raw);
  const num = (key: string, fallback: number) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  return {
    /** ขยาย/ย่อทั้ง widget */
    scale: num("scale", 1),
    /** สีเน้น เช่น ddaf64 */
    accent: `#${(params.get("accent") ?? "e6c894").replace("#", "")}`,
    /** โชว์พื้นหลังทึบไหม (ค่าเริ่มต้นคือโปร่งใสสำหรับ OBS) */
    solid: params.get("solid") === "1",
    /** id แมตช์ที่อยากปักหมุด */
    matchId: params.get("match"),
    /** เวลาเป้าหมายของ widget นับถอยหลัง */
    until: params.get("until"),
    /** นับถอยหลังกี่นาทีจากตอนเปิด */
    minutes: num("mins", 0),
    label: params.get("label"),
  };
}
