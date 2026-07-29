"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { gateStore } from "@/lib/gate";
import { recordActivity } from "@/lib/activity";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Corners from "@/components/ui/Corners";
import { toast } from "@/components/ui/Toast";
import { Input, Label } from "@/components/tournament/ui";

/**
 * ล็อกหน้าหลังบ้านไว้หลังรหัสผู้จัด
 * ผู้ชมทั่วไปจะเห็นแค่หน้านี้แทนเนื้อหา พร้อมทางกลับไปเครื่องมือที่เปิดให้ใช้ฟรี
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const admin = useSyncExternalStore(
    gateStore.subscribe,
    gateStore.getSnapshot,
    gateStore.getServerSnapshot,
  );

  if (admin) return <>{children}</>;
  return <AdminLocked />;
}

function AdminLocked() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await gateStore.tryUnlock(pin);
    setBusy(false);
    if (ok) {
      setPin("");
      setWrong(false);
      recordActivity("auth.signin", "ปลดล็อกโหมดผู้จัด");
      toast("ปลดล็อกโหมดผู้จัดแล้ว", "success");
      return;
    }
    setWrong(true);
    toast("รหัสไม่ถูกต้อง", "error");
  };

  return (
    <div className="grid place-items-center py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <Panel
          variant="feature"
          interactive={false}
          className="relative p-8 sm:p-10"
        >
          <Corners len={18} o={0.45} />

          <p className="slug">Staff only</p>
          <h2 className="mt-2 font-display text-2xl font-light text-ice">
            หน้านี้สำหรับผู้จัดแข่ง
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            ใส่รหัสผู้จัดเพื่อเปิดเมนูจัดทัวร์นาเมนต์ ผู้เล่น ช่อง widget
            และประวัติ
          </p>

          <div className="mt-7">
            <Label hint="ถามจากคนที่ดูแลเว็บนี้">รหัสผู้จัด</Label>
            <Input
              type="password"
              autoFocus
              autoComplete="off"
              value={pin}
              placeholder="••••••••"
              onChange={(e) => {
                setPin(e.target.value);
                setWrong(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              className={wrong ? "border-[#e79a9a]/60" : ""}
            />
            {wrong && (
              <p className="mt-2 text-xs text-[#e79a9a]">
                รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง
              </p>
            )}
          </div>

          <Button
            size="lg"
            loading={busy}
            className="mt-5 w-full"
            onClick={() => void submit()}
          >
            ปลดล็อก
          </Button>

          <span className="rule my-7 block h-px" />

          <p className="slug slug-2">เปิดให้ทุกคนใช้</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/draw/">
              <Button size="sm" variant="ghost">
                สุ่มแบ่งทีม
              </Button>
            </Link>
            <Link href="/wheel/">
              <Button size="sm" variant="ghost">
                วงล้อสุ่ม
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            ถ้ามาจากลิงก์สมัครแข่ง เปิดลิงก์นั้นได้เลยโดยไม่ต้องใช้รหัส
          </p>
        </Panel>
      </motion.div>
    </div>
  );
}
