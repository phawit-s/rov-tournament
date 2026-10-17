"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { hasBackend } from "@/lib/backend/firebase";
import { isComplete, profileStore } from "@/lib/backend/users";
import Button from "../ui/Button";
import { toast } from "../ui/Toast";
import { Input, Label, Skeleton } from "../ui/kit";

/**
 * ขอชื่อที่แสดงให้ครบก่อนใช้ส่วนที่ต้องระบุตัวตน
 *
 * ล็อกอิน Google ได้ชื่อบัญชีมาก็จริง แต่มักเป็นชื่อจริงนามสกุล
 * ซึ่งไม่ใช่ชื่อที่ทุกคนอยากให้ขึ้นบนจอไลฟ์ตอนขอเพลง ประตูนี้จึงถามหนึ่งครั้ง
 * (เติมชื่อบัญชีไว้ให้ กดยืนยันได้เลยถ้าพอใจ) แล้วปล่อยผ่านตลอดไป แก้ทีหลังได้ที่ /account/
 *
 * ค่าที่ได้เก็บใน gameName ของโปรไฟล์ — ชื่อฟิลด์มาจากสมัยเว็บยังเป็นเครื่องมือจัดแข่ง
 * ไม่เปลี่ยนชื่อตาม เพราะเอกสารเดิมของทุกคนใน Firestore ใช้ชื่อนี้อยู่
 *
 * ตั้งใจไม่ทำหน้าที่ของ AuthGate ซ้ำ — คนที่ยังไม่ล็อกอินให้ผ่านไปเจอ AuthGate เอง
 */
export default function ProfileGate({ children }: { children: ReactNode }) {
  useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );

  // สแนปช็อตเป็นสตริงภายในของ store จึงอ่านค่าจริงผ่าน getter แทน
  const state = profileStore.state();
  const profile = profileStore.profile();

  // ไม่มีแบ็กเอนด์ = ไม่มีโปรไฟล์ให้ถาม — ด่านชั้นนอก/หน้าปลายทางเป็นคนบอกเรื่องนี้เอง
  if (!hasBackend) return <>{children}</>;

  // ยังไม่ล็อกอิน/อ่านโปรไฟล์ไม่ได้ — ปล่อยให้ AuthGate เป็นคนบอก
  if (state === "none") return <>{children}</>;

  if (state === "loading") return <ProfileSkeleton />;

  if (isComplete(profile)) return <>{children}</>;

  return <ProfileForm defaultName={profile?.gameName ?? profile?.name ?? ""} />;
}

function ProfileSkeleton() {
  return (
    <div className="w-full max-w-md" aria-busy="true" aria-label="กำลังอ่านโปรไฟล์">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2.5 h-4 w-4/5" />
      <Skeleton className="mt-8 h-4 w-28" />
      <Skeleton className="mt-3 h-12 w-full rounded-field" />
      <Skeleton className="mt-6 h-13 w-full rounded-full" />
    </div>
  );
}

/**
 * แยกเป็นคอมโพเนนต์ของตัวเองเพื่อให้ค่าเริ่มต้นมาจาก lazy initializer ได้
 * (กฎของโปรเจกต์: ห้าม setState ใน useEffect เพื่อเติมค่าเริ่มต้น)
 * ตอนฟอร์มถูกเรนเดอร์ โปรไฟล์โหลดเสร็จแล้วเสมอ ค่าเริ่มต้นจึงไม่มีทางมาช้า
 */
function ProfileForm({ defaultName }: { defaultName: string }) {
  const id = useId();
  const [gameName, setGameName] = useState(() => defaultName);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = gameName.trim();
    if (!name) {
      toast("ใส่ชื่อที่แสดงก่อน", "error");
      return;
    }
    setBusy(true);
    try {
      await profileStore.save({ gameName: name });
      toast("บันทึกชื่อแล้ว", "success");
      // ไม่ต้องสั่งอะไรต่อ — store ยิงสแนปช็อตใหม่ ประตูจะเปิดเอง
    } catch {
      toast("บันทึกไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง", "error");
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="w-full max-w-md">
      <h1 id={`${id}-title`} className="text-headline font-bold">
        ตั้งชื่อที่แสดง
      </h1>
      <p className="mt-2 text-muted">
        ชื่อนี้ขึ้นบนจอไลฟ์ตอนคุณขอเพลง และเป็นชื่อที่เห็นในสตูดิโอ
        ตั้งครั้งเดียว แก้ได้ทุกเมื่อที่หน้าโปรไฟล์
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-6 space-y-6"
      >
        <div>
          <Label htmlFor={`${id}-name`}>ชื่อที่แสดง</Label>
          <Input
            id={`${id}-name`}
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="เช่น Mint"
            maxLength={40}
            autoComplete="nickname"
            autoFocus
          />
        </div>

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          บันทึกแล้วไปต่อ
        </Button>
      </form>
    </section>
  );
}
