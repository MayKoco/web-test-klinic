"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";
import { createClientId } from "@/lib/client-id";

type Package = { id: string; name: string; price: string | number; subscriptionDays: number };
type Order = {
  id: string; status: "PENDING" | "PAID" | "PROVISIONING" | "FAILED" | "READY" | "EXPIRED";
  checkoutUrl: string | null; clinicId: string | null; name: string;
  code: string; amountMinor: number; subscriptionDays: number; paidAt: string | null;
};
type PurchaseInput = { name: string; code?: string; packageId: string; returnUrl: string };
const labels: Record<Order["status"], string> = {
  PENDING: "รอยืนยันการชำระเงิน",
  PAID: "ชำระเงินแล้ว กำลังเตรียมสร้างสาขา",
  PROVISIONING: "ชำระเงินแล้ว กำลังสร้างสาขา",
  FAILED: "ชำระเงินแล้ว แต่สร้างสาขาไม่สำเร็จ กรุณาติดต่อทีมดูแล",
  READY: "สาขาพร้อมใช้งาน",
  EXPIRED: "ลิงก์ชำระเงินหมดอายุ",
};
const money = (value: number) => new Intl.NumberFormat("th-TH", {
  style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(value);
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ";

function readPurchaseDraft(storageKey: string): { input: PurchaseInput; key: string } | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function returnedBranchOrganization() {
  return new URLSearchParams(window.location.search).get("organizationId");
}

export default function OwnerBranchPurchase({
  token, organization, onClose, onReady, onEnter,
}: {
  token: string;
  organization: { id: string; name: string };
  onClose: () => void;
  onReady: () => void;
  onEnter?: (clinicId: string, code: string) => void;
}) {
  const storageKey = `klinic-branch-checkout:${organization.id}`;
  const draftKey = `${storageKey}:draft`;
  const [savedDraft, setSavedDraft] = useState(() => readPurchaseDraft(draftKey));
  const [checkoutId, setCheckoutId] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return (query.get("organizationId") === organization.id && query.get("checkoutId")) ||
      window.localStorage.getItem(storageKey) || "";
  });
  const [returnedWithoutPayment, setReturnedWithoutPayment] = useState(() =>
    new URLSearchParams(window.location.search).get("checkoutReturn") === "cancel",
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [selectedId, setSelectedId] = useState(savedDraft?.input.packageId ?? "");
  const [showBranchDetails, setShowBranchDetails] = useState(Boolean(savedDraft));
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [orderMissing, setOrderMissing] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef(savedDraft);
  const submitting = useRef(false);
  const ready = useRef(onReady);
  const base = `/owner/organizations/${encodeURIComponent(organization.id)}/branch-checkouts`;
  const selected = packages?.find((pkg) => pkg.id === selectedId);
  const choosingPackage = !checkoutId && !(selected && showBranchDetails);

  useEffect(() => { ready.current = onReady; }, [onReady]);

  useEffect(() => {
    if (checkoutId) return;
    const controller = new AbortController();
    apiRequest<Package[]>("/owner/packages?paidOnly=true", { token, signal: controller.signal })
      .then(({ data }) => setPackages(data))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); });
    return () => controller.abort();
  }, [checkoutId, reload, token]);

  useEffect(() => {
    if (!checkoutId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let polls = 0;
    async function read() {
      try {
        const { data } = await apiRequest<Order>(`${base}/${encodeURIComponent(checkoutId)}`, { token, signal: controller.signal });
        if (controller.signal.aborted) return;
        setOrder(data);
        setError("");
        if (data.status === "READY") { ready.current(); return; }
        if (data.status === "FAILED" || data.status === "EXPIRED") return;
        if (++polls < 30) timer = window.setTimeout(() => void read(), 3000);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(errorText(cause));
          setOrderMissing(cause instanceof ApiClientError && cause.status === 404);
        }
      }
    }
    void read();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [base, checkoutId, reload, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !showBranchDetails || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name")).trim(),
      ...(savedDraft?.input.code && { code: savedDraft.input.code }),
      packageId: selected.id,
      returnUrl: window.location.origin + window.location.pathname,
    };
    if (JSON.stringify(submission.current?.input) !== JSON.stringify(input)) {
      submission.current = { input, key: createClientId() };
    }
    window.localStorage.setItem(draftKey, JSON.stringify(submission.current));
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await apiRequest<Order>(base, {
        method: "POST", token,
        headers: { "Idempotency-Key": submission.current!.key },
        body: JSON.stringify(input),
      });
      window.localStorage.setItem(storageKey, data.id);
      window.localStorage.removeItem(draftKey);
      if (data.checkoutUrl) { window.location.assign(data.checkoutUrl); return; }
      setCheckoutId(data.id);
      setOrder(data);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function clearOrder() {
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(draftKey);
    const url = new URL(window.location.href);
    for (const param of ["checkoutId", "organizationId", "checkoutReturn"]) url.searchParams.delete(param);
    window.history.replaceState(null, "", url);
    setOrder(null);
    setError("");
    setOrderMissing(false);
    setReturnedWithoutPayment(false);
    setCheckoutId("");
    setSelectedId("");
    setShowBranchDetails(false);
    setSavedDraft(null);
    submission.current = null;
  }

  function close() {
    if (busy) return;
    if (orderMissing || order?.status === "READY" || order?.status === "EXPIRED") clearOrder();
    onClose();
  }

  return <div className="modal-backdrop owner-branch-modal" role="presentation">
    <form className="modal-box owner-inline-branch-form owner-purchase" data-package-picker={choosingPackage} role="dialog" aria-modal="true" aria-labelledby="branch-purchase-title" onSubmit={submit}>
      <header><div><h2 id="branch-purchase-title">{checkoutId ? "สถานะการเปิดสาขา" : choosingPackage ? "เลือกแพ็กเกจสำหรับสาขาใหม่" : "ข้อมูลสาขาและยอดชำระ"}</h2><p>{organization.name}</p></div>
        <button type="button" onClick={close} aria-label="ปิด" disabled={busy}>×</button>
      </header>
      <div className="owner-purchase-body">
        {checkoutId ? <>
          <p role="status">{order ? labels[order.status] : error ? "ยังตรวจสอบสถานะไม่ได้" : "กำลังตรวจสอบสถานะ…"}</p>
          {order && <p><strong>{order.name}</strong> · {order.code} · {order.subscriptionDays} วัน · {money(order.amountMinor / 100)}</p>}
          {order?.status === "PENDING" && order.checkoutUrl && returnedWithoutPayment && <p>คุณออกจากหน้าชำระเงินแล้ว สามารถกลับไปชำระรายการเดิมได้</p>}
          {order?.status === "PENDING" && !order.checkoutUrl && <p>ระบบกำลังรอผลจาก Stripe</p>}
        </> : selected && showBranchDetails ? <>
          <div className="owner-purchase-details">
            <div className="owner-inline-fields">
              <label>ชื่อสาขา<input name="name" defaultValue={savedDraft?.input.name} required maxLength={200} placeholder="เช่น สาขาทองหล่อ" /></label>
              <p>ชื่อนี้จะแสดงในรายการเลือกสาขาเมื่อเข้าสู่ระบบ</p>
            </div>
            <aside className="owner-purchase-order-summary" aria-label="สรุปยอดชำระ">
              <span>แพ็กเกจ Klinic · {selected.subscriptionDays} วัน</span>
              <div><span>ยอดชำระ</span><strong>{money(Number(selected.price))}</strong></div>
            </aside>
          </div>
        </> : <>
          {packages === null && !error && <p role="status">กำลังโหลดแพ็กเกจ…</p>}
          {packages?.length === 0 && <p>ยังไม่มีแพ็กเกจสำหรับเปิดสาขาเพิ่ม</p>}
          {!!packages?.length && (
            <fieldset className="owner-purchase-plans">
              <legend>แพ็กเกจ Klinic</legend>
              <p>สิทธิ์ใช้งานเหมือนกันทุกระยะเวลา เลือกระยะเวลาที่เหมาะกับสาขานี้</p>
              <div className="owner-purchase-options">
                {packages.map((pkg, index) => (
                  <label
                    className="owner-purchase-plan"
                    data-highlighted={packages.length >= 3 && index === Math.floor((packages.length - 1) / 2)}
                    key={pkg.id}
                  >
                    <input type="radio" name="plan" value={pkg.id} checked={selectedId === pkg.id} onChange={() => setSelectedId(pkg.id)} />
                    <span className="owner-purchase-plan-title">{pkg.subscriptionDays} วัน</span>
                    <span className="owner-purchase-plan-total">
                      <strong>{money(Number(pkg.price))}</strong>
                      <small>ชำระครั้งเดียว</small>
                    </span>
                    <span className="owner-purchase-plan-inclusions">
                      <span>นัดหมายและจัดการคิว</span>
                      <span>บันทึกการรักษา</span>
                      <span>ขายสินค้าและบริการ</span>
                    </span>
                    <span className="owner-purchase-plan-action" aria-hidden="true">
                      {selectedId === pkg.id ? "เลือกแล้ว" : "เลือกแพ็กเกจ"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>}
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <footer>
        {choosingPackage && selected && <p className="owner-purchase-selection" role="status">
          <span>แพ็กเกจที่เลือก · {selected.subscriptionDays} วัน</span>
          <strong>{money(Number(selected.price))}</strong>
        </p>}
        <div>
        <button type="button" className="ghost-button" onClick={!choosingPackage && !checkoutId ? () => setShowBranchDetails(false) : close} disabled={busy}>{!choosingPackage && !checkoutId ? "กลับไปเลือกแพ็กเกจ" : "ปิด"}</button>
        {choosingPackage && !!packages?.length && <button type="button" className="primary-button" disabled={!selected} onClick={() => setShowBranchDetails(true)}>ถัดไป <span aria-hidden="true">→</span></button>}
        {selected && !choosingPackage && !checkoutId && <button className="primary-button" disabled={busy}>{busy ? "กำลังเปิด Stripe…" : "ดำเนินการชำระเงิน"}</button>}
        {checkoutId && order?.status !== "READY" && order?.status !== "EXPIRED" && <button type="button" className="ghost-button" onClick={() => setReload((value) => value + 1)}>ตรวจสอบสถานะ</button>}
        {order?.status === "PENDING" && order.checkoutUrl && <a className="primary-button" href={order.checkoutUrl}>กลับไปชำระเงิน</a>}
        {(orderMissing || order?.status === "EXPIRED") && <button type="button" className="primary-button" onClick={clearOrder}>เริ่มรายการใหม่</button>}
        {order?.status === "READY" && order.clinicId && onEnter && <button type="button" className="primary-button" onClick={() => onEnter(order.clinicId!, order.code)}>เข้าสู่สาขา</button>}
        {!checkoutId && !packages && error && <button type="button" className="primary-button" onClick={() => { setError(""); setReload((value) => value + 1); }}>โหลดแพ็กเกจใหม่</button>}
      </div></footer>
    </form>
  </div>;
}
