"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam, useQueryFlag } from "@/hooks/useClient";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { watchChannelDonations } from "@/lib/channel/donations";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { cloudReady } from "@/lib/tournament/cloud";
import { formatMoney } from "@/lib/tournament/prize";
import { sfx } from "@/lib/sound";
import type { Donation } from "@/lib/tournament/types";
import GoldDust from "@/components/fx/GoldDust";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

const SHOW_MS = 9000;
/** ยอดที่ถือว่าเป็นโมเมนต์ใหญ่ ควรได้ทองเปลวร่วง */
const DUST_FROM = 500;

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
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<Donation[]>([]);
  // ใบที่กำลังโชว์คือใบแรกของคิว ไม่ต้องเก็บเป็น state ซ้อน
  const current = queue[0] ?? null;
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  /** โหลดคิวรอบแรกเสร็จหรือยัง ใช้บอกว่า "ไม่มีใบเลย" ต่างจาก "ยังโหลดไม่เสร็จ" */
  const [loaded, setLoaded] = useState(false);
  const [total, setTotal] = useState(0);

  // #ch= คือโหมดช่อง (แนะนำ) ใช้ลิงก์เดียวได้ตลอด
  const channelId = useHashParam("ch");
  const replayMode = useQueryFlag("replay");
  const [channel, setChannel] = useState<Channel | null>(null);

  /* ตัวรับ snapshot ผูกไว้ครั้งเดียว จึงอ่านค่าธงผ่าน ref
     ประกาศ effect นี้ไว้ก่อนตัวที่สมัคร subscription ค่าจะได้พร้อมก่อนใบแรกมาถึง */
  const replayRef = useRef(false);
  useEffect(() => {
    replayRef.current = replayMode;
  }, [replayMode]);

  useEffect(() => {
    if (!channelId || !cloudReady()) return;
    return watchChannel(channelId, setChannel);
  }, [channelId]);

  // แยกออกมาจาก effect เพราะเป็น callback ของ subscription ไม่ใช่โค้ดที่รันตอน mount
  const handleSnapshot = useCallback((list: Donation[]) => {
    setLoaded(true);
    setTotal(list.length);

    // รอบแรกถือว่าเห็นหมดแล้ว จะได้ไม่เล่นย้อนหลังตอนเปิดหน้า
    if (!primed.current) {
      primed.current = true;
      if (!replayRef.current) {
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
    if (!cloudReady() || !channelId) return;
    return watchChannelDonations(channelId, handleSnapshot, { onlyApproved: true });
  }, [channelId, handleSnapshot]);

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
        <WidgetHint setup title="ยังเชื่อมช่องไม่ได้">
          ลิงก์ต้องมี <code>#ch=รหัสช่อง</code> (หรือ <code>#c=รหัสทัวร์</code>)
          และต้องเชื่อม Firebase แล้ว
        </WidgetHint>
      </WidgetShell>
    );
  }

  /*
    ?replay=1 คือโหมดตั้งค่า คนเปิดมาเพื่อ "ดูว่ามันขึ้นตรงไหน" ก่อนเอาไปวางจริง
    ถ้ายังไม่เคยมีใบโดเนทที่อนุมัติเลย จอจะดำสนิทซึ่งแยกไม่ออกจากลิงก์ผิดหรือ widget พัง
    โหมดนี้จึงต้องบอกเหตุผลออกมา ส่วนโหมดใช้งานจริง (ไม่มี replay) ต้องเงียบเหมือนเดิม
  */
  if (!current && replayMode && loaded && total === 0) {
    return (
      <WidgetShell align="center">
        <WidgetHint title="ยังไม่มีใบให้เล่นซ้ำ">
          เชื่อมช่องได้แล้ว แต่ช่องนี้ยังไม่มีใบสนับสนุนที่อนุมัติสักใบ
          จึงไม่มีอะไรให้เล่นย้อน — ลองส่งใบทดสอบจากหน้าสนับสนุนแล้วกดอนุมัติดู
          ถ้าจะเอาไปใช้จริงให้ตัด <code>?replay=1</code> ออก
        </WidgetHint>
      </WidgetShell>
    );
  }

  const isMember = current?.kind === "member";
  const tiers = channel?.member.tiers ?? [];
  const tier = isMember ? tiers.find((t) => t.id === current?.tierId) : null;
  const color = tier ? `rgb(${tier.rgb})` : accent;
  // ป้าย tier ที่ผู้จัดอุตส่าห์ตั้งไว้ ควรได้ขึ้นจอจริงสักที ถ้าไม่มีก็ใช้อักษรแรกของชื่อ
  const badge = tier?.badge?.trim() || current?.name?.trim().charAt(0).toUpperCase() || "◆";

  return (
    <WidgetShell align="center">
      {current && current.amount >= DUST_FROM && <GoldDust count={16} />}

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={reduced ? false : { opacity: 0, y: 28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="relative z-50"
          >
            <WidgetCard
              accent={color}
              frame="crest"
              className="w-175 px-9 pt-7 pb-6 text-center"
            >
              {queue.length > 1 && (
                <span
                  className="num absolute top-0 right-0 rounded-full px-2.5 py-1 font-display text-[11px]"
                  style={{
                    color,
                    background: `${color}1f`,
                    boxShadow: `inset 0 0 0 1px ${color}55`,
                  }}
                >
                  +{queue.length - 1} รอคิว
                </span>
              )}

              {/* เหรียญประจำ tier — วงแหวนกระเพื่อมรอบเดียว ไม่วนลูปให้รกจอ */}
              <div className="relative mx-auto grid h-14 w-14 place-items-center">
                {!reduced && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ boxShadow: `0 0 0 1px ${color}` }}
                    initial={{ scale: 0.8, opacity: 0.6 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                  />
                )}
                <span
                  className="grid h-14 w-14 place-items-center rounded-full font-display text-xl"
                  style={{
                    color,
                    background: `${color}1f`,
                    boxShadow: `inset 0 0 0 1px ${color}66`,
                  }}
                >
                  {badge}
                </span>
              </div>

              <motion.p
                initial={reduced ? false : { letterSpacing: "0.5em", opacity: 0 }}
                animate={{ letterSpacing: "0.32em", opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="mt-4 font-display text-[11px] font-semibold uppercase"
                style={{ color }}
              >
                {isMember
                  ? `สมาชิกใหม่ · ${current.tierName ?? ""}`
                  : "ขอบคุณสำหรับการสนับสนุน"}
              </motion.p>

              <p className="mt-3 font-display text-3xl text-white">{current.name}</p>

              {/* ยอดเงินมีเงาสีตัวเองซ้อนอยู่ข้างหลัง ทำให้ตัวเลขเรืองออกมาจากการ์ด */}
              <motion.div
                initial={reduced ? false : { scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 18 }}
                className="relative mt-2 inline-flex items-baseline gap-2"
              >
                <span className="relative inline-block">
                  <span
                    aria-hidden
                    className="fig num absolute inset-0 text-4xl opacity-40 blur-lg"
                    style={{ color }}
                  >
                    {formatMoney(current.amount)}
                  </span>
                  <span className="fig num relative text-4xl" style={{ color }}>
                    {formatMoney(current.amount)}
                  </span>
                </span>
                {isMember && current.months ? (
                  <span className="num relative text-lg text-white/60">
                    {current.months} เดือน
                  </span>
                ) : null}
              </motion.div>

              {current.message && (
                <motion.blockquote
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="relative mx-auto mt-5 max-w-110 rounded-r-lg bg-white/5 py-3 pr-4 pl-6 text-left text-base text-white/85"
                  style={{ borderLeft: `2px solid ${color}` }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-0 left-2 font-display text-5xl leading-none opacity-[0.15]"
                    style={{ color }}
                  >
                    &ldquo;
                  </span>
                  {current.message}
                </motion.blockquote>
              )}

              {/* แถบเวลาแสดงผล พร้อมจุดเรืองที่วิ่งตามปลายแถบ */}
              <span className="pointer-events-none absolute -inset-x-9 -bottom-6 h-0.5">
                <motion.span
                  className="absolute inset-0 origin-left"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                  }}
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: SHOW_MS / 1000, ease: "linear" }}
                />
                <motion.span
                  className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                  initial={{ left: "100%" }}
                  animate={{ left: "0%" }}
                  transition={{ duration: SHOW_MS / 1000, ease: "linear" }}
                />
              </span>
            </WidgetCard>
          </motion.div>
        )}
      </AnimatePresence>
    </WidgetShell>
  );
}
