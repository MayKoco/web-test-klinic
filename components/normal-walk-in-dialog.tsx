"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import styles from "./normal-walk-in-dialog.module.css";

type Doctor = { id: string; prefix?: string | null; firstName: string; lastName: string };
type Patient = { id: string; hn: string; prefix?: string; firstName: string; lastName: string; phone: string };
type Slot = { date: string; doctorId: string; doctorName: string; roomId: string; roomName: string; startTime: string; endTime: string; durationMinutes: number };
type Availability = { date: string; timezone: string; earliestStartTime: string; slot: Slot | null; suggestions?: Slot[] };
const message = (error: unknown) => error instanceof Error ? error.message : "เรียก API ไม่สำเร็จ";

export default function NormalWalkInDialog({ token, close, completed }: {
  token: string; close: () => void; completed: (date: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [doctorError, setDoctorError] = useState("");
  const [duration, setDuration] = useState("30");
  const [complaint, setComplaint] = useState("");
  const [suggestedDoctorId, setSuggestedDoctorId] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  const validDuration = Number.isInteger(Number(duration)) && Number(duration) >= 1 && Number(duration) <= 720;

  const suggestions = availability?.suggestions ?? (availability?.slot ? [availability.slot] : []);
  const selectedSlot = suggestions.find(slot => slot.doctorId === suggestedDoctorId) ?? suggestions[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const all: Doctor[] = [];
        for (let page = 1; ; page++) {
          const result = await apiRequest<Doctor[]>(`/doctors?status=ACTIVE&limit=100&sortBy=firstName&sortOrder=asc&page=${page}`, { token, signal: controller.signal });
          all.push(...result.data);
          if (!result.meta || page >= result.meta.totalPages) break;
        }
        if (!controller.signal.aborted) setDoctors(all);
      } catch (e) {
        if (!controller.signal.aborted) setDoctorError(`โหลดรายชื่อแพทย์ไม่สำเร็จ: ${message(e)} สามารถใช้การเลือกแพทย์อัตโนมัติได้`);
      } finally { if (!controller.signal.aborted) setDoctorLoading(false); }
    })();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setSearchError(""); setPatients([]);
      try {
        const result = await apiRequest<Patient[]>(`/patients?${new URLSearchParams({ search: query, page: String(page), limit: "10" })}`, { token, signal: controller.signal });
        if (!controller.signal.aborted) { setPatients(result.data); setPages(result.meta?.totalPages ?? 1); }
      } catch (e) { if (!controller.signal.aborted) setSearchError(message(e)); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page, token]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAvailability(null); setError("");
      if (!patient || !validDuration) { setChecking(false); return; }
      setChecking(true);
      try {
        const params = new URLSearchParams({ patientId: patient.id, durationMinutes: duration });
        if (doctorId) params.set("doctorId", doctorId);
        const result = await apiRequest<Availability>(`/appointments/walk-in-slot?${params}`, { token, signal: controller.signal });
        if (!controller.signal.aborted) { setAvailability(result.data); setSuggestedDoctorId(result.data.slot?.doctorId ?? ""); }
      } catch (e) { if (!controller.signal.aborted) setError(message(e)); }
      finally { if (!controller.signal.aborted) setChecking(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [patient, duration, validDuration, doctorId, token, refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const slot = selectedSlot;
    if (!slot || !patient || !validDuration || (doctorId && slot.doctorId !== doctorId) || checking || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      await apiRequest("/appointments/walk-ins", { method: "POST", token, body: JSON.stringify({ patientId: patient.id, doctorId: slot.doctorId, roomId: slot.roomId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, chiefComplaint: complaint.trim() || undefined }) });
    } catch (e) {
      setError(`${message(e)} — กดค้นหาเวลาใหม่เพื่อตรวจสอบอีกครั้ง`); setAvailability(null);
      submitting.current = false; setBusy(false); return;
    }
    await completed(slot.date);
  }

  return <div className="drawer-backdrop checkin-backdrop" role="presentation" style={{ zIndex: 100 }}>
    <form className="queue-dialog urgent-walkin-dialog" role="dialog" aria-modal="true" aria-labelledby="normal-walkin-title" onSubmit={submit}>
      <header className="queue-dialog-header"><div><h2 id="normal-walkin-title">Walk-in ปกติ</h2><p>ค้นหาเวลาว่างเร็วที่สุดวันนี้ ตามเวลาของคลินิก</p></div><button type="button" className="soft-button" disabled={busy} onClick={close} aria-label="ปิด">×</button></header>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className={`urgent-form-grid ${styles.fields}`}>
          <label className="urgent-patient-picker"><span>ค้นหาผู้รับบริการ</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); setPatient(null); setAvailability(null); setSearching(true); }} placeholder="ชื่อ, HN หรือเบอร์โทร" /></label>
          <label><span>แพทย์ (ไม่บังคับ)</span><select value={doctorId} disabled={doctorLoading} onChange={event => { setDoctorId(event.target.value); setAvailability(null); setError(""); }}><option value="">ไม่ระบุแพทย์ · เลือกเวลาว่างเร็วที่สุด</option>{doctors.map(doctor => <option key={doctor.id} value={doctor.id}>{doctor.prefix}{doctor.firstName} {doctor.lastName}</option>)}</select><small>{doctorLoading ? "กำลังโหลดรายชื่อแพทย์…" : "หากระบุแพทย์ จะค้นหาเฉพาะเวลาว่างของแพทย์คนนั้น"}</small></label>
          <label><span>ระยะเวลาใช้บริการ (นาที)</span><input type="number" required min="1" max="720" step="1" value={duration} onChange={event => { setDuration(event.target.value); setAvailability(null); }} /></label>
        </section>
        {doctorError && <p role="alert">{doctorError}</p>}
        <section aria-label="ผลค้นหาคนไข้" style={{ maxHeight: 200, overflowY: "auto", display: "grid", gap: 8, margin: "16px 0" }}>
          {searching ? <p>กำลังค้นหา…</p> : searchError ? <p role="alert">{searchError}</p> : patients.length === 0 ? <p>ไม่พบผู้รับบริการ</p> : patients.map(item => <button className={styles.patient} aria-pressed={patient?.id === item.id} type="button" key={item.id} onClick={() => { setPatient(item); setAvailability(null); }}>{item.hn} · {item.prefix}{item.firstName} {item.lastName} · {item.phone}</button>)}
        </section>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="soft-button" type="button" disabled={page <= 1 || searching} onClick={() => { setPage(page - 1); setSearching(true); }}>ก่อนหน้า</button><span>หน้า {page} / {Math.max(1, pages)}</span><button className="soft-button" type="button" disabled={page >= pages || searching} onClick={() => { setPage(page + 1); setSearching(true); }}>ถัดไป</button></div>
        {patient && <p>ผู้รับบริการ: <strong>{patient.prefix}{patient.firstName} {patient.lastName}</strong></p>}
        <section className="urgent-availability" aria-live="polite">
          {checking ? <p>กำลังค้นหาเวลาว่าง…</p> : selectedSlot ? <>
            <p><strong>{doctorId ? "เวลาว่างของแพทย์ที่เลือก" : `แพทย์ที่แนะนำ ${suggestions.length} คน`}</strong><br /><small>เลือกแพทย์เพื่อจองเวลาเข้าใช้บริการ · เรียงตามเวลาว่างเร็วที่สุด</small></p>
            <div role="radiogroup" aria-label="แพทย์ที่แนะนำ" style={{ display: "grid", gap: 10, maxHeight: 280, overflowY: "auto" }}>
              {suggestions.map((slot, index) => <label key={slot.doctorId} className={`urgent-state ${selectedSlot.doctorId === slot.doctorId ? "ready" : "neutral"}`} style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "flex-start", cursor: "pointer", margin: 0 }}>
                <input type="radio" name="walkin-suggested-doctor" checked={selectedSlot.doctorId === slot.doctorId} onChange={() => setSuggestedDoctorId(slot.doctorId)} aria-label={`${slot.doctorName} ${slot.startTime}–${slot.endTime}`} style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
                <span style={{ display: "grid", gap: 6 }}><b>{slot.doctorName}{index === 0 && !doctorId ? " · เร็วที่สุด" : ""}</b><span>{slot.startTime}–{slot.endTime} · {slot.durationMinutes} นาที</span><span>{slot.roomName}</span></span>
              </label>)}
            </div>
            <p>{availability?.date} · {availability?.timezone}</p><small>ยังไม่ได้จองเวลา ระบบจะตรวจสอบซ้ำเมื่อยืนยัน</small>
          </> : availability ? <div className="urgent-state blocked">{doctorId ? "แพทย์ที่เลือกไม่มีช่วงว่างวันนี้ที่รองรับระยะเวลานี้ ลองเลือกแพทย์อื่นหรือไม่ระบุแพทย์" : "วันนี้ไม่มีช่วงว่างที่รองรับระยะเวลานี้ ลองลดระยะเวลาหรือลงนัดวันอื่น"}</div> : <p>เลือกผู้รับบริการและระยะเวลาเพื่อค้นหาเวลาเข้าใช้บริการ</p>}
        </section>
        <label style={{ display: "grid", gap: 8, marginTop: 16 }}><span>อาการเบื้องต้น / หมายเหตุ</span><textarea value={complaint} onChange={event => setComplaint(event.target.value)} rows={2} /></label>
        {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
        <p>ยืนยันแล้วจะอยู่ใน “รอ Check-in” ตามเวลานัดที่เลือก</p>
        <footer className="queue-dialog-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button type="button" className="soft-button" onClick={close}>ยกเลิก</button><button type="button" className="soft-button" disabled={!patient || !validDuration || checking} onClick={() => { setAvailability(null); setRefresh(value => value + 1); }}>ค้นหาเวลาใหม่</button><button className="primary-button" type="submit" disabled={!selectedSlot || !patient || !validDuration || checking}>{busy ? "กำลังจอง…" : "ยืนยัน Walk-in"}</button></footer>
      </fieldset>
    </form>
  </div>;
}
