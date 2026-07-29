"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { hasBackend } from "@/lib/backend/firebase";
import { isComplete, profileStore } from "@/lib/backend/users";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { Input, Label, Skeleton } from "../tournament/ui";

/**
 * ขอชื่อในเกมให้ครบก่อนใช้ส่วนที่ต้องระบุตัวตน
 *
 * ล็อกอิน Google ได้แค่ชื่อกับอีเมล ซึ่งบอกไม่ได้ว่าคนนี้คือใครในเกม
 * ผู้จัดเลยไล่ใบสมัครกลับไปหาคนไม่ถูก ประตูนี้จึงถามชื่อในเกมหนึ่งครั้ง
 * แล้วปล่อยผ่านตลอดไป (แก้ทีหลังได้ที่ /account/)
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

  // ไม่มีแบ็กเอนด์ = ข้อมูลอยู่ในเครื่องคนเดียว ไม่มีใครต้องรู้ว่าเราเป็นใคร
  if (!hasBackend) return <>{children}</>;

  // ยังไม่ล็อกอิน/อ่านโปรไฟล์ไม่ได้ — ปล่อยให้ AuthGate เป็นคนบอก
  if (state === "none") return <>{children}</>;

  if (state === "loading") return <ProfileSkeleton />;

  if (isComplete(profile)) return <>{children}</>;

  return <ProfileForm defaultName={profile?.gameName ?? profile?.name ?? ""} />;
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md py-6" aria-busy="true" aria-label="กำลังอ่านโปรไฟล์">
      <div className="surface hairline-top rounded-2xl p-7 sm:p-8">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="mt-3 h-7 w-40" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
        <Skeleton className="mt-7 h-3 w-24" />
        <Skeleton className="mt-2 h-11 w-full rounded-xl" />
        <Skeleton className="mt-5 h-3 w-28" />
        <Skeleton className="mt-2 h-11 w-full rounded-xl" />
        <Skeleton className="mt-6 h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

/**
 * แยกเป็นคอมโพเนนต์ของตัวเองเพื่อให้ค่าเริ่มต้นมาจาก lazy initializer ได้
 * (กฎของโปรเจกต์: ห้าม setState ใน useEffect เพื่อเติมค่าเริ่มต้น)
 * ตอนฟอร์มถูกเรนเดอร์ โปรไฟล์โหลดเสร็จแล้วเสมอ ค่าเริ่มต้นจึงไม่มีทางมาช้า
 */
function ProfileForm({ defaultName }: { defaultName: string }) {
  const reduced = useReducedMotion();
  const [gameName, setGameName] = useState(() => defaultName);
  const [contact, setContact] = useState(() => profileStore.profile()?.contact ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = gameName.trim();
    if (!name) {
      toast("ใส่ชื่อในเกมก่อนนะ", "error");
      return;
    }
    setBusy(true);
    try {
      // ส่งสตริงว่างแทน undefined เพราะ Firestore ไม่รับค่า undefined
      await profileStore.save({ gameName: name, contact: contact.trim() });
      toast("บันทึกโปรไฟล์แล้ว", "success");
      // ไม่ต้องสั่งอะไรต่อ — store ยิงสแนปช็อตใหม่ ประตูจะเปิดเอง
    } catch {
      toast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-md py-6"
    >
      <Panel variant="feature" className="p-7 sm:p-8">
        <p className="slug">Almost there</p>
        <h2 className="mt-2 font-display text-2xl font-light text-ice">อีกนิดเดียว</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          บอกชื่อในเกมของคุณหน่อย ผู้จัดจะได้รู้ว่าใครสมัครเข้ามา
          และติดต่อกลับได้ถ้ามีอะไรต้องคุย
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <Label hint="ชื่อที่คนอื่นเห็นในสาย ใช้ชื่อในเกมจริงจะหาง่ายที่สุด">
              ชื่อในเกม
            </Label>
            <Input
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="เช่น Violet"
              maxLength={40}
              autoFocus
            />
          </div>

          <div>
            <Label hint="ไลน์ เบอร์ หรือดิสคอร์ด — ไม่ใส่ก็ได้ ใส่ทีหลังที่หน้าโปรไฟล์ก็ได้">
              ช่องทางติดต่อ
            </Label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="line: myid หรือ 08x-xxx-xxxx"
              maxLength={120}
            />
          </div>

          <Button
            size="lg"
            className="w-full"
            loading={busy}
            onClick={() => void submit()}
          >
            บันทึกแล้วไปต่อ
          </Button>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          ถามครั้งเดียวพอ ครั้งต่อไปเข้าใช้ได้เลย
          และแก้ได้ตลอดที่หน้าโปรไฟล์ของคุณ
        </p>
      </Panel>
    </motion.div>
  );
}
