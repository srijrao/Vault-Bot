import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { AIProvider, AIProviderSettings, AIMessage, ModelInfo } from './base';
import { debugConsole } from '../utils/debug';

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

    // Attempt to upload a data URI image to OpenRouter's upload endpoint if available.
    async uploadImageFromDataURI?(dataUri: string, filename?: string): Promise<{ url?: string; id?: string } | null> {
        try {
            // Extract base64 payload and mime
            const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (!match) return null;
            const mime = match[1];
            const base64 = match[2];

            // OpenRouter doesn't have a stable public image upload API documented here.
            // Try a generic upload endpoint on openrouter.ai if available.
            const form = new FormData();
            const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: mime });
            form.append('file', blob, filename || `upload.${mime.split('/')[1]}`);

            const resp = await fetch('https://openrouter.ai/api/v1/uploads', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.api_key}`,
                    ...(this.settings.site_url ? { 'HTTP-Referer': this.settings.site_url } : {}),
                    ...(this.settings.site_name ? { 'X-Title': this.settings.site_name } : {})
                },
                body: form as any
            });

            if (!resp.ok) return null;
            const data = await resp.json();
            // Expecting { url, id } or similar
            return { url: data?.url || data?.file || null, id: data?.id || null };
        } catch (error) {
            debugConsole.warn('OpenRouter image upload failed:', error);
            return null;
        }
    }

    async uploadImageFromUrl?(url: string, filename?: string): Promise<{ url?: string; id?: string } | null> {
        try {
            // Attempt server-side fetch + upload via OpenRouter uploads endpoint
            const resp = await fetch('https://openrouter.ai/api/v1/uploads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.api_key}`,
                    ...(this.settings.site_url ? { 'HTTP-Referer': this.settings.site_url } : {}),
                    ...(this.settings.site_name ? { 'X-Title': this.settings.site_name } : {})
                },
                body: JSON.stringify({ url })
            });

            if (!resp.ok) return null;
            const data = await resp.json();
            return { url: data?.url || data?.file || null, id: data?.id || null };
        } catch (error) {
            debugConsole.warn('OpenRouter image upload from URL failed:', error);
            return null;
        }
    }

    async analyzeImage?(imageUrlOrId: string): Promise<{ text?: string; labels?: string[] } | null> {
        try {
            // OpenRouter doesn't specify a vision analyze endpoint; attempt to call a generic endpoint
            const resp = await fetch('https://openrouter.ai/api/v1/vision/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.api_key}`,
                    ...(this.settings.site_url ? { 'HTTP-Referer': this.settings.site_url } : {}),
                    ...(this.settings.site_name ? { 'X-Title': this.settings.site_name } : {})
                },
                body: JSON.stringify({ image: imageUrlOrId })
            });

            if (!resp.ok) return null;
            const data = await resp.json();
            return { text: data?.text || null, labels: data?.labels || null };
        } catch (error) {
            debugConsole.warn('OpenRouter image analyze failed:', error);
            return null;
        }
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

            // First attempt with user's configured temperature
            try {
                const { textStream } = await streamText({
                    model,
                    messages: formattedMessages,
                    temperature: this.settings.temperature,
                    abortSignal: signal
                });

                // Handle streaming with error recovery
                let hasReceivedData = false;
                
                for await (const textPart of textStream) {
                    hasReceivedData = true;
                    
                    // Ensure textPart is a string and not empty
                    if (typeof textPart === 'string' && textPart.length > 0) {
                        onUpdate(textPart);
                    }
                }
                
                // If no data was received, this might indicate a streaming issue
                if (!hasReceivedData) {
                    debugConsole.warn('OpenRouter streaming completed but no data was received. This may indicate a model-specific issue.');
                }
                
                return;
            } catch (error: any) {
                // Check if it's a temperature-related error
                const errorMessage = error.message || error.toString();
                const isTemperatureError = errorMessage.includes('temperature') && 
                                         errorMessage.includes('does not support') && 
                                         this.settings.temperature !== 1.0;
                
                if (isTemperatureError) {
                    debugConsole.warn(`Model ${this.settings.model} rejected temperature=${this.settings.temperature}, retrying with temperature=1`);
                    
                    // Retry with temperature = 1
                    const { textStream } = await streamText({
                        model,
                        messages: formattedMessages,
                        temperature: 1.0,
                        abortSignal: signal
                    });

                    for await (const textPart of textStream) {
                        if (typeof textPart === 'string' && textPart.length > 0) {
                            onUpdate(textPart);
                        }
                    }
                    return;
                }
                
                // If it's not a temperature error, re-throw
                throw error;
            }

        } catch (error: any) {
            // Check if it's an abort error
            if (error.name === 'AbortError') {
                debugConsole.log('OpenRouter request was aborted.');
                return; // Gracefully handle abort
            }
            
            // Check for specific OpenRouter streaming errors
            if (error.message?.includes('stream') || error.message?.includes('chunk')) {
                console.error('OpenRouter streaming error detected:', error.message);
                throw new Error(`OpenRouter streaming failed: ${error.message}`);
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
