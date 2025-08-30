import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { AIProvider, AIProviderSettings, AIMessage } from './base';

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
        try {
            const openrouter = createOpenRouter({
                apiKey: this.settings.api_key,
                extraBody: {
                    ...(this.settings.site_url && { site_url: this.settings.site_url }),
                    ...(this.settings.site_name && { site_name: this.settings.site_name })
                }
            });

            const model = openrouter(this.settings.model);

            const { textStream } = await streamText({
                model,
                messages: [
                    { role: 'system', content: this.settings.system_prompt },
                    { role: 'user', content: prompt }
                ],
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
}
