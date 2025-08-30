export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIProvider {
    getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void>;
    getStreamingResponseWithConversation(messages: AIMessage[], onUpdate: (text: string) => void, signal: AbortSignal): Promise<void>;
    validateApiKey(): Promise<{ valid: boolean; error?: string }>;
}

export interface AIProviderSettings {
    // Marker interface for provider-specific settings
    api_key: string;
}
