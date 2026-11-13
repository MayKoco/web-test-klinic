"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { createClientId } from "@/lib/client-id";
type Plan = {
  managed: boolean;
  packageName?: string;
  branchLimit?: number;
  allocated?: number;
  remaining?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  canCreate: boolean;
  message?: string;
  status?: string;
};
export function OwnerBranchQuota({
  token,
  organizationId,
  onChanged,
}: {
  token: string;
  organizationId: string;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const key = useRef("");
  const load = useCallback(async () => {
    try {
      const r = await apiRequest<Plan>(
        `/owner/organizations/${organizationId}/subscription`,
        { token },
      );
      setPlan(r.data);
    } catch (e) {
      setError(String(e));
    }
  }, [organizationId, token]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    if (!key.current) key.current = createClientId();
    try {
      const r = await apiRequest<{ branch: { provisioningStatus: string } }>(
        `/owner/organizations/${organizationId}/branches`,
        {
          method: "POST",
          token,
          headers: { "Idempotency-Key": key.current },
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      setNotice(
        r.data.branch.provisioningStatus === "READY"
          ? "สร้างสาขาสำเร็จ หมดอายุพร้อมแพ็กเกจเดิม"
          : "รับคำขอสร้างสาขาแล้ว ระบบกำลังดำเนินการ",
      );
      setName("");
      key.current = "";
      await load();
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="owner-branch-section"
      style={{ textAlign: "left", padding: 24, fontSize: 16, lineHeight: 1.7 }}
    >
      <h2>แพ็กเกจองค์กรและสิทธิ์สาขา</h2>
      {error && (
        <p role="alert" style={{ color: "#bd2944" }}>
          {error}
        </p>
      )}
      {notice && <p style={{ color: "#168061" }}>{notice}</p>}
      {!plan ? (
        <p>กำลังโหลดสิทธิ์…</p>
      ) : !plan.managed ? (
        <p>แพ็กเกจเดิม · ติดต่อ Platform หากต้องการเปลี่ยนแปลงสิทธิ์สาขา</p>
      ) : (
        <>
          <p>
            <b>{plan.packageName}</b> · ใช้/จองแล้ว {plan.allocated} จาก{" "}
            {plan.branchLimit} สาขา · เหลือ {plan.remaining}
          </p>
          <p>
            เริ่ม{" "}
            {plan.startsAt
              ? new Date(plan.startsAt).toLocaleString("th-TH")
              : "รอระบบพร้อม"}{" "}
            · หมดอายุ{" "}
            {plan.expiresAt
              ? new Date(plan.expiresAt).toLocaleString("th-TH")
              : "—"}
          </p>
          <p>ทุกสาขาหมดอายุพร้อมกัน การเพิ่มสาขาไม่เริ่มนับวันใหม่</p>
          <form
            onSubmit={submit}
            style={{
              display: "flex",
              gap: 12,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            <label style={{ flex: 1 }}>
              ชื่อสาขาใหม่
              <input
                required
                maxLength={200}
                value={name}
                disabled={!plan.canCreate || busy}
                onChange={(e) => {
                  setName(e.target.value);
                  key.current = "";
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 12,
                  border: "1px solid #d8e2ef",
                  borderRadius: 10,
                  marginTop: 8,
                }}
              />
            </label>
            <button
              disabled={!plan.canCreate || busy}
              className="owner-create-branch"
              style={{ alignSelf: "end" }}
            >
              {busy ? "กำลังสร้าง…" : "สร้างสาขาตามสิทธิ์"}
            </button>
          </form>
          {!plan.canCreate && (
            <p>
              {plan.status === "EXPIRED"
                ? "แพ็กเกจหมดอายุแล้ว"
                : "โควตาสาขาครบ หรือแพ็กเกจยังไม่เริ่มใช้งาน"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
