"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/hooks/useClient";
import { NEUTRAL_PALETTE, loadArtPalette, type ArtPalette } from "@/lib/song/artwork";
import { formatClock, playbackProgress } from "@/lib/song/progress";
import type { SongRequest } from "@/lib/song/types";
import { thumbUrl } from "@/lib/song/youtube";

/** ทรงการ์ด — สูง (ปกใหญ่ซ้อนบนข้อความ) หรือ นอน (ปกเล็กอยู่ข้างข้อความ) */
export type CardShape = "tall" | "wide";

/**
 * ความกว้างของการ์ดแต่ละทรง เป็นพิกเซล
 * หน้าแจกลิงก์อ้างค่านี้ไปคิดขนาด Browser Source ที่จะบอกผู้ใช้
 */
export const CARD_WIDTH: Record<CardShape, number> = { tall: 340, wide: 470 };

/** ด้านของรูปปกในทรงนอน — พอดีกับความสูงของข้อความสามบรรทัด */
const ART_WIDE = 104;

/*
  ไม่มีเงาทอดออกนอกการ์ดโดยตั้งใจ

  เงาที่ดูดีตอนพรีวิวบนพื้นเข้ม กลายเป็นคราบดำฟุ้งเป็นสี่เหลี่ยมรอบการ์ดทันที
  ที่วางทับภาพเกมสว่าง — พื้นหลัง widget โปร่งใส เงาจึงไม่มีอะไรให้ตกกระทบ
  ขอบการ์ดอ่านออกอยู่แล้วจากสีพื้นที่ย้อมตามปกและเส้นขอบด้านใน
*/

/**
 * การ์ด "กำลังเล่น" — ย้อมสีตามรูปปกของเพลงที่เล่นอยู่
 *
 * ต่างจากแบบแถบยาวตรงที่ทุกเพลงหน้าตาไม่เหมือนกัน และกลมกลืนกับปก
 * โดยไม่ต้องตั้งค่าอะไรเลย
 *
 * สองทรงใช้ชิ้นส่วนชุดเดียวกันหมด (ปกจัตุรัส · แผ่นชื่อเพลง · แถบเวลา)
 * ต่างกันแค่แกนที่วางเรียง จึงแก้ที่เดียวแล้วเปลี่ยนทั้งคู่
 *
 * เรื่องความเบา (widget ค้างบนจอตลอดไลฟ์ บนเครื่องที่เข้ารหัสวิดีโออยู่):
 *   - แถบความคืบหน้าเป็น CSS keyframes ล้วน ไม่มี JS ขยับต่อเฟรม
 *   - ดูดสีจากปกครั้งเดียวตอนเปลี่ยนเพลง ไม่ใช่ทุกเรนเดอร์
 *   - เบลอเป็นพื้นหลังรูปเป็นภาพนิ่ง เบราว์เซอร์แรสเตอร์ครั้งเดียวแล้วแคชไว้
 *     (ที่ห้ามคือเบลอ "ที่ขยับ" ซึ่งบังคับวาดใหม่ทุกเฟรม)
 *   - มีแค่ตัวเลขเวลาที่อัปเดตวินาทีละครั้ง แยกเป็นคอมโพเนนต์ย่อย
 *     รีเรนเดอร์เฉพาะข้อความสองคำ ไม่ลามไปทั้งการ์ด
 */
export default function NowPlayingCard({
  song,
  accent,
  shape = "tall",
}: {
  /** null = ยังไม่มีเพลงเล่น ให้ขึ้นการ์ดสีเทารอแทนที่จะหายไปจากจอ */
  song: SongRequest | null;
  accent: string;
  shape?: CardShape;
}) {
  const palette = useArtPalette(song?.videoId ?? null);

  /* กำหนดความกว้างตรงๆ ไม่ผ่านคลาส เพราะตัวเลขนี้คือสัญญากับผู้ใช้ —
     ต้องตรงกับขนาด Browser Source ที่หน้าแจกลิงก์บอกไว้เป๊ะๆ
     ถ้าพลาดไปคลาสเดียว OBS จะครอบตัดการ์ดโดยที่ไม่มีอะไรฟ้อง */
  const width = CARD_WIDTH[shape];

  const words = (
    <>
      {/* กำหนดสีเป็น rgba ตรงๆ ไม่ใช้คลาสแบบ text-white/60
          เพราะค่านั้นออกมาเป็น oklab() ที่วัดความเปรียบต่างย้อนกลับไม่ได้
          ตัวหนังสือบน widget ต้องพิสูจน์ได้ว่าอ่านออกจริงตอนวางทับภาพเกม */}
      <p
        className={`line-clamp-2 font-display leading-tight ${
          shape === "tall" ? "text-lg" : "text-base"
        }`}
        style={{ color: song ? "#fff" : "rgb(255 255 255 / 0.78)" }}
      >
        {song ? song.title : "รอเพลงถัดไป"}
      </p>
      <p
        className="mt-0.5 truncate text-sm"
        style={{ color: palette.tint, opacity: song ? 0.8 : 0.6 }}
      >
        {song ? song.author || `ขอโดย ${song.byName}` : "ยังไม่มีเพลงในคิว"}
      </p>
      {song && <Progress song={song} palette={palette} />}
    </>
  );

  const art = song ? (
    <Artwork
      videoId={song.videoId}
      palette={palette}
      accent={accent}
      round={shape === "wide" ? 16 : 22}
    />
  ) : (
    <IdleArt accent={accent} round={shape === "wide" ? 16 : 22} />
  );

  /*
    ทรงนอน — ปกกับข้อความอยู่ในแผ่นเดียวกัน วางเรียงกันซ้ายขวา
    ปกย่อลงเหลือเท่าความสูงของข้อความ จะได้เป็นแถบเตี้ยที่วางขอบจอได้
  */
  /* key ผูกกับเพลง พอเปลี่ยนเพลง React สร้างกล่องใหม่ แอนิเมชันเข้าฉากจึงเล่นซ้ำเอง
     ตอนรออยู่ใช้คีย์คงที่ จะได้ไม่กระพริบใหม่ทุกครั้งที่คิวขยับ */
  const key = song?.id ?? "idle";

  if (shape === "wide") {
    return (
      <div
        key={key}
        className="rise-in flex items-center gap-3.5 rounded-2xl p-3"
        style={{
          width,
          background: palette.base,
          transition: "background 600ms ease",
        }}
      >
        <div className="shrink-0" style={{ width: ART_WIDE }}>
          {art}
        </div>
        <div className="min-w-0 flex-1">{words}</div>
      </div>
    );
  }

  return (
    /* ทรงสูง — ห้ามใส่ overflow-hidden ที่ชั้นนี้ มันจะเฉือนแสงฟุ้งรอบปกทิ้งหมด
       ลูกแต่ละใบมีมุมโค้งของตัวเองอยู่แล้ว จึงไม่ต้องมีอะไรมาครอบ */
    <div key={key} className="rise-in" style={{ width }}>
      {art}

      {/*
        ชื่อเพลงกับแถบเวลาอยู่ในแผ่นเดียวกัน

        แผ่นรองมีไว้ให้ตัวหนังสืออ่านออกตอนวางทับภาพเกมสว่างๆ ตัดทิ้งไม่ได้
        แต่ซอยเป็นหลายแผ่นก็ไม่ได้เพิ่มอะไรนอกจากเส้นขอบให้ตาสะดุด
        เหลือแผ่นเดียวจึงเป็นจุดที่บางที่สุดเท่าที่ยังอ่านออก
      */}
      <div
        className="mt-2.5 rounded-2xl px-4 pt-3 pb-3.5"
        style={{ background: palette.base, transition: "background 600ms ease" }}
      >
        {words}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

/**
 * รูปปกทรงจัตุรัส
 *
 * ปก YouTube เป็น 16:9 ถ้าครอบเป็นจัตุรัสตรงๆ จะเฉือนซ้ายขวาหายไปเกือบครึ่ง
 * (หน้าคนในมิวสิกวิดีโอมักโดนตัด) จึงวางรูปเดิมเบลอเต็มกรอบเป็นพื้นหลัง
 * แล้ววางรูปคมชัดเต็มความกว้างทับตรงกลาง — ได้กรอบจัตุรัสโดยไม่เสียภาพ
 */
function Artwork({
  videoId,
  palette,
  accent,
  round = 22,
}: {
  videoId: string;
  palette: ArtPalette;
  accent: string;
  /** รัศมีมุมเป็นพิกเซล — ปกเล็กในทรงนอนต้องมุมมนน้อยกว่า ไม่งั้นดูเป็นวงกลม */
  round?: number;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      className="relative aspect-square w-full overflow-hidden"
      style={{
        borderRadius: round,
        background: palette.soft,
        boxShadow: `inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 0 44px -8px ${palette.glow}`,
        transition: "background 600ms ease, box-shadow 600ms ease",
      }}
    >
      {!broken ? (
        <>
          {/* พื้นหลังเบลอ — ใช้ไฟล์ mq ตัวเดียวกับที่ดูดสีไปแล้ว ไม่โหลดเพิ่ม
              และเป็นภาพนิ่ง ไม่ได้ขยับ เบราว์เซอร์จึงแรสเตอร์ครั้งเดียวแล้วแคชไว้ */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(videoId, "mq")}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            decoding="async"
            className="absolute inset-0 h-full w-full scale-125 object-cover"
            style={{ filter: "blur(18px) saturate(1.4)", opacity: 0.75 }}
          />
          <span
            className="absolute inset-0"
            style={{ background: "rgb(0 0 0 / 0.28)" }}
          />
          {/*
            รูปคมชัด — hq (480x360) มีทุกคลิปเสมอ ต่างจาก maxres ที่บางคลิปไม่มี
            ไฟล์เป็น 4:3 ที่มีขอบดำบนล่าง พอวางในกรอบ 16:9 แล้วสั่ง object-cover
            ส่วนที่ถูกเฉือนออกคือขอบดำนั้นพอดี ได้ภาพเต็มโดยไม่ต้องคำนวณสเกลเอง
          */}
          <span className="absolute inset-x-0 top-1/2 block aspect-video w-full -translate-y-1/2 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(videoId, "hq")}
              alt=""
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              width={340}
              height={191}
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          </span>
        </>
      ) : (
        // บนสตรีมห้ามเห็นไอคอนรูปแตก โหลดไม่ได้ก็เหลือสัญลักษณ์เล่นบนพื้นสี
        <span
          className="absolute inset-0 grid place-items-center text-4xl"
          style={{ color: accent, opacity: 0.5 }}
        >
          ▶
        </span>
      )}
    </div>
  );
}

/**
 * ช่องปกตอนยังไม่มีเพลง — เส้นกราฟเสียงเต้นอยู่บนพื้นเทา
 *
 * ต้องเป็น "รออยู่" ไม่ใช่ "พัง" คนดูที่เห็นกล่องเทานิ่งสนิทจะคิดว่าระบบค้าง
 * เส้นที่ยังเต้นบอกว่าป้ายยังมีชีวิต แค่ยังไม่มีใครขอเพลง
 * (ใช้ .eq-bar ตัวเดียวกับ widget แถบยาว — CSS ล้วน ไม่มี JS ขยับต่อเฟรม)
 */
function IdleArt({ accent, round }: { accent: string; round: number }) {
  return (
    <div
      className="relative grid aspect-square w-full place-items-center overflow-hidden"
      style={{
        borderRadius: round,
        background: NEUTRAL_PALETTE.soft,
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.07)",
      }}
    >
      <span className="flex h-8 items-end gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="eq-bar block h-full w-1 rounded-full"
            style={{
              background: accent,
              opacity: 0.32,
              animationDelay: `${i * 150}ms`,
              animationDuration: `${1400 + (i % 3) * 260}ms`,
            }}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * แถบเวลา — เส้นบางเต็มความกว้าง แล้วเวลาตัวเล็กอยู่ใต้เส้นคนละมุม
 *
 * ไม่มีพื้นเป็นของตัวเอง เพราะนั่งอยู่ในแผ่นชื่อเพลงแล้ว
 *
 * ซ่อนทั้งก้อนถ้ายังไม่รู้ความยาวคลิป (ตัวเล่นเป็นคนบอก อาจมาช้ากว่ารูป
 * หรือเป็นใบเก่าก่อนมีฟิลด์นี้) โชว์ 0:00 ค้างไว้ดูเหมือนพังมากกว่า
 */
function Progress({ song, palette }: { song: SongRequest; palette: ArtPalette }) {
  const now = useNow(1000);
  const p = playbackProgress(song, now);
  if (!p) return null;

  return (
    <div className="mt-3">
      <span
        className="relative block h-0.5 overflow-hidden rounded-full"
        style={{ background: "rgb(255 255 255 / 0.18)" }}
      >
        <span
          className="bar-run absolute inset-0 rounded-full"
          style={{
            background: palette.tint,
            animationDuration: `${p.duration}s`,
            // เริ่มแอนิเมชันกลางทางให้ตรงกับเพลงที่เล่นไปแล้ว
            animationDelay: p.delay,
            // ใช้เฉพาะตอนผู้ใช้ปิดแอนิเมชัน แถบจะค้างที่ตำแหน่งจริงแทน
            ["--at" as string]: p.ratio.toFixed(3),
          }}
        />
      </span>

      <div className="mt-1.5 flex justify-between">
        <span className="num text-[11px] text-white/70">{formatClock(p.elapsed)}</span>
        <span className="num text-[11px] text-white/35">{formatClock(p.duration)}</span>
      </div>
    </div>
  );
}

/**
 * ดูดสีจากปกเพลง
 *
 * เริ่มที่สีกลางเสมอ แล้วค่อยเปลี่ยนเมื่อรูปโหลดเสร็จ — ถ้าฝืนรอสีก่อนค่อยวาด
 * จะเห็นการ์ดว่างแวบหนึ่งทุกครั้งที่เปลี่ยนเพลง ซึ่งบนสตรีมสะดุดตากว่าสีที่ค่อยๆ ไล่
 */
function useArtPalette(videoId: string | null): ArtPalette {
  const [loaded, setLoaded] = useState<ArtPalette | null>(null);

  useEffect(() => {
    if (!videoId) return;
    const ac = new AbortController();
    void loadArtPalette(thumbUrl(videoId, "mq"), ac.signal).then((p) => {
      if (!ac.signal.aborted) setLoaded(p);
    });
    // เพลงเปลี่ยนก่อนรูปเก่าโหลดเสร็จ ต้องทิ้งผลเก่า ไม่งั้นสีจะมาทับของเพลงใหม่
    return () => ac.abort();
  }, [videoId]);

  /*
    ไม่มีเพลง = สีเทาเสมอ ไม่ค้างสีของเพลงที่เพิ่งจบ

    แต่ระหว่างที่เปลี่ยนเพลงแล้วสีใหม่ยังโหลดไม่เสร็จ ให้ค้างสีเดิมไว้ก่อน
    ถ้าเด้งกลับไปเทาแล้วค่อยเข้าสีใหม่ จะเห็นเทาแวบหนึ่งทุกครั้งที่เปลี่ยนเพลง
    ซึ่งบนสตรีมสะดุดตากว่าการไล่สีจากของเก่าไปของใหม่
  */
  return videoId ? (loaded ?? NEUTRAL_PALETTE) : NEUTRAL_PALETTE;
}
