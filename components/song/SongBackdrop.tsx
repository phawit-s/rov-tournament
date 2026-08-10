"use client";

import { useEffect, useState } from "react";
import { NEUTRAL_PALETTE, loadArtPalette, type ArtPalette } from "@/lib/song/artwork";
import { thumbUrl } from "@/lib/song/youtube";

/**
 * ฉากหลังของหน้าขอเพลง — ไล่สีที่ดูดมาจากปกเพลงที่กำลังเล่น
 *
 * เคยทำด้วยการเอา "รูปปกเบลอ" มาวางเต็มจอ ซึ่งใช้ไม่ได้: รูปถ่ายมีที่สว่าง
 * ที่มืดอยู่ในตัว เบลอเท่าไหร่ก็ยังเป็นก้อนสีกองอยู่มุมใดมุมหนึ่งของจอ
 * (ปกรถแท็กซี่สีเหลือง = ก้อนเหลืองกลางซ้าย ไม่ได้คลุมทั้งหน้า)
 * เบลอหนักขึ้นเพื่อให้เรียบก็ยิ่งแพงและยิ่งกลายเป็นสีโคลน
 *
 * ตอนนี้ดูดแค่ "สี" จากปกแล้วเอามาวาดเป็นไล่สีเองสามชั้น — ได้สีของเพลงจริง
 * เหมือนเดิม แต่คุมได้ว่าสีไปอยู่ตรงไหนของจอ และคลุมเต็มทุกมุมเสมอ
 *
 * ถูกกว่าด้วย: ไม่มีรูปให้โหลด ไม่มี blur ให้แรสเตอร์ เหลือแค่ไล่สีที่
 * เบราว์เซอร์วาดครั้งเดียว แล้วขยับด้วย transform บน compositor
 */
export default function SongBackdrop({ videoId }: { videoId: string | null }) {
  const palette = usePalette(videoId);

  return (
    <div
      aria-hidden
      /* z-index ติดลบ ไม่ใช่ 0 — ตัวแม่ (main) เป็น stacking context อยู่แล้ว
         ถ้าใช้ 0 แผ่นนี้จะขึ้นมาทับเนื้อหาทั้งหน้าแทนที่จะอยู่ข้างหลัง */
      style={{ zIndex: -1 }}
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <span
        className="song-wash art-drift absolute inset-0 block"
        style={
          {
            "--glow": palette.glow,
            "--tint": palette.tint,
          } as React.CSSProperties
        }
      />

      {/* ม่านคลุมให้ตัวหนังสืออ่านออก
          ไม่มีชั้นเกรนแล้ว — เกรนคือ noise สีเทาล้วน พอวางทับไล่สีที่อุตส่าห์
          ดูดมาจากปก มันก็ลดความอิ่มตัวของสีลงทั้งจอ ได้ผลตรงข้ามกับที่ต้องการ */}
      <span className="song-veil absolute inset-0" />
    </div>
  );
}

/**
 * ดูดสีจากปก — เริ่มที่สีกลางเสมอ แล้วค่อยเปลี่ยนเมื่อรูปโหลดเสร็จ
 * (ตรรกะเดียวกับการ์ดบน widget เพื่อให้ทั้งสองที่ได้สีชุดเดียวกันจากเพลงเดียวกัน)
 */
function usePalette(videoId: string | null): ArtPalette {
  const [loaded, setLoaded] = useState<ArtPalette | null>(null);

  useEffect(() => {
    if (!videoId) return;
    const ac = new AbortController();
    void loadArtPalette(thumbUrl(videoId, "mq"), ac.signal).then((p) => {
      if (!ac.signal.aborted) setLoaded(p);
    });
    return () => ac.abort();
  }, [videoId]);

  return videoId ? (loaded ?? NEUTRAL_PALETTE) : NEUTRAL_PALETTE;
}
