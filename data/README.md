# Local dataset

- `raw/`: original public source documents; private evidence files are not stored by this step.
- `processed/`: future normalised document text and metadata.
- `rules/`: future curated rule records.
- `cases/`: future curated public RTB comparable-case records.
- `depositcheck.sqlite`: local cases, evidence metadata and public document metadata.

All content and SQLite sidecars are gitignored; only this README and directory placeholders are committed. `DATA_DIR` changes the root. Run `npm run db:init` to create the empty local database. No dataset is downloaded, populated, embedded or ingested in this step. File reference schemas validate relative path syntax; actual file access and symlink containment checks belong to future ingestion, which is currently a stub.
