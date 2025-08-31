# Unify AI Bot Configuration UI across Settings, Side Panel, and Prompt Modal
Date: 2025-08-31 15:00:00 (UTC offset -05:00)

## Objective / Overview
Create a shared UI module for AI Bot configuration that eliminates duplicated code across:
- Plugin Settings tab (`src/settings.ts`)
- Workspace Side Panel (`src/side_panel.ts`) 
- Prompt Modal (`src/prompt_modal.ts`)

This follows the same pattern as the existing `model_settings_shared.ts` but for the core AI Bot configuration fields.

## Current Duplication Analysis
The following UI elements are duplicated across multiple locations:

**Duplicated across Settings + Prompt Modal:**
- API Provider dropdown (OpenAI/OpenRouter selection)
- API Key input field (with password masking)
- Record chat AI calls toggle
- Chat Separator text input

**Settings-specific (not duplicated):**
- API Key test button
- AI call records folder management (Open/Clear buttons)
- Archive AI calls functionality
- File management operations

**Side Panel:**
- Currently only shows model settings via shared module
- Could potentially show core config too

## Plan

### 1. Create Shared UI Module
Create `src/ui/ai_bot_config_shared.ts` to export:
- `renderCoreConfigSection(container, pluginLike, save)` - renders the full section with header
- `renderApiProviderSelector(container, pluginLike, reRender, save)` - provider dropdown with auto-refresh
- `renderApiKeyField(container, pluginLike, save)` - API key input (password masked)
- `renderRecordingToggle(container, pluginLike, save)` - record calls toggle
- `renderChatSeparatorField(container, pluginLike, save)` - chat separator input

### 2. Refactor Settings Tab (`src/settings.ts`)
- Replace duplicated UI code with calls to shared module functions
- Keep settings-specific functionality:
  - API Key test button (add as separate setting after shared API key field)
  - AI call records folder management
  - Archive functionality
- Use `renderCoreConfigSection()` for the shared parts
- Maintain existing layout and functionality

### 3. Refactor Prompt Modal (`src/prompt_modal.ts`)
- Replace all current UI code with `renderCoreConfigSection()`
- Keep only the modal structure (header, close button)
- Remove duplicated provider/key/recording/separator fields
- Result: much cleaner, shorter modal code

### 4. Enhance Side Panel (`src/side_panel.ts`)
- Add `renderCoreConfigSection()` above the existing model settings
- This gives users a complete AI Bot config view in the side panel
- Both core config and model settings in one place

### 5. Type Safety & Consistency
- Use existing `PluginLike` interface from `model_settings_shared.ts`
- Ensure consistent behavior across all locations
- Add proper type guards for DOM properties (test compatibility)

## Checklist
- [ ] Analyze current duplication and extract common patterns
- [ ] Create `src/ui/ai_bot_config_shared.ts` with shared UI functions
- [ ] Refactor `src/settings.ts` to use shared UI (keep settings-specific features)
- [ ] Refactor `src/prompt_modal.ts` to use shared UI (significant simplification)
- [ ] Enhance `src/side_panel.ts` to include core config section
- [ ] Test provider switching behavior across all locations
- [ ] Run build and tests; fix any regressions
- [ ] Verify UI consistency and functionality
- [ ] Document changes and update plan

## Implementation Strategy

### Phase 1: Extract Shared Components
Create the shared module with individual render functions that can be composed together.

### Phase 2: Refactor Existing UIs
- Settings: Replace specific sections while preserving unique functionality
- Modal: Major simplification by using shared components
- Side Panel: Additive enhancement with core config

### Phase 3: Testing & Polish
- Verify provider switching works consistently
- Test save/load behavior across all UIs
- Ensure no regressions in existing functionality

## Expected Benefits
- **DRY Principle**: Single source of truth for core AI Bot config UI
- **Consistency**: Identical behavior and appearance across all locations
- **Maintainability**: Future changes only need to be made in one place
- **Side Panel Enhancement**: Complete AI Bot config in workspace panel
- **Modal Simplification**: Prompt modal becomes much cleaner

## Risk Assessment
- **Low Risk**: Following proven pattern from `model_settings_shared.ts`
- **Mitigation**: Incremental changes with existing test coverage
- **Rollback**: Easy to revert individual files if issues arise

## Files to be Changed
- `src/ui/ai_bot_config_shared.ts` (new) - shared configuration UI components
- `src/settings.ts` - consume shared UI, keep unique settings features
- `src/prompt_modal.ts` - major simplification using shared UI
- `src/side_panel.ts` - enhance with core config section

## Quality Gates
- Build: PASS (npm run build)
- Tests: PASS (npm test)
- UI Consistency: Manual verification across all three locations
- Functionality: Verify provider switching, save/load, API key handling

---

Ready for implementation upon approval.
