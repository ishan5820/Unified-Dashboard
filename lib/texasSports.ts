import "server-only";

import { toLocalDateString } from "@/lib/datetime";

export type SportGroup = "football" | "basketball" | "tennis" | "volleyball" | "other";

export interface TexasSportsEvent {
  id: string;
  sport: string;
  group: SportGroup;
  opponent: string;
  date: string;
  time: string | null;
  timeLabel: string;
  location: string;
  tournament: string | null;
  sourceUrl: string;
}

export interface TexasSportsTeam {
  id: string;
  name: string;
  group: SportGroup;
  season: string | null;
  sourceUrl: string;
  events: TexasSportsEvent[];
  available: boolean;
}

const SPORTS: ReadonlyArray<{ id: string; name: string; group: SportGroup }> = [
  { id: "baseball", name: "Baseball", group: "other" },
  { id: "beach-volleyball", name: "Beach Volleyball", group: "volleyball" },
  { id: "football", name: "Football", group: "football" },
  { id: "mens-basketball", name: "Men's Basketball", group: "basketball" },
  { id: "mens-golf", name: "Men's Golf", group: "other" },
  { id: "mens-swimming-and-diving", name: "Men's Swimming & Diving", group: "other" },
  { id: "mens-tennis", name: "Men's Tennis", group: "tennis" },
  { id: "womens-rowing", name: "Rowing", group: "other" },
  { id: "womens-soccer", name: "Soccer", group: "other" },
  { id: "softball", name: "Softball", group: "other" },
  { id: "track-and-field", name: "Track & Field / Cross Country", group: "other" },
  { id: "womens-volleyball", name: "Volleyball", group: "volleyball" },
  { id: "womens-basketball", name: "Women's Basketball", group: "basketball" },
  { id: "womens-golf", name: "Women's Golf", group: "other" },
  { id: "womens-swimming-and-diving", name: "Women's Swimming & Diving", group: "other" },
  { id: "womens-tennis", name: "Women's Tennis", group: "tennis" },
];

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cellText(value: string): string {
  return decodeHtml(value.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseTime(value: string): string | null {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const period = match[3].toLowerCase().startsWith("p") ? "PM" : "AM";
  return `${hour}:${minute} ${period}`;
}

function eventId(teamId: string, date: string, opponent: string, location: string): string {
  return [teamId, date, opponent, location].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseSchedule(html: string, team: (typeof SPORTS)[number], sourceUrl: string): TexasSportsTeam {
  const heading = html.match(/<h1[^>]*>([^<]*Schedule)<\/h1>/i)?.[1];
  const season = heading ? cellText(heading).replace(/ Schedule$/, "") : null;
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!season || !table) return { ...team, season: null, sourceUrl, events: [], available: false };

  const seasonYears = season.match(/(\d{4})(?:-(\d{2,4}))?/);
  if (!seasonYears) return { ...team, season, sourceUrl, events: [], available: false };
  const firstYear = Number(seasonYears[1]);
  const spansAcademicYear = Boolean(seasonYears[2]);
  let currentYear = firstYear;
  let priorMonth: number | null = null;
  const today = toLocalDateString(new Date());
  const events: TexasSportsEvent[] = [];

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cellText(cell[1]));
    if (cells.length < 5) continue;
    const dateMatch = cells[0].match(/^([A-Z][a-z]{2})\s+(\d{1,2})/);
    if (!dateMatch) continue;
    const month = MONTHS[dateMatch[1]];
    const day = Number(dateMatch[2]);
    if (!month || !day) continue;
    if (spansAcademicYear && priorMonth !== null && priorMonth >= 7 && month <= 6) currentYear += 1;
    priorMonth = month;
    const date = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const [timeLabel, designation, opponent, location, tournament] = cells.slice(1, 6);
    // A few tournament schedules currently label every row "Home" even when the
    // listed venue is out of town. Treat a home event as an official Home row
    // that is also in Austin (or has no venue posted yet).
    if (designation !== "Home" || (location && !/\bAustin\b/i.test(location)) || date < today) continue;
    events.push({
      id: eventId(team.id, date, opponent, location),
      sport: team.name,
      group: team.group,
      opponent,
      date,
      time: parseTime(timeLabel),
      timeLabel: timeLabel || "Time TBA",
      location: location || "Austin, Texas",
      tournament: tournament || null,
      sourceUrl,
    });
  }

  return { ...team, season, sourceUrl, events, available: true };
}

async function loadTeam(team: (typeof SPORTS)[number]): Promise<TexasSportsTeam> {
  const sourceUrl = `https://texaslonghorns.com/sports/${team.id}/schedule/text`;
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "College Organizer schedule reader" },
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { ...team, season: null, sourceUrl, events: [], available: false };
    return parseSchedule(await response.text(), team, sourceUrl);
  } catch {
    return { ...team, season: null, sourceUrl, events: [], available: false };
  }
}

export async function getTexasHomeSchedules(): Promise<TexasSportsTeam[]> {
  const teams = await Promise.all(SPORTS.map(loadTeam));
  return teams.sort((a, b) => a.name.localeCompare(b.name));
}
