# Archive sorting + solid compression

Timestamp: 2025-08-30 20:43:59

## Plan
- At plugin load, sort AI call files into per-date folders under `ai-calls/`, excluding today.
- Then, for each prior-day folder, create a solid `.7z` archive with `-ms=on` and delete the folder on success.
- Keep no ZIP fallback; if 7z fails, leave the folder/files intact.
- Update tests to assert folder sorting and behavior on success/failure.

## Viability
- Sorting: filenames already carry dates; fallback to mtime ensures legacy files are covered.
- Solid compression: 7z via bundled `7za` with `-t7z -mx=9 -m0=lzma2 -ms=on -mmt=on` provides solid across-folder compression.
- Safety: atomic temp outputs; remove folders only after successful archive.
- Cross-platform: prefers local `bin/7za(.exe)`; uses package binary otherwise.

## Execution Log
- 20:43:59 — Implemented folder sorting in `src/archiveCalls.ts` and ensured solid `.7z` archives per date; removed fallback.
- 20:43:59 — Updated tests (`tests/zipCalls.test.ts`, `tests/archiveCalls.test.ts`) to validate folder sorting, success removes folder, failure keeps folder.
- 20:43:59 — Adjusted startup comment in `main.ts` to reflect new behavior.
- 20:43:59 — Ran test suite: PASS (79/79).
