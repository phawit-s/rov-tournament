"use client";

/**
 * วงแหวนตัวอักษรหมุนรอบตัวเอง — ใช้ SVG textPath วิ่งรอบวงกลม
 * ชี้เมาส์แล้วหมุนเร็วขึ้น กดแล้วเลื่อนลงไปเนื้อหาถัดไป
 */
export default function RotatingBadge({
  text = "STEAMER HUB · จัดสาย · สุ่มทีม · โดเนท · วงล้อ · ",
  size = 132,
  className = "",
}: {
  text?: string;
  size?: number;
  className?: string;
}) {
  const r = size / 2 - 14;

  const scrollDown = () => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: window.innerHeight * 0.82,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return (
    <button
      type="button"
      onClick={scrollDown}
      aria-label="เลื่อนลงไปดูเนื้อหา"
      className={`group relative grid shrink-0 cursor-pointer place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden
        className="animate-spin-slow transition-[animation-duration,transform] duration-500 group-hover:[animation-duration:6s] group-hover:scale-105"
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
          className="font-display text-iris/70 transition-colors duration-500 group-hover:text-iris"
          style={{ fontSize: 10, letterSpacing: "0.24em" }}
        >
          <textPath href="#badge-circle">{text}</textPath>
        </text>
      </svg>

      {/* ลูกศรตรงกลาง */}
      <span
        aria-hidden
        className="absolute grid h-11 w-11 place-items-center rounded-full border border-iris/35 text-iris transition duration-500 group-hover:border-iris/70 group-hover:bg-iris/10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 transition-transform duration-500 group-hover:translate-y-0.5"
        >
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </span>
    </button>
  );
}
