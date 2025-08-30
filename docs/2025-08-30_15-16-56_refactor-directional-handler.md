# Directional Handler Refactor: Combine Above/Below

Date: 2025-08-30 15:16:56

## Goals
- Unify Get Response Above/Below via a shared internal core with a direction parameter.
- Preserve selection, separator, and line-based conversation modes.
- Keep streaming, abort, and recording behaviors intact.

## Plan
1. Introduce an internal `handleGetResponseDirectional(direction: 'above' | 'below')` orchestrator.
2. Extract helpers:
   - `detectInteractionMode(editor, direction)` -> { mode: 'selection'|'separator'|'conversation', queryText, conversation, anchors }
   - `computeDirectionalPlan(editor, cursor, direction)` -> { sliceForParsing, reverseForParsing, insertionPlan }
   - `streamIntoEditor(editor, anchor, onChunk)` -> manages replaceRange window and cursor policy
   - `recordCallIfEnabled(...)`
3. Update `handleGetResponseAbove/Below` to thin wrappers delegating to the new function.
4. Ensure line boundaries:
   - below: parse [doc start -> endOf(line)], insert [separator then response] after the line.
   - above: parse [startOf(line) -> doc end], insert [response then separator] before the line.
5. Tests: parametrize by direction; cover multi-line separators and edge cases (BOF/EOF, blank lines, empty line).

## Viability
- Editor API supports precise range insertions without replacement.
- Current streaming approach already isolates a response region; abstraction is safe.
- No API-breaking changes; commands remain the same.
- Low risk; symmetric logic reduces bugs.

## Execution Log
- 15:16:56 Init doc and plan.
- 15:17:10 Verified scripts (build/test) in package.json.
- 15:17:20 Reading current implementations of Above/Below and tests to scope refactor surface.
- 15:17:35 Proceeding to implement internal directional handler and delegate wrappers.
- 15:19:10 Implemented shared directional conversation handler and delegated conversation-mode branches in Above/Below.
- 15:22:43 Ran tests; 1 failure related to response region replacement.
- 15:23:30 Adjusted streaming replace logic to use a tracked lastInsertedEnd.
- 15:23:43 Re-ran tests; all 75 tests passing.

## Quality Gates
- Build: PASS (tsc + esbuild)
- Tests: PASS (75/75)
- Lint: Not run in this session

## Requirements coverage
- Shared directional handler: Done
- Line-based parsing and insertion for conversation mode: Done
- Preserve separator and selection modes: Done
- Streaming without overwriting user text: Done
