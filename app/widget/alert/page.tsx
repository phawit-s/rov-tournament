"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { watchChannelDonations } from "@/lib/channel/donations";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { cloudReady, watchDonations } from "@/lib/tournament/cloud";
import { formatMoney } from "@/lib/tournament/prize";
import { sfx } from "@/lib/sound";
import type { Donation } from "@/lib/tournament/types";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

const SHOW_MS = 9000;

/**
 * แจ้งเตือนโดเนท/สมาชิกใหม่บนสตรีม
 * ผู้จัดกดอนุมัติสลิปเมื่อไหร่ อันนี้เด้งทันที
 *
 * ?replay=1 เล่นย้อนของเก่าทั้งหมด (ไว้เทสต์)
 * เปิด "Control audio via OBS" ในคุณสมบัติ Browser Source ถ้าอยากได้ยินเสียง
 */
export default function AlertWidget() {
  const { tournament } = useLiveTournament();
  const { accent } = useWidgetOptions();
  const [queue, setQueue] = useState<Donation[]>([]);
  // ใบที่กำลังโชว์คือใบแรกของคิว ไม่ต้องเก็บเป็น state ซ้อน
  const current = queue[0] ?? null;
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  // #ch= คือโหมดช่อง (แนะนำ) ใช้ลิงก์เดียวได้ตลอด
  const channelId = useHashParam("ch");
  const [channel, setChannel] = useState<Channel | null>(null);
  const tournamentId = tournament?.id;

  useEffect(() => {
    if (!channelId || !cloudReady()) return;
    return watchChannel(channelId, setChannel);
  }, [channelId]);

  // แยกออกมาจาก effect เพราะเป็น callback ของ subscription ไม่ใช่โค้ดที่รันตอน mount
  const handleSnapshot = useCallback((list: Donation[]) => {
    const replay =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("replay") === "1";

    // รอบแรกถือว่าเห็นหมดแล้ว จะได้ไม่เล่นย้อนหลังตอนเปิดหน้า
    if (!primed.current) {
      primed.current = true;
      if (!replay) {
        list.forEach((d) => seen.current.add(d.id));
        return;
      }
    }
    const fresh = list.filter((d) => !seen.current.has(d.id));
    if (fresh.length === 0) return;
    fresh.forEach((d) => seen.current.add(d.id));
    setQueue((prev) => [...prev, ...fresh]);
  }, []);

  useEffect(() => {
    if (!cloudReady()) return;
    if (channelId) {
      return watchChannelDonations(channelId, handleSnapshot, { onlyApproved: true });
    }
    if (tournamentId) {
      return watchDonations(tournamentId, handleSnapshot, { onlyApproved: true });
    }
  }, [channelId, tournamentId, handleSnapshot]);

  // เล่นทีละใบ พอครบเวลาก็ตัดใบแรกออกให้ใบถัดไปขึ้นแทน
  useEffect(() => {
    if (!current) return;
    sfx.unlock();
    sfx.play("donate");
    const timer = window.setTimeout(
      () => setQueue((prev) => prev.slice(1)),
      SHOW_MS,
    );
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!tournament && !channel) {
    return (
      <WidgetShell align="center">
        <WidgetHint>
          ลิงก์ต้องมี #ch=รหัสช่อง (หรือ #c=รหัสทัวร์) และต้องเชื่อม Firebase แล้ว
        </WidgetHint>
      </WidgetShell>
    );
  }

  const isMember = current?.kind === "member";
  const tiers = channel?.member.tiers ?? tournament?.member?.tiers ?? [];
  const tier = isMember ? tiers.find((t) => t.id === current?.tierId) : null;
  const color = tier ? `rgb(${tier.rgb})` : accent;

  return (
    <WidgetShell align="center">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
          >
            <WidgetCard accent={color} className="min-w-130 py-6 text-center">
              <motion.p
                initial={{ letterSpacing: "0.5em", opacity: 0 }}
                animate={{ letterSpacing: "0.3em", opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="font-display text-[11px] uppercase"
                style={{ color }}
              >
                {isMember ? `สมาชิกใหม่ · ${current.tierName ?? ""}` : "ขอบคุณสำหรับการสนับสนุน"}
              </motion.p>

              <p className="mt-3 font-display text-3xl text-white">
                {current.name}
              </p>

              <motion.p
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 18 }}
                className="mt-2 font-display text-4xl tabular-nums"
                style={{ color, textShadow: `0 0 30px ${color}66` }}
              >
                {formatMoney(current.amount)}
                {isMember && current.months ? (
                  <span className="ml-2 text-lg text-white/60">
                    {current.months} เดือน
                  </span>
                ) : null}
              </motion.p>

              {current.message && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mx-auto mt-4 max-w-110 text-base text-white/85"
                >
                  “{current.message}”
                </motion.p>
              )}

              {/* แถบเวลาแสดงผล */}
              <motion.span
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left"
                style={{ background: color }}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: SHOW_MS / 1000, ease: "linear" }}
              />
            </WidgetCard>
          </motion.div>
        )}
      </AnimatePresence>
    </WidgetShell>
  );
}
