// Design fixtures only. No API, auth or persistence dependencies.
export const MOCK_DATE = "2026-11-10";
export type Interval = { startTime: string; endTime: string };
export type MockDoctor = {
  id: string;
  name: string;
  specialty: string;
  tone: string;
};
export type MockShift = Interval & { doctorId: string };
export type MockBlock = Interval & {
  id: string;
  resource: "ROOM" | "DOCTOR";
  doctorId?: string;
  kind: "LEAVE";
  reason: string;
};
export type MockRoom = {
  id: string;
  name: string;
  type: string;
  opening: Interval[];
  shifts: MockShift[];
  blocks: MockBlock[];
};
export type MockAppointment = Interval & {
  id: string;
  date: string;
  patient: string;
  patientId: string;
  doctorId: string;
  roomId: string;
  complaint: string;
  cancellationReason?: string;
  status: "SCHEDULED" | "WAITING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};

export const mockPatients = [
  { id: "patient-a", name: "คุณอรุณี ดาวประดับ", code: "HN0001", phone: "0800000001" },
  { id: "patient-b", name: "คุณปิยะพร แสงทอง", code: "HN0002", phone: "0800000002" },
  { id: "patient-c", name: "คุณณัฐพล สุขใจ", code: "HN0003", phone: "0800000003" },
  { id: "patient-d", name: "คุณวิรุฬ คงสุข", code: "HN0004", phone: "0800000004" },
  { id: "patient-e", name: "คุณกานต์ ธรรมดี", code: "HN0005", phone: "0800000005" },
  { id: "patient-f", name: "คุณกมล ใจดี", code: "HN0006", phone: "0800000006" },
];

export const mockDoctors: MockDoctor[] = [
  {
    id: "doctor-a",
    name: "พญ.มนา วัฒนกุล",
    specialty: "ผิวหนังและความงาม",
    tone: "mint",
  },
  {
    id: "doctor-b",
    name: "นพ.สมชัย ศรีสุข",
    specialty: "เวชศาสตร์ความงาม",
    tone: "violet",
  },
  {
    id: "doctor-c",
    name: "พญ.สวย สมใจ",
    specialty: "อายุรกรรมทั่วไป",
    tone: "blue",
  },
  {
    id: "doctor-d",
    name: "พญ.แก้ว เจริญดี",
    specialty: "ศัลยกรรมผิวหนัง",
    tone: "peach",
  },
];
export const mockRooms: MockRoom[] = [
  {
    id: "room-1",
    name: "ห้องตรวจ 1",
    type: "ห้องเลเซอร์",
    opening: [{ startTime: "09:00", endTime: "18:00" }],
    shifts: [
      { doctorId: "doctor-a", startTime: "09:00", endTime: "13:00" },
      { doctorId: "doctor-b", startTime: "14:00", endTime: "18:00" },
    ],
    blocks: [],
  },
  {
    id: "room-2",
    name: "ห้องตรวจ 2",
    type: "ห้องตรวจทั่วไป",
    opening: [
      { startTime: "09:00", endTime: "15:00" },
      { startTime: "16:00", endTime: "17:00" },
    ],
    shifts: [
      { doctorId: "doctor-c", startTime: "09:00", endTime: "12:00" },
      { doctorId: "doctor-c", startTime: "13:00", endTime: "15:00" },
      { doctorId: "doctor-c", startTime: "16:00", endTime: "17:00" },
    ],
    blocks: [],
  },
  {
    id: "room-3",
    name: "ห้องตรวจ 3",
    type: "ห้องทรีตเมนต์",
    opening: [{ startTime: "09:00", endTime: "18:00" }],
    shifts: [],
    blocks: [],
  },
  {
    id: "room-4",
    name: "ห้องตรวจ 4",
    type: "ห้องหัตถการ",
    opening: [{ startTime: "09:00", endTime: "18:00" }],
    shifts: [{ doctorId: "doctor-d", startTime: "09:00", endTime: "18:00" }],
    blocks: [
      {
        id: "leave-4",
        resource: "DOCTOR",
        doctorId: "doctor-d",
        kind: "LEAVE",
        reason: "ลาประจำวัน · อนุมัติแล้ว",
        startTime: "09:00",
        endTime: "18:00",
      },
    ],
  },
  {
    id: "room-5",
    name: "ห้องตรวจ 5",
    type: "ห้องผ่าตัดเล็ก",
    opening: [],
    shifts: [],
    blocks: [],
  },
];
export const extraMockRooms: MockRoom[] = Array.from(
  { length: 7 },
  (_, index) => ({
    id: `room-${index + 6}`,
    name: `ห้องตรวจ ${index + 6}`,
    type: "ห้องสำรอง",
    opening: [{ startTime: "09:00", endTime: "18:00" }],
    shifts: [],
    blocks: [],
  }),
);
export const initialMockAppointments: MockAppointment[] = [
  {
    id: "appointment-1",
    date: MOCK_DATE,
    roomId: "room-1",
    doctorId: "doctor-a",
    patientId: "patient-a",
    patient: "คุณอรุณี ดาวประดับ",
    complaint: "ปรึกษาปัญหาผิวและวางแผนเลเซอร์",
    startTime: "10:55",
    endTime: "12:30",
    status: "SCHEDULED",
  },
  {
    id: "appointment-2",
    date: MOCK_DATE,
    roomId: "room-1",
    doctorId: "doctor-a",
    patientId: "patient-a",
    patient: "คุณอรุณี ดาวประดับ",
    complaint: "ติดตามผลการรักษา",
    startTime: "12:30",
    endTime: "13:00",
    status: "SCHEDULED",
  },
  {
    id: "appointment-3",
    date: MOCK_DATE,
    roomId: "room-1",
    doctorId: "doctor-b",
    patientId: "patient-b",
    patient: "คุณปิยะพร แสงทอง",
    complaint: "เลเซอร์รอยสิว",
    startTime: "14:00",
    endTime: "15:15",
    status: "IN_PROGRESS",
  },
  {
    id: "appointment-4",
    date: MOCK_DATE,
    roomId: "room-1",
    doctorId: "doctor-b",
    patientId: "patient-c",
    patient: "คุณณัฐพล สุขใจ",
    complaint: "ปรึกษาหัตถการ",
    startTime: "16:00",
    endTime: "17:00",
    status: "WAITING",
  },
  {
    id: "appointment-5",
    date: MOCK_DATE,
    roomId: "room-2",
    doctorId: "doctor-c",
    patientId: "patient-d",
    patient: "คุณวิรุฬ คงสุข",
    complaint: "ตรวจติดตามอาการ",
    startTime: "09:30",
    endTime: "11:00",
    status: "COMPLETED",
  },
  {
    id: "appointment-6",
    date: MOCK_DATE,
    roomId: "room-2",
    doctorId: "doctor-c",
    patientId: "patient-e",
    patient: "คุณกานต์ ธรรมดี",
    complaint: "ตรวจสุขภาพทั่วไป",
    startTime: "13:15",
    endTime: "14:30",
    status: "SCHEDULED",
  },
];
export const statusLabels: Record<MockAppointment["status"], string> = {
  SCHEDULED: "นัดหมาย",
  WAITING: "รอรักษา",
  IN_PROGRESS: "กำลังรักษา",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};
export function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
export function overlaps(a: Interval, b: Interval) {
  return (
    minutes(a.startTime) < minutes(b.endTime) &&
    minutes(a.endTime) > minutes(b.startTime)
  );
}
export function duration(interval: Interval) {
  return minutes(interval.endTime) - minutes(interval.startTime);
}
export function suggestMockEndTime(
  startTime: string,
  room: MockRoom,
  doctorId: string,
  date: string,
  appointments: MockAppointment[],
) {
  const start = minutes(startTime);
  const shift = room.shifts.find((item) => item.doctorId === doctorId
    && minutes(item.startTime) <= start && minutes(item.endTime) > start);
  const opening = room.opening.find((item) => minutes(item.startTime) <= start
    && minutes(item.endTime) > start);
  if (!shift || !opening) return startTime;
  const boundaries = [minutes(shift.endTime), minutes(opening.endTime)];
  for (const item of appointments) {
    if (item.date === date && !["CANCELLED", "COMPLETED"].includes(item.status)
      && (item.roomId === room.id || item.doctorId === doctorId)
      && minutes(item.startTime) > start) boundaries.push(minutes(item.startTime));
  }
  for (const block of room.blocks) {
    if ((block.resource === "ROOM" || block.doctorId === doctorId)
      && minutes(block.startTime) > start) boundaries.push(minutes(block.startTime));
  }
  const end = Math.min(...boundaries);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
function coveredBy(interval: Interval, ranges: Interval[]) {
  let cursor = minutes(interval.startTime);
  for (const range of [...ranges].sort(
    (a, b) => minutes(a.startTime) - minutes(b.startTime),
  )) {
    if (minutes(range.endTime) <= cursor) continue;
    if (minutes(range.startTime) > cursor) return false;
    cursor = Math.max(cursor, minutes(range.endTime));
    if (cursor >= minutes(interval.endTime)) return true;
  }
  return false;
}
export function validateMockAppointment(
  value: MockAppointment,
  rooms: MockRoom[],
  appointments: MockAppointment[],
) {
  if (!value.patient.trim() || !value.patientId.trim())
    return "กรุณาระบุชื่อและรหัสคนไข้ตัวอย่าง";
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) ||
    duration(value) <= 0
  )
    return "เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุดภายในวันเดียวกัน";
  const room = rooms.find((room) => room.id === value.roomId);
  if (!room || !coveredBy(value, room.opening))
    return "ช่วงเวลานี้อยู่นอกเวลาเปิดห้อง";
  if (
    !coveredBy(
      value,
      room.shifts.filter((shift) => shift.doctorId === value.doctorId),
    )
  )
    return "ช่วงเวลานี้ไม่อยู่ในเวรแพทย์ที่เลือกตลอดทั้งนัด";
  const block = room.blocks.find(
    (block) =>
      (block.resource === "ROOM" || block.doctorId === value.doctorId) &&
      overlaps(block, value),
  );
  if (block)
    return `จองไม่ได้: ${block.reason} (${block.startTime}–${block.endTime})`;
  const collision = appointments.find(
    (item) =>
      item.id !== value.id &&
      item.date === value.date &&
      !["CANCELLED", "COMPLETED"].includes(item.status) &&
      overlaps(item, value) &&
      (item.roomId === value.roomId ||
        item.doctorId === value.doctorId ||
        item.patientId === value.patientId),
  );
  if (collision)
    return `เวลาชนกับนัด ${collision.patient} (${collision.startTime}–${collision.endTime}) · ตรวจแพทย์ ห้อง และคนไข้`;
  return null;
}
