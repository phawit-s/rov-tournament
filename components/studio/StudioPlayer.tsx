"use client";

import { ChannelPlayer } from "@/components/song/SongPlayer";
import { useStudioChannel } from "@/hooks/useStudioChannel";
import { IconExternal } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/kit";
import PageHead from "./PageHead";

/**
 * คิวและตัวเล่นในสตูดิโอ — /studio/queue/ (ต.ค. 2569 ย้ายตัวเล่นเข้ามาแทนหน้าคิวเดิม)
 *
 * ★ ตัวนี้ถูกวางโดย StudioShell ไม่ใช่โดยหน้า /studio/queue/ ★
 * ถ้าอยู่ในหน้า พอสลับไปหน้าตั้งค่าหรือหน้า OBS ระหว่างไลฟ์ ตัวเล่นจะถูกถอดทิ้ง
 * = เพลงหยุดกลางไลฟ์ · StudioShell จึงเปิดมันครั้งแรกที่เข้าหน้าคิว แล้วเก็บไว้ตลอด
 * แค่ย้ายออกนอกจอตอนอยู่หน้าอื่น (visible = false)
 *
 * ช่องมาจาก #c= เหมือนทุกหน้าในสตูดิโอ · ผู้ดูแลสลับไปช่องอื่น = ตัวเล่นของช่องใหม่ (key ใหม่)
 * ล็อกตัวเล่นข้ามแท็บ (lib/song/player-lock.ts) ยังทำงานเหมือนเดิม — เปิด /player/ ค้างไว้
 * อีกหน้าต่างพร้อมกันก็ไม่เล่นซ้อน
 */
export default function StudioPlayer({ visible }: { visible: boolean }) {
  const { channel, loaded, missingId } = useStudioChannel();

  if (!loaded) {
    return visible ? (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="aspect-video w-full rounded-stage" />
      </div>
    ) : null;
  }

  if (!channel) {
    return visible ? (
      <div className="space-y-8">
        <PageHead title="คิวและตัวเล่น" />
        <EmptyState
          title={missingId ? "ไม่พบช่องนี้" : "ยังไม่ได้เลือกช่อง"}
          description={
            missingId
              ? "ลิงก์นี้ชี้ไปที่ช่องที่ไม่มีแล้ว เลือกช่องจากตัวเลือกช่องด้านบน"
              : "เลือกช่องจากตัวเลือกช่องด้านบนก่อน แล้วคิวกับตัวเล่นของช่องนั้นจะขึ้นตรงนี้"
          }
        />
      </div>
    ) : null;
  }

  return (
    <ChannelPlayer
      key={channel.id}
      channelId={channel.id}
      channel={channel}
      title="คิวและตัวเล่น"
      actions={
        /* คนที่จับหน้าต่างตัวเล่นเข้า OBS (Window Capture) ยังต้องการหน้าต่างแยกเต็มจอ */
        <a
          href={`/player/#ch=${channel.id}`}
          target="_blank"
          rel="noopener"
          title="เปิดตัวเล่นเป็นหน้าต่างแยก สำหรับจับหน้าต่างเข้า OBS"
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted transition-colors hover:bg-fill hover:text-ink"
        >
          <IconExternal className="h-4 w-4" />
          หน้าต่างแยก
        </a>
      }
    />
  );
}
