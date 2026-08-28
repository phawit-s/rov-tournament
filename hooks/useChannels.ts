"use client";

import { useMemo } from "react";
import { useLive } from "@/lib/backend/live";
import { watchAllChannels, watchChannel, watchMyChannels } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";

/* อ้างอิงคงที่ ไม่งั้นทุกเรนเดอร์จะได้อาร์เรย์ใหม่แล้วลูกๆ รีเรนเดอร์ตามฟรีๆ */
const NONE: Channel[] = [];

/**
 * ช่องทั้งระบบ — เรียกได้เฉพาะตอนเป็นผู้ดูแลจริง
 * ส่ง enabled = false เมื่อไม่ใช่ จะได้ไม่เปิดท่อทิ้งไว้เปล่าๆ
 */
export function useAllChannels(enabled: boolean): {
  channels: Channel[];
  loaded: boolean;
} {
  const { data, loaded } = useLive<Channel[]>(
    enabled ? "channels:all" : null,
    NONE,
    (onChange, onError) => watchAllChannels(onChange, onError),
  );
  return { channels: data, loaded };
}

/** ช่องของบัญชีที่ล็อกอินอยู่ */
export function useOwnChannels(uid: string | null): {
  channels: Channel[];
  loaded: boolean;
} {
  const { data, loaded } = useLive<Channel[]>(
    uid ? `channels:own:${uid}` : null,
    NONE,
    (onChange, onError) => watchMyChannels(uid ?? "", onChange, onError),
  );
  return { channels: data, loaded };
}

/**
 * ชุดช่องที่คนนี้ "จัดการได้" — ผู้ดูแลได้ทุกช่อง คนอื่นได้เฉพาะของตัวเอง
 *
 * รวมไว้ที่เดียวเพราะหน้ารายการทัวร์ ฟอร์มทัวร์ และหน้าตั้งค่าช่องเคยตอบคำถามนี้
 * กันเองคนละแบบ แล้วตัวกรอง "ช่อง" ของแต่ละหน้าก็มีตัวเลือกไม่ตรงกัน
 */
export function useManageableChannels(
  admin: boolean,
  uid: string | null,
): { channels: Channel[]; loaded: boolean; scope: "all" | "own" } {
  const all = useAllChannels(admin);
  const own = useOwnChannels(admin ? null : uid);
  const source = admin ? all : own;

  const channels = useMemo(() => {
    if (!source.channels.length) return NONE;
    return source.channels
      .slice()
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [source.channels]);

  return { channels, loaded: source.loaded, scope: admin ? "all" : "own" };
}

/** ช่องใบเดียวแบบสด — ใช้เป็น "ต้นฉบับ" ของหน้าตั้งค่าช่อง */
export function useChannel(id: string | null): {
  channel: Channel | null;
  loaded: boolean;
} {
  const { data, loaded } = useLive<Channel | null>(
    id ? `channel:${id}` : null,
    null,
    (onChange, onError) =>
      watchChannel(id ?? "", onChange, () => {
        onError();
      }),
  );
  return { channel: data, loaded };
}
