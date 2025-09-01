export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ModelInfo {
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    pricing?: {
        prompt?: string;
        completion?: string;
    };
}

export interface AIProvider {
    getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void>;
    getStreamingResponseWithConversation(messages: AIMessage[], onUpdate: (text: string) => void, signal: AbortSignal): Promise<void>;
    validateApiKey(): Promise<{ valid: boolean; error?: string }>;
    listModels(): Promise<ModelInfo[]>;
}

export interface AIProviderSettings {
    // Marker interface for provider-specific settings
    api_key: string;
}
