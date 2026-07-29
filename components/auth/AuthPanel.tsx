"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { authErrorMessage } from "@/lib/backend/authErrors";
import { authStore } from "@/lib/backend/firebase";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>, activity?: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      if (activity) {
        const u = authStore.user();
        recordActivity("auth.signin", `${activity} (${u?.email ?? u?.name ?? "-"})`);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!email.trim() || password.length < 6) {
      setError("กรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัว");
      return;
    }
    if (mode === "signin") {
      void run(
        () => authStore.signInWithPassword(email, password),
        "เข้าสู่ระบบด้วยอีเมล",
      );
    } else {
      void run(
        () => authStore.registerWithPassword(email, password, name),
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
      <Panel className="p-7 sm:p-8">
        <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
          Account
        </p>
        <h2 className="mt-2 font-display text-2xl font-light text-ice">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>

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
              onClick={() => {
                setMode(m.key);
                setError(null);
                setNote(null);
              }}
              className={`relative flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors ${
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
            <div>
              <Label>ชื่อที่จะแสดง</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อผู้จัด"
                maxLength={40}
              />
            </div>
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

          {error && <p className="text-xs text-[#e79a9a]">{error}</p>}
          {note && <p className="text-xs text-champagne">{note}</p>}

          <Button onClick={submit} disabled={busy} className="w-full py-3.5">
            {busy
              ? "กำลังดำเนินการ…"
              : mode === "signin"
                ? "เข้าสู่ระบบ"
                : "สมัครบัญชี"}
          </Button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                if (!email.trim()) {
                  setError("ใส่อีเมลก่อน แล้วกดลืมรหัสผ่านอีกที");
                  return;
                }
                void run(async () => {
                  await authStore.resetPassword(email);
                  setNote("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว");
                });
              }}
              className="w-full cursor-pointer text-center text-xs text-muted transition-colors hover:text-champagne"
            >
              ลืมรหัสผ่าน?
            </button>
          )}
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 rule" />
          <span className="font-display text-[10px] tracking-luxe text-muted uppercase">
            หรือ
          </span>
          <span className="h-px flex-1 rule" />
        </div>

        <Button
          variant="outline"
          className="w-full py-3.5"
          disabled={busy}
          onClick={() => void run(() => authStore.signIn(), "เข้าสู่ระบบด้วย Google")}
        >
          เข้าสู่ระบบด้วย Google
        </Button>
      </Panel>
    </motion.div>
  );
}
