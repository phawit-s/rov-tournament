"use client";

import { useEffect, useState } from "react";
import { useHashParam } from "@/hooks/useClient";
import { useWidgetOptions } from "@/hooks/useWidgetOptions";
import { hasBackend } from "@/lib/backend/firebase";
import { fetchChannelOnce, watchChannel } from "@/lib/channel/store";
import { fetchOpenSongQueue, fetchPlayingSong, splitQueue, watchSongQueue } from "@/lib/song/store";
import type { SongRequest } from "@/lib/song/types";
import NowPlayingCard, {
  BAR_NEXT_LIMIT,
  NowPlayingBar,
  type CardShape,
} from "@/components/widget/NowPlayingCard";
import WidgetShell, { WidgetHint } from "@/components/widget/WidgetShell";

/** รอเซิร์ฟเวอร์นานเท่านี้แล้วยังเงียบ ถือว่าต่อไม่ติด — เน็ตช้าปกติตอบไม่เกินไม่กี่วินาที */
const STALL_MS = 15_000;

/**
 * สายสดของ SDK เงียบนานเท่านี้ เริ่มถามผ่าน REST เป็นระยะแทน (เหตุผลใน lib/backend/firestore-rest.ts)
 * สั้นกว่า STALL_MS พอให้ทางสำรองตอบทันก่อนป้าย "ต่อไม่ได้" จะโผล่
 */
const FALLBACK_MS = 6_000;

/**
 * ทางสำรองถามแค่ "เพลงที่กำลังเล่น" ทุกเท่านี้ — กินโควตาอ่าน 1 ครั้งต่อรอบ
 *
 * ★ ห้ามกลับไปดึงทั้งคิวถี่ๆ ★ รุ่นแรก (ต.ค. 2569) ดึงทั้งคิวทุก 5 วิ — ทุกรอบกินเท่าจำนวนเพลง
 * ในคิว (รวมเพลงสำรอง) คูณจำนวน widget ที่เปิดใน TikTok Studio คูณจำนวนช่อง
 * ผลคือโควตาอ่านฟรีวันละ 50,000 ครั้งหมดในชั่วโมงกว่าๆ แล้วทั้งเว็บอ่านอะไรไม่ได้จนข้ามวัน
 */
const PLAYING_POLL_MS = 15_000;

/**
 * ดึงทั้งคิว (กินเท่าจำนวนเพลง) แค่ทุกเท่านี้ หรือทันทีที่เพลงที่กำลังเล่นเปลี่ยน
 * คิวถัดไปบนป้ายจึงช้าได้ไม่เกินสองนาทีตอนคนขอเพิ่ม — ยอมได้สำหรับทางสำรอง
 * ราว 4 + (จำนวนเพลง ÷ 2) ครั้งต่อนาทีต่อ widget แทน 12 × จำนวนเพลง ของรุ่นแรก
 */
const FULL_POLL_MS = 120_000;

/** ล้มติดกันก็ถอยห่างขึ้นเรื่อยๆ ไม่ยิงซ้ำรัวๆ ใส่ฐานข้อมูลที่กำลังมีปัญหา (เช่นโควตาหมด) */
const MAX_BACKOFF_MS = 5 * 60_000;

/** อ้างอิงคงที่ ไม่งั้นคิวว่างจะเป็นอาร์เรย์ใหม่ทุกเรนเดอร์แล้ววนไม่จบ */
const EMPTY: SongRequest[] = [];

/** ของที่ได้จากทางสำรอง (REST) */
type RestFeed = {
  channelId: string;
  /** มีช่องนี้ไหม — null = ยังถามไม่สำเร็จสักครั้ง */
  found: boolean | null;
  queue: SongRequest[];
  /** ครั้งล่าสุดล้มเพราะอะไร — โชว์บนป้าย "ต่อไม่ได้" ไว้ไล่สาเหตุ */
  error: string | null;
};

/** ชื่อกับรุ่นของเบราว์เซอร์แบบสั้น — แอปที่ฝังเบราว์เซอร์ไว้มักใช้รุ่นเก่า บอกไว้ช่วยไล่สาเหตุ */
function browserTag(): string {
  if (typeof navigator === "undefined") return "";
  const m = navigator.userAgent.match(/(Chrome|Firefox|Version)\/(\d+)/);
  return m ? `${m[1] === "Version" ? "Safari" : m[1]} ${m[2]}` : "";
}

/**
 * เพลงที่กำลังเล่นกับคิวถัดไป สำหรับวางค้างไว้บนสตรีม
 *
 * มีสามทรงให้เลือก (หน้าตาอยู่ใน NowPlayingCard ไฟล์นี้คุมแค่ข้อมูลกับสถานะ)
 *   - แถบยาว (ค่าเริ่มต้น) 620x300 — เห็นคิวถัดไปสามเพลง เหมาะวางขอบล่างจอ
 *   - การ์ดสูง (?card=1) 380x530 — ปกใหญ่ ย้อมสีตามปก มีแถบเวลา เหมาะวางข้างจอ
 *   - การ์ดนอน (?card=wide) 500x160 — ปกอยู่ข้างชื่อเพลง เหมาะวางมุมบน/ล่าง
 *
 * ลิงก์: /widget/song/?ch=รหัสช่อง (หรือ #ch=)
 * widget ตัวนี้ไม่ได้ล็อกอิน จึงขอเฉพาะเพลงที่ยังไม่จบ (onlyOpen)
 * ให้ตรงกับสิทธิ์อ่านสาธารณะใน firestore.rules
 *
 * เรื่องความเบา — widget ค้างอยู่บนจอตลอดไลฟ์ บนเครื่องที่กำลังเข้ารหัสวิดีโอ
 * ทุกเปอร์เซ็นต์ซีพียูที่กินไปคือเฟรมที่คนดูเสียไป จึงตั้งใจ:
 *   1. ไม่มีแอนิเมชันที่ขับด้วย JS เลย ใช้ CSS keyframes ที่แตะแค่ transform
 *      ซึ่งเบราว์เซอร์ยกไปให้ compositor ทำคนละเธรด ไม่กวน main thread
 *   2. ไม่มี blur หรือ box-shadow ที่ "ขยับ" — สองอันนั้นบังคับวาดใหม่ทุกเฟรม
 *      (ปกจัตุรัสมีเบลอเป็นพื้นหลังรูป แต่เป็นภาพนิ่ง แรสเตอร์ครั้งเดียวแล้วแคช)
 *   3. ไม่มี layout animation ที่ต้องวัดตำแหน่งกล่องใหม่ (บังคับ reflow)
 *   4. แถบยาวรีเรนเดอร์เฉพาะตอนคิวเปลี่ยน ส่วนทรงการ์ดมีตัวเลขเวลาที่ขยับ
 *      วินาทีละครั้ง แยกไว้ในคอมโพเนนต์ย่อยจนรีเรนเดอร์แค่ข้อความสองคำ
 */
export default function SongWidget() {
  const channelId = useHashParam("ch");
  const { accent } = useWidgetOptions();
  /* ?card=1 (หรือ card=tall) = การ์ดสูง · ?card=wide = การ์ดนอน · ไม่ใส่ = แถบยาว
     รับ "1" ด้วยเพราะเป็นค่าที่แจกไปตั้งแต่ก่อนมีทรงนอน ลิงก์เก่าต้องไม่พัง */
  const cardParam = useHashParam("card");
  const shape: CardShape | null =
    cardParam === "wide" ? "wide" : cardParam === "1" || cardParam === "tall" ? "tall" : null;
  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);
  /**
   * มีช่องนี้อยู่จริงไหม — null = ยังไม่รู้
   *
   * รหัสช่องผิดกับคิวว่างให้ผลหน้าตาเหมือนกันเป๊ะ คือไม่มีอะไรโผล่มาเลย
   * ซึ่งเป็นสาเหตุอันดับต้นๆ ของ "widget หน้าขาว" — คนตั้งค่าคัดลอกรหัสมาไม่ครบ
   * หรือใช้รหัสช่องเก่าที่ลบไปแล้ว แล้วไม่มีอะไรบอกให้รู้เลยสักตัว
   */
  const [channelFound, setChannelFound] = useState<boolean | null>(null);
  /**
   * อ่านคิวไม่สำเร็จเพราะอะไร — null = ไม่มีปัญหา
   *
   * เดิมกลืนไว้เงียบๆ แล้วปล่อยให้คิวว่าง ผลคือจอขาวโดยไม่มีอะไรบอกสาเหตุเลย
   * ซึ่งแยกไม่ออกจาก "ยังไม่มีเพลง" — ทั้งที่คนละเรื่องกันคนละขั้ว
   * (ส่วนขยายกันโฆษณาบางตัวบล็อก googleapis.com, เน็ตองค์กรบล็อก, กติกาเปลี่ยน)
   */
  const [queueError, setQueueError] = useState<string | null>(null);
  /**
   * รอเซิร์ฟเวอร์นานเกินไปแล้ว — ตอนต่อไม่ได้ SDK ไม่โยน error ให้ แค่ตอบจากแคชเงียบๆ
   * (watchChannel ไม่เชื่อคำตอบนั้น channelFound จึงค้างเป็น null) ไม่จับเวลาไว้
   * widget จะเป็นการ์ดเทาว่างๆ ไปตลอดโดยไม่มีอะไรบอกว่าต่อไม่ติด
   */
  const [stalledFor, setStalledFor] = useState<string | null>(null);
  /**
   * ของจากทางสำรอง — null = ไม่ได้ใช้ (สายสดตอบเองได้ หรือยังไม่ถึงเวลา)
   * แยกจาก queue ของ SDK เพราะตอนต่อไม่ติด SDK ยังส่งคิวว่างจากแคชมาเรื่อยๆ จะทับของจริง
   */
  const [rest, setRest] = useState<RestFeed | null>(null);

  useEffect(() => {
    if (!channelId) return;
    /** SDK ได้คำตอบจากเซิร์ฟเวอร์แล้ว = สายสดใช้ได้ เลิกถามทางสำรอง */
    let live = false;
    let stopped = false;
    let poll = 0;

    const stopQueue = watchSongQueue(
      channelId,
      (list, fromCache) => {
        setQueue(list);
        if (!fromCache && !live) {
          live = true;
          window.clearTimeout(poll);
          setRest(null);
        }
      },
      {
        onlyOpen: true,
        onError: (e) => {
          setQueue(EMPTY);
          setQueueError(e.message || "อ่านคิวไม่ได้");
        },
      },
    );
    const stopChannel = watchChannel(
      channelId,
      (c) => setChannelFound(!!c),
      // อ่านไม่ได้ (เน็ต/สิทธิ์) ไม่ใช่ "ไม่มีช่อง" — อย่าไปกล่าวหาว่ารหัสผิด
      () => setChannelFound(true),
    );
    const stall = window.setTimeout(() => setStalledFor(channelId), STALL_MS);

    /*
      ทางสำรอง — สายสดเงียบเกิน FALLBACK_MS ก็ถามผ่าน REST เป็นระยะจนกว่าสายสดจะกลับมา
      ถามช่องครั้งเดียวพอ (มี/ไม่มีไม่เปลี่ยนระหว่างไลฟ์)
      ทุกรอบถามแค่เพลงที่กำลังเล่น (1 read) — ทั้งคิวดึงตามรอบ FULL_POLL_MS หรือตอนเพลงเปลี่ยน
      (เพลงเปลี่ยน = คิวขยับ ลำดับถัดไปต้องใหม่ ส่วนเพลงเดิมแค่แทนใบเดิมด้วยของใหม่
       เพราะตัวเล่นเขียนความยาวเพลงลงใบหลังเริ่มเล่น แถบเวลาบนการ์ดใช้ค่านั้น)
      ล้มครั้งไหนเก็บคิวล่าสุดไว้ ไม่ล้างจอทิ้งเพราะเน็ตสะดุดครั้งเดียว
    */
    let found: boolean | null = null;
    let lastFull = 0;
    let playingId: string | null = null;
    let failures = 0;
    const pull = async () => {
      let queue: SongRequest[] | null = null;
      let playing: SongRequest | null = null;
      let error: string | null = null;
      try {
        if (found === null) found = (await fetchChannelOnce(channelId)) !== null;
        if (!found) {
          queue = EMPTY;
        } else {
          let full = Date.now() - lastFull >= FULL_POLL_MS;
          if (!full) {
            playing = await fetchPlayingSong(channelId);
            full = (playing?.id ?? null) !== playingId;
          }
          if (full) {
            queue = await fetchOpenSongQueue(channelId);
            lastFull = Date.now();
            playingId = queue.find((s) => s.status === "playing")?.id ?? null;
            playing = null;
          }
        }
        failures = 0;
      } catch (e) {
        error = (e as Error).message || "อ่านไม่ได้";
        failures += 1;
      }
      if (stopped || live) return;
      setRest((prev) => {
        const before = prev?.channelId === channelId ? prev.queue : EMPTY;
        const fresh = playing;
        return {
          channelId,
          found,
          queue: queue ?? (fresh ? before.map((s) => (s.id === fresh.id ? fresh : s)) : before),
          error,
        };
      });
      // ไม่มีช่องนี้ก็ไม่ต้องถามต่อ ป้าย "ไม่พบช่องนี้" ค้างไว้อย่างนั้น
      if (found === false) return;
      const wait = failures
        ? Math.min(MAX_BACKOFF_MS, PLAYING_POLL_MS * 2 ** (failures - 1))
        : PLAYING_POLL_MS;
      poll = window.setTimeout(pull, wait);
    };
    poll = window.setTimeout(pull, FALLBACK_MS);

    return () => {
      stopped = true;
      stopQueue();
      stopChannel();
      window.clearTimeout(stall);
      window.clearTimeout(poll);
    };
  }, [channelId]);

  const fallback = rest?.channelId === channelId ? rest : null;
  // ทางสำรองถามสำเร็จแล้วอย่างน้อยครั้งหนึ่ง — โชว์ของจากทางนั้นแทนของ SDK ที่ค้างอยู่
  const viaRest = fallback !== null && fallback.found !== null;
  const found = channelFound ?? fallback?.found ?? null;

  // ทางไหนตอบเรื่องช่องก็นับว่าต่อติด ป้ายหายเองโดยไม่ต้องรีเฟรช source
  const stalled = stalledFor === channelId && found === null;

  const { playing, queued } = splitQueue(viaRest ? fallback.queue : queue);
  const next = queued.slice(0, BAR_NEXT_LIMIT);

  if (!channelId) {
    return (
      <WidgetShell>
        <WidgetHint setup title="ยังไม่รู้ว่าจะฟังคิวของช่องไหน">
          เติม <code>?ch=รหัสช่อง</code> ท้ายลิงก์ widget เช่น{" "}
          <code>/widget/song/?ch=abc123</code> หรือคัดลอกลิงก์ใหม่จากหน้า “ลิงก์สำหรับ OBS”
          ในสตูดิโอ
        </WidgetHint>
      </WidgetShell>
    );
  }

  /*
    ต่อฐานข้อมูลไม่ได้เลย — อาการจะเหมือนจอขาวเปล่าทุกประการ
    ต้องบอกให้รู้ ไม่งั้นคนเปิดจะไปไล่แก้ผิดจุด (นึกว่าลิงก์ผิดหรือ widget พัง)
  */
  if (!hasBackend || (queueError && !viaRest) || stalled) {
    return (
      <WidgetShell>
        <WidgetHint setup title="ต่อฐานข้อมูลไม่ได้">
          {!hasBackend
            ? "เว็บชุดนี้ถูกสร้างมาโดยไม่มีค่าเชื่อมต่อฐานข้อมูล จึงอ่านคิวไม่ได้เลย"
            : queueError
              ? `อ่านคิวไม่สำเร็จ (${queueError})`
              : `รอเซิร์ฟเวอร์ตอบเกิน ${STALL_MS / 1000} วินาทีแล้ว ลิงก์ไม่ได้ผิด แต่เครื่องนี้ต่อฐานข้อมูลไม่ติด`}
          <br />
          ถ้าเครื่องอื่นเปิดได้แต่เครื่องนี้ไม่ได้ ลองปิดส่วนขยายกันโฆษณาเฉพาะเว็บนี้
          หรือเปลี่ยนเครือข่าย (บางที่บล็อก googleapis.com)
          {/* รายละเอียดไว้ไล่สาเหตุ — แอปที่ฝังเบราว์เซอร์ (TikTok LIVE Studio ฯลฯ) เปิด console ดูไม่ได้ */}
          {fallback?.error && (
            <span className="mt-1 block text-[13px] opacity-75">
              ทางสำรองก็ไม่ผ่าน: {fallback.error}
              {browserTag() && ` · ${browserTag()}`}
            </span>
          )}
        </WidgetHint>
      </WidgetShell>
    );
  }

  // รหัสช่องมีมาแต่ไม่มีช่องนั้นจริง = ตั้งค่าผิด บอกให้รู้แทนที่จะปล่อยจอว่าง
  if (found === false) {
    return (
      <WidgetShell>
        <WidgetHint setup title="ไม่พบช่องนี้">
          ไม่มีช่องรหัส <code>{channelId}</code> ในระบบ คัดลอกลิงก์ใหม่จากหน้า
          “ลิงก์สำหรับ OBS” ในสตูดิโออีกครั้ง (รหัสอาจขาดหายตอนคัดลอก
          หรือเป็นช่องที่ถูกลบไปแล้ว)
        </WidgetHint>
      </WidgetShell>
    );
  }

  /* ทรงการ์ดอยู่ประจำที่บนจอ ตอนคิวว่างจึงค้างไว้เป็นการ์ดรอ
     ดีกว่าหายวับไปแล้วเหลือรูโหว่ตรงมุมที่คนดูเคยเห็นป้าย
     (ต่างจากแถบยาวด้านล่างที่ตั้งใจให้หายไปเลย เพราะกินพื้นที่กว้าง) */
  if (shape) {
    return (
      <WidgetShell>
        <NowPlayingCard
          song={playing}
          shape={shape}
          accent={accent}
          queuedCount={queued.length}
        />
      </WidgetShell>
    );
  }

  /* แถบยาวค้างอยู่บนจอตลอดเวลา ตอนคิวว่างจึงต้องหายไปเลย ไม่ใช่โชว์กล่องเปล่า
     ยกเว้นโหมดพรีวิวในหน้าแจกลิงก์ ที่ต้องบอกว่าทำไมกรอบว่าง (บนสตรีม WidgetHint คืน null) */
  if (!playing && next.length === 0) {
    return (
      <WidgetShell>
        <WidgetHint title="ยังไม่มีเพลงในคิว">
          บนจอไลฟ์แถบนี้จะซ่อนตัวเองตอนคิวว่าง แล้วโผล่มาเองเมื่อมีคนขอเพลง
        </WidgetHint>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell>
      <NowPlayingBar
        playing={playing}
        next={next}
        queuedCount={queued.length}
        accent={accent}
      />
    </WidgetShell>
  );
}
