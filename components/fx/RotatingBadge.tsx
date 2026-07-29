"use client";

/**
 * วงแหวนตัวอักษรหมุนรอบตัวเอง — ใช้ SVG textPath วิ่งรอบวงกลม
 * เอาไว้วางแถวปุ่มหลัก ให้หน้าจอมีจุดที่เคลื่อนไหวตลอด
 */
export default function RotatingBadge({
  text = "ROV TOURNAMENT HUB · จัดสาย · สุ่มทีม · โดเนท · ",
  size = 132,
  className = "",
}: {
  text?: string;
  size?: number;
  className?: string;
}) {
  const r = size / 2 - 14;

  return (
    <div
      className={`pointer-events-none relative grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="animate-spin-slow"
      >
        <defs>
          <path
            id="badge-circle"
            fill="none"
            d={`M ${size / 2} ${size / 2} m -${r} 0 a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 -${r * 2} 0`}
          />
        </defs>
        <text
          fill="currentColor"
          className="font-display text-champagne/70"
          style={{ fontSize: 10, letterSpacing: "0.24em" }}
        >
          <textPath href="#badge-circle">{text}</textPath>
        </text>
      </svg>

      {/* ลูกศรตรงกลาง */}
      <span className="absolute grid h-11 w-11 place-items-center rounded-full border border-champagne/35 text-champagne">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
