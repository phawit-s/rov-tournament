"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { PERMISSION_MATRIX, ROLE_META, type Role } from "@/lib/tournament/roles";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import { Input } from "./ui";

type Props = { tournament: Tournament; role: Role };

export default function AccessPanel({ tournament, role }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const user = authStore.user();

  const staff = tournament.adminEmails ?? [];
  const isOwner = role === "owner";

  const addStaff = () => {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("อีเมลไม่ถูกต้อง");
      return;
    }
    if (staff.includes(value)) {
      setError("อีเมลนี้อยู่ในทีมงานแล้ว");
      return;
    }
    tournamentStore.update(tournament.id, { adminEmails: [...staff, value] });
    setEmail("");
    setError(null);
  };

  return (
    <div className="space-y-5">
      {/* สิทธิ์ปัจจุบัน */}
      <Panel accent={ROLE_META[role].rgb} className="p-6">
        <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
          สิทธิ์ของคุณ
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-3.5 py-1.5 font-display text-sm"
            style={{
              color: `rgb(${ROLE_META[role].rgb})`,
              background: `rgb(${ROLE_META[role].rgb} / 0.14)`,
              boxShadow: `inset 0 0 0 1px rgb(${ROLE_META[role].rgb} / 0.35)`,
            }}
          >
            {ROLE_META[role].label}
          </span>
          <span className="text-sm text-muted">{ROLE_META[role].hint}</span>
        </div>
        {user && (
          <p className="mt-3 text-xs text-muted">
            ล็อกอินเป็น {user.name} · {user.email ?? "ไม่มีอีเมล"}
          </p>
        )}
        {!hasBackend && (
          <p className="mt-3 rounded-xl tile px-4 py-3 text-xs text-muted">
            ยังไม่ได้เชื่อมหลังบ้าน — ทัวร์นี้อยู่ในเครื่องนี้เครื่องเดียว
            คุณจึงเป็นเจ้าของโดยอัตโนมัติ
          </p>
        )}
      </Panel>

      {/* ทีมงาน */}
      {isOwner && hasBackend && (
        <Panel className="p-6">
          <h3 className="font-display text-lg font-medium text-ice">ทีมงาน</h3>
          <p className="mt-1 text-sm text-muted">
            ใส่อีเมล Google ของคนที่จะให้ช่วยกรอกผลและอนุมัติสลิป
            เขาต้องล็อกอินด้วยอีเมลนี้ถึงจะได้สิทธิ์
          </p>

          <div className="mt-4 flex gap-2.5">
            <Input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && addStaff()}
              placeholder="teammate@gmail.com"
              type="email"
              className="flex-1"
            />
            <Button onClick={addStaff} disabled={!email.trim()} className="shrink-0 px-5">
              เพิ่ม
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-[#e79a9a]">{error}</p>}

          <ul className="mt-4 space-y-2">
            <li className="flex items-center gap-3 rounded-xl tile px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-ice">
                {tournament.ownerEmail ?? user?.email ?? "คุณ"}
              </span>
              <span className="shrink-0 font-display text-xs text-champagne">
                เจ้าของ
              </span>
            </li>
            <AnimatePresence initial={false}>
              {staff.map((mail) => (
                <motion.li
                  key={mail}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex items-center gap-3 rounded-xl tile px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ice">{mail}</span>
                  <span className="shrink-0 font-display text-xs text-muted">ทีมงาน</span>
                  <button
                    type="button"
                    onClick={() =>
                      tournamentStore.update(tournament.id, {
                        adminEmails: staff.filter((m) => m !== mail),
                      })
                    }
                    className="shrink-0 cursor-pointer px-1 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                  >
                    ✕
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <p className="mt-4 rounded-xl tile px-4 py-3 text-xs text-muted">
            แก้รายชื่อแล้วต้องกด <b>เผยแพร่ขึ้นคลาวด์</b> ในแท็บโดเนท/สมาชิกอีกครั้ง
            สิทธิ์ถึงจะมีผลจริง (กติกาฝั่งเซิร์ฟเวอร์อ่านจากข้อมูลบนคลาวด์)
          </p>
        </Panel>
      )}

      {/* ตารางสิทธิ์ */}
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-hair px-6 py-4">
          <h3 className="font-display text-lg font-medium text-ice">ใครทำอะไรได้บ้าง</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-hair text-left">
                <th className="px-6 py-3 font-display text-[10px] tracking-luxe text-muted uppercase">
                  ทำอะไร
                </th>
                {(["owner", "staff", "member", "guest"] as Role[]).map((r) => (
                  <th
                    key={r}
                    className="px-3 py-3 text-center font-display text-[10px] tracking-luxe uppercase"
                    style={{ color: `rgb(${ROLE_META[r].rgb})` }}
                  >
                    {ROLE_META[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--hair)/var(--hair-a))]">
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.action} className={row.owner && !row.staff ? "" : ""}>
                  <td className="px-6 py-3 text-ice/85">{row.action}</td>
                  {([row.owner, row.staff, row.member, row.guest] as boolean[]).map(
                    (ok, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        <span className={ok ? "text-champagne" : "text-muted/30"}>
                          {ok ? "✓" : "–"}
                        </span>
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
