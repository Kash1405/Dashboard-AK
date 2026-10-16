import type { ScheduleRow } from "./vault";

export const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function currentBlock(schedule: ScheduleRow[], now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...schedule].filter((row) => row.start).sort((a, b) => a.start.localeCompare(b.start));
  const current = sorted.find((row) => row.end && toMinutes(row.start) <= minutes && minutes < toMinutes(row.end));
  const next = sorted.find((row) => toMinutes(row.start) > minutes) ?? sorted[0];
  return { current, next, sorted };
}
