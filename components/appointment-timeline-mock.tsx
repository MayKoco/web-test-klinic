"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MOCK_DATE,
  duration,
  extraMockRooms,
  initialMockAppointments,
  minutes,
  mockDoctors,
  mockPatients,
  mockRooms,
  overlaps,
  statusLabels,
  suggestMockEndTime,
  validateMockAppointment,
  type MockAppointment,
  type MockBlock,
  type MockRoom,
} from "@/lib/appointment-timeline-mock";
import styles from "./appointment-timeline-mock.module.css";

const START = 9 * 60;
const hours = Array.from(
  { length: 9 },
  (_, index) => `${String(index + 9).padStart(2, "0")}:00`,
);
const doctorById = new Map(mockDoctors.map((doctor) => [doctor.id, doctor]));
function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function displayDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value}T12:00:00Z`));
}
function place(start: string, end: string, scale: number) {
  return {
    left: ((minutes(start) - START) * scale) / 60,
    width: ((minutes(end) - minutes(start)) * scale) / 60,
  };
}
function arrange(appointments: MockAppointment[]) {
  const lanes: MockAppointment[][] = [];
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

export default function AppointmentTimelineMock() {
  const [date, setDate] = useState(MOCK_DATE);
  const [appointments, setAppointments] = useState(initialMockAppointments);
  const [roomId, setRoomId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyBooked, setOnlyBooked] = useState(false);
  const [manyRooms, setManyRooms] = useState(false);
  const [zoom, setZoom] = useState("160");
  const [fitScale, setFitScale] = useState(100);
  const scale = zoom === "fit" ? fitScale : Number(zoom);
  const [editing, setEditing] = useState<MockAppointment | null>(null);
  const [dialogMode, setDialogMode] = useState<"DETAIL" | "RESCHEDULE" | "CANCEL" | "REVIEW">("DETAIL");
  const [patientQuery, setPatientQuery] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<{
    room: MockRoom;
    block: MockBlock;
  } | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const measure = () => {
      const labelWidth = Number.parseFloat(getComputedStyle(element).getPropertyValue("--room-width"));
      // Used only when the user explicitly chooses the full-day overview.
      setFitScale(Math.max(48, (element.clientWidth - labelWidth) / 9));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const rooms = useMemo(
    () =>
      (manyRooms ? [...mockRooms, ...extraMockRooms] : mockRooms).map((room) =>
        date === MOCK_DATE ? room : { ...room, shifts: [], blocks: [] },
      ),
    [manyRooms, date],
  );
  const dailyAppointments = appointments.filter(
    (appointment) =>
      appointment.date === date && appointment.status !== "CANCELLED",
  );
  const matchingAppointments = dailyAppointments.filter(
    (appointment) =>
      (!doctorId || appointment.doctorId === doctorId) &&
      (!search.trim() ||
        `${appointment.patient} ${appointment.patientId} ${appointment.complaint}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const visibleRooms = rooms.filter(
    (room) =>
      (!roomId || room.id === roomId) &&
      (!doctorId || room.shifts.some((shift) => shift.doctorId === doctorId)) &&
      (!onlyBooked ||
        matchingAppointments.some(
          (appointment) => appointment.roomId === room.id,
        )),
  );

  useEffect(() => {
    if ((editing || selectedBlock) && !dialog.current?.open)
      dialog.current?.showModal();
  }, [editing, selectedBlock]);
  function closeDialog() {
    dialog.current?.close();
    setEditing(null);
    setSelectedBlock(null);
    setFormError("");
    setDialogMode("DETAIL");
    setCancelReason("");
  }
  function edit(appointment: MockAppointment) {
    setEditing({ ...appointment });
    setSelectedBlock(null);
    setFormError("");
    setDialogMode("DETAIL");
    setCancelReason("");
    setPatientQuery("");
  }
  function create(room = rooms[0], startTime = "09:00") {
    if (!room) return;
    const start = minutes(startTime);
    const shift = room.shifts.find(
      (shift) =>
        minutes(shift.startTime) <= start && minutes(shift.endTime) > start,
    );
    const selectedDoctor = shift?.doctorId ?? mockDoctors[0].id;
    idCounter.current += 1;
    edit({
      id: `local-${idCounter.current}`,
      date,
      roomId: room.id,
      doctorId: selectedDoctor,
      patientId: "",
      patient: "",
      complaint: "",
      startTime,
      endTime: suggestMockEndTime(startTime, room, selectedDoctor, date, appointments),
      status: "SCHEDULED",
    });
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || editing.status !== "SCHEDULED") return;
    const error = validateMockAppointment(editing, rooms, appointments);
    if (error) {
      setFormError(error);
      return;
    }
    if (!exists && !mockPatients.some((patient) => patient.id === editing.patientId)) {
      setFormError("กรุณาค้นหาและเลือกคนไข้จากรายการ");
      return;
    }
    if (!exists && !editing.complaint.trim()) {
      setFormError("กรุณาระบุรายการนัดหรืออาการเบื้องต้น");
      return;
    }
    if (!exists && dialogMode !== "REVIEW") {
      setFormError("");
      setDialogMode("REVIEW");
      return;
    }
    setAppointments((items) => exists
      ? items.map((item) => item.id === editing.id ? editing : item)
      : [...items, editing]);
    setNotice(
      `${exists ? "เลื่อนนัด" : "สร้างนัด"} ${editing.patient} · ${editing.startTime}–${editing.endTime} แล้ว (เฉพาะ Mock)`,
    );
    closeDialog();
  }
  function cancelAppointment(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || editing.status !== "SCHEDULED") return;
    if (!cancelReason.trim()) {
      setFormError("กรุณาระบุเหตุผลยกเลิกนัดหมาย");
      return;
    }
    setAppointments((items) => items.map((item) => item.id === editing.id
      ? { ...item, status: "CANCELLED", cancellationReason: cancelReason.trim() }
      : item));
    setNotice(`ยกเลิกนัด ${editing.patient} · เหตุผล: ${cancelReason.trim()} (เฉพาะ Mock)`);
    closeDialog();
  }
  const exists =
    !!editing && appointments.some((item) => item.id === editing.id);
  const editable = editing?.status === "SCHEDULED";
  const bookingMinutes = editing ? duration(editing) : 0;
  const bookingDuration = !Number.isFinite(bookingMinutes) || bookingMinutes <= 0
    ? "กรุณาเลือกเวลาเริ่มก่อนเวลาสิ้นสุด"
    : [
      bookingMinutes >= 60 ? `${Math.floor(bookingMinutes / 60)} ชั่วโมง` : "",
      bookingMinutes % 60 ? `${bookingMinutes % 60} นาที` : "",
    ].filter(Boolean).join(" ");
  function updateBooking(patch: Partial<MockAppointment>) {
    if (!editing) return;
    const next = { ...editing, ...patch };
    const room = rooms.find((item) => item.id === next.roomId);
    if (!exists && room) next.endTime = suggestMockEndTime(next.startTime, room, next.doctorId, next.date, appointments);
    setEditing(next);
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
          <b>Timeline design</b>
        </div>
        <span className={styles.mockBadge}>MOCK · ไม่บันทึกเข้าระบบ</span>
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
            onClick={() => {
              setAppointments(initialMockAppointments);
              setDate(MOCK_DATE);
              setSearch("");
              setDoctorId("");
              setRoomId("");
              setOnlyBooked(false);
              setManyRooms(false);
              setZoom("160");
              setNotice("คืนข้อมูลตัวอย่างเริ่มต้นแล้ว");
            }}
          >
            รีเซ็ตตัวอย่าง
          </button>
          <button
            className={styles.primary}
            onClick={() =>
              create(rooms.find((room) => room.id === roomId) ?? rooms[0])
            }
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
          ข้อมูลจำลองวันที่ 10 พ.ย. 2569
          <br />
          <small>ลองสร้างนัด เลื่อนเวลา หรือทดสอบเวลาชนได้</small>
        </p>
      </section>
      <section className={styles.toolbar} aria-label="ตัวกรองนัดหมาย">
        <div className={styles.dateControl}>
          <button
            aria-label="วันก่อนหน้า"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            ‹
          </button>
          <label>
            <span className={styles.srOnly}>วันที่นัดหมาย</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
            />
          </label>
          <button
            aria-label="วันถัดไป"
            onClick={() => setDate(shiftDate(date, 1))}
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
            {mockDoctors.map((doctor) => (
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
              09:00–18:00 <span>·</span> Asia/Bangkok
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
              <input
                type="checkbox"
                checked={manyRooms}
                onChange={(event) => {
                  setManyRooms(event.target.checked);
                  setRoomId("");
                }}
              />{" "}
              ทดสอบ 12 ห้อง
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
        {date !== MOCK_DATE && (
          <p className={styles.info}>
            วันนี้ไม่มีเวรและนัดหมายตัวอย่าง · เลือกวันที่ 10 พ.ย. 2569
            เพื่อทดลอง flow
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
            style={{ width: `calc(var(--room-width) + ${9 * scale}px)` }}
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
              const leave = room.blocks.find((block) => block.kind === "LEAVE");
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
                    style={{ width: 9 * scale }}
                  >
                    {shifts.map((shift, index) => {
                      const doctor = doctorById.get(shift.doctorId)!;
                      return (
                        <div
                          key={`${shift.doctorId}-${index}`}
                          className={`${styles.shift} ${styles[doctor.tone]}`}
                          style={place(shift.startTime, shift.endTime, scale)}
                          role="button"
                          tabIndex={0}
                          aria-label={`สร้างนัดกับ ${doctor.name} ${shift.startTime}–${shift.endTime} ${room.name}`}
                          onClick={(event) => {
                            const offset = event.clientX - event.currentTarget.getBoundingClientRect().left;
                            const minute = Math.max(
                              minutes(shift.startTime),
                              Math.min(minutes(shift.endTime) - 5, minutes(shift.startTime) + Math.round(offset / scale * 60 / 5) * 5),
                            );
                            create(room, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              create(room, shift.startTime);
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
                          <b>แพทย์ลา</b>
                          <small>
                            {block.startTime}–{block.endTime}
                          </small>
                          <span>{block.reason}</span>
                        </button>
                      ))}
                    {laidOut.map(({ appointment, lane }) => (
                      <button
                        key={appointment.id}
                        className={`${styles.appointment} ${styles[appointment.status.toLowerCase()]} ${duration(appointment) * scale / 60 < 85 ? styles.shortCard : ""}`}
                        style={{
                          ...place(
                            appointment.startTime,
                            appointment.endTime,
                            scale,
                          ),
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
                        <span className={styles.cardTime}>
                          <span>{appointment.startTime}</span><span className={styles.timeSeparator}>–</span><span>{appointment.endTime}</span>
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
              <i className={styles.legendGray} />
              เสร็จสิ้น
            </span>
            <span>
              <i className={styles.legendStripe} />
              แพทย์ลา
            </span>
          </div>
          <p>
            แตะการ์ดเพื่อดูรายละเอียด · แตะพื้นที่ว่างในกรอบเวรแพทย์เพื่อลงทะเบียนนัดหมาย
          </p>
        </footer>
      </section>
      <p className={styles.footnote}>
        Design preview · การตรวจเวลาชนเป็นการจำลองใน browser เท่านั้น ·
        รีเฟรชแล้วข้อมูลกลับค่าเริ่มต้น
      </p>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="mock-dialog-title"
        onCancel={() => {
          setEditing(null);
          setSelectedBlock(null);
        }}
      >
        <div className={styles.dialogHeader}>
          <div>
            <p className={styles.eyebrow}>LOCAL MOCK</p>
            <h2 id="mock-dialog-title">
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
            className={styles.close}
            onClick={closeDialog}
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
            <p className={styles.formHint}>{editing.patient} · {displayDate(editing.date)} · {editing.startTime}–{editing.endTime}</p>
            <label>เหตุผลยกเลิกนัดหมาย
              <input autoFocus required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="ระบุเหตุผลยกเลิก" />
            </label>
            {formError && <p role="alert" className={styles.error}>{formError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.secondary} onClick={() => { setDialogMode("DETAIL"); setFormError(""); }}>กลับ</button>
              <button type="submit" className={styles.danger}>ยืนยันยกเลิกนัดหมาย</button>
            </div>
            <small className={styles.formDisclaimer}>ยกเลิกเฉพาะข้อมูล Mock ไม่ส่งไปยัง API</small>
          </form>
        ) : editing && ((exists && dialogMode === "DETAIL") || dialogMode === "REVIEW") ? (
          <section className={styles.details} aria-label="ข้อมูลนัดหมาย">
            <div className={styles.detailPatient}>
              <span className={styles.detailAvatar} aria-hidden="true">{editing.patient.replace(/^คุณ/, "").slice(0, 1)}</span>
              <div><h3>{editing.patient}</h3><p>รหัสคนไข้ {editing.patientId}</p></div>
              <span className={`${styles.detailStatus} ${styles[editing.status.toLowerCase()]}`}>{statusLabels[editing.status]}</span>
            </div>
            <div className={styles.detailTime}><b>{editing.startTime}–{editing.endTime}</b><span>{duration(editing)} นาที</span></div>
            <dl className={styles.detailList}>
              <div><dt>วันที่นัดหมาย</dt><dd>{displayDate(editing.date)}</dd></div>
              <div><dt>ห้องตรวจ</dt><dd>{rooms.find((room) => room.id === editing.roomId)?.name ?? "—"}</dd></div>
              <div><dt>แพทย์</dt><dd>{doctorById.get(editing.doctorId)?.name ?? "—"}</dd></div>
              <div><dt>รายการนัด / อาการเบื้องต้น</dt><dd>{editing.complaint || "ไม่ได้ระบุ"}</dd></div>
            </dl>
            {formError && <p role="alert" className={styles.error}>{formError}</p>}
            {dialogMode === "REVIEW" ? <form onSubmit={save}>
              <div className={styles.formActions}>
                <button type="button" className={styles.secondary} onClick={() => { setDialogMode("DETAIL"); setFormError(""); }}>กลับไปแก้ไข</button>
                <button type="submit" className={styles.primary}>ยืนยันลงทะเบียนนัดหมาย</button>
              </div>
              <small className={styles.formDisclaimer}>ข้อมูลจำลองเท่านั้น ยังไม่บันทึกจนกว่าจะกดยืนยัน</small>
            </form> : <>
            {!editable && <p className={styles.info}>ตัวอย่างนี้ให้เลื่อนหรือยกเลิกได้เฉพาะสถานะนัดหมาย (SCHEDULED)</p>}
            <div className={styles.formActions}>
              {editable && <>
                <button type="button" className={styles.danger} onClick={() => setDialogMode("CANCEL")}>ยกเลิกนัดหมาย</button>
                <button type="button" className={styles.primary} onClick={() => setDialogMode("RESCHEDULE")}>เลื่อนนัดหมาย</button>
              </>}
              <button type="button" className={styles.secondary} onClick={closeDialog}>ปิด</button>
            </div>
            </>}
          </section>
        ) : (
          editing && (
            <form onSubmit={save} className={styles.form}>
              <p className={styles.formHint}>
                {displayDate(editing.date)} · {statusLabels[editing.status]}
                {exists && ` · ${duration(editing)} นาที`}
              </p>
              <fieldset disabled={!editable}>
                {exists ? <p className={styles.formHint}>{editing.patient} · รหัสคนไข้ {editing.patientId}</p> : <>
                <label>
                  ค้นหาคนไข้
                  <input
                    autoFocus
                    value={patientQuery}
                    onChange={(event) => {
                      setPatientQuery(event.target.value);
                      setEditing({ ...editing, patientId: "", patient: "" });
                    }}
                    placeholder="ชื่อ เบอร์โทร หรือรหัสคนไข้"
                  />
                </label>
                <div className={styles.patientResults} aria-label="ผลค้นหาคนไข้">
                  {mockPatients.filter((patient) => `${patient.name} ${patient.phone} ${patient.code} ${patient.id}`.toLowerCase().includes(patientQuery.trim().toLowerCase())).map((patient) => (
                    <button key={patient.id} type="button" aria-pressed={editing.patientId === patient.id} onClick={() => { setEditing({ ...editing, patientId: patient.id, patient: patient.name }); setFormError(""); }}>
                      <b>{patient.name}</b><span>{patient.code} · {patient.phone}</span>
                      {editing.patientId === patient.id && <small>เลือกแล้ว ✓</small>}
                    </button>
                  ))}
                  {!mockPatients.some((patient) => `${patient.name} ${patient.phone} ${patient.code} ${patient.id}`.toLowerCase().includes(patientQuery.trim().toLowerCase())) && <p role="status">ไม่พบคนไข้ ลองค้นหาด้วยชื่อ เบอร์โทร หรือรหัสคนไข้อื่น</p>}
                </div>
                </>}
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
                      {mockDoctors.map((doctor) => (
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
                      type="time"
                      step={60}
                      required
                      value={editing.endTime}
                      onInput={(event) =>
                        setEditing({ ...editing, endTime: event.currentTarget.value })
                      }
                    />
                  </label>
                </div>
                <p className={styles.bookingDuration} role="status" aria-live="polite">ระยะเวลานัดหมาย: <strong>{bookingDuration}</strong></p>
                {!exists && <p className={styles.formHint}>เสนอเวลาสิ้นสุดถึงคิวถัดไป หรือสิ้นสุดเวรหากไม่มีคิวถัดไป สามารถปรับให้สั้นลงได้</p>}
                {exists ? <p className={styles.formHint}>รายการนัด: {editing.complaint || "ไม่ได้ระบุ"}</p> : <label>
                  รายการนัด / อาการเบื้องต้น
                  <input
                    value={editing.complaint}
                    onChange={(event) =>
                      setEditing({ ...editing, complaint: event.target.value })
                    }
                  />
                </label>}
              </fieldset>
              {!editable && (
                <p className={styles.info}>
                  ตัวอย่างนี้ให้เลื่อนหรือยกเลิกได้เฉพาะสถานะนัดหมาย (SCHEDULED)
                </p>
              )}
              {formError && (
                <p role="alert" className={styles.error}>
                  {formError}
                </p>
              )}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => { if (exists) { setEditing({ ...appointments.find((item) => item.id === editing.id)! }); setDialogMode("DETAIL"); setFormError(""); } else closeDialog(); }}
                >
                  {exists ? "กลับ" : "ปิด"}
                </button>
                {editable && (
                  <button type="submit" className={styles.primary}>
                    {exists ? "บันทึกการเลื่อนนัด" : "ตรวจสอบนัดหมาย"}
                  </button>
                )}
              </div>
              <small className={styles.formDisclaimer}>
                ข้อมูลนี้ไม่ถูกส่งไปยัง API และไม่ใช่การทดสอบสิทธิ์จริง
              </small>
            </form>
          )
        )}
      </dialog>
    </main>
  );
}
