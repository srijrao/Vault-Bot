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
    // Optional image upload/vision methods. Providers may implement these to support
    // uploading data-URIs or remote images and performing basic vision/analysis.
    uploadImageFromDataURI?: (dataUri: string, filename?: string) => Promise<{ url?: string; id?: string } | null>;
    uploadImageFromUrl?: (url: string, filename?: string) => Promise<{ url?: string; id?: string } | null>;
    analyzeImage?: (imageUrlOrId: string) => Promise<{ text?: string; labels?: string[] } | null>;
}

export interface AIProviderSettings {
    // Marker interface for provider-specific settings
    api_key: string;
}
