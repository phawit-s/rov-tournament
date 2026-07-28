"use client";

import { useCallback, useEffect, useRef } from "react";
import { identityFor } from "@/lib/rov";
import { sfx } from "@/lib/sound";
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
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 10;
    const isLight =
      typeof document !== "undefined" &&
      document.documentElement.dataset.theme === "light";

    if (entries.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isLight ? "rgba(32,26,16,0.15)" : "rgba(255,255,255,0.12)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const segs = segments(entries, useWeights);

    segs.forEach((seg, i) => {
      const identity = identityFor(i);
      const start = seg.start + rotation;
      const end = seg.end + rotation;
      const isWinner = winnerIndex === i;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
      const [r, g, b] = identity.rgb.split(" ").map(Number);
      // ธีมสว่างต้องเข้มกว่า ไม่งั้นตัวหนังสือขาวอ่านไม่ออก
      const inner = isLight ? (isWinner ? 0.85 : 0.62) : isWinner ? 0.55 : 0.28;
      const outer = isLight ? (isWinner ? 1 : 0.9) : isWinner ? 0.95 : 0.62;
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
        Math.min(21, radius * 0.11, (arc * radius) / 2.1),
      );
      ctx.font = `500 ${fontSize}px 'IBM Plex Sans Thai', 'Segoe UI', sans-serif`;
      ctx.fillStyle = isWinner ? "#fff" : "rgba(255,255,255,0.94)";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      const maxWidth = radius - 46;
      let text = label;
      while (text.length > 2 && ctx.measureText(text).width > maxWidth) {
        text = text.slice(0, -1);
      }
      ctx.fillText(text === label ? text : `${text}…`, radius - 18, 0);
      ctx.restore();
    });

    // ขอบวง
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(207,167,101,0.75)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(242,220,176,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ดุมกลาง
    const hubR = radius * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
    const hub = ctx.createLinearGradient(cx - hubR, cy - hubR, cx + hubR, cy + hubR);
    hub.addColorStop(0, "#f2dcb0");
    hub.addColorStop(0.55, "#d9b273");
    hub.addColorStop(1, "#9a7a44");
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [entries, rotation, useWeights, winnerIndex]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // เสียงติ๊กเวลาผ่านแต่ละช่อง
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
    }
  }, [rotation, spinning, entries, useWeights]);

  const angleFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.atan2(
      e.clientY - (rect.top + rect.height / 2),
      e.clientX - (rect.left + rect.width / 2),
    );
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-130">
      {/* เข็มชี้ */}
      <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2">
        <div
          className="h-0 w-0"
          style={{
            borderLeft: "13px solid transparent",
            borderRight: "13px solid transparent",
            borderTop: "26px solid #e6c894",
            filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))",
          }}
        />
      </div>

      <canvas
        ref={canvasRef}
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
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
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
    </div>
  );
}

function normalize(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}
