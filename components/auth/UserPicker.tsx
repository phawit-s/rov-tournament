"use client";

import { useEffect, useMemo, useState } from "react";
import { hasBackend } from "@/lib/backend/firebase";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { Input, Label, Skeleton } from "@/components/ui/kit";
import { IconCheck, IconSearch } from "@/components/ui/icons";

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

/** ชื่อที่เอาไว้โชว์ — ชื่อที่ตั้งในโปรไฟล์มาก่อน ตกลงมาเรื่อยๆ จนเหลือ uid */
export function displayName(u: UserProfile): string {
  return u.gameName?.trim() || u.name?.trim() || u.email?.trim() || u.uid;
}

/**
 * รูปโปรไฟล์ในแถวรายชื่อคน
 * Avatar ของ SiteHeader รับ AuthUser ทั้งก้อน แต่แถวพวกนี้มีแค่ UserProfile
 * ไม่มีรูป = อักษรตัวแรกบนพื้นเทา (วงดำทั้งคอลัมน์หนักตาเกินไปสำหรับรายการยาว)
 */
export function PersonAvatar({
  name,
  photo,
  className = "h-10 w-10",
}: {
  name: string;
  photo?: string | null;
  className?: string;
}) {
  if (photo) {
    return (
      // static export ใช้ next/image ไม่ได้ และ no-referrer กันรูป Google โดน 429
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full bg-fill object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-fill font-bold text-muted ${className}`}
    >
      {(name.trim() || "?").slice(0, 1).toUpperCase()}
    </span>
  );
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
    <Input
      value={value ?? ""}
      placeholder="วางรหัสผู้ใช้ (uid)"
      aria-label="รหัสผู้ใช้"
      autoComplete="off"
      spellCheck={false}
      className="num mt-3"
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v ? stubProfile(v) : null);
      }}
    />
  );

  return (
    <div>
      <Label hint={hint}>{label}</Label>

      {/* กำลังโหลด — เห็นรูปร่างปลายทางก่อน */}
      {list === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-field" />
          <Skeleton className="h-40 w-full rounded-field" />
        </div>
      ) : list.length === 0 ? (
        <>
          <p className="text-sm text-muted">
            ยังอ่านรายชื่อผู้ใช้ไม่ได้ หรือยังไม่มีใครล็อกอินเข้าเว็บ
            ให้เขาล็อกอินก่อนแล้วชื่อจะขึ้นเอง หรือวางรหัสผู้ใช้ของเขาด้านล่าง
          </p>
          {manual}
        </>
      ) : pool.length === 0 ? (
        <>
          <p className="text-sm text-muted">
            ทุกคนที่ล็อกอินเข้าเว็บมีสิทธิ์นี้อยู่แล้ว วางรหัสผู้ใช้ของคนใหม่ด้านล่างได้
          </p>
          {manual}
        </>
      ) : (
        <>
          <label className="flex min-h-12 items-center gap-2.5 rounded-field bg-fill px-4 focus-within:bg-canvas focus-within:shadow-[inset_0_0_0_2px_var(--c-ink)]">
            <IconSearch className="h-4 w-4 shrink-0 text-muted" />
            <span className="sr-only">ค้นหาผู้ใช้</span>
            <input
              value={q}
              placeholder="ค้นจากชื่อหรืออีเมล"
              onChange={(e) => setQ(e.target.value)}
              className="min-w-0 grow bg-transparent outline-none placeholder:text-faint"
            />
          </label>

          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              ไม่มีใครชื่อหรืออีเมลตรงกับ “{q.trim()}” ลองพิมพ์แค่บางส่วน
            </p>
          ) : (
            <ul className="rows mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-field border border-line">
              {rows.map((u) => {
                const on = u.uid === value;
                const name = displayName(u);
                return (
                  <li key={u.uid}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange(on ? null : u)}
                      className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        on ? "bg-fill" : "hover:bg-fill"
                      }`}
                    >
                      <PersonAvatar name={name} photo={u.photo} className="h-9 w-9 text-sm" />

                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${on ? "font-semibold" : "font-medium"}`}>
                          {name}
                        </span>
                        {u.email && u.email !== name && (
                          <span className="block truncate text-sm text-muted">
                            {u.email}
                          </span>
                        )}
                      </span>

                      {on && (
                        <IconCheck className="h-5 w-5 shrink-0" strokeWidth={2.2} />
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
