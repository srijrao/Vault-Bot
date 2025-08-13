import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { AIProvider, AIProviderSettings } from './base';

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
}
