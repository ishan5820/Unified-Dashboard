import { calendarDayNumber, toLocalDateString, weekdayForDate } from "@/lib/datetime";

export type RelativeDueTone = "none" | "overdue" | "today" | "soon" | "normal";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateLabel(value: string, includeYear: boolean): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}${includeYear ? `, ${year}` : ""}`;
}

export function formatRelativeDue(dueDate: string | null, dueTime: string | null): { label: string; tone: RelativeDueTone } {
  if (!dueDate) return { label: "", tone: "none" };
  const today = toLocalDateString(new Date());
  const distance = calendarDayNumber(dueDate) - calendarDayNumber(today);
  const time = dueTime ? ` · ${dueTime}` : "";

  if (distance < 0) return { label: `Overdue · ${dateLabel(dueDate, false)}`, tone: "overdue" };
  if (distance === 0) return { label: `Today${time}`, tone: "today" };
  if (distance === 1) return { label: "Tomorrow", tone: "soon" };
  if (distance <= 7) return { label: `Next ${WEEKDAYS[weekdayForDate(dueDate)]}`, tone: "soon" };
  return { label: dateLabel(dueDate, dueDate.slice(0, 4) !== today.slice(0, 4)), tone: "normal" };
}
