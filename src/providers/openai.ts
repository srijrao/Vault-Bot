import { AIProvider, AIProviderSettings, AIMessage, ModelInfo } from "./base";
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
        // Convert single prompt to message array and delegate to conversation method
        const messages: AIMessage[] = [
            {
                role: 'user',
                content: prompt
            }
        ];
        return this.getStreamingResponseWithConversation(messages, onUpdate, signal);
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

    async listModels(): Promise<ModelInfo[]> {
        try {
            const response = await this.openai.models.list();
            return response.data
                .filter(model => model.id.includes('gpt') || model.id.includes('o1'))
                .map(model => ({
                    id: model.id,
                    name: model.id,
                    description: `OpenAI ${model.id}`,
                    context_length: this.getContextLength(model.id)
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (error: any) {
            console.error('Failed to fetch OpenAI models:', error);
            // Return a fallback list of common models
            return [
                { id: 'gpt-4o', name: 'gpt-4o', description: 'GPT-4 Omni', context_length: 128000 },
                { id: 'gpt-4o-mini', name: 'gpt-4o-mini', description: 'GPT-4 Omni Mini', context_length: 128000 },
                { id: 'gpt-4-turbo', name: 'gpt-4-turbo', description: 'GPT-4 Turbo', context_length: 128000 },
                { id: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo', description: 'GPT-3.5 Turbo', context_length: 16385 },
                { id: 'o1-preview', name: 'o1-preview', description: 'OpenAI o1 Preview', context_length: 128000 },
                { id: 'o1-mini', name: 'o1-mini', description: 'OpenAI o1 Mini', context_length: 128000 }
            ];
        }
    }

    private getContextLength(modelId: string): number {
        const contextLengths: Record<string, number> = {
            'gpt-4o': 128000,
            'gpt-4o-mini': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4': 8192,
            'gpt-3.5-turbo': 16385,
            'o1-preview': 128000,
            'o1-mini': 128000
        };
        return contextLengths[modelId] || 4096;
    }
}
