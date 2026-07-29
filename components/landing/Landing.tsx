"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Reveal from "../ui/Reveal";
import OrbitalObject from "../fx/OrbitalObject";
import RotatingBadge from "../fx/RotatingBadge";
import RingCluster from "../fx/RingCluster";
import TiltCard from "../fx/TiltCard";

const FEATURES = [
  {
    no: "01",
    title: "สุ่มแบ่งทีม",
    detail:
      "ใส่รายชื่อ กำหนดทีมละกี่คน แล้วจับสลากทีละคนพร้อมเอฟเฟกต์ ผลล็อกด้วย seed ตรวจย้อนหลังได้",
    href: "/draw/",
  },
  {
    no: "02",
    title: "วงล้อเสี่ยงโชค",
    detail:
      "วงล้อที่สะบัดด้วยเมาส์ได้ ถ่วงน้ำหนักรายชื่อ คัดคนที่ออกแล้วทิ้ง เก็บประวัติทุกครั้ง",
    href: "/wheel/",
  },
  {
    no: "03",
    title: "จัดทัวร์นาเมนต์",
    detail:
      "รับสมัครทีมหรือรายบุคคล จัดสายแพ้คัดออก ตั้ง BO รายรอบ กรอกผล คิดเงินรางวัลให้อัตโนมัติ",
    href: "/tournaments/",
  },
  {
    no: "04",
    title: "Widget สำหรับสตรีม",
    detail:
      "สกอร์บอร์ด คิวถัดไป นับถอยหลัง ป้ายแชมป์ และแจ้งเตือนโดเนท วางใน OBS ได้เลย",
    href: "/widgets/",
  },
];

const STEPS = [
  { no: "1", title: "สร้างทัวร์", detail: "ตั้งชื่อ ใส่รูป กำหนดวันรับสมัครและเงินรางวัล" },
  { no: "2", title: "เปิดรับสมัคร", detail: "รับเป็นทีม หรือรับรายบุคคลแล้วให้ระบบสุ่มแบ่งทีม" },
  { no: "3", title: "จัดสายและแข่ง", detail: "สุ่มคู่จาก seed กรอกผล ผู้ชนะเข้ารอบถัดไปเอง" },
  { no: "4", title: "ขึ้นจอสตรีม", detail: "ก๊อป widget ไปวางใน OBS ผลอัปเดตสดไม่ต้องรีเฟรช" },
];

export default function Landing() {
  const reduced = useReducedMotion();
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const signedIn = !!user && !user.anonymous;

  return (
    <div className="space-y-28 pb-16 sm:space-y-40">
      {/* ---------- Hero ---------- */}
      <section className="relative flex min-h-[76vh] flex-col justify-center pt-10">
        {/* วัตถุหมุน — ลากได้ */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -top-10 -right-24 hidden lg:block xl:-right-10"
        >
          <OrbitalObject size={560} />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 1 }}
            className="pointer-events-none absolute inset-x-0 bottom-4 text-center font-display text-[10px] tracking-luxe text-muted/70 uppercase"
          >
            ลากเพื่อหมุน
          </motion.p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[11px] tracking-luxe text-champagne/75 uppercase"
        >
          ROV Tournament Hub
        </motion.p>

        <h1 className="mt-6 font-display text-[clamp(2.6rem,7vw,6rem)] leading-[1.02] font-light">
          {["จัดทัวร์นาเมนต์", "ให้ดูเป็นมืออาชีพ"].map((line, i) => (
            <span key={line} className="block overflow-hidden">
              <motion.span
                className="block"
                initial={reduced ? undefined : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{
                  duration: 1,
                  delay: 0.15 + i * 0.12,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {i === 1 ? <span className="text-gold-grad">{line}</span> : line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 max-w-xl text-base leading-relaxed text-muted"
        >
          สุ่มทีม จัดสายแข่ง กรอกผล คิดเงินรางวัล รับโดเนท
          และส่งทุกอย่างขึ้นจอสตรีมได้ในที่เดียว — ทำงานในเบราว์เซอร์ ไม่ต้องติดตั้งอะไร
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          {signedIn ? (
            <>
              <Link href="/tournaments/">
                <Button className="px-7 py-3.5 text-base">เข้าแดชบอร์ด</Button>
              </Link>
              <Link href="/draw/">
                <Button variant="outline" className="px-7 py-3.5 text-base">
                  สุ่มทีมเลย
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/tournaments/">
                <Button className="px-7 py-3.5 text-base">
                  {hasBackend ? "เข้าสู่ระบบเพื่อเริ่ม" : "เริ่มใช้งาน"}
                </Button>
              </Link>
              <Link href="/draw/">
                <Button variant="outline" className="px-7 py-3.5 text-base">
                  ลองสุ่มทีมก่อน
                </Button>
              </Link>
            </>
          )}
        </motion.div>

        {/* ตัวบอกให้เลื่อนลง + วงแหวนตัวอักษรหมุน */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.8 }}
          className="mt-16 flex items-center gap-6 text-muted"
        >
          <RotatingBadge />
          <div className="flex items-center gap-3">
            <motion.span
              animate={reduced ? undefined : { y: [0, 8, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="font-display text-xs tracking-luxe uppercase"
            >
              เลื่อนลง
            </motion.span>
            <span className="h-px w-16 bg-[linear-gradient(90deg,rgba(230,200,148,0.6),transparent)]" />
          </div>
        </motion.div>
      </section>

      {/* ---------- ฟีเจอร์ ---------- */}
      <section>
        <Reveal>
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            What it does
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight font-light sm:text-5xl">
            เครื่องมือครบชุดสำหรับคนจัดแข่ง
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.no} index={i} from="up">
              <Link href={f.href} className="group block h-full">
                <TiltCard className="h-full">
                  <Panel className="flex h-full flex-col p-7">
                    <span className="font-display text-[11px] tracking-luxe text-champagne/60">
                      {f.no}
                    </span>
                    <h3 className="mt-5 font-display text-2xl font-light text-ice">
                      {f.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{f.detail}</p>
                    <span className="mt-8 inline-flex items-center gap-2 font-display text-xs text-champagne transition-transform duration-500 group-hover:translate-x-1">
                      เปิดดู
                      <span className="h-px w-8 bg-champagne/60" />
                    </span>
                  </Panel>
                </TiltCard>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- ขั้นตอน ---------- */}
      <section className="relative">
        {/* วงแหวนซ้อน — กางออกเมื่อเมาส์เข้าใกล้ */}
        <div className="pointer-events-none absolute -top-24 -right-16 hidden opacity-80 md:block">
          <RingCluster size={380} />
        </div>

        <Reveal>
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight font-light sm:text-5xl">
            สี่ขั้นตอน จบตั้งแต่รับสมัครถึงขึ้นจอ
          </h2>
        </Reveal>

        <div className="relative mt-14 space-y-px">
          {STEPS.map((s, i) => (
            <Reveal key={s.no} index={i} from="left">
              <div className="group relative grid items-start gap-4 border-t border-hair py-8 sm:grid-cols-[auto_1fr_2fr] sm:gap-10">
                {/* เส้นทองไล่จากซ้ายเมื่อชี้เมาส์ */}
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[linear-gradient(90deg,rgba(230,200,148,0.85),transparent)] transition-transform duration-700 ease-out group-hover:scale-x-100" />
                <span className="font-display text-4xl font-extralight text-champagne/40 transition-colors duration-500 group-hover:text-champagne">
                  0{s.no}
                </span>
                <h3 className="font-display text-xl font-light text-ice transition-transform duration-500 group-hover:translate-x-1">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{s.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- ปิดท้าย ---------- */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 hidden place-items-center sm:grid">
          <OrbitalObject size={760} interactive={false} className="opacity-40" />
        </div>

        <Reveal from="scale">
          <Panel className="relative p-10 text-center sm:p-16">
            <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
              Ready
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl leading-tight font-light sm:text-5xl">
              <span className="text-gold-grad">เริ่มจัดทัวร์แรกของคุณ</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm text-muted">
              ข้อมูลเก็บในเบราว์เซอร์ของคุณ เผยแพร่ขึ้นคลาวด์เมื่อกดเองเท่านั้น
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/tournaments/">
                <Button className="px-8 py-3.5 text-base">
                  {signedIn ? "ไปที่ทัวร์นาเมนต์" : "เข้าสู่ระบบ"}
                </Button>
              </Link>
              <Link href="/widgets/">
                <Button variant="ghost" className="px-8 py-3.5 text-base">
                  ดู widget สำหรับ OBS
                </Button>
              </Link>
            </div>
          </Panel>
        </Reveal>
      </section>
    </div>
  );
}
