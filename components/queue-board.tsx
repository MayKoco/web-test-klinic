"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type BoardAction = "CHECK_IN" | "START" | "FINISH" | "COMPLETE" | "CANCEL";
type SettlementMode = "PAYMENT" | "ENTITLEMENT" | "NO_CHARGE";
type CatalogItem = { id: string; code: string; name: string; type: "PRODUCT" | "SERVICE" | "COURSE"; basePrice?: string; finalPrice: string; productDetail?: { unit?: string | null; currentStock?: number } };
type Entitlement = { id: string; catalogItemId: string; totalUnits: number; usedUnits: number; remainingUnits: number; expiresAt?: string; status: string };
type AppointmentItem = { id: string; catalogItemId: string; name: string; type: string; quantity: number; settlementMode: SettlementMode; entitlementId?: string | null; usageStatus?: "PLANNED" | "PENDING" | "USED" | "NOT_USED"; resolutionNote?: string | null };
type UnpaidSale = { id: string; status: string; balanceAmount: string };
type SaleDetail = {
  id: string; saleNo: string; status: string; subtotal: string; discountAmount: string; netAmount: string; balanceAmount: string; note?: string | null;
  lines: { id: string; itemType: string; itemCodeSnapshot: string; itemNameSnapshot: string; quantity: number; unitBasePriceSnapshot: string; discountAmount: string; netAmount: string; components?: { id: string; componentType: string; nameSnapshot: string; quantity: number; allocatedNetAmount: string }[] }[];
};
type CheckoutState = { card: BoardCard; saleId: string; amount: string; method: string; sale?: SaleDetail; context?: TreatmentContext | null };
type BoardCard = {
  appointmentId: string;
  displayNo: string;
  appointmentNo: string;
  startTime: string;
  status: string;
  patient: { id: string; hn: string; name: string; phone: string };
  doctor: { id: string; name: string };
  room: { id: string; name: string };
  items: AppointmentItem[];
  checkedInAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  completedAt?: string | null;
  treatmentRecorded: boolean;
  settlement: { state: string; balanceAmount: string; unpaidSales?: UnpaidSale[] };
  blockingReasons: string[];
  availableActions: BoardAction[];
};
type BoardData = {
  summary: { scheduled: number; waiting: number; inProgress: number; pendingClose: number; completed: number };
  columns: { scheduled: BoardCard[]; waiting: BoardCard[]; inProgress: BoardCard[]; pendingClose: BoardCard[]; completed: BoardCard[] };
};
type Doctor = { id: string; prefix?: string; firstName: string; lastName: string };
type PatientDetail = {
  id: string; hn: string; prefix?: string | null; firstName: string; lastName: string;
  phone: string; birthDate?: string | null; bloodGroup?: string | null;
  medicalConditions?: unknown; drugAllergies?: unknown;
};
type VitalRecord = {
  id: string; heightCm?: string | number | null; weightKg?: string | number | null;
  bmi?: string | number | null; recordedAt: string; appointmentId?: string | null;
  source?: string; appointment?: { appointmentNo?: string; date?: string } | null;
};
type CheckInContext = {
  appointment: { id: string; appointmentNo: string; date: string; startTime: string; endTime: string; status: string };
  patient: PatientDetail & { displayName?: string; ageYears?: number | null };
  doctor: { id: string; displayName: string };
  room: { id: string; name: string };
  items: AppointmentItem[];
  latestVitals: VitalRecord | null;
  canCheckIn: boolean;
  blockingReasons: string[];
};
type TreatmentContextItem = AppointmentItem & {
  code: string;
  source: { type: string; name: string };
  entitlement?: { id: string; totalUnits: number; usedUnits: number; remainingUnits: number; status: string } | null;
  products: { catalogItemId: string; name: string; recommendedQuantity: number; unit?: string | null }[];
};
type TreatmentContext = {
  appointment?: { id: string; appointmentNo: string; date: string; startTime: string; endTime: string; status: string; chiefComplaint?: string | null };
  patient: PatientDetail;
  doctor?: { id: string; prefix?: string | null; firstName?: string; lastName?: string; displayName?: string; licenseNo?: string | null; specialty?: string | null };
  room?: { id: string; roomCode?: string; name: string };
  latestVitals: VitalRecord | null;
  treatmentRecord?: { id: string; symptoms?: unknown; treatmentDetail?: string; treatmentAreas?: unknown; medications?: unknown; aftercareNote?: string | null; createdAt?: string } | null;
  items: TreatmentContextItem[];
};

const blankBoard: BoardData = {
  summary: { scheduled: 0, waiting: 0, inProgress: 0, pendingClose: 0, completed: 0 },
  columns: { scheduled: [], waiting: [], inProgress: [], pendingClose: [], completed: [] },
};

const actionConfig: Record<string, { label: string; endpoint: string }> = {
  CHECK_IN: { label: "Check-in", endpoint: "check-in" },
  START: { label: "เริ่มรักษา", endpoint: "start" },
  FINISH: { label: "จบการรักษา", endpoint: "finish" },
  COMPLETE: { label: "ปิดงาน", endpoint: "complete" },
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function apiError(error: unknown) {
  const value = error as ApiClientError;
  return value.code ? `${value.code}: ${value.message}` : value.message ?? String(error);
}

function elapsed(from: string | null | undefined, now: number) {
  if (!from) return "";
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes} นาที`;
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function QueueBoard() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<{ name: string; clinicCode: string } | null>(null);
  const [date, setDate] = useState(localDate());
  const [doctorId, setDoctorId] = useState("");
  const [search, setSearch] = useState("");
  const [board, setBoard] = useState<BoardData>(blankBoard);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<BoardCard | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [itemDraft, setItemDraft] = useState({ catalogItemId: "", settlementMode: "PAYMENT" as SettlementMode, entitlementId: "" });
  const [treatmentCard, setTreatmentCard] = useState<BoardCard | null>(null);
  const [treatmentContext, setTreatmentContext] = useState<TreatmentContext | null>(null);
  const [treatmentResults, setTreatmentResults] = useState<Record<string, "PENDING" | "USED" | "NOT_USED">>({});
  const [treatmentProducts, setTreatmentProducts] = useState<CatalogItem[]>([]);
  const [payment, setPayment] = useState<CheckoutState | null>(null);
  const [checkInCard, setCheckInCard] = useState<BoardCard | null>(null);

  const loadBoard = useCallback(async (accessToken: string, targetDate: string, targetDoctor = "", term = "", silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ date: targetDate });
      if (targetDoctor) params.set("doctorId", targetDoctor);
      if (term.trim()) params.set("search", term.trim());
      const response = await apiRequest<BoardData>(`/appointments/board?${params}`, { token: accessToken });
      setBoard(response.data);
      setNotice(current => current?.kind === "error" ? null : current);
    } catch (error) {
      setNotice({ kind: "error", text: apiError(error) });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem("klinic-test-token") ?? "";
    const savedProfile = localStorage.getItem("klinic-test-profile");
    queueMicrotask(async () => {
      if (!savedToken) { setLoading(false); return; }
      setToken(savedToken);
      if (savedProfile) try { setProfile(JSON.parse(savedProfile)); } catch { setProfile(null); }
      try {
        const doctorResponse = await apiRequest<Doctor[]>("/doctors?limit=100&sortBy=firstName&sortOrder=asc", { token: savedToken });
        setDoctors(doctorResponse.data);
      } catch { setDoctors([]); }
      await loadBoard(savedToken, localDate());
    });
  }, [loadBoard]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => void loadBoard(token, date, doctorId, search), 300);
    return () => window.clearTimeout(timer);
  }, [date, doctorId, search, token, loadBoard]);

  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => void loadBoard(token, date, doctorId, search, true), 30000);
    return () => window.clearInterval(timer);
  }, [date, doctorId, search, token, loadBoard]);

  const totalActive = board.summary.scheduled + board.summary.waiting + board.summary.inProgress + board.summary.pendingClose;

  async function runAction(card: BoardCard, action: Exclude<BoardAction, "CANCEL">) {
    const config = actionConfig[action];
    setBusy(`${card.appointmentId}:${action}`);
    setNotice(null);
    try {
      await apiRequest(`/appointments/${card.appointmentId}/${config.endpoint}`, { method: "POST", token });
      setNotice({ kind: "success", text: `${config.label} ${card.patient.name} เรียบร้อย` });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) {
      setNotice({ kind: "error", text: apiError(error) });
    } finally { setBusy(""); }
  }

  async function cancelAppointment(card: BoardCard) {
    const reason = window.prompt(`ระบุเหตุผลที่ยกเลิกนัดของ ${card.patient.name}`);
    if (!reason?.trim()) return;
    setBusy(`${card.appointmentId}:CANCEL`);
    try {
      await apiRequest(`/appointments/${card.appointmentId}/cancel`, { method: "POST", token, body: JSON.stringify({ reason: reason.trim() }) });
      setSelected(null);
      setNotice({ kind: "success", text: "ยกเลิกนัดหมายแล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function openDetails(card: BoardCard) {
    setSelected(card);
    setItemDraft({ catalogItemId: "", settlementMode: "PAYMENT", entitlementId: "" });
    try {
      const [services, courses, rights] = await Promise.all([
        apiRequest<CatalogItem[]>("/catalog/items?type=SERVICE&status=ACTIVE&limit=100&sortBy=name&sortOrder=asc", { token }),
        apiRequest<CatalogItem[]>("/catalog/items?type=COURSE&status=ACTIVE&limit=100&sortBy=name&sortOrder=asc", { token }),
        apiRequest<Entitlement[]>(`/patients/${card.patient.id}/entitlements`, { token }),
      ]);
      setCatalog([...services.data, ...courses.data]);
      setEntitlements(rights.data);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
  }

  async function addAppointmentItem(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(`${selected.appointmentId}:ITEM`);
    try {
      await apiRequest(`/appointments/${selected.appointmentId}/items`, {
        method: "POST", token,
        body: JSON.stringify({
          catalogItemId: itemDraft.catalogItemId,
          settlementMode: itemDraft.settlementMode,
          ...(itemDraft.settlementMode === "ENTITLEMENT" ? { entitlementId: itemDraft.entitlementId } : {}),
          quantity: 1,
        }),
      });
      setSelected(null);
      setNotice({ kind: "success", text: "เพิ่มรายการบริการในนัดแล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function openTreatment(card: BoardCard) {
    setTreatmentCard(card);
    try {
      const [result, products] = await Promise.all([
        apiRequest<TreatmentContext>(`/appointments/${card.appointmentId}/treatment-context`, { token }),
        apiRequest<CatalogItem[]>("/catalog/items?type=PRODUCT&status=ACTIVE&limit=100&sortBy=name&sortOrder=asc", { token }),
      ]);
      setTreatmentContext(result.data);
      setTreatmentProducts(products.data);
      setTreatmentResults(Object.fromEntries(result.data.items.map(item => [item.id, item.usageStatus === "USED" || item.usageStatus === "NOT_USED" ? item.usageStatus : "PENDING"])));
    } catch (error) {
      setTreatmentCard(null);
      setNotice({ kind: "error", text: apiError(error) });
    }
  }

  async function saveTreatment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!treatmentCard) return;
    const form = new FormData(event.currentTarget);
    const addOns = JSON.parse(String(form.get("addOns") || "[]")) as { itemId: string; quantity: number }[];
    setBusy(`${treatmentCard.appointmentId}:TREATMENT`);
    let addOnSaleId = "";
    try {
      if (addOns.length > 0) {
        const created = await apiRequest<{ id: string }>("/sales", {
          method: "POST", token,
          body: JSON.stringify({
            patientId: treatmentCard.patient.id,
            appointmentId: treatmentCard.appointmentId,
            note: `Treatment add-on · ${treatmentCard.appointmentNo}`,
            lines: addOns.map(item => ({ itemType: "CATALOG", itemId: item.itemId, quantity: item.quantity })),
          }),
        });
        addOnSaleId = created.data.id;
        await apiRequest(`/sales/${addOnSaleId}/confirm`, { method: "POST", token });
      }
      await apiRequest(`/appointments/${treatmentCard.appointmentId}/treatment`, {
        method: "POST", token,
        body: JSON.stringify({
          doctorId: treatmentCard.doctor.id,
          symptoms: String(form.get("symptoms") ?? "").split(",").map(value => value.trim()).filter(Boolean),
          treatmentDetail: form.get("treatmentDetail"),
          treatmentAreas: form.getAll("treatmentAreas").map(String),
          medications: JSON.parse(String(form.get("medications") || "[]")),
          aftercareNote: form.get("aftercareNote") || undefined,
          itemResults: treatmentContext?.items.map(item => ({
            appointmentItemId: item.id,
            status: treatmentResults[item.id],
            ...(treatmentResults[item.id] === "NOT_USED" ? { reason: String(form.get(`reason:${item.id}`) || "") || undefined } : {}),
          })),
        }),
      });
      if (treatmentCard.status === "IN_PROGRESS") {
        await apiRequest(`/appointments/${treatmentCard.appointmentId}/finish`, { method: "POST", token });
      }
      setTreatmentCard(null);
      setTreatmentContext(null);
      setTreatmentProducts([]);
      setNotice({ kind: "success", text: addOns.length > 0 ? "บันทึกการรักษาแล้ว และเพิ่มยอด Add-on เข้าสถานะรอชำระเงิน" : "บันทึกการรักษาแล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) {
      if (addOnSaleId) {
        try { await apiRequest(`/sales/${addOnSaleId}/void`, { method: "POST", token, body: JSON.stringify({ reason: "ยกเลิกอัตโนมัติ เนื่องจากบันทึกการรักษาไม่สำเร็จ" }) }); } catch { /* retain original error */ }
      }
      setNotice({ kind: "error", text: apiError(error) });
    }
    finally { setBusy(""); }
  }

  async function consumeEntitlements(card: BoardCard) {
    const items = card.items.filter(item => item.settlementMode === "ENTITLEMENT" && item.entitlementId);
    if (!items.length) return;
    setBusy(`${card.appointmentId}:ENTITLEMENT`);
    try {
      for (const item of items) {
        await apiRequest(`/entitlements/${item.entitlementId}/usages`, {
          method: "POST", token, body: JSON.stringify({ appointmentId: card.appointmentId }),
        });
      }
      setNotice({ kind: "success", text: "ใช้สิทธิ์คอร์สสำหรับนัดนี้แล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function preparePayment(card: BoardCard) {
    setBusy(`${card.appointmentId}:PAYMENT`);
    try {
      let saleId = card.settlement.unpaidSales?.[0]?.id ?? "";
      let amount = card.settlement.unpaidSales?.[0]?.balanceAmount ?? card.settlement.balanceAmount;
      if (!saleId) {
        const paymentItems = card.items.filter(item => item.settlementMode === "PAYMENT");
        if (!paymentItems.length) throw new Error("ยังไม่มีรายการที่ต้องชำระในนัดนี้");
        const created = await apiRequest<{ id: string; netAmount: string }>("/sales", {
          method: "POST", token,
          body: JSON.stringify({
            patientId: card.patient.id,
            appointmentId: card.appointmentId,
            lines: paymentItems.map(item => ({ itemType: "CATALOG", itemId: item.catalogItemId, quantity: item.quantity })),
          }),
        });
        const confirmed = await apiRequest<{ id: string; balanceAmount: string }>(`/sales/${created.data.id}/confirm`, { method: "POST", token });
        saleId = confirmed.data.id;
        amount = confirmed.data.balanceAmount;
      }
      const [saleDetail, treatmentDetail] = await Promise.all([
        apiRequest<SaleDetail>(`/sales/${saleId}`, { token }),
        apiRequest<TreatmentContext>(`/appointments/${card.appointmentId}/treatment-context`, { token }).catch(() => ({ data: null })),
      ]);
      setPayment({ card, saleId, amount, method: "QR", sale: saleDetail.data, context: treatmentDetail.data });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!payment) return;
    setBusy(`${payment.card.appointmentId}:PAYMENT_SAVE`);
    try {
      await apiRequest(`/sales/${payment.saleId}/payments`, {
        method: "POST", token,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount: Number(payment.amount), method: payment.method, paidAt: new Date().toISOString() }),
      });
      setPayment(null);
      setNotice({ kind: "success", text: "บันทึกรับชำระแล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  if (!loading && !token) return <main className="queue-auth"><div><span>Session หมดอายุหรือยังไม่ได้เข้าสู่ระบบ</span><Link href="/">ไปหน้าเข้าสู่ระบบ</Link></div></main>;

  const columns = [
    { key: "waiting", label: "รอรักษา", color: "amber", cards: board.columns.waiting },
    { key: "inProgress", label: "กำลังรักษา", color: "violet", cards: board.columns.inProgress },
    { key: "pendingClose", label: "รอชำระ / ปิดบริการ", color: "coral", cards: board.columns.pendingClose },
    { key: "completed", label: "สำเร็จ", color: "green", cards: board.columns.completed },
  ] as const;

  return (
    <main className="app-shell queue-app">
      <AppSidebar active="queue" profile={profile} />
      <section className="workspace">
        <header className="topbar queue-topbar">
          <div><p className="eyebrow">CLINIC OPERATIONS</p><h1>คิว / Check-in</h1><p>ติดตามลูกค้าตั้งแต่มาถึงจนปิดบริการ</p></div>
          <div className="queue-live"><span /> อัปเดตอัตโนมัติทุก 30 วินาที</div>
        </header>

        <div className="content queue-content">
          {notice && <div className={`notice queue-notice ${notice.kind}`}><b>{notice.kind === "success" ? "✓" : "!"}</b><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}

          <section className="queue-toolbar panel">
            <div className="date-switcher">
              <button onClick={() => setDate(value => shiftDate(value, -1))}>‹</button>
              <input type="date" value={date} onChange={event => setDate(event.target.value)} />
              <button onClick={() => setDate(value => shiftDate(value, 1))}>›</button>
              <button className="today-button" onClick={() => setDate(localDate())}>วันนี้</button>
            </div>
            <select value={doctorId} onChange={event => setDoctorId(event.target.value)} aria-label="กรองแพทย์">
              <option value="">แพทย์ทั้งหมด</option>
              {doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.prefix}{doctor.firstName} {doctor.lastName}</option>)}
            </select>
            <label className="queue-search"><span>⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อ, HN, เบอร์โทร…" /></label>
            <Link className="primary-button walkin-button" href="/#appointment-form">+ Walk-in / นัดหมาย</Link>
          </section>

          <section className="queue-overview">
            <div><span>งานที่กำลังดำเนินการ</span><b>{totalActive}</b><small>รายการ</small></div>
            <div><span>รอ Check-in</span><b>{board.summary.scheduled}</b><small>นัด</small></div>
            <div><span>รอรักษา</span><b>{board.summary.waiting}</b><small>คิว</small></div>
            <div><span>กำลังรักษา</span><b>{board.summary.inProgress}</b><small>ห้อง</small></div>
            <div><span>รอชำระ / ปิดบริการ</span><b>{board.summary.pendingClose}</b><small>รายการ</small></div>
          </section>

          <section className="scheduled-panel panel">
            <div className="queue-section-head"><div><p className="eyebrow">UPCOMING</p><h2>นัดหมายที่ยังไม่ได้ Check-in</h2></div><span>{board.summary.scheduled} รายการ</span></div>
            {loading ? <QueueEmpty text="กำลังโหลดคิว…" /> : !board.columns.scheduled.length ? <QueueEmpty text="ไม่มีนัดที่รอ Check-in" /> : (
              <div className="scheduled-list">
                {board.columns.scheduled.map(card => (
                  <article key={card.appointmentId}>
                    <time>{card.startTime}</time>
                    <div><b>{card.patient.name}</b><small>{card.patient.hn} · {card.patient.phone}</small></div>
                    <div><b>{card.doctor.name}</b><small>{card.room.name}</small></div>
                    <div><b>{card.items.map(item => item.name).join(", ") || "ยังไม่ระบุบริการ"}</b><small>{card.appointmentNo}</small></div>
                    <div className="scheduled-actions"><button className="soft-button" onClick={() => void openDetails(card)}>รายละเอียด</button><button className="primary-action" disabled={Boolean(busy)} onClick={() => setCheckInCard(card)}>Check-in</button></div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="kanban-board">
            {columns.map(column => (
              <div className={`kanban-column ${column.color}`} key={column.key}>
                <header><span>{column.label}</span><b>{column.cards.length}</b></header>
                <div className="kanban-stack">
                  {!column.cards.length ? <QueueEmpty text="ไม่มีรายการ" compact /> : column.cards.map(card => (
                    <QueueCard
                      key={card.appointmentId}
                      card={card}
                      now={now}
                      busy={Boolean(busy)}
                      onDetails={() => void openDetails(card)}
                      onAction={action => void runAction(card, action)}
                      onTreatment={() => void openTreatment(card)}
                      onEntitlement={() => void consumeEntitlements(card)}
                      onPayment={() => void preparePayment(card)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </section>

      {selected && (
        <DetailDrawer
          card={selected}
          catalog={catalog}
          entitlements={entitlements}
          draft={itemDraft}
          busy={Boolean(busy)}
          setDraft={setItemDraft}
          close={() => setSelected(null)}
          add={addAppointmentItem}
          cancel={() => void cancelAppointment(selected)}
        />
      )}
      {checkInCard && <CheckInDialog
        card={checkInCard}
        appointmentDate={date}
        token={token}
        close={() => setCheckInCard(null)}
        completed={async message => {
          setCheckInCard(null);
          setNotice({ kind: "success", text: message });
          await loadBoard(token, date, doctorId, search, true);
        }}
      />}
      {treatmentCard && <TreatmentDialog card={treatmentCard} context={treatmentContext} products={treatmentProducts} results={treatmentResults} busy={Boolean(busy)} setResult={(id, status) => setTreatmentResults(current => ({ ...current, [id]: status }))} close={() => { setTreatmentCard(null); setTreatmentContext(null); setTreatmentProducts([]); }} save={saveTreatment} />}
      {payment && <PaymentDialog value={payment} busy={Boolean(busy)} setValue={setPayment} close={() => setPayment(null)} save={savePayment} />}
    </main>
  );
}

function QueueCard({ card, now, busy, onDetails, onAction, onTreatment, onEntitlement, onPayment }: {
  card: BoardCard; now: number; busy: boolean; onDetails: () => void;
  onAction: (action: Exclude<BoardAction, "CANCEL">) => void;
  onTreatment: () => void; onEntitlement: () => void; onPayment: () => void;
}) {
  const since = card.status === "WAITING"
    ? card.checkedInAt
    : card.status === "IN_PROGRESS"
      ? card.startedAt
      : card.status === "PENDING_NOTE"
        ? card.finishedAt
        : null;
  const primary = card.availableActions.find(action => action !== "CANCEL");
  return (
    <article className="queue-card">
      <div className="queue-card-top"><span>{card.displayNo}</span><StatusBadge card={card} /></div>
      <h3>{card.patient.name}</h3>
      <p>{card.startTime} · {card.doctor.name}</p>
      <p>{card.room.name}</p>
      <div className="queue-items">{card.items.map(item => <span key={item.id}>{item.name}</span>)}{!card.items.length && <span className="muted-chip">ยังไม่ระบุบริการ</span>}</div>
      {since && <div className="wait-time">◷ {card.status === "IN_PROGRESS" ? "รักษา" : "รอ"} {elapsed(since, now)}</div>}
      {!!card.blockingReasons.length && <div className="blocker-list">{card.blockingReasons.map(reason => <small key={reason}>{blockerLabel(reason)}</small>)}</div>}
      <div className="queue-card-actions">
        <button className="soft-button" onClick={onDetails}>รายละเอียด</button>
        {card.status === "IN_PROGRESS" && !card.treatmentRecorded && <button className="soft-button" onClick={onTreatment}>บันทึก</button>}
        {card.blockingReasons.includes("TREATMENT_REQUIRED") && <button className="primary-action" onClick={onTreatment}>บันทึกการรักษา</button>}
        {card.blockingReasons.includes("ENTITLEMENT_REQUIRED") && <button className="primary-action" disabled={busy} onClick={onEntitlement}>ใช้สิทธิ์</button>}
        {card.blockingReasons.includes("PAYMENT_REQUIRED") && <button className="primary-action" disabled={busy} onClick={onPayment}>รับชำระ</button>}
        {primary && <button className="primary-action" disabled={busy} onClick={() => onAction(primary as Exclude<BoardAction, "CANCEL">)}>{actionConfig[primary]?.label}</button>}
      </div>
    </article>
  );
}

function StatusBadge({ card }: { card: BoardCard }) {
  const labels: Record<string, string> = { WAITING: "รอรักษา", IN_PROGRESS: "กำลังรักษา", PENDING_NOTE: "รอปิดบริการ", COMPLETED: "สำเร็จ" };
  const label = card.status === "PENDING_NOTE" && card.blockingReasons.includes("PAYMENT_REQUIRED") ? "รอชำระเงิน" : labels[card.status] ?? card.status;
  return <b className={`queue-status ${card.status.toLowerCase()}`}>{label}</b>;
}

function blockerLabel(reason: string) {
  return ({ TREATMENT_REQUIRED: "รอบันทึกการรักษา", PAYMENT_REQUIRED: "รอชำระเงิน", ENTITLEMENT_REQUIRED: "รอใช้สิทธิ์คอร์ส" } as Record<string, string>)[reason] ?? reason;
}

function QueueEmpty({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`queue-empty ${compact ? "compact" : ""}`}><span>◇</span><p>{text}</p></div>;
}

function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function ageAt(birthDate: string | null | undefined, targetDate: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate.slice(0, 10)}T12:00:00`);
  const target = new Date(`${targetDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(target.getTime())) return null;
  let years = target.getFullYear() - birth.getFullYear();
  if (target.getMonth() < birth.getMonth() || (target.getMonth() === birth.getMonth() && target.getDate() < birth.getDate())) years -= 1;
  return Math.max(0, years);
}

function vitalNumber(value: string | number | null | undefined, suffix: string) {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ${suffix}`;
}

function CheckInDialog({ card, appointmentDate, token, close, completed }: {
  card: BoardCard; appointmentDate: string; token: string; close: () => void;
  completed: (message: string) => Promise<void>;
}) {
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [latestVitals, setLatestVitals] = useState<VitalRecord | null>(null);
  const [contextItems, setContextItems] = useState<AppointmentItem[]>(card.items);
  const [atomicApi, setAtomicApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [editing, setEditing] = useState(false);
  const [patientDraft, setPatientDraft] = useState({ phone: "", birthDate: "", bloodGroup: "UNKNOWN", medicalConditions: "", drugAllergies: "" });

  const syncPatient = useCallback((value: PatientDetail) => {
    setPatient(value);
    setPatientDraft({
      phone: value.phone ?? "",
      birthDate: value.birthDate?.slice(0, 10) ?? "",
      bloodGroup: value.bloodGroup ?? "UNKNOWN",
      medicalConditions: listValue(value.medicalConditions).join(", "),
      drugAllergies: listValue(value.drugAllergies).join(", "),
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const aggregate = await apiRequest<CheckInContext>(`/appointments/${card.appointmentId}/check-in-context`, { token });
        if (!active) return;
        syncPatient(aggregate.data.patient);
        setLatestVitals(aggregate.data.latestVitals);
        setContextItems(aggregate.data.items);
        setAtomicApi(true);
      } catch (contextError) {
        const apiFailure = contextError as ApiClientError;
        if (apiFailure.status !== 404) {
          if (active) setError(apiError(contextError));
          if (active) setLoading(false);
          return;
        }
        try {
          const [patientResponse, vitalsResponse] = await Promise.all([
            apiRequest<PatientDetail>(`/patients/${card.patient.id}`, { token }),
            apiRequest<VitalRecord[]>(`/patients/${card.patient.id}/vitals`, { token }),
          ]);
          if (!active) return;
          syncPatient(patientResponse.data);
          setLatestVitals(vitalsResponse.data[0] ?? null);
          setAtomicApi(false);
        } catch (legacyError) {
          if (active) setError(apiError(legacyError));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [card.appointmentId, card.patient.id, syncPatient, token]);

  async function savePatient() {
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<PatientDetail>(`/patients/${card.patient.id}`, {
        method: "PATCH", token,
        body: JSON.stringify({
          phone: patientDraft.phone,
          birthDate: patientDraft.birthDate || undefined,
          bloodGroup: patientDraft.bloodGroup,
          medicalConditions: patientDraft.medicalConditions.split(",").map(value => value.trim()).filter(Boolean),
          drugAllergies: patientDraft.drugAllergies.split(",").map(value => value.trim()).filter(Boolean),
        }),
      });
      syncPatient(response.data);
      setEditing(false);
    } catch (saveError) { setError(apiError(saveError)); }
    finally { setSaving(false); }
  }

  async function confirmCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const vitals = {
      ...(heightCm ? { heightCm: Number(heightCm) } : {}),
      ...(weightKg ? { weightKg: Number(weightKg) } : {}),
    };
    const hasVitals = Object.keys(vitals).length > 0;
    try {
      if (atomicApi) {
        await apiRequest(`/appointments/${card.appointmentId}/check-in`, {
          method: "POST", token,
          body: JSON.stringify(hasVitals ? { vitals } : {}),
        });
      } else {
        if (hasVitals) {
          await apiRequest(`/appointments/${card.appointmentId}/vitals`, { method: "POST", token, body: JSON.stringify(vitals) });
        }
        await apiRequest(`/appointments/${card.appointmentId}/check-in`, { method: "POST", token });
      }
      await completed(`Check-in ${card.patient.name} สำเร็จ · เข้าสถานะรอรักษา`);
    } catch (checkInError) { setError(apiError(checkInError)); }
    finally { setSaving(false); }
  }

  const conditions = listValue(patient?.medicalConditions);
  const allergies = listValue(patient?.drugAllergies);
  const years = patient ? ageAt(patient.birthDate, appointmentDate) : null;
  const latestDate = latestVitals?.recordedAt
    ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(latestVitals.recordedAt))
    : "";

  return <div className="modal-backdrop checkin-backdrop" onClick={close}>
    <form className="queue-dialog checkin-dialog" onClick={event => event.stopPropagation()} onSubmit={confirmCheckIn}>
      <header><div><p className="eyebrow">CHECK-IN REVIEW</p><h2>ตรวจสอบข้อมูลก่อน Check-in</h2><span>ตรวจสอบข้อมูลลูกค้าและนัดหมายก่อนเข้าสู่คิวรอรักษา</span></div><button type="button" onClick={close}>×</button></header>
      {error && <div className="checkin-error"><b>!</b><span>{error}</span></div>}
      {loading ? <div className="checkin-loading"><span /> กำลังเตรียมข้อมูลลูกค้า…</div> : patient && <>
        <div className="checkin-grid">
          <section className="checkin-card appointment-review">
            <div className="checkin-card-title"><span>นัดหมายที่เลือก</span><time>{card.startTime}</time></div>
            <h3>{card.patient.name}</h3>
            <div className="checkin-facts"><span><small>แพทย์</small><b>{card.doctor.name}</b></span><span><small>ห้อง</small><b>{card.room.name}</b></span></div>
            <div className="checkin-items"><small>รายการ / สิทธิ์จากนัดหมาย</small><div>{contextItems.length ? contextItems.map(item => <span key={item.id}>{item.name}</span>) : <em>ยังไม่ระบุบริการ</em>}</div></div>
          </section>

          <section className="checkin-card health-review">
            <div className="checkin-card-title"><span>ข้อมูลสุขภาพ</span></div>
            <div className="health-facts">
              <span><small>ลูกค้า</small><b>{card.patient.name}</b></span><span><small>โทรศัพท์</small><b>{patient.phone || "ยังไม่มีข้อมูล"}</b></span>
              <span><small>อายุ</small><b>{years === null ? "ยังไม่มีข้อมูล" : `${years} ปี`}</b></span><span><small>กรุ๊ปเลือด</small><b>{patient.bloodGroup && patient.bloodGroup !== "UNKNOWN" ? patient.bloodGroup : "ยังไม่มีข้อมูล"}</b></span>
              <span><small>ประวัติแพ้ยา</small><b className={allergies.length ? "health-alert" : ""}>{allergies.join(", ") || "ยังไม่มีข้อมูล"}</b></span><span><small>โรคประจำตัว</small><b>{conditions.join(", ") || "ยังไม่มีข้อมูล"}</b></span>
            </div>
          </section>

          <section className="checkin-card daily-vitals">
            <div className="checkin-card-title"><span>ข้อมูลวัดวันนี้ <small>(ไม่บังคับ)</small></span><i>เพิ่มใหม่เมื่อ Check-in</i></div>
            <div className="vital-inputs"><label>ส่วนสูง (ซม.)<input type="number" min="1" max="300" step="0.1" value={heightCm} onChange={event => setHeightCm(event.target.value)} placeholder="ไม่บังคับ" /></label><label>น้ำหนัก (กก.)<input type="number" min="1" max="500" step="0.1" value={weightKg} onChange={event => setWeightKg(event.target.value)} placeholder="ไม่บังคับ" /></label></div>
            {latestVitals ? <div className="latest-vitals"><span>●</span><p>ค่าล่าสุด: {vitalNumber(latestVitals.heightCm, "ซม.")} / {vitalNumber(latestVitals.weightKg, "กก.")} · {latestDate}<small>อ้างอิงเท่านั้น · ระบบจะสร้างประวัติใหม่พร้อมวันและเวลา Check-in</small></p></div> : <div className="latest-vitals empty"><span>○</span><p>ยังไม่มีประวัติส่วนสูงและน้ำหนัก<small>กรอกเฉพาะค่าที่วัดได้ในวันนี้</small></p></div>}
          </section>

          <section className={`checkin-card patient-edit ${editing ? "editing" : ""}`}>
            {!editing ? <><button type="button" className="edit-patient-button" onClick={() => setEditing(true)}>แก้ไขข้อมูลลูกค้า</button><p>หลังบันทึกข้อมูล ระบบจะแสดงค่าที่แก้ไขทันทีและยังคงนัดหมายเดิมไว้</p></> : <>
              <div className="checkin-card-title"><span>แก้ไขข้อมูลลูกค้า</span><button type="button" onClick={() => setEditing(false)}>ยกเลิก</button></div>
              <div className="patient-edit-fields">
                <label>โทรศัพท์<input value={patientDraft.phone} onChange={event => setPatientDraft(value => ({ ...value, phone: event.target.value }))} /></label>
                <label>วันเกิด<input type="date" value={patientDraft.birthDate} onChange={event => setPatientDraft(value => ({ ...value, birthDate: event.target.value }))} /></label>
                <label>กรุ๊ปเลือด<select value={patientDraft.bloodGroup} onChange={event => setPatientDraft(value => ({ ...value, bloodGroup: event.target.value }))}><option value="UNKNOWN">ไม่ระบุ</option><option value="A">A</option><option value="B">B</option><option value="AB">AB</option><option value="O">O</option></select></label>
                <label>ประวัติแพ้ยา<input value={patientDraft.drugAllergies} onChange={event => setPatientDraft(value => ({ ...value, drugAllergies: event.target.value }))} placeholder="คั่นด้วย comma" /></label>
                <label className="wide">โรคประจำตัว<input value={patientDraft.medicalConditions} onChange={event => setPatientDraft(value => ({ ...value, medicalConditions: event.target.value }))} placeholder="คั่นด้วย comma" /></label>
              </div>
              <button type="button" className="primary-action save-patient" disabled={saving} onClick={() => void savePatient()}>บันทึกข้อมูลลูกค้า</button>
            </>}
          </section>
        </div>
        <footer className="checkin-footer"><button type="button" className="soft-button" onClick={close}>ยกเลิก</button><button className="primary-button" disabled={saving || editing}>{saving ? "กำลังบันทึก…" : "ยืนยัน Check-in"}</button></footer>
        <div className="checkin-next"><span>●</span> เมื่อยืนยันแล้ว ลูกค้าจะเข้าสถานะ “รอรักษา” และยังไม่เริ่มการรักษา</div>
      </>}
    </form>
  </div>;
}

function DetailDrawer({ card, catalog, entitlements, draft, busy, setDraft, close, add, cancel }: {
  card: BoardCard; catalog: CatalogItem[]; entitlements: Entitlement[];
  draft: { catalogItemId: string; settlementMode: SettlementMode; entitlementId: string };
  busy: boolean; setDraft: React.Dispatch<React.SetStateAction<{ catalogItemId: string; settlementMode: SettlementMode; entitlementId: string }>>;
  close: () => void; add: (event: FormEvent) => void; cancel: () => void;
}) {
  const matchingRights = entitlements.filter(right => right.catalogItemId === draft.catalogItemId && right.status === "ACTIVE" && right.remainingUnits > 0);
  const canEditItems = ["SCHEDULED", "WAITING"].includes(card.status);
  const settlementReady = card.status === "COMPLETED" || (card.status === "PENDING_NOTE" && card.items.length > 0 && !card.blockingReasons.some(reason => ["PAYMENT_REQUIRED", "ENTITLEMENT_REQUIRED"].includes(reason)));
  return <div className="drawer-backdrop" onClick={close}><aside className="queue-drawer" onClick={event => event.stopPropagation()}>
    <header><div><p className="eyebrow">APPOINTMENT DETAIL</p><h2>{card.patient.name}</h2><span>{card.appointmentNo} · {card.patient.hn}</span></div><button onClick={close}>×</button></header>
    <section className="drawer-summary"><div><small>เวลา</small><b>{card.startTime}</b></div><div><small>แพทย์</small><b>{card.doctor.name}</b></div><div><small>ห้อง</small><b>{card.room.name}</b></div></section>
    <section><h3>รายการรับบริการ</h3>{!card.items.length ? <p className="drawer-muted">ยังไม่มีรายการบริการในนัดนี้</p> : <div className="drawer-items">{card.items.map(item => <div key={item.id}><span><b>{item.name}</b><small>{item.type} · {item.settlementMode}</small></span><em>×{item.quantity}</em></div>)}</div>}</section>
    {canEditItems && <section><h3>เพิ่มบริการในนัด</h3><form className="drawer-form" onSubmit={add}><label>บริการหรือคอร์ส<select required value={draft.catalogItemId} onChange={event => setDraft(value => ({ ...value, catalogItemId: event.target.value, entitlementId: "" }))}><option value="">เลือกรายการ</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label>วิธีปิดรายการ<select value={draft.settlementMode} onChange={event => setDraft(value => ({ ...value, settlementMode: event.target.value as SettlementMode, entitlementId: "" }))}><option value="PAYMENT">ชำระเงิน</option><option value="ENTITLEMENT">ใช้สิทธิ์คอร์ส</option><option value="NO_CHARGE">ไม่มีค่าใช้จ่าย</option></select></label>{draft.settlementMode === "ENTITLEMENT" && <label>สิทธิ์ของลูกค้า<select required value={draft.entitlementId} onChange={event => setDraft(value => ({ ...value, entitlementId: event.target.value }))}><option value="">เลือกสิทธิ์</option>{matchingRights.map(right => <option key={right.id} value={right.id}>เหลือ {right.remainingUnits}/{right.totalUnits} ครั้ง</option>)}</select></label>}<button className="primary-button" disabled={busy}>เพิ่มรายการ</button></form></section>}
    <section><h3>สถานะการปิดบริการ</h3><div className="drawer-checks"><span className={card.treatmentRecorded ? "done" : ""}>{card.treatmentRecorded ? "✓" : "○"} บันทึกการรักษา</span><span className={settlementReady ? "done" : ""}>{settlementReady ? "✓" : "○"} การชำระ / สิทธิ์</span></div></section>
    {card.availableActions.includes("CANCEL") && <button className="danger-button" disabled={busy} onClick={cancel}>ยกเลิกนัดหมาย</button>}
  </aside></div>;
}

function TreatmentDialog({ card, context, products, results, busy, setResult, close, save }: {
  card: BoardCard; context: TreatmentContext | null; products: CatalogItem[]; results: Record<string, "PENDING" | "USED" | "NOT_USED">;
  busy: boolean; setResult: (id: string, status: "USED" | "NOT_USED") => void; close: () => void;
  save: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const unresolved = context?.items.filter(item => (results[item.id] ?? "PENDING") === "PENDING").length ?? 0;
  const [areas, setAreas] = useState<string[]>([]);
  const [formulaQuantities, setFormulaQuantities] = useState<Record<string, number>>({});
  const [addOnQuery, setAddOnQuery] = useState("");
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [beforeImages, setBeforeImages] = useState<string[]>([]);
  const [afterImages, setAfterImages] = useState<string[]>([]);
  const areaOptions = ["หน้าผาก", "จมูก", "รอบปาก", "คาง", "แก้มซ้าย", "แก้มขวา"];
  const formulaProducts = context?.items.flatMap(item => item.products.map(product => ({ ...product, source: item.name }))) ?? [];
  const matchingProducts = products.filter(product => `${product.code} ${product.name}`.toLowerCase().includes(addOnQuery.trim().toLowerCase())).slice(0, 6);
  const selectedAddOns = products.filter(product => (addOns[product.id] ?? 0) > 0);
  const addOnTotal = selectedAddOns.reduce((sum, product) => sum + Number(product.finalPrice) * addOns[product.id], 0);
  const medications = [
    ...formulaProducts.map(product => ({
      catalogItemId: product.catalogItemId,
      name: product.name,
      quantity: formulaQuantities[product.catalogItemId] ?? product.recommendedQuantity,
      unit: product.unit || "ชิ้น",
      source: product.source,
      kind: "FORMULA",
    })),
    ...selectedAddOns.map(product => ({
      catalogItemId: product.id,
      name: product.name,
      quantity: addOns[product.id],
      unit: product.productDetail?.unit || "ชิ้น",
      unitPrice: Number(product.finalPrice),
      source: "TREATMENT_ADD_ON",
      kind: "ADD_ON",
    })),
  ];
  const toggleArea = (area: string) => setAreas(current => current.includes(area) ? current.filter(value => value !== area) : [...current, area]);
  const addPreviews = (files: FileList | null, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (!files) return;
    setter(current => [...current, ...Array.from(files).map(file => URL.createObjectURL(file))].slice(0, 4));
  };

  return <div className="treatment-page" onClick={close}><form className="treatment-record-page" onClick={event => event.stopPropagation()} onSubmit={save}>
    <header className="treatment-page-header">
      <button type="button" className="treatment-back" onClick={close}>←</button>
      <div><div className="treatment-title-line"><h2>บันทึกการรักษา</h2><span>ร่าง</span></div><p>เวชระเบียนความงามและแผนการรักษา</p></div>
      <div className="treatment-autosave"><i />บันทึกอัตโนมัติเมื่อกรอกข้อมูล</div>
      <button type="button" className="treatment-close" onClick={close}>×</button>
    </header>
    {!context ? <div className="checkin-loading treatment-loading"><span />กำลังโหลดข้อมูลการรักษา…</div> : <div className="treatment-page-body">
      <section className="treatment-patient-strip">
        <span className="treatment-avatar">{card.patient.name.slice(0, 1)}</span>
        <div><b>{card.patient.name}</b><small>{context.patient.hn}</small></div>
        <div><small>ห้องตรวจ</small><b>{context.room?.name ?? card.room.name}</b></div>
        <div><small>แพทย์</small><b>{card.doctor.name}</b></div>
      </section>

      <section className="treatment-health-panel treatment-card">
        <div className="treatment-section-title"><div><h3>ข้อมูลสุขภาพ</h3><p>สำหรับแพทย์ / พยาบาลอ้างอิง</p></div></div>
        <div className="health-facts">
          <div><small>อายุ</small><b>{context.patient.birthDate ? `${Math.max(0, new Date().getFullYear() - new Date(context.patient.birthDate).getFullYear())} ปี` : "ยังไม่มีข้อมูล"}</b></div>
          <div><small>กรุ๊ปเลือด</small><b>{context.patient.bloodGroup || "ยังไม่มีข้อมูล"}</b></div>
          <div><small>ประวัติแพ้ยา</small><b className={listValue(context.patient.drugAllergies).length ? "health-alert" : ""}>{listValue(context.patient.drugAllergies).join(", ") || "ยังไม่มีข้อมูล"}</b></div>
          <div><small>โรคประจำตัว</small><b>{listValue(context.patient.medicalConditions).join(", ") || "ไม่มี"}</b></div>
          <div><small>ส่วนสูงล่าสุด</small><b>{context.latestVitals?.heightCm ? `${context.latestVitals.heightCm} ซม.` : "ยังไม่มีข้อมูล"}</b></div>
          <div><small>น้ำหนักล่าสุด</small><b>{context.latestVitals?.weightKg ? `${context.latestVitals.weightKg} กก.` : "ยังไม่มีข้อมูล"}</b></div>
        </div>
      </section>

      <section className="treatment-items treatment-card"><div className="treatment-section-head"><div><h3>รายการสำหรับการรักษาครั้งนี้</h3><p>รายการนี้เป็นข้อมูลอ้างอิงจากนัด ห้ามแก้ไขหรือเพิ่มข้อมูลหลัก</p></div><span className={unresolved ? "pending" : "ready"}>{unresolved ? `กรุณายืนยันอีก ${unresolved} รายการ` : "ยืนยันครบแล้ว"}</span></div>
        {!context.items.length ? <div className="treatment-empty">นัดนี้ยังไม่ได้เลือกรายการบริการหรือคอร์ส</div> : context.items.map(item => <article key={item.id}><div><b>{item.name}</b><small>{item.type === "COURSE" ? "คอร์ส" : "บริการ"} · จาก {item.source.name}{item.entitlement ? ` · คงเหลือก่อนใช้ ${item.entitlement.remainingUnits}/${item.entitlement.totalUnits}` : ""}</small></div><div className="treatment-choice"><button type="button" className={(results[item.id] ?? "PENDING") === "PENDING" ? "active pending" : ""} disabled>รอยืนยัน</button><button type="button" className={results[item.id] === "USED" ? "active" : ""} onClick={() => setResult(item.id, "USED")}>ใช้แล้ว</button><button type="button" className={results[item.id] === "NOT_USED" ? "active" : ""} onClick={() => setResult(item.id, "NOT_USED")}>ไม่ได้ใช้</button></div>{results[item.id] === "NOT_USED" && <input className="treatment-reason" name={`reason:${item.id}`} placeholder="เหตุผลที่ไม่ได้ใช้ (ไม่บังคับ)" />}</article>)}
        <p className="treatment-legend">ใช้แล้ว = ตัดสิทธิ์หลังบันทึก · รอยืนยัน = รอแพทย์ยืนยันผล · ไม่ได้ใช้ = เก็บสิทธิ์ไว้ครั้งถัดไป</p>
      </section>

      <section className="treatment-history treatment-card"><div><h3>ประวัติการรักษาล่าสุด</h3><p>{context.treatmentRecord ? `${context.treatmentRecord.createdAt ? new Date(context.treatmentRecord.createdAt).toLocaleDateString("th-TH") : "นัดนี้"} · ${context.treatmentRecord.treatmentDetail || "มีบันทึกการรักษา"}` : "ยังไม่มีประวัติการรักษาที่บันทึกในนัดนี้"}</p></div><button type="button" disabled={!context.treatmentRecord}>ดูประวัติการรักษา</button></section>

      <div className="treatment-main-grid">
        <main className="treatment-editor treatment-card">
          <section><label>อาการ / สภาวะ *</label><div className="symptom-input"><input name="symptoms" placeholder="เช่น รอยแดง, ผิวหมองคล้ำ, สิวอุดตัน" /><span>คั่นแต่ละอาการด้วย comma</span></div></section>
          <section><label>รายละเอียดการรักษา *</label><textarea name="treatmentDetail" required placeholder="บันทึกสิ่งที่ตรวจพบ ขั้นตอนการรักษา ปริมาณ และผลระหว่างทำ…" /></section>
          <section><label>ตำแหน่งที่รักษา *</label><div className="area-tabs"><button type="button" className="active">ใบหน้า</button><button type="button" disabled>ช่องปาก / ฟัน</button><button type="button" disabled>ร่างกาย</button></div><div className="face-map"><div className="face-outline"><span className="forehead">หน้าผาก</span><span className="nose">จมูก</span><span className="mouth">รอบปาก</span><span className="chin">คาง</span></div>{areaOptions.map(area => <label key={area} className={areas.includes(area) ? "selected" : ""}><input type="checkbox" name="treatmentAreas" value={area} checked={areas.includes(area)} onChange={() => toggleArea(area)} />{area}</label>)}</div><div className="selected-areas"><small>ตำแหน่งที่เลือก:</small>{areas.length ? areas.map(area => <span key={area}>{area} ×</span>) : <em>ยังไม่ได้เลือก</em>}</div></section>
          <section className="medication-panel"><div className="subsection-heading"><div><h3>ยาและเวชภัณฑ์ตามรายการรักษา</h3><p>รายการจากสูตรบริการ ใช้เป็น snapshot ในบันทึกครั้งนี้</p></div></div>{!formulaProducts.length ? <div className="treatment-empty compact">ไม่มีสินค้าในสูตรบริการ</div> : <div className="medication-table"><header><span>ชื่อรายการ</span><span>แนะนำ</span><span>ใช้จริง</span><span>หน่วย</span></header>{formulaProducts.map(product => <div key={`${product.catalogItemId}-${product.source}`}><span><b>{product.name}</b><small>จาก {product.source}</small></span><span>{product.recommendedQuantity}</span><span className="qty-control"><button type="button" onClick={() => setFormulaQuantities(value => ({ ...value, [product.catalogItemId]: Math.max(0, (value[product.catalogItemId] ?? product.recommendedQuantity) - 1) }))}>−</button><b>{formulaQuantities[product.catalogItemId] ?? product.recommendedQuantity}</b><button type="button" onClick={() => setFormulaQuantities(value => ({ ...value, [product.catalogItemId]: (value[product.catalogItemId] ?? product.recommendedQuantity) + 1 }))}>+</button></span><span>{product.unit || "ชิ้น"}</span></div>)}</div>}</section>
          <section className="medication-panel add-on-panel"><div className="subsection-heading"><div><h3>ยาและเวชภัณฑ์เพิ่มเติม (Add-on)</h3><p>ค้นหาสินค้าใน Catalog เพื่อเพิ่มนอกเหนือจากสูตร และคิดยอดชำระแยก</p></div>{selectedAddOns.length > 0 && <span className="addon-payment-state">รอชำระ ฿{addOnTotal.toLocaleString("th-TH")}</span>}</div><div className="addon-search"><span>⌕</span><input value={addOnQuery} onChange={event => setAddOnQuery(event.target.value)} placeholder="ค้นหาชื่อยา สินค้า หรือรหัส…" /></div>{addOnQuery.trim() && <div className="addon-results">{matchingProducts.length ? matchingProducts.map(product => <button key={product.id} type="button" onClick={() => { setAddOns(value => ({ ...value, [product.id]: (value[product.id] ?? 0) + 1 })); setAddOnQuery(""); }}><span><b>{product.name}</b><small>{product.code} · stock {product.productDetail?.currentStock ?? 0} {product.productDetail?.unit || "ชิ้น"}</small></span><strong>฿{Number(product.finalPrice).toLocaleString("th-TH")}</strong><em>+ เพิ่ม</em></button>) : <p>ไม่พบสินค้าที่ค้นหา</p>}</div>}{selectedAddOns.length > 0 ? <div className="addon-cart"><header><span>รายการ</span><span>จำนวน</span><span>ราคา</span><span /></header>{selectedAddOns.map(product => <div key={product.id}><span><b>{product.name}</b><small>{product.code} · {product.productDetail?.unit || "ชิ้น"}</small></span><span className="qty-control"><button type="button" onClick={() => setAddOns(value => ({ ...value, [product.id]: Math.max(0, value[product.id] - 1) }))}>−</button><b>{addOns[product.id]}</b><button type="button" onClick={() => setAddOns(value => ({ ...value, [product.id]: value[product.id] + 1 }))}>+</button></span><strong>฿{(Number(product.finalPrice) * addOns[product.id]).toLocaleString("th-TH")}</strong><button type="button" className="addon-remove" onClick={() => setAddOns(value => ({ ...value, [product.id]: 0 }))}>ลบ</button></div>)}<footer><span>ยอด Add-on ที่ต้องชำระ</span><b>฿{addOnTotal.toLocaleString("th-TH")}</b></footer></div> : <div className="treatment-empty compact">ยังไม่มีรายการ Add-on</div>}</section>
          <section><label>คำแนะนำหลังการรักษา</label><textarea name="aftercareNote" placeholder="คำแนะนำ การดูแลตัวเอง และวันนัดครั้งถัดไป…" /></section>
          <input type="hidden" name="medications" value={JSON.stringify(medications)} />
          <input type="hidden" name="addOns" value={JSON.stringify(selectedAddOns.map(product => ({ itemId: product.id, quantity: addOns[product.id] })))} />
        </main>

        <aside className="treatment-side">
          <section className="treatment-card photo-panel"><h3>ภาพการรักษา Before / After</h3><p>ตัวอย่าง UI — API จัดเก็บไฟล์ยังไม่พร้อม</p><label>ก่อนรักษา</label><div className="photo-grid">{beforeImages.map(image => <Image unoptimized width={160} height={160} key={image} src={image} alt="ก่อนรักษา" />)}<label className="photo-upload">＋<span>เพิ่มรูป</span><input type="file" accept="image/*" multiple onChange={event => addPreviews(event.target.files, setBeforeImages)} /></label></div><label>หลังรักษา</label><div className="photo-grid">{afterImages.map(image => <Image unoptimized width={160} height={160} key={image} src={image} alt="หลังรักษา" />)}<label className="photo-upload">＋<span>เพิ่มรูป</span><input type="file" accept="image/*" multiple onChange={event => addPreviews(event.target.files, setAfterImages)} /></label></div></section>
          <section className="treatment-card doctor-sign"><small>แพทย์ผู้รับรองการรักษา</small><strong>{card.doctor.name}</strong><span>{context.doctor?.licenseNo ? `เลขใบประกอบโรคศิลปะ: ${context.doctor.licenseNo}` : context.doctor?.specialty || "แพทย์ผู้รักษา"}</span></section>
          <button className="treatment-submit" disabled={busy || unresolved > 0 || areas.length === 0}>{busy ? "กำลังบันทึก…" : unresolved > 0 ? `กรุณายืนยันอีก ${unresolved} รายการ` : areas.length === 0 ? "กรุณาเลือกตำแหน่งรักษา" : "จบการรักษา"}</button>
          <p className="treatment-submit-note">การบันทึกจะยืนยันผลรายการรักษาและตัดสิทธิ์เฉพาะรายการที่เลือก “ใช้แล้ว”</p>
        </aside>
      </div>
    </div>}
  </form></div>;
}

function PaymentDialog({ value, busy, setValue, close, save }: { value: CheckoutState; busy: boolean; setValue: React.Dispatch<React.SetStateAction<CheckoutState | null>>; close: () => void; save: (event: FormEvent) => void }) {
  const money = (amount: string | number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount));
  const recordMedications = Array.isArray(value.context?.treatmentRecord?.medications)
    ? value.context?.treatmentRecord?.medications as { name?: string; quantity?: number; unit?: string; kind?: string; source?: string; unitPrice?: number }[]
    : [];
  const includedMedications = recordMedications.filter(item => item.kind === "FORMULA");
  const saleLines = value.sale?.lines ?? [];
  const subtotal = value.sale?.subtotal ?? value.amount;
  const discount = value.sale?.discountAmount ?? "0";

  return <div className="checkout-page" onClick={close}><form className="checkout-workspace" onClick={event => event.stopPropagation()} onSubmit={save}>
    <header className="checkout-header"><button type="button" onClick={close}>←</button><div><h2>ตรวจสอบก่อนชำระเงิน</h2><p>ตรวจสอบสิทธิ์และรายการคิดเงินจากการรักษาก่อนดำเนินการ Checkout</p></div><span>{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span></header>
    <section className="checkout-patient"><span>{value.card.patient.name.slice(0,1)}</span><div><b>{value.card.patient.name}</b><small>HN: {value.card.patient.hn}</small><small>{value.card.appointmentNo} · {value.card.doctor.name} · {value.card.room.name}</small></div><em>รอชำระเงิน</em></section>
    <div className="checkout-grid">
      <main>
        <section className="checkout-card checkout-treatment-summary"><h3>สรุปผลการรักษาสำหรับ Checkout</h3><p>รายการที่ยืนยันว่าใช้จริง</p>{value.card.items.filter(item => item.usageStatus === "USED").length ? value.card.items.filter(item => item.usageStatus === "USED").map(item => <div key={item.id}><span><b>{item.name}</b><small>{item.type === "COURSE" ? "คอร์ส / สิทธิ์ของลูกค้า" : "บริการ"}</small></span><em>{item.settlementMode === "ENTITLEMENT" ? "ใช้สิทธิ์แล้ว" : item.settlementMode === "NO_CHARGE" ? "ไม่มีค่าใช้จ่าย" : "คิดเงิน"}</em></div>) : <div className="checkout-empty">ไม่มีรายการสิทธิ์ที่ใช้ในนัดนี้</div>}</section>
        <section className="checkout-card"><div className="checkout-section-head"><div><h3>ยา / เวชภัณฑ์ตามรายการรักษา</h3><p>รวมอยู่ในราคาบริการ ไม่คิดเงินเพิ่ม</p></div><span>฿0</span></div>{includedMedications.length ? includedMedications.map((item,index) => <div className="checkout-line" key={`${item.name}-${index}`}><span>{item.name || "รายการในสูตร"}</span><b>{item.quantity ?? 1} {item.unit || "ชิ้น"}</b></div>) : <div className="checkout-empty">ไม่มีเวชภัณฑ์ในสูตร</div>}</section>
        <section className="checkout-card"><div className="checkout-section-head"><div><h3>รายการคิดเงินจากการรักษา</h3><p>{value.sale?.saleNo} · ราคา snapshot ณ เวลาบันทึก</p></div></div>{saleLines.length ? saleLines.map(line => <div className="checkout-charge-line" key={line.id}><span><b>{line.itemNameSnapshot}</b><small>{line.itemCodeSnapshot} · ×{line.quantity}</small></span><em>{line.itemType === "PRODUCT" ? "ยา / เวชภัณฑ์เพิ่มเติม" : "รายการคิดเงิน"}</em><strong>{money(line.netAmount)}</strong></div>) : <div className="checkout-empty">ไม่มีรายการคิดเงินเพิ่มเติม</div>}</section>
      </main>
      <aside>
        <section className="checkout-card checkout-select-card"><label>ผู้ขาย / ผู้แนะนำ<select><option>{value.card.doctor.name}</option></select></label></section>
        <section className="checkout-card checkout-select-card"><label>โปรโมชัน<select disabled><option>ไม่มีโปรโมชันเพิ่มเติม</option></select></label></section>
        <section className="checkout-card checkout-totals"><h3>สรุปค่าใช้จ่าย</h3><div><span>ยอดก่อนส่วนลด</span><b>{money(subtotal)}</b></div><div><span>ส่วนลด</span><b className="discount">−{money(discount)}</b></div><div className="checkout-grand"><span>ยอดสุทธิ</span><b>{money(value.amount)}</b></div></section>
        <section className="checkout-card checkout-payment-method"><label>ช่องทางชำระ<select value={value.method} onChange={event => setValue(current => current ? { ...current, method: event.target.value } : current)}><option value="QR">QR Payment</option><option value="CASH">เงินสด</option><option value="TRANSFER">โอนเงิน</option><option value="CREDIT_CARD">บัตรเครดิต</option></select></label><label>ยอดรับ<input type="number" min="0.01" step="0.01" required value={value.amount} onChange={event => setValue(current => current ? { ...current, amount: event.target.value } : current)} /></label></section>
        <button className="checkout-submit" disabled={busy}>{busy ? "กำลังรับชำระ…" : "ดำเนินการ Checkout"}</button>
        <button type="button" className="checkout-cancel" onClick={close}>กลับไปหน้าคิว</button>
      </aside>
    </div>
  </form></div>;
}
