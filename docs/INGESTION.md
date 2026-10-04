# Public data ingestion

## 1. Where to get genuine source material

Use the publisher's public document, not a generated case summary:

- [RTB adjudication and tribunal orders](https://rtb.ie/disputes/dispute-outcomes-and-orders/adjudication-and-tribunal-orders/): filter for **Deposit retention**, then download the published order and available hearing report. Keep their identities and dates separate.
- [RTB guide to evidence](https://rtb.ie/disputes/guide-to-evidence/): save the page as HTML. Its deposit-retention topic is relevant to the corpus.
- [RTB data insights](https://rtb.ie/data-insights/): use deposit-dispute statistics for context only, never as individual findings.
- [Irish Statute Book](https://www.irishstatutebook.ie/): save the relevant Residential Tenancies legislation directly. Record the exact publication/version URL; this ingestion step does not determine which version applies or resolve amendments.

Do not bypass login, bot challenges, rate limits or access controls. If downloading fails, use normal browser access and save the public document manually. If it is not accessible, stop; do not substitute a fabricated case or citation. No website crawling is built into ingestion.

## 2. Which documents to collect

Prioritise deposit-retention orders and accompanying factual reports addressing condition, wear and tear, cleaning, painting, unpaid rent or utilities. Five to ten relevant cases is enough for this seed. Keep the final order separate from a report's account of an earlier adjudication; a report can quote a prior outcome that was later changed.

Classifications are exactly `rtb_determination_order`, `rtb_adjudication_report`, `rtb_guidance`, `legislation`, `statistics`, `unknown`. They use explicit publisher/header/title signals, not an AI model. Manual overrides are recorded as sidecar metadata.

The requested list does **not** include tribunal reports. A recognised tribunal report is therefore `documentType: "unknown"` with `subtype: "rtb_tribunal_report"` and an explanatory warning. It is never mislabeled as an adjudication report or determination order. Its identifiable raw case sections can still be extracted.

## 3. Where to place files and metadata

Put public documents in `data/raw/`, or `$DATA_DIR/raw/` when configured. Nested folders are supported. Originals are never changed. Supported extensions are `.pdf`, `.html`, `.htm`, `.txt`, `.json` (case-insensitive). Hidden files and `*.meta.json` sidecars are excluded from document scanning; other unsupported files receive failed manifest entries.

Add a sidecar with the complete source filename plus `.meta.json`. For example, `guide-to-evidence.html.meta.json`:

```json
{
  "sourceUrl": "https://rtb.ie/disputes/guide-to-evidence/",
  "sourceOrganisation": "Residential Tenancies Board",
  "title": "Guide to evidence",
  "documentType": "rtb_guidance"
}
```

Optional fields are `title`, `sourceOrganisation`, `sourceUrl`, `documentType`, `date` (YYYY-MM-DD), and `dateKind` (`publication` or `decision`). Copy dates only when stated by the source. Do not use download time, hearing date, a year from the URL or PDF file-creation metadata as the decision date. Unknown metadata stays `null`; source-less documents are processed with a missing-citation warning. Sidecar assertions are attributed to the sidecar, not described as independently verified.

PDF text retains physical, one-based PDF page numbers. Scanned/image-only PDFs produce `OCR_REQUIRED`, not invented text. OCR is not implemented: supply an independently checked text/JSON export with original page references and retain the PDF. TXT form-feed characters create page boundaries; otherwise page numbers are null. HTML drops navigation, scripts, styles, forms and footers and reads main/article content with headings. Raw HTML remains on disk.

TXT must be UTF-8. HTML uses its declared encoding. JSON may use one of these explicit envelopes:

```json
{
  "metadata": { "title": "Synthetic format example" },
  "pages": [{ "pageNumber": 1, "text": "Source text copied from page one." }]
}
```

Alternatively use `text: "..."` or `sections: [{ "heading": "...", "text": "...", "pageNumber": 1 }]`. Supply exactly one body form. Generic valid JSON is preserved as text with a warning; malformed envelopes fail explicitly. Page numbers in JSON are supplied references, not independently verified PDF page locations.

Limits: 25 MiB per file, 250 PDF pages, four million extracted characters. Split larger files into clearly identified source parts manually. Symlinks and traversal paths are rejected. Processing only reads local files; source URLs are provenance, never download instructions.

## 4. Commands

Use Node 24+ and install dependencies:

```sh
npm install
npm run ingest
```

No frontend, running Next.js server, API key, OpenAI invocation or network is needed. `.env.local` is loaded using the existing environment helper. `DATA_DIR` defaults to `./data` relative to the project working directory.

The optional seed command downloads only the six allowlisted public RTB sources in `docs/seed-sources.json`:

```sh
npm run seed:public
npm run ingest
```

The seed downloader checks PDF checksums, bounds response size, follows only RTB HTTPS redirects, and stops on errors or changed PDF bytes. It does not overwrite existing documents/sidecars. The evidence-guide HTML is a live page and may change, so its current bytes receive a new ingestion checksum rather than a fixed download checksum. Downloads stay local and gitignored; the source catalogue is committed so the corpus can be reproduced. If any download fails, use the manual process above.

The local API also accepts `POST /api/ingestion/documents` with `{ "rawPath": "guide-to-evidence.html" }`. It processes a single already-local file and preserves other manifest entries. It does not accept remote URLs or uploads. Valid processing returns 200, individual file failures 422, lock conflicts 409. CLI is the preferred batch interface.

## 5. Processed output and manifest

Each unique byte content produces `data/processed/<documentId>.json`. It contains:

- Version, checksum, deterministic document ID, original file and ingestion timestamp.
- Title, publisher, URL, date and date kind, classification/subtype, field-level metadata origins, classification basis and exact date-label evidence.
- `rawText`: the full extracted text, preserving wording; PDF page text is joined with a form-feed separator. This is extracted text, not original binary bytes, and text extraction can alter layout/spacing.
- `pages`: extracted text and raw-text offset ranges for each page.
- `sections`: detected heading, semantic kind and raw-text offsets.
- `chunks`: exact text slices and complete provenance.
- `preliminaryCase`: source-derived case ID and verbatim section excerpts, or null if identity/type cannot be established reliably.
- Warnings, including missing dates/URLs, blank PDF pages, unsupported taxonomy or unclear deposit relevance.

Preliminary case fields are `caseId`, `title`, `date`, `sourceUrl`, `sourceDocumentId`, `rawFactualSummary`, `rawEvidenceSection`, `rawFindings`, `rawOutcomeOrder`. Despite the field name, `rawFactualSummary` is an array of original background/agreed-fact excerpts, **not** a generated summary. Each excerpt includes text, section ID, page numbers and offsets. Missing sections are null. Earlier outcomes quoted in Background are not promoted to the final outcome field. No legal ontology, structured liability finding or outcome inference is performed.

`data/processed/manifest.json` records document ID, original filename, source organisation/URL, raw checksum, ingestion timestamp, type, chunk count, processing status, errors/warnings, processed path, processed checksum, metadata fingerprint and duplicate origin. Status is `ingested`, `unchanged`, `duplicate`, or `failed`. The manifest also records whether the run completed. CLI returns exit code 1 if any file failed, while continuing to process other files.

SQLite's existing `public_documents` table receives one content-addressed metadata record per ingested document, with links to raw and processed paths. Missing source URLs remain null and unclassified documents remain unknown. Case/evidence persistence is unchanged.

## 6. Provenance, chunking and deduplication

Every chunk includes source document ID, URL (or null), title, type, date (or null), page number (or null), section heading, original checksum and start/end offsets. Its text must equal `rawText.slice(rawStart, rawEnd)`. No generated text is inserted into these source excerpts.

Chunking starts with semantic headings such as Background, Submissions, Findings and Reasons, Determination, Order, statutory sections and HTML guidance topics. Sections are then bounded by physical pages so a chunk never falsely claims a single page for multi-page text. Long sections are split at paragraph, line, sentence or word boundaries; a 4,500-character limit is the secondary safeguard. Chunks are marked with the split reason. Legal citations inside report paragraphs are not statutory section headings. PDF reading order and complex tables still need human review against the original.

Raw SHA-256 identifies exact duplicates. Document IDs use UUIDv5 of that checksum; renaming identical bytes does not change the ID. Chunk IDs combine document ID and text offsets. Unchanged reruns preserve processed files byte-for-byte and do not add SQLite rows. Sidecar/processor changes reprocess the same content ID to refresh provenance. Different original bytes are retained as separate source versions, even if the URL matches; ingestion does not declare different versions equivalent.

Identical-byte aliases share the canonical document. Files with metadata are processed first, then filename order. Conflicting sidecars fail explicitly instead of silently changing provenance. Consumers must use successful entries from the latest **complete manifest**, deduplicate by document ID, and review missing-source/relevance warnings. Never glob every processed JSON file: historic output files and SQLite rows may remain after source replacement or removal. Full scans exclude removed raw files from the active manifest; originals and historical outputs are not deleted automatically.

Writes use temporary files plus atomic rename; a lock prevents competing runs. A corrupted/missing document output is rebuilt from the original. A corrupted manifest is not silently overwritten. Recovery: stop any active ingestion; preserve the damaged manifest or stale lock outside `processed/`, then rerun. Never remove an active lock. The CLI prints file-level errors, while originals stay available for inspection. This is a local single-user tool, not a multi-user import service.

## 7. Current genuine seed corpus

Downloaded directly from public RTB URLs and ingested on 4 October 2026. Five genuine deposit-related tribunal reports and one evidence guide are present locally. No mock UI cases are included. Sources and pinned PDF checksums are in [seed-sources.json](seed-sources.json).

| Source case / document                                                                                         | Decision date explicitly extracted          | PDF pages            | Chunks |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------- | ------ |
| [TR0001016 / DR0002199](https://rtb.ie/wp-content/uploads/2026/06/1016-Tribunal-report-issued.pdf)             | Not stated in the signed determination text | 9                    | 19     |
| [TR0225-008504](https://www.rtb.ie/wp-content/uploads/2025/09/TR0225-008504-DR1124-100828-Tribunal-report.pdf) | 2025-05-13                                  | 6                    | 14     |
| [TR0519-003760](https://www.rtb.ie/wp-content/uploads/2025/05/TR0519-003760_Report.pdf)                        | 2019-08-21                                  | 5                    | 12     |
| [TR0625-008843](https://rtb.ie/wp-content/uploads/2025/11/TR0625-008843-DR1124-101040-Tribunal-report.pdf)     | 2025-10-03                                  | 11                   | 19     |
| [TR1219-004124](https://www.rtb.ie/wp-content/uploads/2025/05/TR1219-004124-DR1019-57847.pdf)                  | 2021-11-30                                  | 12                   | 19     |
| [Guide to evidence](https://rtb.ie/disputes/guide-to-evidence/)                                                | Publication date unavailable                | HTML; no page number | 22     |

Total: 6 documents, 105 chunks, 5 preliminary case records. The reports retain subtype `rtb_tribunal_report` under `unknown` as explained above. No legislation or statistical publication has been seeded; acquisition instructions are provided rather than inventing legal text or citations.

## Tests and boundaries

`npm test` covers PDF page extraction, blank/scanned and malformed PDFs, TXT/HTML/JSON, classifications, dates, verbatim case extraction, semantic boundaries, provenance offsets, deterministic IDs, duplicates, metadata conflicts, re-ingestion, corrupt-output recovery, traversal/symlinks, locks and the local API. Test fixtures are explicitly synthetic and never enter the seed corpus. Existing UI, persistence and environment tests remain.

`npm run build`, `npm run lint`, `npm run typecheck`, and `npm run check:client` cover integration. Retrieval, reasoning, legal ontology, decision graphs and agents remain unimplemented. The UI continues using its existing mock data.
