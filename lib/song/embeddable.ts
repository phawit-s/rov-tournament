"use client";

import { YT_STATE, loadYouTubeApi, type YTPlayer } from "./yt-api";

/**
 * ตรวจว่าคลิปนี้ฝังเล่นในเว็บเราได้ไหม ก่อนจะรับเข้าคิว
 *
 * เจ้าของคลิปตั้งค่า "ห้ามฝังในเว็บอื่น" ได้ และ MV ค่ายเพลงไทยจำนวนมากตั้งไว้
 * (สแกนกองสำรองจริงของช่องหนึ่งพบ 37 จาก 89 เพลง) พอเข้าคิวไปแล้วมันเล่นไม่ได้
 * ต้องมาไล่เก็บกวาดทีหลัง — รู้ตั้งแต่ตอนวางลิงก์ดีกว่าเยอะ
 *
 * ทำไมต้องลองโหลดจริง: oEmbed ตอบ 200 เหมือนกันหมดไม่ว่าจะฝังได้หรือไม่ได้
 * (ทดสอบแล้วทั้งคลิปที่เล่นได้และคลิปที่ติดรหัส 150) ส่วน Data API ที่มีฟิลด์
 * embeddable ตรงๆ ต้องใช้คีย์ซึ่งเว็บ static เก็บไม่ได้ จึงเหลือทางเดียวคือ
 * โยนให้ตัวเล่นซ่อนลองโหลดแล้วดูว่าเกิดอะไรขึ้น
 *
 * ถูกกว่าที่คิด — จับเวลาจริงแล้วคลิปที่ห้ามฝังยิง error ที่ ~90 มิลลิวินาที
 * ส่วนคลิปที่เล่นได้ถึงสถานะ "กำลังเล่น" ที่ ~300-450 มิลลิวินาที
 */

export type EmbedCheck =
  /** ฝังเล่นได้ */
  | "ok"
  /** เจ้าของปิดการฝัง หรือคลิปถูกลบ/เป็นส่วนตัว */
  | "blocked"
  /** ตอบไม่ได้ (ตัวเล่นโหลดไม่ขึ้น เน็ตช้า) — ห้ามเอาไปตัดสินว่าใช้ไม่ได้ */
  | "unknown";

/** ตัวเล่นซ่อนตัวเดียวใช้ซ้ำทั้งหน้า สร้างใหม่ทุกครั้งช้าและเปลือง */
let probe: Promise<YTPlayer> | null = null;
/** ตัวรับผลของการตรวจรอบที่กำลังทำอยู่ — ตัวเล่นผูก event ได้ครั้งเดียวตอนสร้าง */
let settle: ((r: EmbedCheck) => void) | null = null;

function getProbe(firstVideoId: string): Promise<YTPlayer> {
  if (probe) return probe;
  probe = loadYouTubeApi().then(
    (YT) =>
      new Promise<YTPlayer>((resolve, reject) => {
        const host = document.createElement("div");
        // ต้องอยู่ใน DOM จริงตัวเล่นถึงทำงาน ซ่อนด้วยการดันออกนอกจอแทน display:none
        host.style.cssText =
          "position:fixed;left:-9999px;top:0;width:200px;height:120px;pointer-events:none";
        document.body.appendChild(host);

        /* ต้องใส่คลิปตั้งแต่ตอนสร้าง — ตัวเล่นที่สร้างมาโดยไม่มีคลิปเลย
           จะไม่ยิง onReady ออกมา แล้วรอไปตลอดกาล */
        const player = new YT.Player(host, {
          height: "120",
          width: "200",
          videoId: firstVideoId,
          playerVars: { autoplay: 1, rel: 0, playsinline: 1, controls: 0 },
          events: {
            onReady: () => {
              player.mute();
              resolve(player);
            },
            onStateChange: (e) => {
              if (e.data === YT_STATE.PLAYING) settle?.("ok");
            },
            onError: () => settle?.("blocked"),
          },
        });
        window.setTimeout(() => reject(new Error("probe-timeout")), 15000);
      }),
  );
  // โหลดตัวเล่นไม่สำเร็จก็ต้องยอมให้ลองใหม่รอบหน้า ไม่ใช่จำความล้มเหลวไว้ตลอด
  probe.catch(() => {
    probe = null;
  });
  return probe;
}

export async function canEmbed(videoId: string, timeoutMs = 4000): Promise<EmbedCheck> {
  if (typeof document === "undefined") return "unknown";
  try {
    const player = await getProbe(videoId);
    return await new Promise<EmbedCheck>((resolve) => {
      let done = false;
      const finish = (r: EmbedCheck) => {
        if (done) return;
        done = true;
        settle = null;
        try {
          player.pauseVideo();
        } catch {
          /* ตัวเล่นอาจถูกถอดไปแล้ว */
        }
        resolve(r);
      };
      settle = finish;
      player.loadVideoById(videoId);
      /* เงียบจนหมดเวลา = ตอบไม่ได้ ไม่ใช่ "ใช้ไม่ได้"
         จากที่วัดมา คลิปทั้งสองแบบตอบภายในครึ่งวินาที ถ้าถึงตรงนี้แปลว่าผิดปกติจริง */
      window.setTimeout(() => finish("unknown"), timeoutMs);
    });
  } catch {
    return "unknown";
  }
}
