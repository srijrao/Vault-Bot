import { VaultBotPluginSettings } from "./settings";
import OpenAI from "openai";

export interface AIProvider {
    getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void>;
}

export interface AIProviderSettings {
    // Marker interface for provider-specific settings
}

export interface OpenAIProviderSettings extends AIProviderSettings {
    model: string;
    system_prompt: string;
    temperature: number;
}

export class OpenAIProvider implements AIProvider {
    private settings: VaultBotPluginSettings;
    private openai: OpenAI;

    constructor(settings: VaultBotPluginSettings) {
        this.settings = settings;
        this.openai = new OpenAI({
            apiKey: this.settings.apiKey,
            dangerouslyAllowBrowser: true
        });
    }

    async getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void> {
        const openaiSettings = this.settings.aiProviderSettings['openai'] as OpenAIProviderSettings;
        try {
            const stream = await this.openai.chat.completions.create({
                model: openaiSettings.model,
                messages: [
                    {
                        role: 'system',
                        content: openaiSettings.system_prompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: openaiSettings.temperature,
                stream: true,
            }, { signal });

            for await (const chunk of stream) {
                onUpdate(chunk.choices[0]?.delta?.content || '');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('OpenAI request was aborted.');
            } else {
                console.error('Error in OpenAI API request:', error);
                throw new Error('Failed to get response from OpenAI.');
            }
        }
    }
}