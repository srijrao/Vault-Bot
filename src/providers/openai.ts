import { AIProvider, AIProviderSettings } from "./base";
import OpenAI from "openai";

export interface OpenAIProviderSettings extends AIProviderSettings {
    api_key: string;
    model: string;
    system_prompt: string;
    temperature: number;
}

export class OpenAIProvider implements AIProvider {
    private openai: OpenAI;
    private settings: OpenAIProviderSettings;

    constructor(settings: OpenAIProviderSettings) {
        this.settings = settings;
        this.openai = new OpenAI({
            apiKey: this.settings.api_key,
            dangerouslyAllowBrowser: true
        });
    }

    async getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void> {
        try {
            const stream = await this.openai.chat.completions.create({
                model: this.settings.model,
                messages: [
                    {
                        role: 'system',
                        content: this.settings.system_prompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: this.settings.temperature,
                stream: true,
            }, { signal });

            for await (const chunk of stream) {
                onUpdate(chunk.choices[0]?.delta?.content || '');
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('OpenAI request was aborted.');
            } else {
                console.error('Error in OpenAI API request:', error);
                throw new Error('Failed to get response from OpenAI.');
            }
        }
    }
}
