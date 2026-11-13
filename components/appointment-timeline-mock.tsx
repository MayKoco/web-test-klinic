"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiClientError, apiRequest } from "@/lib/api";
import {
  duration,
  minutes,
  overlaps,
  statusLabels,
  timeAt,
  patientName,
  mapTimeline,
  loadTimeline,
  validateBooking,
  type ApiTimeline,
  type BookingSuggestion,
  type PatientOption,
  type TimelineAppointment,
  type TimelineBlock,
  type TimelineRoom,
} from "@/lib/appointment-timeline";
import styles from "./appointment-timeline-mock.module.css";

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function displayDate(value: string) {
  if (!value) return "กำลังโหลดวันที่…";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value}T12:00:00Z`));
}
function position(start: string, end: string, scale: number, START: number) {
  return {
    left: ((minutes(start) - START) * scale) / 60,
    width: ((minutes(end) - minutes(start)) * scale) / 60,
  };
}
function arrange(appointments: TimelineAppointment[]) {
  const lanes: TimelineAppointment[][] = [];
  return [...appointments]
    .sort((a, b) => minutes(a.startTime) - minutes(b.startTime))
    .map((appointment) => {
      let lane = lanes.findIndex((items) =>
        items.every((item) => !overlaps(item, appointment)),
      );
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(appointment);
      return { appointment, lane };
    });
}

export default function AppointmentTimeline({
  initialDate = "",
}: {
  initialDate?: string;
}) {
  const [token, setToken] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [sessionState, setSessionState] = useState<
    "LOADING" | "READY" | "LOGIN" | "ERROR"
  >("LOADING");
  const [requestedDate, setRequestedDate] = useState(initialDate);
  const [timeline, setTimeline] = useState<ApiTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const loadSequence = useRef(0);
  const currentDate = useRef(requestedDate);

  function setDate(value: string) {
    if (mutation.current) return;
    currentDate.current = value;
    setRequestedDate(value);
    const url = new URL(window.location.href);
    url.searchParams.set("date", value);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    setLoadError("");
    setNotice("");
  }
  const date = requestedDate || timeline?.date || "";
  const mapped = useMemo(
    () =>
      timeline
        ? mapTimeline(timeline)
        : { rooms: [], doctors: [], appointments: [] },
    [timeline],
  );
  const { rooms, doctors, appointments } = mapped;
  const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  const canMutate = [
    "APPOINTMENT_VIEW",
    "APPOINTMENT_CREATE",
    "APPOINTMENT_UPDATE",
    "APPOINTMENT_CANCEL",
    "APPOINTMENT_ITEM_MANAGE",
  ].every((p) => permissions.includes(p));
  const canLookup = ["PATIENT_VIEW", "PATIENT_CREATE", "PATIENT_UPDATE"].every(
    (p) => permissions.includes(p),
  );
  const START =
    Math.floor(minutes(timeline?.displayRange.startTime ?? "09:00") / 60) * 60;
  const END =
    Math.ceil(minutes(timeline?.displayRange.endTime ?? "18:00") / 60) * 60;
  const hourCount = Math.max(1, (END - START) / 60);
  const hours = Array.from({ length: hourCount }, (_, i) =>
    timeAt(START + i * 60),
  );
  const place = (start: string, end: string, scale: number) =>
    position(start, end, scale, START);
  const [roomId, setRoomId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyBooked, setOnlyBooked] = useState(false);
  const [zoom, setZoom] = useState("160");
  const [fitScale, setFitScale] = useState(100);
  const scale = zoom === "fit" ? fitScale : Number(zoom);
  const [editing, setEditing] = useState<TimelineAppointment | null>(null);
  const [dialogMode, setDialogMode] = useState<
    "DETAIL" | "RESCHEDULE" | "CANCEL" | "REVIEW"
  >("DETAIL");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [patientPage, setPatientPage] = useState(1);
  const [patientPages, setPatientPages] = useState(1);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<{
    room: TimelineRoom;
    block: TimelineBlock;
  } | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [suggestion, setSuggestion] = useState<BookingSuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const autoEnd = useRef(true);
  const suggestionSequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);
  const exists = !!editing && !editing.isDraft;
  const editable = canMutate && editing?.status === "SCHEDULED";
  const newBooking = !!editing?.isDraft;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const saved = localStorage.getItem("klinic-test-token");
    void Promise.resolve().then(async () => {
      if (!saved) {
        if (active) setSessionState("LOGIN");
        return;
      }
      try {
        const result = await apiRequest<{ permissions: string[] }>(
          "/auth/me/permissions",
          { token: saved, signal: controller.signal },
        );
        if (!active) return;
        setPermissions(result.data.permissions);
        setToken(saved);
        setSessionState("READY");
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setSessionState(
          error instanceof ApiClientError && error.status === 401
            ? "LOGIN"
            : "ERROR",
        );
        setLoadError(
          error instanceof Error ? error.message : "ตรวจสอบ session ไม่สำเร็จ",
        );
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || currentDate.current !== requestedDate) return false;
      const sequence = ++loadSequence.current;
      setLoading(true);
      setLoadError("");
      try {
        const result = await loadTimeline(token, requestedDate, signal);
        if (
          signal?.aborted ||
          sequence !== loadSequence.current ||
          currentDate.current !== requestedDate
        )
          return false;
        setTimeline(result);
        setRoomId((current) =>
          !current || result.rooms.some((room) => room.roomId === current)
            ? current
            : "",
        );
        setDoctorId((current) =>
          !current ||
          result.rooms.some(
            (room) =>
              room.doctorShifts.some((shift) => shift.doctor.id === current) ||
              room.appointments.some(
                (appointment) => appointment.doctor.id === current,
              ),
          )
            ? current
            : "",
        );
        return true;
      } catch (error) {
        if (signal?.aborted || sequence !== loadSequence.current) return false;
        setLoadError(
          error instanceof Error ? error.message : "โหลดตารางนัดหมายไม่ได้",
        );
        if (error instanceof ApiClientError && error.status === 401)
          setSessionState("LOGIN");
        return false;
      } finally {
        if (sequence === loadSequence.current && !signal?.aborted)
          setLoading(false);
      }
    },
    [token, requestedDate, setRoomId, setDoctorId],
  );
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => refresh(controller.signal));
    return () => controller.abort();
  }, [token, refresh]);
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const measure = () => {
      const labelWidth = Number.parseFloat(
        getComputedStyle(element).getPropertyValue("--room-width"),
      );
      setFitScale(Math.max(48, (element.clientWidth - labelWidth) / hourCount));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [hourCount]);
  const dailyAppointments = appointments.filter(
    (a) => a.date === date && a.status !== "CANCELLED",
  );
  const matchingAppointments = dailyAppointments.filter(
    (a) =>
      (!doctorId || a.doctorId === doctorId) &&
      (!search.trim() ||
        `${a.patient} ${a.hn ?? ""} ${a.complaint}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const visibleRooms = rooms.filter(
    (room) =>
      (!roomId || room.id === roomId) &&
      (!doctorId ||
        room.shifts.some((s) => s.doctorId === doctorId) ||
        dailyAppointments.some(
          (a) => a.roomId === room.id && a.doctorId === doctorId,
        )) &&
      (!onlyBooked || matchingAppointments.some((a) => a.roomId === room.id)),
  );
  const staleDate = !!timeline && timeline.date !== date;

  useEffect(() => {
    if ((editing || selectedBlock) && !dialog.current?.open)
      dialog.current?.showModal();
  }, [editing, selectedBlock]);
  useEffect(() => {
    if (!token || !newBooking || !canLookup || dialogMode === "REVIEW") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPatientLoading(true);
      setPatientError("");
      const query = new URLSearchParams({
        search: patientQuery.trim(),
        page: String(patientPage),
        limit: "10",
      });
      void apiRequest<PatientOption[]>(`/patients?${query}`, {
        token,
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPatientResults(result.data);
          setPatientPages(Math.max(1, result.meta?.totalPages ?? 1));
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setPatientResults([]);
            setPatientError(
              error instanceof Error ? error.message : "ค้นหาคนไข้ไม่สำเร็จ",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPatientLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, newBooking, canLookup, patientQuery, patientPage, dialogMode]);
  const draftId = editing?.id,
    draftDate = editing?.date,
    draftRoom = editing?.roomId,
    draftDoctor = editing?.doctorId,
    draftStart = editing?.startTime,
    draftPatient = editing?.patientId;
  useEffect(() => {
    if (
      !newBooking ||
      !canMutate ||
      !token ||
      !draftDate ||
      !draftRoom ||
      !draftDoctor ||
      !draftStart
    )
      return;
    const controller = new AbortController();
    const sequence = ++suggestionSequence.current;
    const timer = setTimeout(() => {
      setSuggesting(true);
      setSuggestion(null);
      setSuggestionError("");
      const query = new URLSearchParams({
        date: draftDate,
        roomId: draftRoom,
        doctorId: draftDoctor,
        startTime: draftStart,
        ...(draftPatient ? { patientId: draftPatient } : {}),
      });
      void apiRequest<BookingSuggestion>(
        `/appointments/booking-suggestion?${query}`,
        { token, signal: controller.signal },
      )
        .then((result) => {
          if (
            controller.signal.aborted ||
            sequence !== suggestionSequence.current
          )
            return;
          setSuggestion(result.data);
          if (autoEnd.current)
            setEditing((value) =>
              value && value.id === draftId
                ? { ...value, endTime: result.data.endTime }
                : value,
            );
        })
        .catch((error) => {
          if (
            !controller.signal.aborted &&
            sequence === suggestionSequence.current
          )
            setSuggestionError(
              error instanceof Error ? error.message : "แนะนำเวลาไม่ได้",
            );
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            sequence === suggestionSequence.current
          )
            setSuggesting(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    token,
    newBooking,
    canMutate,
    draftId,
    draftDate,
    draftRoom,
    draftDoctor,
    draftStart,
    draftPatient,
  ]);

  function closeDialog(force = false) {
    if (mutation.current && !force) return;
    dialog.current?.close();
    setEditing(null);
    setSelectedBlock(null);
    setFormError("");
    setDialogMode("DETAIL");
    setCancelReason("");
    setSuggestion(null);
    setSuggestionError("");
  }
  function edit(appointment: TimelineAppointment) {
    setEditing({ ...appointment });
    setSelectedBlock(null);
    setFormError("");
    setDialogMode("DETAIL");
    setCancelReason("");
    setPatientQuery("");
    setPatientPage(1);
  }
  function create(
    room = rooms.find((room) =>
      room.shifts.some(
        (shift) =>
          (!doctorId || shift.doctorId === doctorId) &&
          shift.bookingIntervals.length > 0,
      ),
    ) ?? rooms[0],
    startTime?: string,
  ) {
    if (!room || !canMutate || !canLookup || loading || busy || staleDate)
      return;
    const intervals = room.shifts
      .filter((s) => !doctorId || s.doctorId === doctorId)
      .flatMap((s) =>
        s.bookingIntervals.map((range) => ({ ...range, doctorId: s.doctorId })),
      );
    const interval = startTime
      ? intervals.find((s) => s.startTime <= startTime && startTime < s.endTime)
      : intervals[0];
    if (!interval) {
      setNotice("ไม่มีช่วงเวลาที่แพทย์และห้องพร้อมรับนัดในเงื่อนไขนี้");
      return;
    }
    autoEnd.current = true;
    idCounter.current++;
    edit({
      id: `draft-${idCounter.current}`,
      isDraft: true,
      date,
      roomId: room.id,
      doctorId: interval.doctorId,
      patientId: "",
      patient: "",
      complaint: "",
      startTime: startTime ?? interval.startTime,
      endTime: startTime ?? interval.startTime,
      status: "SCHEDULED",
    });
    setSuggestion(null);
    setSuggestionError("");
    setSuggesting(true);
    setPatientResults([]);
    setPatientLoading(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editable || mutation.current) return;
    const error = validateBooking(editing, rooms, appointments);
    if (error) {
      setFormError(error);
      return;
    }
    if (!exists && (!editing.complaint.trim() || !canLookup)) {
      setFormError("กรุณาเลือกคนไข้และระบุรายการนัดหรืออาการเบื้องต้น");
      return;
    }
    if (!exists && (suggesting || suggestionError || !suggestion)) {
      setFormError(suggestionError || "กรุณารอระบบตรวจช่วงเวลาที่แนะนำ");
      return;
    }
    if (!exists && suggestion && editing.endTime > suggestion.endTime) {
      setFormError(
        `ช่วงเวลาว่างสิ้นสุด ${suggestion.endTime} กรุณาปรับเวลาสิ้นสุด`,
      );
      return;
    }
    if (!exists && dialogMode !== "REVIEW") {
      setFormError("");
      setDialogMode("REVIEW");
      return;
    }
    mutation.current = true;
    setBusy(true);
    setFormError("");
    try {
      const payload = {
        doctorId: editing.doctorId,
        roomId: editing.roomId,
        date: editing.date,
        startTime: editing.startTime,
        endTime: editing.endTime,
        ...(!exists
          ? {
              patientId: editing.patientId,
              chiefComplaint: editing.complaint.trim(),
            }
          : {}),
      };
      await apiRequest(
        exists
          ? `/appointments/${encodeURIComponent(editing.id)}`
          : "/appointments",
        {
          token,
          method: exists ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setNotice(
        `${exists ? "เลื่อนนัด" : "สร้างนัด"} ${editing.patient} · ${editing.startTime}–${editing.endTime} สำเร็จ`,
      );
      closeDialog(true);
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? `${error.code}: ${error.message}`
          : String(error),
      );
      if (error instanceof ApiClientError && error.status === 409)
        await refresh();
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function cancelAppointment(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editable || mutation.current) return;
    if (!cancelReason.trim()) {
      setFormError("กรุณาระบุเหตุผลยกเลิกนัดหมาย");
      return;
    }
    mutation.current = true;
    setBusy(true);
    setFormError("");
    try {
      await apiRequest(
        `/appointments/${encodeURIComponent(editing.id)}/cancel`,
        {
          token,
          method: "POST",
          body: JSON.stringify({ reason: cancelReason.trim() }),
        },
      );
      setNotice(`ยกเลิกนัด ${editing.patient} สำเร็จ`);
      closeDialog(true);
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? `${error.code}: ${error.message}`
          : String(error),
      );
      if (error instanceof ApiClientError && error.status === 409)
        await refresh();
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const bookingMinutes = editing ? duration(editing) : 0;
  const bookingDuration =
    !Number.isFinite(bookingMinutes) || bookingMinutes <= 0
      ? "กรุณาเลือกเวลาเริ่มก่อนเวลาสิ้นสุด"
      : [
          bookingMinutes >= 60
            ? `${Math.floor(bookingMinutes / 60)} ชั่วโมง`
            : "",
          bookingMinutes % 60 ? `${bookingMinutes % 60} นาที` : "",
        ]
          .filter(Boolean)
          .join(" ");
  function updateBooking(patch: Partial<TimelineAppointment>) {
    if (!editing || busy) return;
    if (
      patch.startTime !== undefined ||
      patch.roomId !== undefined ||
      patch.doctorId !== undefined ||
      patch.patientId !== undefined
    ) {
      autoEnd.current = true;
      setSuggestion(null);
      setSuggestionError("");
      setSuggesting(true);
    }
    setEditing({ ...editing, ...patch });
    setFormError("");
  }
  return (
    <main className={styles.page}>
      <nav className={styles.navigation} aria-label="เมนูหน้าทดสอบ">
        <Link href="/dashboard" className={styles.brand}>
          K<span>+</span> <b>Klinic</b>
        </Link>
        <div>
          <Link href="/appointments">นัดหมายเดิม</Link>
          <span>/</span>
          <b>Timeline นัดหมาย</b>
        </div>
        <span className={styles.mockBadge}>LIVE API · บันทึกเข้าระบบจริง</span>
      </nav>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>APPOINTMENT WORKSPACE</p>
          <h1>นัดหมาย</h1>
          <p className={styles.subtitle}>
            ทุกห้องตรวจ ทุกช่วงเวลา ในมุมมองเดียว
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondary}
            disabled={busy || loading || !token}
            onClick={() => void refresh()}
          >
            รีเฟรชตาราง
          </button>
          <button
            className={styles.primary}
            disabled={!canMutate || !canLookup || loading || busy || staleDate}
            onClick={() => create(rooms.find((room) => room.id === roomId))}
          >
            ＋ สร้างนัดหมาย
          </button>
        </div>
      </header>
      <section className={styles.summary} aria-label="ภาพรวมวันนัดหมาย">
        <div>
          <b>{dailyAppointments.length}</b>
          <span>นัดหมายในวันนี้</span>
        </div>
        <div>
          <b>{rooms.length}</b>
          <span>ห้องตรวจทั้งหมด</span>
        </div>
        <div>
          <b>
            {
              new Set(
                rooms.flatMap((room) =>
                  room.shifts
                    .filter(
                      (shift) =>
                        !room.blocks.some(
                          (block) =>
                            block.kind === "LEAVE" &&
                            block.doctorId === shift.doctorId &&
                            block.startTime <= shift.startTime &&
                            block.endTime >= shift.endTime,
                        ),
                    )
                    .map((shift) => shift.doctorId),
                ),
              ).size
            }
          </b>
          <span>แพทย์เข้าเวร</span>
        </div>
        <p>
          ข้อมูลจากคลินิกที่เข้าสู่ระบบ
          <br />
          <small>
            {canMutate
              ? "ยืนยันแล้วบันทึกผ่าน API จริง"
              : "ดูตารางตามสิทธิ์ของบัญชี"}
          </small>
        </p>
      </section>
      <section className={styles.toolbar} aria-label="ตัวกรองนัดหมาย">
        <div className={styles.dateControl}>
          <button
            aria-label="วันก่อนหน้า"
            disabled={busy || !date}
            onClick={() => {
              if (!mutation.current) setDate(shiftDate(date, -1));
            }}
          >
            ‹
          </button>
          <label>
            <span className={styles.srOnly}>วันที่นัดหมาย</span>
            <input
              type="date"
              value={date}
              onInput={(event) => {
                if (event.currentTarget.value && !mutation.current)
                  setDate(event.currentTarget.value);
              }}
            />
          </label>
          <button
            aria-label="วันถัดไป"
            disabled={busy || !date}
            onClick={() => {
              if (!mutation.current) setDate(shiftDate(date, 1));
            }}
          >
            ›
          </button>
        </div>
        <label className={styles.search}>
          <span className={styles.srOnly}>ค้นหาคนไข้หรือนัดหมาย</span>
          <input
            placeholder="ค้นหาชื่อคนไข้ / รหัส / รายการนัด"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className={styles.srOnly}>แพทย์</span>
          <select
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value)}
          >
            <option value="">แพทย์ทั้งหมด</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={styles.srOnly}>ห้องตรวจ</span>
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <option value="">ทุกห้องตรวจ</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className={styles.boardPanel}>
        <div className={styles.boardHeading}>
          <div>
            <h2>{displayDate(date)}</h2>
            <p>
              {timeAt(START)}–{timeAt(END)} <span>·</span>{" "}
              {timeline?.timezone ?? "—"}
            </p>
          </div>
          <div className={styles.boardOptions}>
            <label>
              <input
                type="checkbox"
                checked={onlyBooked}
                onChange={(event) => setOnlyBooked(event.target.checked)}
              />{" "}
              เฉพาะห้องที่มีนัด
            </label>
            <label>
              <span className={styles.srOnly}>ขนาดช่วงเวลา</span>
              <select
                value={zoom}
                onChange={(event) => setZoom(event.target.value)}
              >
                <option value="fit">พอดีหน้าจอ · ทั้งวัน</option>
                <option value={120}>มุมกว้าง</option>
                <option value={160}>ขนาดปกติ</option>
                <option value={220}>ขยายเวลา</option>
              </select>
            </label>
          </div>
        </div>
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {sessionState === "LOADING" && (
          <p role="status" className={styles.info}>
            กำลังตรวจสอบสิทธิ์เข้าสู่ระบบ…
          </p>
        )}
        {sessionState === "LOGIN" && (
          <p role="alert" className={styles.error}>
            กรุณา <Link href="/login">เข้าสู่ระบบคลินิก</Link> ก่อนใช้งาน
            Timeline
          </p>
        )}
        {loadError && sessionState !== "LOGIN" && (
          <p role="alert" className={styles.error}>
            {loadError} ·{" "}
            <button
              className={styles.secondary}
              onClick={() =>
                sessionState === "ERROR"
                  ? window.location.reload()
                  : void refresh()
              }
            >
              ลองอีกครั้ง
            </button>
          </p>
        )}
        {loading && (
          <p role="status" className={styles.info}>
            กำลังโหลดตารางนัดหมาย…
          </p>
        )}
        {canMutate && !canLookup && (
          <p className={styles.info}>
            บัญชีนี้ยังไม่มีสิทธิ์ค้นหาคนไข้ จึงยังสร้างนัดใหม่ไม่ได้
            กรุณาติดต่อผู้ดูแลสิทธิ์
          </p>
        )}
        {search && !matchingAppointments.length && (
          <p role="status" className={styles.info}>
            ไม่พบนัดที่ตรงกับคำค้น · ยังคงแสดงห้องและเวรแพทย์เพื่อให้เห็นบริบท
          </p>
        )}
        <div
          ref={board}
          className={styles.scroll}
          tabIndex={0}
          role="region"
          aria-label="ตารางนัดหมาย เลื่อนแนวนอนเพื่อดูครบทุกเวลา"
          style={{ "--hour-width": `${scale}px` } as React.CSSProperties}
        >
          <div
            className={styles.timeline}
            style={{
              width: `calc(var(--room-width) + ${hourCount * scale}px)`,
            }}
          >
            <div className={styles.timeHeader}>
              <div className={styles.corner}>
                <b>ห้องตรวจ / แพทย์</b>
                <span>{visibleRooms.length} ห้องที่แสดง</span>
              </div>
              <div className={styles.hours}>
                {hours.map((time) => (
                  <div key={time} style={{ width: scale }}>
                    <b>{time}</b>
                    <small>{time.slice(0, 2)}:30</small>
                  </div>
                ))}
              </div>
            </div>
            {visibleRooms.map((room) => {
              const roomAppointments = matchingAppointments.filter(
                (item) => item.roomId === room.id,
              );
              const laidOut = arrange(roomAppointments);
              const rowHeight = laidOut.length
                ? 42 + (Math.max(...laidOut.map((item) => item.lane)) + 1) * 94
                : 86;
              const shifts = room.shifts.filter(
                (shift) => !doctorId || shift.doctorId === doctorId,
              );
              const roomClosed = room.opening.length === 0;
              const leave = room.blocks.find(
                (block) =>
                  block.kind === "LEAVE" &&
                  shifts.every((shift) => shift.bookingIntervals.length === 0),
              );
              return (
                <div
                  className={styles.roomRow}
                  key={room.id}
                  style={{ height: rowHeight }}
                >
                  <div className={styles.roomLabel}>
                    <div>
                      <i
                        className={
                          roomClosed || leave ? styles.dotMuted : styles.dot
                        }
                      />
                      <b>{room.name}</b>
                    </div>
                    <span>{room.type}</span>
                    <p>
                      {roomClosed
                        ? "ไม่มีเวลาเปิดห้อง"
                        : leave
                          ? "แพทย์ลา · อนุมัติแล้ว"
                          : !shifts.length
                            ? "ไม่มีแพทย์ปฏิบัติงาน"
                            : `${room.opening[0]?.startTime}–${room.opening.at(-1)?.endTime}`}
                    </p>
                    <small>
                      {!leave && shifts.length
                        ? `${shifts.length} ช่วงเวร`
                        : ""}
                    </small>
                  </div>
                  <div
                    className={styles.track}
                    style={{ width: hourCount * scale }}
                  >
                    {shifts.map((shift, index) => {
                      const doctor = doctorById.get(shift.doctorId)!;
                      return (
                        <div
                          key={`${shift.doctorId}-${index}`}
                          className={`${styles.shift} ${styles[doctor.tone]}`}
                          style={place(shift.startTime, shift.endTime, scale)}
                          role={canMutate && canLookup ? "button" : undefined}
                          aria-disabled={
                            !canMutate ||
                            !canLookup ||
                            loading ||
                            busy ||
                            staleDate ||
                            !shift.bookingIntervals.length
                          }
                          tabIndex={
                            canMutate &&
                            canLookup &&
                            !loading &&
                            !busy &&
                            !staleDate &&
                            shift.bookingIntervals.length
                              ? 0
                              : -1
                          }
                          aria-label={`${canMutate && canLookup ? "สร้างนัดกับ" : "เวรแพทย์"} ${doctor.name} ${shift.startTime}–${shift.endTime} ${room.name}`}
                          onClick={(event) => {
                            const offset =
                              event.clientX -
                              event.currentTarget.getBoundingClientRect().left;
                            const minute = Math.max(
                              minutes(shift.startTime),
                              Math.min(
                                minutes(shift.endTime) - 5,
                                minutes(shift.startTime) +
                                  Math.round(((offset / scale) * 60) / 5) * 5,
                              ),
                            );
                            const tapped = timeAt(minute);
                            if (
                              shift.bookingIntervals.some(
                                (interval) =>
                                  interval.startTime <= tapped &&
                                  tapped < interval.endTime,
                              )
                            )
                              create(room, tapped);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              const first = shift.bookingIntervals[0];
                              if (first) create(room, first.startTime);
                            }
                          }}
                        >
                          <span>
                            {doctor.name}{" "}
                            <small>
                              {shift.startTime}–{shift.endTime}
                            </small>
                          </span>
                        </div>
                      );
                    })}
                    {room.blocks
                      .filter(
                        (block) =>
                          !doctorId ||
                          block.resource === "ROOM" ||
                          block.doctorId === doctorId,
                      )
                      .map((block) => (
                        <button
                          key={block.id}
                          title={`${block.reason} ${block.startTime}–${block.endTime}`}
                          className={`${styles.block} ${styles[block.kind.toLowerCase()]}`}
                          style={place(block.startTime, block.endTime, scale)}
                          onClick={() => {
                            setSelectedBlock({ room, block });
                            setEditing(null);
                          }}
                        >
                          <b>
                            {block.resource === "ROOM"
                              ? "ห้องไม่พร้อมใช้งาน"
                              : "แพทย์ไม่พร้อมปฏิบัติงาน"}
                          </b>
                          <small>
                            {block.startTime}–{block.endTime}
                          </small>
                          <span>{block.reason}</span>
                        </button>
                      ))}
                    {laidOut.map(({ appointment, lane }) => (
                      <button
                        key={appointment.id}
                        className={`${styles.appointment} ${styles[appointment.status.toLowerCase()]} ${(duration(appointment) * scale) / 60 < 85 ? styles.shortCard : ""}`}
                        style={{
                          ...place(
                            appointment.startTime,
                            appointment.endTime,
                            scale,
                          ),
                          // Visual gap only; preserve the exact booking start/end.
                          width: Math.max(1, (duration(appointment) * scale) / 60 - 4),
                          top: 34 + lane * 94,
                        }}
                        title={`${appointment.patient} · ${appointment.startTime}–${appointment.endTime} · ${appointment.complaint}`}
                        aria-label={`${appointment.patient} ${appointment.startTime}–${appointment.endTime} ${statusLabels[appointment.status]}`}
                        onClick={() => edit(appointment)}
                      >
                        <span className={styles.cardTop}>
                          <b>{appointment.patient}</b>
                          <i aria-hidden="true">↗</i>
                        </span>
                        <span className={styles.cardTime} title={`${appointment.startTime}–${appointment.endTime}`}>
                          {appointment.startTime}–{appointment.endTime}
                        </span>
                        <span className={styles.cardComplaint}>
                          {appointment.complaint}
                        </span>
                        <span className={styles.cardDoctor}>
                          {doctorById.get(appointment.doctorId)?.name}
                        </span>
                      </button>
                    ))}
                    {!shifts.length && !room.blocks.length && (
                      <span className={styles.emptyTrack}>
                        {roomClosed
                          ? "ไม่มีเวลาเปิดห้อง · ยังไม่เปิดรับนัด"
                          : "ไม่มีแพทย์ปฏิบัติงาน · ยังไม่เปิดรับนัด"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {!visibleRooms.length && (
              <p className={styles.empty}>ไม่พบห้องตามเงื่อนไขที่เลือก</p>
            )}
          </div>
        </div>
        <footer className={styles.legend}>
          <div>
            <span>
              <i className={styles.legendNavy} />
              นัดหมาย
            </span>
            <span>
              <i className={styles.legendAmber} />
              รอรักษา
            </span>
            <span>
              <i className={styles.legendBlue} />
              กำลังรักษา
            </span>
            <span>
              <i className={styles.legendPending} />
              รอบันทึกการรักษา
            </span>
            <span>
              <i className={styles.legendGray} />
              เสร็จสิ้น
            </span>
            <span>
              <i className={styles.legendStripe} />
              แพทย์ลา
            </span>
          </div>
          <p>
            แตะการ์ดเพื่อดูรายละเอียด ·
            แตะพื้นที่ว่างในกรอบเวรแพทย์เพื่อลงทะเบียนนัดหมาย
          </p>
        </footer>
      </section>
      <p className={styles.footnote}>
        ข้อมูลจาก API จริง · ตรวจสอบช่วงเวลาอีกครั้งเมื่อยืนยัน ·
        ตารางเวรและสิทธิ์เป็นไปตามข้อมูลของคลินิก
      </p>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="timeline-dialog-title"
        onCancel={(event) => {
          if (mutation.current) event.preventDefault();
          else closeDialog();
        }}
      >
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>CLINIC APPOINTMENT</p>
            <h2 id="timeline-dialog-title">
              {selectedBlock
                ? selectedBlock.block.reason
                : dialogMode === "CANCEL"
                  ? "ยกเลิกนัดหมาย"
                  : dialogMode === "RESCHEDULE"
                    ? "เลื่อนนัดหมาย"
                    : dialogMode === "REVIEW"
                      ? "ตรวจสอบนัดหมายก่อนยืนยัน"
                      : exists
                        ? "รายละเอียดนัดหมาย"
                        : "ลงทะเบียนนัดหมาย"}
            </h2>
          </div>
          <button
            disabled={busy}
            className={styles.close}
            onClick={() => closeDialog()}
            aria-label="ปิดหน้าต่าง"
          >
            ×
          </button>
        </div>
        {selectedBlock ? (
          <div className={styles.blockDetail}>
            <p>{selectedBlock.room.name}</p>
            <b>
              {selectedBlock.block.startTime}–{selectedBlock.block.endTime}
            </b>
            <p>
              มีผลต่อ
              {selectedBlock.block.resource === "ROOM" ? "ห้องตรวจ" : "แพทย์"}
              {selectedBlock.block.doctorId
                ? ` · ${doctorById.get(selectedBlock.block.doctorId)?.name}`
                : ""}
            </p>
            <p>ช่วงนี้ไม่สามารถสร้างนัดที่ทับกับทรัพยากรดังกล่าวได้</p>
          </div>
        ) : editing && exists && dialogMode === "CANCEL" ? (
          <form onSubmit={cancelAppointment} className={styles.form}>
            <p className={styles.formHint}>
              {editing.patient} · {displayDate(editing.date)} ·{" "}
              {editing.startTime}–{editing.endTime}
            </p>
            <label>
              เหตุผลยกเลิกนัดหมาย
              <input
                disabled={busy}
                autoFocus
                required
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="ระบุเหตุผลยกเลิก"
              />
            </label>
            {formError && (
              <p role="alert" className={styles.error}>
                {formError}
              </p>
            )}
            <div className={styles.formActions}>
              <button
                disabled={busy}
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setDialogMode("DETAIL");
                  setFormError("");
                }}
              >
                กลับ
              </button>
              <button disabled={busy} type="submit" className={styles.danger}>
                ยืนยันยกเลิกนัดหมาย
              </button>
            </div>
            <small className={styles.formDisclaimer}>
              ยืนยันแล้วจะยกเลิกนัดในระบบจริงพร้อมบันทึกเหตุผล
            </small>
          </form>
        ) : editing &&
          ((exists && dialogMode === "DETAIL") || dialogMode === "REVIEW") ? (
          <section className={styles.details} aria-label="ข้อมูลนัดหมาย">
            <div className={styles.detailPatient}>
              <span className={styles.detailAvatar} aria-hidden="true">
                {editing.patient.replace(/^คุณ/, "").slice(0, 1)}
              </span>
              <div>
                <h3>{editing.patient}</h3>
                <p>รหัสคนไข้ {editing.hn ?? editing.patientId}</p>
              </div>
              <span
                className={`${styles.detailStatus} ${styles[editing.status.toLowerCase()]}`}
              >
                {statusLabels[editing.status]}
              </span>
            </div>
            <div className={styles.detailTime}>
              <b>
                {editing.startTime}–{editing.endTime}
              </b>
              <span>{duration(editing)} นาที</span>
            </div>
            <dl className={styles.detailList}>
              <div>
                <dt>วันที่นัดหมาย</dt>
                <dd>{displayDate(editing.date)}</dd>
              </div>
              <div>
                <dt>ห้องตรวจ</dt>
                <dd>
                  {rooms.find((room) => room.id === editing.roomId)?.name ??
                    "—"}
                </dd>
              </div>
              <div>
                <dt>แพทย์</dt>
                <dd>{doctorById.get(editing.doctorId)?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>รายการนัด / อาการเบื้องต้น</dt>
                <dd>{editing.complaint || "ไม่ได้ระบุ"}</dd>
              </div>
            </dl>
            {formError && (
              <p role="alert" className={styles.error}>
                {formError}
              </p>
            )}
            {dialogMode === "REVIEW" ? (
              <form onSubmit={save}>
                <div className={styles.formActions}>
                  <button
                    disabled={busy}
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setDialogMode("DETAIL");
                      setFormError("");
                    }}
                  >
                    กลับไปแก้ไข
                  </button>
                  <button
                    disabled={busy}
                    type="submit"
                    className={styles.primary}
                  >
                    ยืนยันลงทะเบียนนัดหมาย
                  </button>
                </div>
                <small className={styles.formDisclaimer}>
                  ยังไม่บันทึกจนกว่าจะกดยืนยัน จากนั้นจะสร้างนัดในระบบจริง
                </small>
              </form>
            ) : (
              <>
                {!editable && (
                  <p className={styles.info}>
                    เลื่อนหรือยกเลิกจากหน้านี้ได้เมื่อมีสิทธิ์จัดการนัดหมายและสถานะเป็น
                    SCHEDULED
                  </p>
                )}
                <div className={styles.formActions}>
                  {editable && (
                    <>
                      <button
                        disabled={busy}
                        type="button"
                        className={styles.danger}
                        onClick={() => setDialogMode("CANCEL")}
                      >
                        ยกเลิกนัดหมาย
                      </button>
                      <button
                        disabled={busy}
                        type="button"
                        className={styles.primary}
                        onClick={() => setDialogMode("RESCHEDULE")}
                      >
                        เลื่อนนัดหมาย
                      </button>
                    </>
                  )}
                  <button
                    disabled={busy}
                    type="button"
                    className={styles.secondary}
                    onClick={() => closeDialog()}
                  >
                    ปิด
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          editing && (
            <form onSubmit={save} className={styles.form}>
              <p className={styles.formHint}>
                {displayDate(editing.date)} · {statusLabels[editing.status]}
                {exists && ` · ${duration(editing)} นาที`}
              </p>
              <fieldset disabled={!editable || busy}>
                {exists ? (
                  <p className={styles.formHint}>
                    {editing.patient} · รหัสคนไข้{" "}
                    {editing.hn ?? editing.patientId}
                  </p>
                ) : (
                  <>
                    <label>
                      ค้นหาคนไข้
                      <input
                        autoFocus
                        value={patientQuery}
                        onChange={(event) => {
                          setPatientQuery(event.target.value);
                          setPatientResults([]);
                          setPatientLoading(true);
                          setPatientPage(1);
                          updateBooking({
                            patientId: "",
                            patient: "",
                            hn: undefined,
                          });
                        }}
                        placeholder="ชื่อ เบอร์โทร หรือรหัสคนไข้"
                      />
                    </label>
                    <div
                      className={styles.patientResults}
                      aria-label="ผลค้นหาคนไข้"
                      aria-busy={patientLoading}
                    >
                      {patientLoading && <p role="status">กำลังค้นหาคนไข้…</p>}
                      {patientError && (
                        <p role="alert" className={styles.error}>
                          {patientError}
                        </p>
                      )}
                      {patientResults.map((patient) => (
                        <button
                          key={patient.id}
                          type="button"
                          aria-pressed={editing.patientId === patient.id}
                          onClick={() => {
                            updateBooking({
                              patientId: patient.id,
                              patient: patientName(patient),
                              hn: patient.hn,
                            });
                            setFormError("");
                          }}
                        >
                          <b>{patientName(patient)}</b>
                          <span>
                            {patient.hn} · {patient.phone}
                          </span>
                          {editing.patientId === patient.id && (
                            <small>เลือกแล้ว ✓</small>
                          )}
                        </button>
                      ))}
                      {!patientLoading &&
                        !patientError &&
                        !patientResults.length && (
                          <p role="status">
                            ไม่พบคนไข้ ลองค้นหาด้วยชื่อ เบอร์โทร
                            หรือรหัสคนไข้อื่น
                          </p>
                        )}
                    </div>
                    {patientPages > 1 && (
                      <div className={styles.formActions}>
                        <button
                          type="button"
                          disabled={patientLoading || patientPage <= 1}
                          className={styles.secondary}
                          onClick={() => {
                            setPatientLoading(true);
                            setPatientResults([]);
                            setPatientPage((page) => page - 1);
                          }}
                        >
                          ก่อนหน้า
                        </button>
                        <span>
                          หน้า {patientPage} / {patientPages}
                        </span>
                        <button
                          type="button"
                          disabled={
                            patientLoading || patientPage >= patientPages
                          }
                          className={styles.secondary}
                          onClick={() => {
                            setPatientLoading(true);
                            setPatientResults([]);
                            setPatientPage((page) => page + 1);
                          }}
                        >
                          ถัดไป
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className={styles.formGrid}>
                  <label>
                    ห้องตรวจ
                    <select
                      value={editing.roomId}
                      onChange={(event) =>
                        updateBooking({ roomId: event.target.value })
                      }
                    >
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    แพทย์
                    <select
                      value={editing.doctorId}
                      onChange={(event) =>
                        updateBooking({ doctorId: event.target.value })
                      }
                    >
                      {doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    เวลาเริ่ม
                    <input
                      type="time"
                      step={60}
                      required
                      value={editing.startTime}
                      onInput={(event) =>
                        updateBooking({
                          startTime: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    เวลาสิ้นสุด
                    <input
                      type={editing.endTime === "24:00" ? "text" : "time"}
                      step={60}
                      required
                      value={editing.endTime}
                      onInput={(event) => {
                        autoEnd.current = false;
                        setEditing({
                          ...editing,
                          endTime: event.currentTarget.value,
                        });
                        setFormError("");
                      }}
                    />
                  </label>
                </div>
                <p
                  className={styles.bookingDuration}
                  role="status"
                  aria-live="polite"
                >
                  ระยะเวลานัดหมาย: <strong>{bookingDuration}</strong>
                </p>
                {!exists && (
                  <p className={styles.formHint} role="status">
                    {suggesting
                      ? "กำลังตรวจเวลาว่างจาก API…"
                      : suggestionError ||
                        (suggestion
                          ? `เวลาว่างที่แนะนำ ${suggestion.startTime}–${suggestion.endTime} · ปรับเวลาสิ้นสุดให้สั้นลงได้`
                          : "เลือกแพทย์ ห้อง และเวลาเริ่มเพื่อแนะนำเวลาสิ้นสุด")}
                  </p>
                )}
                {exists ? (
                  <p className={styles.formHint}>
                    รายการนัด: {editing.complaint || "ไม่ได้ระบุ"}
                  </p>
                ) : (
                  <label>
                    รายการนัด / อาการเบื้องต้น
                    <input
                      value={editing.complaint}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          complaint: event.target.value,
                        })
                      }
                    />
                  </label>
                )}
              </fieldset>
              {!editable && (
                <p className={styles.info}>
                  เลื่อนหรือยกเลิกจากหน้านี้ได้เมื่อมีสิทธิ์จัดการนัดหมายและสถานะเป็น
                  SCHEDULED
                </p>
              )}
              {formError && (
                <p role="alert" className={styles.error}>
                  {formError}
                </p>
              )}
              <div className={styles.formActions}>
                <button
                  disabled={busy}
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    if (exists) {
                      setEditing({
                        ...(appointments.find(
                          (item) => item.id === editing.id,
                        ) ?? editing),
                      });
                      setDialogMode("DETAIL");
                      setFormError("");
                    } else closeDialog();
                  }}
                >
                  {exists ? "กลับ" : "ปิด"}
                </button>
                {editable && (
                  <button
                    disabled={busy}
                    type="submit"
                    className={styles.primary}
                  >
                    {exists ? "บันทึกการเลื่อนนัด" : "ตรวจสอบนัดหมาย"}
                  </button>
                )}
              </div>
              <small className={styles.formDisclaimer}>
                ระบบจะตรวจช่วงเวลาและสิทธิ์ซ้ำเมื่อกดยืนยัน
              </small>
            </form>
          )
        )}
      </dialog>
    </main>
  );
}
