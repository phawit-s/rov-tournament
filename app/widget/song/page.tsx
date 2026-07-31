"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useWidgetOptions } from "@/hooks/useLiveTournament";
import { splitQueue, watchSongQueue } from "@/lib/song/store";
import type { SongRequest } from "@/lib/song/types";
import { thumbUrl } from "@/lib/song/youtube";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** โชว์คิวถัดไปแค่ 3 เพลง มากกว่านี้ความสูงจะเกินกรอบ 620x300 ที่ออกแบบไว้ */
const NEXT_LIMIT = 3;

/**
 * เพลงที่กำลังเล่นกับคิวถัดไป สำหรับวางค้างไว้บนสตรีม
 *
 * ลิงก์: /widget/song/#ch=รหัสช่อง  (ขนาดที่ออกแบบไว้ 620 x 300)
 * widget ตัวนี้ไม่ได้ล็อกอิน จึงขอเฉพาะเพลงที่ยังไม่จบ (onlyOpen)
 * ให้ตรงกับสิทธิ์อ่านสาธารณะใน firestore.rules
 */
export default function SongWidget() {
  const channelId = useHashParam("ch");
  const { accent } = useWidgetOptions();
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<SongRequest[]>([]);

  // แยกออกมาเป็น callback ของ subscription ไม่ใช่โค้ดที่รันตอน mount
  const handleSnapshot = useCallback((list: SongRequest[]) => setQueue(list), []);

  useEffect(() => {
    if (!channelId) return;
    return watchSongQueue(channelId, handleSnapshot, { onlyOpen: true });
  }, [channelId, handleSnapshot]);

  const { playing, queued } = splitQueue(queue);
  const next = queued.slice(0, NEXT_LIMIT);

  if (!channelId) {
    return (
      <WidgetShell>
        <WidgetHint title="ยังไม่รู้ว่าจะฟังคิวของช่องไหน">
          เติม <code>#ch=รหัสช่อง</code> ท้ายลิงก์ widget เช่น{" "}
          <code>/widget/song/#ch=abc123</code> (ถ้าโปรแกรมสตรีมตัด{" "}
          <code>#</code> ทิ้ง ใช้ <code>?ch=</code> แทนได้)
        </WidgetHint>
      </WidgetShell>
    );
  }

  // ค้างอยู่บนจอตลอดเวลา ตอนคิวว่างจึงต้องหายไปเลย ไม่ใช่โชว์กล่องเปล่า
  if (!playing && next.length === 0) return null;

  return (
    <WidgetShell>
      <WidgetCard accent={accent} frame="bar" className="w-150 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <EqBars accent={accent} active={!!playing && !reduced} />
            <span className="slug">{playing ? "กำลังเล่น" : "คิวเพลง"}</span>
          </span>
          <span className="num text-[11px] text-white/35">
            รออีก {queued.length} เพลง
          </span>
        </div>

        <span className="rule mt-2.5 block h-px" />

        {/* AnimatePresence อยู่นอกเงื่อนไข เพื่อให้ตอนเพลงจบมันได้เล่นจังหวะออกก่อนหาย */}
        <AnimatePresence mode="wait" initial={false}>
          {playing && (
            <motion.div
              key={playing.id}
              initial={reduced ? false : { opacity: 0, y: 14, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? undefined : { opacity: 0, y: -14, filter: "blur(5px)" }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 flex items-center gap-4"
            >
              <Cover videoId={playing.videoId} accent={accent} />

              <div className="min-w-0 flex-1">
                {/* ชื่อคลิปยาวได้ถึง 140 ตัว ตัดสองบรรทัดคุมความสูงได้แน่นอนกว่า marquee */}
                <p className="line-clamp-2 font-display text-xl leading-snug text-white">
                  {playing.title}
                </p>
                {playing.author && (
                  <p className="mt-1 truncate text-sm text-white/50">{playing.author}</p>
                )}
                <p className="mt-1.5 truncate text-eyebrow tracking-luxe text-white/40 uppercase">
                  ขอโดย <span className="text-white/75">{playing.byName}</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {next.length > 0 && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="slug text-white/40">คิวถัดไป</span>
              <span className="rule h-px flex-1" />
            </div>

            <ul className="mt-1.5 space-y-1">
              <AnimatePresence initial={false}>
                {next.map((song, i) => (
                  <motion.li
                    key={song.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? undefined : { opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="tile flex items-center gap-3 rounded-lg px-3 py-1"
                  >
                    <span className="fig w-6 shrink-0 text-base text-white/25">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm text-white/85">
                      {song.title}
                    </p>
                    <span className="num shrink-0 text-eyebrow text-white/35">
                      {song.byName}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </WidgetCard>
    </WidgetShell>
  );
}

/**
 * รูปปกคลิป
 * บนสตรีมห้ามเห็นไอคอนรูปแตกเด็ดขาด โหลดไม่ได้เมื่อไหร่ซ่อนรูปแล้วเหลือพื้นสำรองไว้แทน
 * (i.ytimg.com บางเครือข่ายบล็อก และคลิปที่เพิ่งลบจะคืน 404)
 */
function Cover({ videoId, accent }: { videoId: string; accent: string }) {
  const [broken, setBroken] = useState(false);

  return (
    <span
      className="relative block h-18 w-32 shrink-0 overflow-hidden rounded-lg"
      style={{
        background: `linear-gradient(140deg, ${accent}2e, rgb(0 0 0 / 0.55))`,
        boxShadow: `inset 0 0 0 1px ${accent}44`,
      }}
    >
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(videoId)}
          alt=""
          referrerPolicy="no-referrer"
          loading="eager"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      )}
      {broken && (
        // สามเหลี่ยมเล่นแทนรูป บอกว่าเป็นคลิปโดยไม่ต้องพึ่งไฟล์ภายนอก
        <span
          className="absolute inset-0 grid place-items-center text-lg"
          style={{ color: accent }}
        >
          ▶
        </span>
      )}
      {/* ไล่เฉดดำที่ขอบล่าง กันปกสีสว่างจัดกลืนกับพื้นการ์ด */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(180deg, transparent 55%, rgb(0 0 0 / 0.5))",
        }}
      />
    </span>
  );
}

/** เส้นกราฟเสียงเล็กๆ บอกว่ากำลังเล่นอยู่จริง ไม่ใช่ค้างอยู่ที่เพลงเก่า */
function EqBars({ accent, active }: { accent: string; active: boolean }) {
  const bars = [0, 1, 2];

  return (
    <span className="flex h-3 items-end gap-0.5" aria-hidden>
      {bars.map((i) =>
        active ? (
          <motion.span
            key={i}
            className="block w-0.5 origin-bottom rounded-full"
            style={{ background: accent, height: "100%" }}
            animate={{ scaleY: [0.3, 1, 0.5, 0.85, 0.3] }}
            transition={{
              duration: 1.2 + i * 0.25,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ) : (
          <span
            key={i}
            className="block w-0.5 rounded-full"
            style={{ background: `${accent}80`, height: `${40 + i * 20}%` }}
          />
        ),
      )}
    </span>
  );
}
