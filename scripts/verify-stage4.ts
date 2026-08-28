import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSyllabus } from "../lib/parseSyllabus";

async function main(): Promise<void> {
const augustReference = new Date("2026-08-27T18:00:00Z");
const formats = parseSyllabus([
  "- Mar 3 — Short response",
  "* March 3 — Long response",
  "• 3/3 — Worksheet",
  "1. 3/3/26 — Quiz",
  "2) 2026-03-03 — Presentation",
  "Mon 3/3 — Discussion",
  "Week of Mar 3 — Reading",
  "Assignment with date TBA",
  "Apr 4 7:00 PM — Evening review",
].join("\n"), augustReference);

assert.equal(formats.length, 9, "Every non-empty line should produce a row.");
for (const row of formats.slice(0, 7)) {
  assert.equal(row.dueDate, "2026-03-03");
  assert.equal(row.confidence, "high");
}
assert.deepEqual(formats[0], { title: "Short response", dueDate: "2026-03-03", dueTime: null, confidence: "high" });
assert.deepEqual(formats[7], { title: "Assignment with date TBA", dueDate: null, dueTime: null, confidence: "low" });
assert.deepEqual(formats[8], { title: "Evening review", dueDate: "2026-04-04", dueTime: "7:00 PM", confidence: "high" });

const januaryFromNovember = parseSyllabus("Jan 20 — First assignment", new Date("2026-11-15T18:00:00Z"));
assert.equal(januaryFromNovember[0].dueDate, "2027-01-20", "Bare January dates in November should resolve to next year.");

const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8")) as Record<string, unknown>;
assert.equal(manifest.start_url, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color, "#059669");
assert.equal(manifest.orientation, "portrait");

async function assertPng(path: string, expectedSize: number): Promise<void> {
  const data = await readFile(new URL(path, import.meta.url));
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(data.readUInt32BE(16), expectedSize);
  assert.equal(data.readUInt32BE(20), expectedSize);
}

await assertPng("../public/icons/icon-192.png", 192);
await assertPng("../public/icons/icon-512.png", 512);
await assertPng("../public/icons/icon-maskable-512.png", 512);

console.log("PASS Stage 4 parser formats, academic-year inference, manifest, and PNG icon assets.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stage 4 verification failed.");
  process.exitCode = 1;
});
