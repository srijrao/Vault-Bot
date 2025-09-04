import { VaultBotPluginSettings } from './settings';
import { type ChatMessage } from './recorder';
import { ContentRetrievalService } from './services/content_retrieval';
import { App, TFile } from 'obsidian';

// Type for recording callback
export type RecordingCallback = (messages: ChatMessage[], model: string, options: Record<string, any>) => void;

import { 
    AIProvider, 
    OpenAIProvider, 
    OpenRouterProvider, 
    AIMessage,
    ModelInfo,
    type OpenAIProviderSettings, 
    type OpenRouterProviderSettings 
} from "./providers";

export type ProviderType = 'openai' | 'openrouter';
export type { AIMessage, ModelInfo };

export class AIProviderWrapper {
    private settings: VaultBotPluginSettings;
    private provider: AIProvider;
    private contentRetrievalService?: ContentRetrievalService;

    constructor(settings: VaultBotPluginSettings, app?: App) {
        this.settings = settings;
        this.provider = this.createProvider();
        
        if (app) {
            this.contentRetrievalService = new ContentRetrievalService(app, settings);
        }
    }

    private createProvider(): AIProvider {
        const providerType = this.settings.apiProvider as ProviderType;

        switch (providerType) {
            case 'openai':
                const openaiSettings = this.settings.aiProviderSettings['openai'] as OpenAIProviderSettings;
                return new OpenAIProvider(openaiSettings);
            
            case 'openrouter':
                const openrouterSettings = this.settings.aiProviderSettings['openrouter'] as OpenRouterProviderSettings;
                return new OpenRouterProvider(openrouterSettings);
            
            default:
                throw new Error(`Unsupported AI provider: ${providerType}`);
        }
    }

    async getStreamingResponse(
        prompt: string, 
        onUpdate: (text: string) => void, 
        signal: AbortSignal,
        recordingCallback?: RecordingCallback,
        currentFile?: TFile
    ): Promise<void> {
        // Normalize single prompt to message array and use wrapper's conversation method
        const messages = this.normalizeToMessages(prompt);
        return this.getStreamingResponseWithConversation(messages, onUpdate, signal, recordingCallback, currentFile);
    }

    async getStreamingResponseWithConversation(
        messages: AIMessage[], 
        onUpdate: (text: string) => void, 
        signal: AbortSignal,
        recordingCallback?: RecordingCallback,
        currentFile?: TFile
    ): Promise<void> {
        // Enhance messages with linked content if content retrieval service is available
        const enhancedMessages = await this.enhanceMessagesWithContent(messages, currentFile);
        
        // Prepend system prompt if it doesn't already exist and system prompt is configured
        const messagesWithSystemPrompt = this.prependSystemPrompt(enhancedMessages);
        
        // Record the exact messages being sent if callback provided
        if (recordingCallback && this.settings.recordApiCalls) {
            const providerType = this.settings.apiProvider as ProviderType;
            const providerSettings = this.settings.aiProviderSettings[providerType];
            const model = providerSettings && 'model' in providerSettings ? (providerSettings as any).model || '' : '';
            const temperature = providerSettings && 'temperature' in providerSettings ? (providerSettings as any).temperature || null : null;
            const options = { temperature };
            
            // Convert AIMessage[] to ChatMessage[] for recording
            const chatMessages: ChatMessage[] = messagesWithSystemPrompt.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            
            recordingCallback(chatMessages, model, options);
        }
        
        return this.provider.getStreamingResponseWithConversation(messagesWithSystemPrompt, onUpdate, signal);
    }

    async listModels(): Promise<ModelInfo[]> {
        return this.provider.listModels();
    }

    private normalizeToMessages(prompt: string): AIMessage[] {
        return [
            {
                role: 'user',
                content: prompt
            }
        ];
    }

    private prependSystemPrompt(messages: AIMessage[]): AIMessage[] {
        const systemPrompt = this.getSystemPrompt();
        
        // If no system prompt configured, return messages as-is
        if (!systemPrompt) {
            return messages;
        }

        // If first message is already a system message, return messages as-is
        if (messages.length > 0 && messages[0].role === 'system') {
            return messages;
        }

        // Prepend system prompt
        return [
            {
                role: 'system',
                content: systemPrompt
            },
            ...messages
        ];
    }

    private async enhanceMessagesWithContent(messages: AIMessage[], currentFile?: TFile): Promise<AIMessage[]> {
        if (!this.contentRetrievalService) {
            return messages; // No content retrieval service available
        }

        // Check if any content retrieval features are enabled
        const hasContentFeatures = this.settings.includeCurrentNote || 
                                   this.settings.includeOpenNotes || 
                                   this.settings.includeLinkedNotes;
        
        if (!hasContentFeatures) {
            return messages; // No content features enabled
        }

        try {
            // Get the last user message to analyze for links
            const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
            if (!lastUserMessage) {
                return messages; // No user message to analyze
            }

            // Retrieve content based on settings
            const retrievedNotes = await this.contentRetrievalService.retrieveContent(
                lastUserMessage.content, 
                currentFile
            );

            if (retrievedNotes.length === 0) {
                return messages; // No content retrieved
            }

            // Format the retrieved content
            const formattedContent = this.contentRetrievalService.formatNotesForAI(retrievedNotes);

            // Create a new array of messages with the enhanced last user message
            const enhancedMessages = [...messages];
            
            // Find the last user message index and enhance it
            for (let i = enhancedMessages.length - 1; i >= 0; i--) {
                if (enhancedMessages[i].role === 'user') {
                    enhancedMessages[i] = {
                        ...enhancedMessages[i],
                        content: enhancedMessages[i].content + formattedContent
                    };
                    break;
                }
            }

            return enhancedMessages;
        } catch (error) {
            console.error('Error enhancing messages with content:', error);
            // Return original messages if enhancement fails
            return messages;
        }
    }

    public getSystemPrompt(): string | null {
        const providerType = this.settings.apiProvider as ProviderType;
        const providerSettings = this.settings.aiProviderSettings[providerType];
        
        // Get the base system prompt from settings
        let baseSystemPrompt: string | null = null;
        if (providerSettings && 'system_prompt' in providerSettings) {
            const systemPrompt = (providerSettings as any).system_prompt;
            baseSystemPrompt = systemPrompt && systemPrompt.trim() ? systemPrompt : null;
        }
        
        // Check if datetime should be included
        const shouldIncludeDatetime = this.settings.includeDatetime !== false; // Default to true if not specified
        
        if (shouldIncludeDatetime) {
            const datetimePrefix = this.getCurrentDateTimeString();
            
            if (baseSystemPrompt) {
                return `${datetimePrefix}\n\n${baseSystemPrompt}`;
            } else {
                // Return just the datetime if no system prompt is configured
                return datetimePrefix;
            }
        } else {
            // Return just the base system prompt without datetime
            return baseSystemPrompt;
        }
    }

    private getCurrentDateTimeString(): string {
        const now = new Date();
        
        // Format: YYYY-MM-DD HH:mm:ss
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        // Get UTC offset in ±HH:MM format
        const offsetMinutes = now.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
        const offsetMins = Math.abs(offsetMinutes) % 60;
        const offsetSign = offsetMinutes <= 0 ? '+' : '-';
        const utcOffset = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
        
        return `Current date and time: ${year}-${month}-${day} ${hours}:${minutes}:${seconds} (UTC offset ${utcOffset})`;
    }

    async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
        return this.provider.validateApiKey();
    }

    // Method to recreate the provider when settings change
    updateProvider(newSettings: VaultBotPluginSettings): void {
        this.settings = newSettings;
        this.provider = this.createProvider();
    }
}

// Re-export types for backward compatibility
export type { OpenAIProviderSettings, OpenRouterProviderSettings } from "./providers";