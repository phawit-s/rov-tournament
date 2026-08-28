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
};

const feeds = new Map<string, Feed<unknown>>();

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
  let feed = feeds.get(key) as Feed<T> | undefined;
  if (!feed) {
    feed = { value: empty, loaded: false, listeners: new Set(), stop: null };
    feeds.set(key, feed as Feed<unknown>);
  }
  const live = feed;
  live.listeners.add(onChange);

  // คนมาใหม่ได้ค่าล่าสุดทันที ไม่ต้องรอ snapshot รอบถัดไป
  if (live.loaded) onChange(live.value, true);

  if (!live.stop) {
    live.stop = source(
      (value) => {
        live.value = value;
        live.loaded = true;
        live.listeners.forEach((l) => l(value, true));
      },
      () => {
        live.value = empty;
        live.loaded = true;
        live.listeners.forEach((l) => l(empty, true));
      },
    );
  }

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
