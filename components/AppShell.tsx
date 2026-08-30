"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMediaQuery } from "@/hooks/useClient";
import { repairDuplicatedHash } from "@/lib/hash";
import BackgroundFX from "./fx/BackgroundFX";
import IntroLoader from "./fx/IntroLoader";
import Footer from "./Footer";
import NavBar, { navTitle } from "./NavBar";
import ToastHost from "./ui/Toast";

export default function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const reduced = useReducedMotion();
  // มือถือตัด blur ออก การเบลอทั้งหน้าตอนพลิกหน้าคือ paint ก้อนใหญ่ที่สุดที่จะเจอ
  const mobile = useMediaQuery("(max-width: 640px)");
  const wrapRef = useRef<HTMLDivElement>(null);
  const isHome = pathname.replace(/\/+$/, "") === "";

  /*
    ล้าง hash ที่ซ้อนกันหลังพลิกหน้าเสร็จ — ดู lib/hash.ts ว่ามันซ้อนได้ยังไง
    ตัวอ่านค่ายึดก้อนท้ายอยู่แล้ว หน้าจึงถูกช่องตั้งแต่แรก ตรงนี้คือทำที่อยู่
    ให้สะอาดพอจะก๊อปไปแปะต่อได้ ไม่ใช่กู้หน้าที่พัง
  */
  useEffect(() => {
    repairDuplicatedHash();
    // ต้องดัก hashchange ด้วย เพราะการกดลิงก์ที่เปลี่ยนแค่ hash ของหน้าเดิม
    // ไม่ได้เปลี่ยน pathname เอฟเฟกต์นี้จึงไม่ถูกเรียกซ้ำเอง
    window.addEventListener("hashchange", repairDuplicatedHash);
    return () => window.removeEventListener("hashchange", repairDuplicatedHash);
  }, [pathname]);

  const enter = mobile
    ? { opacity: 1, y: 0 }
    : { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <>
      <IntroLoader />
      <BackgroundFX />

      {/*
        แถบเมนูลอยอยู่นอก <main> เพราะมันเป็น position:fixed แล้ว
        ถ้าปล่อยไว้ข้างในตามเดิม กล่องของ main จะยังกันที่ให้มันไม่ได้อยู่ดี
        และการที่มันอยู่นอกยังกันไม่ให้โดน filter ของแอนิเมชันพลิกหน้าครอบ
        (filter สร้าง containing block ใหม่ ซึ่งจะทำให้ fixed หลุดกรอบทันที)
      */}
      <NavBar wide={wide} />

      <main
        className={`relative z-10 mx-auto flex min-h-dvh w-full flex-col gap-6 px-3 pt-[calc(var(--nav-h)+1.25rem+var(--sat))] pb-[calc(2.5rem+var(--sab))] sm:px-5 lg:px-8 ${
          wide ? "max-w-420" : "max-w-350"
        }`}
      >
        {/* เส้นคอลัมน์ 12 ช่อง เปิดเฉพาะหน้าแรกบนจอใหญ่ ถ้าเปิดทุกหน้าจะกลายเป็นลายรบกวน */}
        {isHome && (
          <span
            aria-hidden
            style={{ zIndex: -1 }}
            className="grid-rules pointer-events-none absolute inset-0 hidden lg:grid"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} />
            ))}
          </span>
        )}

        <div className="relative flex-1 pt-2">
          {reduced ? (
            children
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                ref={wrapRef}
                initial={
                  mobile
                    ? { opacity: 0, y: 14 }
                    : { opacity: 0, y: 14, filter: "blur(6px)" }
                }
                animate={enter}
                exit={
                  mobile
                    ? { opacity: 0, y: -10 }
                    : { opacity: 0, y: -10, filter: "blur(4px)" }
                }
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                onAnimationComplete={() => {
                  // blur(0px) ที่ค้างอยู่จะกลายเป็น containing block ทำให้ overlay
                  // ที่เป็น position:fixed ข้างในหน้าหลุดกรอบ จึงล้างทิ้งเมื่อเข้าเสร็จ
                  const el = wrapRef.current;
                  if (el && el.style.filter === "blur(0px)") el.style.filter = "";
                }}
                className="relative"
              >
                <PageWipe label={navTitle(pathname)} />
                {children}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <Footer />
      </main>

      <ToastHost />
    </>
  );
}

/** เส้นกวาดบางๆ พร้อมชื่อหน้าปลายทาง — บอกว่า "พลิกมาหน้านี้แล้ว" */
function PageWipe({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 block"
    >
      <motion.span
        className="block h-px origin-left bg-[linear-gradient(90deg,transparent,rgb(var(--st-next)/.9),transparent)]"
        initial={{ scaleX: 0, opacity: 0.9 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className="slug absolute top-2 left-0"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: [0, 1, 0], x: 0 }}
        transition={{
          opacity: { duration: 1.1, times: [0, 0.28, 1], ease: "easeOut" },
          x: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
        }}
      >
        {label}
      </motion.span>
    </span>
  );
}
