import { apiRequest } from "./api";

export type Interval = { startTime: string; endTime: string };
export type TimelineDoctor = {
  id: string;
  name: string;
  specialty: string;
  tone: string;
};
export type TimelineBlock = Interval & {
  id: string;
  resource: "ROOM" | "DOCTOR";
  doctorId?: string;
  kind: "LEAVE" | "CLOSED";
  reason: string;
};
export type TimelineRoom = {
  id: string;
  name: string;
  type: string;
  opening: Interval[];
  shifts: (Interval & { doctorId: string; bookingIntervals: Interval[] })[];
  blocks: TimelineBlock[];
};
export type TimelineAppointment = Interval & {
  id: string;
  date: string;
  patient: string;
  patientId: string;
  hn?: string;
  doctorId: string;
  roomId: string;
  complaint: string;
  isDraft?: boolean;
  status:
    | "SCHEDULED"
    | "WAITING"
    | "IN_PROGRESS"
    | "PENDING_NOTE"
    | "COMPLETED"
    | "CANCELLED";
};
export type PatientOption = {
  id: string;
  hn: string;
  prefix: string | null;
  firstName: string;
  lastName: string;
  phone: string;
};
export type BookingSuggestion = Interval & {
  durationMinutes: number;
  reservesSlot: false;
};
type ApiDoctor = { id: string; name: string; specialty: string | null };
type ApiRoom = {
  roomId: string;
  name: string;
  type: string | null;
  status: string;
  openingIntervals: Interval[];
  doctorShifts: (Interval & {
    doctor: ApiDoctor;
    bookingIntervals: Interval[];
  })[];
  unavailability: {
    resourceType: "ROOM" | "DOCTOR";
    resourceId: string;
    type: string;
    startTime: string | null;
    endTime: string | null;
  }[];
  appointments: (Interval & {
    id: string;
    status: TimelineAppointment["status"];
    chiefComplaint: string | null;
    doctor: ApiDoctor;
    patient: { id: string; hn: string; name: string };
  })[];
};
export type ApiTimeline = {
  date: string;
  timezone: string;
  displayRange: Interval;
  rooms: ApiRoom[];
  meta: {
    page: number;
    totalPages: number;
    hasNextPage: boolean;
    total: number;
  };
};
export const statusLabels: Record<TimelineAppointment["status"], string> = {
  SCHEDULED: "นัดหมาย",
  WAITING: "รอรักษา",
  IN_PROGRESS: "กำลังรักษา",
  PENDING_NOTE: "รอบันทึกการรักษา",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};
export function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
export function duration(interval: Interval) {
  return minutes(interval.endTime) - minutes(interval.startTime);
}
export function overlaps(a: Interval, b: Interval) {
  return (
    minutes(a.startTime) < minutes(b.endTime) &&
    minutes(a.endTime) > minutes(b.startTime)
  );
}
export function timeAt(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function patientName(patient: PatientOption) {
  return `${patient.prefix ?? ""}${patient.firstName} ${patient.lastName}`;
}
export function mapTimeline(data: ApiTimeline) {
  const doctors = new Map<string, TimelineDoctor>();
  const addDoctor = (doctor: ApiDoctor) => {
    let hash = 0;
    for (const char of doctor.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    doctors.set(doctor.id, {
      ...doctor,
      specialty: doctor.specialty ?? "",
      tone: ["mint", "violet", "blue", "peach"][hash % 4],
    });
  };
  const appointments: TimelineAppointment[] = [];
  const rooms: TimelineRoom[] = data.rooms.map((room) => {
    for (const shift of room.doctorShifts) addDoctor(shift.doctor);
    for (const a of room.appointments) {
      addDoctor(a.doctor);
      appointments.push({
        id: a.id,
        date: data.date,
        roomId: room.roomId,
        doctorId: a.doctor.id,
        patientId: a.patient.id,
        patient: a.patient.name,
        hn: a.patient.hn,
        complaint: a.chiefComplaint ?? "",
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
      });
    }
    return {
      id: room.roomId,
      name: room.name,
      type: room.type ?? "",
      opening: room.status === "ACTIVE" ? room.openingIntervals : [],
      shifts: room.doctorShifts.map((s) => ({
        doctorId: s.doctor.id,
        startTime: s.startTime,
        endTime: s.endTime,
        bookingIntervals: s.bookingIntervals,
      })),
      blocks: room.unavailability.map((b, index) => ({
        id: `${room.roomId}:${index}`,
        resource: b.resourceType,
        doctorId: b.resourceType === "DOCTOR" ? b.resourceId : undefined,
        kind: b.resourceType === "DOCTOR" ? "LEAVE" : "CLOSED",
        reason:
          b.resourceType === "DOCTOR"
            ? "แพทย์ไม่พร้อมปฏิบัติงาน · อนุมัติแล้ว"
            : "ห้องไม่พร้อมใช้งาน",
        startTime: b.startTime ?? data.displayRange.startTime,
        endTime: b.endTime ?? data.displayRange.endTime,
      })),
    };
  });
  return { rooms, appointments, doctors: [...doctors.values()] };
}
export async function loadTimeline(
  token: string,
  date: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    limit: "100",
    ...(date ? { date } : {}),
  });
  const first = (
    await apiRequest<ApiTimeline>(`/appointments/timeline?${query}`, {
      token,
      signal,
    })
  ).data;
  const rooms = [...first.rooms];
  query.set("date", first.date);
  for (let page = 2; page <= first.meta.totalPages; page++) {
    query.set("page", String(page));
    const next = (
      await apiRequest<ApiTimeline>(`/appointments/timeline?${query}`, {
        token,
        signal,
      })
    ).data;
    rooms.push(...next.rooms);
  }
  return {
    ...first,
    rooms: [...new Map(rooms.map((room) => [room.roomId, room])).values()],
  };
}
export function validateBooking(
  value: TimelineAppointment,
  rooms: TimelineRoom[],
  appointments: TimelineAppointment[],
) {
  if (!value.patientId || !value.patient)
    return "กรุณาค้นหาและเลือกคนไข้จากรายการ";
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) ||
    !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value.endTime) ||
    duration(value) <= 0
  )
    return "เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุดภายในวันเดียวกัน";
  const room = rooms.find((room) => room.id === value.roomId);
  const intervals =
    room?.shifts
      .filter((s) => s.doctorId === value.doctorId)
      .flatMap((s) => s.bookingIntervals)
      .sort((a, b) => minutes(a.startTime) - minutes(b.startTime)) ?? [];
  let cursor = minutes(value.startTime);
  for (const interval of intervals) {
    if (minutes(interval.endTime) <= cursor) continue;
    if (minutes(interval.startTime) > cursor) break;
    cursor = minutes(interval.endTime);
  }
  if (cursor < minutes(value.endTime))
    return "ช่วงเวลานี้ไม่อยู่ในเวลาที่แพทย์และห้องพร้อมใช้งานตลอดทั้งนัด";
  if (
    appointments.some(
      (a) =>
        a.id !== value.id &&
        !["CANCELLED", "COMPLETED"].includes(a.status) &&
        overlaps(a, value) &&
        (a.roomId === value.roomId ||
          a.doctorId === value.doctorId ||
          a.patientId === value.patientId),
    )
  )
    return "เวลานัดซ้อนกับนัดหมายเดิม กรุณาเลือกเวลาใหม่";
  return null;
}
