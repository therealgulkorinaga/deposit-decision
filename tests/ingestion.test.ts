import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractFile } from "../src/ingestion/extract";
import {
  checksum,
  documentIdFor,
  structureDocument,
} from "../src/ingestion/structure";
import { runIngestion } from "../src/ingestion/runner";
import { ProcessedDocumentSchema } from "../src/ingestion/schemas";
import { openDatabase } from "../src/lib/server/database";
import { POST } from "../src/app/api/ingestion/documents/route";

// Entirely synthetic test content: this is never included in the genuine seed corpus.
const source = "https://example.org/synthetic-test";
const text =
  "Residential Tenancies Board\nReport of Tribunal Reference No: TR0124-123456\n1. Background:\nSynthetic deposit dispute for parser tests only.\n5. Submissions of the Parties:\nSynthetic evidence text, not a real finding.\n7. Findings and Reasons:\nSynthetic finding.\n8. Determination:\nSynthetic order.\nThe Tribunal hereby notifies the Residential Tenancies Board of this Determination made on 20/02/2024.";
const timestamp = "2026-01-01T00:00:00.000Z";
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "depositcheck-ingestion-"));
  mkdirSync(path.join(dir, "raw"));
  return dir;
}
function put(
  dir: string,
  name: string,
  content: string | Buffer,
  metadata?: unknown
) {
  writeFileSync(path.join(dir, "raw", name), content);
  if (metadata)
    writeFileSync(
      path.join(dir, "raw", `${name}.meta.json`),
      JSON.stringify(metadata)
    );
}
function load(dir: string, filename: string) {
  return ProcessedDocumentSchema.parse(
    JSON.parse(readFileSync(path.join(dir, filename), "utf8"))
  );
}

// Minimal two-page PDF built in memory, with a valid xref. No fixture pretends to be an RTB case.
function syntheticPdf(blank = false) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const content of blank
    ? ["", ""]
    : [
        "BT /F1 12 Tf 50 700 Td (Background) Tj 0 -25 Td (Synthetic deposit evidence, page one.) Tj ET",
        "BT /F1 12 Tf 50 700 Td (Decision) Tj 0 -25 Td (Synthetic outcome, page two.) Tj ET",
      ])
    objects.push(
      `<< /Length ${Buffer.byteLength(
        content
      )} >>\nstream\n${content}\nendstream`
    );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test("PDF extraction retains physical page numbers and text", async () => {
  const result = await extractFile(syntheticPdf(), ".pdf");
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[1].pageNumber, 2);
  assert.match(result.pages[0].text, /Synthetic deposit evidence/);
  assert.match(result.pages[1].text, /Synthetic outcome/);
});
test("blank/scanned PDFs and access-control pages require manual intervention", async () => {
  await assert.rejects(extractFile(syntheticPdf(true), ".pdf"), /OCR_REQUIRED/);
  await assert.rejects(extractFile(Buffer.from("%PDF-1.7\ncorrupt"), ".pdf"));
  await assert.rejects(
    extractFile(
      Buffer.from(
        "<html><body><h1>Just a moment</h1>Verify you are human</body></html>"
      ),
      ".html"
    ),
    /ACCESS_CONTROL_PAGE/
  );
});
test("classification distinguishes official orders, adjudication reports, guidance, legislation and statistics", async () => {
  const samples = [
    [
      "Residential Tenancies Board\nDETERMINATION ORDER\nREF: DR0001234\nSynthetic deposit test only.",
      "https://rtb.ie/test",
      "rtb_determination_order",
    ],
    [
      "Residential Tenancies Board\nAdjudication Report\nSynthetic deposit test only.",
      "https://rtb.ie/test",
      "rtb_adjudication_report",
    ],
    [
      "Guide to security deposits\nSynthetic test only.",
      "https://rtb.ie/test",
      "rtb_guidance",
    ],
    [
      "Residential Tenancies Act\nSynthetic parser fixture, no legal provisions.",
      "https://www.irishstatutebook.ie/test",
      "legislation",
    ],
    [
      "Dispute statistics\nSynthetic deposit statistics fixture.",
      "https://rtb.ie/test",
      "statistics",
    ],
  ];
  for (const [sample, url, expected] of samples) {
    const doc = structureDocument(
      await extractFile(Buffer.from(sample), ".txt"),
      { sourceUrl: url },
      "test.txt",
      checksum(sample),
      "test",
      timestamp
    );
    assert.equal(doc.documentType, expected);
    if (expected === "rtb_determination_order")
      assert.match(
        doc.preliminaryCase!.rawOutcomeOrder![0].text,
        /Synthetic deposit test only/
      );
  }
});
test("TXT, HTML and JSON preserve content without inventing unavailable page numbers", async () => {
  const plain = await extractFile(Buffer.from(text), ".txt");
  assert.equal(plain.pages[0].text, text);
  assert.equal(plain.pages[0].pageNumber, null);
  const html = await extractFile(
    Buffer.from(
      "<html><head><title>Synthetic guide</title></head><body><nav>noise</nav><main><h1>Deposit guidance</h1><h2>Evidence</h2><p>Keep the invoice.</p><script>not source text</script></main></body></html>"
    ),
    ".html"
  );
  assert.match(html.pages[0].text, /Keep the invoice/);
  assert.ok(!html.pages[0].text.includes("noise"));
  assert.ok(!html.pages[0].text.includes("not source text"));
  assert.deepEqual(html.headings, ["Deposit guidance", "Evidence"]);
  const json = await extractFile(
    Buffer.from(
      JSON.stringify({ pages: [{ pageNumber: 3, text: "A deposit document" }] })
    ),
    ".json"
  );
  assert.equal(json.pages[0].pageNumber, 3);
  const generic = await extractFile(Buffer.from('{"count":12}'), ".json");
  assert.equal(generic.pages[0].text, '{"count":12}');
});
test("deterministic IDs, semantic sections, exact chunk provenance and raw RTB case excerpts", async () => {
  const bytes = Buffer.from(text);
  const hash = checksum(bytes);
  const extracted = await extractFile(bytes, ".txt");
  const doc = structureDocument(
    extracted,
    { sourceUrl: source },
    "synthetic.txt",
    hash,
    "test",
    timestamp
  );
  assert.equal(doc.documentId, documentIdFor(hash));
  assert.equal(
    doc.documentId,
    structureDocument(
      extracted,
      { sourceUrl: source },
      "renamed.txt",
      hash,
      "test",
      timestamp
    ).documentId
  );
  assert.equal(doc.documentType, "unknown");
  assert.equal(doc.subtype, "rtb_tribunal_report");
  assert.equal(doc.date, "2024-02-20");
  assert.equal(doc.preliminaryCase?.caseId, "TR0124-123456");
  assert.match(doc.preliminaryCase!.rawFindings![0].text, /Synthetic finding/);
  assert.match(
    doc.preliminaryCase!.rawOutcomeOrder![0].text,
    /Synthetic order/
  );
  assert.ok(
    !doc.preliminaryCase!.rawOutcomeOrder![0].text.includes("Synthetic finding")
  );
  for (const chunk of doc.chunks) {
    assert.equal(chunk.provenance.sourceDocumentId, doc.documentId);
    assert.equal(chunk.provenance.sourceUrl, source);
    assert.equal(chunk.provenance.documentTitle, doc.title);
    assert.equal(chunk.provenance.documentType, doc.documentType);
    assert.equal(chunk.provenance.date, doc.date);
    assert.equal(
      chunk.text,
      doc.rawText.slice(chunk.provenance.rawStart, chunk.provenance.rawEnd)
    );
  }
});
test("missing metadata stays null; hearing dates and dates in narrative are not decision dates", async () => {
  const extracted = await extractFile(
    Buffer.from(
      "Unattributed deposit text\nDate & time of Hearing: 15 November 2021\nThe tenancy began on 1 January 2020."
    ),
    ".txt"
  );
  const doc = structureDocument(
    extracted,
    {},
    "unknown.txt",
    checksum("x"),
    "test",
    timestamp
  );
  assert.equal(doc.sourceUrl, null);
  assert.equal(doc.date, null);
  assert.equal(doc.preliminaryCase, null);
  assert.ok(doc.warnings.some((w) => w.includes("Missing source URL")));
});
test("statutory references inside case findings do not truncate those findings", async () => {
  const sample = text.replace(
    "Synthetic finding.",
    "Synthetic finding.\nSection 12(1)(d) of the Act is quoted here.\nRemaining findings must stay in this section."
  );
  const doc = structureDocument(
    await extractFile(Buffer.from(sample), ".txt"),
    {},
    "reference.txt",
    checksum(sample),
    "test",
    timestamp
  );
  assert.match(doc.preliminaryCase!.rawFindings![0].text, /Remaining findings/);
  assert.ok(!doc.sections.some((s) => s.kind === "statutory_section"));
});
test("publication labels are preserved as publication dates and verbal submissions remain evidence", async () => {
  const sample =
    "Synthetic deposit guidance\nDate of Publication: 2 February 2024\n5. Verbal Submissions\nA statement.";
  const doc = structureDocument(
    await extractFile(Buffer.from(sample), ".txt"),
    {},
    "publication.txt",
    checksum(sample),
    "test",
    timestamp
  );
  assert.equal(doc.date, "2024-02-02");
  assert.equal(doc.dateKind, "publication");
  assert.ok(
    doc.sections.some(
      (s) => s.kind === "evidence" && s.heading === "5. Verbal Submissions"
    )
  );
});
test("long semantic sections use bounded chunks while retaining all source text and page provenance", async () => {
  const extracted = await extractFile(
    Buffer.from(
      `Background\n${"A synthetic deposit paragraph. ".repeat(
        500
      )}\fDecision\nSynthetic second page.`
    ),
    ".txt"
  );
  const doc = structureDocument(
    extracted,
    {},
    "long.txt",
    checksum("long"),
    "test",
    timestamp
  );
  assert.ok(doc.chunks.some((c) => c.splitReason === "length_safeguard"));
  assert.ok(doc.chunks.every((c) => c.text.length <= 4500));
  assert.ok(doc.chunks.some((c) => c.provenance.pageNumber === 2));
  assert.equal(
    doc.chunks
      .map((c) => c.text)
      .join("")
      .replace(/\s/g, ""),
    doc.rawText.replace(/\s/g, "")
  );
});
test("duplicate files and reruns produce one document and one SQLite row; corrupt output is repaired", async () => {
  const dir = fixture();
  try {
    put(dir, "original.txt", text, { sourceUrl: source });
    put(dir, "copy.txt", text);
    const first = await runIngestion({ dataDir: dir });
    assert.deepEqual(
      first.entries.map((e) => e.status),
      ["ingested", "duplicate"]
    );
    const output = first.entries[0].processedFile!;
    const before = readFileSync(path.join(dir, output), "utf8");
    const second = await runIngestion({ dataDir: dir });
    assert.deepEqual(
      second.entries.map((e) => e.status),
      ["unchanged", "duplicate"]
    );
    assert.equal(readFileSync(path.join(dir, output), "utf8"), before);
    assert.equal(
      readdirSync(path.join(dir, "processed")).filter(
        (f) => f !== "manifest.json"
      ).length,
      1
    );
    const db = openDatabase(path.join(dir, "depositcheck.sqlite"));
    try {
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM public_documents").get()?.n,
        1
      );
    } finally {
      db.close();
    }
    writeFileSync(path.join(dir, output), "{broken");
    const repaired = await runIngestion({ dataDir: dir });
    assert.equal(repaired.entries[0].status, "ingested");
    assert.equal(load(dir, output).documentId, first.entries[0].documentId);
    writeFileSync(
      path.join(dir, "raw/original.txt.meta.json"),
      JSON.stringify({ sourceUrl: source, title: "Corrected source title" })
    );
    const corrected = await runIngestion({ dataDir: dir });
    assert.equal(corrected.entries[0].status, "ingested");
    assert.equal(
      load(dir, output).chunks[0].provenance.documentTitle,
      "Corrected source title"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("malformed documents fail individually, valid files continue and repaired files can rerun", async () => {
  const dir = fixture();
  try {
    put(dir, "broken.json", "{bad");
    put(dir, "bad.pdf", "not a PDF");
    put(dir, "empty.txt", "");
    put(dir, "good.txt", text);
    put(dir, "bad-meta.txt", text, { sourceUrl: "invented" });
    const first = await runIngestion({ dataDir: dir });
    assert.equal(first.entries.filter((e) => e.status === "failed").length, 4);
    assert.equal(
      first.entries.filter((e) => e.status === "ingested").length,
      1
    );
    assert.ok(
      first.entries
        .filter((e) => e.status === "failed")
        .every(
          (e) =>
            e.errors.length && e.chunkCount === 0 && e.processedFile === null
        )
    );
    put(dir, "broken.json", '{"text":"Recovered deposit text"}');
    const second = await runIngestion({ dataDir: dir });
    assert.equal(
      second.entries.find((e) => e.originalFile === "broken.json")?.status,
      "ingested"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("symlinks, path traversal, duplicate metadata conflicts and concurrent runs are rejected", async () => {
  const dir = fixture();
  try {
    put(dir, "a.txt", text, { sourceUrl: source });
    put(dir, "b.txt", text, { sourceUrl: "https://example.org/different" });
    symlinkSync(path.join(dir, "raw/a.txt"), path.join(dir, "raw/link.txt"));
    const result = await runIngestion({ dataDir: dir });
    assert.match(
      result.entries.find((e) => e.originalFile === "b.txt")!.errors[0],
      /DUPLICATE_METADATA_CONFLICT/
    );
    assert.match(
      result.entries.find((e) => e.originalFile === "link.txt")!.errors[0],
      /SYMLINK_REJECTED/
    );
    await assert.rejects(runIngestion({ dataDir: dir, only: "../escape.txt" }));
    writeFileSync(
      path.join(dir, "processed/.ingestion.lock"),
      "synthetic lock"
    );
    await assert.rejects(runIngestion({ dataDir: dir }), /INGESTION_LOCKED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("local ingestion API accepts only raw paths and returns explicit processing failures", async () => {
  const dir = fixture();
  const before = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const request = (value: unknown) =>
    new Request("http://localhost/api/ingestion/documents", {
      method: "POST",
      body: JSON.stringify(value),
    });
  try {
    put(dir, "example.txt", text, { sourceUrl: source });
    put(dir, "bad.pdf", "bad");
    const response = await POST(request({ rawPath: "example.txt" }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).entry.status, "ingested");
    assert.equal((await POST(request({ rawPath: "bad.pdf" }))).status, 422);
    assert.equal(
      (await POST(request({ rawPath: "../escape.txt" }))).status,
      422
    );
    assert.equal(
      (await POST(request({ rawPath: "https://example.org/file.pdf" }))).status,
      422
    );
  } finally {
    if (before === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
