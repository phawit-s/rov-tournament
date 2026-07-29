"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { authErrorMessage } from "@/lib/backend/authErrors";
import { authStore } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { Input, Label } from "../tournament/ui";

type Mode = "signin" | "signup";

export default function AuthPanel({
  title = "เข้าสู่ระบบ",
  description = "ต้องล็อกอินก่อนถึงจะสร้างและจัดการทัวร์นาเมนต์ได้",
}: {
  title?: string;
  description?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [gameName, setGameName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // แยกว่ากำลังทำอะไรอยู่ เพื่อให้สปินเนอร์ขึ้นเฉพาะปุ่มที่ถูกกด
  const [busy, setBusy] = useState<"form" | "google" | "reset" | null>(null);

  const run = async (
    kind: "form" | "google" | "reset",
    fn: () => Promise<void>,
    activity?: string,
  ) => {
    setBusy(kind);
    try {
      await fn();
      if (activity) {
        const u = authStore.user();
        recordActivity("auth.signin", `${activity} (${u?.email ?? u?.name ?? "-"})`);
      }
    } catch (err) {
      // ข้อความผิดพลาดเด้งเป็น toast จะได้ไม่ดันฟอร์มให้กระโดด
      toast(authErrorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    if (!email.trim() || password.length < 6) {
      toast("กรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัว", "error");
      return;
    }
    if (mode === "signin") {
      void run(
        "form",
        () => authStore.signInWithPassword(email, password),
        "เข้าสู่ระบบด้วยอีเมล",
      );
    } else {
      void run(
        "form",
        async () => {
          const game = gameName.trim();
          /*
            ถ้าไม่ได้ตั้งชื่อที่แสดง ใช้ชื่อในเกมแทน
            นอกจากได้ชื่อที่อ่านออกแล้ว registerWithPassword ยังอัปเดตผู้ใช้ปัจจุบัน
            ให้ทันทีเมื่อมีชื่อส่งไป ทำให้ save() ข้างล่างเขียนได้เลยไม่ต้องรอ authState
          */
          await authStore.registerWithPassword(email, password, name.trim() || game);
          if (!game) return;
          try {
            // เก็บชื่อในเกมตั้งแต่ตอนสมัคร จะได้ไม่ต้องไปกรอกซ้ำที่ ProfileGate
            await profileStore.save({ gameName: game });
          } catch {
            // เขียนไม่ทัน/ไม่ผ่านก็ไม่เป็นไร เดี๋ยว ProfileGate ถามให้อีกที
          }
        },
        "สมัครบัญชีใหม่",
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-md"
    >
      <Panel variant="feature" className="p-7 sm:p-8">
        <p className="slug">Account</p>
        <h2 className="mt-2 font-display text-2xl font-light text-ice">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>

        {/* สลับโหมด */}
        <div className="mt-6 flex gap-1 rounded-xl tile p-1">
          {(
            [
              { key: "signin", label: "เข้าสู่ระบบ" },
              { key: "signup", label: "สมัครบัญชีใหม่" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`relative min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors ${
                mode === m.key ? "text-[#1b1509]" : "text-muted hover:text-ice"
              }`}
            >
              {mode === m.key && (
                <motion.span
                  layoutId="auth-tab"
                  className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              )}
              <span className="relative z-10">{m.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <Label>ชื่อที่จะแสดง</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ชื่อผู้จัด"
                  maxLength={40}
                />
              </div>

              <div>
                <Label hint="ผู้จัดใช้ชื่อนี้หาคุณเจอในสาย — ไม่ใส่ตอนนี้ก็ได้ เดี๋ยวถามอีกที">
                  ชื่อในเกม
                </Label>
                <Input
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="เช่น Violet"
                  maxLength={40}
                />
              </div>
            </>
          )}

          <div>
            <Label>อีเมล</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <Label hint={mode === "signup" ? "อย่างน้อย 6 ตัว" : undefined}>
              รหัสผ่าน
            </Label>
            <Input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
            />
          </div>

          <Button
            size="lg"
            onClick={submit}
            loading={busy === "form"}
            disabled={busy !== null}
            className="w-full"
          >
            {mode === "signin" ? "เข้าสู่ระบบ" : "สมัครบัญชี"}
          </Button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                if (!email.trim()) {
                  toast("ใส่อีเมลก่อน แล้วกดลืมรหัสผ่านอีกที", "error");
                  return;
                }
                void run("reset", async () => {
                  await authStore.resetPassword(email);
                  toast("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว", "success");
                });
              }}
              className="min-h-11 w-full cursor-pointer text-center text-xs text-muted transition-colors hover:text-champagne"
            >
              ลืมรหัสผ่าน?
            </button>
          )}
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="rule h-px flex-1" />
          <span className="slug slug-2">หรือ</span>
          <span className="rule h-px flex-1" />
        </div>

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          loading={busy === "google"}
          disabled={busy !== null}
          onClick={() =>
            void run("google", () => authStore.signIn(), "เข้าสู่ระบบด้วย Google")
          }
        >
          เข้าสู่ระบบด้วย Google
        </Button>

        {/* บอกล่วงหน้าว่ายังมีอีกจอ คนจะได้ไม่คิดว่ากดแล้วค้าง */}
        <p className="mt-3 text-center text-xs leading-relaxed text-muted">
          ล็อกอินด้วย Google แล้วจะให้กรอกชื่อในเกมอีกนิดเดียว
        </p>
      </Panel>
    </motion.div>
  );
}
