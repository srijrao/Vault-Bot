import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelService } from '../src/services/model_service';
import { ModelInfo } from '../src/providers';
import { VaultBotPluginSettings } from '../src/settings';
import { OpenAIProviderSettings } from '../src/providers';

// Mock the AIProviderWrapper
const mockListModels = vi.fn();

vi.mock('../src/aiprovider', () => ({
    AIProviderWrapper: vi.fn().mockImplementation(() => ({
        listModels: mockListModels
    }))
}));

describe('ModelService', () => {
    let modelService: ModelService;
    let mockSettings: VaultBotPluginSettings;

    beforeEach(() => {
        // Clear singleton instance
        (ModelService as any).instance = undefined;
        modelService = ModelService.getInstance();
        
        // Clear all mocks
        vi.clearAllMocks();
        
        mockSettings = {
            apiProvider: 'openai',
            chatSeparator: '\n\n----\n\n',
            recordApiCalls: true,
            aiProviderSettings: {
                openai: {
                    api_key: 'test-key',
                    model: 'gpt-4o',
                    system_prompt: 'You are a helpful assistant.',
                    temperature: 1.0,
                } as OpenAIProviderSettings
            }
        };
    });

    it('should return singleton instance', () => {
        const instance1 = ModelService.getInstance();
        const instance2 = ModelService.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should fetch models from provider on first call', async () => {
        const mockModels: ModelInfo[] = [
            { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4 Omni' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'OpenAI GPT-3.5 Turbo' }
        ];

        mockListModels.mockResolvedValue(mockModels);

        const result = await modelService.getModels(mockSettings);
        
        expect(result).toEqual(mockModels);
        expect(mockListModels).toHaveBeenCalledTimes(1);
    });

    it('should return cached models on subsequent calls', async () => {
        const mockModels: ModelInfo[] = [
            { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4 Omni' }
        ];

        mockListModels.mockResolvedValue(mockModels);

        // First call
        await modelService.getModels(mockSettings);
        
        // Second call should use cache
        const result = await modelService.getModels(mockSettings);
        
        expect(result).toEqual(mockModels);
        expect(mockListModels).toHaveBeenCalledTimes(1); // Still only once
    });

    it('should force refresh when requested', async () => {
        const mockModels: ModelInfo[] = [
            { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4 Omni' }
        ];

        mockListModels.mockResolvedValue(mockModels);

        // First call
        await modelService.getModels(mockSettings);
        
        // Force refresh
        await modelService.getModels(mockSettings, true);
        
        expect(mockListModels).toHaveBeenCalledTimes(2);
    });

    it('should handle fetch errors gracefully', async () => {
        mockListModels.mockRejectedValue(new Error('API Error'));

        const result = await modelService.getModels(mockSettings);
        
        expect(result).toEqual([]);
    });

    it('should clear cache', () => {
        modelService.clearCache();
        
        const cacheInfo = modelService.getCacheInfo();
        expect(cacheInfo.size).toBe(0);
        expect(cacheInfo.keys).toEqual([]);
    });
});
