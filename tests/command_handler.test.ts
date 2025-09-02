import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CommandHandler } from '../src/command_handler';
import VaultBotPlugin from '../main';
import { VaultBotPluginSettings, DEFAULT_SETTINGS } from '../src/settings';

// Mock Obsidian
vi.mock('obsidian', () => ({
    Notice: vi.fn(),
    PluginSettingTab: class {
        constructor(app: any, plugin: any) {}
    },
    Modal: class {
        app: any;
        contentEl: any;
        titleEl: any;
        constructor(app: any) {
            this.app = app;
            this.contentEl = { createDiv: vi.fn() };
            this.titleEl = { setText: vi.fn() };
        }
        open() {}
        close() {}
    },
    FuzzySuggestModal: class MockFuzzySuggestModal {
        constructor(public app: any) {}
        open() {}
        close() {}
        onOpen() {}
        onClose() {}
        setPlaceholder() {}
        getItems() { return []; }
        getItemText() { return ''; }
        onChooseItem() {}
        renderSuggestion() {}
    },
}));

// Mock AI Provider Wrapper
const mockGetStreamingResponse = vi.fn();
const mockGetStreamingResponseWithConversation = vi.fn();
vi.mock('../src/aiprovider', () => ({
    AIProviderWrapper: vi.fn().mockImplementation(() => ({
        getStreamingResponse: mockGetStreamingResponse,
        getStreamingResponseWithConversation: mockGetStreamingResponseWithConversation,
        getSystemPrompt: vi.fn().mockReturnValue('System prompt (test)'),
    })),
}));

describe('CommandHandler', () => {
    let plugin: VaultBotPlugin;
    let commandHandler: CommandHandler;
    let mockMarkdownView: any;
    let mockEditor: any;
    let mockNotice: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Get mocked functions
        const { Notice } = await import('obsidian');
        mockNotice = Notice;
        
        mockEditor = {
            getSelection: vi.fn(),
            replaceSelection: vi.fn(),
            getCursor: vi.fn(),
            getLine: vi.fn(),
            replaceRange: vi.fn(),
            setCursor: vi.fn(),
            getRange: vi.fn(),
            lastLine: vi.fn(),
        };
        
        plugin = {
            settings: { ...DEFAULT_SETTINGS },
        } as VaultBotPlugin;
        commandHandler = new CommandHandler(plugin);
        mockMarkdownView = {};
        mockGetStreamingResponse.mockReset();
    });

    it('should show notice if response is already in progress', async () => {
        commandHandler.abortController = new AbortController();
        mockEditor.getSelection.mockReturnValue('some text');
        
        await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);
        
        expect(mockNotice).toHaveBeenCalledWith('A response is already in progress. Please stop it first.');
    });

    it('should show notice if no text is selected and no text above cursor', async () => {
        mockEditor.getSelection.mockReturnValue('');
        mockEditor.getCursor.mockReturnValue({ line: 0, ch: 0 });
        mockEditor.getRange.mockReturnValue(''); // No text above cursor
        mockEditor.getLine.mockReturnValue(''); // No text on current line
        
        await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);
        
        expect(mockNotice).toHaveBeenCalledWith('No text found above cursor to create a response.');
    });

    it('should call AI provider and update editor on successful response', async () => {
        const selection = 'test prompt';
        mockEditor.getSelection.mockReturnValue(selection);
        mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
            onUpdate('response part 1');
            onUpdate('response part 2');
        });
        // Mock getCursor for both 'from' and 'to' and default calls
        mockEditor.getCursor.mockImplementation((type?: string) => {
            if (type === 'from' || type === 'to') return { line: 0, ch: 50 };
            return { line: 0, ch: 50 }; // Default cursor position
        });

        await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

        expect(mockEditor.replaceSelection).toHaveBeenCalledWith(selection + plugin.settings.chatSeparator);
        // Now expects optional 4th arg: recording callback
        expect(mockGetStreamingResponse).toHaveBeenCalledWith(
            selection,
            expect.any(Function),
            expect.any(AbortSignal),
            expect.any(Function)
        );
        expect(mockEditor.replaceRange).toHaveBeenCalledTimes(2);
        expect(mockEditor.setCursor).toHaveBeenCalledTimes(2);
    });

    it('should correctly handle buffer-based streaming updates', async () => {
        const selection = 'test prompt';
        const separator = plugin.settings.chatSeparator; // '\n\n----\n\n'
        mockEditor.getSelection.mockReturnValue(selection);
        mockEditor.getCursor.mockImplementation((type?: string) => {
            if (type === 'from' || type === 'to') return { line: 2, ch: 10 };
            return { line: 2, ch: 10 }; // Default cursor position for other calls
        });
        
        mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
            onUpdate('chunk1');
            onUpdate('chunk2');
        });

        await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

        // Verify the first update call - should replace just the response area with 'chunk1'
        const firstCall = mockEditor.replaceRange.mock.calls[0];
        expect(firstCall[0]).toBe('chunk1'); // Only the response content
        // Response starts after the initial content (selection + separator)
        // Since separator has 5 lines ('\n\n----\n\n'), response starts at line 2+4=6, ch=0
        expect(firstCall[1]).toEqual({ line: 6, ch: 0 }); // Response start position
        expect(firstCall[2]).toEqual({ line: 2, ch: 10 }); // Current cursor (will be overwritten)

        // Verify the second update call - should replace response area with 'chunk1chunk2'
        const secondCall = mockEditor.replaceRange.mock.calls[1];
        expect(secondCall[0]).toBe('chunk1chunk2'); // Accumulated response buffer
        expect(secondCall[1]).toEqual({ line: 6, ch: 0 }); // Same response start position
        expect(secondCall[2]).toEqual({ line: 2, ch: 10 }); // Current cursor (will be overwritten)

        // Verify cursor was set to end of content after each update
        expect(mockEditor.setCursor).toHaveBeenCalledTimes(2);
        expect(mockEditor.setCursor).toHaveBeenNthCalledWith(1, { line: 6, ch: 6 }); // End of 'chunk1'
        expect(mockEditor.setCursor).toHaveBeenNthCalledWith(2, { line: 6, ch: 12 }); // End of 'chunk1chunk2'
    });

    it('should handle stopping a response', () => {
        commandHandler.abortController = new AbortController();
        const abortSpy = vi.spyOn(commandHandler.abortController, 'abort');
        
        const result = commandHandler.handleStopResponse(false);
        
        expect(abortSpy).toHaveBeenCalled();
        expect(mockNotice).toHaveBeenCalledWith('AI response stopped.');
        expect(result).toBe(true);
    });

    it('should return false when no response is in progress for stop command', () => {
        commandHandler.abortController = null;
        
        const result = commandHandler.handleStopResponse(false);
        
        expect(result).toBe(false);
    });

    it('should handle AI provider errors gracefully', async () => {
        const selection = 'test prompt';
        mockEditor.getSelection.mockReturnValue(selection);
        mockEditor.getCursor.mockImplementation((type?: string) => ({ line: 0, ch: 0 }));
        mockGetStreamingResponse.mockRejectedValue(new Error('API Error'));

        await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

        expect(mockNotice).toHaveBeenCalledWith('Error getting response from AI.');
        expect(commandHandler.abortController).toBe(null);
    });

    it('should detect separator-mode and insert response above a multi-line separator', async () => {
        // Configure a multi-line separator in settings
        plugin.settings.chatSeparator = '\n==sep==\n==sep==\n';
        commandHandler.onSettingsChanged();

        // Arrange editor lines: separator occupies lines 2..3, query on line 4
        // We'll mock getLine to return appropriate lines
        const lines = [
            'line0',
            'line1',
            '\n==sep==', // start of separator join
            '==sep==',   // end of separator join
            'my query',
        ];

        mockEditor.getSelection.mockReturnValue(''); // no selection
        mockEditor.getCursor.mockImplementation(() => ({ line: 4, ch: 0 }));
        mockEditor.getLine.mockImplementation((i: number) => lines[i] ?? '');

        mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
            // Simulate a streaming response
            onUpdate('answer part');
        });

    await commandHandler.handleGetResponseAbove(mockEditor as any, mockMarkdownView);

        // Expect that replaceRange was called to insert the response above the separator block
        expect(mockEditor.replaceRange).toHaveBeenCalled();
        const callArgs = mockEditor.replaceRange.mock.calls[0];
        const insertedText = callArgs[0];
        const startPos = callArgs[1];
    // Should have inserted the streamed response without extra newline
    expect(insertedText).toBe('answer part');
        // Start position should point at the start of the separator block (line 2)
        expect(startPos).toEqual({ line: 2, ch: 0 });
    });

    describe('Different Chat Separators', () => {
        it('should handle single-line separator correctly', async () => {
            // Update plugin settings to use single-line separator
            plugin.settings.chatSeparator = ' | ';
            commandHandler.onSettingsChanged();
            
            const selection = 'test prompt';
            mockEditor.getSelection.mockReturnValue(selection);
            mockEditor.getCursor.mockImplementation((type?: string) => {
                if (type === 'from' || type === 'to') return { line: 1, ch: 5 };
                return { line: 1, ch: 5 };
            });
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('response');
            });

            await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

            const call = mockEditor.replaceRange.mock.calls[0];
            expect(call[0]).toBe('response'); // Only response content in buffer
            // Response starts after "test prompt | " on same line
            expect(call[1]).toEqual({ line: 1, ch: 5 + selection.length + 3 }); // start position after selection + separator
            expect(call[2]).toEqual({ line: 1, ch: 5 }); // current cursor (to be replaced)
            
            // Verify cursor was set to end of response
            expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 5 + selection.length + 3 + 8 }); // end of "response"
        });

        it('should handle multi-line separator correctly', async () => {
            // Update plugin settings to use multi-line separator
            plugin.settings.chatSeparator = '\n===\n===\n';
            commandHandler.onSettingsChanged();
            
            const selection = 'test prompt';
            mockEditor.getSelection.mockReturnValue(selection);
            mockEditor.getCursor.mockImplementation((type?: string) => {
                if (type === 'from' || type === 'to') return { line: 2, ch: 10 };
                return { line: 2, ch: 10 };
            });
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('response');
            });

            await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

            const call = mockEditor.replaceRange.mock.calls[0];
            expect(call[0]).toBe('response'); // Only response content in buffer
            // Response starts after multi-line separator (3 lines total)
            expect(call[1]).toEqual({ line: 5, ch: 0 }); // line 2 + 3 separator lines
            expect(call[2]).toEqual({ line: 2, ch: 10 }); // current cursor
            
            // Verify cursor was set to end of response
            expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 5, ch: 8 }); // end of "response"
        });

        it('should handle empty separator correctly', async () => {
            // Update plugin settings to use empty separator
            plugin.settings.chatSeparator = '';
            commandHandler.onSettingsChanged();
            
            const selection = 'test prompt';
            mockEditor.getSelection.mockReturnValue(selection);
            mockEditor.getCursor.mockImplementation((type?: string) => {
                if (type === 'from' || type === 'to') return { line: 0, ch: 0 };
                return { line: 0, ch: 0 };
            });
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('response');
            });

            await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

            const call = mockEditor.replaceRange.mock.calls[0];
            expect(call[0]).toBe('response'); // Only response content
            // Response starts immediately after selection (no separator)
            expect(call[1]).toEqual({ line: 0, ch: selection.length }); // after selection
            expect(call[2]).toEqual({ line: 0, ch: 0 }); // current cursor
            
            // Verify cursor was set to end of response
            expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 0, ch: selection.length + 8 }); // end of "response"
        });

        it('should handle multi-line selection with single-line separator', async () => {
            plugin.settings.chatSeparator = ' -- ';
            commandHandler.onSettingsChanged();
            
            const selection = 'line1\nline2\nline3';
            mockEditor.getSelection.mockReturnValue(selection);
            mockEditor.getCursor.mockImplementation((type?: string) => {
                if (type === 'from' || type === 'to') return { line: 1, ch: 0 };
                return { line: 1, ch: 0 };
            });
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('response');
            });

            await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

            const call = mockEditor.replaceRange.mock.calls[0];
            expect(call[0]).toBe('response'); // Only response content
            // Multi-line selection (3 lines) + single-line separator
            // Response starts after "line3 -- " on line 3
            expect(call[1]).toEqual({ line: 3, ch: 9 }); // line 1 + 2 selection lines, after "line3 -- "
            expect(call[2]).toEqual({ line: 1, ch: 0 }); // current cursor
            
            // Verify cursor was set to end of response
            expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 3, ch: 17 }); // end of "response"
        });

        it('should handle multi-line response with multi-line separator', async () => {
            plugin.settings.chatSeparator = '\n---\n';
            commandHandler.onSettingsChanged();
            
            const selection = 'prompt';
            mockEditor.getSelection.mockReturnValue(selection);
            mockEditor.getCursor.mockImplementation((type?: string) => {
                if (type === 'from' || type === 'to') return { line: 0, ch: 0 };
                return { line: 0, ch: 0 };
            });
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('line1\nline2');
            });

            await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

            const call = mockEditor.replaceRange.mock.calls[0];
            expect(call[0]).toBe('line1\nline2'); // Only response content
            // Response starts after multi-line separator (2 lines)
            expect(call[1]).toEqual({ line: 2, ch: 0 }); // line 0 + 2 separator lines
            expect(call[2]).toEqual({ line: 0, ch: 0 }); // current cursor
            
            // Verify cursor was set to end of multi-line response
            expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 3, ch: 5 }); // end of "line2"
        });

        it('should recalculate separator metrics when settings change', () => {
            // Initial separator
            expect(commandHandler['separatorMetrics']?.separator).toBe('\n\n----\n\n');
            expect(commandHandler['separatorMetrics']?.lineCount).toBe(5);
            
            // Change settings and trigger recalculation
            plugin.settings.chatSeparator = ' | ';
            commandHandler.onSettingsChanged();
            
            // Verify new metrics
            expect(commandHandler['separatorMetrics']?.separator).toBe(' | ');
            expect(commandHandler['separatorMetrics']?.lineCount).toBe(1);
            expect(commandHandler['separatorMetrics']?.lastLineLength).toBe(3);
        });
    });

    describe('Conversation Mode for Get Response Below', () => {
        it('should use line-based conversation parsing for Get Response Below', async () => {
            const conversationText = 'Previous conversation\n\n----\n\nUser message on current line';
            const cursorPos = { line: 4, ch: 10 }; // Cursor in middle of line 4
            const currentLineText = 'User message on current line';
            const lineEndPos = { line: 4, ch: currentLineText.length }; // End of line 4
            
            mockEditor.getSelection.mockReturnValue('');
            mockEditor.getCursor.mockReturnValue(cursorPos);
            mockEditor.getLine.mockReturnValue(currentLineText);
            mockEditor.getRange.mockReturnValue(conversationText);
            
            mockGetStreamingResponseWithConversation.mockImplementation(async (messages: any, onUpdate: any) => {
                onUpdate('AI response');
            });

            await commandHandler.handleGetResponseBelow(mockEditor as any, mockMarkdownView);

            // Verify getRange was called from start of document to end of current line
            expect(mockEditor.getRange).toHaveBeenCalledWith(
                { line: 0, ch: 0 }, // From start of document
                lineEndPos // To end of current line
            );

            // Verify separator was inserted at end of current line
            expect(mockEditor.replaceRange).toHaveBeenCalledWith(
                '\n\n----\n\n\n',
                lineEndPos,
                lineEndPos
            );
        });
    });

    describe('Conversation Mode for Get Response Above', () => {
        it('should handle conversation mode with reverse chronological order', async () => {
            // Simulate text below cursor in reverse chronological order (newest at top)
            const conversationText = 'Latest assistant response\n\n----\n\nUser follow-up question\n\n----\n\nOriginal assistant response\n\n----\n\nOriginal user question';
            mockEditor.getSelection.mockReturnValue('');
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 0 });
            mockEditor.getRange.mockReturnValue(conversationText);
            mockEditor.lastLine.mockReturnValue(8);
            mockEditor.getLine.mockReturnValue('');
            
            mockGetStreamingResponseWithConversation.mockImplementation(async (messages: any, onUpdate: any) => {
                onUpdate('New AI response');
            });

        await commandHandler.handleGetResponseAbove(mockEditor as any, mockMarkdownView);

            // Should call with conversation in correct chronological order for AI processing
            expect(mockGetStreamingResponseWithConversation).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ role: 'user', content: 'Original user question' }),
                    expect.objectContaining({ role: 'assistant', content: 'Original assistant response' }),
                    expect.objectContaining({ role: 'user', content: 'User follow-up question' }),
                    expect.objectContaining({ role: 'assistant', content: 'Latest assistant response' })
                ]), 
                expect.any(Function), 
                expect.any(AbortSignal),
                expect.any(Function)
            );
        });

        it('should handle conversation mode when no conversation structure found below cursor', async () => {
            const plainText = 'Just some plain text without separators';
            mockEditor.getSelection.mockReturnValue('');
            mockEditor.getCursor.mockReturnValue({ line: 0, ch: 0 });
            mockEditor.getRange.mockReturnValue(plainText);
            mockEditor.lastLine.mockReturnValue(2);
            mockEditor.getLine.mockReturnValue('');
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('AI response to plain text');
            });

            await commandHandler.handleGetResponseAbove(mockEditor as any, mockMarkdownView);

            // Should fall back to treating entire text as user prompt
            expect(mockGetStreamingResponse).toHaveBeenCalledWith(
                plainText.trim(),
                expect.any(Function), 
                expect.any(AbortSignal),
                expect.any(Function)
            );
        });

        it('should handle empty text below cursor for Get Response Above', async () => {
            mockEditor.getSelection.mockReturnValue('');
            mockEditor.getCursor.mockReturnValue({ line: 5, ch: 0 });
            mockEditor.getRange.mockReturnValue(''); // No text below cursor
            mockEditor.lastLine.mockReturnValue(5);
            mockEditor.getLine.mockReturnValue('');
            
            await commandHandler.handleGetResponseAbove(mockEditor as any, mockMarkdownView);
            
            expect(mockNotice).toHaveBeenCalledWith('No text found below cursor to create a response.');
        });

        it('should not replace user message when inserting AI response in conversation mode', async () => {
            const userText = 'User question below cursor';
            const cursorPos = { line: 2, ch: 5 }; // Cursor in middle of line 2
            const lineStartPos = { line: 2, ch: 0 }; // Start of line 2
            
            mockEditor.getSelection.mockReturnValue('');
            mockEditor.getCursor.mockReturnValue(cursorPos);
            mockEditor.getRange.mockReturnValue(userText);
            mockEditor.lastLine.mockReturnValue(3);
            mockEditor.getLine.mockReturnValue('User question below cursor');
            
            mockGetStreamingResponse.mockImplementation(async (prompt: any, onUpdate: any) => {
                onUpdate('AI response chunk 1');
                onUpdate(' AI response chunk 2');
            });

            await commandHandler.handleGetResponseAbove(mockEditor as any, mockMarkdownView);

            // Verify separator was inserted at start of current line (line-based) without extra newlines
            expect(mockEditor.replaceRange).toHaveBeenCalledWith(
                plugin.settings.chatSeparator,
                lineStartPos,
                lineStartPos
            );

            // Verify AI response was inserted at line start position (not replacing user text)
            // The first update should replace from line start to line start (insert mode)
            expect(mockEditor.replaceRange).toHaveBeenCalledWith(
                'AI response chunk 1',
                lineStartPos,
                lineStartPos
            );
        });

        it('should use line-based conversation parsing for Get Response Above', async () => {
            const conversationText = 'User message on current line\n\n----\n\nPrevious AI response';
            const cursorPos = { line: 0, ch: 10 }; // Cursor in middle of first line
            const lineStartPos = { line: 0, ch: 0 }; // Start of first line
            const currentLineText = 'User message on current line';
            
            mockEditor.getSelection.mockReturnValue('');
            mockEditor.getCursor.mockReturnValue(cursorPos);
            mockEditor.getRange.mockReturnValue(conversationText); // This should be called with line start, not cursor
            mockEditor.lastLine.mockReturnValue(4);
            mockEditor.getLine.mockReturnValue(currentLineText);
            
            mockGetStreamingResponseWithConversation.mockImplementation(async (messages: any, onUpdate: any) => {
                onUpdate('New AI response');
            });

            await commandHandler.handleGetResponseAbove(mockEditor as any, mockMarkdownView);

            // Verify getRange was called from start of current line to end of document
            expect(mockEditor.getRange).toHaveBeenCalledWith(
                lineStartPos, // Should start from beginning of current line
                { line: 4, ch: currentLineText.length } // To end of document
            );
        });
    });

    describe('Position Calculation Methods', () => {
        it('should calculate response start position correctly for single-line content', () => {
            const selectionStart = { line: 2, ch: 10 };
            const initialContent = 'Hello world';
            
            const result = commandHandler['calculateResponseStartPosition'](selectionStart, initialContent);
            
            expect(result).toEqual({ line: 2, ch: 21 }); // 10 + 11 = 21
        });

        it('should calculate response start position correctly for multi-line content', () => {
            const selectionStart = { line: 1, ch: 5 };
            const initialContent = 'line1\nline2\nline3';
            
            const result = commandHandler['calculateResponseStartPosition'](selectionStart, initialContent);
            
            expect(result).toEqual({ line: 3, ch: 5 }); // line 1 + 2 lines, ch = length of 'line3'
        });

        it('should calculate end position correctly for single-line content', () => {
            const startPos = { line: 3, ch: 10 };
            const content = 'response';
            
            const result = commandHandler['calculateEndPosition'](startPos, content);
            
            expect(result).toEqual({ line: 3, ch: 18 }); // 10 + 8 = 18
        });

        it('should calculate end position correctly for multi-line content', () => {
            const startPos = { line: 2, ch: 5 };
            const content = 'line1\nline2\nfinal';
            
            const result = commandHandler['calculateEndPosition'](startPos, content);
            
            expect(result).toEqual({ line: 4, ch: 5 }); // line 2 + 2 lines, ch = length of 'final'
        });
    });
});
