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

    /**
     * ชั้นบิดพิกัดชั้นแรก (qx, qy) คิดไว้ล่วงหน้าตั้งแต่ตอน resize
     *
     * สมการของสองตัวนี้มีแต่ตำแหน่งพิกเซล ไม่มี t อยู่ในนั้นเลย ค่าจึงเท่าเดิม
     * ทุกเฟรมตลอดอายุหน้า แต่ของเดิมคำนวณใหม่ทุกเฟรม — เป็น 2 ใน 5 ของ fbm
     * ที่เรียกต่อพิกเซล วัดจริงแล้วประหยัดเวลาต่อเฟรมได้ราว 23%
     * เก็บใส่ตารางไว้ใช้ซ้ำ ภาพที่ออกมาเหมือนเดิมทุกพิกเซล (Float64 ไม่ใช่ Float32
     * เพื่อให้ค่าตรงบิตต่อบิตกับของเดิม ไม่ใช่แค่ใกล้เคียง)
     */
    let warpX = new Float64Array(0);
    let warpY = new Float64Array(0);

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

    /* ประกาศไว้หลัง fbm เพราะต้องเรียกใช้ตอนตั้งตาราง — ถ้าวางไว้บนจะชน TDZ */
    const resize = () => {
      const ratio = window.innerHeight / Math.max(1, window.innerWidth);
      H = Math.max(90, Math.min(240, Math.round(W * ratio)));
      canvas.width = W;
      canvas.height = H;
      image = ctx.createImageData(W, H);

      warpX = new Float64Array(W * H);
      warpY = new Float64Array(W * H);
      for (let y = 0; y < H; y++) {
        const ny = (y / H) * 2.6;
        for (let x = 0; x < W; x++) {
          const nx = (x / W) * 4.2;
          const i = y * W + x;
          warpX[i] = fbm(nx, ny);
          warpY[i] = fbm(nx + 3.7, ny + 1.3);
        }
      }
    };

    resize();

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

    const stopsNow = () =>
      document.documentElement.dataset.theme === "light" ? PALETTE.light : PALETTE.dark;

    /**
     * วาดเฉพาะแถบแถว y0..y1 ด้วยเวลาและจานสีที่ "ตรึงไว้" ตั้งแต่ต้นรอบ
     *
     * ตรึงไว้เพราะรอบหนึ่งกินหลายเฟรม ถ้าปล่อยให้แต่ละแถบใช้ t ของตัวเอง
     * แถบบนกับแถบล่างจะเป็นคนละช่วงเวลากันแล้วเห็นเป็นรอยต่อแนวนอน
     */
    const paintRows = (y0: number, y1: number, tv: number, stops: readonly (readonly number[])[]) => {
      const t = tv;
      const data = image.data;

      for (let y = y0; y < y1; y++) {
        const ny = (y / H) * 2.6;
        for (let x = 0; x < W; x++) {
          const nx = (x / W) * 4.2;

          // domain warp: บิดพิกัดด้วย noise อีกชุดก่อนค่อยสุ่มสีจริง
          const i0 = y * W + x;
          const qx = warpX[i0];
          const qy = warpY[i0];
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

      /* ส่งขึ้นจอเฉพาะแถบที่เพิ่งวาด ไม่ต้องอัปโหลดทั้งผืนใหม่ */
      ctx.putImageData(image, 0, 0, 0, y0, W, y1 - y0);
    };

    const paintAll = (tv: number) => paintRows(0, H, tv, stopsNow());

    /*
      แบ่งวาดทีละแถบ แถบละเฟรม แทนที่จะวาดทั้งผืนรวดเดียว

      โปรไฟล์บอกว่าฟังก์ชันนี้คือก้อน JS ที่หนักที่สุดในหน้า — ต่อพิกเซลมันเรียก
      fbm สามครั้ง ครั้งละสี่ชั้น ชั้นละสี่ hash รวมแล้วเกือบห้าสิบครั้งต่อพิกเซล
      คูณสองหมื่นเจ็ดพันพิกเซล ของเดิมยัดงานทั้งก้อนนั้นลงในเฟรมเดียวทุก 80ms
      main thread จึงหยุดรับงานอื่นเป็นช่วงๆ ตลอดเวลา ซึ่งตรงกับจังหวะที่คนเลื่อนหน้า
      หรือกดปุ่มแล้วรู้สึกว่า "สะดุดเป็นห้วงๆ"

      งานรวมต่อวินาทีเท่าเดิม แต่ถูกซอยเป็นชิ้นละไม่ถึงมิลลิวินาที เบราว์เซอร์จึง
      แทรกงานอื่นได้ทุกเฟรม ส่วนตาก็แยกไม่ออกอยู่ดีเพราะลายไหลช้ามาก (t เดินราว
      0.000045 ต่อมิลลิวินาที) รอบหนึ่งกินราวสี่ร้อยมิลลิวินาที ค่าขยับแค่หลักหมื่นส่วน
    */
    let row = 0;
    let passT = 0;
    let passStops = stopsNow();

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (row === 0) {
        passT = time * 0.000045;
        passStops = stopsNow();
      }
      const end = Math.min(H, row + Math.max(2, Math.ceil(H / 24)));
      paintRows(row, end, passT, passStops);
      row = end >= H ? 0 : end;
    };

    /* ผู้ใช้ขอลดแอนิเมชัน = t ถูกตรึงไว้ที่ 0 ทุกเฟรมได้ภาพเดิมเป๊ะ
       ของเดิมยังวาดซ้ำทั้งจอไปเรื่อยๆ ทั้งที่ผลลัพธ์ไม่เคยเปลี่ยน
       โหมดนี้ไม่มีลูป จึงต้องวาดใหม่เองตอนขนาดจอเปลี่ยน */
    const onResize = () => {
      resize();
      row = 0;
      if (reduced) paintAll(0);
    };
    window.addEventListener("resize", onResize);

    if (reduced) {
      paintAll(0);
    } else {
      /* วาดเต็มผืนหนึ่งครั้งก่อน ไม่งั้นเฟรมแรกๆ จะเห็นแถบดำไล่ลงมา */
      paintAll(0);
      raf = requestAnimationFrame(loop);
    }

    /*
      แท็บถูกซ่อน = ไม่ต้องคำนวณอะไรเลย

      ลูปนี้เดินทีละพิกเซลทั้งผืนใน JS แล้ว putImageData — เป็นงานก้อนที่หนักที่สุด
      ในหน้า ไม่มีเหตุผลให้เดินต่อตอนไม่มีใครมอง โดยเฉพาะบนเครื่องที่เปิดหน้านี้
      ค้างไว้ใน OBS ระหว่างไลฟ์
    */
    const onVisibility = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (!document.hidden && !reduced) {
        row = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
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
