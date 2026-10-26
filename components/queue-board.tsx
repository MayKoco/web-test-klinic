"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type BoardAction = "CHECK_IN" | "START" | "FINISH" | "COMPLETE" | "CANCEL";
type SettlementMode = "PAYMENT" | "ENTITLEMENT" | "NO_CHARGE";
type TaxBreakdown = { taxableAmount: string; nonTaxableAmount: string; taxAmount: string; grossAmount: string };
type CatalogItem = { id: string; code: string; name: string; type: "PRODUCT" | "SERVICE" | "COURSE"; basePrice?: string; finalPrice: string; taxBreakdown?: TaxBreakdown | null; productDetail?: { unit?: string | null; currentStock?: number }; serviceDetail?: { durationMinutes?: number | null }; courseDetail?: { sessionCount?: number | null } };
type SymptomTag = { id: string; name: string; createdAt?: string; updatedAt?: string };
type TreatmentAreaType = "FACE" | "BODY" | "MOUTH" | "OTHER";
type TreatmentArea = { type: TreatmentAreaType; part: string; partName: string; detail: string };
type TreatmentMediaType = "BEFORE" | "AFTER";
type TreatmentMediaUpload = {
  localId: string;
  fileAssetId?: string;
  previewUrl: string;
  originalName: string;
  type: TreatmentMediaType;
  status: "UPLOADING" | "READY" | "ERROR";
  error?: string;
};
type FileUploadUrl = {
  file: { id: string };
  upload: { method: "PUT"; url: string; headers: Record<string, string> };
};
type Entitlement = { id: string; catalogItemId: string; totalUnits: number; usedUnits: number; remainingUnits: number; expiresAt?: string; status: string };
type AppointmentItem = { id: string; catalogItemId: string; name: string; type: string; quantity: number; settlementMode: SettlementMode; entitlementId?: string | null; usageStatus?: "PLANNED" | "PENDING" | "USED" | "NOT_USED"; resolutionNote?: string | null };
type UnpaidSale = { id: string; status: string; balanceAmount: string };
type SaleDetail = {
  id: string; saleNo: string; status: string; subtotal: string; discountAmount: string; taxableAmount: string; nonTaxableAmount: string; taxAmount: string; netAmount: string; balanceAmount: string; note?: string | null;
  lines: { id: string; catalogItemId: string; source?: "CHECKOUT" | "TREATMENT_ADD_ON"; itemType: string; itemCodeSnapshot: string; itemNameSnapshot: string; quantity: number; unitBasePriceSnapshot: string; discountAmount: string; taxableAmount: string; nonTaxableAmount: string; taxAmount: string; netAmount: string; components?: { id: string; componentType: string; nameSnapshot: string; quantity: number; allocatedNetAmount: string }[] }[];
};
type CheckoutState = { card: BoardCard; saleId: string; amount: string; method: string; sale?: SaleDetail; context?: TreatmentContext | null; catalog: CatalogItem[]; checkoutLines: Record<string, number>; query: string; dirty: boolean };
type ReceiptSnapshot = {
  version: number;
  receiptNo: string;
  issuedAt: string;
  clinic: { code: string; name: string; timezone: string };
  patient?: { hn?: string; prefix?: string | null; firstName?: string; lastName?: string; phone?: string } | null;
  sale: { saleNo: string; appointmentId?: string | null; subtotal: string; discountAmount: string; taxAmount: string; netAmount: string; paidAmount: string; balanceAmount: string };
  lines: { itemType: string; itemCodeSnapshot: string; itemNameSnapshot: string; quantity: number; unitBasePriceSnapshot: string; discountAmount: string; taxableAmount: string; nonTaxableAmount: string; taxAmount: string; netAmount: string }[];
  payments: { paymentNo: string; amount: string; method: string; reference?: string | null; paidAt: string }[];
};
type ReceiptData = { id: string; saleId: string; receiptNo: string; issuedAt: string; snapshot: ReceiptSnapshot };
type UsageConfirmationSnapshot = {
  version: number; confirmationNo: string; issuedAt: string;
  clinic: { code: string; name: string; timezone: string };
  patient: { hn: string; prefix?: string | null; firstName: string; lastName: string; phone: string };
  appointment: { appointmentNo: string; date: string; startTime: string; doctor: { prefix?: string | null; firstName: string; lastName: string }; room: { name: string } };
  usages: { usageId: string; code: string; name: string; unitsUsed: number; usageNumber: number; totalUnits: number; remainingUnits: number; usedAt: string; sourceSaleNo?: string | null; sourceReceiptNo?: string | null }[];
  amountDue: string;
};
type UsageConfirmationData = { id: string; appointmentId: string; confirmationNo: string; issuedAt: string; snapshot: UsageConfirmationSnapshot };
type BoardCard = {
  appointmentId: string;
  displayNo: string;
  appointmentNo: string;
  startTime: string;
  status: string;
  appointmentType: "SCHEDULED" | "WALK_IN" | "URGENT_WALK_IN";
  patient: { id: string; hn: string; name: string; phone: string };
  doctor: { id: string; name: string };
  room: { id: string; name: string };
  items: AppointmentItem[];
  checkedInAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  completedAt?: string | null;
  treatmentRecorded: boolean;
  hasEntitlementUsage?: boolean;
  usageConfirmation?: { id: string } | null;
  settlement: { state: string; balanceAmount: string; unpaidSales?: UnpaidSale[]; receipts?: { saleId: string; receiptId: string }[] };
  blockingReasons: string[];
  availableActions: BoardAction[];
};
type BoardData = {
  summary: { scheduled: number; waiting: number; inProgress: number; pendingClose: number; completed: number };
  columns: { scheduled: BoardCard[]; waiting: BoardCard[]; inProgress: BoardCard[]; pendingClose: BoardCard[]; completed: BoardCard[] };
};
type Doctor = { id: string; prefix?: string; firstName: string; lastName: string };
type Room = { id: string; roomCode: string; name: string; status: string };
type PatientListItem = { id: string; hn: string; prefix?: string | null; firstName: string; lastName: string; phone: string };
type UrgentAvailability = {
  available: boolean;
  currentDate: string;
  currentTime: string;
  currentSlot: string;
  timezone: string;
  blockers: { code: string; appointmentId: string }[];
  warnings: string[];
  waitingCount: number;
  nextAppointment?: { id: string; appointmentNo: string; startTime: string } | null;
};
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
  treatmentRecord?: TreatmentRecordData | null;
  items: TreatmentContextItem[];
};
type TreatmentAddendum = { id: string; note: string; createdAt: string; createdBy: string };
type SavedTreatmentMedia = {
  id: string;
  fileAssetId: string;
  type: TreatmentMediaType;
  sortOrder: number;
  caption?: string | null;
  originalName?: string;
  mimeType?: string;
  downloadUrl?: string;
  fileAsset?: { id: string; originalName: string; mimeType: string };
};
type TreatmentRecordData = {
  id: string;
  version: number;
  editableUntil: string;
  symptoms?: unknown;
  treatmentDetail: string;
  treatmentAreas?: unknown;
  medications?: unknown;
  aftercareNote?: string | null;
  createdAt: string;
  updatedAt?: string;
  addenda?: TreatmentAddendum[];
  media?: SavedTreatmentMedia[];
};
type TreatmentVersion = Omit<TreatmentRecordData, "editableUntil" | "addenda"> & {
  treatmentRecordId: string;
  changedAt: string;
  changedBy: string;
  changeReason?: string | null;
  mediaSnapshot?: SavedTreatmentMedia[];
};
type TreatmentHistoryState = { card: BoardCard; record: TreatmentRecordData; versions: TreatmentVersion[] };

async function hydrateTreatmentMedia(
  record: TreatmentRecordData,
  versions: TreatmentVersion[],
  token: string,
) {
  const ids = new Set<string>();
  record.media?.forEach(item => ids.add(item.fileAssetId));
  versions.forEach(version => version.mediaSnapshot?.forEach(item => ids.add(item.fileAssetId)));
  const urls = new Map<string, string>();
  await Promise.all([...ids].map(async id => {
    try {
      const response = await apiRequest<{ url: string }>(`/files/${id}/download-url`, { token });
      urls.set(id, response.data.url);
    } catch {
      // Historical metadata remains visible when an object cannot be opened.
    }
  }));
  return {
    record: {
      ...record,
      media: record.media?.map(item => ({ ...item, downloadUrl: urls.get(item.fileAssetId) })),
    },
    versions: versions.map(version => ({
      ...version,
      mediaSnapshot: version.mediaSnapshot?.map(item => ({ ...item, downloadUrl: urls.get(item.fileAssetId) })),
    })),
  };
}

const treatmentPartGroups: Record<Exclude<TreatmentAreaType, "OTHER">, { part: string; partName: string }[]> = {
  FACE: [
    { part: "FOREHEAD", partName: "หน้าผาก" },
    { part: "LEFT_EYE", partName: "ตาซ้าย" },
    { part: "RIGHT_EYE", partName: "ตาขวา" },
    { part: "NOSE", partName: "จมูก" },
    { part: "MOUTH", partName: "ปาก" },
    { part: "CHIN", partName: "คาง" },
    { part: "LEFT_CHEEK", partName: "แก้มซ้าย" },
    { part: "RIGHT_CHEEK", partName: "แก้มขวา" },
    { part: "LEFT_EAR", partName: "หูซ้าย" },
    { part: "RIGHT_EAR", partName: "หูขวา" },
  ],
  BODY: [
    { part: "NECK", partName: "ลำคอ" },
    { part: "CHEST", partName: "หน้าอก" },
    { part: "BACK", partName: "แผ่นหลัง" },
    { part: "LEFT_ARM", partName: "แขนซ้าย" },
    { part: "RIGHT_ARM", partName: "แขนขวา" },
    { part: "LEFT_LEG", partName: "ขาซ้าย" },
    { part: "RIGHT_LEG", partName: "ขาขวา" },
  ],
  MOUTH: [
    { part: "UPPER_LIP", partName: "ริมฝีปากบน" },
    { part: "LOWER_LIP", partName: "ริมฝีปากล่าง" },
    { part: "UPPER_GUM", partName: "เหงือกบน" },
    { part: "LOWER_GUM", partName: "เหงือกล่าง" },
    { part: "UPPER_TEETH", partName: "ฟันบน" },
    { part: "LOWER_TEETH", partName: "ฟันล่าง" },
  ],
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
  const [treatmentSymptoms, setTreatmentSymptoms] = useState<SymptomTag[]>([]);
  const [treatmentHistory, setTreatmentHistory] = useState<TreatmentHistoryState | null>(null);
  const [payment, setPayment] = useState<CheckoutState | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [usageConfirmation, setUsageConfirmation] = useState<UsageConfirmationData | null>(null);
  const [checkInCard, setCheckInCard] = useState<BoardCard | null>(null);
  const [urgentOpen, setUrgentOpen] = useState(false);

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
      const [result, products, symptoms] = await Promise.all([
        apiRequest<TreatmentContext>(`/appointments/${card.appointmentId}/treatment-context`, { token }),
        apiRequest<CatalogItem[]>("/catalog/items?status=ACTIVE&limit=100&sortBy=name&sortOrder=asc", { token }),
        apiRequest<SymptomTag[]>("/treatment-symptoms?limit=100&sortBy=name&sortOrder=asc", { token }),
      ]);
      setTreatmentContext(result.data);
      setTreatmentProducts(products.data);
      setTreatmentSymptoms(symptoms.data);
      setTreatmentResults(Object.fromEntries(result.data.items.map(item => [item.id, item.usageStatus === "USED" || item.usageStatus === "NOT_USED" ? item.usageStatus : "PENDING"])));
    } catch (error) {
      setTreatmentCard(null);
      setNotice({ kind: "error", text: apiError(error) });
    }
  }

  async function openTreatmentHistory(card: BoardCard) {
    setBusy(`${card.appointmentId}:HISTORY`);
    try {
      const [record, versions] = await Promise.all([
        apiRequest<TreatmentRecordData>(`/appointments/${card.appointmentId}/treatment`, { token }),
        apiRequest<TreatmentVersion[]>(`/appointments/${card.appointmentId}/treatment/versions`, { token }),
      ]);
      const hydrated = await hydrateTreatmentMedia(record.data, versions.data, token);
      setTreatmentHistory({ card, ...hydrated });
    } catch (error) {
      setNotice({ kind: "error", text: apiError(error) });
    } finally {
      setBusy("");
    }
  }

  async function refreshTreatmentHistory(card: BoardCard) {
    const [record, versions] = await Promise.all([
      apiRequest<TreatmentRecordData>(`/appointments/${card.appointmentId}/treatment`, { token }),
      apiRequest<TreatmentVersion[]>(`/appointments/${card.appointmentId}/treatment/versions`, { token }),
    ]);
    const hydrated = await hydrateTreatmentMedia(record.data, versions.data, token);
    setTreatmentHistory({ card, ...hydrated });
  }

  async function updateTreatmentHistory(payload: Record<string, unknown>) {
    if (!treatmentHistory) return;
    setBusy(`${treatmentHistory.card.appointmentId}:REVISION`);
    try {
      await apiRequest(`/appointments/${treatmentHistory.card.appointmentId}/treatment`, {
        method: "PATCH",
        token,
        body: JSON.stringify(payload),
      });
      await refreshTreatmentHistory(treatmentHistory.card);
      setNotice({ kind: "success", text: "บันทึกการแก้ไขเป็นเวอร์ชันใหม่แล้ว" });
    } catch (error) {
      setNotice({ kind: "error", text: apiError(error) });
    } finally {
      setBusy("");
    }
  }

  async function addTreatmentAddendum(note: string) {
    if (!treatmentHistory) return;
    setBusy(`${treatmentHistory.card.appointmentId}:ADDENDUM`);
    try {
      await apiRequest(`/appointments/${treatmentHistory.card.appointmentId}/treatment/addenda`, {
        method: "POST",
        token,
        body: JSON.stringify({ note }),
      });
      await refreshTreatmentHistory(treatmentHistory.card);
      setNotice({ kind: "success", text: "เพิ่มหมายเหตุเพิ่มเติมแล้ว" });
    } catch (error) {
      setNotice({ kind: "error", text: apiError(error) });
    } finally {
      setBusy("");
    }
  }

  async function saveTreatment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!treatmentCard) return;
    const form = new FormData(event.currentTarget);
    const addOns = JSON.parse(String(form.get("addOns") || "[]")) as { itemId: string; quantity: number }[];
    const media = JSON.parse(String(form.get("media") || "[]")) as { fileAssetId: string; type: TreatmentMediaType; sortOrder: number }[];
    setBusy(`${treatmentCard.appointmentId}:TREATMENT`);
    try {
      await apiRequest(`/appointments/${treatmentCard.appointmentId}/treatment`, {
        method: "POST", token,
        body: JSON.stringify({
          doctorId: treatmentCard.doctor.id,
          symptoms: JSON.parse(String(form.get("symptoms") || "[]")),
          treatmentDetail: form.get("treatmentDetail"),
          treatmentAreas: JSON.parse(String(form.get("treatmentAreas") || "[]")),
          medications: JSON.parse(String(form.get("medications") || "[]")),
          ...(addOns.length ? { addOns } : {}),
          ...(media.length ? { media } : {}),
          aftercareNote: form.get("aftercareNote") || undefined,
          itemResults: treatmentContext?.items.map(item => ({
            appointmentItemId: item.id,
            status: treatmentResults[item.id],
            ...(treatmentResults[item.id] === "NOT_USED" ? { reason: String(form.get(`reason:${item.id}`) || "") || undefined } : {}),
          })),
        }),
      });
      setTreatmentCard(null);
      setTreatmentContext(null);
      setTreatmentProducts([]);
      setTreatmentSymptoms([]);
      setNotice({ kind: "success", text: addOns.length > 0 ? "บันทึกการรักษาแล้ว สร้าง Bill ร่างและส่งไปรอชำระเงิน" : "บันทึกการรักษาแล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) {
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
        saleId = created.data.id;
        amount = created.data.netAmount;
      }
      const [saleDetail, treatmentDetail, products] = await Promise.all([
        apiRequest<SaleDetail>(`/sales/${saleId}`, { token }),
        apiRequest<TreatmentContext>(`/appointments/${card.appointmentId}/treatment-context`, { token }).catch(() => ({ data: null })),
        apiRequest<CatalogItem[]>("/catalog/items?type=PRODUCT&status=ACTIVE&limit=100&sortBy=name&sortOrder=asc", { token }),
      ]);
      const checkoutLines = Object.fromEntries(
        saleDetail.data.lines
          .filter(line => line.source !== "TREATMENT_ADD_ON")
          .map(line => [line.catalogItemId, line.quantity]),
      );
      setPayment({ card, saleId, amount, method: "QR", sale: saleDetail.data, context: treatmentDetail.data, catalog: products.data, checkoutLines, query: "", dirty: false });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function saveCheckoutDraft(confirm = false) {
    if (!payment) return;
    setBusy(`${payment.card.appointmentId}:CHECKOUT_DRAFT`);
    try {
      const lines = Object.entries(payment.checkoutLines)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({ itemType: "CATALOG", itemId, quantity }));
      const updated = await apiRequest<SaleDetail>(`/sales/${payment.saleId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ lines }),
      });
      const sale = confirm
        ? (await apiRequest<SaleDetail>(`/sales/${payment.saleId}/confirm`, { method: "POST", token })).data
        : updated.data;
      setPayment(current => current ? { ...current, sale, amount: sale.balanceAmount, dirty: false } : current);
      setNotice({ kind: "success", text: confirm ? "ยืนยันยอดแล้ว พร้อมรับชำระเงิน" : "บันทึกรายการใน Bill แล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!payment) return;
    if (payment.sale?.status === "DRAFT") {
      setNotice({ kind: "error", text: "กรุณายืนยันยอดชำระก่อนรับเงิน" });
      return;
    }
    setBusy(`${payment.card.appointmentId}:PAYMENT_SAVE`);
    try {
      const result = await apiRequest<{ receipt: ReceiptData | null }>(`/sales/${payment.saleId}/payments`, {
        method: "POST", token,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount: Number(payment.amount), method: payment.method, paidAt: new Date().toISOString() }),
      });
      setPayment(null);
      setReceipt(result.data.receipt);
      setNotice({ kind: "success", text: result.data.receipt ? `รับชำระและออกใบเสร็จ ${result.data.receipt.receiptNo} แล้ว` : "บันทึกรับชำระแล้ว" });
      await loadBoard(token, date, doctorId, search, true);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function openReceipt(card: BoardCard) {
    const saleId = card.settlement.receipts?.at(-1)?.saleId;
    if (!saleId) return;
    setBusy(`${card.appointmentId}:RECEIPT`);
    try {
      const result = await apiRequest<ReceiptData>(`/sales/${saleId}/receipt`, { token });
      setReceipt(result.data);
    } catch (error) { setNotice({ kind: "error", text: apiError(error) }); }
    finally { setBusy(""); }
  }

  async function openUsageConfirmation(card: BoardCard) {
    setBusy(`${card.appointmentId}:USAGE_CONFIRMATION`);
    try {
      const result = await apiRequest<UsageConfirmationData>(`/appointments/${card.appointmentId}/usage-confirmation`, {
        method: card.usageConfirmation ? "GET" : "POST",
        token,
      });
      setUsageConfirmation(result.data);
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
            <div className="queue-create-actions">
              <Link className="soft-button walkin-button" href="/#appointment-form">+ Walk-in / นัดหมาย</Link>
              <button className="primary-button urgent-walkin-button" type="button" onClick={() => setUrgentOpen(true)}>+ Walk-in เร่งด่วน</button>
            </div>
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
                      onHistory={() => void openTreatmentHistory(card)}
                      onEntitlement={() => void consumeEntitlements(card)}
                      onPayment={() => void preparePayment(card)}
                      onReceipt={() => void openReceipt(card)}
                      onUsageConfirmation={() => void openUsageConfirmation(card)}
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
      {treatmentCard && <TreatmentDialog card={treatmentCard} context={treatmentContext} products={treatmentProducts} symptoms={treatmentSymptoms} token={token} results={treatmentResults} busy={Boolean(busy)} setResult={(id, status) => setTreatmentResults(current => ({ ...current, [id]: status }))} close={() => { setTreatmentCard(null); setTreatmentContext(null); setTreatmentProducts([]); setTreatmentSymptoms([]); }} save={saveTreatment} />}
      {treatmentHistory && <TreatmentHistoryDialog key={treatmentHistory.record.version} value={treatmentHistory} busy={Boolean(busy)} close={() => setTreatmentHistory(null)} update={updateTreatmentHistory} addendum={addTreatmentAddendum} />}
      {payment && <PaymentDialog value={payment} busy={Boolean(busy)} setValue={setPayment} close={() => setPayment(null)} saveDraft={() => void saveCheckoutDraft(false)} confirm={() => void saveCheckoutDraft(true)} save={savePayment} />}
      {receipt && <ReceiptDialog receipt={receipt} close={() => setReceipt(null)} />}
      {usageConfirmation && <UsageConfirmationDialog confirmation={usageConfirmation} close={() => setUsageConfirmation(null)} />}
      {urgentOpen && <UrgentWalkInDialog
        token={token}
        doctors={doctors}
        close={() => setUrgentOpen(false)}
        completed={async appointmentDate => {
          setUrgentOpen(false);
          setDate(appointmentDate);
          setNotice({ kind: "success", text: "เพิ่ม Walk-in เร่งด่วนเข้าคิวรอรักษาแล้ว" });
          await loadBoard(token, appointmentDate, doctorId, search, true);
        }}
      />}
    </main>
  );
}

function UrgentWalkInDialog({ token, doctors, close, completed }: {
  token: string;
  doctors: Doctor[];
  close: () => void;
  completed: (appointmentDate: string) => Promise<void>;
}) {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [availability, setAvailability] = useState<UrgentAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<PatientListItem[]>("/patients?limit=100&sortBy=firstName&sortOrder=asc", { token }),
      apiRequest<Room[]>("/rooms?limit=100&sortBy=name&sortOrder=asc&status=ACTIVE", { token }),
    ]).then(([patientResponse, roomResponse]) => {
      if (!active) return;
      setPatients(patientResponse.data);
      setRooms(roomResponse.data);
    }).catch(value => {
      if (active) setError(apiError(value));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!doctorId || !roomId) {
      queueMicrotask(() => setAvailability(null));
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setChecking(true);
      setError("");
      try {
        const params = new URLSearchParams({ doctorId, roomId });
        if (patientId) params.set("patientId", patientId);
        const response = await apiRequest<UrgentAvailability>(`/appointments/urgent-walk-in-availability?${params}`, { token });
        if (active) setAvailability(response.data);
      } catch (value) {
        if (active) {
          setAvailability(null);
          setError(apiError(value));
        }
      } finally {
        if (active) setChecking(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [doctorId, roomId, patientId, token]);

  const visiblePatients = patients.filter(patient => {
    const term = patientSearch.trim().toLocaleLowerCase("th-TH");
    if (!term) return true;
    return `${patient.hn} ${patient.prefix ?? ""}${patient.firstName} ${patient.lastName} ${patient.phone}`.toLocaleLowerCase("th-TH").includes(term);
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!availability?.available || !confirmed) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ date: string }>("/appointments/urgent-walk-ins", {
        method: "POST",
        token,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          patientId,
          doctorId,
          roomId,
          doctorAvailabilityConfirmed: true,
          chiefComplaint: chiefComplaint || undefined,
          staffNote: staffNote || undefined,
        }),
      });
      await completed(response.data.date.slice(0, 10));
    } catch (value) {
      setError(apiError(value));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawer-backdrop checkin-backdrop" role="presentation" onClick={close}>
      <form className="queue-dialog urgent-walkin-dialog" onClick={event => event.stopPropagation()} onSubmit={submit}>
        <header>
          <div><p className="eyebrow">URGENT WALK-IN</p><h2>เพิ่มคิวเร่งด่วน</h2><span>ใช้เมื่อแพทย์ยืนยันว่ารับผู้ป่วยแทรกระหว่างคิวได้</span></div>
          <button type="button" onClick={close} aria-label="ปิด">×</button>
        </header>

        {error && <div className="urgent-state blocked"><b>ยังสร้างคิวไม่ได้</b><span>{error}</span></div>}
        {loading ? <QueueEmpty text="กำลังโหลดข้อมูล…" /> : <>
          <section className="urgent-form-grid">
            <label className="urgent-patient-picker"><span>ค้นหาผู้รับบริการ</span><input value={patientSearch} onChange={event => setPatientSearch(event.target.value)} placeholder="ชื่อ, HN หรือเบอร์โทร" /></label>
            <label className="urgent-patient-picker"><span>ผู้รับบริการ *</span><select required value={patientId} onChange={event => setPatientId(event.target.value)}><option value="">เลือกผู้รับบริการ</option>{visiblePatients.map(patient => <option key={patient.id} value={patient.id}>{patient.hn} · {patient.prefix}{patient.firstName} {patient.lastName}</option>)}</select></label>
            <label><span>แพทย์ *</span><select required value={doctorId} onChange={event => setDoctorId(event.target.value)}><option value="">เลือกแพทย์</option>{doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.prefix}{doctor.firstName} {doctor.lastName}</option>)}</select></label>
            <label><span>ห้อง *</span><select required value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">เลือกห้อง</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.roomCode} · {room.name}</option>)}</select></label>
          </section>

          <section className="urgent-availability">
            {!doctorId || !roomId ? <div className="urgent-state neutral"><b>รอตรวจสอบความพร้อม</b><span>เลือกแพทย์และห้องก่อน</span></div> : checking ? <div className="urgent-state neutral"><b>กำลังตรวจสอบ…</b><span>ตรวจเวร ห้อง วันหยุด และคิวที่กำลังรักษา</span></div> : availability && <div className={`urgent-state ${availability.available ? "ready" : "blocked"}`}>
              <b>{availability.available ? "รับคิวเร่งด่วนได้" : "ยังรับคิวเร่งด่วนไม่ได้"}</b>
              <span>เวลาคลินิก {availability.currentTime} น. · slot {availability.currentSlot} น.</span>
              {availability.nextAppointment && <span>นัดถัดไป {availability.nextAppointment.startTime} น. ({availability.nextAppointment.appointmentNo})</span>}
              {availability.waitingCount > 0 && <span>มีคิวรอแพทย์ท่านนี้ {availability.waitingCount} คิว</span>}
              {availability.blockers.map(blocker => <span key={`${blocker.code}:${blocker.appointmentId}`}>• {urgentBlockerLabel(blocker.code)}</span>)}
              {availability.warnings.map(warning => <span key={warning}>⚠ {urgentWarningLabel(warning)}</span>)}
            </div>}
          </section>

          <label><span>อาการ / เหตุผลที่มา</span><textarea value={chiefComplaint} onChange={event => setChiefComplaint(event.target.value)} placeholder="ข้อมูลสั้น ๆ สำหรับทีมรักษา" /></label>
          <label><span>หมายเหตุพนักงาน</span><textarea value={staffNote} onChange={event => setStaffNote(event.target.value)} placeholder="เช่น แพทย์อนุมัติให้แทรกหลังเคสปัจจุบัน" /></label>
          <label className="urgent-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span><b>แพทย์ยืนยันรับคิวนี้แล้ว</b><small>ระบบจะเพิ่มผู้รับบริการเข้าสถานะ “รอรักษา” ทันที โดยไม่จอง slot ใหม่</small></span></label>
        </>}

        <footer><button type="button" className="soft-button" onClick={close}>ยกเลิก</button><button className="primary-button" disabled={saving || checking || !patientId || !availability?.available || !confirmed}>{saving ? "กำลังเพิ่มคิว…" : "ยืนยันเพิ่มคิวเร่งด่วน"}</button></footer>
      </form>
    </div>
  );
}

function urgentBlockerLabel(code: string) {
  return ({
    DOCTOR_CURRENTLY_BUSY: "แพทย์กำลังรักษาผู้รับบริการรายอื่น",
    ROOM_CURRENTLY_OCCUPIED: "ห้องกำลังใช้งาน",
    PATIENT_ALREADY_IN_TREATMENT: "ผู้รับบริการอยู่ระหว่างการรักษา",
  } as Record<string, string>)[code] ?? code;
}

function urgentWarningLabel(code: string) {
  return ({
    DOCTOR_HAS_WAITING_QUEUE: "แพทย์มีคิวรออยู่แล้ว โปรดแจ้งลำดับคิวกับผู้รับบริการ",
    NEXT_APPOINTMENT_WITHIN_30_MINUTES: "มีนัดถัดไปภายใน 30 นาที",
  } as Record<string, string>)[code] ?? code;
}

function QueueCard({ card, now, busy, onDetails, onAction, onTreatment, onHistory, onEntitlement, onPayment, onReceipt, onUsageConfirmation }: {
  card: BoardCard; now: number; busy: boolean; onDetails: () => void;
  onAction: (action: Exclude<BoardAction, "CANCEL">) => void;
  onTreatment: () => void; onHistory: () => void; onEntitlement: () => void; onPayment: () => void; onReceipt: () => void; onUsageConfirmation: () => void;
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
      <div className="queue-card-top"><span>{card.displayNo}</span><div className="queue-card-badges">{card.appointmentType === "URGENT_WALK_IN" && <b className="urgent-badge">เร่งด่วน</b>}<StatusBadge card={card} /></div></div>
      <h3>{card.patient.name}</h3>
      <p>{card.startTime} · {card.doctor.name}</p>
      <p>{card.room.name}</p>
      <div className="queue-items">{card.items.map(item => <span key={item.id}>{item.name}</span>)}{!card.items.length && <span className="muted-chip">ยังไม่ระบุบริการ</span>}</div>
      {since && <div className="wait-time">◷ {card.status === "IN_PROGRESS" ? "รักษา" : "รอ"} {elapsed(since, now)}</div>}
      {!!card.blockingReasons.length && <div className="blocker-list">{card.blockingReasons.map(reason => <small key={reason}>{blockerLabel(reason)}</small>)}</div>}
      <div className="queue-card-actions">
        <button className="soft-button" onClick={onDetails}>รายละเอียด</button>
        {card.status === "IN_PROGRESS" && !card.treatmentRecorded && <button className="soft-button" onClick={onTreatment}>บันทึก</button>}
        {card.treatmentRecorded && <button className="soft-button" onClick={onHistory}>ผลรักษา / เวอร์ชัน</button>}
        {card.blockingReasons.includes("TREATMENT_REQUIRED") && <button className="primary-action" onClick={onTreatment}>บันทึกการรักษา</button>}
        {card.blockingReasons.includes("ENTITLEMENT_REQUIRED") && <button className="primary-action" disabled={busy} onClick={onEntitlement}>ใช้สิทธิ์</button>}
        {card.blockingReasons.includes("PAYMENT_REQUIRED") && <button className="primary-action" disabled={busy} onClick={onPayment}>จัดรายการ / ชำระ</button>}
        {!!card.settlement.receipts?.length && <button className="soft-button" disabled={busy} onClick={onReceipt}>ใบเสร็จ</button>}
        {card.hasEntitlementUsage && <button className="soft-button" disabled={busy} onClick={onUsageConfirmation}>ใบยืนยันใช้สิทธิ์</button>}
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

function TreatmentDialog({ card, context, products, symptoms, token, results, busy, setResult, close, save }: {
  card: BoardCard; context: TreatmentContext | null; products: CatalogItem[]; symptoms: SymptomTag[]; token: string; results: Record<string, "PENDING" | "USED" | "NOT_USED">;
  busy: boolean; setResult: (id: string, status: "USED" | "NOT_USED") => void; close: () => void;
  save: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const unresolved = context?.items.filter(item => (results[item.id] ?? "PENDING") === "PENDING").length ?? 0;
  const [areas, setAreas] = useState<TreatmentArea[]>([]);
  const [activeAreaType, setActiveAreaType] = useState<Exclude<TreatmentAreaType, "OTHER">>("FACE");
  const [formulaQuantities, setFormulaQuantities] = useState<Record<string, number>>({});
  const [addOnQuery, setAddOnQuery] = useState("");
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [mediaUploads, setMediaUploads] = useState<TreatmentMediaUpload[]>([]);
  const [symptomTags, setSymptomTags] = useState<SymptomTag[]>(symptoms);
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomTag[]>([]);
  const [symptomQuery, setSymptomQuery] = useState("");
  const [symptomOpen, setSymptomOpen] = useState(false);
  const [symptomBusy, setSymptomBusy] = useState("");
  const [symptomError, setSymptomError] = useState("");
  const areaOptions = treatmentPartGroups[activeAreaType];
  const formulaProducts = context?.items.flatMap(item => item.products.map(product => ({ ...product, source: item.name, sourceAppointmentItemId: item.id }))) ?? [];
  const matchingProducts = products.filter(product => `${product.code} ${product.name}`.toLowerCase().includes(addOnQuery.trim().toLowerCase())).slice(0, 6);
  const normalizedSymptomQuery = symptomQuery.trim().toLocaleLowerCase("th-TH");
  const matchingSymptoms = symptomTags
    .filter(tag => !selectedSymptoms.some(selected => selected.id === tag.id))
    .filter(tag => !normalizedSymptomQuery || tag.name.toLocaleLowerCase("th-TH").includes(normalizedSymptomQuery))
    .slice(0, 8);
  const canCreateSymptom = Boolean(symptomQuery.trim()) && !symptomTags.some(tag => tag.name.toLocaleLowerCase("th-TH") === normalizedSymptomQuery);
  const selectedAddOns = products.filter(product => (addOns[product.id] ?? 0) > 0);
  const addOnTotal = selectedAddOns.reduce((sum, product) => sum + Number(product.finalPrice) * addOns[product.id], 0);
  const addOnBreakdown = selectedAddOns.reduce((totals, product) => {
    const quantity = addOns[product.id];
    totals.procedure += Number(product.taxBreakdown?.nonTaxableAmount ?? 0) * quantity;
    totals.goodsBeforeVat += Number(product.taxBreakdown?.taxableAmount ?? 0) * quantity;
    totals.vat += Number(product.taxBreakdown?.taxAmount ?? 0) * quantity;
    return totals;
  }, { procedure: 0, goodsBeforeVat: 0, vat: 0 });
  const money = (amount: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  const medications = [
    ...formulaProducts.map(product => ({
      catalogItemId: product.catalogItemId,
      name: product.name,
      quantity: formulaQuantities[`${product.sourceAppointmentItemId}:${product.catalogItemId}`] ?? product.recommendedQuantity,
      unit: product.unit || "ชิ้น",
      source: product.source,
      sourceAppointmentItemId: product.sourceAppointmentItemId,
      kind: "FORMULA",
    })),
    ...selectedAddOns.filter(product => product.type === "PRODUCT").map(product => ({
      catalogItemId: product.id,
      name: product.name,
      quantity: addOns[product.id],
      unit: product.productDetail?.unit || "ชิ้น",
      unitPrice: Number(product.finalPrice),
      source: "TREATMENT_ADD_ON",
      kind: "ADD_ON",
    })),
  ];
  const isAreaSelected = (type: TreatmentAreaType, part: string) => areas.some(area => area.type === type && area.part === part);
  const toggleArea = (option: { part: string; partName: string }) => setAreas(current => {
    const exists = current.some(area => area.type === activeAreaType && area.part === option.part);
    return exists
      ? current.filter(area => !(area.type === activeAreaType && area.part === option.part))
      : [...current, { type: activeAreaType, part: option.part, partName: option.partName, detail: "" }];
  });
  const setAreaDetail = (target: TreatmentArea, detail: string) => setAreas(current => current.map(area =>
    area.type === target.type && area.part === target.part ? { ...area, detail } : area,
  ));
  const removeArea = (target: TreatmentArea) => setAreas(current => current.filter(area =>
    !(area.type === target.type && area.part === target.part),
  ));
  const hasIncompleteArea = areas.some(area => !area.detail.trim());
  const uploadTreatmentMedia = async (files: FileList | null, type: TreatmentMediaType) => {
    if (!files) return;
    const remaining = Math.max(0, 4 - mediaUploads.filter(item => item.type === type).length);
    const selected = Array.from(files).slice(0, remaining);
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const entries = selected.map(file => ({
      file,
      upload: {
        localId: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        originalName: file.name,
        type,
        status: "UPLOADING" as const,
      },
    }));
    setMediaUploads(current => [...current, ...entries.map(entry => entry.upload)]);

    await Promise.all(entries.map(async ({ file, upload }) => {
      let fileAssetId: string | undefined;
      try {
        if (!allowed.has(file.type)) throw new Error("รองรับเฉพาะ JPG, PNG และ WebP");
        if (file.size > 10 * 1024 * 1024) throw new Error("รูปต้องมีขนาดไม่เกิน 10 MB");
        const prepared = await apiRequest<FileUploadUrl>("/files/upload-url", {
          method: "POST",
          token,
          body: JSON.stringify({
            purpose: "TREATMENT_MEDIA",
            originalName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });
        fileAssetId = prepared.data.file.id;
        const uploaded = await fetch(prepared.data.upload.url, {
          method: prepared.data.upload.method,
          headers: prepared.data.upload.headers,
          body: file,
        });
        if (!uploaded.ok) throw new Error(`อัปโหลด Storage ไม่สำเร็จ (${uploaded.status})`);
        await apiRequest(`/files/${fileAssetId}/complete`, { method: "POST", token });
        setMediaUploads(current => current.map(item => item.localId === upload.localId
          ? { ...item, fileAssetId, status: "READY", error: undefined }
          : item));
      } catch (error) {
        if (fileAssetId) {
          await apiRequest(`/files/${fileAssetId}`, { method: "DELETE", token }).catch(() => undefined);
        }
        setMediaUploads(current => current.map(item => item.localId === upload.localId
          ? { ...item, status: "ERROR", error: apiError(error) }
          : item));
      }
    }));
  };
  const removeTreatmentMedia = async (item: TreatmentMediaUpload) => {
    if (item.fileAssetId) {
      await apiRequest(`/files/${item.fileAssetId}`, { method: "DELETE", token }).catch(() => undefined);
    }
    URL.revokeObjectURL(item.previewUrl);
    setMediaUploads(current => current.filter(value => value.localId !== item.localId));
  };
  const beforeImages = mediaUploads.filter(item => item.type === "BEFORE");
  const afterImages = mediaUploads.filter(item => item.type === "AFTER");
  const mediaUploading = mediaUploads.some(item => item.status === "UPLOADING");
  const mediaHasError = mediaUploads.some(item => item.status === "ERROR");
  const readyMedia = mediaUploads.filter(item => item.status === "READY" && item.fileAssetId);
  const closeDraft = async () => {
    if (mediaUploading) return;
    await Promise.all(readyMedia.map(item =>
      apiRequest(`/files/${item.fileAssetId}`, { method: "DELETE", token }).catch(() => undefined),
    ));
    mediaUploads.forEach(item => URL.revokeObjectURL(item.previewUrl));
    close();
  };
  useEffect(() => {
    const search = symptomQuery.trim();
    if (!search) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest<SymptomTag[]>(`/treatment-symptoms?search=${encodeURIComponent(search)}&limit=20&sortBy=name&sortOrder=asc`, { token });
        if (!active) return;
        setSymptomTags(current => {
          const merged = new Map(current.map(tag => [tag.id, tag]));
          response.data.forEach(tag => merged.set(tag.id, tag));
          return [...merged.values()];
        });
      } catch (error) {
        if (active) setSymptomError(apiError(error));
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [symptomQuery, token]);
  const createSymptom = async () => {
    const name = symptomQuery.trim();
    if (!name) return;
    setSymptomBusy("create"); setSymptomError("");
    try {
      const response = await apiRequest<SymptomTag>("/treatment-symptoms", { method: "POST", token, body: JSON.stringify({ name }) });
      setSymptomTags(current => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name, "th")));
      setSelectedSymptoms(current => [...current, response.data]);
      setSymptomQuery("");
      setSymptomOpen(false);
    } catch (error) { setSymptomError(apiError(error)); }
    finally { setSymptomBusy(""); }
  };
  const renameSymptom = async (tag: SymptomTag) => {
    const name = window.prompt("เปลี่ยนชื่ออาการ / สภาวะ", tag.name)?.trim();
    if (!name || name === tag.name) return;
    setSymptomBusy(tag.id); setSymptomError("");
    try {
      const response = await apiRequest<SymptomTag>(`/treatment-symptoms/${tag.id}`, { method: "PATCH", token, body: JSON.stringify({ name }) });
      setSymptomTags(current => current.map(value => value.id === tag.id ? response.data : value));
      setSelectedSymptoms(current => current.map(value => value.id === tag.id ? response.data : value));
    } catch (error) { setSymptomError(apiError(error)); }
    finally { setSymptomBusy(""); }
  };
  const deleteSymptom = async (tag: SymptomTag) => {
    if (!window.confirm(`ลบ tag “${tag.name}” ออกจากรายการกลาง? ประวัติที่เคยบันทึกไว้จะไม่ถูกลบ`)) return;
    setSymptomBusy(tag.id); setSymptomError("");
    try {
      await apiRequest(`/treatment-symptoms/${tag.id}`, { method: "DELETE", token });
      setSymptomTags(current => current.filter(value => value.id !== tag.id));
      setSelectedSymptoms(current => current.filter(value => value.id !== tag.id));
    } catch (error) { setSymptomError(apiError(error)); }
    finally { setSymptomBusy(""); }
  };

  return <div className="treatment-page" onClick={() => void closeDraft()}><form className="treatment-record-page" onClick={event => event.stopPropagation()} onSubmit={save}>
    <header className="treatment-page-header">
      <button type="button" className="treatment-back" disabled={mediaUploading} onClick={() => void closeDraft()}>←</button>
      <div><div className="treatment-title-line"><h2>บันทึกการรักษา</h2><span>ร่าง</span></div><p>เวชระเบียนความงามและแผนการรักษา</p></div>
      <div className="treatment-autosave"><i />บันทึกอัตโนมัติเมื่อกรอกข้อมูล</div>
      <button type="button" className="treatment-close" disabled={mediaUploading} onClick={() => void closeDraft()}>×</button>
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
          <section><label>อาการ / สภาวะ *</label><div className="symptom-picker"><div className="symptom-selected">{selectedSymptoms.map(tag => <button type="button" key={tag.id} onClick={() => setSelectedSymptoms(current => current.filter(value => value.id !== tag.id))}>{tag.name}<span>×</span></button>)}<input value={symptomQuery} onFocus={() => setSymptomOpen(true)} onBlur={() => window.setTimeout(() => setSymptomOpen(false), 150)} onChange={event => { setSymptomQuery(event.target.value); setSymptomError(""); setSymptomOpen(true); }} placeholder={selectedSymptoms.length ? "ค้นหาเพิ่ม…" : "ค้นหาอาการหรือสภาวะ…"} /></div>{symptomOpen && (symptomQuery.trim() || matchingSymptoms.length > 0) && <div className="symptom-options">{matchingSymptoms.map(tag => <div key={tag.id}><button type="button" className="symptom-option-name" onClick={() => { setSelectedSymptoms(current => [...current, tag]); setSymptomQuery(""); setSymptomOpen(false); }}><span>＋</span>{tag.name}</button><button type="button" title="แก้ชื่อ" disabled={Boolean(symptomBusy)} onClick={() => void renameSymptom(tag)}>แก้ไข</button><button type="button" className="delete" title="ลบ tag" disabled={Boolean(symptomBusy)} onClick={() => void deleteSymptom(tag)}>ลบ</button></div>)}{canCreateSymptom && <button type="button" className="symptom-create" disabled={Boolean(symptomBusy)} onClick={() => void createSymptom()}>＋ สร้าง “{symptomQuery.trim()}”</button>}</div>}<small>เลือกได้หลายรายการ · ค้นหา สร้าง แก้ไข หรือลบ tag ได้จากช่องนี้</small>{symptomError && <em>{symptomError}</em>}<input type="hidden" name="symptoms" value={JSON.stringify(selectedSymptoms.map(tag => tag.name))} /></div></section>
          <section><label>รายละเอียดการรักษา *</label><textarea name="treatmentDetail" required placeholder="บันทึกสิ่งที่ตรวจพบ ขั้นตอนการรักษา ปริมาณ และผลระหว่างทำ…" /></section>
          <section><label>ตำแหน่งที่รักษา *</label><div className="area-tabs"><button type="button" className={activeAreaType === "FACE" ? "active" : ""} onClick={() => setActiveAreaType("FACE")}>ใบหน้า</button><button type="button" className={activeAreaType === "MOUTH" ? "active" : ""} onClick={() => setActiveAreaType("MOUTH")}>ช่องปาก / ฟัน</button><button type="button" className={activeAreaType === "BODY" ? "active" : ""} onClick={() => setActiveAreaType("BODY")}>ร่างกาย</button></div><div className={`area-part-selector ${activeAreaType === "FACE" ? "with-face" : ""}`}>{activeAreaType === "FACE" && <div className="face-outline" aria-hidden="true"><span className="forehead">หน้าผาก</span><span className="nose">จมูก</span><span className="mouth">ปาก</span><span className="chin">คาง</span></div>}<div className="area-part-grid">{areaOptions.map(option => <button type="button" key={`${activeAreaType}:${option.part}`} className={isAreaSelected(activeAreaType, option.part) ? "selected" : ""} onClick={() => toggleArea(option)}>{isAreaSelected(activeAreaType, option.part) ? "✓ " : "+ "}{option.partName}</button>)}</div></div><div className="area-detail-list"><div className="area-detail-heading"><b>รายละเอียดรายตำแหน่ง</b><small>ระบุอาการ สิ่งที่ตรวจพบ หรือการรักษาของแต่ละส่วน</small></div>{areas.length ? areas.map(area => <article key={`${area.type}:${area.part}`}><header><span>{area.partName}</span><small>{area.type === "FACE" ? "ใบหน้า" : area.type === "MOUTH" ? "ช่องปาก / ฟัน" : "ร่างกาย"}</small><button type="button" onClick={() => removeArea(area)}>ลบ</button></header><textarea value={area.detail} onChange={event => setAreaDetail(area, event.target.value)} required placeholder={`${area.partName}: รายละเอียดการรักษาหรืออาการ`} /></article>) : <div className="treatment-empty compact">เลือกส่วนที่รักษาจากรายการด้านบน</div>}</div><input type="hidden" name="treatmentAreas" value={JSON.stringify(areas)} /></section>
          <section className="medication-panel"><div className="subsection-heading"><div><h3>ยาและเวชภัณฑ์ตามรายการรักษา</h3><p>ระบบตัด Lot แบบ FEFO ตามจำนวนใช้จริงเมื่อบันทึกการรักษา</p></div></div>{!formulaProducts.length ? <div className="treatment-empty compact">ไม่มีสินค้าในสูตรบริการ</div> : <div className="medication-table"><header><span>ชื่อรายการ</span><span>แนะนำ</span><span>ใช้จริง</span><span>หน่วย</span></header>{formulaProducts.map(product => { const formulaKey = `${product.sourceAppointmentItemId}:${product.catalogItemId}`; return <div key={formulaKey}><span><b>{product.name}</b><small>จาก {product.source}</small></span><span>{product.recommendedQuantity}</span><span className="qty-control"><button type="button" onClick={() => setFormulaQuantities(value => ({ ...value, [formulaKey]: Math.max(0, (value[formulaKey] ?? product.recommendedQuantity) - 1) }))}>−</button><b>{formulaQuantities[formulaKey] ?? product.recommendedQuantity}</b><button type="button" onClick={() => setFormulaQuantities(value => ({ ...value, [formulaKey]: (value[formulaKey] ?? product.recommendedQuantity) + 1 }))}>+</button></span><span>{product.unit || "ชิ้น"}</span></div>; })}</div>}</section>
          <section className="medication-panel add-on-panel"><div className="subsection-heading"><div><h3>รายการเพิ่มเติม (Add-on)</h3><p>เพิ่มสินค้า บริการ หรือคอร์ส แล้วส่งยอดรวมไปยังขั้นตอนชำระเงิน</p></div>{selectedAddOns.length > 0 && <span className="addon-payment-state">รอชำระ {money(addOnTotal)}</span>}</div><div className="addon-search"><span>⌕</span><input value={addOnQuery} onChange={event => setAddOnQuery(event.target.value)} placeholder="ค้นหาสินค้า บริการ คอร์ส หรือรหัส…" /></div>{addOnQuery.trim() && <div className="addon-results">{matchingProducts.length ? matchingProducts.map(product => <button key={product.id} type="button" disabled={product.type === "PRODUCT" && (product.productDetail?.currentStock ?? 0) <= 0} onClick={() => { setAddOns(value => ({ ...value, [product.id]: (value[product.id] ?? 0) + 1 })); setAddOnQuery(""); }}><span><b>{product.name}</b><small>{product.type === "PRODUCT" ? `สินค้า · ${product.code} · stock ${product.productDetail?.currentStock ?? 0} ${product.productDetail?.unit || "ชิ้น"}` : product.type === "SERVICE" ? `บริการ · ${product.code}${product.serviceDetail?.durationMinutes ? ` · ${product.serviceDetail.durationMinutes} นาที` : ""}` : `คอร์ส · ${product.code}${product.courseDetail?.sessionCount ? ` · ${product.courseDetail.sessionCount} ครั้ง` : ""}`}</small></span><strong>{money(Number(product.finalPrice))}</strong><em>{product.type !== "PRODUCT" || (product.productDetail?.currentStock ?? 0) > 0 ? "+ เพิ่ม" : "สินค้าหมด"}</em></button>) : <p>ไม่พบรายการที่ค้นหา</p>}</div>}{selectedAddOns.length > 0 ? <div className="addon-cart"><header><span>รายการ</span><span>จำนวน</span><span>ราคารวม VAT</span><span /></header>{selectedAddOns.map(product => { const quantity = addOns[product.id]; const tax = product.taxBreakdown; return <div key={product.id}><span><b>{product.name}</b><small>{product.type === "PRODUCT" ? `สินค้า · ${product.code}` : product.type === "SERVICE" ? `บริการ · ${product.code}` : `คอร์ส · ${product.code}`}</small>{tax && <small className="addon-line-tax">หัตถการ {money(Number(tax.nonTaxableAmount) * quantity)} · สินค้าก่อน VAT {money(Number(tax.taxableAmount) * quantity)} · VAT {money(Number(tax.taxAmount) * quantity)}</small>}</span><span className="qty-control"><button type="button" onClick={() => setAddOns(value => ({ ...value, [product.id]: Math.max(0, value[product.id] - 1) }))}>−</button><b>{quantity}</b><button type="button" onClick={() => setAddOns(value => ({ ...value, [product.id]: value[product.id] + 1 }))}>+</button></span><strong>{money(Number(product.finalPrice) * quantity)}</strong><button type="button" className="addon-remove" onClick={() => setAddOns(value => ({ ...value, [product.id]: 0 }))}>ลบ</button></div>; })}<footer className="addon-totals"><div><span>ค่าหัตถการ (ไม่คิด VAT)</span><b>{money(addOnBreakdown.procedure)}</b></div><div><span>สินค้า / ยา / เวชภัณฑ์ก่อน VAT</span><b>{money(addOnBreakdown.goodsBeforeVat)}</b></div><div><span>VAT 7%</span><b>{money(addOnBreakdown.vat)}</b></div><div className="addon-grand-total"><span>ยอด Add-on ที่ต้องชำระ</span><b>{money(addOnTotal)}</b></div></footer></div> : <div className="treatment-empty compact">ยังไม่มีรายการ Add-on</div>}</section>
          <section><label>คำแนะนำหลังการรักษา</label><textarea name="aftercareNote" placeholder="คำแนะนำ การดูแลตัวเอง และวันนัดครั้งถัดไป…" /></section>
          <input type="hidden" name="medications" value={JSON.stringify(medications)} />
          <input type="hidden" name="addOns" value={JSON.stringify(selectedAddOns.map(product => ({ itemId: product.id, quantity: addOns[product.id] })))} />
          <input type="hidden" name="media" value={JSON.stringify(readyMedia.map((item, index) => ({ fileAssetId: item.fileAssetId, type: item.type, sortOrder: index })))} />
        </main>

        <aside className="treatment-side">
          <section className="treatment-card photo-panel"><h3>ภาพการรักษา Before / After</h3><p>อัปโหลดเข้าพื้นที่จัดเก็บของคลินิก สูงสุดฝั่งละ 4 รูป</p><label>ก่อนรักษา</label><div className="photo-grid">{beforeImages.map(item => <div className={`photo-item ${item.status.toLowerCase()}`} key={item.localId}><Image unoptimized width={160} height={160} src={item.previewUrl} alt="ก่อนรักษา" /><button type="button" aria-label="ลบรูปก่อนรักษา" onClick={() => void removeTreatmentMedia(item)}>×</button>{item.status === "UPLOADING" && <span>กำลังอัปโหลด…</span>}{item.status === "ERROR" && <span title={item.error}>อัปโหลดไม่สำเร็จ</span>}</div>)}{beforeImages.length < 4 && <label className="photo-upload">＋<span>เพิ่มรูป</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { void uploadTreatmentMedia(event.target.files, "BEFORE"); event.currentTarget.value = ""; }} /></label>}</div><label>หลังรักษา</label><div className="photo-grid">{afterImages.map(item => <div className={`photo-item ${item.status.toLowerCase()}`} key={item.localId}><Image unoptimized width={160} height={160} src={item.previewUrl} alt="หลังรักษา" /><button type="button" aria-label="ลบรูปหลังรักษา" onClick={() => void removeTreatmentMedia(item)}>×</button>{item.status === "UPLOADING" && <span>กำลังอัปโหลด…</span>}{item.status === "ERROR" && <span title={item.error}>อัปโหลดไม่สำเร็จ</span>}</div>)}{afterImages.length < 4 && <label className="photo-upload">＋<span>เพิ่มรูป</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { void uploadTreatmentMedia(event.target.files, "AFTER"); event.currentTarget.value = ""; }} /></label>}</div>{mediaHasError && <div className="photo-error">ลบรูปที่อัปโหลดไม่สำเร็จแล้วเลือกใหม่</div>}</section>
          <section className="treatment-card doctor-sign"><small>แพทย์ผู้รับรองการรักษา</small><strong>{card.doctor.name}</strong><span>{context.doctor?.licenseNo ? `เลขใบประกอบโรคศิลปะ: ${context.doctor.licenseNo}` : context.doctor?.specialty || "แพทย์ผู้รักษา"}</span></section>
          <button className="treatment-submit" disabled={busy || mediaUploading || mediaHasError || unresolved > 0 || areas.length === 0 || hasIncompleteArea || selectedSymptoms.length === 0}>{busy ? "กำลังบันทึก…" : mediaUploading ? "กำลังอัปโหลดรูป…" : mediaHasError ? "กรุณาตรวจสอบรูปที่อัปโหลด" : unresolved > 0 ? `กรุณายืนยันอีก ${unresolved} รายการ` : selectedSymptoms.length === 0 ? "กรุณาเลือกอาการ / สภาวะ" : areas.length === 0 ? "กรุณาเลือกตำแหน่งรักษา" : hasIncompleteArea ? "กรุณากรอกรายละเอียดทุกตำแหน่ง" : "จบการรักษา"}</button>
          <p className="treatment-submit-note">การบันทึกจะยืนยันผลรายการรักษาและตัดสิทธิ์เฉพาะรายการที่เลือก “ใช้แล้ว”</p>
        </aside>
      </div>
    </div>}
  </form></div>;
}

function TreatmentHistoryDialog({ value, busy, close, update, addendum }: {
  value: TreatmentHistoryState;
  busy: boolean;
  close: () => void;
  update: (payload: Record<string, unknown>) => Promise<void>;
  addendum: (note: string) => Promise<void>;
}) {
  const [selectedVersion, setSelectedVersion] = useState(value.record.version);
  const [symptoms, setSymptoms] = useState(listValue(value.record.symptoms).join(", "));
  const [areas, setAreas] = useState<TreatmentArea[]>(Array.isArray(value.record.treatmentAreas) ? value.record.treatmentAreas as TreatmentArea[] : []);
  const [openedAt] = useState(() => Date.now());
  const current = value.versions.find(item => item.version === selectedVersion) ?? value.versions[0];
  const canEdit = openedAt < new Date(value.record.editableUntil).getTime();
  const minutesLeft = Math.max(0, Math.ceil((new Date(value.record.editableUntil).getTime() - openedAt) / 60000));

  async function saveRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await update({
      symptoms: symptoms.split(",").map(item => item.trim()).filter(Boolean),
      treatmentDetail: String(form.get("treatmentDetail") || ""),
      treatmentAreas: areas,
      aftercareNote: String(form.get("aftercareNote") || "") || undefined,
      changeReason: String(form.get("changeReason") || "") || undefined,
    });
  }

  async function saveAddendum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const note = String(data.get("note") || "").trim();
    if (!note) return;
    await addendum(note);
    form.reset();
  }

  return <div className="treatment-version-backdrop" onClick={close}><div className="treatment-version-dialog" onClick={event => event.stopPropagation()}>
    <header><div><p className="eyebrow">TREATMENT HISTORY</p><h2>ผลการรักษาและประวัติเวอร์ชัน</h2><span>{value.card.patient.name} · {value.card.appointmentNo}</span></div><button type="button" onClick={close}>×</button></header>
    <section className={`revision-policy ${canEdit ? "open" : "locked"}`}><b>{canEdit ? `แก้ไขได้อีก ${minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)} ชม. ${minutesLeft % 60} นาที` : `${minutesLeft} นาที`}` : "ครบกำหนดแก้ไขแล้ว"}</b><span>{canEdit ? `ทุกครั้งที่บันทึกจะสร้างเวอร์ชันใหม่ · หมดเวลา ${new Date(value.record.editableUntil).toLocaleString("th-TH")}` : "ข้อมูลผลรักษาถูกล็อกแล้ว สามารถเพิ่มหมายเหตุเพิ่มเติมได้เท่านั้น"}</span></section>
    <div className="treatment-version-layout">
      <aside><h3>เวอร์ชันทั้งหมด</h3>{value.versions.map(item => <button type="button" className={selectedVersion === item.version ? "active" : ""} key={item.version} onClick={() => setSelectedVersion(item.version)}><b>เวอร์ชัน {item.version}</b><span>{new Date(item.changedAt).toLocaleString("th-TH")}</span>{item.changeReason && <small>{item.changeReason}</small>}</button>)}</aside>
      <main>
        {current && <section className="version-preview"><div className="version-preview-head"><h3>เวอร์ชัน {current.version}</h3><span>{new Date(current.changedAt).toLocaleString("th-TH")}</span></div><dl><div><dt>อาการ / สภาวะ</dt><dd>{listValue(current.symptoms).join(", ") || "—"}</dd></div><div><dt>รายละเอียดการรักษา</dt><dd>{current.treatmentDetail}</dd></div><div><dt>ตำแหน่งที่รักษา</dt><dd>{Array.isArray(current.treatmentAreas) && current.treatmentAreas.length ? (current.treatmentAreas as TreatmentArea[]).map(area => <span key={`${area.type}:${area.part}`}><b>{area.partName}</b>{area.detail}</span>) : "—"}</dd></div><div><dt>คำแนะนำหลังรักษา</dt><dd>{current.aftercareNote || "—"}</dd></div></dl><div className="version-media"><h4>ภาพ Before / After</h4>{current.mediaSnapshot?.length ? <div className="version-media-groups">{(["BEFORE", "AFTER"] as TreatmentMediaType[]).map(type => <section key={type}><b>{type === "BEFORE" ? "ก่อนรักษา" : "หลังรักษา"}</b><div>{current.mediaSnapshot?.filter(item => item.type === type).map(item => item.downloadUrl ? <a href={item.downloadUrl} target="_blank" rel="noreferrer" key={item.id}><Image unoptimized width={180} height={180} src={item.downloadUrl} alt={item.caption || (type === "BEFORE" ? "ก่อนรักษา" : "หลังรักษา")} /></a> : <span key={item.id}>{item.originalName || "ไม่สามารถเปิดรูปได้"}</span>)}</div></section>)}</div> : <p className="muted">เวอร์ชันนี้ไม่มีภาพการรักษา</p>}</div></section>}
        {canEdit ? <form key={value.record.version} className="revision-form" onSubmit={saveRevision}><h3>แก้ไขผลการรักษาปัจจุบัน</h3><label>อาการ / สภาวะ<input value={symptoms} onChange={event => setSymptoms(event.target.value)} placeholder="คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค" /></label><label>รายละเอียดการรักษา<textarea name="treatmentDetail" required defaultValue={value.record.treatmentDetail} /></label><div className="revision-areas"><label>รายละเอียดตำแหน่งที่รักษา</label>{areas.map((area, index) => <div key={`${area.type}:${area.part}`}><b>{area.partName}</b><textarea required value={area.detail} onChange={event => setAreas(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, detail: event.target.value } : item))} /></div>)}</div><label>คำแนะนำหลังรักษา<textarea name="aftercareNote" defaultValue={value.record.aftercareNote ?? ""} /></label><label>เหตุผลที่แก้ไข<input name="changeReason" placeholder="เช่น แก้คำผิด หรือเพิ่มเติมรายละเอียดจากแพทย์" /></label><button className="primary-button" disabled={busy}>{busy ? "กำลังบันทึก…" : `บันทึกเป็นเวอร์ชัน ${value.record.version + 1}`}</button></form> : <form className="addendum-form" onSubmit={saveAddendum}><h3>เพิ่มหมายเหตุเพิ่มเติม</h3><p>หมายเหตุจะต่อท้ายเวชระเบียนและไม่เปลี่ยนข้อมูลในเวอร์ชันเดิม</p><textarea name="note" required maxLength={4000} placeholder="ระบุข้อมูลติดตามอาการหรือข้อมูลเพิ่มเติม…" /><button className="primary-button" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มหมายเหตุ"}</button></form>}
        <section className="addendum-list"><h3>หมายเหตุเพิ่มเติม</h3>{value.record.addenda?.length ? value.record.addenda.map(item => <article key={item.id}><p>{item.note}</p><small>{new Date(item.createdAt).toLocaleString("th-TH")}</small></article>) : <p className="muted">ยังไม่มีหมายเหตุเพิ่มเติม</p>}</section>
      </main>
    </div>
  </div></div>;
}

function PaymentDialog({ value, busy, setValue, close, saveDraft, confirm, save }: { value: CheckoutState; busy: boolean; setValue: React.Dispatch<React.SetStateAction<CheckoutState | null>>; close: () => void; saveDraft: () => void; confirm: () => void; save: (event: FormEvent) => void }) {
  const money = (amount: string | number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount));
  const recordMedications = Array.isArray(value.context?.treatmentRecord?.medications)
    ? value.context?.treatmentRecord?.medications as { name?: string; quantity?: number; unit?: string; kind?: string; source?: string; unitPrice?: number }[]
    : [];
  const includedMedications = recordMedications.filter(item => item.kind === "FORMULA");
  const saleLines = value.sale?.lines ?? [];
  const treatmentLines = saleLines.filter(line => line.source === "TREATMENT_ADD_ON");
  const matchingProducts = value.query.trim()
    ? value.catalog.filter(item => `${item.code} ${item.name}`.toLowerCase().includes(value.query.trim().toLowerCase())).slice(0, 8)
    : [];
  const checkoutItems = Object.entries(value.checkoutLines).flatMap(([itemId, quantity]) => {
    const catalogItem = value.catalog.find(item => item.id === itemId);
    const snapshot = saleLines.find(line => line.catalogItemId === itemId && line.source !== "TREATMENT_ADD_ON");
    return catalogItem || snapshot ? [{ itemId, quantity, catalogItem, snapshot }] : [];
  });
  const subtotal = value.sale?.subtotal ?? value.amount;
  const discount = value.sale?.discountAmount ?? "0";
  const taxableAmount = saleLines.reduce((sum, line) => sum + Number(line.taxableAmount ?? 0), 0);
  const nonTaxableAmount = saleLines.reduce((sum, line) => sum + Number(line.nonTaxableAmount ?? 0), 0);
  const taxAmount = value.sale?.taxAmount ?? saleLines.reduce((sum, line) => sum + Number(line.taxAmount ?? 0), 0);

  return <div className="checkout-page" onClick={close}><form className="checkout-workspace" onClick={event => event.stopPropagation()} onSubmit={save}>
    <header className="checkout-header"><button type="button" onClick={close}>←</button><div><h2>ตรวจสอบก่อนชำระเงิน</h2><p>ตรวจสอบสิทธิ์และรายการคิดเงินจากการรักษาก่อนดำเนินการ Checkout</p></div><span>{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span></header>
    <section className="checkout-patient"><span>{value.card.patient.name.slice(0,1)}</span><div><b>{value.card.patient.name}</b><small>HN: {value.card.patient.hn}</small><small>{value.card.appointmentNo} · {value.card.doctor.name} · {value.card.room.name}</small></div><em>รอชำระเงิน</em></section>
    <div className="checkout-grid">
      <main>
        <section className="checkout-card checkout-treatment-summary"><h3>สรุปผลการรักษาสำหรับ Checkout</h3><p>รายการที่ยืนยันว่าใช้จริง</p>{value.card.items.filter(item => item.usageStatus === "USED").length ? value.card.items.filter(item => item.usageStatus === "USED").map(item => <div key={item.id}><span><b>{item.name}</b><small>{item.type === "COURSE" ? "คอร์ส / สิทธิ์ของลูกค้า" : "บริการ"}</small></span><em>{item.settlementMode === "ENTITLEMENT" ? "ใช้สิทธิ์แล้ว" : item.settlementMode === "NO_CHARGE" ? "ไม่มีค่าใช้จ่าย" : "คิดเงิน"}</em></div>) : <div className="checkout-empty">ไม่มีรายการสิทธิ์ที่ใช้ในนัดนี้</div>}</section>
        <section className="checkout-card"><div className="checkout-section-head"><div><h3>ยา / เวชภัณฑ์ตามรายการรักษา</h3><p>รวมอยู่ในราคาบริการ ไม่คิดเงินเพิ่ม</p></div><span>฿0</span></div>{includedMedications.length ? includedMedications.map((item,index) => <div className="checkout-line" key={`${item.name}-${index}`}><span>{item.name || "รายการในสูตร"}</span><b>{item.quantity ?? 1} {item.unit || "ชิ้น"}</b></div>) : <div className="checkout-empty">ไม่มีเวชภัณฑ์ในสูตร</div>}</section>
        <section className="checkout-card"><div className="checkout-section-head"><div><h3>รายการ Add-on จากแพทย์</h3><p>{value.sale?.saleNo} · ล็อกจากผลการรักษา หากต้องแก้ให้กลับไปแก้เวชระเบียน</p></div><span className="checkout-locked">ล็อกแล้ว</span></div>{treatmentLines.length ? treatmentLines.map(line => <div className="checkout-charge-line" key={line.id}><span><b>{line.itemNameSnapshot}</b><small>{line.itemCodeSnapshot} · ×{line.quantity}</small><small>หัตถการ {money(line.nonTaxableAmount)} · สินค้าก่อน VAT {money(line.taxableAmount)} · VAT {money(line.taxAmount)}</small></span><em>{line.itemType === "PRODUCT" ? "สินค้า / ยา / เวชภัณฑ์" : line.itemType === "SERVICE" ? "บริการ" : "คอร์ส"}</em><strong>{money(line.netAmount)}</strong></div>) : <div className="checkout-empty">ไม่มี Add-on จากแพทย์</div>}</section>
        <section className="checkout-card checkout-addon-editor"><div className="checkout-section-head"><div><h3>สินค้าเพิ่มเติมหน้า Checkout</h3><p>พนักงานเพิ่มหรือลดสินค้าได้จนกว่าจะกด “ยืนยันยอดชำระ”</p></div>{value.dirty && <span className="checkout-unsaved">ยังไม่บันทึก</span>}</div>{value.sale?.status === "DRAFT" ? <><div className="checkout-product-search"><span>⌕</span><input value={value.query} onChange={event => setValue(current => current ? { ...current, query: event.target.value } : current)} placeholder="ค้นหาชื่อสินค้า หรือรหัสสินค้า…" /></div>{matchingProducts.length > 0 && <div className="checkout-product-results">{matchingProducts.map(item => <button type="button" key={item.id} disabled={(item.productDetail?.currentStock ?? 0) <= 0} onClick={() => setValue(current => current ? { ...current, query: "", dirty: true, checkoutLines: { ...current.checkoutLines, [item.id]: (current.checkoutLines[item.id] ?? 0) + 1 } } : current)}><span><b>{item.name}</b><small>{item.code} · stock {item.productDetail?.currentStock ?? 0} {item.productDetail?.unit || "ชิ้น"}</small></span><strong>{money(item.finalPrice)}</strong><em>{(item.productDetail?.currentStock ?? 0) > 0 ? "+ เพิ่ม" : "สินค้าหมด"}</em></button>)}</div>}<div className="checkout-added-lines">{checkoutItems.length ? checkoutItems.map(item => <div key={item.itemId}><span><b>{item.catalogItem?.name ?? item.snapshot?.itemNameSnapshot}</b><small>{item.catalogItem?.code ?? item.snapshot?.itemCodeSnapshot}</small></span><div><button type="button" onClick={() => setValue(current => current ? { ...current, dirty: true, checkoutLines: { ...current.checkoutLines, [item.itemId]: Math.max(0, (current.checkoutLines[item.itemId] ?? 0) - 1) } } : current)}>−</button><b>{item.quantity}</b><button type="button" onClick={() => setValue(current => current ? { ...current, dirty: true, checkoutLines: { ...current.checkoutLines, [item.itemId]: (current.checkoutLines[item.itemId] ?? 0) + 1 } } : current)}>+</button></div><strong>{money((Number(item.catalogItem?.finalPrice ?? item.snapshot?.netAmount ?? 0) / Math.max(1, Number(item.snapshot?.quantity ?? 1))) * item.quantity)}</strong></div>) : <div className="checkout-empty">ยังไม่มีสินค้าที่พนักงานเพิ่ม</div>}</div><button type="button" className="checkout-save-draft" disabled={busy || !value.dirty} onClick={saveDraft}>{busy ? "กำลังบันทึก…" : "บันทึกรายการใน Bill"}</button></> : <div className="checkout-confirmed-lines">ยืนยันยอดแล้ว ไม่สามารถแก้รายการได้</div>}</section>
      </main>
      <aside>
        <section className="checkout-card checkout-select-card"><label>ผู้ขาย / ผู้แนะนำ<select><option>{value.card.doctor.name}</option></select></label></section>
        <section className="checkout-card checkout-select-card"><label>โปรโมชัน<select disabled><option>ไม่มีโปรโมชันเพิ่มเติม</option></select></label></section>
        <section className="checkout-card checkout-totals"><h3>สรุปค่าใช้จ่าย</h3><div><span>ยอดก่อนส่วนลด</span><b>{money(subtotal)}</b></div><div><span>ส่วนลด</span><b className="discount">−{money(discount)}</b></div><div><span>ค่าหัตถการ (ไม่คิด VAT)</span><b>{money(nonTaxableAmount)}</b></div><div><span>สินค้า / ยา / เวชภัณฑ์ก่อน VAT</span><b>{money(taxableAmount)}</b></div><div><span>VAT 7%</span><b>{money(taxAmount)}</b></div><div className="checkout-grand"><span>ยอดสุทธิ</span><b>{money(value.amount)}</b></div></section>
        {value.sale?.status === "DRAFT" ? <><div className="checkout-draft-hint">ตรวจรายการและบันทึกการแก้ไขให้เรียบร้อย ก่อนยืนยันยอดเพื่อเปิดรับชำระ</div><button type="button" className="checkout-submit" disabled={busy} onClick={confirm}>{busy ? "กำลังยืนยันยอด…" : "ยืนยันยอดชำระ"}</button></> : <><section className="checkout-card checkout-payment-method"><label>ช่องทางชำระ<select value={value.method} onChange={event => setValue(current => current ? { ...current, method: event.target.value } : current)}><option value="QR">QR Payment</option><option value="CASH">เงินสด</option><option value="TRANSFER">โอนเงิน</option><option value="CREDIT_CARD">บัตรเครดิต</option></select></label><label>ยอดรับ<input type="number" min="0.01" step="0.01" required value={value.amount} onChange={event => setValue(current => current ? { ...current, amount: event.target.value } : current)} /></label></section><button className="checkout-submit" disabled={busy}>{busy ? "กำลังรับชำระ…" : "ดำเนินการ Checkout"}</button></>}
        <button type="button" className="checkout-cancel" onClick={close}>กลับไปหน้าคิว</button>
      </aside>
    </div>
  </form></div>;
}

function ReceiptDialog({ receipt, close }: { receipt: ReceiptData; close: () => void }) {
  const snapshot = receipt.snapshot;
  const patientName = snapshot.patient
    ? `${snapshot.patient.prefix ?? ""}${snapshot.patient.firstName ?? ""} ${snapshot.patient.lastName ?? ""}`.trim()
    : "ลูกค้าทั่วไป";
  const money = (amount: string | number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 }).format(Number(amount));
  const methodLabel = (method: string) => ({ CASH: "เงินสด", QR: "QR Payment", TRANSFER: "โอนเงิน", CREDIT_CARD: "บัตรเครดิต" } as Record<string, string>)[method] ?? method;

  return <div className="receipt-backdrop" onClick={close}><article className="receipt-sheet" onClick={event => event.stopPropagation()}>
    <header className="receipt-actions"><button type="button" onClick={close}>← กลับ</button><button type="button" className="primary-button" onClick={() => window.print()}>พิมพ์ใบเสร็จ</button></header>
    <section className="receipt-document">
      <header><div><p className="eyebrow">OFFICIAL RECEIPT</p><h2>ใบเสร็จรับเงิน</h2><b>{snapshot.clinic.name}</b><small>{snapshot.clinic.code}</small></div><div className="receipt-number"><small>เลขที่ใบเสร็จ</small><b>{receipt.receiptNo}</b><span>{new Date(receipt.issuedAt).toLocaleString("th-TH")}</span></div></header>
      <section className="receipt-parties"><div><small>ผู้รับบริการ</small><b>{patientName}</b><span>HN: {snapshot.patient?.hn ?? "—"}</span><span>โทร: {snapshot.patient?.phone ?? "—"}</span></div><div><small>อ้างอิงการขาย</small><b>{snapshot.sale.saleNo}</b><span>Appointment: {snapshot.sale.appointmentId ?? "—"}</span></div></section>
      <div className="receipt-table"><header><span>รายการ</span><span>จำนวน</span><span>ราคา/หน่วย</span><span>ส่วนลด</span><span>VAT</span><span>รวม</span></header>{snapshot.lines.map((line, index) => <div key={`${line.itemCodeSnapshot}-${index}`}><span><b>{line.itemNameSnapshot}</b><small>{line.itemCodeSnapshot}</small></span><span>{line.quantity}</span><span>{money(line.unitBasePriceSnapshot)}</span><span>{money(line.discountAmount)}</span><span>{money(line.taxAmount)}</span><strong>{money(line.netAmount)}</strong></div>)}</div>
      <section className="receipt-summary"><div><span>ยอดก่อนส่วนลด</span><b>{money(snapshot.sale.subtotal)}</b></div><div><span>ส่วนลด</span><b>−{money(snapshot.sale.discountAmount)}</b></div><div><span>VAT</span><b>{money(snapshot.sale.taxAmount)}</b></div><div className="receipt-total"><span>ยอดชำระสุทธิ</span><b>{money(snapshot.sale.paidAmount)}</b></div></section>
      <section className="receipt-payments"><h3>รายละเอียดการชำระ</h3>{snapshot.payments.map(payment => <div key={payment.paymentNo}><span>{payment.paymentNo} · {methodLabel(payment.method)}{payment.reference ? ` · ${payment.reference}` : ""}</span><b>{money(payment.amount)}</b></div>)}</section>
      <footer><p>ได้รับชำระเงินเรียบร้อยแล้ว</p><span>เอกสารนี้สร้างจากข้อมูล ณ เวลาที่ออกใบเสร็จ</span></footer>
    </section>
  </article></div>;
}

function UsageConfirmationDialog({ confirmation, close }: { confirmation: UsageConfirmationData; close: () => void }) {
  const snapshot = confirmation.snapshot;
  const patientName = `${snapshot.patient.prefix ?? ""}${snapshot.patient.firstName} ${snapshot.patient.lastName}`.trim();
  const doctorName = `${snapshot.appointment.doctor.prefix ?? ""}${snapshot.appointment.doctor.firstName} ${snapshot.appointment.doctor.lastName}`.trim();

  return <div className="receipt-backdrop" onClick={close}><article className="receipt-sheet" onClick={event => event.stopPropagation()}>
    <header className="receipt-actions"><button type="button" onClick={close}>← กลับ</button><button type="button" className="primary-button" onClick={() => window.print()}>พิมพ์ใบยืนยัน</button></header>
    <section className="receipt-document usage-document">
      <header><div><p className="eyebrow">ENTITLEMENT USAGE CONFIRMATION</p><h2>ใบยืนยันการใช้สิทธิ์</h2><b>{snapshot.clinic.name}</b><small>{snapshot.clinic.code}</small></div><div className="receipt-number"><small>เลขที่เอกสาร</small><b>{confirmation.confirmationNo}</b><span>{new Date(confirmation.issuedAt).toLocaleString("th-TH")}</span></div></header>
      <section className="receipt-parties"><div><small>ผู้รับบริการ</small><b>{patientName}</b><span>HN: {snapshot.patient.hn}</span><span>โทร: {snapshot.patient.phone || "—"}</span></div><div><small>ข้อมูลการรับบริการ</small><b>{snapshot.appointment.appointmentNo}</b><span>{new Date(snapshot.appointment.date).toLocaleDateString("th-TH")} · {snapshot.appointment.startTime}</span><span>{doctorName} · {snapshot.appointment.room.name}</span></div></section>
      <div className="usage-table"><header><span>สิทธิ์ที่ใช้</span><span>ครั้งนี้</span><span>ลำดับการใช้</span><span>คงเหลือ</span></header>{snapshot.usages.map(usage => <div key={usage.usageId}><span><b>{usage.name}</b><small>{usage.code}{usage.sourceReceiptNo ? ` · อ้างอิง ${usage.sourceReceiptNo}` : usage.sourceSaleNo ? ` · อ้างอิง ${usage.sourceSaleNo}` : ""}</small></span><span>{usage.unitsUsed} ครั้ง</span><strong>ครั้งที่ {usage.usageNumber}/{usage.totalUnits}</strong><span>{usage.remainingUnits} ครั้ง</span></div>)}</div>
      <section className="usage-zero-total"><span>ยอดที่ต้องชำระครั้งนี้</span><b>฿0.00</b><small>ใช้สิทธิ์ที่ชำระไว้แล้ว ไม่มีการรับเงินเพิ่มเติม</small></section>
      <footer><p>ยืนยันการใช้สิทธิ์เรียบร้อยแล้ว</p><span>เอกสารนี้ไม่ใช่ใบเสร็จรับเงินหรือใบกำกับภาษี</span></footer>
    </section>
  </article></div>;
}
