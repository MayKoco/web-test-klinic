"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";
import styles from "./undo-check-in-dialog.module.css";

type Visit = { appointmentId: string; appointmentNo: string; patient: { name: string } };

export default function UndoCheckInDialog({ card, token, close, completed, refresh, mode = "CHECK_IN" }: {
  mode?: "CHECK_IN" | "START";
  card: Visit; token: string; close: () => void;
  completed: () => Promise<void>; refresh: () => Promise<void>;
}) {
  const isStart = mode === "START";
  const title = isStart ? "ย้อนกลับรอรักษา" : "ย้อนกลับรอ Check-in";
  const titleId = isStart ? "undo-start-title" : "undo-check-in-title";
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || submitting.current || stale) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      await apiRequest(`/appointments/${card.appointmentId}/${isStart ? "undo-start" : "undo-check-in"}`, {
        method: "POST", token, body: JSON.stringify({ reason: reason.trim() }),
      });
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 409 || e.status === 404 || e.status === 403)) {
        setStale(true);
        setError(e.status === 403
          ? "คุณไม่มีสิทธิ์ย้อนสถานะของนัดนี้ กรุณาปิดหน้าต่างและตรวจสอบบัญชีที่เข้าสู่ระบบ"
          : isStart && e.code === "TREATMENT_NOT_ALLOWED"
            ? "มีการบันทึกผลการรักษาหรือการใช้สิทธิ์แล้ว ไม่สามารถย้อนเริ่มรักษาได้"
            : "สถานะคิวเปลี่ยนไปแล้ว กรุณาปิดหน้าต่างและตรวจสอบคิวล่าสุด");
        await refresh();
      } else setError(e instanceof Error ? e.message : "ย้อนกลับสถานะไม่สำเร็จ กรุณาลองใหม่");
      submitting.current = false; setBusy(false); return;
    }
    await completed();
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!submitting.current) close(); }}>
    <form className={`queue-dialog ${styles.form}`} onSubmit={submit}>
      <header><div><h2 id={titleId}>{title}</h2><p>{card.patient.name} · {card.appointmentNo}</p></div><button type="button" aria-label="ปิด" disabled={busy} onClick={close}>×</button></header>
      <p className={styles.context}>{isStart ? "เปลี่ยนจาก “กำลังรักษา” กลับเป็น “รอรักษา” เพื่อแก้การกดเริ่มผิด โดยคงเวลา Check-in และข้อมูลนัดเดิมไว้" : "เปลี่ยนจาก “รอรักษา” กลับเป็น “รอ Check-in” โดยคงวัน เวลา แพทย์ และห้องเดิมไว้"}</p>
      <label><span>เหตุผลที่ย้อนกลับ <span aria-hidden="true">*</span></span><textarea required maxLength={500} rows={3} value={reason} disabled={busy || stale} onChange={event => setReason(event.target.value)} placeholder={isStart ? "เช่น กดเริ่มรักษาผิดคิว ผู้รับบริการยังไม่เข้าห้อง" : "เช่น แพทย์หมดเวร ต้องปรับเวลานัดหมาย"} /></label>
      <small>{isStart ? "เฉพาะแพทย์ผู้รับผิดชอบนัดนี้ และยังไม่มีผลการรักษาหรือการยืนยันใช้สิทธิ์ · ระบบบันทึกเหตุผลและผู้ดำเนินการ" : "ระบบจะบันทึกเหตุผลและผู้ดำเนินการ · ใช้ได้เฉพาะคิวที่ยังไม่เริ่มรักษา"}</small>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <footer><button className="soft-button" type="button" disabled={busy} onClick={close}>{stale ? "ปิด" : "ยกเลิก"}</button><button className="primary-button" type="submit" disabled={busy || stale || !reason.trim()}>{busy ? "กำลังบันทึก…" : "ยืนยันย้อนกลับ"}</button></footer>
    </form>
  </dialog>;
}
