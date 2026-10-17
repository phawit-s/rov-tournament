"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";
import Button from "./Button";
import { Input, Label } from "./kit";

/**
 * ถามยืนยันก่อนทำของที่ย้อนไม่ได้
 * มือถือ = แผ่นเด้งจากขอบล่าง (นิ้วโป้งถึงปุ่ม) · จอกว้าง = กล่องกลางจอ
 *
 * confirmPhrase = ต้องพิมพ์คำนี้ให้ตรงก่อนปุ่มยืนยันถึงกดได้
 * ใช้กับของที่หายทั้งก้อน (ลบช่อง) — ปุ่มเดียวกดพลาดง่ายเกินไปสำหรับของที่ไม่มีทางกู้
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  tone = "danger",
  confirmPhrase,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
  confirmPhrase?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  const [typed, setTyped] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const locked = !!confirmPhrase && typed.trim() !== confirmPhrase;

  /* เปิดใหม่ทุกครั้งต้องเริ่มจากช่องว่าง — ไม่ให้คำที่พิมพ์ค้างจากรอบก่อนปลดล็อกให้เอง
     (ปรับ state ตอน render ตามที่ React แนะนำ แทน setState ใน effect ที่ render ซ้ำสองรอบ) */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTyped("");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!hydrated) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-90 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal
            aria-labelledby="confirm-title"
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-sheet bg-paper p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-float sm:rounded-sheet sm:pb-6"
          >
            <h2 id="confirm-title" className="text-title font-bold">
              {title}
            </h2>
            {description && <p className="mt-2 text-muted">{description}</p>}
            {confirmPhrase && (
              <div className="mt-5">
                <Label htmlFor="confirm-phrase">
                  พิมพ์ <span className="font-semibold text-ink">{confirmPhrase}</span> เพื่อยืนยัน
                </Label>
                <Input
                  id="confirm-phrase"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !locked) {
                      onConfirm();
                      onClose();
                    }
                  }}
                />
              </div>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button autoFocus variant="ghost" onClick={onClose}>
                {cancelText}
              </Button>
              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                disabled={locked}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
