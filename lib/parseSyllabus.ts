import { calendarDayNumber, isCalendarDate, toLocalDateString } from "@/lib/datetime";

export interface ParsedSyllabusRow {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  confidence: "high" | "low";
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function dateKey(year: number, month: number, day: number): string | null {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isCalendarDate(value) ? value : null;
}

function expandYear(value: string): number {
  const year = Number(value);
  if (value.length === 4) return year;
  return year <= 69 ? 2000 + year : 1900 + year;
}

export function inferNearestYear(month: number, day: number, referenceDate = new Date()): number {
  const reference = toLocalDateString(referenceDate);
  const currentYear = Number(reference.slice(0, 4));
  const candidates = [currentYear - 1, currentYear, currentYear + 1]
    .map((year) => ({ year, date: dateKey(year, month, day) }))
    .filter((candidate): candidate is { year: number; date: string } => Boolean(candidate.date));
  if (!candidates.length) return currentYear;
  return candidates.sort((left, right) =>
    Math.abs(calendarDayNumber(left.date) - calendarDayNumber(reference)) -
    Math.abs(calendarDayNumber(right.date) - calendarDayNumber(reference)) ||
    Math.abs(left.year - currentYear) - Math.abs(right.year - currentYear))[0].year;
}

function parseDate(value: string, referenceDate: Date): { dueDate: string; match: string } | null {
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const dueDate = dateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (dueDate) return { dueDate, match: iso[0] };
  }

  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = numeric[3] ? expandYear(numeric[3]) : inferNearestYear(month, day, referenceDate);
    const dueDate = dateKey(year, month, day);
    if (dueDate) return { dueDate, match: numeric[0] };
  }

  const named = value.match(/\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : inferNearestYear(month, day, referenceDate);
    const dueDate = dateKey(year, month, day);
    if (dueDate) return { dueDate, match: named[0] };
  }
  return null;
}

function parseTime(value: string): { dueTime: string; match: string } | null {
  const twelveHour = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = twelveHour[2] ?? "00";
    if (hour >= 1 && hour <= 12 && Number(minute) <= 59) {
      return { dueTime: `${hour}:${minute} ${twelveHour[3].toUpperCase()}`, match: twelveHour[0] };
    }
  }
  const twentyFourHour = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    return { dueTime: `${hour % 12 || 12}:${twentyFourHour[2]} ${hour >= 12 ? "PM" : "AM"}`, match: twentyFourHour[0] };
  }
  return null;
}

function stripBullet(value: string): string {
  return value.replace(/^\s*(?:(?:[-*•])|(?:\d+[.)]))\s*/, "").trim();
}

function cleanTitle(value: string, dateMatch?: string, timeMatch?: string): string {
  let title = value;
  if (dateMatch) title = title.replace(dateMatch, " ");
  if (timeMatch) title = title.replace(timeMatch, " ");
  title = title
    .replace(/^\s*(?:week\s+of\s+)?(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)?\s*/i, "")
    .replace(/^[\s:;,|–—-]+|[\s:;,|–—-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return title || "Untitled syllabus item";
}

export function parseSyllabus(input: string, referenceDate = new Date()): ParsedSyllabusRow[] {
  return input.split(/\r?\n/)
    .map(stripBullet)
    .filter(Boolean)
    .map((line) => {
      const parsedDate = parseDate(line, referenceDate);
      const parsedTime = parseTime(line);
      return {
        title: cleanTitle(line, parsedDate?.match, parsedTime?.match),
        dueDate: parsedDate?.dueDate ?? null,
        dueTime: parsedTime?.dueTime ?? null,
        confidence: parsedDate ? "high" as const : "low" as const,
      };
    });
}
