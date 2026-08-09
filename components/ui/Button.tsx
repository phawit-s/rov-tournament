"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import { sfx } from "@/lib/sound";
import { IconCheck } from "./icons";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** สปินเนอร์ทับตัวหนังสือ ความกว้างปุ่มไม่ขยับ */
  loading?: boolean;
  /** เปลี่ยนไส้ในเป็นเครื่องหมายถูกหนึ่งจังหวะ */
  success?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-onaccent accent-fill shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_34px_-18px_rgba(169,155,255,0.9)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_18px_44px_-18px_rgba(207,167,101,0.95)] hover:brightness-105",
  outline:
    "text-iris border border-iris/30 bg-iris/5 hover:bg-iris/15 hover:border-iris/50",
  ghost: "text-ice/85 border border-hair tile hover-tile hover:text-ice",
  danger:
    "text-danger border border-danger/25 bg-danger/8 hover:bg-danger/14",
};

const SIZES: Record<Size, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-6 py-3 text-sm",
  lg: "px-7 py-3.5 text-base",
};

/** ปุ่มนิ่งๆ มีแค่แสงกวาดเบาๆ ตอน hover ไม่วิ่งตามเมาส์ */
const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    success = false,
    icon,
    className = "",
    children,
    onClick,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onClick={(e) => {
        sfx.unlock();
        sfx.play("click");
        onClick?.(e);
      }}
      className={`group relative isolate inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl font-display font-medium tracking-wide transition-all duration-300 outline-none select-none focus-visible:ring-2 focus-visible:ring-iris/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:text-muted disabled:shadow-none disabled:ring-1 disabled:ring-[rgb(var(--hair)/var(--hair-a))] disabled:hover:translate-y-0 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <span className="absolute inset-y-0 left-0 w-1/4 bg-white/20 opacity-0 blur-md group-hover:animate-sheen group-hover:opacity-100" />
      </span>

      <span
        className={`relative z-10 inline-flex items-center gap-2 transition-opacity duration-200 ${
          loading ? "opacity-0" : ""
        }`}
      >
        {success ? (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 480, damping: 18 }}
            className="inline-flex items-center gap-2"
          >
            <IconCheck className="h-3.5 w-3.5" strokeWidth={2} />
            {children}
          </motion.span>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </span>

      {loading && (
        <span className="absolute inset-0 z-10 grid place-items-center">
          <span className="h-4 w-4 animate-spin rounded-full border border-current/30 border-t-current" />
        </span>
      )}
    </button>
  );
});

export default Button;
