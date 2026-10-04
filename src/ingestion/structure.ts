import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type {
  Chunk,
  DocumentType,
  Extracted,
  ProcessedDocument,
  Section,
  SourceMetadata,
} from "./schemas";

export const PROCESSOR_VERSION = "1.0.2";
export const checksum = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
// RFC 4122 UUIDv5, URL namespace, named by original byte checksum.
export function documentIdFor(hash: string) {
  const digest = createHash("sha1")
    .update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update(`depositcheck:sha256:${hash}`)
    .digest();
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function classify(
  title: string,
  text: string,
  url: string | null,
  organisation: string | null
): {
  type: DocumentType;
  subtype: "rtb_tribunal_report" | null;
  basis: string;
} {
  const header = text.slice(0, 2000);
  const rtb = organisation === "Residential Tenancies Board";
  if (
    rtb &&
    /(?:report of (?:tribunal|case) reference|tribunal report)/i.test(header)
  )
    return {
      type: "unknown",
      subtype: "rtb_tribunal_report",
      basis:
        "Tribunal report header; requested taxonomy has no tribunal-report category.",
    };
  if (rtb && /(?:^|\n)\s*DETERMINATION ORDER\s*(?:\n|$)/i.test(header))
    return {
      type: "rtb_determination_order",
      subtype: null,
      basis: "RTB publisher and explicit determination order heading.",
    };
  if (
    rtb &&
    /(?:adjudication report|report of (?:the )?adjudicator)/i.test(header)
  )
    return {
      type: "rtb_adjudication_report",
      subtype: null,
      basis: "RTB publisher and explicit adjudication report heading.",
    };
  if (
    url &&
    /(^|\.)irishstatutebook\.ie$/.test(new URL(url).hostname) &&
    /Residential Tenancies/i.test(text)
  )
    return {
      type: "legislation",
      subtype: null,
      basis: "Irish Statute Book source and Residential Tenancies title/text.",
    };
  if (
    rtb &&
    /statistics|statistical|data insights|annual report|rent index/i.test(title)
  )
    return {
      type: "statistics",
      subtype: null,
      basis: "RTB publisher and statistical publication title.",
    };
  if (rtb && /guide|guidance|security deposits|wear and tear/i.test(title))
    return {
      type: "rtb_guidance",
      subtype: null,
      basis: "RTB publisher and guidance title.",
    };
  return {
    type: "unknown",
    subtype: null,
    basis: "Insufficient explicit metadata; manual classification is required.",
  };
}
function organisationFor(url: string | null, text: string) {
  const host = url ? new URL(url).hostname : "";
  if (
    /(^|\.)rtb\.ie$/.test(host) ||
    /^\s*Residential Tenancies Board\s*$/im.test(text.slice(0, 1500))
  )
    return "Residential Tenancies Board";
  if (/(^|\.)irishstatutebook\.ie$/.test(host)) return "Irish Statute Book";
  return null;
}
function decisionDate(
  text: string
): { value: string; raw: string; kind: "publication" | "decision" } | null {
  const pattern =
    /(?:[Dd]etermination made on|[Oo]rder was made[^\n]{0,100}?on|[Dd]ecision [Dd]ate\s*:|[Dd]ate of (?:[Dd]ecision|[Pp]ublication)\s*:)\s*(\d{1,2}(?:st|nd|rd|th)?[/\s-]+(?:\d{1,2}|[A-Za-z]+)[/\s-]+\d{4})/g;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  const match = matches.at(-1)!;
  const raw = match[1];
  const parts = raw
    .replace(/(\d)(st|nd|rd|th)/g, "$1")
    .trim()
    .split(/[/\s-]+/);
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const month = /^\d+$/.test(parts[1])
    ? Number(parts[1])
    : months.indexOf(parts[1].toLowerCase()) + 1;
  const value = `${parts[2]}-${String(month).padStart(
    2,
    "0"
  )}-${parts[0].padStart(2, "0")}`;
  return z.iso.date().safeParse(value).success
    ? {
        value,
        raw: match[0],
        kind: /publication/i.test(match[0]) ? "publication" : "decision",
      }
    : null;
}
function headingKind(line: string): Section["kind"] {
  const clean = line.replace(/^\s*(?:\d+[.)]?|#+)\s*/, "").toLowerCase();
  if (/^(?:background|matters agreed|facts|factual background)/.test(clean))
    return "background";
  if (
    /^(?:evidence|(?:verbal )?submissions|documents submitted|witness)/.test(
      clean
    )
  )
    return "evidence";
  if (/^(?:findings?|reasons)/.test(clean)) return "findings";
  if (/^determination order\b/.test(clean)) return "order";
  if (/^(?:determination|decision)/.test(clean)) return "decision";
  if (/^order\b/.test(clean)) return "order";
  if (/^(?:section|part|schedule)\s+[\dIVX]+/i.test(clean))
    return "statutory_section";
  return "other";
}
function findSections(
  rawText: string,
  headings: string[],
  type: DocumentType
): Section[] {
  const marks: {
    heading: string | null;
    kind: Section["kind"];
    start: number;
  }[] = [{ heading: null, kind: "other", start: 0 }];
  const explicit = new Set(headings.map((h) => h.trim()));
  for (const match of rawText.matchAll(/[^\n\f]+/g)) {
    const line = match[0].trim();
    if (!line || line.length > 180) continue;
    const kind = headingKind(line);
    const numberedTopic =
      /^\s*(?:\d+[.)]\s+|#+\s+)?(?:background|procedure|evidence|(?:verbal )?submissions(?: of the parties| on behalf of the (?:applicant|respondent) (?:tenant|landlord)s?)?|documents submitted (?:prior to|at) the hearing(?: included)?|findings(?: and reasons)?|determination(?: order)?|decision|order|matters agreed(?: between the parties)?|facts|factual background)\s*:?$/i.test(
        line
      );
    const legal =
      type === "legislation" &&
      (/^(?:section|part|schedule)\s+[\dIVX]+\b/i.test(line) ||
        /^\d+[A-Z]?\s*[.—-]/.test(line));
    if (explicit.has(line) || numberedTopic || legal)
      marks.push({
        heading: line,
        kind: legal
          ? "statutory_section"
          : kind !== "other"
          ? kind
          : type === "rtb_guidance"
          ? "guidance_topic"
          : "other",
        start: match.index,
      });
  }
  return marks
    .filter((mark, i) => mark.start !== marks[i + 1]?.start)
    .map((mark, i, all) => ({
      id: `section-${i + 1}`,
      heading: mark.heading,
      kind: mark.kind,
      rawStart: mark.start,
      rawEnd: all[i + 1]?.start ?? rawText.length,
    }))
    .filter((s) => rawText.slice(s.rawStart, s.rawEnd).trim());
}
function splitEnd(text: string, start: number, end: number, limit: number) {
  if (end - start <= limit) return end;
  const cut = start + limit;
  const floor = start + Math.floor(limit / 2);
  for (const token of ["\n\n", "\n", ". ", " "]) {
    const at = text.lastIndexOf(token, cut - token.length);
    if (at >= floor) return at + token.length;
  }
  return cut;
}

export function structureDocument(
  extracted: Extracted,
  metadata: SourceMetadata,
  file: string,
  hash: string,
  fingerprint: string,
  timestamp: string
): ProcessedDocument {
  let rawText = "";
  const pages = extracted.pages.map((p, i) => {
    if (i) rawText += "\n\f\n";
    const rawStart = rawText.length;
    rawText += p.text;
    return { ...p, rawStart, rawEnd: rawText.length };
  });
  const supplied = { ...extracted.metadata, ...metadata };
  const sourceUrl = supplied.sourceUrl ?? null;
  const headerTitle = rawText
    .split("\n")
    .map((l) => l.trim())
    .find((l) =>
      /^(?:Report of (?:Tribunal|Case)|DETERMINATION ORDER|Adjudication Report)/i.test(
        l
      )
    );
  const title =
    supplied.title ??
    headerTitle ??
    rawText
      .split("\n")
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 200) ??
    path.basename(file);
  const sourceOrganisation =
    supplied.sourceOrganisation ?? organisationFor(sourceUrl, rawText);
  const classification = classify(
    title,
    rawText,
    sourceUrl,
    sourceOrganisation
  );
  const documentType = supplied.documentType ?? classification.type;
  const dateFound = decisionDate(rawText);
  const date = supplied.date ?? dateFound?.value ?? null;
  const id = documentIdFor(hash);
  const sections = findSections(rawText, extracted.headings, documentType);
  const chunks: Chunk[] = [];
  for (const section of sections)
    for (const page of pages) {
      let start = Math.max(section.rawStart, page.rawStart);
      const end = Math.min(section.rawEnd, page.rawEnd);
      while (start < end) {
        const chunkEnd = splitEnd(rawText, start, end, 4500);
        const text = rawText.slice(start, chunkEnd);
        if (text.trim())
          chunks.push({
            id: `${id}:${start}-${chunkEnd}`,
            sectionId: section.id,
            text,
            splitReason:
              chunkEnd < end ||
              start > Math.max(section.rawStart, page.rawStart)
                ? "length_safeguard"
                : section.rawStart < page.rawStart ||
                  section.rawEnd > page.rawEnd
                ? "page"
                : "section",
            provenance: {
              sourceDocumentId: id,
              sourceUrl,
              documentTitle: title,
              documentType,
              date,
              pageNumber: page.pageNumber,
              sectionHeading: section.heading,
              checksum: hash,
              rawStart: start,
              rawEnd: chunkEnd,
            },
          });
        start = chunkEnd;
      }
    }
  const identity = rawText
    .slice(0, 2500)
    .match(/\b(?:TR|DR)\d{4}-\d{4,8}\b|\b(?:TR|DR)\d{6,10}\b/);
  const excerpts = (kinds: Section["kind"][]) => {
    const selected = sections
      .filter((s) => kinds.includes(s.kind))
      .map((s) => ({
        text: rawText.slice(s.rawStart, s.rawEnd),
        sectionId: s.id,
        rawStart: s.rawStart,
        rawEnd: s.rawEnd,
        pageNumbers: [
          ...new Set(
            pages
              .filter(
                (p) =>
                  p.rawEnd > s.rawStart &&
                  p.rawStart < s.rawEnd &&
                  p.pageNumber !== null
              )
              .map((p) => p.pageNumber!)
          ),
        ],
      }));
    return selected.length ? selected : null;
  };
  const reliableCase =
    sourceOrganisation === "Residential Tenancies Board" &&
    identity &&
    (classification.subtype ||
      ["rtb_adjudication_report", "rtb_determination_order"].includes(
        documentType
      ));
  const warnings = [...extracted.warnings];
  if (!sourceUrl)
    warnings.push(
      "Missing source URL: add a .meta.json sidecar before using this material as a citation."
    );
  if (!date)
    warnings.push(
      "No explicitly labelled publication/decision date extracted; hearing and file dates are not substituted."
    );
  if (documentType === "unknown") warnings.push(classification.basis);
  const depositRelevance = /\bdeposit(?:s)?\b/i.test(rawText)
    ? "explicit_mention"
    : "review_required";
  if (depositRelevance === "review_required")
    warnings.push(
      "No explicit deposit mention; review relevance before retrieval."
    );
  return {
    schemaVersion: 1,
    processorVersion: PROCESSOR_VERSION,
    documentId: id,
    checksum: hash,
    metadataFingerprint: fingerprint,
    originalFile: file,
    ingestionTimestamp: timestamp,
    title,
    sourceOrganisation,
    sourceUrl,
    date,
    dateKind: supplied.date
      ? supplied.dateKind ?? null
      : dateFound?.kind ?? null,
    documentType,
    subtype: classification.subtype,
    metadataOrigins: {
      title: metadata.title
        ? "sidecar"
        : extracted.metadata.title
        ? "document metadata"
        : headerTitle
        ? "document header"
        : "first text line / filename fallback",
      sourceUrl: metadata.sourceUrl
        ? "sidecar"
        : extracted.metadata.sourceUrl
        ? "document metadata"
        : "missing",
      sourceOrganisation: metadata.sourceOrganisation
        ? "sidecar"
        : extracted.metadata.sourceOrganisation
        ? "document metadata"
        : sourceOrganisation
        ? "publisher hostname or explicit publisher header"
        : "missing",
      date: metadata.date
        ? "sidecar"
        : extracted.metadata.date
        ? "document metadata"
        : dateFound
        ? "explicit date label in text"
        : "missing",
      documentType: metadata.documentType
        ? "sidecar"
        : extracted.metadata.documentType
        ? "document metadata"
        : "conservative header/title classification",
    },
    classificationBasis: supplied.documentType
      ? "Explicit source metadata; verify against original document."
      : classification.basis,
    dateEvidence: supplied.date ? supplied.date : dateFound?.raw ?? null,
    depositRelevance,
    rawText,
    pages,
    sections,
    chunks,
    preliminaryCase: reliableCase
      ? {
          caseId: identity![0],
          title,
          date,
          sourceUrl,
          sourceDocumentId: id,
          rawFactualSummary: excerpts(["background"]),
          rawEvidenceSection: excerpts(["evidence"]),
          rawFindings: excerpts(["findings"]),
          rawOutcomeOrder: excerpts(["decision", "order"]),
          extractionNote:
            "Verbatim section excerpts, not a generated factual or legal summary.",
        }
      : null,
    warnings,
  };
}
