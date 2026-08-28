import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { applyActionToRow, buildSyncPlan, parseCalendar, type SyncAction, type SyncPlan } from "@/lib/icalSync";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database, Task } from "@/types/task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class SyncRequestError extends Error {
  constructor(message: string, readonly status = 400, readonly upstreamStatus?: number) {
    super(message);
    this.name = "SyncRequestError";
  }
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "::" || address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd") || address.toLowerCase().startsWith("fe8") || address.toLowerCase().startsWith("fe9") || address.toLowerCase().startsWith("fea") || address.toLowerCase().startsWith("feb")) return true;
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(address) === 4 ? address : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

async function validateUrl(raw: unknown): Promise<URL> {
  if (typeof raw !== "string" || !raw.trim()) throw new SyncRequestError("icalUrl must be a non-empty string.");
  const normalized = raw.trim().replace(/^webcal:\/\//i, "https://");
  let url: URL;
  try { url = new URL(normalized); } catch { throw new SyncRequestError("icalUrl is not a valid URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SyncRequestError("icalUrl must use http or https.");
  if (url.username || url.password) throw new SyncRequestError("icalUrl must not contain credentials.");
  if (url.hostname.toLowerCase() === "localhost") throw new SyncRequestError("icalUrl resolves to a private address.");
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(url.hostname, { all: true, verbatim: true }); }
  catch { throw new SyncRequestError("Could not resolve the calendar hostname.", 400); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new SyncRequestError("icalUrl resolves to a private address.");
  return url;
}

async function fetchCalendar(rawUrl: unknown): Promise<string> {
  let url = await validateUrl(rawUrl);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "manual", headers: { accept: "text/calendar,text/plain;q=0.9,*/*;q=0.1" } });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") throw new SyncRequestError("Calendar fetch timed out after 15 seconds.", 504);
      throw new SyncRequestError("Could not fetch the calendar feed.", 502);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SyncRequestError("Calendar redirect did not include a destination.", 502, response.status);
      if (redirects === 5) throw new SyncRequestError("Calendar feed redirected too many times.", 502);
      url = await validateUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new SyncRequestError(`Calendar server returned HTTP ${response.status}.`, 502, response.status);
    return response.text();
  }
  throw new SyncRequestError("Calendar feed redirected too many times.", 502);
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function loadExisting(uids: string[]): Promise<{ linked: Task[]; unlinked: Task[] }> {
  const linked: Task[] = [];
  for (const uidChunk of chunks([...new Set(uids)], 200)) {
    if (!uidChunk.length) continue;
    const { data, error } = await supabaseAdmin.from("tasks").select("*").in("canvas_uid", uidChunk);
    if (error) throw new SyncRequestError(`Could not read linked tasks: ${error.message}`, 500);
    linked.push(...data);
  }
  const unlinked: Task[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabaseAdmin.from("tasks").select("*").eq("category", "classes").is("canvas_uid", null).range(from, from + 499);
    if (error) throw new SyncRequestError(`Could not read match candidates: ${error.message}`, 500);
    unlinked.push(...data);
    if (data.length < 500) break;
  }
  return { linked, unlinked };
}

async function derivePlan(icalUrl: unknown): Promise<SyncPlan> {
  const parsed = await parseCalendar(await fetchCalendar(icalUrl));
  const existing = await loadExisting(parsed.items.map((item) => item.canvas_uid));
  return buildSyncPlan(parsed, existing.linked, existing.unlinked);
}

type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

function asInsert(action: SyncAction): TaskInsert {
  const row = applyActionToRow(action);
  const { id: _id, created_at: _created, updated_at: _updated, ...insert } = row as Task;
  void _id; void _created; void _updated;
  return insert;
}

async function executeActions(actions: SyncAction[]) {
  const applied = { created: 0, updated: 0, adopted: 0 };
  const failed: Array<{ actionId: string; error: string }> = [];
  for (const actionChunk of chunks(actions, 500)) {
    const creates = actionChunk.filter((action) => action.type === "create");
    if (creates.length) {
      const { error } = await supabaseAdmin.from("tasks").insert(creates.map(asInsert));
      if (error) creates.forEach(({ actionId }) => failed.push({ actionId, error: error.message }));
      else applied.created += creates.length;
    }
    for (const type of ["update", "adopt"] as const) {
      const selected = actionChunk.filter((action) => action.type === type);
      if (!selected.length) continue;
      const rows = selected.map((action) => ({ id: action.existing!.id, ...asInsert(action) }));
      const { error } = await supabaseAdmin.from("tasks").upsert(rows, { onConflict: "id" });
      if (error) selected.forEach(({ actionId }) => failed.push({ actionId, error: error.message }));
      else applied[type === "update" ? "updated" : "adopted"] += selected.length;
    }
  }
  return { applied, failed };
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { throw new SyncRequestError("Request body must be valid JSON."); }
    if (body.mode !== "preview" && body.mode !== "apply") throw new SyncRequestError("mode must be preview or apply.");
    const plan = await derivePlan(body.icalUrl);
    if (body.mode === "preview") return NextResponse.json({ ok: true, mode: "preview", ...plan });
    if (typeof body.planId !== "string" || typeof body.planHash !== "string" || !Array.isArray(body.approvedActionIds) || body.approvedActionIds.some((id) => typeof id !== "string")) {
      throw new SyncRequestError("Apply requires planId, planHash, and approvedActionIds.");
    }
    if (body.planId !== plan.planId || body.planHash !== plan.planHash) {
      throw new SyncRequestError("This sync plan is stale. Preview the feed again before applying.", 409);
    }
    const approved = new Set(body.approvedActionIds as string[]);
    const known = new Set(plan.actions.flatMap(({ actionId, keepBothActionId }) => [actionId, ...(keepBothActionId ? [keepBothActionId] : [])]));
    if ([...approved].some((id) => !known.has(id))) throw new SyncRequestError("approvedActionIds contains an action that is not in the current plan.", 409);
    if (plan.actions.some(({ actionId, keepBothActionId }) => approved.has(actionId) && Boolean(keepBothActionId && approved.has(keepBothActionId)))) {
      throw new SyncRequestError("Choose either adopt or keep both for a possible match, not both.");
    }
    const selected = plan.actions.flatMap((action): SyncAction[] => {
      if (approved.has(action.actionId)) return [action];
      if (action.type === "adopt" && action.keepBothActionId && approved.has(action.keepBothActionId)) {
        return [{ ...action, type: "create", actionId: action.keepBothActionId, existing: undefined, diff: [] }];
      }
      return [];
    });
    const result = await executeActions(selected);
    if (result.applied.created || result.applied.updated || result.applied.adopted) {
      for (const path of ["/", "/classes", "/orgs", "/social"]) revalidatePath(path);
    }
    return NextResponse.json({ ok: true, mode: "apply", ...result });
  } catch (error) {
    const known = error instanceof SyncRequestError ? error : new SyncRequestError("Calendar sync failed.", 500);
    return NextResponse.json({ ok: false, error: known.message, ...(known.upstreamStatus ? { upstreamStatus: known.upstreamStatus } : {}) }, { status: known.status });
  }
}
