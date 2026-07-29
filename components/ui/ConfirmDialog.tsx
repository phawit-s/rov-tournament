"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";
import Panel from "./Panel";
import Button from "./Button";

/**
 * กล่องยืนยันของเว็บ ใช้แทน confirm() ของเบราว์เซอร์ที่หลุดธีมและปิดไม่ได้ด้วยคีย์
 * มือถือเป็น bottom-sheet ตามแนวทางเดียวกับ modal อื่นในเว็บ
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hydrated = useHydrated();

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
          className="fixed inset-0 z-90 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-auto"
          >
            <Panel
              variant="feature"
              interactive={false}
              className="w-full rounded-t-3xl p-7 pb-[calc(1.75rem+var(--sab))] sm:w-[min(92vw,26rem)] sm:rounded-2xl sm:pb-7"
            >
              <p className="slug">ยืนยัน</p>
              <h3 className="mt-2 font-display text-xl font-light text-ice">{title}</h3>
              {description && (
                <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
              )}

              <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  autoFocus
                  variant="ghost"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={onClose}
                >
                  {cancelText}
                </Button>
                <Button
                  variant={tone === "danger" ? "danger" : "primary"}
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                >
                  {confirmText}
                </Button>
              </div>
            </Panel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
