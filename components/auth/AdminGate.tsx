"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { gateStore } from "@/lib/gate";
import { useAccess } from "@/hooks/useAdmin";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { recordActivity } from "@/lib/activity";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Corners from "@/components/ui/Corners";
import AuthPanel from "./AuthPanel";
import { toast } from "@/components/ui/Toast";
import { IconCheck, IconCopy, IconLock } from "@/components/ui/icons";
import { Input, Label, Skeleton } from "@/components/tournament/ui";

/**
 * ล็อกหน้าหลังบ้าน
 *
 * ทางหลักคือล็อกอินด้วยบัญชีที่มีเอกสาร admins/{uid} ใน Firestore
 * ซึ่งเป็นคำตอบที่ปลอมไม่ได้เพราะกติกาบังคับอยู่ฝั่งเซิร์ฟเวอร์
 * ทางรองคือรหัสผู้จัดในเครื่อง ไว้ใช้เครื่องมือที่ทำงานในเบราว์เซอร์ล้วน
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const access = useAccess();

  if (access !== "none") {
    return (
      <>
        {access === "local" && hasBackend && <LocalModeNotice />}
        {children}
      </>
    );
  }
  return <AdminLocked />;
}

/** โหมดเครื่องนี้ทำงานได้เฉพาะของที่อยู่ในเบราว์เซอร์ ต้องบอกให้ชัด */
function LocalModeNotice() {
  return (
    <div className="tally sunken mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-3 pr-4 pl-5 text-xs">
      <span className="slug">โหมดเครื่องนี้</span>
      <span className="text-muted">
        ปลดด้วยรหัสผู้จัด ใช้ได้เฉพาะข้อมูลในเบราว์เซอร์เครื่องนี้ —
        ถ้าจะเผยแพร่ทัวร์หรือรับใบสมัครข้ามเครื่อง ต้องล็อกอินบัญชีผู้ดูแล
      </span>
    </div>
  );
}

function AdminLocked() {
  const snapshot = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const claim = gateStore.claim();

  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPin, setShowPin] = useState(!hasBackend);

  const submit = async () => {
    setBusy(true);
    const ok = await gateStore.tryUnlock(pin);
    setBusy(false);
    if (ok) {
      setPin("");
      setWrong(false);
      recordActivity("auth.signin", "ปลดล็อกโหมดผู้จัดในเครื่อง");
      toast("ปลดล็อกโหมดผู้จัดแล้ว", "success");
      return;
    }
    setWrong(true);
    toast("รหัสไม่ถูกต้อง", "error");
  };

  const signedIn = !!user && !user.anonymous;

  /*
    ยังไม่ล็อกอิน — ยก AuthPanel มาทั้งตัว ไม่ทำปุ่มเองแล้วเหลือแต่ Google
    เพราะบัญชีบอทของ Worker ต้องสมัครด้วยอีเมล/รหัสผ่านเท่านั้น
    ถ้าหน้านี้มีแต่ปุ่ม Google ก็จะไม่มีทางสมัครบัญชีแบบนั้นได้เลยทั้งเว็บ
    (AuthPanel มีกรอบ Panel ในตัวแล้ว จึงไม่ครอบซ้ำ)
  */
  if (hasBackend && snapshot !== "loading" && !signedIn) {
    return (
      <div className="py-6">
        <AuthPanel
          title="หน้านี้สำหรับผู้จัดแข่ง"
          description="ล็อกอินด้วยบัญชีที่ได้รับสิทธิ์ผู้ดูแล · สมัครบัญชีใหม่ได้ที่แท็บด้านบน"
        />

        <div className="mx-auto mt-6 max-w-lg text-center">
          {showPin ? (
            <div className="tile rounded-2xl p-5 text-left">
              <Label hint="เปิดได้เฉพาะเครื่องมือที่ทำงานในเบราว์เซอร์ ข้อมูลบนคลาวด์ยังต้องล็อกอิน">
                รหัสผู้จัดสำหรับเครื่องนี้
              </Label>
              <Input
                type="password"
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
                <p className="mt-2 text-xs text-[#e79a9a]">รหัสไม่ถูกต้อง</p>
              )}
              <Button
                variant="outline"
                loading={busy}
                className="mt-3 w-full"
                onClick={() => void submit()}
              >
                ปลดล็อกเครื่องนี้
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPin(true)}
              className="inline-flex cursor-pointer items-center gap-2 font-display text-xs text-muted transition-colors hover:text-champagne"
            >
              <IconLock className="h-3.5 w-3.5" />
              ใช้รหัสผู้จัดสำหรับเครื่องนี้แทน
            </button>
          )}
        </div>
      </div>
    );
  }

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

          {hasBackend ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                ล็อกอินด้วยบัญชีที่ได้รับสิทธิ์ผู้ดูแล
                สิทธิ์ถูกตรวจที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ในเบราว์เซอร์
              </p>

              {snapshot === "loading" || claim === "loading" ? (
                <div className="mt-7 space-y-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              ) : signedIn ? (
                <div className="mt-7">
                  {/* ล็อกอินแล้วแต่ยังไม่มีสิทธิ์ — บอกวิธีขอให้ชัด */}
                  <div className="tile rounded-xl p-4">
                    <p className="slug slug-2">ล็อกอินอยู่</p>
                    <p className="mt-1.5 truncate text-sm text-ice">
                      {user.email ?? user.name}
                    </p>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล
                    ส่งรหัสผู้ใช้ด้านล่างให้คนที่ดูแลเว็บ
                    เพื่อเพิ่มเข้ารายชื่อผู้ดูแล
                  </p>

                  <div className="field mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5">
                    <code className="num min-w-0 flex-1 truncate text-xs text-ice">
                      {user.uid}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(user.uid)
                          .then(() => {
                            setCopied(true);
                            toast("คัดลอกรหัสผู้ใช้แล้ว", "success");
                          })
                          .catch(() => toast("คัดลอกไม่สำเร็จ", "error"));
                      }}
                      aria-label="คัดลอกรหัสผู้ใช้"
                      className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-champagne transition-colors hover:bg-champagne/10"
                    >
                      {copied ? (
                        <IconCheck className="h-4 w-4" strokeWidth={2} />
                      ) : (
                        <IconCopy className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-4"
                    onClick={() => void authStore.signOut()}
                  >
                    เปลี่ยนบัญชี
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              ใส่รหัสผู้จัดเพื่อเปิดเมนูจัดทัวร์นาเมนต์ ผู้เล่น widget และประวัติ
            </p>
          )}

          {/* ---- รหัสในเครื่อง ---- */}
          {hasBackend && (
            <>
              <span className="rule my-7 block h-px" />
              {!showPin && (
                <button
                  type="button"
                  onClick={() => setShowPin(true)}
                  className="flex cursor-pointer items-center gap-2 font-display text-xs text-muted transition-colors hover:text-champagne"
                >
                  <IconLock className="h-3.5 w-3.5" />
                  ใช้รหัสผู้จัดสำหรับเครื่องนี้แทน
                </button>
              )}
            </>
          )}

          {showPin && (
            <div className={hasBackend ? "" : "mt-7"}>
              <Label
                hint={
                  hasBackend
                    ? "เปิดได้เฉพาะเครื่องมือที่ทำงานในเบราว์เซอร์ ข้อมูลบนคลาวด์ยังต้องล็อกอิน"
                    : "ถามจากคนที่ดูแลเว็บนี้"
                }
              >
                รหัสผู้จัด
              </Label>
              <Input
                type="password"
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
              <Button
                size="lg"
                variant={hasBackend ? "outline" : "primary"}
                loading={busy}
                className="mt-4 w-full"
                onClick={() => void submit()}
              >
                ปลดล็อกเครื่องนี้
              </Button>
            </div>
          )}

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
