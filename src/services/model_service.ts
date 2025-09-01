import { AIProviderWrapper } from '../aiprovider';
import { ModelInfo } from '../providers';
import { VaultBotPluginSettings } from '../settings';

interface CachedModelData {
    models: ModelInfo[];
    timestamp: number;
    provider: string;
}

export class ModelService {
    private static instance: ModelService;
    private cache = new Map<string, CachedModelData>();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    static getInstance(): ModelService {
        if (!ModelService.instance) {
            ModelService.instance = new ModelService();
        }
        return ModelService.instance;
    }

    private constructor() {}

    async getModels(settings: VaultBotPluginSettings, forceRefresh = false): Promise<ModelInfo[]> {
        const cacheKey = `${settings.apiProvider}_${this.getProviderSettingsHash(settings)}`;
        
        if (!forceRefresh && this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey)!.models;
        }

        try {
            const wrapper = new AIProviderWrapper(settings);
            const models = await this.fetchModelsFromProvider(wrapper);
            
            this.cache.set(cacheKey, {
                models,
                timestamp: Date.now(),
                provider: settings.apiProvider
            });

            return models;
        } catch (error) {
            console.error('Failed to fetch models:', error);
            
            // Return cached data if available, even if expired
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached.models;
            }
            
            // Return empty array if no cache and fetching failed
            return [];
        }
    }

    private async fetchModelsFromProvider(wrapper: AIProviderWrapper): Promise<ModelInfo[]> {
        return await wrapper.listModels();
    }

    private isCacheValid(cacheKey: string): boolean {
        const cached = this.cache.get(cacheKey);
        if (!cached) return false;
        
        return Date.now() - cached.timestamp < this.CACHE_DURATION;
    }

    private getProviderSettingsHash(settings: VaultBotPluginSettings): string {
        // Create a simple hash of provider settings to detect changes
        const providerSettings = settings.aiProviderSettings[settings.apiProvider];
        return btoa(JSON.stringify({
            api_key: providerSettings?.api_key?.substring(0, 8) || '', // Only use first 8 chars for privacy
            provider: settings.apiProvider
        }));
    }

    clearCache(): void {
        this.cache.clear();
    }

    getCacheInfo(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}
