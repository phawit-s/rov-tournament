"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { adminClaimStore } from "@/lib/backend/admin";
import { authStore } from "@/lib/backend/firebase";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { useSiteRole } from "@/hooks/useRole";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toast";
import { IconCopy } from "@/components/ui/icons";
import { Badge, EmptyState } from "@/components/ui/kit";
import UserPicker, { PersonAvatar, displayName } from "./UserPicker";

/**
 * รายชื่อผู้ดูแลระบบ — เพิ่ม/ถอดสิทธิ์ได้จากหน้าเว็บ ไม่ต้องเข้า Firebase Console
 * โชว์เฉพาะคนที่ Firestore ยืนยันสิทธิ์แล้ว
 *
 * แยกไส้ในออกมาเป็นอีก component เพื่อไม่ให้คนที่ไม่ใช่ผู้ดูแล
 * ไปเปิด listener รายชื่อผู้ใช้ทิ้งไว้เปล่าๆ แล้วโดนกติกาปฏิเสธ
 */
export default function AdminTeamPanel() {
  const { admin } = useSiteRole();
  if (!admin) return null;
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
  const calm = useReducedMotion();

  const me = authStore.user();
  const roster = adminClaimStore.roster();

  const [picked, setPicked] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  /* แยกจาก removing — ชื่อในกล่องยืนยันต้องค้างอยู่ระหว่างที่กล่องกำลังปิด */
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  /** ตัวเลือกคนกางเฉพาะตอนจะเพิ่ม — รายชื่อผู้ใช้ทั้งระบบยาวเกินจะวางค้างไว้ */
  const [adding, setAdding] = useState(false);

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
      setAdding(false);
      toast("เพิ่มเป็นผู้ดูแลแล้ว", "success");
    } catch {
      toast("เพิ่มไม่สำเร็จ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  const removingName = (() => {
    if (!removing) return "";
    const profile = byUid.get(removing);
    if (profile) return displayName(profile);
    return roster.find((r) => r.uid === removing)?.label ?? "";
  })();

  return (
    <section aria-labelledby="admins-title">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="admins-title" className="text-title font-bold">
            ผู้ดูแลระบบ
            {roster.length > 0 && (
              <span className="num ml-2 font-normal text-muted">{roster.length}</span>
            )}
          </h2>
          <p className="mt-1 max-w-prose text-muted">
            คนในรายชื่อนี้เปิดได้ทุกหน้าในสตูดิโอ อนุมัติสตรีมเมอร์ และแก้ช่องของทุกคน
            สิทธิ์ตรวจที่เซิร์ฟเวอร์ ไม่ใช่ในเบราว์เซอร์
          </p>
        </div>
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            เพิ่มผู้ดูแล
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-6 max-w-xl">
          <UserPicker
            label="เลือกคนที่จะเป็นผู้ดูแล"
            hint="เลือกจากคนที่เคยล็อกอินเข้าเว็บแล้ว"
            value={picked?.uid ?? null}
            onChange={setPicked}
            exclude={roster.map((r) => r.uid)}
          />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setPicked(null);
              }}
            >
              ยกเลิก
            </Button>
            <Button loading={busy} disabled={!picked} onClick={() => void add()}>
              เพิ่มเป็นผู้ดูแล
            </Button>
          </div>
        </div>
      )}

      {/* ---- รายชื่อ ---- */}
      <div className="mt-6">
        {roster.length === 0 ? (
          <EmptyState
            title="ยังไม่มีผู้ดูแลคนอื่น"
            description="ตอนนี้มีแค่บัญชีเจ้าของเว็บที่ตั้งไว้ใน firestore.rules กด “เพิ่มผู้ดูแล” เพื่อให้คนอื่นช่วยอนุมัติคำขอ"
          />
        ) : (
          <ul className="rows">
            <AnimatePresence initial={false}>
              {roster.map((entry) => {
                const profile = byUid.get(entry.uid);
                // ไม่มีโปรไฟล์ (ยังไม่เคยล็อกอิน/อ่านไม่ได้) ค่อยใช้ชื่อที่เก็บไว้ตอนเพิ่ม
                const name = profile ? displayName(profile) : entry.label;
                const sub = profile?.email ?? entry.uid;
                return (
                  <motion.li
                    key={entry.uid}
                    layout={!calm}
                    initial={{ opacity: 0, y: calm ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-3 py-3"
                  >
                    <PersonAvatar name={name} photo={profile?.photo} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{name}</p>
                      {sub !== name && (
                        <p className="truncate text-sm text-muted">{sub}</p>
                      )}
                    </div>

                    {entry.uid === me?.uid ? (
                      <Badge tone="ink">คุณ</Badge>
                    ) : (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setRemoving(entry.uid);
                          setConfirming(true);
                        }}
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

      {/* รหัสผู้ใช้ของตัวเอง เอาไว้ส่งให้ผู้ดูแลคนอื่นตอนรายชื่อผู้ใช้ไม่ขึ้น */}
      {me && (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-5">
          <span className="text-sm text-muted">รหัสผู้ใช้ของคุณ</span>
          <code className="num max-w-full min-w-0 truncate text-sm">{me.uid}</code>
          <Button
            variant="secondary"
            success={copied}
            icon={<IconCopy className="h-4 w-4" />}
            onClick={() => {
              void navigator.clipboard
                .writeText(me.uid)
                .then(() => {
                  setCopied(true);
                  toast("คัดลอกรหัสผู้ใช้แล้ว", "success");
                })
                .catch(() =>
                  toast("คัดลอกไม่ได้ เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด ลากคลุมรหัสแล้วคัดลอกเอง", "error"),
                );
            }}
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming && !!removing}
        tone="danger"
        title={removingName ? `ถอดสิทธิ์ผู้ดูแลของ ${removingName}?` : "ถอดสิทธิ์ผู้ดูแลคนนี้?"}
        description="เขาจะเข้าหน้าของผู้ดูแลไม่ได้ และแก้ช่องของคนอื่นไม่ได้ทันที"
        confirmText="ถอดสิทธิ์"
        onConfirm={() => {
          if (!removing) return;
          adminClaimStore
            .removeAdmin(removing)
            .then(() => toast("ถอดสิทธิ์ผู้ดูแลแล้ว", "success"))
            .catch(() => toast("ถอดสิทธิ์ไม่สำเร็จ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง", "error"));
        }}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}
