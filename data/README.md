# Local dataset

- `raw/`: original public source documents; private evidence files are not stored by this step.
- `processed/`: future normalised document text and metadata.
- `rules/`: future curated rule records.
- `cases/`: future curated public RTB comparable-case records.
- `depositcheck.sqlite`: local cases, evidence metadata and public document metadata.

All content and SQLite sidecars are gitignored; only this README and directory placeholders are committed. `DATA_DIR` changes the root. Run `npm run db:init` to initialise SQLite, `npm run seed:public` for the small optional genuine RTB corpus, and `npm run ingest` to process local raw files. Files, provenance JSON and the active manifest stay local. See `docs/INGESTION.md`; retrieval and reasoning remain unimplemented.
