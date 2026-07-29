"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";

const KEY = "rov-randomizer/intro-seen";
const DURATION = 1900;

/**
 * หน้าโหลดตอนเข้าเว็บ — นับเลขขึ้นแล้วม่านเปิดเผยเนื้อหา
 * โชว์ครั้งเดียวต่อการเปิดแท็บ (sessionStorage) จะได้ไม่กวนตอนสลับหน้า
 */
export default function IntroLoader() {
  const reduced = useReducedMotion();
  const hydrated = useHydrated();
  // อ่านครั้งเดียวตอน mount ว่าเคยโชว์ในแท็บนี้แล้วหรือยัง
  const [seen] = useState(
    () => typeof window !== "undefined" && !!sessionStorage.getItem(KEY),
  );
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(0);

  const show = hydrated && !reduced && !seen && !done;
  const setShow = (value: boolean) => setDone(!value);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* โหมดส่วนตัว — โชว์ทุกครั้งก็ไม่เป็นไร */
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // ออกตัวไว แล้วหน่วงตอนใกล้ 100
      setCount(Math.round((1 - Math.pow(1 - t, 3)) * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
      else window.setTimeout(() => setShow(false), 380);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  // กดข้ามได้
  useEffect(() => {
    if (!show) return;
    const skip = () => setShow(false);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-100 overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 1 }}
        >
          {/* ม่านสองบานเปิดออกจากกลาง */}
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 bg-ink"
            initial={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-ink"
            initial={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
          />

          {/* เส้นทองตรงกลางรอยแยก */}
          <motion.div
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[linear-gradient(90deg,transparent,rgba(230,200,148,0.9),transparent)]"
            initial={{ scaleX: 0.2, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />

          <motion.div
            className="relative grid h-full place-items-center"
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            <div className="text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-champagne/40"
              >
                <span className="absolute inset-0 animate-halo rounded-full" />
                <span className="font-display text-xl text-champagne">R</span>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, letterSpacing: "0.6em" }}
                animate={{ opacity: 1, letterSpacing: "0.32em" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 font-display text-xs text-champagne/80 uppercase"
              >
                ROV Tournament Hub
              </motion.p>

              <p className="mt-8 font-display text-5xl font-extralight text-ice tabular-nums">
                {String(count).padStart(3, "0")}
              </p>

              <div className="mx-auto mt-4 h-px w-40 overflow-hidden bg-[rgb(var(--hair)/var(--hair-a))]">
                <div
                  className="h-full bg-[linear-gradient(90deg,#8f7038,#f2dcb0)] transition-[width] duration-100"
                  style={{ width: `${count}%` }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
