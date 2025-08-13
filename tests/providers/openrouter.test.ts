import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import type { OpenRouterProviderSettings } from '../../src/providers/openrouter';

// Mock the AI SDK dependencies
vi.mock('@openrouter/ai-sdk-provider', () => ({
    createOpenRouter: vi.fn()
}));

vi.mock('ai', () => ({
    streamText: vi.fn()
}));

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';

describe('OpenRouterProvider', () => {
    let provider: OpenRouterProvider;
    let settings: OpenRouterProviderSettings;
    let onUpdate: ReturnType<typeof vi.fn>;
    let abortController: AbortController;
    let mockProvider: any;
    let mockModel: any;

    beforeEach(() => {
        settings = {
            api_key: 'test-api-key',
            model: 'openai/gpt-4o',
            system_prompt: 'You are a helpful assistant.',
            temperature: 0.7,
            site_url: 'https://example.com',
            site_name: 'Test App'
        };

        onUpdate = vi.fn();
        abortController = new AbortController();

        // Setup mocks
        mockModel = { id: 'openai/gpt-4o' };
        mockProvider = vi.fn().mockReturnValue(mockModel);

        vi.mocked(createOpenRouter).mockReturnValue(mockProvider as any);

        provider = new OpenRouterProvider(settings);
    });

    function createMockAsyncIterable(chunks: string[]) {
        return {
            async *[Symbol.asyncIterator]() {
                for (const chunk of chunks) {
                    yield chunk;
                }
            }
        };
    }

    it('should create a provider with correct API key and settings', () => {
        expect(provider).toBeDefined();
        // createOpenRouter is called in getStreamingResponse, not constructor
    });

    it('should handle streaming response correctly', async () => {
        // Mock streamText to return a proper async iterable stream
        const mockTextStream = createMockAsyncIterable(['Hello', ' world', '!']);
        vi.mocked(streamText).mockResolvedValue({ 
            textStream: mockTextStream
        } as any);

        await provider.getStreamingResponse(
            'Test prompt',
            onUpdate,
            abortController.signal
        );

        expect(createOpenRouter).toHaveBeenCalledWith({
            apiKey: 'test-api-key',
            extraBody: {
                site_url: 'https://example.com',
                site_name: 'Test App'
            }
        });

        expect(mockProvider).toHaveBeenCalledWith('openai/gpt-4o');

        expect(streamText).toHaveBeenCalledWith({
            model: mockModel,
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Test prompt' }
            ],
            temperature: 0.7,
            abortSignal: abortController.signal
        });

        expect(onUpdate).toHaveBeenCalledTimes(3);
        expect(onUpdate).toHaveBeenCalledWith('Hello');
        expect(onUpdate).toHaveBeenCalledWith(' world');
        expect(onUpdate).toHaveBeenCalledWith('!');
    });

    it('should handle optional headers correctly when not provided', async () => {
        const settingsWithoutOptionals: OpenRouterProviderSettings = {
            api_key: 'test-api-key',
            model: 'openai/gpt-4o',
            system_prompt: 'You are a helpful assistant.',
            temperature: 0.7
        };

        const providerWithoutOptionals = new OpenRouterProvider(settingsWithoutOptionals);

        const mockTextStream = createMockAsyncIterable(['test']);
        vi.mocked(streamText).mockResolvedValue({ 
            textStream: mockTextStream
        } as any);

        await providerWithoutOptionals.getStreamingResponse(
            'Test prompt',
            onUpdate,
            abortController.signal
        );

        expect(createOpenRouter).toHaveBeenCalledWith({
            apiKey: 'test-api-key',
            extraBody: {}
        });
    });

    it('should handle abort errors gracefully', async () => {
        const error = new Error('Request aborted');
        error.name = 'AbortError';

        const mockErrorStream = createMockErrorAsyncIterable(error);
        vi.mocked(streamText).mockResolvedValue({ 
            textStream: mockErrorStream
        } as any);

        // Should not throw for abort errors
        await expect(
            provider.getStreamingResponse(
                'Test prompt',
                onUpdate,
                abortController.signal
            )
        ).resolves.toBeUndefined();

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('should handle other errors and throw', async () => {
        const error = new Error('Network error');

        const mockErrorStream = createMockErrorAsyncIterable(error);
        vi.mocked(streamText).mockResolvedValue({ 
            textStream: mockErrorStream
        } as any);

        await expect(
            provider.getStreamingResponse(
                'Test prompt',
                onUpdate,
                abortController.signal
            )
        ).rejects.toThrow('Failed to get response from OpenRouter.');

        expect(onUpdate).not.toHaveBeenCalled();
    });

    function createMockErrorAsyncIterable(error: Error) {
        return {
            async *[Symbol.asyncIterator]() {
                throw error;
            }
        };
    }
});
