import { AIProvider, AIProviderSettings, AIMessage } from "./base";
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

    async getStreamingResponseWithConversation(messages: AIMessage[], onUpdate: (text: string) => void, signal: AbortSignal): Promise<void> {
        try {
            // Convert our AIMessage format to OpenAI's format
            const openaiMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const stream = await this.openai.chat.completions.create({
                model: this.settings.model,
                messages: openaiMessages,
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

    async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
        try {
            // Make a simple API call to validate the key
            await this.openai.models.list();
            return { valid: true };
        } catch (error: any) {
            console.error('OpenAI API key validation failed:', error);
            
            // Check for specific error types
            if (error.status === 401) {
                return { valid: false, error: 'Invalid API key' };
            } else if (error.status === 429) {
                return { valid: false, error: 'Rate limit exceeded' };
            } else if (error.status >= 500) {
                return { valid: false, error: 'OpenAI service temporarily unavailable' };
            } else {
                return { valid: false, error: error.message || 'Unknown error occurred' };
            }
        }
    }
}
