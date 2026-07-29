"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { PERMISSION_MATRIX, ROLE_META, type Role } from "@/lib/tournament/roles";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import { Input } from "./ui";

type Props = { tournament: Tournament; role: Role };

/** ชื่อที่เอาไว้โชว์ — ชื่อในเกมมาก่อน แล้วค่อยไล่ลงมา */
function accountLabel(p: UserProfile): string {
  return (
    p.gameName?.trim() || p.name?.trim() || p.email?.trim() || "บัญชีผู้ใช้"
  );
}

/** อ้างอิงเดิมตัวเดียว กัน setState ด้วย array ใหม่ทุกครั้งที่อ่านรายชื่อไม่ได้ */
const NO_PROFILES: UserProfile[] = [];

export default function AccessPanel({ tournament, role }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const user = authStore.user();

  const staff = tournament.adminEmails ?? [];
  const isOwner = role === "owner";

  /*
    รายชื่อผู้ใช้ไว้ให้กดเลือกแทนการพิมพ์อีเมลเอง
    กติกา Firestore เปิด list ให้เฉพาะผู้ดูแลระบบ เจ้าของทัวร์ทั่วไปจะโดนปฏิเสธ
    กรณีนั้นให้เงียบแล้วเหลือแค่ช่องกรอกอีเมลเหมือนเดิม ไม่ต้องโชว์ error ให้คนงง
  */
  const [people, setPeople] = useState<UserProfile[]>(NO_PROFILES);

  useEffect(() => {
    if (!hasBackend) return;
    // setState อยู่ใน callback ของ subscription เท่านั้น ไม่ใช่ในตัว effect
    return watchUsers(
      (rows) => setPeople(rows),
      () => setPeople(NO_PROFILES),
    );
  }, []);

  /** อีเมล → โปรไฟล์ ไว้เติมชื่อกับรูปให้ทีมงานที่เพิ่มไว้แล้ว */
  const byEmail = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const p of people) {
      const mail = p.email?.trim().toLowerCase();
      if (mail) map.set(mail, p);
    }
    return map;
  }, [people]);

  const ownerEmail = (tournament.ownerEmail ?? user?.email ?? "").toLowerCase();

  // ต่อเป็นสตริงก่อน เพราะ adminEmails เป็น array ใหม่ทุกเรนเดอร์ ถ้าใส่ตรงๆ memo จะพัง
  const staffKey = staff.map((m) => m.toLowerCase()).join(",");

  /** คนที่ยังเพิ่มได้ — ต้องมีอีเมล และยังไม่ได้อยู่ในทีมงาน/ไม่ใช่เจ้าของ */
  const candidates = useMemo(() => {
    const taken = new Set(staffKey ? staffKey.split(",") : []);
    if (ownerEmail) taken.add(ownerEmail);
    return people.filter((p) => {
      const mail = p.email?.trim().toLowerCase();
      return !!mail && !taken.has(mail);
    });
  }, [people, staffKey, ownerEmail]);

  const [query, setQuery] = useState("");

  /** กรองตามคำค้น — รายชื่อยาวๆ เลื่อนหาเองไม่ไหว */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((p) =>
      [p.gameName, p.name, p.email].some((v) =>
        v?.toLowerCase().includes(needle),
      ),
    );
  }, [candidates, query]);

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

          {/* เลือกจากรายชื่อจริงแทนการพิมพ์อีเมลเอง — โผล่เฉพาะคนที่อ่านรายชื่อได้ */}
          {candidates.length > 0 && (
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="slug slug-2">เลือกจากรายชื่อผู้ใช้</span>
                <span className="num text-xs text-muted">
                  {visible.length} คน
                </span>
              </div>

              {candidates.length > 6 && (
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นจากชื่อในเกม ชื่อ หรืออีเมล"
                  aria-label="ค้นหาผู้ใช้"
                  className="mt-2"
                />
              )}

              {visible.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  ไม่พบคนที่ตรงกับ “{query.trim()}”
                </p>
              ) : (
                <ul className="no-scrollbar mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-0.5">
                  {visible.map((p) => {
                    const mail = p.email ?? "";
                    const picked =
                      mail.toLowerCase() === email.trim().toLowerCase();
                    return (
                      <li key={p.uid}>
                        <button
                          type="button"
                          aria-pressed={picked}
                          onClick={() => {
                            // เติมลงช่องเดิม โครงข้อมูลยังเป็นอีเมลเหมือนเดิม
                            // กติกา Firestore เทียบสิทธิ์ทีมงานด้วยอีเมล ห้ามเปลี่ยนเป็น uid
                            setEmail(mail);
                            setError(null);
                          }}
                          className={`tile flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            picked
                              ? "border border-champagne/45 bg-champagne/10"
                              : "hover-tile border border-transparent"
                          }`}
                        >
                          <AccountAvatar profile={p} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ice">
                              {accountLabel(p)}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {mail}
                            </span>
                          </span>
                          <span className="shrink-0 font-display text-xs text-champagne">
                            {picked ? "อยู่ในช่องแล้ว" : "ใส่อีเมล"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

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
              {staff.map((mail) => {
                // จับคู่กับโปรไฟล์ได้ = โชว์ชื่อกับรูป จะได้รู้ว่าอีเมลนี้คือใคร
                const p = byEmail.get(mail.toLowerCase()) ?? null;
                return (
                  <motion.li
                    key={mail}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex items-center gap-3 rounded-xl tile px-4 py-2.5"
                  >
                    {p && <AccountAvatar profile={p} />}
                    <span className="min-w-0 flex-1">
                      {p && (
                        <span className="block truncate text-sm text-ice">
                          {accountLabel(p)}
                        </span>
                      )}
                      <span
                        className={`block truncate ${p ? "text-xs text-muted" : "text-sm text-ice"}`}
                      >
                        {mail}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-xs text-muted">
                      ทีมงาน
                    </span>
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
                );
              })}
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

/** รูปโปรไฟล์กลมๆ ไม่มีรูปก็ใช้ตัวอักษรแรกของชื่อแทน */
function AccountAvatar({ profile }: { profile: UserProfile }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
      {profile.photo ? (
        // next/image ใช้กับ static export ไม่ได้ — no-referrer กันรูป Google โดน 429
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.photo}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-display text-xs text-champagne">
          {accountLabel(profile).slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
