export interface AIProvider {
    getStreamingResponse(prompt: string, onUpdate: (text: string) => void, signal: AbortSignal): Promise<void>;
}

export interface AIProviderSettings {
    // Marker interface for provider-specific settings
    api_key: string;
}
