const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function extractPdfText(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF syllabus.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF syllabi must be 20 MB or smaller.");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let current = "";

      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = item.str.trim();
        if (text) current = current ? `${current} ${text}` : text;
        if (item.hasEOL && current) {
          lines.push(current);
          current = "";
        }
      }
      if (current) lines.push(current);
      if (lines.length) pages.push(lines.join("\n"));
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = pages.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) {
    throw new Error("No selectable text was found. This PDF may be scanned; paste OCR text instead.");
  }
  return text;
}
