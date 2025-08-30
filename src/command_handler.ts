import { Editor, MarkdownView, Notice } from 'obsidian';
import { AIProviderWrapper, AIMessage } from './aiprovider';
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

    private parseConversationFromText(text: string, reverseOrder: boolean = false): { conversation: AIMessage[]; lastUserMessage: string } {
        const separator = this.plugin.settings.chatSeparator;
        
        // Split text by separator to get conversation parts
        let parts = text.split(separator);
        
        // If no separator found or only one part, treat entire text as user message
        if (parts.length <= 1) {
            return {
                conversation: [],
                lastUserMessage: text.trim()
            };
        }

        // If reverse order (for Get Response Above), reverse the parts array
        if (reverseOrder) {
            parts = parts.reverse();
        }

        const conversation: AIMessage[] = [];
        let lastUserMessage = '';

        // Process each part, alternating between user and assistant
        for (let i = 0; i < parts.length; i++) {
            const content = parts[i].trim();
            if (!content) continue;

            if (i % 2 === 0) {
                // Even index = user message
                conversation.push({ role: 'user', content });
                lastUserMessage = content;
            } else {
                // Odd index = assistant message
                conversation.push({ role: 'assistant', content });
            }
        }

        return { conversation, lastUserMessage };
    }

    private buildConversationMessages(conversationParts: AIMessage[]): AIMessage[] {
        const messages: AIMessage[] = [];
        
        // Add system prompt if available
        const providerKey = this.plugin.settings.apiProvider as keyof typeof this.plugin.settings.aiProviderSettings;
        const cfgAny = this.plugin.settings.aiProviderSettings[providerKey] as any;
        const systemPrompt = typeof cfgAny?.system_prompt === 'string' ? cfgAny.system_prompt : '';
        
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // Add conversation history
        messages.push(...conversationParts);

        return messages;
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
        
        // Handle conversation mode when nothing is selected
        if (!selection) {
            if (this.abortController) {
                new Notice('A response is already in progress. Please stop it first.');
                return;
            }
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            try {
                const provider = new AIProviderWrapper(this.plugin.settings);
                const requestStart = new Date();
                
                // Get cursor position
                const cursor = editor.getCursor();
                
                // Get all text from start of document to end of current line (line-based conversation mode)
                const currentLineEndPos = { line: cursor.line, ch: editor.getLine(cursor.line).length };
                const textAboveCursor = editor.getRange({ line: 0, ch: 0 }, currentLineEndPos);
                
                // Parse conversation from text above cursor
                const { conversation, lastUserMessage } = this.parseConversationFromText(textAboveCursor);
                
                // If no conversation found, treat all text as user prompt
                const queryText = conversation.length > 0 ? lastUserMessage : textAboveCursor.trim();
                
                if (!queryText) {
                    new Notice('No text found above cursor to create a response.');
                    this.abortController = null;
                    return;
                }
                
                // Insert separator at end of current line
                const insertionPos = currentLineEndPos;
                const separatorWithNewline = this.plugin.settings.chatSeparator + '\n';
                editor.replaceRange(separatorWithNewline, insertionPos, insertionPos);
                
                // Calculate where the response should start (after separator)
                const responseStartPos = this.calculateResponseStartPosition(insertionPos, separatorWithNewline);
                
                // Buffer for accumulating the response
                let responseBuffer = "";
                let lastUpdatePos = responseStartPos;
                
                const onUpdate = (text: string) => {
                    if (!text) return; // Skip empty chunks
                    
                    responseBuffer += text;
                    
                    // Clear previous response and insert updated buffer
                    editor.replaceRange(responseBuffer, lastUpdatePos, editor.getCursor());
                    
                    // Update cursor position to end of inserted content
                    const newCursor = this.calculateEndPosition(responseStartPos, responseBuffer);
                    editor.setCursor(newCursor);
                    lastUpdatePos = responseStartPos; // Reset for next update
                };

                // Use conversation context if available, otherwise use simple prompt
                if (conversation.length > 0) {
                    const conversationMessages = this.buildConversationMessages(conversation);
                    await provider.getStreamingResponseWithConversation(conversationMessages, onUpdate, signal);
                } else {
                    await provider.getStreamingResponse(queryText, onUpdate, signal);
                }

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
                            { role: 'user', content: queryText },
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
            return;
        }

        // Original behavior when text is selected
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
            // No selection: first check for separator-mode, then fallback to conversation mode
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

            // If separator-mode not detected, try conversation mode
            if (!separatorMode) {
                // Get all text from start of current line to end of document (line-based conversation mode)
                const currentLineStartPos = { line: cursor.line, ch: 0 };
                const textBelowCursor = editor.getRange(currentLineStartPos, { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
                
                // Parse conversation from text below cursor (reverse order since newest is at top)
                const { conversation, lastUserMessage } = this.parseConversationFromText(textBelowCursor, true);
                
                // If no conversation found, treat all text as user prompt
                queryText = conversation.length > 0 ? lastUserMessage : textBelowCursor.trim();
                
                if (!queryText) {
                    new Notice('No text found below cursor to create a response.');
                    return;
                }
                
                // Set up for conversation mode response above cursor
                separatorMode = false; // We'll handle this differently
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
                const requestStart = new Date();

                // Determine mode and setup accordingly
                let conversationMode = false;
                let conversation: AIMessage[] = [];
                
                if (!selection && !separatorMode) {
                    // This is conversation mode - get text below cursor and parse it (reverse order)
                    const cursor = editor.getCursor();
                    const textBelowCursor = editor.getRange(cursor, { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
                    const parsedConversation = this.parseConversationFromText(textBelowCursor, true);
                    conversation = parsedConversation.conversation;
                    conversationMode = true;
                }

                const initialContent = separatorMode ? queryText : (selection ? (selection + this.plugin.settings.chatSeparator) : '');
                
                // Get the selection range before replacing
                const selectionStart = editor.getCursor('from');
                const selectionEnd = editor.getCursor('to');

                // Determine where the response should be inserted based on mode
                let responseStartPos: { line: number; ch: number };

                // Handle text replacement based on mode
                if (conversationMode) {
                    // Conversation mode: insert separator first at start of current line, then stream response above it
                    const cursor = editor.getCursor();
                    const currentLineStartPos = { line: cursor.line, ch: 0 };
                    const separatorWithNewline = '\n' + this.plugin.settings.chatSeparator + '\n';
                    editor.replaceRange(separatorWithNewline, currentLineStartPos, currentLineStartPos);
                    
                    // Calculate where the response should start (at the original line start position)
                    responseStartPos = currentLineStartPos; // Response goes at the start of the current line
                } else if (!separatorMode) {
                    // Selection mode: replace selection with query + separator
                    editor.replaceSelection(initialContent);
                    // Selection mode: insert at start of replaced text
                    responseStartPos = { line: selectionStart.line, ch: selectionStart.ch };
                } else if (separatorMode && separatorLineIndex !== null) {
                    // Separator mode: insert before the separator line
                    responseStartPos = { line: separatorLineIndex, ch: 0 };
                } else {
                    // Fallback case
                    responseStartPos = editor.getCursor();
                }

                // Buffer for accumulating the response
                let responseBuffer = "";
                let lastInsertedEnd = responseStartPos;

                const onUpdate = (text: string) => {
                    if (!text) return;

                    responseBuffer += text;

                    if (conversationMode) {
                        // Conversation mode: replace only the response part (separator already inserted)
                        editor.replaceRange(responseBuffer, responseStartPos, lastInsertedEnd);
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, responseBuffer);
                        
                        // Keep cursor positioned after the response
                        editor.setCursor(lastInsertedEnd);
                    } else if (separatorMode) {
                        // Separator mode: insert response with trailing newline
                        const insertText = responseBuffer + '\n';
                        editor.replaceRange(insertText, responseStartPos, lastInsertedEnd);
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, insertText);

                        // Restore cursor to the end of the original query line
                        const afterQueryPos = this.calculateEndPosition({ line: (separatorLineIndex as number) + 1, ch: 0 }, editor.getLine((separatorLineIndex as number) + 1));
                        editor.setCursor(afterQueryPos);
                    } else {
                        // Selection mode: replace the entire area
                        const insertText = responseBuffer + '\n';
                        editor.replaceRange(insertText, responseStartPos, editor.getCursor('from'));
                        editor.setCursor(editor.getCursor('to'));
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, insertText);
                    }
                };

                // Make API call based on mode
                if (conversationMode && conversation.length > 0) {
                    const conversationMessages = this.buildConversationMessages(conversation);
                    await provider.getStreamingResponseWithConversation(conversationMessages, onUpdate, signal);
                } else {
                    const promptText = selection || queryText;
                    await provider.getStreamingResponse(promptText, onUpdate, signal);
                }

                // After streaming completes, optionally record the call
                if (this.plugin.settings.recordApiCalls) {
                    try {
                        const providerKey = this.plugin.settings.apiProvider as keyof typeof this.plugin.settings.aiProviderSettings;
                        const cfgAny = this.plugin.settings.aiProviderSettings[providerKey] as any;
                        const model = typeof cfgAny?.model === 'string' ? cfgAny.model : '';
                        const systemPrompt = typeof cfgAny?.system_prompt === 'string' ? cfgAny.system_prompt : '';
                        const temperature = typeof cfgAny?.temperature === 'number' ? cfgAny.temperature : null;

                        const recordedPrompt = selection || queryText;
                        const redaction = redactMessages([
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: recordedPrompt },
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
