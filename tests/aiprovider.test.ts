import { vi, expect, describe, it, beforeEach } from "vitest";
import { AIProviderWrapper } from "../src/aiprovider";
import { VaultBotPluginSettings } from "../src/settings";
import { OpenAIProvider, OpenRouterProvider } from "../src/providers";
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from "../src/aiprovider";

// Mock the provider modules
vi.mock("../src/providers/openai", () => ({
    OpenAIProvider: vi.fn(),
}));

vi.mock("../src/providers/openrouter", () => ({
    OpenRouterProvider: vi.fn(),
}));

// Mock OpenAI module since it's imported by the providers
vi.mock("openai", () => ({
    default: vi.fn(),
}));

describe("AIProviderWrapper", () => {
    let mockOpenAIProvider: any;
    let mockOpenRouterProvider: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock instances
        mockOpenAIProvider = {
            getStreamingResponse: vi.fn(),
            validateApiKey: vi.fn(),
        };
        
        mockOpenRouterProvider = {
            getStreamingResponse: vi.fn(),
            validateApiKey: vi.fn(),
        };

        // Mock the constructors to return our mock instances
        (OpenAIProvider as any).mockImplementation(() => mockOpenAIProvider);
        (OpenRouterProvider as any).mockImplementation(() => mockOpenRouterProvider);
    });

    it("should create OpenAI provider when apiProvider is 'openai'", () => {
        const settings: VaultBotPluginSettings = {
            apiProvider: "openai",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openai: {
                    api_key: "test-key",
                    model: "gpt-4o",
                    system_prompt: "Test prompt",
                    temperature: 0.7,
                } as OpenAIProviderSettings,
            },
        };

        const wrapper = new AIProviderWrapper(settings);

        expect(OpenAIProvider).toHaveBeenCalledWith({
            api_key: "test-key",
            model: "gpt-4o",
            system_prompt: "Test prompt",
            temperature: 0.7,
        });

        expect(OpenRouterProvider).not.toHaveBeenCalled();
    });

    it("should create OpenRouter provider when apiProvider is 'openrouter'", () => {
        const settings: VaultBotPluginSettings = {
            apiProvider: "openrouter",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openrouter: {
                    api_key: "test-key",
                    model: "openai/gpt-4o",
                    system_prompt: "Test prompt",
                    temperature: 0.7,
                    site_url: "https://example.com",
                    site_name: "Test App",
                } as OpenRouterProviderSettings,
            },
        };

        const wrapper = new AIProviderWrapper(settings);

        expect(OpenRouterProvider).toHaveBeenCalledWith({
            api_key: "test-key",
            model: "openai/gpt-4o",
            system_prompt: "Test prompt",
            temperature: 0.7,
            site_url: "https://example.com",
            site_name: "Test App",
        });

        expect(OpenAIProvider).not.toHaveBeenCalled();
    });

    it("should throw error for unsupported provider", () => {
        const settings: VaultBotPluginSettings = {
            apiProvider: "unsupported",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {},
        };

        expect(() => new AIProviderWrapper(settings)).toThrow(
            "Unsupported AI provider: unsupported"
        );
    });

    it("should delegate getStreamingResponse to underlying provider", async () => {
        const settings: VaultBotPluginSettings = {
            apiProvider: "openai",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openai: {
                    api_key: "test-key",
                    model: "gpt-4o",
                    system_prompt: "Test prompt",
                    temperature: 0.7,
                } as OpenAIProviderSettings,
            },
        };

        const wrapper = new AIProviderWrapper(settings);
        const onUpdate = vi.fn();
        const abortController = new AbortController();

        await wrapper.getStreamingResponse(
            "Test prompt",
            onUpdate,
            abortController.signal
        );

        expect(mockOpenAIProvider.getStreamingResponse).toHaveBeenCalledWith(
            "Test prompt",
            onUpdate,
            abortController.signal
        );
    });

    it("should update provider when settings change", () => {
        const initialSettings: VaultBotPluginSettings = {
            apiProvider: "openai",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openai: {
                    api_key: "test-key",
                    model: "gpt-4o",
                    system_prompt: "Test prompt",
                    temperature: 0.7,
                } as OpenAIProviderSettings,
            },
        };

        const wrapper = new AIProviderWrapper(initialSettings);

        // Verify initial provider was created
        expect(OpenAIProvider).toHaveBeenCalledTimes(1);

        const newSettings: VaultBotPluginSettings = {
            apiProvider: "openrouter",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openrouter: {
                    api_key: "new-key",
                    model: "openai/gpt-4o",
                    system_prompt: "New prompt",
                    temperature: 0.5,
                    site_url: "https://example.com",
                    site_name: "Test App",
                } as OpenRouterProviderSettings,
            },
        };

        wrapper.updateProvider(newSettings);

        // Verify new provider was created
        expect(OpenRouterProvider).toHaveBeenCalledWith({
            api_key: "new-key",
            model: "openai/gpt-4o",
            system_prompt: "New prompt",
            temperature: 0.5,
            site_url: "https://example.com",
            site_name: "Test App",
        });
    });

    it("should handle provider switching correctly", async () => {
        const initialSettings: VaultBotPluginSettings = {
            apiProvider: "openai",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openai: {
                    api_key: "test-key",
                    model: "gpt-4o",
                    system_prompt: "Test prompt",
                    temperature: 0.7,
                } as OpenAIProviderSettings,
            },
        };

        const wrapper = new AIProviderWrapper(initialSettings);

        // Test initial provider
        const onUpdate1 = vi.fn();
        const abortController1 = new AbortController();
        await wrapper.getStreamingResponse("Test 1", onUpdate1, abortController1.signal);
        expect(mockOpenAIProvider.getStreamingResponse).toHaveBeenCalledWith(
            "Test 1",
            onUpdate1,
            abortController1.signal
        );

        // Switch to OpenRouter
        const newSettings: VaultBotPluginSettings = {
            apiProvider: "openrouter",
            chatSeparator: "---",
            recordApiCalls: true,
            aiProviderSettings: {
                openrouter: {
                    api_key: "test-key",
                    model: "openai/gpt-4o",
                    system_prompt: "Test prompt",
                    temperature: 0.7,
                } as OpenRouterProviderSettings,
            },
        };

        wrapper.updateProvider(newSettings);

        // Test new provider
        const onUpdate2 = vi.fn();
        const abortController2 = new AbortController();
        await wrapper.getStreamingResponse("Test 2", onUpdate2, abortController2.signal);
        expect(mockOpenRouterProvider.getStreamingResponse).toHaveBeenCalledWith(
            "Test 2",
            onUpdate2,
            abortController2.signal
        );
    });

    describe("API Key Validation", () => {
        it("should delegate validateApiKey to OpenAI provider", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "Test prompt",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            mockOpenAIProvider.validateApiKey.mockResolvedValue({ valid: true });

            const wrapper = new AIProviderWrapper(settings);
            const result = await wrapper.validateApiKey();

            expect(mockOpenAIProvider.validateApiKey).toHaveBeenCalledOnce();
            expect(result.valid).toBe(true);
        });

        it("should delegate validateApiKey to OpenRouter provider", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openrouter",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openrouter: {
                        api_key: "test-key",
                        model: "openai/gpt-4o",
                        system_prompt: "Test prompt",
                        temperature: 0.7,
                        site_url: "https://example.com",
                        site_name: "Test App",
                    } as OpenRouterProviderSettings,
                },
            };

            mockOpenRouterProvider.validateApiKey.mockResolvedValue({ 
                valid: false, 
                error: "Invalid API key" 
            });

            const wrapper = new AIProviderWrapper(settings);
            const result = await wrapper.validateApiKey();

            expect(mockOpenRouterProvider.validateApiKey).toHaveBeenCalledOnce();
            expect(result.valid).toBe(false);
            expect(result.error).toBe("Invalid API key");
        });

        it("should handle validation after provider switch", async () => {
            const initialSettings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "Test prompt",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            mockOpenAIProvider.validateApiKey.mockResolvedValue({ valid: true });

            const wrapper = new AIProviderWrapper(initialSettings);
            
            // Test initial provider validation
            let result = await wrapper.validateApiKey();
            expect(mockOpenAIProvider.validateApiKey).toHaveBeenCalledOnce();
            expect(result.valid).toBe(true);

            // Switch to OpenRouter
            const newSettings: VaultBotPluginSettings = {
                apiProvider: "openrouter",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openrouter: {
                        api_key: "test-key",
                        model: "openai/gpt-4o",
                        system_prompt: "Test prompt",
                        temperature: 0.7,
                    } as OpenRouterProviderSettings,
                },
            };

            mockOpenRouterProvider.validateApiKey.mockResolvedValue({ 
                valid: false, 
                error: "Invalid API key" 
            });

            wrapper.updateProvider(newSettings);

            // Test new provider validation
            result = await wrapper.validateApiKey();
            expect(mockOpenRouterProvider.validateApiKey).toHaveBeenCalledOnce();
            expect(result.valid).toBe(false);
            expect(result.error).toBe("Invalid API key");
        });
    });
});