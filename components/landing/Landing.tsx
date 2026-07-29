"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { BRAND } from "@/lib/brand";
import { heroDelay } from "@/lib/intro";
import Button from "../ui/Button";
import Panel, { PanelHeader } from "../ui/Panel";
import Reveal from "../ui/Reveal";
import SectionHead from "../ui/SectionHead";
import Marquee from "../ui/Marquee";
import { IconDice, IconMonitor, IconTrophy, IconWheel } from "../ui/icons";
import OrbitalObject from "../fx/OrbitalObject";
import RotatingBadge from "../fx/RotatingBadge";
import RingCluster from "../fx/RingCluster";
import TiltCard from "../fx/TiltCard";
import HeroIndex from "./HeroIndex";
import StatStrip from "./StatStrip";
import BracketMini from "./BracketMini";
import WidgetPeek from "./WidgetPeek";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

const FEATURES: {
  no: string;
  title: string;
  detail: string;
  href: string;
  tag: string;
  Icon: IconType;
}[] = [
  {
    no: "01",
    title: "สุ่มแบ่งทีม",
    detail:
      "ใส่รายชื่อ กำหนดทีมละกี่คน แล้วจับสลากทีละคนพร้อมเอฟเฟกต์ ผลล็อกด้วย seed ตรวจย้อนหลังได้",
    href: "/draw/",
    tag: "Draw",
    Icon: IconDice,
  },
  {
    no: "02",
    title: "วงล้อเสี่ยงโชค",
    detail:
      "วงล้อที่สะบัดด้วยเมาส์ได้ ถ่วงน้ำหนักรายชื่อ คัดคนที่ออกแล้วทิ้ง เก็บประวัติทุกครั้ง",
    href: "/wheel/",
    tag: "Wheel",
    Icon: IconWheel,
  },
  {
    no: "03",
    title: "จัดทัวร์นาเมนต์",
    detail:
      "รับสมัครทีมหรือรายบุคคล จัดสายแพ้คัดออก ตั้ง BO รายรอบ กรอกผล คิดเงินรางวัลให้อัตโนมัติ",
    href: "/tournaments/",
    tag: "Cup",
    Icon: IconTrophy,
  },
  {
    no: "04",
    title: "Widget สำหรับสตรีม",
    detail:
      "สกอร์บอร์ด คิวถัดไป นับถอยหลัง ป้ายแชมป์ และแจ้งเตือนโดเนท วางใน OBS ได้เลย",
    href: "/widgets/",
    tag: "OBS",
    Icon: IconMonitor,
  },
];

const STEPS = [
  { no: "01", title: "สร้างทัวร์", detail: "ตั้งชื่อ ใส่รูป กำหนดวันรับสมัครและเงินรางวัล" },
  {
    no: "02",
    title: "เปิดรับสมัคร",
    detail: "รับเป็นทีม หรือรับรายบุคคลแล้วให้ระบบสุ่มแบ่งทีม",
  },
  {
    no: "03",
    title: "จัดสายและแข่ง",
    detail: "สุ่มคู่จาก seed กรอกผล ผู้ชนะเข้ารอบถัดไปเอง",
  },
  { no: "04", title: "ขึ้นจอสตรีม", detail: "ก๊อป widget ไปวางใน OBS ผลอัปเดตสดไม่ต้องรีเฟรช" },
];

const HERO_LINES = ["จัดทัวร์นาเมนต์", "ให้ดูเป็นมืออาชีพ"];

const TICKER = ["ทัวร์นาเมนต์", "จัดสาย", "สุ่มทีม", "วงล้อ", "โดเนท", "OBS"];

/**
 * เลขบทสองชั้น — ตัวโปร่งเป็นฐาน ตัวทึบจางเข้าเมื่อแถวนั้นเข้าจอ
 * ต้องซ้อนสองชั้นเพราะ .text-outline อยู่นอก @layer จึงชนะคลาสสีของ Tailwind
 */
function StepNo({ no }: { no: string }) {
  const reduced = useReducedMotion();
  const size = "text-[clamp(2.6rem,7vw,5.5rem)]";

  return (
    <span className="relative block">
      <span className={`fig text-outline block ${size}`}>{no}</span>
      {reduced ? (
        <span aria-hidden className={`fig absolute inset-0 block ${size} text-champagne/60`}>
          {no}
        </span>
      ) : (
        <motion.span
          aria-hidden
          className={`fig absolute inset-0 block ${size} text-champagne/60`}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          {no}
        </motion.span>
      )}
    </span>
  );
}

/** หัวการ์ดฟีเจอร์ — เลขบท ไอคอนเล็ก และป้ายภาษาอังกฤษสั้นๆ */
function FeatureHead({ no, tag, Icon }: { no: string; tag: string; Icon: IconType }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-champagne/80" strokeWidth={1.5} />
      <span className="slug num">{no}</span>
      <span className="rule h-px flex-1" />
      <span className="slug slug-2">{tag}</span>
    </div>
  );
}

/** ลิงก์ปลายการ์ด */
function OpenCue() {
  return (
    <span className="mt-6 inline-flex items-center gap-2 font-display text-xs text-champagne transition-transform duration-500 group-hover:translate-x-1">
      เปิดดู
      <span className="h-px w-8 bg-champagne/60" />
    </span>
  );
}

export default function Landing() {
  const reduced = useReducedMotion();
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const signedIn = !!user && !user.anonymous;

  /* ---- ขนาดของงานอาร์ตฮีโร่ วัดจากความกว้างจริงของ section ---- */
  const heroRef = useRef<HTMLElement | null>(null);
  const [orbit, setOrbit] = useState<{ size: number; interactive: boolean } | null>(
    null,
  );

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      const next =
        w < 768
          ? { size: 300, interactive: false }
          : w < 1024
            ? { size: 420, interactive: true }
            : { size: 560, interactive: true };
      // setState อยู่ใน callback ของ observer ไม่ใช่ในตัว effect เอง
      setOrbit((prev) => (prev && prev.size === next.size ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- รางความคืบหน้าของขั้นตอน ---- */
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: stepsRef,
    offset: ["start 70%", "end 60%"],
  });

  const big = FEATURES[0];
  const rest = FEATURES.slice(1);

  return (
    <div className="space-y-24 pb-16 sm:space-y-32">
      {/* ---------- ฮีโร่: แถบหัวเล่ม + พาดหัว + สารบัญ ---------- */}
      <section
        ref={heroRef}
        className="relative grid min-h-[86svh] grid-cols-12 content-center gap-x-3 gap-y-7 pt-4"
      >
        {/* งานอาร์ต — ไม่ซ่อนบนมือถืออีกแล้ว แค่ย่อและถอยไปอยู่หลังตัวอักษร */}
        {orbit && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 1.6,
              delay: heroDelay(0.3),
              ease: [0.16, 1, 0.3, 1],
            }}
            className="pointer-events-none absolute top-[-6%] right-[-18%] -z-10 opacity-45 mask-[radial-gradient(closest-side,#000_42%,transparent)]"
          >
            <OrbitalObject
              size={orbit.size}
              interactive={orbit.interactive}
              className={orbit.interactive ? "pointer-events-auto" : ""}
            />
            {orbit.interactive && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: heroDelay(1.5), duration: 1 }}
                className="slug slug-2 pointer-events-none absolute inset-x-0 bottom-4 text-center"
              >
                ลากเพื่อหมุน
              </motion.p>
            )}
          </motion.div>
        )}

        {/* แถบหัวเล่มแบบหนังสือพิมพ์ */}
        <div className="relative z-10 col-span-12 flex items-baseline justify-between gap-3 border-b border-hair pb-3">
          <span className="slug">{BRAND}</span>
          <span className="slug slug-2 hidden sm:block">·TH·</span>
          <span className="slug slug-2 num">No.01 / 2026</span>
        </div>

        {/*
          leading 1.02 ทับค่า 0.96 ของสเกล display เพราะบรรทัดนี้ครอบ overflow-hidden ไว้
          ถ้าแน่นกว่านี้วรรณยุกต์/การันต์ของไทย (ร์) จะโดนขอบบนตัดหาย
        */}
        <h1 className="relative z-10 col-span-12 font-display text-display leading-[1.02] font-light">
          {HERO_LINES.map((line, i) => (
            <span
              key={line}
              className={`block overflow-hidden ${i === 1 ? "ml-[8%]" : ""}`}
            >
              <motion.span
                className="block"
                initial={reduced ? undefined : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{
                  duration: 1,
                  delay: heroDelay(0.15 + i * 0.12),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {i === 1 ? <span className="text-gold-grad">{line}</span> : line}
              </motion.span>
            </span>
          ))}
        </h1>

        <div className="relative z-10 col-span-12 md:col-span-5">
          <motion.p
            initial={reduced ? undefined : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.9,
              delay: heroDelay(0.45),
              ease: [0.16, 1, 0.3, 1],
            }}
            className="max-w-xl text-deck text-muted"
          >
            สุ่มทีม จัดสายแข่ง กรอกผล คิดเงินรางวัล รับโดเนท
            และส่งทุกอย่างขึ้นจอสตรีมได้ในที่เดียว — ทำงานในเบราว์เซอร์ ไม่ต้องติดตั้งอะไร
          </motion.p>

          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.9,
              delay: heroDelay(0.6),
              ease: [0.16, 1, 0.3, 1],
            }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link href="/tournaments/">
              <Button size="lg">
                {signedIn ? "เข้าแดชบอร์ด" : hasBackend ? "เข้าสู่ระบบเพื่อเริ่ม" : "เริ่มใช้งาน"}
              </Button>
            </Link>
            <Link href="/draw/">
              <Button variant="outline" size="lg">
                {signedIn ? "สุ่มทีมเลย" : "ลองสุ่มทีมก่อน"}
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={reduced ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: heroDelay(0.95), duration: 0.8 }}
            className="mt-10 flex items-center gap-6 text-muted"
          >
            <RotatingBadge />
            <div className="flex items-center gap-3">
              <motion.span
                animate={reduced ? undefined : { y: [0, 8, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                className="slug slug-2"
              >
                เลื่อนลง
              </motion.span>
              <span className="h-px w-16 bg-[linear-gradient(90deg,rgb(var(--accent)/.6),transparent)]" />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.9,
            delay: heroDelay(0.7),
            ease: [0.16, 1, 0.3, 1],
          }}
          className="relative z-10 col-span-12 md:col-span-6 md:col-start-7"
        >
          <HeroIndex />
        </motion.div>
      </section>

      {/* ---------- ตัวเลขจริงจากเครื่องผู้ใช้ ---------- */}
      <Reveal>
        <StatStrip />
      </Reveal>

      {/* ---------- ฟีเจอร์แบบ bento ---------- */}
      <section>
        <Reveal>
          <SectionHead
            no="01"
            eyebrow="What it does"
            title="เครื่องมือครบชุดสำหรับคนจัดแข่ง"
            meta="4 เครื่องมือ · ใช้ฟรีทั้งหมด"
          />
        </Reveal>

        {/*
          bento 6 คอลัมน์: ใบตัวเอกกินสองแถวทางซ้าย ใบเล็กเรียงขวา
          ไม่ใช้ auto-rows-fr เพราะบังคับให้ทุกแถวสูงเท่ากัน แล้วใบตัวเอกจะยืดตาม
          แถวล่างที่มีตัวอย่าง widget จนสูงเกินจอ
        */}
        <div className="mt-12 grid gap-3 sm:grid-cols-6">
          {/* ใบตัวเอก — มีสายแข่งตัวอย่างวาดจริงข้างใน */}
          <Reveal className="sm:col-span-4 sm:row-span-2">
            <Link href={big.href} className="group block h-full">
              <Panel
                variant="feature"
                className="relative flex h-full min-h-96 flex-col overflow-hidden p-7 sm:min-h-0"
              >
                <big.Icon
                  className="pointer-events-none absolute -right-4 -bottom-4 h-30 w-30 opacity-[0.09]"
                  strokeWidth={0.7}
                />

                <FeatureHead no={big.no} tag={big.tag} Icon={big.Icon} />

                <h3 className="mt-5 font-display text-2xl font-light text-ice">
                  {big.title}
                </h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                  {big.detail}
                </p>

                <div className="mt-6 grow">
                  <p className="slug slug-2 mb-2">ตัวอย่างสายที่ได้จากผลสุ่ม</p>
                  {/* จำกัดความกว้าง ไม่งั้น SVG 320x200 จะยืดสูงเกินการ์ดบนจอใหญ่ */}
                  <BracketMini className="mx-auto max-w-lg" />
                </div>

                <OpenCue />

                {/* เลขผีตัวเดียวของวิวนี้ */}
                <span
                  aria-hidden
                  className="fig text-outline pointer-events-none absolute -right-3 -bottom-8 text-[clamp(5rem,12vw,9rem)] opacity-[.16] select-none"
                >
                  {big.no}
                </span>
              </Panel>
            </Link>
          </Reveal>

          {rest.map((f, i) => (
            <Reveal key={f.no} index={i + 1} className="sm:col-span-2">
              <Link href={f.href} className="group block h-full">
                <TiltCard className="h-full">
                  <Panel className="relative flex h-full flex-col overflow-hidden p-6">
                    <f.Icon
                      className="pointer-events-none absolute -right-4 -bottom-4 h-30 w-30 opacity-[0.09]"
                      strokeWidth={0.7}
                    />

                    <FeatureHead no={f.no} tag={f.tag} Icon={f.Icon} />

                    <h3 className="mt-4 font-display text-xl font-light text-ice">
                      {f.title}
                    </h3>
                    <p className="mt-2.5 grow text-sm leading-relaxed text-muted">
                      {f.detail}
                    </p>

                    <OpenCue />
                  </Panel>
                </TiltCard>
              </Link>
            </Reveal>
          ))}

          {/* ตัวอย่าง widget ของจริง เติมช่องว่างแถวล่างของ bento */}
          <Reveal index={4} className="sm:col-span-4">
            <Panel className="flex h-full flex-col p-6">
              <PanelHeader
                eyebrow="Live preview"
                title="หน้าตาจริงบนจอสตรีม"
                action={
                  <Link
                    href="/widgets/"
                    className="font-display text-xs text-champagne hover:underline"
                  >
                    ตั้งค่า →
                  </Link>
                }
              />
              <WidgetPeek className="grow" />
              <p className="mt-4 text-xs text-muted">
                ทุกใบเป็นลิงก์ธรรมดา วางเป็น Browser Source ใน OBS
                แล้วผลจะอัปเดตเองตอนกรอกคะแนน
              </p>
            </Panel>
          </Reveal>
        </div>
      </section>

      {/* ---------- แถบตัวอักษรวิ่งคั่นองก์ (ต้องเป็นลูกตรงของ section เพราะ .band) ---------- */}
      <section>
        <Marquee items={TICKER} />
      </section>

      {/* ---------- ขั้นตอน ---------- */}
      <section className="relative">
        <div className="pointer-events-none absolute -top-20 right-0 opacity-50">
          <RingCluster size={200} />
        </div>

        <Reveal>
          <SectionHead
            no="02"
            eyebrow="How it works"
            title="สี่ขั้นตอน จบตั้งแต่รับสมัครถึงขึ้นจอ"
            meta="ใช้เวลาราว 5 นาที"
          />
        </Reveal>

        <div ref={stepsRef} className="relative mt-12 pl-5 sm:pl-8">
          {/* รางซ้าย: เส้นจางเป็นพื้น เส้นทองยาวตามระยะที่เลื่อนมา */}
          <span aria-hidden className="rule absolute inset-y-0 left-0 w-px" />
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 w-px origin-top bg-[linear-gradient(180deg,rgb(var(--accent)/.9),rgb(var(--accent)/.15))]"
            style={reduced ? { scaleY: 1 } : { scaleY: scrollYProgress }}
          />

          {STEPS.map((s, i) => (
            <Reveal key={s.no} index={i} from="left">
              <div className="group relative grid items-start gap-4 border-t border-hair py-7 sm:grid-cols-[auto_1fr_2fr] sm:gap-10">
                {/* เส้นทองบนหัวแถว: เล่นตอนเลื่อนมาถึง แล้วยังมีชุด hover ซ้อนอยู่ */}
                {reduced ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgb(var(--accent)/.85),transparent)]"
                  />
                ) : (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left bg-[linear-gradient(90deg,rgb(var(--accent)/.85),transparent)]"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[linear-gradient(90deg,rgb(var(--accent)),transparent)] transition-transform duration-700 ease-out group-hover:scale-x-100"
                />

                <StepNo no={s.no} />

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
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-40">
          <RingCluster size={560} />
        </div>

        <Reveal>
          <SectionHead no="03" eyebrow="Ready" title="เริ่มจัดทัวร์แรกของคุณ" />
        </Reveal>

        <Reveal from="scale" className="mt-10">
          <Panel variant="feature" className="relative p-10 text-center sm:p-14">
            <p className="slug">เริ่มจากศูนย์</p>
            <h3 className="mx-auto mt-5 max-w-2xl font-display text-h2 font-light">
              <span className="text-gold-grad">ตั้งชื่อ ใส่จำนวนทีม แล้วกดจัดสาย</span>
            </h3>
            <p className="mx-auto mt-5 max-w-lg text-sm text-muted">
              ทัวร์แรกใช้เวลาไม่ถึงนาที ยังไม่ต้องมีรายชื่อครบก็สร้างไว้ก่อนได้
              แล้วค่อยเปิดรับสมัครทีหลัง
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/tournaments/">
                <Button size="lg">{signedIn ? "ไปที่ทัวร์นาเมนต์" : "เข้าสู่ระบบ"}</Button>
              </Link>
              <Link href="/widgets/">
                <Button variant="ghost" size="lg">
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
