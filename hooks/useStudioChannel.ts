"use client";

import { useMemo } from "react";
import { setHashParams, useHashParam } from "@/hooks/useClient";
import { useManageableChannels } from "@/hooks/useChannels";
import { useSiteRole } from "@/hooks/useRole";
import type { Channel } from "@/lib/channel/types";

/**
 * ช่องที่สตูดิโอกำลังทำงานด้วย — ตอบจาก #c= ในลิงก์ที่เดียวทุกหน้าในสตูดิโอ
 *
 * ทำไมเป็น hash ไม่ใช่ state: ผู้ดูแลเข้าไปช่วยจัดคิวช่องของคนอื่นได้ ถ้าเก็บใน state
 * พอเปลี่ยนหน้าค่าหาย แล้วเด้งกลับไปช่องตัวเองเงียบๆ — กดลบเพลงผิดช่องได้ทันที
 * แถบข้างพา #c= ติดไปทุกลิงก์ (studioHref) รีเฟรชก็ยังอยู่ช่องเดิม
 *
 * ไม่มี #c= = ช่องแรกของตัวเอง · ผู้ดูแลที่ไม่มีช่องตัวเอง = null (ต้องเลือกก่อน
 * ห้ามเดาให้ เพราะจะกลายเป็นการแก้ช่องคนอื่นโดยไม่รู้ตัว)
 */
export function useStudioChannel(): {
  /** ช่องที่หยิบมาทำงานได้ — ของตัวเองก่อน ของคนอื่นตามหลัง (เห็นเฉพาะผู้ดูแล) */
  channels: Channel[];
  channel: Channel | null;
  /** รหัสใน #c= ที่หาในรายการไม่เจอ (ลิงก์ผิด/ช่องถูกลบ) */
  missingId: string | null;
  loaded: boolean;
  admin: boolean;
  uid: string | null;
  /** ช่องที่เปิดอยู่ไม่ใช่ของเรา (ผู้ดูแลกำลังช่วยดูแล) */
  editingOther: boolean;
  select: (id: string | null) => void;
} {
  const { admin, uid } = useSiteRole();
  const { channels: all, loaded } = useManageableChannels(admin, uid);
  const picked = useHashParam("c");

  const channels = useMemo(() => {
    const mine = all.filter((c) => c.ownerUid === uid);
    const others = all.filter((c) => c.ownerUid !== uid);
    return [...mine, ...others];
  }, [all, uid]);

  const fromHash = picked ? (channels.find((c) => c.id === picked) ?? null) : null;
  const firstOwn = channels.find((c) => c.ownerUid === uid) ?? null;
  const channel = picked ? fromHash : firstOwn;

  return {
    channels,
    channel,
    missingId: picked && loaded && !fromHash ? picked : null,
    loaded,
    admin,
    uid,
    editingOther: !!channel && channel.ownerUid !== uid,
    select: (id) => setHashParams({ c: id }),
  };
}

/** ลิงก์ในสตูดิโอที่พาช่องปัจจุบันติดไปด้วย */
export function studioHref(path: string, channelId: string | null | undefined): string {
  return channelId ? `${path}#c=${channelId}` : path;
}
