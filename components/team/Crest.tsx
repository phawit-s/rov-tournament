import type { TeamIdentity } from "@/lib/types";
import { CREST_POLY, CREST_SPEC, mixWhite, shade } from "@/lib/crest";

const poly = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");

/**
 * ตราประจำทีม — วงแหวนมีขีดองศา ครอบแกนหกเหลี่ยมเจียระไน
 * ใช้ร่วมกันทั้งกระดานทีม สายแข่ง วงล้อ และรูป export (เวอร์ชัน canvas อยู่ใน lib/crest)
 */
export default function Crest({
  identity,
  size = 40,
  locked = false,
  showShort = false,
  className = "",
}: {
  identity: TeamIdentity;
  size?: number;
  locked?: boolean;
  showShort?: boolean;
  className?: string;
}) {
  const gid = `crest-${identity.short}`;
  const ticks = size >= 32;

  const svg = (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={identity.name}
      className={showShort ? "" : className}
    >
      <defs>
        <linearGradient id={gid} x1="18%" y1="6%" x2="82%" y2="94%">
          <stop offset="0" stopColor={mixWhite(identity.hex, 0.35)} />
          <stop offset="0.48" stopColor={identity.hex} />
          <stop offset="1" stopColor={shade(identity.hex, -0.4)} />
        </linearGradient>
      </defs>

      <circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke={`rgb(${identity.rgb} / 0.45)`}
        strokeWidth="1"
      />

      {ticks &&
        Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
          const r1 = i % 3 === 0 ? 30 : 29;
          return (
            <line
              key={i}
              x1={32 + Math.cos(a) * 26}
              y1={32 + Math.sin(a) * 26}
              x2={32 + Math.cos(a) * r1}
              y2={32 + Math.sin(a) * r1}
              stroke={`rgb(${identity.rgb} / 0.3)`}
              strokeWidth="0.8"
            />
          );
        })}

      <polygon points={poly(CREST_POLY)} fill={`url(#${gid})`} />
      <polygon points={poly(CREST_SPEC)} fill="#fff" opacity="0.18" />

      {locked && (
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="rgb(var(--accent) / 0.7)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );

  if (!showShort) return svg;

  return (
    <span className={`inline-grid justify-items-center gap-1 ${className}`}>
      {svg}
      <span className="slug text-[9px]">{identity.short}</span>
    </span>
  );
}
