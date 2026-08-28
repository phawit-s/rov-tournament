"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useLive } from "@/lib/backend/live";
import {
  cloudReady,
  watchAllTournaments,
  watchMyTournaments,
  type CloudTournament,
} from "@/lib/tournament/cloud";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";

const NO_CLOUD: CloudTournament[] = [];

/**
 * ทัวร์หนึ่งรายการในมุมมองของคนที่กำลังดูอยู่
 *
 * ทัวร์มีได้สองที่พร้อมกัน: สำเนาที่ใช้ทำงานอยู่ใน localStorage ของเครื่องคนจัด
 * กับสำเนาที่เผยแพร่ขึ้นคลาวด์ให้คนอื่นดู ของเดิมแยกสองที่นี้เป็นรายการคนละกอง
 * บนหน้าจอ — กองบนแก้ได้ กองล่างแค่ "เปิดดู" — ซึ่งเป็นสาเหตุตรงๆ ที่ผู้ดูแล
 * เปิดหลังบ้านจากอีกเครื่องแล้วรู้สึกว่า "เห็นไม่ครบ": ทัวร์ของตัวเองที่จัดไว้
 * จากเครื่องที่บ้านไปกองอยู่ท้ายหน้าในกลุ่มที่ดูเหมือนของคนอื่น
 *
 * ตอนนี้รวมเป็นรายการเดียว แล้วบอกด้วยป้ายว่าใบนั้นอยู่ที่ไหนบ้าง
 */
export type ScopedTournament = {
  id: string;
  /** ข้อมูลที่เอาไปแสดง — สำเนาในเครื่องมาก่อนเพราะเป็นตัวที่กำลังแก้อยู่ */
  data: Tournament;
  /** มีสำเนาในเครื่องนี้ (แก้ได้ทันที) */
  onDevice: boolean;
  /** เผยแพร่ขึ้นคลาวด์แล้ว */
  onCloud: boolean;
  /** เราเป็นเจ้าของทัวร์นี้ */
  mine: boolean;
  /** ชื่อเจ้าของ — โชว์ให้ผู้ดูแลรู้ว่าใบนี้ของใคร */
  ownerName: string | null;
  /** คลาวด์ถูกแก้หลังสำเนาในเครื่อง = เครื่องนี้กำลังดูของเก่า */
  cloudNewer: boolean;
};

/**
 * ทัวร์ทั้งหมดที่คนนี้ควรเห็น — รวมของในเครื่องกับของบนคลาวด์เป็นรายการเดียว
 *
 * ผู้ดูแลดึงทั้งคอลเลกชัน คนอื่นดึงเฉพาะที่ ownerUid เป็นตัวเอง
 * (กติกา Firestore ก็ให้เท่านั้นอยู่แล้ว ขอมากกว่านั้นจะโดนปฏิเสธทั้งคำขอ)
 */
export function useTournamentScope(
  admin: boolean,
  uid: string | null,
): { list: ScopedTournament[]; cloudLoaded: boolean } {
  const local = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );

  const key = !cloudReady() || !uid ? null : admin ? "tournaments:all" : `tournaments:own:${uid}`;
  const { data: cloud, loaded: cloudLoaded } = useLive<CloudTournament[]>(
    key,
    NO_CLOUD,
    (onChange, onError) =>
      admin
        ? watchAllTournaments(onChange, onError)
        : watchMyTournaments(uid ?? "", onChange, onError),
  );

  const list = useMemo(() => {
    const byId = new Map<string, ScopedTournament>();

    for (const t of local) {
      byId.set(t.id, {
        id: t.id,
        data: t,
        onDevice: true,
        onCloud: false,
        // ทัวร์ที่ยังไม่เคยเผยแพร่ไม่มี ownerUid — คนที่ถืออยู่ในเครื่องคือเจ้าของ
        mine: !t.ownerUid || t.ownerUid === uid,
        ownerName: null,
        cloudNewer: false,
      });
    }

    for (const c of cloud) {
      const hit = byId.get(c.id);
      if (hit) {
        byId.set(c.id, {
          ...hit,
          onCloud: true,
          mine: c.ownerUid === uid,
          ownerName: c.ownerName ?? null,
          cloudNewer: (c.updatedAt ?? "") > (hit.data.updatedAt ?? ""),
        });
      } else {
        byId.set(c.id, {
          id: c.id,
          data: c,
          onDevice: false,
          onCloud: true,
          mine: c.ownerUid === uid,
          ownerName: c.ownerName ?? null,
          cloudNewer: false,
        });
      }
    }

    return [...byId.values()].sort((a, b) =>
      (b.data.updatedAt ?? "").localeCompare(a.data.updatedAt ?? ""),
    );
  }, [local, cloud, uid]);

  /* ไม่มีคลาวด์ให้รอ = ถือว่ารู้ผลแล้ว ไม่งั้นหน้ารายการจะค้างอยู่ที่โครงโหลด
     ตลอดไปในโหมดที่ไม่ได้เชื่อม Firebase หรือตอนยังไม่ได้ล็อกอิน */
  return { list, cloudLoaded: key === null ? true : cloudLoaded };
}
