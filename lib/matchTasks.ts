import { calendarDayNumber } from "@/lib/datetime";
import type { TaskCategory, TaskKind } from "@/types/task";

export interface MatchCandidate {
  id?: string;
  title: string;
  course_code: string | null;
  due_date: string | null;
  category: TaskCategory;
  kind: TaskKind;
}

export interface MatchResult<T extends MatchCandidate> {
  row: T;
  score: number;
  confidence: "high" | "low";
}

export function normalizeTitle(value: string): string {
  return value.toLowerCase()
    .replace(/^\s*[a-z]{2,4}\s*\d{3}[a-z]?\s*[-–—:]\s*/i, "")
    .replace(/p\.?\s*s\.?\s*(\d+)/gi, "problem set $1")
    .replace(/problem\s*set\s*(\d+)/gi, "problem set $1")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function titleSimilarity(left: string, right: string): number {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (a === b) return 1;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const tokenScore = union ? intersection / union : 0;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let j = 1; j <= b.length; j += 1) {
    let diagonal = rows[0]; rows[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const above = rows[i];
      rows[i] = Math.min(rows[i] + 1, rows[i - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]));
      diagonal = above;
    }
  }
  return Math.max(tokenScore, 1 - rows[a.length] / Math.max(a.length, b.length, 1));
}

function sameCourse(a: MatchCandidate, b: MatchCandidate): boolean {
  if (!a.course_code || !b.course_code) return false;
  const clean = (value: string) => value.replace(/\s/g, "").toLowerCase();
  return clean(a.course_code) === clean(b.course_code);
}

function dateDistance(a: MatchCandidate, b: MatchCandidate): number | null {
  if (!a.due_date || !b.due_date) return null;
  try { return Math.abs(calendarDayNumber(a.due_date) - calendarDayNumber(b.due_date)); }
  catch { return null; }
}

export function scoreMatch(a: MatchCandidate, b: MatchCandidate): number {
  if (a.category !== b.category || a.kind !== b.kind) return 0;
  const title = titleSimilarity(a.title, b.title);
  const course = sameCourse(a, b) ? 1 : 0;
  const distance = dateDistance(a, b);
  const date = distance === null ? 0 : Math.max(0, 1 - distance / 42);
  return Math.min(1, title * 0.7 + course * 0.2 + date * 0.1);
}

export function findMatch<T extends MatchCandidate>(incoming: MatchCandidate, existing: T[]): MatchResult<T> | null {
  let best: MatchResult<T> | null = null;
  for (const row of existing) {
    if (row.category !== incoming.category || row.kind !== incoming.kind) continue;
    const similarity = titleSimilarity(incoming.title, row.title);
    const courseMatches = sameCourse(incoming, row);
    const distance = dateDistance(incoming, row);
    const confidence = normalizeTitle(incoming.title) === normalizeTitle(row.title)
      || (similarity >= 0.85 && courseMatches && distance !== null && distance <= 21)
      ? "high"
      : similarity >= 0.6 && courseMatches ? "low" : null;
    if (!confidence) continue;
    const score = scoreMatch(incoming, row);
    if (!best || score > best.score) best = { row, score, confidence };
  }
  return best;
}
