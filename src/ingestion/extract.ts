import "server-only";
import { loadBuffer } from "cheerio";
import { z } from "zod";
import { MetadataSchema } from "./schemas";
import type { Extracted } from "./schemas";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 4_000_000;
const normalize = (text: string) =>
  text.replace(/\r\n?/g, "\n").replaceAll("\0", "");
const decode = (bytes: Buffer) =>
  new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .replace(/^\uFEFF/, "");

async function pdf(bytes: Buffer): Promise<Extracted> {
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error("INVALID_PDF: missing PDF header");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    if (document.numPages > 250)
      throw new Error("PDF_PAGE_LIMIT: maximum 250 pages per file");
    const pages: Extracted["pages"] = [];
    const warnings: string[] = [];
    let total = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let text = "";
      let lastY: number | null = null;
      let lastRight: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        const x = item.transform[4];
        if (
          lastY !== null &&
          Math.abs(y - lastY) > 2 &&
          text &&
          !text.endsWith("\n")
        )
          text += "\n";
        else if (
          lastRight !== null &&
          x - lastRight > 1 &&
          text &&
          !/\s$/.test(text) &&
          !/^\s/.test(item.str)
        )
          text += " ";
        text += item.str;
        if (item.hasEOL) text += "\n";
        lastY = y;
        lastRight = item.hasEOL ? null : x + item.width;
      }
      text = normalize(text);
      total += text.length;
      if (total > MAX_TEXT)
        throw new Error(
          "TEXT_LIMIT: extracted text exceeds 4 million characters"
        );
      if (!text.trim())
        warnings.push(
          `Page ${number} has no extractable text; scanned content may require OCR.`
        );
      pages.push({ pageNumber: number, text });
      page.cleanup();
    }
    if (pages.every((p) => !p.text.trim()))
      throw new Error(
        "OCR_REQUIRED: PDF has no extractable text; provide an OCR text export with page references"
      );
    return { pages, metadata: {}, headings: [], warnings };
  } finally {
    await task.destroy();
  }
}

function html(bytes: Buffer): Extracted {
  const $ = loadBuffer(bytes);
  const metadata: Extracted["metadata"] = {};
  const title = $("h1").first().text().trim() || $("title").text().trim();
  if (title) metadata.title = title;
  const canonical =
    $('link[rel="canonical"]').attr("href") ||
    $('meta[property="og:url"]').attr("content");
  if (canonical && z.url({ protocol: /^https?$/ }).safeParse(canonical).success)
    metadata.sourceUrl = canonical;
  const published = $('meta[property="article:published_time"]').attr(
    "content"
  );
  if (published && z.iso.date().safeParse(published.slice(0, 10)).success) {
    metadata.date = published.slice(0, 10);
    metadata.dateKind = "publication";
  }
  const root = $("main").length
    ? $("main").first().clone()
    : $("article").length
    ? $("article").first().clone()
    : $("body").clone();
  root
    .find(
      'script,style,nav,footer,noscript,iframe,svg,form,[aria-hidden="true"]'
    )
    .remove();
  const headings = root
    .find("h1,h2,h3,h4,h5,h6")
    .map((_, e) => $(e).text().trim())
    .get();
  root.find("br").replaceWith("\n");
  root.find("td,th").append("\t");
  root
    .find("p,div,li,tr,section,article,h1,h2,h3,h4,h5,h6,blockquote")
    .prepend("\n")
    .append("\n");
  const text = normalize(root.text())
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    pages: [{ pageNumber: null, text }],
    metadata,
    headings,
    warnings: [],
  };
}

const JsonDocumentSchema = z
  .object({
    metadata: MetadataSchema.optional(),
    text: z.string().optional(),
    pages: z
      .array(
        z
          .object({ pageNumber: z.number().int().positive(), text: z.string() })
          .strict()
      )
      .optional(),
    sections: z
      .array(
        z
          .object({
            heading: z.string(),
            text: z.string(),
            pageNumber: z.number().int().positive().optional(),
          })
          .strict()
      )
      .optional(),
  })
  .strict()
  .refine(
    (v) =>
      [
        v.text !== undefined,
        v.pages !== undefined,
        v.sections !== undefined,
      ].filter(Boolean).length === 1,
    "Provide exactly one of text, pages or sections"
  );

export async function extractFile(
  bytes: Buffer,
  extension: string
): Promise<Extracted> {
  if (!bytes.length) throw new Error("EMPTY_FILE: document is empty");
  if (bytes.length > MAX_FILE_BYTES)
    throw new Error("FILE_LIMIT: maximum file size is 25 MiB");
  let result: Extracted;
  if (extension === ".pdf") result = await pdf(bytes);
  else if (extension === ".html" || extension === ".htm") result = html(bytes);
  else if (extension === ".txt") {
    const text = normalize(decode(bytes));
    const paginated = text.includes("\f");
    result = {
      pages: text
        .split("\f")
        .map((text, i) => ({ pageNumber: paginated ? i + 1 : null, text })),
      metadata: {},
      headings: [],
      warnings: [],
    };
  } else if (extension === ".json") {
    const text = decode(bytes);
    const value: unknown = JSON.parse(text);
    const hasEnvelope =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      ["text", "pages", "sections", "metadata"].some((key) => key in value);
    if (hasEnvelope) {
      const parsed = JsonDocumentSchema.parse(value);
      const pages = parsed.pages ??
        parsed.sections?.map((s) => ({
          pageNumber: s.pageNumber ?? null,
          text: `${s.heading}\n${s.text}`,
        })) ?? [{ pageNumber: null, text: parsed.text! }];
      result = {
        pages: pages.map((p) => ({ ...p, text: normalize(p.text) })),
        metadata: parsed.metadata ?? {},
        headings: parsed.sections?.map((s) => s.heading) ?? [],
        warnings: [],
      };
    } else
      result = {
        pages: [{ pageNumber: null, text: normalize(text) }],
        metadata: {},
        headings: [],
        warnings: [
          "Unstructured JSON preserved as text. Provide a text/pages/sections envelope for semantic extraction.",
        ],
      };
  } else
    throw new Error(
      "UNSUPPORTED_FORMAT: supported formats are PDF, HTML, TXT and JSON"
    );
  const text = result.pages.map((p) => p.text).join("\n");
  if (!text.trim()) throw new Error("EMPTY_TEXT: no extractable document text");
  if (text.length > MAX_TEXT)
    throw new Error("TEXT_LIMIT: extracted text exceeds 4 million characters");
  if (
    /^(?:\s)*(?:access denied|just a moment|verify you are human|attention required)/i.test(
      text
    )
  )
    throw new Error(
      "ACCESS_CONTROL_PAGE: save the actual document manually; do not ingest a challenge page"
    );
  return result;
}
