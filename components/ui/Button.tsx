"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { sfx } from "@/lib/sound";

type Variant = "primary" | "outline" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-[#1b1509] bg-[linear-gradient(180deg,#f2dcb0_0%,#d9b273_52%,#bd9350_100%)] shadow-[0_12px_34px_-18px_rgba(207,167,101,0.9)] hover:brightness-105",
  outline:
    "text-champagne border border-champagne/30 bg-champagne/5 hover:bg-champagne/15 hover:border-champagne/50",
  ghost:
    "text-ice/85 border border-hair tile hover-tile hover:text-ice",
  danger:
    "text-[#e79a9a] border border-[#e79a9a]/25 bg-[#e79a9a]/8 hover:bg-[#e79a9a]/14",
};

/** ปุ่มนิ่งๆ มีแค่แสงกวาดเบาๆ ตอน hover ไม่วิ่งตามเมาส์ */
const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className = "", children, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      onClick={(e) => {
        sfx.unlock();
        sfx.play("click");
        onClick?.(e);
      }}
      className={`group relative isolate inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3 font-display text-sm font-medium tracking-wide transition-all duration-300 outline-none select-none focus-visible:ring-2 focus-visible:ring-champagne/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:saturate-0 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <span className="absolute inset-y-0 left-0 w-1/4 bg-white/20 opacity-0 blur-md group-hover:animate-sheen group-hover:opacity-100" />
      </span>
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
});

export default Button;
