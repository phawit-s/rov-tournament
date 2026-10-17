"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useNow } from "@/hooks/useClient";
import { useArtPalette } from "@/hooks/useSong";
import { NEUTRAL_PALETTE, type ArtPalette } from "@/lib/song/artwork";
import { formatClock, isStalePlayback, playbackProgress } from "@/lib/song/progress";
import type { SongRequest } from "@/lib/song/types";
import { thumbUrl } from "@/lib/song/youtube";
import { IDLE_SURFACE, SHELL_PAD, WIDGET_TEXT as T } from "./WidgetShell";

/** ทรงของ widget เพลง — แถบยาว (ค่าเริ่มต้น) การ์ดสูง (?card=1) การ์ดนอน (?card=wide) */
export type WidgetShape = "bar" | "tall" | "wide";
export type CardShape = Exclude<WidgetShape, "bar">;

/*
  ขนาดตัว widget เป็นพิกเซล — เป็นสัญญากับผู้ใช้ ห้ามขยับโดยไม่แก้ SOURCE_SIZE

  ทุกค่าในไฟล์นี้เขียนเป็น px ตรงๆ (text-[15px] mt-[4px]) ไม่ใช้สเกลของ Tailwind
  เพราะสเกลนั้นอิงขนาดตัวอักษรราก ซึ่งเว็บตั้งไว้ 17px เพื่อให้อ่านสบาย
  ถ้าวันหนึ่งใครปรับราก widget จะบวมเกินกรอบใน OBS โดยไม่มีอะไรฟ้อง
  (เคยเกิดแล้ว: แถบยาว w-150 ที่ราก 17px กว้าง 637px ล้นกรอบ 620 ไปเงียบๆ)

  ความสูงคิดจาก line-height ที่ตั้งตายตัว × จำนวนบรรทัดสูงสุด (line-clamp)
  จึงไม่ขึ้นกับฟอนต์ — ฟอนต์มีผลแค่ว่าตัดบรรทัดตรงไหน ไม่ได้ทำให้กล่องสูงขึ้น
*/
const TALL = { w: 340, h: 502 };
const WIDE = { w: 470, h: 130 };
/** สูงสุด 254: ขอบบน 16 + เพลงที่เล่น 102 + แถบเวลา 15 + ช่องไฟ 12 + คิว 3×33 + ขอบล่าง 10 */
const BAR_W = 620 - SHELL_PAD * 2;

/**
 * ขนาด Browser Source ที่แนะนำ (ตัว widget + ขอบ SHELL_PAD สองด้าน)
 * หน้าแจกลิงก์อ่านค่าจากตรงนี้ จะได้ไม่มีตัวเลขสองชุดที่เพี้ยนกันได้
 *   แถบยาว 596×254 → 620×300 (เผื่อความสูงไว้ ลิงก์เดิมตั้ง 300 อยู่แล้ว)
 *   การ์ดสูง 340×502 → 380×530
 *   การ์ดนอน 470×130 → 500×160
 */
export const SOURCE_SIZE: Record<WidgetShape, { w: number; h: number }> = {
  bar: { w: 620, h: 300 },
  tall: { w: 380, h: 530 },
  wide: { w: 500, h: 160 },
};

/** คิวถัดไปที่โชว์บนแถบยาว — มากกว่านี้สูงเกินกรอบ 300 */
export const BAR_NEXT_LIMIT = 3;

/* ---------------------------------------------------------------- สี */

type Rgb = [number, number, number];

/** พื้นเกือบดำที่เอาสีปกมาผสม */
const NIGHT: Rgb = [16, 16, 19];
const WHITE: Rgb = [255, 255, 255];
/**
 * สัดส่วนสีปกในพื้นการ์ด
 *
 * 32% ทำให้พื้นมืดพอที่ตัวหนังสือขาวอ่านออกทุกสีปก — กรณีแย่สุดคือสีสำรอง
 * เป็นขาวล้วน ได้พื้นความสว่าง ~0.11 ขาวล้วนบนนั้น ~6.6:1 ขาว 78% ~4.8:1
 * (ปกเหลืองสดซึ่งสว่างที่สุดในบรรดาสีจัดได้ ~0.09) และยังมีสีพอให้รู้ว่ามาจากปก
 */
const ART_SHARE = 0.32;

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as Rgb;
}

/** อ่านสีที่ lib/song/artwork คืนมา (hsl แบบเว้นวรรค) หรือโค้ดสีจากลิงก์ (#rrggbb) */
function parseColor(value: string): Rgb | null {
  const hsl = value.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  a.map((v, i) => Math.round(v * t + b[i] * (1 - t))) as Rgb;

const rgb = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;

/** พื้นการ์ด + สีของแถบเสียง/แถบเวลา */
type Look = { surface: string; tint: string };

/**
 * เลือกสีของการ์ด — ปกเพลงก่อนเสมอ ไม่มีค่อยใช้สีสำรองจากลิงก์ ไม่มีอีกก็เทา
 *
 * ผสมสีเองแล้วส่งออกเป็น rgb() ไม่ใช้ color-mix() แบบหน้าเวที
 * เพราะเบราว์เซอร์ใน OBS รุ่นที่ยังมีคนใช้ (CEF/Chromium 103) ไม่รู้จัก color-mix
 * พื้นจะหายทั้งใบเหลือตัวหนังสือขาวลอยบนภาพเกม
 *
 * NEUTRAL_PALETTE = ยังโหลดปกไม่เสร็จหรือดูดสีไม่ได้ (เทียบตัวตนได้
 * เพราะ artwork.ts คืนค่าคงที่ตัวเดียวกันทุกกรณี) ให้ถือว่าปกไม่มีสี
 */
function lookOf(palette: ArtPalette | null, accent: string | null): Look {
  const art = palette && palette !== NEUTRAL_PALETTE ? parseColor(palette.glow) : null;
  if (palette && art) return { surface: rgb(mix(art, NIGHT, ART_SHARE)), tint: palette.tint };

  const house = accent ? parseColor(accent) : null;
  if (house) return { surface: rgb(mix(house, NIGHT, ART_SHARE)), tint: rgb(mix(house, WHITE, 0.45)) };

  return { surface: IDLE_SURFACE, tint: T.soft };
}

/**
 * สีของการ์ดตามเพลงที่เล่นอยู่
 *
 * ดูดสีครั้งเดียวตอนเปลี่ยนเพลง (useArtPalette) และระหว่างรอสีใหม่จะค้างสีเดิมไว้
 * พื้นเปลี่ยนสีแบบตัดทันที ไม่มี transition — การไล่สีพื้นต้องวาดกล่องใหม่ทุกเฟรม
 * ซึ่งผิดกติกา "ขยับแค่ transform/opacity" ของ widget และมันเกิดพร้อมจังหวะ
 * ที่เพลงใหม่เลื่อนเข้าอยู่แล้ว ตาจึงอ่านเป็นการเปลี่ยนฉากเดียวกัน
 */
function useLook(song: SongRequest | null, accent: string | null): Look {
  const palette = useArtPalette(song?.videoId);
  return lookOf(song ? palette : null, accent);
}

/**
 * กล่องพื้นของ widget — พื้นทึบย้อมสีปก ไม่มีเงาทอดออกนอกกล่อง
 *
 * พื้นหลัง widget โปร่งใส เงาจึงไม่ได้ตกลงบนอะไร มันแค่ย้อมภาพเกมข้างหลัง
 * เป็นคราบดำฟุ้ง ขอบอ่านออกจากพื้นทึบกับเส้นขาวจางด้านในอยู่แล้ว
 * ไม่มี backdrop-filter ด้วย — ข้างหลังหน้าโปร่งใสไม่มีอะไรให้เบลอ ได้แต่ค่าวาด
 */
function surfaceStyle(look: Look, radius: number, extra?: CSSProperties): CSSProperties {
  return {
    background: look.surface,
    borderRadius: radius,
    boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.1)",
    ...extra,
  };
}

/** บรรทัดคนขอ — เพลงสำรองไม่มีคนขอ อย่าโชว์ชื่อระบบเหมือนเป็นคนดู */
function requestedBy(song: SongRequest): ReactNode {
  if (song.source === "filler") return "เพลงสำรองของช่อง";
  const name = song.byName?.trim();
  if (!name) return null;
  return (
    <>
      ขอโดย{" "}
      <span className="font-medium" style={{ color: T.ink }}>
        {name}
      </span>
    </>
  );
}

/* ---------------------------------------------------------------- การ์ด */

/**
 * การ์ด "กำลังเล่น" สองทรง
 *   tall  340×502 ปกจัตุรัสใหญ่อยู่บน ชื่อเพลงหนาอยู่ล่าง เหมาะวางข้างจอ
 *   wide  470×130 ปกอยู่ข้างชื่อเพลง เตี้ยพอวางมุมบน/ล่างของจอ
 *
 * ความสูงล็อกตายตัวทั้งสองทรง (แถบเวลาชิดล่างเสมอ) ชื่อเพลงสั้นหรือยาว
 * ขอบล่างการ์ดก็อยู่ที่เดิม ไม่กระโดดทับ HUD ของเกมทุกครั้งที่เปลี่ยนเพลง
 *
 * ไม่มีเพลง = การ์ดสีเทา (หรือสีสำรองจากลิงก์) ขนาดเท่าเดิม ค้างไว้รอ
 * ดีกว่าหายวับแล้วเหลือรูโหว่ตรงมุมที่คนดูเคยเห็นป้าย
 *
 * เรื่องความเบา (widget ค้างบนจอตลอดไลฟ์ บนเครื่องที่กำลังเข้ารหัสวิดีโอ):
 *   - แถบเวลาเป็น CSS keyframes ล้วน ไม่มี JS ขยับต่อเฟรม
 *   - มีแค่ตัวเลขเวลาที่อัปเดตวินาทีละครั้ง แยกเป็นคอมโพเนนต์ย่อย (Clock)
 *     รีเรนเดอร์เฉพาะข้อความสองคำ ไม่ลามไปทั้งการ์ด
 *   - ดูดสีจากปกครั้งเดียวตอนเปลี่ยนเพลง ไม่ใช่ทุกเรนเดอร์
 */
export default function NowPlayingCard({
  song,
  shape,
  accent,
  queuedCount,
}: {
  /** null = ยังไม่มีเพลงเล่น */
  song: SongRequest | null;
  shape: CardShape;
  accent: string | null;
  /** เพลงที่รอคิวอยู่ — ใช้บอกในการ์ดรอ ว่าคิวว่างจริงหรือแค่ยังไม่กดเล่น */
  queuedCount: number;
}) {
  const look = useLook(song, accent);
  const tall = shape === "tall";
  const size = tall ? TALL : WIDE;

  /* key ผูกกับเพลง พอเปลี่ยนเพลง React สร้างเนื้อในใหม่ แอนิเมชันเข้าฉากจึงเล่นซ้ำเอง
     ตอนรออยู่ใช้คีย์คงที่ จะได้ไม่ขยับใหม่ทุกครั้งที่คิวเปลี่ยน
     ใช้ widget-enter (ขยับตำแหน่งอย่างเดียว) ไม่ใช่ rise-in ที่เริ่มจาก opacity 0 —
     OBS โหลด source ตอนซีนยังไม่แสดงได้ ถ้านาฬิกาแอนิเมชันค้าง การ์ดจะค้างแบบมองไม่เห็น */
  const key = song?.id ?? "idle";

  const title = (
    <p
      className={`line-clamp-2 font-bold ${tall ? "mt-[14px] text-[22px] leading-[28px]" : "text-[18px] leading-[23px]"}`}
      style={{ color: T.ink }}
    >
      {song ? song.title : "รอเพลงถัดไป"}
    </p>
  );

  const lineClass = `truncate ${tall ? "text-[15px] leading-[22px]" : "text-[15px] leading-[20px]"}`;

  const meta = song ? (
    <>
      {tall && song.author && (
        <p className={`mt-[4px] ${lineClass}`} style={{ color: T.soft }}>
          {song.author}
        </p>
      )}
      <p className={`${tall && song.author ? "" : "mt-[2px]"} ${lineClass}`} style={{ color: T.soft }}>
        {requestedBy(song)}
      </p>
    </>
  ) : (
    <p className={`mt-[4px] ${lineClass}`} style={{ color: T.soft }}>
      {queuedCount > 0 ? `อีก ${queuedCount} เพลงรอเล่นอยู่` : "ยังไม่มีเพลงในคิว"}
    </p>
  );

  const artSize = tall ? TALL.w - 32 : WIDE.h - 24;
  const art = song ? (
    <SquareArt videoId={song.videoId} size={artSize} radius={tall ? 12 : 10} sharp={tall ? "hq" : "mq"} />
  ) : (
    <IdleArt size={artSize} radius={tall ? 12 : 10} big={tall} />
  );

  if (tall) {
    return (
      <div
        className="overflow-hidden p-[16px]"
        style={surfaceStyle(look, 28, { width: size.w, height: size.h })}
      >
        <div key={key} className="widget-enter flex h-full flex-col">
          {art}
          {title}
          {meta}
          {song && (
            <div className="mt-auto">
              <Progress song={song} tint={look.tint} dense={false} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden p-[12px]"
      style={surfaceStyle(look, 20, { width: size.w, height: size.h })}
    >
      <div key={key} className="widget-enter flex h-full gap-[14px]">
        {art}
        <div className={`flex min-w-0 flex-1 flex-col ${song ? "" : "justify-center"}`}>
          {title}
          {meta}
          {song && (
            <div className="mt-auto">
              <Progress song={song} tint={look.tint} dense />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- แถบยาว */

/**
 * แถบยาว 596 กว้าง — เพลงที่กำลังเล่นพร้อมคิวถัดไปสามเพลง เหมาะวางขอบล่างจอ
 *
 * ไม่มีตัวเลขเวลา มีแต่เส้นความคืบหน้าที่วิ่งด้วย CSS ล้วน แถบทั้งแถบจึง
 * รีเรนเดอร์เฉพาะตอนคิวเปลี่ยน ไม่มีอะไรเดินทุกวินาทีเลย
 *
 * หน้าเพจเป็นคนตัดสินว่าจะซ่อนแถบตอนคิวว่าง ตัวนี้ถือว่ามีของให้โชว์เสมอ
 */
export function NowPlayingBar({
  playing,
  next,
  queuedCount,
  accent,
}: {
  playing: SongRequest | null;
  /** คิวถัดไป ตัดเหลือ BAR_NEXT_LIMIT มาแล้ว */
  next: SongRequest[];
  queuedCount: number;
  accent: string | null;
}) {
  const look = useLook(playing, accent);

  return (
    <div className="overflow-hidden px-[16px] pt-[16px] pb-[10px]" style={surfaceStyle(look, 28, { width: BAR_W })}>
      {playing ? (
        <div key={playing.id} className="widget-enter">
          <div className="flex items-center gap-[16px]">
            <VideoArt videoId={playing.videoId} width={160} />
            <div className="min-w-0 flex-1">
              <p
                className="flex h-[20px] items-center gap-[8px] text-[14px] leading-[20px] font-semibold"
                style={{ color: T.soft }}
              >
                <EqBars color={look.tint} />
                กำลังเล่น
                {queuedCount > 0 && (
                  <span className="num ml-auto font-normal" style={{ color: T.soft }}>
                    รออีก {queuedCount} เพลง
                  </span>
                )}
              </p>
              {/* ชื่อคลิปยาวได้ถึง 140 ตัว ตัดสองบรรทัดคุมความสูงได้แน่นอนกว่าตัววิ่ง */}
              <p className="mt-[4px] line-clamp-2 text-[21px] leading-[27px] font-bold" style={{ color: T.ink }}>
                {playing.title}
              </p>
              <p className="mt-[3px] truncate text-[15px] leading-[21px]" style={{ color: T.soft }}>
                {requestedBy(playing)}
              </p>
            </div>
          </div>
          <RunBar
            key={`${playing.id}:${playing.playedAt ?? ""}:${playing.duration ?? 0}`}
            song={playing}
            tint={look.tint}
            height={3}
            className="mt-[12px]"
          />
        </div>
      ) : (
        <p className="text-[20px] leading-[26px] font-bold" style={{ color: T.ink }}>
          คิวถัดไป{" "}
          <span className="num font-normal" style={{ color: T.faint }}>
            {queuedCount}
          </span>
        </p>
      )}

      {next.length > 0 && (
        <ol className={playing ? "mt-[12px]" : "mt-[6px]"}>
          {next.map((song, i) => (
            <li
              key={song.id}
              /* แถวที่เพิ่งเข้ามาเลื่อนขึ้นเอง แถวที่อยู่แล้วไม่ขยับ (key เดิม React ไม่สร้างใหม่) */
              className="widget-enter flex h-[33px] items-center gap-[12px]"
              style={{ borderTop: `1px solid ${T.line}` }}
            >
              <span className="num w-[18px] shrink-0 text-[15px] font-semibold" style={{ color: T.faint }}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[22px] font-medium" style={{ color: T.ink }}>
                {song.title}
              </span>
              <span className="max-w-[150px] shrink-0 truncate text-[14px] leading-[22px]" style={{ color: T.soft }}>
                {song.source === "filler" ? "เพลงสำรอง" : song.byName}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- ชิ้นส่วน */

/** บนสตรีมห้ามเห็นไอคอนรูปแตก โหลดไม่ได้ก็เหลือสัญลักษณ์เล่นบนพื้นจาง */
function BrokenArt({ big }: { big: boolean }) {
  return (
    <span
      className={`absolute inset-0 grid place-items-center ${big ? "text-[40px]" : "text-[22px]"}`}
      style={{ color: T.faint }}
    >
      ▶
    </span>
  );
}

/**
 * ปกทรงจัตุรัส
 *
 * ปก YouTube เป็น 16:9 ถ้าครอบเป็นจัตุรัสตรงๆ จะเฉือนซ้ายขวาหายไปเกือบครึ่ง
 * (หน้าคนในมิวสิกวิดีโอมักโดนตัด) จึงวางรูปเดิมเบลอเต็มกรอบเป็นพื้นหลัง
 * แล้ววางรูปคมชัดเต็มความกว้างทับตรงกลาง — ได้กรอบจัตุรัสโดยไม่เสียภาพ
 *
 * เบลอเป็นภาพนิ่ง เบราว์เซอร์แรสเตอร์ครั้งเดียวแล้วแคชไว้
 * (ที่ห้ามคือเบลอ "ที่ขยับ" ซึ่งบังคับวาดใหม่ทุกเฟรม)
 *
 * ขยาย/เลื่อนด้วย style transform ตรงๆ ไม่ใช้คลาส scale-/translate- ของ Tailwind v4
 * ซึ่งออกมาเป็นพร็อพ `scale` / `translate` แยก ที่ Chromium ก่อน 104 (OBS รุ่นเก่า) ไม่รู้จัก
 */
function SquareArt({
  videoId,
  size,
  radius,
  sharp,
}: {
  videoId: string;
  size: number;
  radius: number;
  /**
   * ไฟล์รูปคมชัด — hq (480×360) สำหรับปกใหญ่ มีทุกคลิปเสมอ ต่างจาก maxres
   * ปกเล็กใช้ mq ไฟล์เดียวกับพื้นเบลอและที่ดูดสี ไม่ต้องโหลดเพิ่ม
   */
  sharp: "hq" | "mq";
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, background: "rgb(255 255 255 / 0.08)" }}
    >
      {broken ? (
        <BrokenArt big={size > 200} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(videoId, "mq")}
            alt=""
            aria-hidden
            referrerPolicy="no-referrer"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: "blur(18px) saturate(1.4)", opacity: 0.75, transform: "scale(1.25)" }}
          />
          <span className="absolute inset-0" style={{ background: "rgb(0 0 0 / 0.28)" }} />
          {/*
            ไฟล์ hq เป็น 4:3 ที่มีขอบดำบนล่าง พอวางในกรอบ 16:9 แล้วสั่ง object-cover
            ส่วนที่ถูกเฉือนออกคือขอบดำนั้นพอดี ได้ภาพเต็มโดยไม่ต้องคำนวณสเกลเอง
          */}
          <span
            className="absolute inset-x-0 top-1/2 block aspect-video w-full overflow-hidden"
            style={{ transform: "translateY(-50%)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(videoId, sharp)}
              alt=""
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              width={size}
              height={Math.round((size * 9) / 16)}
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          </span>
        </>
      )}
    </div>
  );
}

/** ปกทรง 16:9 แบบเดียวกับแถวเพลงในเว็บ — ใช้ในแถบยาว */
function VideoArt({ videoId, width }: { videoId: string; width: number }) {
  const [broken, setBroken] = useState(false);
  const height = Math.round((width * 9) / 16);

  return (
    <span
      className="relative block shrink-0 overflow-hidden"
      style={{ width, height, borderRadius: 10, background: "rgb(255 255 255 / 0.08)" }}
    >
      {broken ? (
        <BrokenArt big={false} />
      ) : (
        // hq มีขอบดำบนล่าง object-cover ในกรอบ 16:9 เฉือนขอบนั้นทิ้งพอดี
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(videoId, "hq")}
          alt=""
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          width={width}
          height={height}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}

/**
 * ช่องปกตอนยังไม่มีเพลง — แท่งเสียงนิ่งบนพื้นจาง
 *
 * ตั้งใจให้แท่งไม่เต้น แท่งที่เต้นแปลว่า "กำลังเล่นอยู่" (docs/DESIGN.md ข้อ 5)
 * ถ้ามันเต้นตอนไม่มีเพลง คนดูจะถามว่าทำไมไม่มีเสียง
 */
function IdleArt({ size, radius, big }: { size: number; radius: number; big: boolean }) {
  return (
    <div
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: radius, background: "rgb(255 255 255 / 0.06)" }}
    >
      <span className="flex items-end" style={{ height: big ? 40 : 22, gap: big ? 6 : 3 }} aria-hidden>
        {[40, 75, 55, 90, 50].map((h, i) => (
          <span
            key={i}
            className="block rounded-full"
            style={{ width: big ? 6 : 3, height: `${h}%`, background: "rgb(255 255 255 / 0.28)" }}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * แถบเสียงเต้นสามแท่ง — บอกว่ากำลังเล่นอยู่จริง ไม่ใช่ค้างอยู่ที่เพลงเก่า
 * ขับด้วย .eq-bar (CSS keyframes ที่แตะแค่ transform: scaleY) ไม่มี JS เดินเบื้องหลัง
 */
function EqBars({ color, height = 14 }: { color: string; height?: number }) {
  return (
    <span className="inline-flex shrink-0 items-end" style={{ height, gap: 2 }} aria-hidden>
      {[0, 0.25, 0.5].map((d) => (
        <span
          key={d}
          className="eq-bar block h-full rounded-full"
          style={{ width: 3, background: color, animationDelay: `${d}s` }}
        />
      ))}
    </span>
  );
}

/**
 * แถบเวลา + แถบเสียง + ตัวเลขเวลา (ทรงการ์ด)
 *
 * แถบเสียงอยู่บรรทัดเดียวกับเวลา แทนที่จะมีป้าย "กำลังเล่น" อีกบรรทัด
 * — ประหยัดความสูงจนการ์ดสูงยังอยู่ในกรอบ 530 ได้ และอ่านเป็น "เล่นอยู่ที่ 1:23"
 */
function Progress({ song, tint, dense }: { song: SongRequest; tint: string; dense: boolean }) {
  return (
    <>
      <RunBar
        key={`${song.id}:${song.playedAt ?? ""}:${song.duration ?? 0}`}
        song={song}
        tint={tint}
        height={4}
      />
      <div
        className={`num flex items-center gap-[8px] ${
          dense ? "mt-[6px] h-[18px] text-[13px] leading-[18px]" : "mt-[8px] h-[20px] text-[14px] leading-[20px]"
        }`}
      >
        <EqBars color={tint} height={dense ? 12 : 14} />
        <Clock song={song} />
      </div>
    </>
  );
}

/**
 * เส้นความคืบหน้าของเพลง — วิ่งด้วย .bar-run ล้วน ไม่มี JS ขยับสักเฟรม
 *
 * ★ คิดตำแหน่งเริ่มครั้งเดียวตอนสร้าง แล้วห้ามแก้ animation-delay อีก ★
 * เบราว์เซอร์ถือว่าค่าที่แก้กลางทาง "ใช้มาตั้งแต่ต้น" — ถ้าเลื่อน delay ตาม
 * เวลาที่ผ่านไปทุกวินาที แถบจะนับเวลาซ้ำสองรอบแล้ววิ่งเร็วเป็นสองเท่า
 * (ทดสอบแล้ว: ผ่านไป 4 วินาที แถบนำไป 4 วินาที) จึงให้ผู้เรียกใส่ key
 * ที่เปลี่ยนเฉพาะตอนเพลง/เวลาเริ่ม/ความยาวเปลี่ยน แล้วเก็บค่าแรกไว้ใน state
 *
 * ซ่อนไปเลยถ้ายังไม่รู้ความยาวคลิป (ตัวเล่นเป็นคนบอก อาจมาช้ากว่ารูป
 * หรือเป็นใบเก่าก่อนมีฟิลด์นี้) — พอความยาวมาถึง key เปลี่ยน แถบก็โผล่เอง
 */
function RunBar({
  song,
  tint,
  height,
  className = "",
}: {
  song: SongRequest;
  tint: string;
  height: number;
  className?: string;
}) {
  const [p] = useState(() =>
    isStalePlayback(song, Date.now()) ? null : playbackProgress(song, Date.now()),
  );
  if (!p) return null;

  return (
    <span
      className={`relative block overflow-hidden rounded-full ${className}`}
      style={{ height, background: "rgb(255 255 255 / 0.2)" }}
    >
      <span
        className="bar-run absolute inset-0 rounded-full"
        style={{
          background: tint,
          animationDuration: `${p.duration}s`,
          animationDelay: p.delay,
          // ใช้เฉพาะตอนผู้ใช้ปิดแอนิเมชัน แถบจะค้างที่ตำแหน่งจริงแทน
          ["--at" as string]: p.ratio.toFixed(3),
        }}
      />
    </span>
  );
}

/** ตัวเลขเวลา — ตัวเดียวที่เดินทุกวินาที แยกออกมาให้รีเรนเดอร์แค่ตรงนี้ */
function Clock({ song }: { song: SongRequest }) {
  const now = useNow(1000);
  const p = playbackProgress(song, now);
  // ค้างสถานะกำลังเล่น (ปิดตัวเล่นไปก่อนเพลงจบ) — ตัวเลข "4:00 / -0:00" ไม่บอกอะไร
  if (!p || isStalePlayback(song, now)) return null;

  return (
    <>
      <span style={{ color: T.soft }}>{formatClock(p.elapsed)}</span>
      <span className="ml-auto" style={{ color: T.soft }}>
        -{formatClock(p.duration - p.elapsed)}
      </span>
    </>
  );
}
