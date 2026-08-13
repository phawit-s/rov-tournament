"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import SilkCanvas from "./SilkCanvas";

type Mote = {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
  warm: boolean;
  vx: number;
  vy: number;
};

type Ripple = { x: number; y: number; r: number; alpha: number };

const PUSH_RADIUS = 170;

/**
 * พื้นหลังโทนหรู — เคลื่อนไหวช้ามากจนแทบไม่รู้ตัว แต่ภาพไม่นิ่งตาย
 * ชั้นที่ซ้อนกัน: ไล่สีพื้น → ลำแสงบน → ก้อนแสงลอย → ฝุ่นทอง → แสงกวาด → เกรน → ขอบมืด
 * ทุกอย่างความทึบต่ำ ไม่แย่งสายตากับเนื้อหา
 */
export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: -9999, y: -9999 });
  const ripplesRef = useRef<Ripple[]>([]);
  const reduced = useReducedMotion();

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  const soft = { stiffness: 16, damping: 26, mass: 2 };
  const ax = useSpring(mx, soft);
  const ay = useSpring(my, soft);
  const bx = useSpring(mx, { stiffness: 9, damping: 28, mass: 2.4 });
  const by = useSpring(my, { stiffness: 9, damping: 28, mass: 2.4 });

  /*
    ระยะที่ก้อนแสงขยับ คิดเป็นพิกเซล ไม่ใช่เปอร์เซ็นต์ของจอ

    ของเดิมขยับด้วย left/top ซึ่งเป็นค่าที่บังคับให้เบราว์เซอร์ "จัดเลย์เอาต์ใหม่"
    ทุกครั้งที่เปลี่ยน — และของที่ขยับคือแผ่น blur 150px ขนาด 736px สามแผ่น
    ที่ตามเมาส์ด้วยสปริงหน่วงหนัก (กว่าจะนิ่งใช้เวลาหลายวินาทีต่อการขยับเมาส์
    หนึ่งครั้ง) ผลคือ layout + paint ก้อนใหญ่รัวๆ ตลอดเวลาที่มีคนขยับเมาส์

    transform ทำงานบน compositor ล้วน ไม่แตะเลย์เอาต์ ไม่ต้องเบลอใหม่
    ตาเห็นเหมือนเดิมเป๊ะ เพราะระยะที่ขยับจริงมีแค่ไม่กี่ร้อยพิกเซลอยู่แล้ว
  */
  const glowX = useTransform(ax, (v) => (v - 0.5) * 230);
  const glowY = useTransform(ay, (v) => (v - 0.5) * 200);
  const glow2X = useTransform(bx, (v) => (0.5 - v) * 260);
  const glow2Y = useTransform(by, (v) => (0.5 - v) * 200);
  const glow3X = useTransform(bx, (v) => (v - 0.5) * 170);
  const glow3Y = useTransform(ay, (v) => (0.5 - v) * 170);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth);
      my.set(e.clientY / window.innerHeight);
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pointerRef.current = { x: -9999, y: -9999 };
    };
    // คลิกที่ไหนก็ได้ ให้มีคลื่นทองกระจายออกจากจุดนั้น
    const onDown = (e: PointerEvent) => {
      const list = ripplesRef.current;
      list.push({ x: e.clientX, y: e.clientY, r: 4, alpha: 0.4 });
      if (list.length > 6) list.shift();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [mx, my]);

  // ฝุ่นทองลอยขึ้นช้าๆ — น้อยชิ้น ความทึบต่ำ ไม่กวนสายตา
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let motes: Mote[] = [];
    let raf = 0;
    /** วาดภาพนิ่งไปแล้วหรือยัง — ใช้เฉพาะโหมดลดแอนิเมชัน */
    let drawn = false;

    const seed = () => {
      const count = Math.min(30, Math.max(12, Math.round(width / 68)));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.4,
        speed: 3 + Math.random() * 7,
        sway: 8 + Math.random() * 22,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.1 + Math.random() * 0.24,
        warm: Math.random() < 0.7,
        vx: 0,
        vy: 0,
      }));
    };

    const resize = () => {
      /*
        เพดาน 1.5 ไม่ใช่ 2 — ชั้นนี้มีแต่จุดกลมขนาด 0.6-2px ความทึบไม่ถึง 0.35
        รายละเอียดที่ได้เพิ่มจาก dpr 2 มองไม่ออก แต่ผืนที่ต้องล้างและวาดใหม่
        ทุกเฟรมโตขึ้นเกือบสองเท่า (จอ 1440p: 14.7 ล้านพิกเซล เทียบกับ 8.3 ล้าน)
      */
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      drawn = false;
    };

    resize();
    window.addEventListener("resize", resize);

    /*
      30fps พอสำหรับชั้นนี้ ฝุ่นลอยขึ้นแค่ 3-7 พิกเซลต่อวินาที ที่ 30fps คือขยับ
      0.1-0.23 พิกเซลต่อเฟรม ตาไม่มีทางแยกออกจาก 60fps แต่จำนวนครั้งที่ต้องล้าง
      แล้ววาดผืนเต็มจอใหม่ลดลงครึ่งหนึ่ง
    */
    const FRAME_MS = 32;

    let last = 0;
    const draw = (time: number) => {
      if (last && time - last < FRAME_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0.016;
      last = time;
      /* ตัวคูณเทียบกับ 60fps — ค่าคงที่ด้านล่างเขียนไว้ต่อเฟรมที่ 60fps
         ถ้าใช้ตรงๆ ความเร็วจะผูกกับรีเฟรชเรตของจอ (จอ 144Hz ฝุ่นจะหยุดเร็วกว่า
         จอ 60Hz สองเท่าครึ่ง) แปลงเป็นต่อวินาทีเสียเลย จะได้เท่ากันทุกจอ */
      const step = dt * 60;

      /*
        โหมดลดแอนิเมชัน: ฝุ่นไม่ลอย ไม่กะพริบ และไม่หลบเมาส์ ภาพจึงนิ่งสนิท
        ล้างแล้ววาดใหม่ทุกเฟรมได้ผลลัพธ์เดิมเป๊ะ — วาดครั้งเดียวพอ
        เหลือลูปไว้ให้คลื่นตอนคลิกเดินจนจาง แล้วกลับไปนิ่งเหมือนเดิม
      */
      if (reduced && drawn && ripplesRef.current.length === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      drawn = true;

      ctx.clearRect(0, 0, width, height);

      const light = document.documentElement.dataset.theme === "light";
      const pointer = pointerRef.current;

      for (const mote of motes) {
        if (!reduced) {
          mote.y -= mote.speed * dt;
          if (mote.y < -10) {
            mote.y = height + 10;
            mote.x = Math.random() * width;
          }
        }
        const drift = Math.sin(time * 0.00016 + mote.phase) * mote.sway;

        // ฝุ่นหลบเมาส์ แล้วค่อยๆ ลอยกลับที่เดิม
        let near = 0;
        if (!reduced) {
          const dx = mote.x + drift + mote.vx - pointer.x;
          const dy = mote.y + mote.vy - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < PUSH_RADIUS && dist > 0.01) {
            near = 1 - dist / PUSH_RADIUS;
            const force = near * near * 260 * dt;
            mote.vx += (dx / dist) * force;
            mote.vy += (dy / dist) * force;
          }
          // 0.92 * 0.95 = 0.874 ต่อเฟรมที่ 60fps — ยุบเหลือตัวเดียวแล้วคิดตามเวลาจริง
          const damp = Math.pow(0.874, step);
          mote.vx *= damp;
          mote.vy *= damp;
        }

        const x = mote.x + drift + mote.vx;
        const y = mote.y + mote.vy;
        const twinkle = reduced
          ? 1
          : 0.65 + 0.35 * Math.sin(time * 0.0009 + mote.phase * 2);
        const alpha = mote.alpha * twinkle * (light ? 0.55 : 1) * (1 + near * 2.2);
        const r = mote.r * (1 + near * 0.9);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = light
          ? `rgba(150, 118, 56, ${alpha})`
          : mote.warm
            ? `rgba(240, 216, 171, ${alpha})`
            : `rgba(190, 205, 240, ${alpha * 0.8})`;
        ctx.fill();
      }

      // คลื่นตอนคลิก
      const ripples = ripplesRef.current;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        ripple.r += (260 - ripple.r) * (1 - Math.pow(1 - 0.055, step));
        ripple.alpha *= Math.pow(0.955, step);
        if (ripple.alpha < 0.01) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
        ctx.strokeStyle = light
          ? `rgba(150, 118, 56, ${ripple.alpha})`
          : `rgba(230, 200, 148, ${ripple.alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    /*
      แท็บถูกซ่อน = หยุดวาดทั้งหมด

      เบราว์เซอร์หรี่ rAF ให้เองอยู่แล้วก็จริง แต่ "หรี่" ไม่ใช่ "หยุด" —
      และที่สำคัญกว่าคือหน้านี้ถูกเปิดค้างไว้ใน OBS เป็นซีนที่ยังไม่ได้ใช้
      ซึ่ง OBS เรนเดอร์ต่อแม้ไม่ได้แสดงผล เท่ากับเผาซีพียูของเครื่องที่กำลัง
      เข้ารหัสวิดีโออยู่ทิ้งเปล่าๆ ทั้งไลฟ์
    */
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = 0;
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink">
      {/* ไล่โทนพื้น */}
      <div className="scene-base absolute inset-0" />

      {/* ผ้าไหมทองไหล — ชั้นหลักที่ทำให้ภาพไม่นิ่ง */}
      <SilkCanvas />

      {/* ลดความจัดของผ้าไหมลงให้ตัวหนังสืออ่านง่าย */}
      <div className="scene-veil absolute inset-0" />

      {/* ลำแสงนวลจากด้านบน */}
      <div className="scene-top-glow absolute inset-x-0 top-0 h-[70vh]" />

      {/*
        ก้อนแสงลอย — ขยับตามเมาส์แบบหน่วงมาก บวกหายใจเข้าออกช้าๆ

        การหายใจใช้ opacity อย่างเดียว ไม่แตะ scale โดยตั้งใจ:
        สามก้อนนี้เป็นเลเยอร์ blur 140-160px ขนาดหลายร้อยพิกเซล ถ้าขยับ scale
        เบราว์เซอร์ต้องเบลอใหม่ทั้งก้อนทุกเฟรมตลอดเวลาที่หน้าเปิดอยู่
        ส่วน opacity เปลี่ยนได้บน compositor เลย ใช้พื้นผิวที่เบลอไว้แล้วซ้ำได้
        ตาเห็นเหมือนเดิมคือ "แสงเต้นช้าๆ" แต่ราคาต่างกันคนละเรื่อง
      */}
      <Glow
        x={glowX}
        y={glowY}
        anchor={{ left: "34%", top: "-1%" }}
        size="h-184 w-184"
        blur="blur-[150px]"
        tint="rgba(184,146,84,0.32)"
        breathe={[0.34, 0.46, 0.34]}
        seconds={24}
      />
      <Glow
        x={glow2X}
        y={glow2Y}
        anchor={{ left: "75%", top: "69%" }}
        size="h-160 w-160"
        blur="blur-[160px]"
        tint="rgba(84,110,178,0.28)"
        breathe={[0.3, 0.42, 0.3]}
        seconds={31}
      />
      <Glow
        x={glow3X}
        y={glow3Y}
        anchor={{ left: "16%", top: "82%" }}
        size="h-128 w-128"
        blur="blur-[140px]"
        tint="rgba(150,110,190,0.2)"
        breathe={[0.22, 0.34, 0.22]}
        seconds={38}
      />

      {/* แสงกวาดเฉียงผ่านจอช้าๆ */}
      <div className="scene-sweep absolute inset-0" />

      {/* เส้นทองบางพาดบนสุด */}
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(180,145,80,0.45),transparent)]" />

      {/* ฝุ่นทอง */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* เกรน */}
      <div className="grain absolute inset-0 opacity-[0.05] mix-blend-overlay" />

      {/* ขอบมืดรอบจอ */}
      <div className="scene-vignette absolute inset-0" />
    </div>
  );
}

/**
 * ก้อนแสงหนึ่งก้อน — จุดยึดอยู่กับที่ ส่วนที่ขยับเป็น transform ล้วน
 *
 * แยกกล่องนอก (จุดยึด + จัดกึ่งกลางด้วย translate คงที่) ออกจากกล่องใน
 * (ตัวที่ขยับ) เพราะ motion เขียนทับ transform ทั้งก้อน ถ้าเอาการจัดกึ่งกลาง
 * ไปไว้ในตัวเดียวกัน มันจะหายไปทันทีที่เริ่มขยับ
 *
 * การหายใจใช้ opacity อย่างเดียว ไม่แตะ scale — แผ่นเบลอ 150px ถ้าขยับ scale
 * เบราว์เซอร์ต้องเบลอใหม่ทั้งก้อนทุกเฟรม ส่วน opacity เปลี่ยนบน compositor ได้เลย
 */
function Glow({
  x,
  y,
  anchor,
  size,
  blur,
  tint,
  breathe,
  seconds,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  anchor: { left: string; top: string };
  size: string;
  blur: string;
  tint: string;
  breathe: number[];
  seconds: number;
}) {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ ...anchor, transform: "translate(-50%, -50%)" }}
    >
      <motion.div
        className={`rounded-full ${size} ${blur}`}
        style={{
          x,
          y,
          background: `radial-gradient(circle, ${tint} 0%, transparent 68%)`,
        }}
        animate={{ opacity: breathe }}
        transition={{ duration: seconds, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
