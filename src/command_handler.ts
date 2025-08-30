import { Editor, MarkdownView, Notice } from 'obsidian';
import { AIProviderWrapper } from './aiprovider';
import VaultBotPlugin from '../main';
import { recordChatCall, resolveAiCallsDir, type ChatRequestRecord, type ChatResponseRecord } from './recorder';
import { redactMessages } from './redaction';

export class CommandHandler {
    plugin: VaultBotPlugin;
    abortController: AbortController | null = null;
    private separatorMetrics: {
        separator: string;
        lineCount: number;
        lastLineLength: number;
    } | null = null;

    constructor(plugin: VaultBotPlugin) {
        this.plugin = plugin;
        this.calculateSeparatorMetrics();
    }

    private calculateSeparatorMetrics() {
        const separator = this.plugin.settings.chatSeparator;
        const lines = separator.split('\n');
        this.separatorMetrics = {
            separator,
            lineCount: lines.length,
            lastLineLength: lines[lines.length - 1].length
        };
    }

    public onSettingsChanged() {
        this.calculateSeparatorMetrics();
    }

    private calculateResponseStartPosition(selectionStart: { line: number; ch: number }, initialContent: string): { line: number; ch: number } {
        const lines = initialContent.split('\n');
        const lineCount = lines.length;
        
        if (lineCount === 1) {
            // Single line: response starts after initial content
            return {
                line: selectionStart.line,
                ch: selectionStart.ch + initialContent.length
            };
        } else {
            // Multi-line: response starts at the end of the last line
            return {
                line: selectionStart.line + lineCount - 1,
                ch: lines[lines.length - 1].length
            };
        }
    }

    private calculateEndPosition(startPos: { line: number; ch: number }, content: string): { line: number; ch: number } {
        const lines = content.split('\n');
        const lineCount = lines.length;
        
        if (lineCount === 1) {
            // Single line: end is at start position + content length
            return {
                line: startPos.line,
                ch: startPos.ch + content.length
            };
        } else {
            // Multi-line: end is at the last line with its length
            return {
                line: startPos.line + lineCount - 1,
                ch: lines[lines.length - 1].length
            };
        }
    }

    async handleGetResponseBelow(editor: Editor, view: MarkdownView) {
        const selection = editor.getSelection();
        if (selection) {
            if (this.abortController) {
                new Notice('A response is already in progress. Please stop it first.');
                return;
            }
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            try {
                const provider = new AIProviderWrapper(this.plugin.settings);
                const initialContent = selection + this.plugin.settings.chatSeparator;
                const requestStart = new Date();
                
                // Get the selection range before replacing
                const selectionStart = editor.getCursor('from');
                const selectionEnd = editor.getCursor('to');
                
                // Replace selection with initial content (query + separator)
                editor.replaceSelection(initialContent);
                
                // Calculate where the response should start
                const responseStartPos = this.calculateResponseStartPosition(selectionStart, initialContent);
                
                // Buffer for accumulating the response
                let responseBuffer = "";
                let lastUpdatePos = responseStartPos;
                
                const onUpdate = (text: string) => {
                    if (!text) return; // Skip empty chunks
                    
                    responseBuffer += text;
                    
                    // Clear previous response and insert updated buffer
                    // This ensures we always have a clean, consistent state
                    editor.replaceRange(responseBuffer, lastUpdatePos, editor.getCursor());
                    
                    // Update cursor position to end of inserted content
                    const newCursor = this.calculateEndPosition(responseStartPos, responseBuffer);
                    editor.setCursor(newCursor);
                    lastUpdatePos = responseStartPos; // Reset for next update
                };

                await provider.getStreamingResponse(selection, onUpdate, signal);

                // After streaming completes, optionally record the call
                if (this.plugin.settings.recordApiCalls) {
                    try {
                        // Narrow provider-specific fields safely
                        const providerKey = this.plugin.settings.apiProvider as keyof typeof this.plugin.settings.aiProviderSettings;
                        const cfgAny = this.plugin.settings.aiProviderSettings[providerKey] as any;
                        const model = typeof cfgAny?.model === 'string' ? cfgAny.model : '';
                        const systemPrompt = typeof cfgAny?.system_prompt === 'string' ? cfgAny.system_prompt : '';
                        const temperature = typeof cfgAny?.temperature === 'number' ? cfgAny.temperature : null;

                        const redaction = redactMessages([
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: selection },
                        ]);

                        const requestRecord: ChatRequestRecord = {
                            provider: this.plugin.settings.apiProvider,
                            model,
                            messages: redaction.messages,
                            options: { temperature },
                            timestamp: requestStart.toISOString(),
                        };

                        const responseRecord: ChatResponseRecord = {
                            content: responseBuffer || null,
                            provider: this.plugin.settings.apiProvider,
                            model,
                            timestamp: new Date().toISOString(),
                            duration_ms: Date.now() - requestStart.getTime(),
                        };

                        const dir = resolveAiCallsDir((this.plugin as any).app);
                        await recordChatCall({
                            dir,
                            provider: requestRecord.provider,
                            model: requestRecord.model,
                            request: requestRecord,
                            response: responseRecord,
                            redacted: redaction.redacted,
                        });
                    } catch (recErr) {
                        console.error('Recording AI call failed (non-fatal):', recErr);
                        // Show a light notice only if it repeatedly fails would be ideal; keep it quiet here.
                    }
                }

            } catch (error) {
                if (error.name !== 'AbortError') {
                    new Notice('Error getting response from AI.');
                    console.error(error);
                }
            } finally {
                this.abortController = null;
            }
        } else {
            new Notice('You must highlight text to get a response.');
        }
    }

    async handleGetResponseAbove(editor: Editor, view: MarkdownView) {
        const selection = editor.getSelection();
        // Detect two modes:
        // 1) User has a highlighted selection (existing behavior)
        // 2) No selection, but the line above the cursor is the chat separator and the current line is the query:
        //    ----\n+        //    query
        //    In that case, insert the AI response above the separator without duplicating it.
        let separatorMode = false;
        let queryText = selection;
        let separatorLineIndex: number | null = null;

        if (!selection) {
            // No selection: check the current cursor line and the previous N lines for the separator pattern.
            // This supports multi-line separators by leveraging separatorMetrics calculated from settings.
            const cursor = editor.getCursor();
            const currentLine = cursor.line;
            const prevLine = currentLine - 1;

            const sepMetric = this.separatorMetrics;
            if (sepMetric && prevLine >= 0) {
                // Determine how many lines the separator occupies
                const sepLines = Math.max(1, sepMetric.lineCount);
                // Expand the window slightly to be tolerant of surrounding blank lines
                const windowSize = sepLines + 2;
                const startIndex = Math.max(0, prevLine - (windowSize - 1));

                // Collect a window of lines ending at prevLine
                const collected: string[] = [];
                for (let i = startIndex; i <= prevLine; i++) {
                    collected.push(editor.getLine(i));
                }

                // Check if the window (joined) ends with the separator (trimmed). If so, the separator
                // block starts at prevLine - (sepLines - 1).
                const joinedWindow = collected.join('\n');
                let found = false;
                if (joinedWindow.trim().endsWith(sepMetric.separator.trim())) {
                    // Compute effective separator lines (ignore leading/trailing empty lines)
                    const sepLinesArr = sepMetric.separator.split('\n').map(s => s);
                    const nonEmptyIndices = sepLinesArr.map((s, idx) => ({ s, idx })).filter(x => x.s.trim().length > 0);
                    const effectiveSepLines = nonEmptyIndices.length > 0 ? nonEmptyIndices[nonEmptyIndices.length - 1].idx - nonEmptyIndices[0].idx + 1 : Math.max(1, sepMetric.lineCount);
                    // Compute exact start line for the separator block using effective count
                    separatorLineIndex = prevLine - (effectiveSepLines - 1);
                    found = true;
                } else {
                    // Fallback: check any contiguous subsequence (ending at prevLine)
                    for (let len = 1; len <= Math.min(windowSize, collected.length); len++) {
                        const subseqStart = collected.length - len;
                        const subseq = collected.slice(subseqStart).join('\n');
                        if (subseq === sepMetric.separator || subseq.trim() === sepMetric.separator.trim()) {
                            found = true;
                            // The starting line index of the matched subsequence within the document
                            separatorLineIndex = startIndex + subseqStart;
                            break;
                        }
                    }
                }

                if (found) {
                    queryText = editor.getLine(currentLine);
                    separatorMode = true;
                }
            } else if (prevLine >= 0) {
                // Fallback: single-line check (legacy behavior)
                const prevText = editor.getLine(prevLine);
                if (prevText === this.plugin.settings.chatSeparator || prevText.trim() === this.plugin.settings.chatSeparator) {
                    queryText = editor.getLine(currentLine);
                    separatorMode = true;
                    separatorLineIndex = prevLine;
                }
            }
        }

        if (queryText) {
            if (this.abortController) {
                new Notice('A response is already in progress. Please stop it first.');
                return;
            }
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            try {
                const provider = new AIProviderWrapper(this.plugin.settings);
                // When in separatorMode the separator is already present in the document;
                // otherwise keep the same behavior of replacing selection with selection + separator
                const initialContent = separatorMode ? queryText : (selection + this.plugin.settings.chatSeparator);
                const requestStart = new Date();

                // Get the selection range before replacing

                const selectionStart = editor.getCursor('from');
                const selectionEnd = editor.getCursor('to');

                // If we are NOT in separatorMode, replace selection with initialContent (query + separator)
                if (!separatorMode) {
                    editor.replaceSelection(initialContent);
                }

                // Determine where the response should be inserted:
                // - separatorMode: before the separator line (insert at start of separator line)
                // - normal selection: at the start of the replaced text
                const responseStartPos = separatorMode && separatorLineIndex !== null
                    ? { line: separatorLineIndex, ch: 0 }
                    : { line: selectionStart.line, ch: selectionStart.ch };

                // Buffer for accumulating the response
                let responseBuffer = "";
                // Track the end position of the last inserted/updated response so we can replace it cleanly
                let lastInsertedEnd = responseStartPos;

                const onUpdate = (text: string) => {
                    if (!text) return;

                    // Append new text to buffer
                    responseBuffer += text;

                    // The inserted representation should include a trailing newline to separate from the separator/query
                    const insertText = responseBuffer + '\n';

                    if (separatorMode) {
                        // Replace previously inserted response (if any) with the updated buffer.
                        // Replace from responseStartPos to lastInsertedEnd (initially same as start => insert)
                        editor.replaceRange(insertText, responseStartPos, lastInsertedEnd);
                        // Update lastInsertedEnd to the end of the newly inserted text
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, insertText);

                        // Restore cursor to the end of the original query line to keep UX consistent
                        const afterQueryPos = this.calculateEndPosition({ line: (separatorLineIndex as number) + 1, ch: 0 }, editor.getLine((separatorLineIndex as number) + 1));
                        editor.setCursor(afterQueryPos);
                    } else {
                        // Replace the entire area from responseStartPos to the start of the replaced selection
                        editor.replaceRange(insertText, responseStartPos, editor.getCursor('from'));

                        // Move cursor to end of replaced selection to keep editor in sensible place
                        editor.setCursor(editor.getCursor('to'));
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, insertText);
                    }
                };

                await provider.getStreamingResponse(selection, onUpdate, signal);

                // After streaming completes, optionally record the call
                if (this.plugin.settings.recordApiCalls) {
                    try {
                        const providerKey = this.plugin.settings.apiProvider as keyof typeof this.plugin.settings.aiProviderSettings;
                        const cfgAny = this.plugin.settings.aiProviderSettings[providerKey] as any;
                        const model = typeof cfgAny?.model === 'string' ? cfgAny.model : '';
                        const systemPrompt = typeof cfgAny?.system_prompt === 'string' ? cfgAny.system_prompt : '';
                        const temperature = typeof cfgAny?.temperature === 'number' ? cfgAny.temperature : null;

                        const redaction = redactMessages([
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: selection },
                        ]);

                        const requestRecord: ChatRequestRecord = {
                            provider: this.plugin.settings.apiProvider,
                            model,
                            messages: redaction.messages,
                            options: { temperature },
                            timestamp: requestStart.toISOString(),
                        };

                        const responseRecord: ChatResponseRecord = {
                            content: responseBuffer || null,
                            provider: this.plugin.settings.apiProvider,
                            model,
                            timestamp: new Date().toISOString(),
                            duration_ms: Date.now() - requestStart.getTime(),
                        };

                        const dir = resolveAiCallsDir((this.plugin as any).app);
                        await recordChatCall({
                            dir,
                            provider: requestRecord.provider,
                            model: requestRecord.model,
                            request: requestRecord,
                            response: responseRecord,
                            redacted: redaction.redacted,
                        });
                    } catch (recErr) {
                        console.error('Recording AI call failed (non-fatal):', recErr);
                    }
                }

            } catch (error) {
                if (error.name !== 'AbortError') {
                    new Notice('Error getting response from AI.');
                    console.error(error);
                }
            } finally {
                this.abortController = null;
            }
        } else {
            new Notice('You must highlight text to get a response.');
        }
    }

    handleStopResponse(checking: boolean): boolean {
        if (this.abortController) {
            if (!checking) {
                this.abortController.abort();
                new Notice('AI response stopped.');
            }
            return true;
        }
        return false;
    }
}
