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
}));

// Mock AI Provider Wrapper
const mockGetStreamingResponse = vi.fn();
vi.mock('../src/aiprovider', () => ({
    AIProviderWrapper: vi.fn().mockImplementation(() => ({
        getStreamingResponse: mockGetStreamingResponse,
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
        
        await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);
        
        expect(mockNotice).toHaveBeenCalledWith('A response is already in progress. Please stop it first.');
    });

    it('should show notice if no text is selected', async () => {
        mockEditor.getSelection.mockReturnValue('');
        
        await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);
        
        expect(mockNotice).toHaveBeenCalledWith('You must highlight text to get a response.');
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

        await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

        expect(mockEditor.replaceSelection).toHaveBeenCalledWith(selection + plugin.settings.chatSeparator);
        expect(mockGetStreamingResponse).toHaveBeenCalledWith(selection, expect.any(Function), expect.any(AbortSignal));
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

        await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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

        await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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
        // Should have inserted the streamed response + newline
        expect(insertedText).toBe('answer part\n');
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

            await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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

            await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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

            await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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

            await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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

            await commandHandler.handleGetResponse(mockEditor as any, mockMarkdownView);

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
