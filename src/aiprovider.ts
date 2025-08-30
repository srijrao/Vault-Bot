import { VaultBotPluginSettings } from "./settings";
import { 
    AIProvider, 
    OpenAIProvider, 
    OpenRouterProvider, 
    AIMessage,
    type OpenAIProviderSettings, 
    type OpenRouterProviderSettings 
} from "./providers";

export type ProviderType = 'openai' | 'openrouter';
export type { AIMessage };

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
        return this.provider.getStreamingResponse(prompt, onUpdate, signal);
    }

    async getStreamingResponseWithConversation(messages: AIMessage[], onUpdate: (text: string) => void, signal: AbortSignal): Promise<void> {
        return this.provider.getStreamingResponseWithConversation(messages, onUpdate, signal);
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