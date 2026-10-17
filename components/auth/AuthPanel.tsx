"use client";

import { useId, useState } from "react";
import { authErrorMessage } from "@/lib/backend/authErrors";
import { authStore } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import Button from "../ui/Button";
import Tabs from "../ui/Tabs";
import { toast } from "../ui/Toast";
import { Input, Label } from "../ui/kit";

type Mode = "signin" | "signup";

const MODES: { key: Mode; label: string }[] = [
  { key: "signin", label: "เข้าสู่ระบบ" },
  { key: "signup", label: "สมัครบัญชีใหม่" },
];

export default function AuthPanel({
  title = "เข้าสู่ระบบ",
  description = "ล็อกอินก่อน ถึงจะจัดการคิวเพลงของช่องคุณได้",
}: {
  title?: string;
  description?: string;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // แยกว่ากำลังทำอะไรอยู่ เพื่อให้สปินเนอร์ขึ้นเฉพาะปุ่มที่ถูกกด
  const [busy, setBusy] = useState<"form" | "google" | "reset" | null>(null);

  const run = async (kind: "form" | "google" | "reset", fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      // ข้อความผิดพลาดเด้งเป็น toast จะได้ไม่ดันฟอร์มให้กระโดด
      toast(authErrorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const submit = () => {
    if (!email.trim()) {
      toast("ใส่อีเมลก่อน", "error");
      return;
    }
    if (password.length < 6) {
      toast("รหัสผ่านต้องยาวอย่างน้อย 6 ตัว", "error");
      return;
    }
    if (mode === "signin") {
      void run("form", () => authStore.signInWithPassword(email, password));
    } else {
      void run("form", async () => {
        const display = name.trim();
        /*
          ชื่อเดียวใช้สองที่: ชื่อบัญชี กับชื่อที่ขึ้นบนจอไลฟ์ตอนขอเพลง (gameName ในโปรไฟล์)
          registerWithPassword อัปเดตผู้ใช้ปัจจุบันให้ทันทีเมื่อมีชื่อส่งไป
          ทำให้ save() ข้างล่างเขียนได้เลยไม่ต้องรอ authState
        */
        await authStore.registerWithPassword(email, password, display);
        if (!display) return;
        try {
          // เก็บชื่อตั้งแต่ตอนสมัคร จะได้ไม่ต้องไปกรอกซ้ำที่ ProfileGate
          await profileStore.save({ gameName: display });
        } catch {
          // เขียนไม่ทัน/ไม่ผ่านก็ไม่เป็นไร เดี๋ยว ProfileGate ถามให้อีกที
        }
      });
    }
  };

  const resetPassword = () => {
    if (!email.trim()) {
      toast("ใส่อีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง", "error");
      return;
    }
    void run("reset", async () => {
      await authStore.resetPassword(email);
      toast("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว", "success");
    });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="w-full max-w-md">
      <h1 id={`${id}-title`} className="text-headline font-bold">
        {title}
      </h1>
      {description && <p className="mt-2 text-muted">{description}</p>}

      {/* ช่องในแท็บสูง 44px ให้นิ้วกดโดนบนมือถือ (ค่าเริ่มต้นของ Tabs เตี้ยกว่านั้น) */}
      <Tabs
        items={MODES}
        value={mode}
        onChange={setMode}
        size="md"
        label="เลือกวิธีเข้าใช้"
        className="mt-6 [&>button]:min-h-11"
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 space-y-5"
      >
        {mode === "signup" && (
          <div>
            <Label htmlFor={`${id}-name`} hint="ขึ้นบนจอไลฟ์ตอนคุณขอเพลง เว้นไว้ก่อนก็ได้ เดี๋ยวระบบถามอีกครั้ง">
              ชื่อที่แสดง
            </Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น Mint"
              maxLength={40}
              autoComplete="nickname"
            />
          </div>
        )}

        <div>
          <Label htmlFor={`${id}-email`}>อีเมล</Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <Label
            htmlFor={`${id}-password`}
            hint={mode === "signup" ? "อย่างน้อย 6 ตัว" : undefined}
          >
            รหัสผ่าน
          </Label>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          loading={busy === "form"}
          disabled={busy !== null}
          className="w-full"
        >
          {mode === "signin" ? "เข้าสู่ระบบ" : "สมัครบัญชี"}
        </Button>

        {mode === "signin" && (
          <button
            type="button"
            onClick={resetPassword}
            disabled={busy !== null}
            className="-ml-2 inline-flex min-h-11 cursor-pointer items-center rounded-full px-2 text-sm font-medium text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "reset" ? "กำลังส่งลิงก์…" : "ลืมรหัสผ่าน"}
          </button>
        )}
      </form>

      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-sm text-muted">หรือ</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={busy === "google"}
        disabled={busy !== null}
        onClick={() => void run("google", () => authStore.signIn())}
      >
        เข้าสู่ระบบด้วย Google
      </Button>

      {/* บอกล่วงหน้าว่ายังมีอีกจอ คนจะได้ไม่คิดว่ากดแล้วค้าง */}
      <p className="mt-3 text-sm text-muted">
        เข้าด้วย Google ครั้งแรก ระบบจะถามชื่อที่แสดงอีกหนึ่งช่อง
      </p>
    </section>
  );
}
