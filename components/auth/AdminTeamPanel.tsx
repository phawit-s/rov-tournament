"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { adminClaimStore } from "@/lib/backend/admin";
import { authStore } from "@/lib/backend/firebase";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { useAccess } from "@/hooks/useAdmin";
import Panel, { PanelHeader } from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toast";
import { IconCheck, IconCopy } from "@/components/ui/icons";
import { EmptyState } from "@/components/tournament/ui";
import UserPicker, { displayName } from "./UserPicker";

/**
 * รายชื่อผู้ดูแลระบบ — เพิ่ม/ถอดสิทธิ์ได้จากหน้าเว็บ ไม่ต้องเข้า Firebase Console
 * โชว์เฉพาะคนที่ Firestore ยืนยันสิทธิ์แล้ว (โหมดรหัสในเครื่องแตะตรงนี้ไม่ได้)
 *
 * แยกไส้ในออกมาเป็นอีก component เพื่อไม่ให้คนที่ไม่ใช่ผู้ดูแล
 * ไปเปิด listener รายชื่อผู้ใช้ทิ้งไว้เปล่าๆ แล้วโดนกติกาปฏิเสธ
 */
export default function AdminTeamPanel() {
  const access = useAccess();
  // โหมดรหัสในเครื่องไม่มีสิทธิ์แตะข้อมูลบนคลาวด์ ไม่ต้องโชว์ให้สับสน
  if (access !== "verified") return null;
  return <TeamPanel />;
}

function TeamPanel() {
  useSyncExternalStore(
    adminClaimStore.subscribe,
    adminClaimStore.getSnapshot,
    adminClaimStore.getServerSnapshot,
  );
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );

  const me = authStore.user();
  const roster = adminClaimStore.roster();

  const [picked, setPicked] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // ดึงรายชื่อทั้งหมดครั้งเดียว แล้วจับคู่กับ roster เอง
  // (ยิง getProfile ทีละคนจะกลายเป็นคำขอเป็นสิบตอนผู้ดูแลเยอะ)
  useEffect(() => {
    return watchUsers((rows) => setUsers(rows));
  }, []);

  const byUid = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach((u) => map.set(u.uid, u));
    return map;
  }, [users]);

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await adminClaimStore.addAdmin(picked.uid, displayName(picked));
      setPicked(null);
      toast("เพิ่มผู้ดูแลแล้ว", "success");
    } catch {
      toast("เพิ่มไม่สำเร็จ — ลองใหม่อีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6 sm:p-7">
      <PanelHeader
        eyebrow="Access"
        title="ผู้ดูแลระบบ"
        count={roster.length || undefined}
      />

      <p className="text-sm leading-relaxed text-muted">
        คนที่อยู่ในรายชื่อนี้เปิดเมนูหลังบ้านได้ทุกหน้า
        สิทธิ์ถูกตรวจที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ในเบราว์เซอร์
      </p>

      {/* รหัสผู้ใช้ของตัวเอง เอาไว้ส่งให้คนอื่นเพิ่มให้ */}
      {me && (
        <div className="tile mt-5 rounded-xl p-4">
          <p className="slug slug-2">รหัสผู้ใช้ของคุณ</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate text-xs text-ice">
              {me.uid}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(me.uid)
                  .then(() => {
                    setCopied(true);
                    toast("คัดลอกแล้ว", "success");
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
        </div>
      )}

      {/* ---- รายชื่อ ---- */}
      <div className="mt-6">
        {roster.length === 0 ? (
          <EmptyState
            title="ยังไม่มีผู้ดูแลเพิ่มเติม"
            description="ตอนนี้มีแค่บัญชีเจ้าของเว็บที่กำหนดไว้ใน firestore.rules"
          />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {roster.map((entry) => {
                const profile = byUid.get(entry.uid);
                // ไม่มีโปรไฟล์ (ยังไม่เคยล็อกอิน/อ่านไม่ได้) ค่อยใช้ชื่อที่เก็บไว้ตอนเพิ่ม
                const name = profile ? displayName(profile) : entry.label;
                return (
                  <motion.li
                    key={entry.uid}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="tile flex items-center gap-3 rounded-xl px-4 py-3"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
                      {profile?.photo ? (
                        // static export ใช้ next/image ไม่ได้ · no-referrer กันรูป Google โดน 429
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.photo}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="font-display text-xs text-champagne">
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ice">{name}</p>
                      <p className="truncate text-xs text-muted">
                        {profile?.email ?? entry.uid}
                      </p>
                    </div>

                    {entry.uid === me?.uid ? (
                      <span className="slug slug-2 shrink-0">คุณ</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setRemoving(entry.uid)}
                      >
                        ถอดสิทธิ์
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* ---- เพิ่มคนใหม่ ---- */}
      <div className="mt-6 border-t border-hair pt-5">
        <UserPicker
          label="เพิ่มผู้ดูแล"
          hint="เลือกจากคนที่เคยล็อกอินเข้าเว็บแล้ว"
          value={picked?.uid ?? null}
          onChange={setPicked}
          exclude={roster.map((r) => r.uid)}
        />
        <div className="mt-3 flex justify-end">
          <Button
            loading={busy}
            disabled={!picked}
            className="w-full sm:w-auto"
            onClick={() => void add()}
          >
            เพิ่ม
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!removing}
        tone="danger"
        title="ถอดสิทธิ์ผู้ดูแลคนนี้?"
        description="เขาจะเปิดเมนูหลังบ้านไม่ได้อีก และแก้ข้อมูลบนคลาวด์ไม่ได้ทันที"
        confirmText="ถอดสิทธิ์"
        onConfirm={() => {
          if (!removing) return;
          adminClaimStore
            .removeAdmin(removing)
            .then(() => toast("ถอดสิทธิ์แล้ว", "success"))
            .catch(() => toast("ถอดสิทธิ์ไม่สำเร็จ", "error"));
        }}
        onClose={() => setRemoving(null)}
      />
    </Panel>
  );
}
