import { Editor, MarkdownView, Notice } from 'obsidian';
import { AIProviderWrapper } from './aiprovider';
import VaultBotPlugin from '../main';

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

    async handleGetResponse(editor: Editor, view: MarkdownView) {
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
