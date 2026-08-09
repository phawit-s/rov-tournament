"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";
import { introStore } from "@/lib/intro";
import { BRAND_WORDS } from "@/lib/brand";
import Corners from "@/components/ui/Corners";

const KEY = "tourney-hub/intro-seen";
const DURATION = 1900;
const WORDS = BRAND_WORDS;

/**
 * หน้าปกของเล่ม — เผยชื่อทีละคำ นับเลขที่มุมล่างขวา แล้วม่านเปิดออกเป็นเนื้อหา
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
  const told = useRef(false);

  const show = hydrated && !reduced && !seen && !done;
  const setShow = (value: boolean) => setDone(!value);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* โหมดส่วนตัว — โชว์ทุกครั้งก็ไม่เป็นไร */
    }
  }, []);

  // บอกฮีโร่ของหน้าแรกครั้งเดียวว่าจะมีม่านให้รอไหม (เขียนลง store นอก React ไม่ใช่ setState)
  useEffect(() => {
    if (told.current || !hydrated) return;
    told.current = true;
    introStore.setWillPlay(!reduced && !seen);
  }, [hydrated, reduced, seen]);

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
    <AnimatePresence onExitComplete={() => introStore.markDone()}>
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

          {/* เส้นทองตรงรอยแยก — ตอนม่านเปิดให้ยืดออกแล้วละลายไปกับแสง */}
          <motion.div
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[linear-gradient(90deg,transparent,rgba(230,200,148,0.9),transparent)]"
            initial={{ scaleX: 0.2, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1, filter: "blur(0px)" }}
            exit={{ scaleX: 1.25, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />

          <motion.div
            className="relative h-full"
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            {/* กรอบจอบางๆ ให้หน้าปกรู้สึกเป็นแผ่นพิมพ์ ไม่ใช่หน้าโหลดเปล่า */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-[5vw] hidden sm:block"
            >
              <Corners len={26} o={0.4} />
            </span>

            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="slug absolute top-[7vh] left-[6vw]"
            >
              ฉบับ 2026 / สูจิบัตร
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="slug slug-2 num absolute top-[7vh] right-[6vw]"
            >
              No.01
            </motion.p>

            {/* ชื่อเล่มเผยทีละคำ — ภาษาเดียวกับ h1 ของหน้าแรก */}
            <div className="grid h-full place-items-center px-[6vw]">
              <h1 className="fig text-center text-[clamp(2.4rem,11vw,7.5rem)] leading-[0.94]">
                {WORDS.map((word, i) => (
                  <span key={word} className="block overflow-hidden">
                    <motion.span
                      className="text-accent-grad block"
                      initial={{ y: "110%" }}
                      animate={{ y: 0 }}
                      transition={{
                        duration: 0.95,
                        delay: 0.18 + i * 0.12,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {word}
                    </motion.span>
                  </span>
                ))}
              </h1>
            </div>

            {/* ตัวนับอยู่มุมล่างขวาเหมือนเลขหน้า ไม่แย่งกลางเวทีจากชื่อเล่ม */}
            <p className="fig num absolute right-[6vw] bottom-[8vh] text-[clamp(3.5rem,15vw,10rem)] text-ice/80">
              {String(count).padStart(3, "0")}
            </p>

            <p className="slug absolute bottom-[8vh] left-[6vw] opacity-60">
              แตะเพื่อข้าม
            </p>

            {/* แถบโหลดยาวเต็มหน้า เป็นเส้นฐานของหน้าปก */}
            <span className="absolute inset-x-[6vw] bottom-[6vh] block h-px overflow-hidden bg-[rgb(var(--hair)/var(--hair-a))]">
              <span
                className="block h-full origin-left bg-[linear-gradient(90deg,#5b4bd6,#cfc7ff)] transition-transform duration-100"
                style={{ transform: `scaleX(${count / 100})` }}
              />
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
