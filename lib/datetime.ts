export const APP_TIMEZONE = "America/Chicago";

export function toLocalDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function toLocalTimeString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

export function toTimeInputValue(value: string | null): string {
  if (!value) return "";
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return value;
  let hour = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export function fromTimeInputValue(value: string): string | null {
  if (!value) return null;
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || !minute) return null;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  if (!end) return start;
  const startPeriod = start.match(/\s(AM|PM)$/)?.[1];
  const endPeriod = end.match(/\s(AM|PM)$/)?.[1];
  return startPeriod && startPeriod === endPeriod
    ? `${start.replace(/\s(AM|PM)$/, "")} – ${end}`
    : `${start} – ${end}`;
}

export function timeSortValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(twelveHour[2]);
  }
  const twentyFourHour = value.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
  return Number.POSITIVE_INFINITY;
}

export function compareTimes(left: string | null, right: string | null): number {
  const leftValue = timeSortValue(left);
  const rightValue = timeSortValue(right);

  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function addCalendarDays(value: string, amount: number): string {
  if (!isCalendarDate(value) || !Number.isInteger(amount)) throw new Error(`Invalid calendar-date operation: ${value} + ${amount}`);
  let [year, month, day] = value.split("-").map(Number);
  const direction = Math.sign(amount);
  for (let remaining = Math.abs(amount); remaining > 0; remaining -= 1) {
    day += direction;
    if (day > daysInMonth(year, month)) {
      day = 1; month += 1;
      if (month > 12) { month = 1; year += 1; }
    } else if (day < 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      day = daysInMonth(year, month);
    }
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function weekdayForDate(value: string): number {
  if (!isCalendarDate(value)) throw new Error(`Invalid calendar date: ${value}`);
  const [inputYear, month, day] = value.split("-").map(Number);
  let year = inputYear;
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) year -= 1;
  return (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + offsets[month - 1] + day) % 7;
}

export function calendarDayNumber(value: string): number {
  if (!isCalendarDate(value)) throw new Error(`Invalid calendar date: ${value}`);
  const [inputYear, month, day] = value.split("-").map(Number);
  let year = inputYear;
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}
