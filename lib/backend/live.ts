"use client";

import { useEffect, useState } from "react";

/**
 * ท่อข้อมูลสดที่ "ใช้ร่วมกัน" ระหว่างทุกหน้าจอที่ขออันเดียวกัน
 *
 * ปัญหาที่แก้: หน้าหลังบ้านหลายหน้าต่างขอ collection เดียวกันพร้อมกัน —
 * หน้าตั้งค่าช่อง หน้ารายการทัวร์ หน้าทัวร์ และหน้าทั้งระบบ ต่างเปิด
 * onSnapshot ของ channels เป็นของตัวเองคนละท่อ กลายเป็นสี่ท่อที่ส่งข้อมูล
 * ชุดเดียวกัน สี่เท่าของทั้งค่าอ่านและงานที่ React ต้องมาเรนเดอร์ใหม่
 *
 * ตัวนี้เก็บท่อไว้ตามคีย์ นับผู้ใช้ และปิดท่อเมื่อคนสุดท้ายเลิกดู
 * ค่าล่าสุดถูกเก็บไว้ด้วย คนที่มาทีหลังจึงได้ข้อมูลทันทีไม่ต้องรอรอบใหม่ —
 * ซึ่งเป็นเหตุผลที่สลับหน้าไปมาในสตูดิโอแล้วรายการไม่กะพริบเป็นค่าว่างอีก
 */
type Feed<T> = {
  value: T;
  /** ยังไม่เคยได้ข้อมูลจริงสักครั้ง — ใช้แยก "ว่างเปล่า" ออกจาก "ยังไม่รู้" */
  loaded: boolean;
  listeners: Set<(value: T, loaded: boolean) => void>;
  stop: (() => void) | null;
  /** เปิดท่อ (หรือเปิดใหม่หลังพัก) */
  start: () => void;
};

const feeds = new Map<string, Feed<unknown>>();

/* ------------------------------------------------------------------ *
 * พักท่อตอนแท็บถูกซ่อนนาน
 *
 * Firestore คิดโควตาอ่านทุกครั้งที่ข้อมูลที่ฟังอยู่เปลี่ยน — คนดูเปิดหน้าขอเพลงไว้
 * แล้วสลับไปดูไลฟ์ในแอป TikTok ทิ้งแท็บค้างไว้ทั้งคืน ทุกเพลงที่ใครขอหรือเปลี่ยน
 * ก็คิดโควตากับแท็บที่ไม่มีใครมองอยู่ คูณด้วยจำนวนคนดูที่ทำแบบเดียวกัน
 *
 * ซ่อนเกิน PAUSE_AFTER_MS ก็ปิดทุกท่อไว้ (ค่าเดิมยังค้างบนจอ) กลับมาค่อยเปิดใหม่
 * เว็บใช้แคชถาวร กลับมาภายในครึ่งชั่วโมง Firestore จะส่ง (และคิด) แค่ส่วนที่เปลี่ยน
 *
 * ตัวเล่นในสตูดิโอกับ widget ไม่ผ่านท่อนี้ (ฟัง Firestore ตรง) จึงไม่โดนพัก —
 * สองตัวนั้นต้องเดินต่อแม้หน้าต่างถูกย่ออยู่ระหว่างไลฟ์
 * ------------------------------------------------------------------ */

const PAUSE_AFTER_MS = 60_000;
let pausedAll = false;
let pauseTimer: number | null = null;
let watchingVisibility = false;

function pauseAll() {
  pausedAll = true;
  feeds.forEach((feed) => {
    feed.stop?.();
    feed.stop = null;
  });
}

function resumeAll() {
  pausedAll = false;
  feeds.forEach((feed) => {
    if (!feed.stop && feed.listeners.size > 0) feed.start();
  });
}

function watchVisibility() {
  if (watchingVisibility || typeof document === "undefined") return;
  watchingVisibility = true;
  document.addEventListener("visibilitychange", () => {
    if (pauseTimer != null) window.clearTimeout(pauseTimer);
    pauseTimer = null;
    if (document.hidden) pauseTimer = window.setTimeout(pauseAll, PAUSE_AFTER_MS);
    else if (pausedAll) resumeAll();
  });
}

export type LiveSource<T> = (
  onChange: (value: T) => void,
  onError: () => void,
) => () => void;

/**
 * สมัครเข้าท่อร่วม — คืนฟังก์ชันเลิกสมัคร
 *
 * `key` ต้องแทน "ข้อมูลชุดเดียวกัน" ได้ตรงๆ เช่น "channels:all"
 * หรือ "channels:mine:<uid>" ถ้าคีย์ชนกันแต่ข้อมูลคนละชุด คนหนึ่งจะเห็นของอีกคน
 */
export function subscribeLive<T>(
  key: string,
  empty: T,
  source: LiveSource<T>,
  onChange: (value: T, loaded: boolean) => void,
): () => void {
  watchVisibility();
  let feed = feeds.get(key) as Feed<T> | undefined;
  if (!feed) {
    const created: Feed<T> = {
      value: empty,
      loaded: false,
      listeners: new Set(),
      stop: null,
      start: () => {
        created.stop = source(
          (value) => {
            created.value = value;
            created.loaded = true;
            created.listeners.forEach((l) => l(value, true));
          },
          () => {
            created.value = empty;
            created.loaded = true;
            created.listeners.forEach((l) => l(empty, true));
          },
        );
      },
    };
    feed = created;
    feeds.set(key, feed as Feed<unknown>);
  }
  const live = feed;
  live.listeners.add(onChange);

  // คนมาใหม่ได้ค่าล่าสุดทันที ไม่ต้องรอ snapshot รอบถัดไป
  if (live.loaded) onChange(live.value, true);

  // ช่วงพักอยู่ไม่เปิด — resumeAll เปิดให้ตอนแท็บกลับมา
  if (!live.stop && !pausedAll) live.start();

  return () => {
    live.listeners.delete(onChange);
    if (live.listeners.size > 0) return;
    live.stop?.();
    live.stop = null;
    /*
      ล้างค่าที่ค้างไว้ด้วยตอนไม่มีใครดูแล้ว

      ถ้าเก็บไว้ คนที่ล็อกเอาต์แล้วมีคนอื่นมาล็อกอินในแท็บเดิมจะได้เห็นข้อมูล
      ของคนก่อนหน้าแวบหนึ่งก่อน snapshot ชุดใหม่จะมาถึง
    */
    live.value = empty;
    live.loaded = false;
    feeds.delete(key);
  };
}

/**
 * ฮุคสำเร็จรูปบนท่อร่วม — ค่าที่ได้เป็นอ้างอิงเดิมจนกว่าข้อมูลจริงจะเปลี่ยน
 *
 * ค่าใน state ถูกแปะคีย์ไว้ด้วย แล้วตอนอ่านค่อยเทียบกับคีย์ปัจจุบัน
 * ทำแบบนี้เพื่อไม่ต้อง setState ล้างค่าเก่าใน effect ตอนสลับคีย์ — ซึ่งจะทำให้
 * เกิดเรนเดอร์พ่วงหนึ่งรอบทุกครั้งที่สลับช่อง/สลับบัญชี และระหว่างนั้นหน้าจอ
 * ก็โชว์ข้อมูลของคีย์เก่าอยู่หนึ่งเฟรม (เช่น ใบโดเนทของช่องก่อนหน้า)
 */
export function useLive<T>(
  key: string | null,
  empty: T,
  source: LiveSource<T>,
): { data: T; loaded: boolean } {
  const [state, setState] = useState<{
    key: string | null;
    data: T;
    loaded: boolean;
  }>({ key: null, data: empty, loaded: false });

  useEffect(() => {
    if (!key) return;
    return subscribeLive<T>(key, empty, source, (data, loaded) =>
      setState({ key, data, loaded }),
    );
    // source ถูกสร้างใหม่ทุกเรนเดอร์ในที่เรียกใช้ส่วนใหญ่ — คีย์คือตัวบอกว่า
    // "ข้อมูลชุดเดิมไหม" จริงๆ จึงยึดคีย์เป็นหลักและตั้งใจไม่ใส่ source ใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key || state.key !== key) return { data: empty, loaded: false };
  return { data: state.data, loaded: state.loaded };
}
