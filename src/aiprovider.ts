import { VaultBotPluginSettings } from "./settings";
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

    constructor(settings: VaultBotPluginSettings) {
        this.settings = settings;
        this.provider = this.createProvider();
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

    async getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void> {
        // Normalize single prompt to message array and use wrapper's conversation method
        const messages = this.normalizeToMessages(prompt);
        return this.getStreamingResponseWithConversation(messages, onUpdate, signal);
    }

    async getStreamingResponseWithConversation(messages: AIMessage[], onUpdate: (text: string) => void, signal: AbortSignal): Promise<void> {
        // Prepend system prompt if it doesn't already exist and system prompt is configured
        const messagesWithSystemPrompt = this.prependSystemPrompt(messages);
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

    private getSystemPrompt(): string | null {
        const providerType = this.settings.apiProvider as ProviderType;
        const providerSettings = this.settings.aiProviderSettings[providerType];
        
        if (providerSettings && 'system_prompt' in providerSettings) {
            const systemPrompt = (providerSettings as any).system_prompt;
            return systemPrompt && systemPrompt.trim() ? systemPrompt : null;
        }
        
        return null;
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