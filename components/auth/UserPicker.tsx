"use client";

import { useEffect, useMemo, useState } from "react";
import { hasBackend } from "@/lib/backend/firebase";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { EmptyState, Input, Label, Skeleton } from "@/components/tournament/ui";
import { IconCheck } from "@/components/ui/icons";

type Props = {
  /** uid ที่เลือกอยู่ — ผู้เรียกเป็นคนถือค่านี้ */
  value: string | null;
  onChange: (user: UserProfile | null) => void;
  /** uid ที่ไม่ต้องโชว์ เช่นคนที่เป็นผู้ดูแลอยู่แล้ว */
  exclude?: string[];
  label?: string;
  hint?: string;
};

/**
 * โปรไฟล์โครงเปล่าสำหรับ uid ที่พิมพ์เอง
 * ทางสำรองตอนอ่านรายชื่อไม่ได้ ผู้เรียกจะได้รับค่าหน้าตาเดียวกันเสมอ
 */
function stubProfile(uid: string): UserProfile {
  return {
    uid,
    email: null,
    name: "",
    photo: null,
    createdAt: "",
    updatedAt: "",
  };
}

/** ชื่อที่เอาไว้โชว์ — ชื่อในเกมมาก่อน ตกลงมาเรื่อยๆ จนเหลือ uid */
export function displayName(u: UserProfile): string {
  return u.gameName?.trim() || u.name?.trim() || u.email?.trim() || u.uid;
}

/**
 * ตัวเลือกคนจากรายชื่อผู้ใช้จริง แทนการก๊อป uid มาวาง
 * เป็น controlled ล้วน — เก็บแค่คำค้นซึ่งเป็นเรื่องภายในของตัวเอง
 */
export default function UserPicker({
  value,
  onChange,
  exclude,
  label = "เลือกผู้ใช้",
  hint,
}: Props) {
  // ไม่มีแบ็กเอนด์ = ไม่ต้องรอ ให้ตกไปโหมดกรอก uid เองเลย
  const [list, setList] = useState<UserProfile[] | null>(() =>
    hasBackend ? null : [],
  );
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!hasBackend) return;
    // setState อยู่ใน callback ของ subscription เท่านั้น ไม่ใช่ในตัว effect
    return watchUsers(
      (rows) => setList(rows),
      // อ่านไม่ได้ (ไม่ใช่ผู้ดูแล) ถือว่าไม่มีรายชื่อ แล้วไปใช้ทางสำรอง
      () => setList([]),
    );
  }, []);

  // ต่อเป็นสตริงก่อน เพื่อไม่ให้ array ที่สร้างใหม่ทุกเรนเดอร์ทำให้ memo พัง
  const excludeKey = (exclude ?? []).join(",");

  const pool = useMemo(() => {
    const skip = new Set(excludeKey ? excludeKey.split(",") : []);
    return (list ?? []).filter((u) => !skip.has(u.uid));
  }, [list, excludeKey]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pool;
    return pool.filter((u) =>
      [u.gameName, u.name, u.email].some((v) =>
        v?.toLowerCase().includes(needle),
      ),
    );
  }, [pool, q]);

  const manual = (
    <div className="mt-3">
      <Input
        value={value ?? ""}
        placeholder="หรือวางรหัสผู้ใช้ (uid) เอง"
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(v ? stubProfile(v) : null);
        }}
      />
    </div>
  );

  return (
    <div>
      <Label hint={hint}>{label}</Label>

      {/* กำลังโหลด — เห็นรูปร่างปลายทางก่อน */}
      {list === null ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : list.length === 0 ? (
        <>
          <EmptyState
            title="ยังไม่มีผู้ใช้ในระบบ"
            description="ให้เขาสมัครบัญชีเข้ามาก่อน แล้วชื่อจะขึ้นในรายการนี้เอง"
          />
          {manual}
        </>
      ) : pool.length === 0 ? (
        <>
          <p className="text-sm text-muted">
            ทุกคนในรายชื่อถูกเลือกไปหมดแล้ว
          </p>
          {manual}
        </>
      ) : (
        <>
          <Input
            value={q}
            placeholder="ค้นจากชื่อในเกม ชื่อ หรืออีเมล"
            onChange={(e) => setQ(e.target.value)}
            aria-label="ค้นหาผู้ใช้"
          />

          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              ไม่พบคนที่ตรงกับ “{q.trim()}”
            </p>
          ) : (
            <ul className="no-scrollbar mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
              {rows.map((u) => {
                const on = u.uid === value;
                return (
                  <li key={u.uid}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange(on ? null : u)}
                      className={`tile flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        on
                          ? "border border-champagne/45 bg-champagne/10"
                          : "hover-tile border border-transparent"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
                        {u.photo ? (
                          // next/image ใช้ไม่ได้กับ static export — และต้องกัน 429 จากรูป Google
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.photo}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="font-display text-xs text-champagne">
                            {displayName(u).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ice">
                          {displayName(u)}
                        </span>
                        {u.email && (
                          <span className="block truncate text-xs text-muted">
                            {u.email}
                          </span>
                        )}
                      </span>

                      {on && (
                        <IconCheck
                          className="h-4 w-4 shrink-0 text-champagne"
                          strokeWidth={2}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
