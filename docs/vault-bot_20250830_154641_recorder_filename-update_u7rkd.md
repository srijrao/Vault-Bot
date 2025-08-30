# Recorder Filename Update: Plan, Viability, and Progress

Date (local): 2025-08-30 15:46:41

This document tracks the change to `src/recorder.ts` to prefer local time in filenames, use underscores, cap filename length, and add a short unique suffix.

## Plan
- Prefer local time in the filename for lexicographic sort.
- Keep local and UTC timestamps in file contents (YAML header), not in the filename beyond the local stamp.
- Use underscores as primary separators in the filename.
- Keep filenames under ~120 characters; truncate provider/model dynamically.
- Add a short unique suffix to avoid collisions.
- Validate types compile and preserve existing behavior.

## Viability Check
- Windows-safe names with underscores and no colons are supported.
- Local-time-only filename sorts lexicographically as desired.
- UTC and local timestamps can live in the YAML header.
- Short unique suffix via base36 substring is sufficient to avoid collisions.
- Truncation logic can cap provider/model to keep name < 120 chars.

## Implementation Progress
- 2025-08-30 15:46:41 — Updated `sanitizeForFilename` to normalize to underscores.
- 2025-08-30 15:46:41 — Changed filename pattern to: `vault-bot_<YYYYMMDD_HHMMSS±HHMM>_<provider>_<model>_<uniq>.txt` with length cap ~120.
- 2025-08-30 15:46:41 — Added UTC and local timestamps to YAML header (`timestamp_local`, `timestamp_iso`, `timestamp_utc_iso`).
- 2025-08-30 15:46:41 — Added dynamic truncation allocating space between provider/model and ensuring a short unique suffix.
- 2025-08-30 15:46:41 — Verified TypeScript file has no editor errors.

## Resulting Filename Shape (example)
- Example: `vault-bot_20250830_154641+0530_openai_gpt-4o_x7q2k.txt`
- Underscores separate logical parts; provider/model are sanitized and truncated as needed; final length <= ~120.

## Files Changed
- `src/recorder.ts`

## Notes
- Local time is used in the filename; both local and UTC ISO times are present in the YAML header of the recorded file contents.
