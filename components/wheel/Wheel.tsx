"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { identityFor } from "@/lib/game";
import { sfx } from "@/lib/sound";
import { themeStore } from "@/lib/theme";
import { segments, type WheelEntry } from "@/lib/wheel";

type Props = {
  entries: WheelEntry[];
  useWeights: boolean;
  /** มุมหมุนปัจจุบัน (เรเดียน) */
  rotation: number;
  spinning: boolean;
  /** index ผู้ชนะตอนหยุด ใช้ไฮไลต์ */
  winnerIndex: number | null;
  onFlick?: (velocity: number) => void;
};

const POINTER_ANGLE = -Math.PI / 2;
const TWO_PI = Math.PI * 2;
/** จำนวนช่องผีตอนยังไม่มีชื่อ — พื้นที่ใหญ่สุดของหน้าต้องไม่ว่างเปล่า */
const GHOST = 8;
/** เกินจำนวนนี้หมุดกลมจะชิดกันจนกลายเป็นขอบทึบ เปลี่ยนเป็นขีดสั้นแทน */
const PEG_LIMIT = 16;

/** วงล้อวาดด้วย canvas — สะบัดเมาส์เพื่อหมุนได้ */
export default function Wheel({
  entries,
  useWeights,
  rotation,
  spinning,
  winnerIndex,
  onFlick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTickRef = useRef(0);
  const reduced = useReducedMotion();
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  /** มุมสะบัดของเข็ม — ทุกครั้งที่ผ่านหมุดจะดีดกลับแล้วสปริงเข้าที่ */
  const kick = useSpring(0, { stiffness: 420, damping: 20 });

  const drag = useRef<{
    active: boolean;
    lastAngle: number;
    lastTime: number;
    velocity: number;
  }>({ active: false, lastAngle: 0, lastTime: 0, velocity: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.clientWidth;
    if (!size) return;
    const px = Math.round(size * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    // บ่าวงล้อกินพื้นที่จริง หน้าปัดจึงเล็กลงเท่าความหนาของบ่า
    const radius = size / 2 - 8;
    const rimW = Math.max(9, Math.min(16, size * 0.036));
    const faceR = radius - rimW;
    const pegR = radius - rimW / 2;
    const isLight = theme === "light";

    const segs = entries.length > 0 ? segments(entries, useWeights) : [];

    if (segs.length === 0) {
      // ช่องผี — ใช้สีทีมชุดเดียวกับตอนมีชื่อจริง จะได้รู้ว่าหน้าตาจะออกมาแบบไหน
      for (let i = 0; i < GHOST; i++) {
        const start = (TWO_PI * i) / GHOST + rotation;
        const end = (TWO_PI * (i + 1)) / GHOST + rotation;
        const [r, g, b] = identityFor(i).rgb.split(" ").map(Number);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, faceR, start, end);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},${isLight ? 0.18 : 0.12})`;
        ctx.fill();
        ctx.strokeStyle = isLight
          ? "rgba(255,255,255,0.6)"
          : "rgba(10,10,14,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    segs.forEach((seg, i) => {
      const identity = identityFor(i);
      const start = seg.start + rotation;
      const end = seg.end + rotation;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, faceR, start, end);
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, faceR * 0.15, cx, cy, faceR);
      const [r, g, b] = identity.rgb.split(" ").map(Number);
      // ธีมสว่างต้องเข้มกว่า ไม่งั้นตัวหนังสือขาวอ่านไม่ออก
      const inner = isLight ? 0.62 : 0.28;
      const outer = isLight ? 0.9 : 0.62;
      grad.addColorStop(0, `rgba(${r},${g},${b},${inner})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${outer})`);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = isLight ? "rgba(255,255,255,0.75)" : "rgba(10,10,14,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ชื่อ
      const label = seg.entry.name;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(seg.mid + rotation);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const arc = seg.end - seg.start;
      const fontSize = Math.max(
        11,
        Math.min(21, faceR * 0.12, (arc * faceR) / 2.1),
      );
      ctx.font = `500 ${fontSize}px 'IBM Plex Sans Thai', 'Segoe UI', sans-serif`;
      ctx.fillStyle = winnerIndex === i ? "#fff" : "rgba(255,255,255,0.94)";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      const maxWidth = faceR - 40;
      let text = label;
      while (text.length > 2 && ctx.measureText(text).width > maxWidth) {
        text = text.slice(0, -1);
      }
      ctx.fillText(text === label ? text : `${text}…`, faceR - 14, 0);
      ctx.restore();
    });

    // ไฮไลต์ผู้ชนะ — เรืองแสงเฉพาะช่องที่ออก ไม่ใช่แค่เพิ่มความทึบของสีจนแยกไม่ออก
    const wi = winnerIndex;
    const win = wi != null ? segs[wi] : undefined;
    if (win && wi != null) {
      const [r, g, b] = identityFor(wi).rgb.split(" ").map(Number);
      const start = win.start + rotation;
      const end = win.end + rotation;
      ctx.save();
      ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, faceR - 3, start, end);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, faceR - 1, start, end);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // บ่าวงล้อ — วงแหวนหนาไล่เฉดทองแทนเส้นขอบบางๆ
    const rim = ctx.createLinearGradient(
      cx - radius,
      cy - radius,
      cx + radius,
      cy + radius,
    );
    rim.addColorStop(0, "#f2dcb0");
    rim.addColorStop(0.5, "#cfa765");
    rim.addColorStop(1, "#9a7a44");
    ctx.beginPath();
    ctx.arc(cx, cy, pegR, 0, TWO_PI);
    ctx.strokeStyle = rim;
    ctx.lineWidth = rimW;
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.strokeStyle = "rgba(38,28,10,0.45)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, TWO_PI);
    ctx.strokeStyle = "rgba(38,28,10,0.5)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, faceR + 1.5, 0, TWO_PI);
    ctx.strokeStyle = "rgba(255,248,234,0.3)";
    ctx.stroke();

    // หมุด 1 เม็ดต่อ 1 ช่อง ตรงกับเสียงติ๊กที่เล่นตอนเข็มผ่านรอยต่อช่อง
    const pegAngles =
      segs.length > 0
        ? segs.map((s) => s.start + rotation)
        : Array.from({ length: GHOST }, (_, i) => (TWO_PI * i) / GHOST + rotation);
    const dense = pegAngles.length > PEG_LIMIT;

    for (const a of pegAngles) {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      if (dense) {
        ctx.beginPath();
        ctx.moveTo(cx + cos * (pegR - 2), cy + sin * (pegR - 2));
        ctx.lineTo(cx + cos * (pegR + 2), cy + sin * (pegR + 2));
        ctx.strokeStyle = "rgba(42,31,12,0.7)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        continue;
      }
      const x = cx + cos * pegR;
      const y = cy + sin * pegR;
      ctx.beginPath();
      ctx.arc(x, y + 1, 2.6, 0, TWO_PI);
      ctx.fillStyle = "rgba(40,28,10,0.45)";
      ctx.fill();
      const peg = ctx.createRadialGradient(x - 1, y - 1, 0.3, x, y, 2.5);
      peg.addColorStop(0, "#fffaf0");
      peg.addColorStop(1, "#d6c199");
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, TWO_PI);
      ctx.fillStyle = peg;
      ctx.fill();
    }

    // ดุมกลาง
    const hubR = Math.max(13, faceR * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, hubR + 3, 0, TWO_PI);
    ctx.fillStyle = "rgba(10,8,4,0.45)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, TWO_PI);
    const hub = ctx.createLinearGradient(cx - hubR, cy - hubR, cx + hubR, cy + hubR);
    hub.addColorStop(0, "#f2dcb0");
    hub.addColorStop(0.55, "#d9b273");
    hub.addColorStop(1, "#9a7a44");
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, hubR * 0.32, 0, TWO_PI);
    ctx.fillStyle = "rgba(40,28,10,0.35)";
    ctx.fill();
  }, [entries, rotation, theme, useWeights, winnerIndex]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ResizeObserver จับได้ทั้งตอนย่อจอและตอนคอลัมน์ข้างๆ เปลี่ยนความกว้าง
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // เสียงติ๊กเวลาผ่านแต่ละช่อง พร้อมดีดเข็มให้เห็นว่าชนหมุดจริง
  useEffect(() => {
    if (!spinning || entries.length === 0) return;
    const segs = segments(entries, useWeights);
    const passed = segs.findIndex((seg) => {
      const a = normalize(seg.start + rotation - POINTER_ANGLE);
      return a >= 0 && a < seg.end - seg.start;
    });
    if (passed !== -1 && passed !== lastTickRef.current) {
      lastTickRef.current = passed;
      sfx.play("tick");
      if (!reduced) {
        kick.jump(-14);
        kick.set(0);
      }
    }
  }, [rotation, spinning, entries, useWeights, kick, reduced]);

  const angleFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.atan2(
      e.clientY - (rect.top + rect.height / 2),
      e.clientX - (rect.left + rect.width / 2),
    );
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-130">
      {/* เข็มชี้ — แกนหมุดทองกับใบเข็ม ไม่ใช่สามเหลี่ยมจาก border */}
      <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2">
        <motion.div style={{ rotate: kick, transformOrigin: "17px 11px" }}>
          <svg
            width="34"
            height="44"
            viewBox="0 0 34 44"
            aria-hidden
            style={{ filter: "drop-shadow(0 4px 7px rgba(0,0,0,0.55))" }}
          >
            <defs>
              <linearGradient id="wheel-blade" x1="0" y1="0" x2="1" y2="0.6">
                <stop offset="0" stopColor="#f2dcb0" />
                <stop offset="0.5" stopColor="#dcb87c" />
                <stop offset="1" stopColor="#9a7a44" />
              </linearGradient>
              <linearGradient id="wheel-pivot" x1="0.2" y1="0" x2="0.8" y2="1">
                <stop offset="0" stopColor="#fdf1d8" />
                <stop offset="0.55" stopColor="#d9b273" />
                <stop offset="1" stopColor="#8d6f3d" />
              </linearGradient>
            </defs>
            <path d="M17 44 L8 13 L26 13 Z" fill="url(#wheel-blade)" />
            <path d="M17 44 L17 13 L26 13 Z" fill="#2b1f0c" opacity="0.2" />
            <circle
              cx="17"
              cy="11"
              r="9"
              fill="url(#wheel-pivot)"
              stroke="rgba(30,22,8,0.45)"
              strokeWidth="1"
            />
            <circle cx="17" cy="11" r="2.6" fill="rgba(30,22,8,0.4)" />
          </svg>
        </motion.div>
      </div>

      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          entries.length > 0
            ? `วงล้อ ${entries.length} ชื่อ`
            : "วงล้อยังไม่มีชื่อ"
        }
        className={`h-full w-full ${spinning ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (spinning || !onFlick) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            active: true,
            lastAngle: angleFrom(e),
            lastTime: performance.now(),
            velocity: 0,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current.active) return;
          const now = performance.now();
          const angle = angleFrom(e);
          let delta = angle - drag.current.lastAngle;
          if (delta > Math.PI) delta -= TWO_PI;
          if (delta < -Math.PI) delta += TWO_PI;
          const dt = Math.max(1, now - drag.current.lastTime);
          drag.current.velocity = (delta / dt) * 1000;
          drag.current.lastAngle = angle;
          drag.current.lastTime = now;
        }}
        onPointerUp={() => {
          if (!drag.current.active) return;
          const v = drag.current.velocity;
          drag.current.active = false;
          if (Math.abs(v) > 1.2) onFlick?.(v);
        }}
        onPointerCancel={() => {
          drag.current.active = false;
        }}
      />

      {/* ข้อความต้องอยู่ใต้ดุมกลาง ไม่งั้นดุมทองทับจนอ่านไม่ออก */}
      {entries.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[63%] text-center">
          <p className="slug">Empty wheel</p>
          <p className="mt-1.5 text-sm text-muted">ใส่ชื่อเพื่อเริ่ม</p>
        </div>
      )}
    </div>
  );
}

function normalize(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}
