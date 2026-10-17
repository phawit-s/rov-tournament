"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { IconCheck } from "./icons";

/**
 * ปุ่มของทั้งเว็บ — ทรงแคปซูลแบบปุ่มในแอปเพลง
 *
 * primary   ดำทึบ (มืด = ขาวทึบ) — หนึ่งปุ่มต่อหนึ่งงาน ห้ามวางสองปุ่มนี้ติดกัน
 * secondary พื้นเทา — งานรองที่อยู่ข้างปุ่มหลัก
 * ghost     ไม่มีพื้น — ยกเลิก ปิด ย้อนกลับ
 * danger    ตัวหนังสือแดงบนพื้นเทา — ลบ ปฏิเสธ (ยืนยันก่อนเสมอ)
 *
 * ชื่อ "outline" ยังรับไว้ให้โค้ดเก่า ถือเป็น secondary
 */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** โชว์เครื่องหมายถูกแทนไอคอนชั่วครู่ — ใช้หลังคัดลอก/บันทึกสำเร็จ */
  success?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-onink shadow-btn hover:opacity-85",
  secondary: "bg-fill text-ink hover:bg-fill-2",
  outline: "bg-fill text-ink hover:bg-fill-2",
  ghost: "text-ink hover:bg-fill",
  danger: "bg-fill text-danger hover:bg-fill-2",
};

/* สูงขั้นต่ำ 44px ทุกขนาดที่ใช้บนมือถือ — sm ไว้ในแถบเครื่องมือของจอกว้างเท่านั้น */
const SIZES: Record<Size, string> = {
  sm: "min-h-9 px-4 text-sm gap-1.5",
  md: "min-h-11 px-5 text-[0.94rem] gap-2",
  lg: "min-h-13 px-7 text-base gap-2",
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    success = false,
    icon,
    className = "",
    children,
    type = "button",
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full font-medium whitespace-nowrap transition-[background-color,opacity,transform] duration-150 select-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-[inherit] ${loading ? "invisible" : ""}`}>
        {success ? <IconCheck className="h-4 w-4" strokeWidth={2.2} /> : icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner />
        </span>
      )}
    </button>
  );
});

export default Button;

/** วงหมุนเล็ก — ใช้สีของตัวหนังสือรอบข้าง */
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}
