"use client";

import { useEffect, useState } from "react";
import { useHashParam } from "@/hooks/useClient";
import { useWidgetOptions } from "@/hooks/useLiveTournament";
import { splitQueue, watchSongQueue } from "@/lib/song/store";
import type { SongRequest } from "@/lib/song/types";
import { thumbUrl } from "@/lib/song/youtube";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** โชว์คิวถัดไปแค่ 3 เพลง มากกว่านี้ความสูงจะเกินกรอบ 620x300 ที่ออกแบบไว้ */
const NEXT_LIMIT = 3;

/** อ้างอิงคงที่ ไม่งั้นคิวว่างจะเป็นอาร์เรย์ใหม่ทุกเรนเดอร์แล้ววนไม่จบ */
const EMPTY: SongRequest[] = [];

/**
 * เพลงที่กำลังเล่นกับคิวถัดไป สำหรับวางค้างไว้บนสตรีม
 *
 * ลิงก์: /widget/song/#ch=รหัสช่อง  (ขนาดที่ออกแบบไว้ 620 x 300)
 * widget ตัวนี้ไม่ได้ล็อกอิน จึงขอเฉพาะเพลงที่ยังไม่จบ (onlyOpen)
 * ให้ตรงกับสิทธิ์อ่านสาธารณะใน firestore.rules
 *
 * เรื่องความเบา — widget ค้างอยู่บนจอตลอดไลฟ์ บนเครื่องที่กำลังเข้ารหัสวิดีโอ
 * ทุกเปอร์เซ็นต์ซีพียูที่กินไปคือเฟรมที่คนดูเสียไป จึงตั้งใจ:
 *   1. ไม่มีแอนิเมชันที่ขับด้วย JS เลย ใช้ CSS keyframes ที่แตะแค่ transform/opacity
 *      ซึ่งเบราว์เซอร์ยกไปให้ compositor ทำคนละเธรด ไม่กวน main thread
 *   2. ไม่ใช้ filter/blur และไม่ขยับ box-shadow — สองอันนั้นบังคับวาดใหม่ทุกเฟรม
 *   3. ไม่มี layout animation ที่ต้องวัดตำแหน่งกล่องใหม่ (บังคับ reflow)
 *   4. รูปปกใช้ไซซ์ mq (320x180) พอดีกับที่แสดงจริง ไม่ต้องถอดรหัสรูปใหญ่มาย่อ
 *   5. รีเรนเดอร์เฉพาะตอนคิวเปลี่ยนจริง ไม่มีตัวจับเวลาเดินอยู่เบื้องหลัง
 */
export default function SongWidget() {
  const channelId = useHashParam("ch");
  const { accent } = useWidgetOptions();
  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);

  useEffect(() => {
    if (!channelId) return;
    return watchSongQueue(channelId, setQueue, {
      onlyOpen: true,
      onError: () => setQueue(EMPTY),
    });
  }, [channelId]);

  const { playing, queued } = splitQueue(queue);
  const next = queued.slice(0, NEXT_LIMIT);

  if (!channelId) {
    return (
      <WidgetShell>
        <WidgetHint title="ยังไม่รู้ว่าจะฟังคิวของช่องไหน">
          เติม <code>#ch=รหัสช่อง</code> ท้ายลิงก์ widget เช่น{" "}
          <code>/widget/song/#ch=abc123</code> (ถ้าโปรแกรมสตรีมตัด <code>#</code> ทิ้ง
          ใช้ <code>?ch=</code> แทนได้)
        </WidgetHint>
      </WidgetShell>
    );
  }

  // ค้างอยู่บนจอตลอดเวลา ตอนคิวว่างจึงต้องหายไปเลย ไม่ใช่โชว์กล่องเปล่า
  if (!playing && next.length === 0) return null;

  return (
    <WidgetShell>
      <WidgetCard accent={accent} frame="bar" className="w-150 px-5 py-4">
        {/* ---------- หัวแถบ ---------- */}
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <Equalizer accent={accent} active={!!playing} />
            <span className="slug">{playing ? "กำลังเล่น" : "คิวเพลง"}</span>
          </span>
          {queued.length > 0 && (
            <span className="num text-[11px] text-white/35">
              รออีก {queued.length} เพลง
            </span>
          )}
        </div>

        <span className="rule mt-2.5 block h-px" />

        {/* ---------- เพลงที่กำลังเล่น ----------
            key ผูกกับ id ของเพลง พอเปลี่ยนเพลง React จะสร้างกล่องใหม่
            แอนิเมชัน CSS เลยเล่นซ้ำเองโดยไม่ต้องมี AnimatePresence คอยคุมจังหวะ */}
        {playing && (
          <div key={playing.id} className="rise-in mt-3 flex items-center gap-4">
            <Cover videoId={playing.videoId} accent={accent} />

            <div className="min-w-0 flex-1">
              {/* ชื่อคลิปยาวได้ถึง 140 ตัว ตัดสองบรรทัดคุมความสูงได้แน่นอนกว่าตัววิ่ง */}
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
          </div>
        )}

        {/* ---------- คิวถัดไป ---------- */}
        {next.length > 0 && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="slug text-white/40">คิวถัดไป</span>
              <span className="rule h-px flex-1" />
            </div>

            <ul className="mt-1.5 space-y-1">
              {next.map((song, i) => (
                <li
                  key={song.id}
                  className="slide-in tile flex items-center gap-3 rounded-lg px-3 py-1"
                  /* หน่วงทีละแถวให้ไล่กันเข้ามา ไม่ใช่โผล่พร้อมกันทั้งก้อน */
                  style={{ animationDelay: `${i * 70}ms` }}
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
                </li>
              ))}
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
        // เงานิ่งๆ วาดครั้งเดียวตอนแรก ไม่ได้ขยับตามเฟรม จึงไม่มีต้นทุนต่อเนื่อง
        boxShadow: `inset 0 0 0 1px ${accent}44, 0 10px 30px -14px ${accent}66`,
      }}
    >
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(videoId, "mq")}
          alt=""
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          width={128}
          height={72}
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
        style={{ background: "linear-gradient(180deg, transparent 55%, rgb(0 0 0 / 0.5))" }}
      />
    </span>
  );
}

/**
 * เส้นกราฟเสียง บอกว่ากำลังเล่นอยู่จริง ไม่ใช่ค้างอยู่ที่เพลงเก่า
 *
 * ห้าเส้น ขับด้วย CSS keyframes ตัวเดียวกันแล้วเหลื่อมจังหวะด้วย animation-delay
 * ทั้งชุดแตะแค่ transform: scaleY จึงอยู่บน compositor ล้วน ไม่มี JS เดินเบื้องหลังเลย
 */
function Equalizer({ accent, active }: { accent: string; active: boolean }) {
  const bars = [0, 1, 2, 3, 4];

  if (!active) {
    return (
      <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
        {bars.map((i) => (
          <span
            key={i}
            className="block w-[3px] rounded-full"
            style={{ background: `${accent}66`, height: `${35 + (i % 3) * 18}%` }}
          />
        ))}
      </span>
    );
  }

  return (
    <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className="eq-bar block h-full w-[3px] rounded-full"
          style={{
            background: accent,
            // จังหวะไม่เท่ากันทุกเส้น ดูเป็นธรรมชาติกว่าเลื่อนพร้อมกันเป็นแถว
            animationDelay: `${i * 130}ms`,
            animationDuration: `${1000 + (i % 3) * 220}ms`,
          }}
        />
      ))}
    </span>
  );
}
