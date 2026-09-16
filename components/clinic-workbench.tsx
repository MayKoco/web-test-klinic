"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type Room = { id: string; roomCode: string; name: string; type?: string; status: string };
type Doctor = { id: string; doctorCode: string; memberNo: string; prefix?: string; firstName: string; lastName: string; specialty?: string; status: string };
type Patient = { id: string; hn: string; prefix?: string; firstName: string; lastName: string; phone: string };
type Appointment = { id: string; appointmentNo: string; date: string; startTime: string; endTime: string; status: string; patient: Patient; doctor: Doctor; room: Room };
type CalendarSlot = { status: "AVAILABLE" | "BOOKED" | "CLOSED"; doctor?: { id: string; name: string }; appointment?: { appointmentNo: string; patient: { name: string } } };
type CalendarRoom = { roomId: string; roomName: string; roomCode: string; slots: Record<string, CalendarSlot> };
type CalendarData = { date: string; timeSlots: string[]; rooms: CalendarRoom[] };
type DoctorScheduleSlot = { time: string; status: "AVAILABLE" | "BOOKED" | "CLOSED"; appointmentNo?: string; patientName?: string; roomId?: string };
type DoctorSchedule = { doctorId: string; doctorName: string; slots: DoctorScheduleSlot[] };
type Log = { id: number; time: string; method: string; path: string; ok: boolean; message: string };
type TreatmentOption = { entitlementId: string; name: string; type: "SERVICE" | "COURSE"; totalUnits: number; remainingUnits: number };
type TreatmentOptionGroup = { key: string; sourceType: string; sourceName: string; items: TreatmentOption[] };

const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function doctorName(doctor: Doctor) {
  return `${doctor.prefix ?? ""}${doctor.firstName} ${doctor.lastName}`.trim();
}

function patientName(patient: Patient) {
  return `${patient.prefix ?? ""}${patient.firstName} ${patient.lastName}`.trim();
}

export default function ClinicWorkbench() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<{ name: string; clinicCode: string } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [date, setDate] = useState(localDate());
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[]>(["09:00", "10:00", "11:00"]);
  const [scheduleDoctorId, setScheduleDoctorId] = useState("");
  const [scheduleRoomId, setScheduleRoomId] = useState("");
  const [appointmentDraft, setAppointmentDraft] = useState({ patientId: "", doctorId: "", roomId: "", startTime: "09:00", chiefComplaint: "ตรวจอาการทั่วไป" });
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [treatmentOptions, setTreatmentOptions] = useState<TreatmentOptionGroup[]>([]);
  const [selectedEntitlements, setSelectedEntitlements] = useState<string[]>([]);

  const addLog = useCallback((method: string, path: string, ok: boolean, message: string) => {
    setLogs((current) => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString("th-TH"), method, path, ok, message }, ...current].slice(0, 14));
  }, []);

  const refresh = useCallback(async (accessToken = token, targetDate = date) => {
    if (!accessToken) return;
    setBusy("refresh");
    try {
      const [roomResult, doctorResult, patientResult, appointmentResult, calendarResult] = await Promise.all([
        apiRequest<Room[]>("/rooms?limit=100", { token: accessToken }),
        apiRequest<Doctor[]>("/doctors?limit=100", { token: accessToken }),
        apiRequest<Patient[]>("/patients?limit=100", { token: accessToken }),
        apiRequest<Appointment[]>(`/appointments?date=${targetDate}&limit=100`, { token: accessToken }),
        apiRequest<CalendarData>(`/appointments/calendar?date=${targetDate}`, { token: accessToken }),
      ]);
      setRooms(roomResult.data);
      setDoctors(doctorResult.data);
      setPatients(patientResult.data);
      setAppointments(appointmentResult.data);
      setCalendar(calendarResult.data);
      addLog("GET", "dashboard resources", true, "โหลดข้อมูลล่าสุดแล้ว");
    } catch (error) {
      const apiError = error as ApiClientError;
      setNotice({ kind: "error", text: apiError.code ? `${apiError.code}: ${apiError.message}` : (apiError.message ?? String(error)) });
    } finally {
      setBusy(null);
    }
  }, [addLog, date, token]);

  useEffect(() => {
    const saved = window.localStorage.getItem("klinic-test-token");
    const savedProfile = window.localStorage.getItem("klinic-test-profile");
    if (!saved) return;
    apiRequest<Room[]>("/rooms?limit=1", { token: saved })
      .then(() => {
        setToken(saved);
        if (savedProfile) setProfile(JSON.parse(savedProfile));
        void refresh(saved);
      })
      .catch(() => {
        window.localStorage.removeItem("klinic-test-token");
        window.localStorage.removeItem("klinic-test-profile");
      });
  // Session restore runs once; refresh receives the saved token explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableCount = useMemo(() => calendar?.rooms.reduce((total, room) => total + Object.values(room.slots).filter((slot) => slot.status === "AVAILABLE").length, 0) ?? 0, [calendar]);
  const activeScheduleDoctorId = scheduleDoctorId || doctors[0]?.id || "";
  const activeScheduleRoomId = scheduleRoomId || rooms[0]?.id || "";
  const activeAppointment = {
    ...appointmentDraft,
    patientId: appointmentDraft.patientId || patients[0]?.id || "",
    doctorId: appointmentDraft.doctorId || doctors[0]?.id || "",
    roomId: appointmentDraft.roomId || rooms[0]?.id || "",
  };

  useEffect(() => {
    if (!token || !activeAppointment.patientId) return;
    apiRequest<{ groups: TreatmentOptionGroup[] }>(`/patients/${activeAppointment.patientId}/treatment-options`, { token })
      .then(result => setTreatmentOptions(result.data.groups))
      .catch(error => setNotice({ kind: "error", text: (error as ApiClientError).message }));
  }, [activeAppointment.patientId, token]);

  async function execute<T>(label: string, method: string, path: string, body?: unknown) {
    setBusy(label);
    setNotice(null);
    try {
      const result = await apiRequest<T>(path, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });
      addLog(method, path, true, result.message);
      setNotice({ kind: "success", text: result.message });
      return result.data;
    } catch (error) {
      const apiError = error as ApiClientError;
      const message = `${apiError.code ? `${apiError.code}: ` : ""}${apiError.message}`;
      addLog(method, path, false, message);
      setNotice({ kind: "error", text: message });
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("login");
    setNotice(null);
    try {
      const result = await apiRequest<{ accessToken: string; user: { email: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ clinicCode: form.get("clinicCode"), email: form.get("email"), password: form.get("password") }),
      });
      window.localStorage.setItem("klinic-test-token", result.data.accessToken);
      const prof = { name: result.data.user.email, clinicCode: String(form.get("clinicCode")) };
      window.localStorage.setItem("klinic-test-profile", JSON.stringify(prof));
      setToken(result.data.accessToken);
      setProfile(prof);
      addLog("POST", "/auth/login", true, result.message);
      await refresh(result.data.accessToken);
    } catch (error) {
      const apiError = error as ApiClientError;
      const message = apiError.code ? `${apiError.code}: ${apiError.message}` : (apiError.message ?? String(error));
      addLog("POST", "/auth/login", false, message);
      setNotice({ kind: "error", text: message });
      setBusy(null);
    }
  }

  function logout() {
    window.localStorage.removeItem("klinic-test-token");
    window.localStorage.removeItem("klinic-test-profile");
    setToken(""); setProfile(null); setRooms([]); setDoctors([]); setPatients([]); setAppointments([]);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await execute<Room>("room", "POST", "/rooms", { name: form.get("name"), type: form.get("type"), capacity: Number(form.get("capacity")) });
    formElement.reset();
    await refresh();
  }

  async function createDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await execute<Doctor>("doctor", "POST", "/doctors", { memberNo: form.get("memberNo"), prefix: form.get("prefix"), firstName: form.get("firstName"), lastName: form.get("lastName"), specialty: form.get("specialty") });
    formElement.reset();
    await refresh();
  }

  async function saveSchedule() {
    if (!activeScheduleDoctorId || !activeScheduleRoomId || selectedSlots.length === 0) return;
    setBusy("schedule");
    setNotice(null);
    try {
      try {
        await apiRequest(`/doctors/${activeScheduleDoctorId}/rooms`, { method: "POST", token, body: JSON.stringify({ roomId: activeScheduleRoomId, isPrimary: true }) });
        addLog("POST", `/doctors/${activeScheduleDoctorId}/rooms`, true, "ผูกหมอกับห้องแล้ว");
      } catch (error) {
        const apiError = error as ApiClientError;
        if (apiError.status !== 409) throw error;
        addLog("POST", `/doctors/${activeScheduleDoctorId}/rooms`, true, "หมอผูกกับห้องนี้อยู่แล้ว");
      }
      await apiRequest(`/rooms/${activeScheduleRoomId}/schedules`, { method: "POST", token, body: JSON.stringify({ date, slots: selectedSlots }) });
      addLog("POST", `/rooms/${activeScheduleRoomId}/schedules`, true, "บันทึกเวลาเปิดห้องแล้ว");
      await apiRequest(`/doctors/${activeScheduleDoctorId}/schedules`, { method: "POST", token, body: JSON.stringify({ date, slots: selectedSlots, roomId: activeScheduleRoomId }) });
      addLog("POST", `/doctors/${activeScheduleDoctorId}/schedules`, true, "บันทึกเวรหมอแล้ว");
      setNotice({ kind: "success", text: "ผูกห้องและลงเวรหมอสำเร็จ" });
      await refresh(token, date);
    } catch (error) {
      const apiError = error as ApiClientError;
      const message = apiError.code ? `${apiError.code}: ${apiError.message}` : (apiError.message ?? String(error));
      addLog("POST", "schedule workflow", false, message);
      setNotice({ kind: "error", text: message });
    } finally {
      setBusy(null);
    }
  }

  async function createPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await execute<Patient>("patient", "POST", "/patients", { prefix: form.get("prefix"), firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone") });
    formElement.reset();
    await refresh();
  }

  async function openCalendarModal() {
    setShowCalendarModal(true);
    setLoadingSchedules(true);
    try {
      const result = await apiRequest<CalendarData>(`/appointments/calendar?date=${date}`, { token });
      const cal = result.data;
      // แปลง calendar (room-centric) → doctor-centric สำหรับ modal
      const doctorMap = new Map<string, DoctorSchedule>();
      for (const room of cal.rooms) {
        for (const [time, slot] of Object.entries(room.slots)) {
          if (!slot.doctor) continue;
          if (!doctorMap.has(slot.doctor.id)) {
            doctorMap.set(slot.doctor.id, { doctorId: slot.doctor.id, doctorName: slot.doctor.name, slots: [] });
          }
          doctorMap.get(slot.doctor.id)!.slots.push({
            time,
            status: slot.status,
            appointmentNo: slot.appointment?.appointmentNo,
            patientName: slot.appointment?.patient.name,
            roomId: room.roomId,
          });
        }
      }
      setDoctorSchedules(Array.from(doctorMap.values()));
    } finally {
      setLoadingSchedules(false);
    }
  }

  function pickSlotFromModal(doctorId: string, roomId: string, time: string) {
    setAppointmentDraft((prev) => ({ ...prev, doctorId, roomId, startTime: time }));
    setShowCalendarModal(false);
  }

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiRequest<CalendarData>(`/appointments/calendar?date=${date}`, { token });
      const cal = result.data;
      // หา slot ของหมอที่เลือก ในเวลาที่เลือก จากทุกห้อง
      let found: CalendarSlot | undefined;
      for (const room of cal.rooms) {
        const slot = room.slots[activeAppointment.startTime];
        if (slot?.doctor?.id === activeAppointment.doctorId) { found = slot; break; }
      }
      if (!found || found.status !== "AVAILABLE") {
        setNotice({ kind: "error", text: `เวลา ${activeAppointment.startTime} ไม่ว่างหรือหมอไม่มีตารางเวร` });
        return;
      }
    } catch {
      setNotice({ kind: "error", text: "ไม่สามารถตรวจสอบตารางเวรหมอได้" });
      return;
    }
    await execute<Appointment>("appointment", "POST", "/appointments", { ...activeAppointment, date, entitlementIds: selectedEntitlements });
    setSelectedEntitlements([]);
    await refresh();
  }

  function chooseSlot(room: CalendarRoom, time: string, slot: CalendarSlot) {
    if (slot.status !== "AVAILABLE" || !slot.doctor) return;
    setAppointmentDraft((current) => ({ ...current, roomId: room.roomId, doctorId: slot.doctor!.id, startTime: time }));
    document.getElementById("appointment-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!token) return <LoginScreen busy={busy === "login"} notice={notice} onSubmit={login} />;

  return (
    <main className="app-shell">
      <AppSidebar active="scheduling" profile={profile} />

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">CLINIC OPERATIONS</p><h1>Scheduling workbench</h1></div>
          <div className="top-actions"><label className="date-control">วันที่ทดสอบ<input type="date" value={date} onChange={(event) => { setDate(event.target.value); void refresh(token, event.target.value); }} /></label><button className="ghost-button" onClick={() => void refresh()} disabled={busy === "refresh"}>↻ โหลดใหม่</button><button className="text-button" onClick={logout}>ออกจากระบบ</button></div>
        </header>

        <div className="content">
          {notice && <div className={`notice floating ${notice.kind}`}><span>{notice.kind === "success" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
          <section id="overview" className="hero-card"><div><p className="eyebrow">LIVE API STATUS</p><h2>เตรียม clinic ให้พร้อมรับนัด</h2><p>สร้างข้อมูลตามลำดับ หรือเลือก slot ว่างจากตารางเพื่อกรอกนัดหมายทันที</p></div><div className="metrics"><div><span>ห้อง</span><b>{rooms.length}</b></div><div><span>แพทย์</span><b>{doctors.length}</b></div><div><span>คนไข้</span><b>{patients.length}</b></div><div className="accent"><span>คิวว่าง</span><b>{availableCount}</b></div></div></section>
          <section className="step-strip">{[{ n: "01", t: "สร้างทรัพยากร", d: "ห้องและแพทย์" }, { n: "02", t: "ลงตารางเวร", d: "วันที่ ห้อง และเวลา" }, { n: "03", t: "เพิ่มคนไข้", d: "ข้อมูลสำหรับจอง" }, { n: "04", t: "สร้างนัดหมาย", d: "เลือก slot ว่าง" }].map((step) => <div key={step.n}><b>{step.n}</b><span><strong>{step.t}</strong><small>{step.d}</small></span></div>)}</section>

          <section id="resources" className="two-column">
            <ResourcePanel title="สร้างห้อง" step="STEP 01" icon="▦" tone="blue" count={`${rooms.length} ห้อง`}>
              <form onSubmit={createRoom} className="compact-form"><label className="wide">ชื่อห้อง<input name="name" placeholder="เช่น ห้องตรวจผิวหนัง 1" required /></label><label>ประเภท<select name="type" defaultValue="TREATMENT"><option>TREATMENT</option><option>EXAMINATION</option><option>CONSULTATION</option><option>SURGERY</option></select></label><label>ความจุ<input name="capacity" type="number" min="0" defaultValue="1" required /></label><button className="secondary-button wide" disabled={busy === "room"}>+ สร้างห้องผ่าน API</button></form>
              <div className="resource-list">{rooms.slice(0, 4).map((room) => <div key={room.id}><span className="resource-avatar">R</span><span><b>{room.name}</b><small>{room.roomCode} · {room.type ?? "ไม่ระบุประเภท"}</small></span><em>{room.status}</em></div>)}</div>
            </ResourcePanel>
            <ResourcePanel title="สร้างแพทย์" step="STEP 01" icon="✚" tone="teal" count={`${doctors.length} คน`}>
              <form onSubmit={createDoctor} className="compact-form"><label>รหัสสมาชิก<input name="memberNo" placeholder={`MD-${String(doctors.length + 1).padStart(3, "0")}`} required /></label><label>คำนำหน้า<select name="prefix" defaultValue="นพ."><option>นพ.</option><option>พญ.</option><option>ทพ.</option><option>ทพญ.</option></select></label><label>ชื่อ<input name="firstName" placeholder="ชื่อ" required /></label><label>นามสกุล<input name="lastName" placeholder="นามสกุล" required /></label><label className="wide">ความเชี่ยวชาญ<input name="specialty" placeholder="เช่น Dermatology" /></label><button className="secondary-button wide" disabled={busy === "doctor"}>+ สร้างแพทย์ผ่าน API</button></form>
              <div className="resource-list">{doctors.slice(0, 4).map((doctor) => <div key={doctor.id}><span className="resource-avatar doctor">{doctor.firstName.slice(0, 1)}</span><span><b>{doctorName(doctor)}</b><small>{doctor.doctorCode} · {doctor.specialty ?? "General"}</small></span><em>{doctor.status}</em></div>)}</div>
            </ResourcePanel>
          </section>

          <section id="schedule" className="panel schedule-panel">
            <PanelHeading icon="⌁" tone="violet" step="STEP 02" title="ผูกห้องและลงตารางเวร" trailing={<span className="api-chip">3 API calls</span>} />
            <div className="schedule-layout"><div className="schedule-fields"><label>แพทย์<select value={activeScheduleDoctorId} onChange={(event) => setScheduleDoctorId(event.target.value)}><option value="">เลือกแพทย์</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctorName(doctor)}</option>)}</select></label><label>ห้อง<select value={activeScheduleRoomId} onChange={(event) => setScheduleRoomId(event.target.value)}><option value="">เลือกห้อง</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label>วันที่<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><div><span className="field-title">ช่วงเวลาที่เข้าเวร</span><div className="slot-picker">{timeSlots.map((slot) => <button key={slot} type="button" className={selectedSlots.includes(slot) ? "selected" : ""} onClick={() => setSelectedSlots((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot].sort())}>{slot}<small>{selectedSlots.includes(slot) ? "เลือกแล้ว" : "ว่าง"}</small></button>)}</div></div><button className="primary-button schedule-submit" onClick={() => void saveSchedule()} disabled={!activeScheduleDoctorId || !activeScheduleRoomId || selectedSlots.length === 0 || busy === "schedule"}>{busy === "schedule" ? "กำลังบันทึก..." : "บันทึกการผูกห้องและตารางเวร"}</button></div>
          </section>

          <section className="two-column patient-appointment">
            <ResourcePanel title="เพิ่มคนไข้" step="STEP 03" icon="♙" tone="amber" count={`${patients.length} คน`}>
              <form onSubmit={createPatient} className="compact-form"><label>คำนำหน้า<select name="prefix" defaultValue="คุณ"><option>คุณ</option><option>นาย</option><option>นาง</option><option>นางสาว</option><option>ด.ช.</option><option>ด.ญ.</option></select></label><label>เบอร์โทร<input name="phone" placeholder="08xxxxxxxx" required /></label><label>ชื่อ<input name="firstName" placeholder="ชื่อ" required /></label><label>นามสกุล<input name="lastName" placeholder="นามสกุล" required /></label><button className="secondary-button wide" disabled={busy === "patient"}>+ เพิ่มคนไข้ผ่าน API</button></form>
              <div className="resource-list compact">{patients.slice(0, 4).map((patient) => <div key={patient.id}><span className="resource-avatar patient">{patient.firstName.slice(0, 1)}</span><span><b>{patientName(patient)}</b><small>{patient.hn} · {patient.phone}</small></span></div>)}</div>
            </ResourcePanel>
            <article className="panel" id="appointment-form"><PanelHeading icon="✓" tone="coral" step="STEP 04" title="สร้างนัดหมาย" /><form onSubmit={createAppointment} className="compact-form"><label className="wide">คนไข้<select value={activeAppointment.patientId} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, patientId: event.target.value })} required><option value="">เลือกคนไข้</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.hn} — {patientName(patient)}</option>)}</select></label><label>แพทย์<select value={activeAppointment.doctorId} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, doctorId: event.target.value })} required><option value="">เลือกแพทย์</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctorName(doctor)}</option>)}</select></label><label>ห้อง<select value={activeAppointment.roomId} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, roomId: event.target.value })} required><option value="">เลือกห้อง</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label>วันที่<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>เวลา<div className="time-pick-row"><select value={activeAppointment.startTime} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, startTime: event.target.value })}>{timeSlots.map((slot) => <option key={slot}>{slot}</option>)}</select><button type="button" className="ghost-button" onClick={() => void openCalendarModal()}>📅 ดูตาราง</button></div></label><div className="wide appointment-rights"><b>บริการและคอร์สที่ซื้อไว้</b>{!treatmentOptions.length?<small>ยังไม่มีสิทธิ์พร้อมใช้งาน</small>:treatmentOptions.map(group=><section key={group.key}><header>{group.sourceName}</header>{group.items.map(item=><label key={item.entitlementId} className={selectedEntitlements.includes(item.entitlementId)?"selected":""}><input type="checkbox" checked={selectedEntitlements.includes(item.entitlementId)} onChange={()=>setSelectedEntitlements(current=>current.includes(item.entitlementId)?current.filter(id=>id!==item.entitlementId):[...current,item.entitlementId])}/><span><b>{item.name}</b><small>{item.type} · เหลือ {item.remainingUnits}/{item.totalUnits} ครั้ง</small></span></label>)}</section>)}</div><label className="wide">อาการเบื้องต้น<input value={activeAppointment.chiefComplaint} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, chiefComplaint: event.target.value })} /></label><button className="primary-button wide" disabled={busy === "appointment" || !activeAppointment.patientId}>{busy === "appointment" ? "กำลังสร้างนัด..." : "ยืนยันสร้างนัดหมาย"}</button></form></article>
          </section>

          <CalendarPanel date={date} calendar={calendar} appointments={appointments} onChooseSlot={chooseSlot} onDateChange={(d) => { setDate(d); void refresh(token, d); }} />
          {showCalendarModal && <AppointmentCalendarModal date={date} schedules={doctorSchedules} loading={loadingSchedules} rooms={rooms} calendar={calendar} onPick={pickSlotFromModal} onClose={() => setShowCalendarModal(false)} />}
          <ActivityPanel logs={logs} onClear={() => setLogs([])} />
        </div>
      </section>
    </main>
  );
}

function LoginScreen({ busy, notice, onSubmit }: { busy: boolean; notice: { kind: "success" | "error"; text: string } | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <main className="login-shell"><section className="login-story"><div className="brand-mark">K<span>+</span></div><p className="eyebrow light">KLINIC API LAB</p><h1>ทดสอบเส้นทางนัดหมาย<br />ตั้งแต่เปิดห้องจนถึงจองคิว</h1><p>เว็บสำหรับตรวจ API จริงของ Doctor, Room, Patient และ Appointment แบบเห็นผลลัพธ์ทุกขั้นตอน</p><div className="flow-preview">{["สร้างห้อง", "ลงเวรหมอ", "เพิ่มคนไข้", "สร้างนัด"].map((item, index) => <div key={item}><b>{index + 1}</b><span>{item}</span></div>)}</div></section><section className="login-panel"><div className="login-card"><p className="eyebrow">CLINIC WORKSPACE</p><h2>เข้าสู่ระบบทดสอบ</h2><p className="muted">ใช้บัญชีจาก development seed หรือบัญชี clinic ที่สร้างไว้</p><form onSubmit={onSubmit} className="form-stack"><label>Clinic code<input name="clinicCode" defaultValue="CLINIC-0001" required /></label><label>Email<input name="email" type="email" defaultValue="owner@test.clinic" required /></label><label>Password<input name="password" type="password" defaultValue="Test1234!" required /></label><button className="primary-button" disabled={busy}>{busy ? "กำลังเชื่อมต่อ..." : "เข้าสู่ API Lab"}</button></form>{notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}<p className="connection-hint"><span /> API default: http://localhost:8080/api</p></div></section></main>;
}

function PanelHeading({ icon, tone, step, title, trailing }: { icon: string; tone: string; step: string; title: string; trailing?: React.ReactNode }) {
  return <div className="panel-heading"><div className={`icon-tile ${tone}`}>{icon}</div><div><p className="eyebrow">{step}</p><h3>{title}</h3></div>{trailing}</div>;
}

function ResourcePanel({ title, step, icon, tone, count, children }: { title: string; step: string; icon: string; tone: string; count: string; children: React.ReactNode }) {
  return <article className="panel"><PanelHeading icon={icon} tone={tone} step={step} title={title} trailing={<span className="count">{count}</span>} />{children}</article>;
}

function AppointmentCalendarModal({ date, schedules, loading, rooms, onPick, onClose }: {
  date: string; schedules: DoctorSchedule[]; loading: boolean; rooms: Room[]; calendar: CalendarData | null;
  onPick: (doctorId: string, roomId: string, time: string) => void; onClose: () => void;
}) {
  const allTimes = Array.from(new Set(schedules.flatMap((d) => d.slots.map((s) => s.time)))).sort();

  function getRoomForDoctor(doctorId: string, time: string): string {
    const schedule = schedules.find((d) => d.doctorId === doctorId);
    return schedule?.slots.find((s) => s.time === time)?.roomId ?? rooms[0]?.id ?? "";
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div><p className="eyebrow">DOCTOR SCHEDULE</p><h3>ตารางเวรหมอ — {date}</h3></div>
          <button className="text-button" onClick={onClose}>✕ ปิด</button>
        </div>
        {loading ? (
          <div className="empty-state"><span>กำลังโหลดตารางเวร...</span></div>
        ) : !schedules.length || !allTimes.length ? (
          <div className="empty-state"><b>ไม่มีตารางเวรในวันนี้</b><span>กรุณาลงตารางเวรหมอก่อน</span></div>
        ) : (
          <div className="appt-cal-wrap">
            <div className="appt-cal-table">
              <div className="appt-cal-row header" style={{ "--doc-count": schedules.length } as React.CSSProperties}>
                <div>เวลา</div>
                {schedules.map((d) => <div key={d.doctorId}><b>{d.doctorName}</b></div>)}
              </div>
              {allTimes.map((time) => (
                <div className="appt-cal-row" key={time} style={{ "--doc-count": schedules.length } as React.CSSProperties}>
                  <div className="time-col"><b>{time}</b></div>
                  {schedules.map((doctor) => {
                    const slot = doctor.slots.find((s) => s.time === time);
                    const status = slot?.status ?? "NONE";
                    return (
                      <button
                        key={doctor.doctorId}
                        className={`appt-cal-cell ${status.toLowerCase()}`}
                        disabled={status !== "AVAILABLE"}
                        onClick={() => onPick(doctor.doctorId, getRoomForDoctor(doctor.doctorId, time), time)}
                      >
                        {status === "AVAILABLE" && <><b>ว่าง</b><small>คลิกเพื่อเลือก</small></>}
                        {status === "BOOKED" && <><b>{slot?.patientName ?? "มีนัด"}</b><small>{slot?.appointmentNo}</small></>}
                        {status === "CLOSED" && <small>ปิด</small>}
                        {status === "NONE" && <small>—</small>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="modal-legend">
              <span><i className="available" />ว่าง (คลิกเพื่อเลือก)</span>
              <span><i className="booked" />มีนัดแล้ว</span>
              <span><i className="closed" />ปิด / ไม่มีเวร</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarPanel({ date, calendar, appointments, onChooseSlot, onDateChange }: { date: string; calendar: CalendarData | null; appointments: Appointment[]; onChooseSlot: (room: CalendarRoom, time: string, slot: CalendarSlot) => void; onDateChange: (date: string) => void }) {
  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    onDateChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return <section id="calendar" className="panel calendar-panel"><div className="panel-heading"><div><p className="eyebrow">ROOM-CENTRIC CALENDAR</p><h3>ตารางนัดหมาย</h3></div><div className="cal-nav"><button className="ghost-button" onClick={() => shiftDate(-1)}>‹</button><input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} /><button className="ghost-button" onClick={() => shiftDate(1)}>›</button></div><div className="legend"><span><i className="available" />ว่าง</span><span><i className="booked" />มีนัด</span><span><i className="closed" />ปิด</span></div></div>{!calendar?.rooms.length ? <div className="empty-state"><b>ยังไม่มีตารางเวรในวันนี้</b><span>เลือกแพทย์ ห้อง และช่วงเวลาด้านบน แล้วกดบันทึกตารางเวร</span></div> : <div className="calendar-table"><div className="calendar-row header"><div>ห้อง / เวลา</div>{calendar.timeSlots.map((time) => <div key={time}>{time}</div>)}</div>{calendar.rooms.map((room) => <div className="calendar-row" key={room.roomId}><div><b>{room.roomName}</b><small>{room.roomCode}</small></div>{calendar.timeSlots.map((time) => { const slot = room.slots[time]; return <button key={time} className={`calendar-slot ${slot?.status.toLowerCase() ?? "closed"}`} onClick={() => slot && onChooseSlot(room, time, slot)} disabled={slot?.status !== "AVAILABLE"}>{slot?.status === "BOOKED" ? <><b>{slot.appointment?.patient.name}</b><small>{slot.appointment?.appointmentNo}</small></> : slot?.status === "AVAILABLE" ? <><b>ว่าง</b><small>{slot.doctor?.name}</small></> : <small>—</small>}</button>; })}</div>)}</div>}{!!appointments.length && <div className="appointment-list"><h4>นัดหมายวันนี้</h4>{appointments.map((appointment) => <div key={appointment.id}><span className="time-badge">{appointment.startTime}</span><span><b>{patientName(appointment.patient)}</b><small>{doctorName(appointment.doctor)} · {appointment.room.name}</small></span><em>{appointment.status}</em></div>)}</div>}</section>;
}

function ActivityPanel({ logs, onClear }: { logs: Log[]; onClear: () => void }) {
  return <section id="activity" className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">DEBUG CONSOLE</p><h3>API activity</h3></div><button className="text-button" onClick={onClear}>ล้างรายการ</button></div>{!logs.length ? <div className="empty-state small"><span>ยังไม่มี request ใน session นี้</span></div> : <div className="log-list">{logs.map((log) => <div key={log.id}><time>{log.time}</time><b className={log.method.toLowerCase()}>{log.method}</b><code>{log.path}</code><span className={log.ok ? "ok" : "failed"}>{log.ok ? "200" : "ERROR"}</span><small>{log.message}</small></div>)}</div>}</section>;
}
