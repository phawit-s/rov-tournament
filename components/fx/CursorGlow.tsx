"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useMediaQuery } from "@/hooks/useClient";

/** เคอร์เซอร์เรืองแสง — เฉพาะเครื่องที่มีเมาส์จริง */
export default function CursorGlow() {
  const enabled = useMediaQuery("(pointer: fine)");
  const [hot, setHot] = useState(false);
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 260, damping: 26, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 260, damping: 26, mass: 0.6 });

  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = e.target as HTMLElement | null;
      setHot(
        !!el?.closest?.(
          'button, a, input, select, textarea, [role="button"], [data-cursor="hot"]',
        ),
      );
    };
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-70 h-2 w-2 rounded-full bg-cyan mix-blend-screen"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
        animate={{ scale: pressed ? 0.5 : hot ? 1.6 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-69 rounded-full mix-blend-screen"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
          width: 40,
          height: 40,
          border: "1px solid rgba(34,211,238,0.55)",
          boxShadow: "0 0 24px rgba(34,211,238,0.35)",
        }}
        animate={{
          scale: pressed ? 0.75 : hot ? 1.7 : 1,
          opacity: hot ? 0.95 : 0.55,
          borderColor: hot ? "rgba(168,85,247,0.85)" : "rgba(34,211,238,0.55)",
        }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
      />
    </>
  );
}
