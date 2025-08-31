# Unify AI Bot Model Settings UI across Settings and Workspace Panel
Date: 2025-08-31 14:32:05 (UTC offset -05:00)

## Objective / Overview
Ensure the AI Bot Model Settings UI is shared between the plugin Settings tab and the Workspace Side Panel, so future changes affect both places from one source of truth.

## Checklist
- [x] Locate settings tab, side panel, and related files
- [x] Design shared UI module for provider selector and provider-specific fields
- [x] Refactor settings tab to consume shared UI
- [x] Refactor side panel to consume shared UI
- [x] Run build and tests; fix any regressions
- [x] Document the plan and progress

## Plan
- Create `src/ui/model_settings_shared.ts` to export:
  - `renderProviderSelector(container, pluginLike, reRender, save)`
  - `renderProviderSpecificSettings(container, pluginLike, save)`
- In `src/settings.ts`, replace provider and model UI with calls to the shared module; keep existing API Key, recording, archive, and separator settings as-is.
- In `src/side_panel.ts`, use the shared module for provider selector and provider-specific fields; remove duplicated UI logic.
- Guard DOM-dependent properties (like `text.inputEl.style`) to work with test mocks.
- Build and run tests to verify behavior.

## Viability Check
- Risk: Type errors or UI regressions due to refactor. Mitigation: incremental edits and test coverage (side panel and settings tests exist).
- Compatibility: No breaking changes to settings schema. Only UI composition changed.
- Platform: Obsidian desktop; tests mock Obsidian APIs. Added guards for missing DOM properties in tests.

## Implementation Progress
### Chronological Log
- 2025-08-31 14:27:29 Pulled current time via workspace task (Get-Date)
- 2025-08-31 14:32:05 Created this document and designed shared UI module
- 2025-08-31 14:33:10 Implemented `src/ui/model_settings_shared.ts`
- 2025-08-31 14:33:50 Refactored `src/settings.ts` to use shared UI
- 2025-08-31 14:34:20 Refactored `src/side_panel.ts` to use shared UI
- 2025-08-31 14:34:50 Ran build and tests; fixed textarea DOM guard for tests
- 2025-08-31 14:35:40 Re-ran build and tests; all passing

### Files Changed
- src/ui/model_settings_shared.ts (new) – shared provider and model settings renderers
- src/settings.ts – consume shared UI, remove duplicate provider-specific UI
- src/side_panel.ts – consume shared UI, remove duplicate provider-specific UI

### Notes
- The settings and side panel now render model settings from the same code path.
- Future fields (e.g., top_p, frequency_penalty) can be added once in the shared module.

## Result / Quality Gates
- Build: PASS
- Tests: PASS
- Lint: N/A (no separate lint script)
- Complete

---

Final update (2025-08-31 14:46): Removed legacy provider-specific render methods from `src/side_panel.ts` so the Workspace view exclusively uses `renderModelSettingsSection`. Rebuilt and ran tests:

- Build: PASS (npm run build)
- Tests: PASS (npm test) — 109 tests passed

Both Settings and Workspace views now import and render the identical full "AI Bot Model Settings" section (including headers) from `src/ui/model_settings_shared.ts`.
