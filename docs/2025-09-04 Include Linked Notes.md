# Feature: Automatically include linked notes in AI requests

## Summary
- When enabled, the plugin includes content from linked notes, open notes, and the current note in each AI request, based on user settings.

## UI requirements:
**New Block within the Model Settings UI:**
- Add a toggle
  - Label: “Include Current Note”
  - Description: “Automatically include the content of the current note in your message.”
  - Setting key suggestion: settings.includeCurrentNote (boolean). Default: true.
- Add a toggle
  - Label: “Include All Open Notes”
  - Description: “Automatically include the content of all open notes in the workspace in your message.”
  - Setting key suggestion: settings.includeOpenNotes (boolean). Default: false.
- Add a toggle
  - Label: “Include Linked Notes”
  - Description: “Automatically include the content of notes referenced by [[wikilinks]] or markdown links in your message.”
  - Setting key suggestion: settings.includeLinkedNotes (boolean). Default: true.
- Add a toggle
  - Label: "Extract in Reading View"
  - Description: "Render included notes to HTML and extract text content instead of using raw markdown."
  - Setting key suggestion: settings.extractNotesInReadingView (boolean). Default: false.
- Add a toggle (Under the Reading View Toggle, only visible if "Extract in Reading View" is enabled)
  - Label: "Include Links Found in Rendered HTML"
  - Description: "When extracting notes in reading view, also scan the rendered HTML for additional links to include."
  - Setting key suggestion: settings.includeLinksInRenderedHTML (boolean). Default: false.
- Add new slider input
  - Label: "Link Recursion Depth"
  - Description: "How many levels of linked notes to include. 1 = only directly linked notes, 2 = also include notes linked from those notes, etc."
  - Setting key suggestion: settings.linkRecursionDepth (integer). Default: 1. Min: 1, Max: 3.

## Behavior
- Trigger: For every AI call, if the toggles are true.
- Scope to scan: The entire conversation message being sent, if link recursion depth is 1. If depth > 1, also scan the content of any linked notes up to the specified depth.
- Link types to detect:
  - Obsidian wiki links: [[Note]], [[path/to/Note]], [[Note|alias]], [[path/to/Note|alias]]
  - Markdown links: [example](note), [example](path/to/note), [example](note|alias), [example](path/to/note|alias)
- Extraction:
  - Parse the message text to extract all unique Obsidian links.
  - If the Include All Open Notes toggle is enabled, also include links to all currently open notes in the workspace.
  - If the Include Current Note toggle is enabled, also include a link to the current note
  - Support both wiki and markdown link formats.
  - If only # (headings) or ^ (block references) are linked, retrieve only that specific section/block, not the whole note.
  - If the 'extract in reading view' setting is enabled, render the note to HTML and extract text content from that instead of raw markdown.
- Resolution rules:
  - Resolve to files within the Obsidian vault.
  - Ignore external links (http/https/mailto/etc.), this feature will be added later.
  - Use Obsidian’s metadataCache and vault to resolve internal links reliably.
  - If the 'extract in reading view' setting is enabled, render the note to HTML and extract text content from that, but then render the markdown content to find links, discarding raw markdown content after link extraction unless the 'include links found in rendered HTML' setting is enabled.
  - Support recursion up to the configured depth, including links found within linked notes.
- Retrieval:
  - De-duplicate file targets so that note content is only included once per AI call.
  - For each resolved file, retrieve the full content or specific section/block as needed.
  - If a file cannot be found or read, skip it and continue without blocking the AI call. Just raise a non-blockingnotice for the user
- Injection into AI call:
  - Format and structure is implementation-dependent
  - Re-retrieve note content for each AI call to ensure latest version
  - Include file path and content in a format that preserves note identity
  - Keep note content separate from visible chat messages
- Settings UI additions (not in the "Model Settings Shared")
  - Add an exclusion box below  the "Model Settings Shared" block with:
    - Label: "Note Exclusions"
    - Description: "Exclude specific folders, notes, or tags from link retrieval. One entry per line."
    - Format: Folder paths, note paths, or tags (with #)
    - Two separate lists:
      - "Level 1 Exclusions" - Excludes from direct link retrieval
      - "Deep Link Exclusions" - Excludes from level 2+ recursive retrieval

## Limits and prioritization
- Strict adherence to the recursion depth setting.
- Skip notes that fail to resolve or read; continue with others.
- Links found from rendered HTML (if enabled) do not trigger further resolution, only links in the original markdown content.
- De-duplicate notes to avoid repetition in the AI request.

## Error handling
Use Obsidian's notice API for non-blocking notifications:
- Link resolution failure: `new Notice("Could not resolve link to: [note path]")`
- File read failure: `new Notice("Failed to read note: [note path]")`
- HTML render failure: `new Notice("HTML rendering failed for [note path], using markdown")`
- Continue AI call in all cases, using available content
- Fall back to raw markdown if HTML rendering fails

## Testing scenarios

### 1. Link Detection and Resolution
- Basic link formats:
  - Wiki-style: `[[Note]]`, `[[path/to/Note]]`, `[[Note|alias]]`, `[[path/to/Note|alias]]`
  - Markdown: `[example](note)`, `[example](path/to/note)`, `[example](note|alias)`
  - Section/block references: `[[Note#Heading]]`, `[[Note#^blockID]]`, `[example](note#Heading)`
- Edge cases:
  - Links with special characters (spaces, unicode, etc.)
  - Deeply nested paths (`[[folder1/folder2/folder3/note]]`)
  - Multiple aliases (`[[note|alias1|alias2]]`)
  - Links to non-existent notes
  - Links to external URLs (should be ignored)
  - Mixed link types in the same message

### 2. Content Retrieval
- Full note content:
  - Notes with YAML frontmatter
  - Notes with embedded images/files
  - Notes with complex markdown (tables, code blocks, etc.)
- Section/block retrieval:
  - Heading-based sections with sub-headings
  - Block references with various content types
  - Non-existent sections/blocks (should fail gracefully)
- Reading View extraction:
  - Complex markdown rendering
  - Embedded content handling
  - HTML extraction accuracy

### 3. Recursion and Performance
- Depth control:
  - Level 1 (direct links only)
  - Level 2 (links in linked notes)
  - Level 3 (maximum depth)
- Circular references handling
- Performance with:
  - Large notes (>100KB)
  - Many links (>100 per note)
  - Deep recursion with many branches
- Memory usage monitoring

### 4. Settings and UI
- Toggle behaviors:
  - All combinations of the three main toggles
  - Reading view toggle affects rendering
  - HTML links toggle affects recursion
- Exclusions:
  - Folder exclusions
  - Individual note exclusions
  - Tag-based exclusions
  - Mixed exclusion types
  - Exclusion inheritance in deep links
- Settings persistence across:
  - Plugin reload
  - Obsidian restart
  - Different vaults

### 5. Error Handling
- Graceful handling of:
  - Unresolvable links
  - Permission errors
  - Corrupted files
  - HTML rendering failures
  - Memory limits
  - Network files/attachments
- Notice display for all error types
- Continued operation after errors

### 6. Integration
- Works with:
  - Other plugin settings
  - Date/time inclusion
  - Different Obsidian themes
  - Custom CSS
  - Other plugins' modifications
- Archive logging:
  - Log contains all included notes
  - Log format is stable
  - Log includes error states

## Implementation notes

- Develop a `contentRetrieval` service with the following responsibilities:
  - **Link Parsing:** Scan message text for Obsidian wiki links and markdown links, supporting headings and block references.
  - **Link Resolution:** Use Obsidian’s `metadataCache` and `vault` APIs to resolve internal links to `TFile` instances, ignoring external links.
  - **Recursion:** Support link recursion up to the configured depth, including links found within linked notes.
  - **Note Retrieval:** For each resolved file, retrieve either the full note, a specific section, or a block as indicated by the link.
  - **Reading View Extraction:** If enabled, render notes to HTML and extract plain text; otherwise, use raw markdown.
  - **De-duplication:** Ensure each note is included only once per AI request, even if referenced multiple times.
  - **Error Handling:** Silently skip notes that cannot be resolved or read, and display non-blocking notices for failures.
  - **Formatting:** Structure results as `{ file, path, title, content }` and format for inclusion in AI requests, with minimal headers.
- Integrate the service at the point where the AI request payload is assembled, gated by the relevant settings:
  - `includeCurrentNote`
  - `includeOpenNotes`
  - `includeLinkedNotes`
  - `extractNotesInReadingView`
  - `linkRecursionDepth`
- Add new toggles and slider to the Model Settings UI, persisting their state and placing them under the existing Date/Time toggle in `model_settings_shared.ts`.
- Ensure the feature works in combination with other settings, respects recursion depth, and does not block AI calls