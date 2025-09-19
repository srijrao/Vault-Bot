# Image Upload and Vision Feature Implementation Plan
Date: 2025-09-05 07:59:54 (UTC offset +00:00)  
**Status Update: 2025-09-19** - **PARTIALLY IMPLEMENTED** (~40% complete)

## Objective / Overview
Extend content extraction to detect image references and data-URIs and wire provider-specific upload/vision API calls so images referenced in notes can be analyzed by the chosen AI provider. Processing of images is gated by the "Include HTML Rendering" setting: when enabled, images are processed; when disabled, images are not processed and are redacted.

## Current Implementation Status (as of 2025-09-19)

### ✅ **COMPLETED FEATURES**
- ✅ Basic image detection (markdown images and data-URIs)
- ✅ Provider interface extension with optional upload methods
- ✅ Image upload integration in AIProviderWrapper
- ✅ Basic defensive implementations in OpenAI and OpenRouter providers
- ✅ Unit tests for core image detection and upload flow
- ✅ Build system integration (all 164 tests passing)

### ⚠️ **CRITICAL MISSING FEATURES** 
**These must be implemented before production use:**
- ❌ **Security**: Remote image URLs forwarded to providers without user consent
- ❌ **Settings Gate**: "Include HTML Rendering" setting not respected
- ❌ **Vision Blocking**: Non-vision models receive image content anyway
- ❌ **User Feedback**: No Notices for upload failures or incompatible models

### 📋 **ADDITIONAL MISSING FEATURES**
- ❌ Extended image formats (Obsidian embeds, HTML img tags, reference-style)
- ❌ Image optimization (downscaling, EXIF handling, format policies)
- ❌ Vision capability detection and model decoration
- ❌ Comprehensive test coverage for all scenarios
- ❌ AI call logging safety (data-URI redaction)

**⚠️ WARNING**: This feature should NOT be enabled in production due to security and UX gaps.

## Implementation Checklist

### ✅ **Phase 1: Core Infrastructure (COMPLETED)**
- [x] Locate existing command and handler files (`src/services/content_retrieval.ts`, `src/aiprovider.ts`, `src/providers/openrouter.ts`, `src/providers/openai.ts`)
- [x] Design new behaviors and provider contract for image uploads/vision
- [x] Implement parsing for image markdown and data-URIs in `src/services/content_retrieval.ts`
- [x] Add optional upload/vision methods to provider interface (`src/providers/base.ts`) and implement them in `openrouter.ts` and `openai.ts`
- [x] Integrate upload calls from `aiprovider.ts` when enhancing messages (optional: only when images present)
- [x] Add unit tests for parsing and provider methods
- [x] Run static checks, `npm test`, and `npm run build`
- [x] Update progress notes

### ⚠️ **Phase 2: Security & Safety (CRITICAL - NOT IMPLEMENTED)**
- [ ] **CRITICAL**: Respect "Include HTML Rendering" gate (images only processed when enabled)
- [ ] **CRITICAL**: Prohibit external URL fetching or forwarding to providers by default; provide explicit allowlist opt-in (off by default)
- [ ] **CRITICAL**: Block image content when the selected model doesn't support vision (wrapper-enforced)
- [ ] **CRITICAL**: Show Obsidian Notices for image upload failures and other relevant events (summarized, de-duplicated)

### 📋 **Phase 3: Extended Features (NOT IMPLEMENTED)**
- [ ] Extend parsing to Obsidian embeds (`![[...]]` with variants), HTML `<img>`, and reference-style images
- [ ] Handle EXIF orientation correction and define animated GIF/WebP and SVG policies
- [ ] Deduplicate images per request (by content hash or path+mtime) and cap concurrency
- [ ] Block image content when the selected model doesn’t support vision (wrapper-enforced)
- [ ] Show Obsidian Notices for image upload failures and other relevant events (summarized, de-duplicated)
- [ ] Detect per-model vision capability per provider; expose via AI wrapper; decorate model names with a camera emoji in selection UI
- [ ] Add tests for blocking behavior, user notices, and model vision decoration
- [ ] Ensure AI call logging is image-safe: record only uploaded image links/IDs (no base64 or large payloads); record blocked calls with explanatory response

## Plan
- Image processing gate: If the "Include HTML Rendering" setting is true, image references are detected and processed; otherwise, images are not processed and are redacted from outbound payloads (with placeholders). This gate applies before any resizing/upload logic.
- Add robust image detection in `parseLinks` to capture:
  - Markdown images `![alt](url)` (inline and reference-style)
  - Obsidian embeds `![[path|size]]`, including aliases, size modifiers, and subpaths/hash variants
  - HTML `<img>` tags with `src`, `alt`, `width/height`
  - Inline data URIs `data:image/*;base64,...`
- New type `RetrievedImageRef` describing found images:
  - { sourceType: 'data' | 'local' | 'remote', raw: string, alt?: string, filename?: string, mime?: string }
  - Only 'data' and 'local' are processed locally. 'remote' is never fetched locally. By default, remote URLs are not sent to providers either (see Privacy policy below).
- Modify `formatNotesForAI` to include placeholders for images (e.g., `[image: filename.ext, WxH, redacted]`) and expose the list of images found alongside notes. Alternatively, content service will return images as separate metadata so `AIProviderWrapper` can call provider upload methods.
- Add optional methods to `AIProvider` in `src/providers/base.ts`: `uploadImageFromDataURI`, `uploadImageFromUrl`, `analyzeImage` (optional). Implement these in `OpenRouterProvider` and `OpenAIProvider` with graceful failures.
- In `AIProviderWrapper.enhanceMessagesWithContent`, after calling `retrieveContent`, if images are present, call provider.uploadImage... for each image and replace placeholder references with provider returned URLs or IDs.
- Tests:
  - Unit test for `parseLinks` to ensure detection of `![alt](url)` and data URIs.
  - Unit test mocking provider upload methods to ensure `AIProviderWrapper` calls them and replaces placeholders.
  - Unit test for Obsidian embed variants, HTML `<img>`, and reference-style markdown resolution.
  - Gate test: when "Include HTML Rendering" is false, ensure images are not processed and are redacted.

### Image downscaling for large images
- Before uploading, downscale any local file or data-URI image exceeding a practical "average iPhone photo" threshold to reduce bandwidth and API cost.
- Thresholds (configurable, with sensible defaults):
  - Pixel count: > 12MP (e.g., width * height > 12_000_000) OR
  - File size: > 4 MB
- Target after downscaling: long edge max 2048–3072 px (default 2560 px), JPEG/WebP quality ~0.8, strip EXIF metadata for privacy and size.
- Implementation: pure JS in the Obsidian renderer using Canvas; prefer `pica` for high-quality resampling if included, falling back to native Canvas `drawImage` if unavailable. No native deps.
- Apply to data-URIs and local files only. Remote URLs are never fetched locally. If downscaling fails, skip upload and insert a safe placeholder, plus an aggregated Notice.
- Enforce a hard cap post-resize; if still over max size, omit upload and use placeholder with a Notice.
- Orientation and formats:
  - Apply EXIF orientation correction before resampling (read orientation from binary and rotate/flip on canvas). Strip EXIF afterward.
  - Animated GIF/WebP: default policy is snapshot first frame to static JPEG/WebP with a Notice; provide a setting to "Skip animated images" (then use placeholder). No animation preservation.
  - SVG: default is skip with placeholder for safety; consider optional rasterization (opt-in) in a later phase.

### Vision capability detection and blocking
- Determine if the selected model supports vision:
  - Per provider strategy: query provider model metadata (when available) and/or maintain a curated allowlist of known vision-capable model IDs; apply heuristics on returned tags/capabilities.
  - Abstract this behind the AI wrapper so other parts of the codebase simply ask “supports vision?” without provider-specific logic.
- Cross-provider inference for overlapping models:
  - Maintain a canonical model registry with alias mapping across providers (e.g., OpenAI `gpt-4o-*` offered via OpenRouter) and record evidence from each provider.
  - If any provider marks a canonical model as vision-capable, treat this as positive evidence for others that surface the same model; combine with allowlist and direct metadata.
  - Use precedence: user override > direct provider metadata > curated allowlist > cross-provider inference; produce a final boolean plus confidence, and cache for the session.
  - Caching: layered and load-aware:
    - Memory-only session cache: default TTL 6 hours (configurable), sliding expiration, and stale-while-revalidate; add 5–15% jitter; evict on provider or settings change.
    - Persisted cache: default TTL 7 days; refresh only if a live request returns "images not supported" for that model, the entry is older than 7 days, or the user forces a refresh.
  - On-demand checks: only fetch capability for models currently visible in the model selection UI; avoid full-catalog crawls. Coalesce duplicate lookups and cancel if scrolled off-screen.
  - Concurrency limit: cap parallel capability lookups (default 3; configurable) to keep this lightweight.
  - Provide a user setting to enable/disable cross-provider inference and to override capability per model ID.
- If the selected model is not vision-capable:
  - Do not upload or attach images; redact any data-URIs and image paths in the message payload.
  - Provide a single Obsidian Notice informing the user that images were omitted because the model doesn’t support vision.

### Provider specifics and constraints
- OpenAI: Prefer file uploads and use file_id in the Responses API input_image flow. If explicitly allowed by settings, small data URLs may be passed directly as input_image parts. Remote image URLs are not used by default.
- OpenRouter: Many routed models require `image_url`. Since remote URLs are not sent by default, only models that accept uploaded/file or data inputs will be supported for images; otherwise images are replaced by placeholders with a Notice. Document any per-model nuance as it’s discovered.

### User feedback via Obsidian Notices
- Use summarized Notices to inform the user when:
  - One or more image uploads fail (e.g., “2 image(s) failed to upload; sent as placeholders”).
  - The selected model doesn’t support images (e.g., “Selected model doesn’t support images; images were omitted”).
- De-duplicate notices within a single request to avoid spamming; prefer a single aggregated message.
- Ensure no raw base64 (data-URIs) leak to the model when an upload fails; replace with a neutral placeholder description.

### Model selection UI (camera emoji for vision)
- During model listing, determine vision capability per model via the provider or wrapper and decorate the displayed model name with a camera emoji at the end for vision-capable models.
- Keep the underlying model ID intact for requests; only decorate the label shown to users.
- Cache capability checks for the session to avoid repeated queries.
 - Respect cross-provider inference when decorating labels; indicate low-confidence cases with a tooltip or log annotation (dev-only) rather than altering the label semantics.
 - On-demand capability fetch: trigger checks only for models currently on screen; paginate/lazy-load; never block UI.

### Redaction and safety
- Processing gate: If "Include HTML Rendering" is disabled, perform no image processing. Redact any image references (data-URIs, local paths, remote URLs) with placeholders.
- Redact any stray inline data-URIs in note content before sending, regardless of upload outcome, using a placeholder like “image data omitted”.
- Cap maximum accepted inline image size (data-URI length threshold); if exceeded, skip upload and use a placeholder with a Notice.
- Consider hashing image payloads to avoid re-uploading duplicates.
 - Strip EXIF metadata on downscaling to avoid leaking sensitive camera/location data.

### Remote image policy (strict by default)
- No external URL fetching by the plugin. Remote images (http/https) are not fetched for resizing or inspection.
- By default, remote image URLs are not forwarded to providers either; they are replaced with placeholders. An optional domain allowlist can be provided by the user to permit forwarding specific remote URLs to providers; this is disabled by default.

- AI call logging hygiene
- Record only safe references in logs (uploaded URLs/IDs or placeholders). Never store raw data-URIs.
- When a request is blocked due to non-vision model, still record the call with a standardized explanatory response and any Notices emitted.
- Ensure recorder captures the post-redaction, post-upload-substitution message set (the same that providers receive), preserving fidelity while preventing leakage.

### Tests
- Add tests under `tests/` using existing framework (vitest) to keep consistent.
- Vision capability blocking:
  - When wrapper reports model is not vision-capable, ensure images are omitted from outbound payloads and a single Notice is recorded.
  - Ensure no data-URI substrings appear in the final message text sent to providers.
- Upload failure UX:
  - Simulate provider upload failures; assert placeholders replace original image references and a summarized Notice is issued once.
- Model selection decoration:
  - Stub model listing per provider to mark some as vision-capable; assert that UI-facing names include a camera emoji while IDs remain unchanged.
- Data-URI redaction:
  - Ensure any inline data-URI in content is redacted even if not within markdown image syntax.
- HTML rendering gate:
  - With "Include HTML Rendering" off, ensure no provider upload calls are made; all images are redacted.
- Remote URL policy:
  - Ensure no network fetch occurs for remote images; verify providers are not called with `image_url` when allowlist is disabled; placeholders used instead.
- Recorder logging:
  - Verify that recorded messages never include data-URI substrings; uploaded images appear only as provider URLs/IDs or placeholders.
  - Verify that a blocked (non-vision) request is still recorded as a call with an explanatory response and that Notices were (mock) emitted.
 - Downscaling:
   - Images just under and just over the thresholds trigger the correct behavior (no resize vs resize).
   - Verify output dimensions and that EXIF is stripped (size reduced) and quality settings applied; mock `pica` when available.
   - If downscale fails, ensure placeholder insertion and aggregated Notice.
 - Cross-provider inference:
   - Alias mapping resolution across providers (OpenAI ↔ OpenRouter) informs vision capability when direct data is missing.
  - Precedence enforced: user override > provider metadata > allowlist > cross-provider inference; setting toggles override behavior.
   - Session cache prevents redundant lookups.
 - On-demand checks, persistence, and concurrency:
   - Only models in the viewport trigger capability lookups; off-screen models do not until scrolled into view.
   - Persisted cache entries newer than 7 days are used without network; older entries refresh.
   - When a provider rejects an image at request time, flip the persisted entry to negative immediately.
   - Concurrency limit (e.g., 3) is enforced; off-screen lookups are canceled; duplicate in-flight requests are deduped.
 - Model exclusions UI:
   - Section defaults folded; exclusions persist; "Allow All" and "Block All" actions work; excluded models never appear in pickers.

## Viability Check
- Risk: Provider upload endpoints and exact request shapes may differ; implementations will be defensive and fall back to leaving original references if upload fails.
- Compatibility: Changes are additive and use optional provider methods; existing flows remain unchanged if provider doesn't implement uploads.
- Platform: No platform-specific concerns; file parsing is pure JS/TS.
 - Performance: Downscaling in renderer via Canvas/`pica` is CPU-bound but bounded by thresholds; add a small concurrency limit for processing to keep the UI responsive.
 - Parsing: Prefer a markdown parser (e.g., markdown-it) hooks to avoid catastrophic regex backtracking for image detection, with a fallback to robust, bounded regex where necessary.

## Settings (new)
- Include HTML Rendering: when enabled, images are processed; when disabled, images are not processed and are redacted (default: disabled for privacy).
- Image handling: enable resizing (default on), long-edge max, quality, size/pixel thresholds, and max images per request.
 - Capability inference: per-model overrides (highest precedence), toggle cross-provider inference, session cache TTL (default 6 hours), persisted cache TTL (default 7 days), sliding expiration + SWR + jitter; resets on plugin/app reload; evicts on provider change. Add a "Force Refresh Capabilities" action in settings and a command palette entry to clear caches and re-fetch immediately. Concurrency cap for lookups (default 3) is configurable.
- Privacy: strip EXIF (default on); do not fetch external URLs locally; do not forward remote image URLs to providers unless the user enables a domain allowlist (default off).
 - Model exclusions (collapsible; default folded):
   - Exclude specific models from all selection lists; apply before any capability lookups.
   - Persist the exclusion list in plugin settings storage.
   - Provide quick actions: "Allow All" and "Block All" to reset the list.

## Storage boundaries
- Plugin settings vs `model_settings_shared`:
  - Plugin settings store: model exclusions, capability caches (memory + persisted), inference toggles, TTLs, concurrency caps, and image resizing preferences.
  - `model_settings_shared` remains unchanged by these features. Only the camera emoji decoration affects display labels in selection UI; no caches or exclusions are stored there.

## Implementation Progress

### Chronological Log
- [2025-09-05 07:59:54] Created initial document and implementation plan
- [2025-09-05 08:02:30] Implemented image detection (markdown + data-URIs) in `src/services/content_retrieval.ts`
- [2025-09-05 08:03:40] Extended provider interface in `src/providers/base.ts` with optional image upload/vision methods
- [2025-09-05 08:04:20] Added defensive upload/analyze stubs to `src/providers/openrouter.ts` and `src/providers/openai.ts`
- [2025-09-05 08:05:10] Wired image upload replacement logic into `AIProviderWrapper.enhanceMessagesWithContent`
- [2025-09-05 08:06:18] Added tests for image detection and upload substitution; fixed test to exercise path
- [2025-09-05 08:06:29] Ran full test suite (PASS: 150/150)
- [2025-09-05 08:06:40] Ran build via `npm run build` (PASS)
- [2025-09-05 08:15:00] Updated plan to include large-image downscaling and cross-provider vision capability inference
- **[2025-09-19 09:30:00] FINAL STATUS: Implementation halted at ~40% completion**

### Final Implementation Status (2025-09-19)

**✅ SUCCESSFULLY IMPLEMENTED:**
- Basic image detection (markdown + data-URIs) in content retrieval service
- Provider interface extension with optional upload methods
- Image upload integration in AIProviderWrapper
- Defensive implementations in OpenAI and OpenRouter providers
- Unit tests for core functionality
- Build system integration (164 tests passing)

**❌ CRITICAL GAPS REMAINING:**
- No "Include HTML Rendering" gate enforcement (security issue)
- Remote image URLs forwarded to providers without user consent (privacy issue)
- No vision model capability detection/blocking
- No user feedback via Obsidian Notices
- No comprehensive test coverage for edge cases

**📋 ADDITIONAL FEATURES NOT IMPLEMENTED:**
- Extended image format support (Obsidian embeds, HTML img, reference-style)
- Image optimization (downscaling, EXIF handling)
- Vision capability detection and UI decoration
- AI call logging safety measures

### Files Changed
- docs/2025-09-05_07-59-54_image_upload_and_vision_plan.md (created/updated)
- src/services/content_retrieval.ts — detect markdown image references and data-URIs; populate `images` metadata on retrieved notes
- src/aiprovider.ts — attempt provider image uploads and replace references in user message content
- src/providers/base.ts — optional image upload/vision methods added
- src/providers/openrouter.ts — defensive implementations for upload/analyze
- src/providers/openai.ts — defensive implementations for upload/analyze with correct typings
- tests/image_extraction_and_upload.test.ts — new tests for detection and upload substitution (stubbed provider)

### Implementation Notes
- Core infrastructure successfully implemented with defensive programming approach
- Provider upload/vision endpoints are not standardized; implementations gracefully fail and leave original references intact
- Feature requires significant additional work on security, user experience, and comprehensive image format support
- **Recommendation: Do not enable in production until Phase 2 (Security & Safety) is completed**

## Final Quality Assessment (2025-09-19)
- **Build**: ✅ PASS 
- **Tests**: ✅ PASS (164 tests)
- **Lint**: N/A (no linter configured)
- **Security**: ❌ FAIL (remote URLs forwarded without consent)
- **User Experience**: ❌ FAIL (no feedback on failures or incompatible models)
- **Feature Completeness**: ⚠️ PARTIAL (~40% complete)

**Overall Status: NOT PRODUCTION READY**

