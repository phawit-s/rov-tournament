import { safeImageSrc } from "@/lib/safe";
import { thumbUrl } from "@/lib/song/youtube";
import { IconMusic } from "./icons";

/**
 * ปกเพลง — รูปย่อของคลิป YouTube
 *
 * ปกคือสีเดียวในหน้า (docs/DESIGN.md ข้อ 1) จึงไม่ใส่กรอบ ไม่ใส่เงา ไม่ทับข้อความ
 * รูปย่อ YouTube เป็น 16:9 เสมอ ครอปเป็นสี่เหลี่ยมจัตุรัสได้ (`square`)
 * แบบแอปเพลงเมื่ออยากได้ทรงปกอัลบั้ม — ภาพหลักอยู่กลางเฟรมเกือบทุกคลิป
 */
export default function Cover({
  videoId,
  size = "md",
  square = false,
  className = "",
  priority = false,
}: {
  videoId: string | null | undefined;
  size?: "sm" | "md" | "lg";
  square?: boolean;
  className?: string;
  /** โหลดทันที — ใช้กับปกใหญ่ที่อยู่บนสุดของหน้า */
  priority?: boolean;
}) {
  const radius = size === "sm" ? "rounded-thumb" : "rounded-art";
  const shape = square ? "aspect-square" : "aspect-video";
  const src = videoId ? safeImageSrc(thumbUrl(videoId, size === "lg" ? "hq" : "mq")) : null;

  if (!src) {
    return (
      <span
        className={`grid shrink-0 place-items-center bg-fill text-faint ${shape} ${radius} ${className}`}
        aria-hidden
      >
        <IconMusic className={size === "sm" ? "h-4 w-4" : "h-7 w-7"} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`shrink-0 bg-fill object-cover ${shape} ${radius} ${className}`}
    />
  );
}
