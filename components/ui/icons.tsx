import type { ComponentType, ReactNode } from "react";

type IconProps = { className?: string; strokeWidth?: number };

/**
 * ไอคอนเส้นบางชุดกลางของทั้งเว็บ
 * ทุกตัวเป็น SVG ล้วน ไม่มี state จึงใช้ได้ทั้งฝั่ง server และ client
 * ใช้เป็นลายน้ำขนาดใหญ่ได้ด้วยการส่ง className ขนาดใหญ่ + strokeWidth บางลง
 */
function base(children: ReactNode, className = "h-4 w-4", strokeWidth = 1.6) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconDice = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>,
    className,
    strokeWidth,
  );

export const IconWheel = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3v6.8M12 14.2V21M3 12h6.8M14.2 12H21" />
    </>,
    className,
    strokeWidth,
  );

export const IconTrophy = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4" />
      <path d="M12 14v3M9 20h6M10 17h4l.5 3h-5z" />
    </>,
    className,
    strokeWidth,
  );

export const IconUsers = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.6A5.5 5.5 0 0 1 20.5 19" />
    </>,
    className,
    strokeWidth,
  );

export const IconMonitor = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2.4" />
      <path d="M9 20h6M12 16.5V20" />
    </>,
    className,
    strokeWidth,
  );

export const IconHeart = ({ className, strokeWidth }: IconProps) =>
  base(
    <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
    className,
    strokeWidth,
  );

export const IconClock = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2V12l3.2 2" />
    </>,
    className,
    strokeWidth,
  );

export const IconSun = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
    </>,
    className,
    strokeWidth,
  );

export const IconMoon = ({ className, strokeWidth }: IconProps) =>
  base(
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />,
    className,
    strokeWidth,
  );

export const IconVolume = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M4 9.5h3L11 6v12l-4-3.5H4z" />
      <path d="M14.6 9.2a4 4 0 0 1 0 5.6M17.2 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>,
    className,
    strokeWidth,
  );

export const IconMute = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M4 9.5h3L11 6v12l-4-3.5H4z" />
      <path d="M15.5 10l4 4M19.5 10l-4 4" />
    </>,
    className,
    strokeWidth,
  );

export const IconCopy = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M15 9V6.4A2.4 2.4 0 0 0 12.6 4H6.4A2.4 2.4 0 0 0 4 6.4v6.2A2.4 2.4 0 0 0 6.4 15H9" />
    </>,
    className,
    strokeWidth,
  );

export const IconCheck = ({ className, strokeWidth }: IconProps) =>
  base(<path d="M4.5 12.5l5 5 10-11" />, className, strokeWidth);

export const IconChevronDown = ({ className, strokeWidth }: IconProps) =>
  base(<path d="M6 9.5l6 6 6-6" />, className, strokeWidth);

export const IconExternal = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
    </>,
    className,
    strokeWidth,
  );

export const IconMore = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>,
    className,
    strokeWidth,
  );

export const IconLock = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <circle cx="12" cy="15.2" r="1.1" fill="currentColor" stroke="none" />
    </>,
    className,
    strokeWidth,
  );

export const IconUnlock = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" />
      <path d="M8 10.5V7.8a4 4 0 0 1 7.7-1.5" />
      <circle cx="12" cy="15.2" r="1.1" fill="currentColor" stroke="none" />
    </>,
    className,
    strokeWidth,
  );

/* ---------- ไอคอนตำแหน่งในทีม ---------- */

export const LaneDark = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M14.5 3.5L20 9l-8.5 8.5" />
      <path d="M4 20l3.6-3.6M6.4 14.2l3.4 3.4" />
    </>,
    className,
    strokeWidth,
  );

export const LaneJungle = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M19 5c0 7-4.6 11.4-10 11.4C9 10 13.2 5.6 19 5z" />
      <path d="M5 20c1.4-3.6 3.4-6.2 6-8" />
    </>,
    className,
    strokeWidth,
  );

export const LaneMid = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M12 3l2 6.6 6.6 2-6.6 2-2 6.6-2-6.6-6.6-2 6.6-2z" />
    </>,
    className,
    strokeWidth,
  );

export const LaneAbyss = ({ className, strokeWidth }: IconProps) =>
  base(
    <>
      <path d="M20 4l-9.5 9.5" />
      <path d="M14.5 4H20v5.5" />
      <path d="M4.5 12a7.5 7.5 0 0 0 7.5 7.5" />
    </>,
    className,
    strokeWidth,
  );

export const LaneSupport = ({ className, strokeWidth }: IconProps) =>
  base(
    <path d="M12 3.5l7 2.6v5.2c0 4.2-2.9 7.5-7 9.2-4.1-1.7-7-5-7-9.2V6.1z" />,
    className,
    strokeWidth,
  );

export const LANE_ICON: Record<string, ComponentType<IconProps>> = {
  dark: LaneDark,
  jungle: LaneJungle,
  mid: LaneMid,
  abyss: LaneAbyss,
  support: LaneSupport,
};
