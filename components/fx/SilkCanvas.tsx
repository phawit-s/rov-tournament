"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * ผ้าไหมทองไหลช้าๆ — generative ล้วน ไม่ต้องโหลดไฟล์วิดีโอ
 *
 * เทคนิค: value noise หลายชั้น (fBm) แล้วบิดพิกัดด้วย noise อีกชุด (domain warp)
 * ได้ลายคล้ายหินอ่อน/ผ้าไหมที่ไหลไม่ซ้ำเดิม
 *
 * เรนเดอร์ที่ความละเอียดต่ำมาก (~220px) แล้วให้เบราว์เซอร์ขยายเต็มจอ
 * เลยใช้ CPU น้อย และการขยายก็ช่วยเบลอให้ดูนุ่มพอดี
 */
export default function SilkCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;

    const W = 220;
    let H = 124;
    let image = ctx.createImageData(W, H);
    let raf = 0;
    let last = 0;
    let t = 0;

    const resize = () => {
      const ratio = window.innerHeight / Math.max(1, window.innerWidth);
      H = Math.max(90, Math.min(240, Math.round(W * ratio)));
      canvas.width = W;
      canvas.height = H;
      image = ctx.createImageData(W, H);
    };

    resize();
    window.addEventListener("resize", resize);

    // ---- value noise ----
    const hash = (x: number, y: number) => {
      let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };

    const smooth = (v: number) => v * v * (3 - 2 * v);

    const noise = (x: number, y: number) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = smooth(x - xi);
      const yf = smooth(y - yi);
      const a = hash(xi, yi);
      const b = hash(xi + 1, yi);
      const c = hash(xi, yi + 1);
      const d = hash(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };

    const fbm = (x: number, y: number) => {
      let sum = 0;
      let amp = 0.5;
      let fx = x;
      let fy = y;
      for (let i = 0; i < 4; i++) {
        sum += noise(fx, fy) * amp;
        fx *= 2.02;
        fy *= 2.02;
        amp *= 0.5;
      }
      return sum;
    };

    // จุดสีของธีมมืดและธีมสว่าง (จาก a ไป b ไป c ตามความเข้มของ noise)
    const PALETTE = {
      dark: [
        [8, 8, 15],
        [26, 27, 52],
        [92, 74, 40],
        [214, 178, 116],
      ],
      light: [
        [246, 243, 236],
        [232, 226, 210],
        [214, 190, 140],
        [176, 142, 78],
      ],
    } as const;

    const mix = (
      a: readonly number[],
      b: readonly number[],
      k: number,
      out: number[],
    ) => {
      out[0] = a[0] + (b[0] - a[0]) * k;
      out[1] = a[1] + (b[1] - a[1]) * k;
      out[2] = a[2] + (b[2] - a[2]) * k;
    };

    const rgb: number[] = [0, 0, 0];

    const render = (time: number) => {
      // จำกัดที่ ~30fps พอ ภาพเคลื่อนช้าอยู่แล้ว
      if (time - last < 33) {
        raf = requestAnimationFrame(render);
        return;
      }
      last = time;
      if (!reduced) t = time * 0.000045;

      const light = document.documentElement.dataset.theme === "light";
      const stops = light ? PALETTE.light : PALETTE.dark;
      const data = image.data;

      for (let y = 0; y < H; y++) {
        const ny = (y / H) * 2.6;
        for (let x = 0; x < W; x++) {
          const nx = (x / W) * 4.2;

          // domain warp: บิดพิกัดด้วย noise อีกชุดก่อนค่อยสุ่มสีจริง
          const qx = fbm(nx + 0.0, ny + 0.0);
          const qy = fbm(nx + 3.7, ny + 1.3);
          const rx = fbm(nx + 3.4 * qx + t * 1.4, ny + 3.4 * qy - t);
          const ry = fbm(nx + 3.4 * qx + 1.7 - t, ny + 3.4 * qy + 9.2 + t * 0.8);
          let v = fbm(nx + 2.4 * rx, ny + 2.4 * ry);

          // ดันคอนทราสต์ให้ลายชัดขึ้นนิด
          v = Math.min(1, Math.max(0, (v - 0.28) * 1.9));

          if (v < 0.5) mix(stops[0], stops[1], v * 2, rgb);
          else if (v < 0.8) mix(stops[1], stops[2], (v - 0.5) / 0.3, rgb);
          else mix(stops[2], stops[3], (v - 0.8) / 0.2, rgb);

          const i = (y * W + x) * 4;
          data[i] = rgb[0];
          data[i + 1] = rgb[1];
          data[i + 2] = rgb[2];
          data[i + 3] = 255;
        }
      }

      ctx.putImageData(image, 0, 0);
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="silk-layer absolute inset-0 h-full w-full scale-110 object-cover"
    />
  );
}
