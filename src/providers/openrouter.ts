import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { AIProvider, AIProviderSettings, AIMessage, ModelInfo } from './base';

export interface OpenRouterProviderSettings extends AIProviderSettings {
    api_key: string;
    model: string;
    system_prompt: string;
    temperature: number;
    site_url?: string;
    site_name?: string;
}

export class OpenRouterProvider implements AIProvider {
    private settings: OpenRouterProviderSettings;

    constructor(settings: OpenRouterProviderSettings) {
        this.settings = settings;
    }

    async getStreamingResponse(
        prompt: string,
        onUpdate: (text: string) => void,
        signal: AbortSignal
    ): Promise<void> {
        // Convert single prompt to message array and delegate to conversation method
        const messages: AIMessage[] = [
            {
                role: 'user',
                content: prompt
            }
        ];
        return this.getStreamingResponseWithConversation(messages, onUpdate, signal);
    }

    async getStreamingResponseWithConversation(
        messages: AIMessage[],
        onUpdate: (text: string) => void,
        signal: AbortSignal
    ): Promise<void> {
        try {
            const openrouter = createOpenRouter({
                apiKey: this.settings.api_key,
                extraBody: {
                    ...(this.settings.site_url && { site_url: this.settings.site_url }),
                    ...(this.settings.site_name && { site_name: this.settings.site_name })
                }
            });

            const model = openrouter(this.settings.model);

            // Convert our AIMessage format to the format expected by the AI SDK
            const formattedMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const { textStream } = await streamText({
                model,
                messages: formattedMessages,
                temperature: this.settings.temperature,
                abortSignal: signal
            });

            for await (const textPart of textStream) {
                onUpdate(textPart);
            }
        } catch (error: any) {
            // Check if it's an abort error
            if (error.name === 'AbortError') {
                console.log('OpenRouter request was aborted.');
                return; // Gracefully handle abort
            }
            
            console.error('Error in OpenRouter API request:', error);
            throw new Error('Failed to get response from OpenRouter.');
        }
    }

    async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
        try {
            // Make a simple API call to validate the key
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.api_key}`,
                    'HTTP-Referer': this.settings.site_url || 'https://obsidian.md',
                    'X-Title': this.settings.site_name || 'Obsidian Vault-Bot'
                }
            });

            if (response.ok) {
                return { valid: true };
            } else if (response.status === 401) {
                return { valid: false, error: 'Invalid API key' };
            } else if (response.status === 429) {
                return { valid: false, error: 'Rate limit exceeded' };
            } else if (response.status >= 500) {
                return { valid: false, error: 'OpenRouter service temporarily unavailable' };
            } else {
                const errorText = await response.text();
                return { valid: false, error: errorText || 'Unknown error occurred' };
            }
        } catch (error: any) {
            console.error('OpenRouter API key validation failed:', error);
            return { valid: false, error: error.message || 'Network error occurred' };
        }
    }

    async listModels(): Promise<ModelInfo[]> {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'HTTP-Referer': this.settings.site_url || 'https://obsidian.md',
                    'X-Title': this.settings.site_name || 'Obsidian Vault-Bot'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.name || model.id,
                description: model.description || `${model.id}`,
                context_length: model.context_length || model.top_provider?.context_length,
                pricing: {
                    prompt: model.pricing?.prompt,
                    completion: model.pricing?.completion
                }
            })).sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
        } catch (error: any) {
            console.error('Failed to fetch OpenRouter models:', error);
            // Return a fallback list of popular models
            return [
                { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4 Omni via OpenRouter', context_length: 128000 },
                { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI GPT-4 Omni Mini via OpenRouter', context_length: 128000 },
                { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic Claude 3.5 Sonnet via OpenRouter', context_length: 200000 },
                { id: 'google/gemini-pro', name: 'Gemini Pro', description: 'Google Gemini Pro via OpenRouter', context_length: 32768 },
                { id: 'meta-llama/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision', description: 'Meta Llama 3.2 90B Vision via OpenRouter', context_length: 128000 }
            ];
        }
    }
}
