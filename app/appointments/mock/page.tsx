import AppointmentTimeline from "@/components/appointment-timeline-mock";

export default async function AppointmentTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const query = await searchParams;
  const date =
    typeof query.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(query.date) &&
    Number.isFinite(new Date(`${query.date}T00:00:00Z`).getTime()) &&
    new Date(`${query.date}T00:00:00Z`).toISOString().slice(0, 10) ===
      query.date
      ? query.date
      : "";
  return <AppointmentTimeline initialDate={date} />;
}
