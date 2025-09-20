import { Editor, MarkdownView, Notice } from 'obsidian';
import { AIProviderWrapper, AIMessage } from './aiprovider';
import VaultBotPlugin from '../main';
import { recordChatCall, type ChatRequestRecord, type ChatResponseRecord, type ChatMessage } from './recorder';
import { resolveAiCallsDir } from './storage_paths';
import { redactMessages } from './redaction';

type Direction = 'above' | 'below';

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

    private buildConversationMessages(conversationParts: AIMessage[], provider?: AIProviderWrapper): AIMessage[] {
        const messages: AIMessage[] = [];
        
        // Add system prompt if available
        const systemPrompt = provider ? provider.getSystemPrompt() || '' : '';
        
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

    // Shared conversation-mode handler for both Above and Below commands using line boundaries
    private async handleDirectionalConversation(editor: Editor, direction: Direction, view: MarkdownView): Promise<void> {
        if (this.abortController) {
            new Notice('A response is already in progress. Please stop it first.');
            return;
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const provider = new AIProviderWrapper(this.plugin.settings, (this.plugin as any).app);
            const requestStart = new Date();
            const currentFile = view.file; // Get the current file from the view

            const cursor = editor.getCursor();
            const currentLineStartPos = { line: cursor.line, ch: 0 };
            const currentLineEndPos = { line: cursor.line, ch: editor.getLine(cursor.line).length };

            // Direction-specific slice for conversation parsing (line-based)
            const sliceStart = direction === 'below' ? { line: 0, ch: 0 } : currentLineStartPos;
            const sliceEnd = direction === 'below' ? currentLineEndPos : { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length };
            const textSlice = editor.getRange(sliceStart, sliceEnd);

            const reverseOrder = direction === 'above';
            const { conversation, lastUserMessage } = this.parseConversationFromText(textSlice, reverseOrder);
            const queryText = conversation.length > 0 ? lastUserMessage : textSlice.trim();

            if (!queryText) {
                const msg = direction === 'below'
                    ? 'No text found above cursor to create a response.'
                    : 'No text found below cursor to create a response.';
                new Notice(msg);
                this.abortController = null;
                return;
            }

            // Compute insertion positions at line boundaries based on direction
            let responseStartPos: { line: number; ch: number };
            if (direction === 'below') {
                // Insert separator at end of current line; response streams after it
                const insertionPos = currentLineEndPos;
                const separatorWithNewline = this.plugin.settings.chatSeparator + '\n';
                editor.replaceRange(separatorWithNewline, insertionPos, insertionPos);
                responseStartPos = this.calculateResponseStartPosition(insertionPos, separatorWithNewline);
            } else {
                // Insert separator block that will follow the response, then stream response at start of current line
                const insertionPos = currentLineStartPos;
                // Do not add extra newlines; the chat separator already contains spacing
                const separatorOnly = this.plugin.settings.chatSeparator;
                editor.replaceRange(separatorOnly, insertionPos, insertionPos);
                responseStartPos = insertionPos;
            }

            // Buffer for accumulating the response
            let responseBuffer = '';
            let lastInsertedEnd = responseStartPos; // Track the end of the previously inserted response

            const onUpdate = (text: string) => {
                if (!text) return; // Skip empty chunks

                responseBuffer += text;

                // Replace only the previously inserted response region with the new buffer
                editor.replaceRange(responseBuffer, responseStartPos, lastInsertedEnd);

                // Update cursor position to end of inserted content
                const newCursor = this.calculateEndPosition(responseStartPos, responseBuffer);
                editor.setCursor(newCursor);
                lastInsertedEnd = newCursor; // Advance the region end
            };

            // Create recording callback for upstream message capture
            let recordedMessages: ChatMessage[] = [];
            let recordedModel = '';
            let recordedOptions: Record<string, any> = {};
            const recordingCallback = (messages: ChatMessage[], model: string, options: Record<string, any>) => {
                recordedMessages = messages;
                recordedModel = model;
                recordedOptions = options;
            };

            // Buffer for tracking final response to add separator after completion
            let finalResponseBuffer = '';
            const originalOnUpdate = onUpdate;
            const enhancedOnUpdate = (text: string) => {
                finalResponseBuffer += text;
                originalOnUpdate(text);
            };

            // Use conversation context if available, otherwise use simple prompt
            if (conversation.length > 0) {
                const conversationMessages = this.buildConversationMessages(conversation, provider);
                await provider.getStreamingResponseWithConversation(conversationMessages, enhancedOnUpdate, signal, recordingCallback, currentFile || undefined, true);
            } else {
                await provider.getStreamingResponse(queryText, enhancedOnUpdate, signal, recordingCallback, currentFile || undefined);
            }

            // After response is complete, add separator for next interaction
            if (finalResponseBuffer) {
                const currentCursor = editor.getCursor();
                const separatorToAdd = direction === 'below' ? '\n' + this.plugin.settings.chatSeparator : this.plugin.settings.chatSeparator + '\n';
                editor.replaceRange(separatorToAdd, currentCursor, currentCursor);
                // Position cursor after the separator for next input
                const newCursorPos = this.calculateEndPosition(currentCursor, separatorToAdd);
                editor.setCursor(newCursorPos);
            }

            // After streaming completes, optionally record the call using captured messages
            if (this.plugin.settings.recordApiCalls && recordedMessages.length > 0) {
                try {
                    const redaction = redactMessages(recordedMessages);

                    const requestRecord: ChatRequestRecord = {
                        provider: this.plugin.settings.apiProvider,
                        model: recordedModel,
                        messages: redaction.messages,
                        options: recordedOptions,
                        timestamp: requestStart.toISOString(),
                    };

                    const responseRecord: ChatResponseRecord = {
                        content: responseBuffer || null,
                        provider: this.plugin.settings.apiProvider,
                        model: recordedModel,
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

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                new Notice('Error getting response from AI.');
                console.error(error);
            }
        } finally {
            this.abortController = null;
        }
    }

    async handleGetResponseBelow(editor: Editor, view: MarkdownView) {
        const selection = editor.getSelection();

        // Handle conversation mode when nothing is selected
        if (!selection) {
            await this.handleDirectionalConversation(editor, 'below', view);
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
            const provider = new AIProviderWrapper(this.plugin.settings, (this.plugin as any).app);
            const initialContent = selection + this.plugin.settings.chatSeparator;
            const requestStart = new Date();
            const currentFile = view.file; // Get the current file from the view
            
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

            // Create recording callback for upstream message capture
            let recordedMessages: ChatMessage[] = [];
            let recordedModel = '';
            let recordedOptions: Record<string, any> = {};
            const recordingCallback = (messages: ChatMessage[], model: string, options: Record<string, any>) => {
                recordedMessages = messages;
                recordedModel = model;
                recordedOptions = options;
            };

            await provider.getStreamingResponse(selection, onUpdate, signal, recordingCallback, currentFile || undefined);

            // After response is complete, add separator for next interaction
            if (responseBuffer) {
                const currentCursor = editor.getCursor();
                const separatorToAdd = '\n' + this.plugin.settings.chatSeparator;
                editor.replaceRange(separatorToAdd, currentCursor, currentCursor);
                // Position cursor after the separator for next input
                const newCursorPos = this.calculateEndPosition(currentCursor, separatorToAdd);
                editor.setCursor(newCursorPos);
            }

            // After streaming completes, optionally record the call using captured messages
            if (this.plugin.settings.recordApiCalls && recordedMessages.length > 0) {
                try {
                    const redaction = redactMessages(recordedMessages);

                    const requestRecord: ChatRequestRecord = {
                        provider: this.plugin.settings.apiProvider,
                        model: recordedModel,
                        messages: redaction.messages,
                        options: recordedOptions,
                        timestamp: requestStart.toISOString(),
                    };

                    const responseRecord: ChatResponseRecord = {
                        content: responseBuffer || null,
                        provider: this.plugin.settings.apiProvider,
                        model: recordedModel,
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
                await this.handleDirectionalConversation(editor, 'above', view);
                return;
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
                const provider = new AIProviderWrapper(this.plugin.settings, (this.plugin as any).app);
                const requestStart = new Date();
                const currentFile = view.file; // Get the current file from the view

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
                    // Do not add extra newlines; the chat separator already contains spacing
                    const separatorOnly = this.plugin.settings.chatSeparator;
                    editor.replaceRange(separatorOnly, currentLineStartPos, currentLineStartPos);
                    
                    // Calculate where the response should start (at the original line start position)
                    responseStartPos = currentLineStartPos; // Response goes at the start of the current line
                } else if (!separatorMode) {
                    // Selection mode (Above): do NOT replace the selection.
                    // Insert the chat separator at the selection start; stream the response before it.
                    const sep = this.plugin.settings.chatSeparator;
                    editor.replaceRange(sep, selectionStart, selectionStart);
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
                        // Separator mode: insert response (no extra trailing newline)
                        const insertText = responseBuffer;
                        editor.replaceRange(insertText, responseStartPos, lastInsertedEnd);
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, insertText);

                        // Restore cursor to the end of the original query line
                        const afterQueryPos = this.calculateEndPosition({ line: (separatorLineIndex as number) + 1, ch: 0 }, editor.getLine((separatorLineIndex as number) + 1));
                        editor.setCursor(afterQueryPos);
                    } else {
                        // Selection mode (Above): stream the response before the inserted separator; do not alter the original selection
                        editor.replaceRange(responseBuffer, responseStartPos, lastInsertedEnd);
                        lastInsertedEnd = this.calculateEndPosition(responseStartPos, responseBuffer);
                        editor.setCursor(lastInsertedEnd);
                    }
                };

                // Create recording callback for upstream message capture
                let recordedMessages: ChatMessage[] = [];
                let recordedModel = '';
                let recordedOptions: Record<string, any> = {};
                const recordingCallback = (messages: ChatMessage[], model: string, options: Record<string, any>) => {
                    recordedMessages = messages;
                    recordedModel = model;
                    recordedOptions = options;
                };

                // Make API call based on mode
                if (conversationMode && conversation.length > 0) {
                    const conversationMessages = this.buildConversationMessages(conversation, provider);
                    await provider.getStreamingResponseWithConversation(conversationMessages, onUpdate, signal, recordingCallback, currentFile || undefined, true);
                } else {
                    const promptText = selection || queryText;
                    await provider.getStreamingResponse(promptText, onUpdate, signal, recordingCallback, currentFile || undefined);
                }

                // After response is complete, add separator for next interaction (only if we actually got a response)
                if (responseBuffer) {
                    const currentCursor = editor.getCursor();
                    let separatorToAdd: string;
                    
                    if (conversationMode) {
                        // For conversation mode, add separator below the response
                        separatorToAdd = '\n' + this.plugin.settings.chatSeparator;
                    } else {
                        // For other modes (selection/separator), add separator above the response
                        separatorToAdd = this.plugin.settings.chatSeparator + '\n';
                        // Insert at the beginning of the response area
                        const insertPos = responseStartPos;
                        editor.replaceRange(separatorToAdd, insertPos, insertPos);
                        return; // Early return to avoid duplicate separator insertion
                    }
                    
                    editor.replaceRange(separatorToAdd, currentCursor, currentCursor);
                    // Position cursor after the separator for next input
                    const newCursorPos = this.calculateEndPosition(currentCursor, separatorToAdd);
                    editor.setCursor(newCursorPos);
                }

                // After streaming completes, optionally record the call using captured messages
                if (this.plugin.settings.recordApiCalls && recordedMessages.length > 0) {
                    try {
                        const redaction = redactMessages(recordedMessages);

                        const requestRecord: ChatRequestRecord = {
                            provider: this.plugin.settings.apiProvider,
                            model: recordedModel,
                            messages: redaction.messages,
                            options: recordedOptions,
                            timestamp: requestStart.toISOString(),
                        };

                        const responseRecord: ChatResponseRecord = {
                            content: responseBuffer || null,
                            provider: this.plugin.settings.apiProvider,
                            model: recordedModel,
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