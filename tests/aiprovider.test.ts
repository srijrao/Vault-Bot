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
            getStreamingResponseWithConversation: vi.fn(),
            validateApiKey: vi.fn(),
        };
        
        mockOpenRouterProvider = {
            getStreamingResponse: vi.fn(),
            getStreamingResponseWithConversation: vi.fn(),
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
                    system_prompt: "Test system prompt",
                    temperature: 0.7,
                } as OpenAIProviderSettings,
            },
        };

        const wrapper = new AIProviderWrapper(settings);
        const onUpdate = vi.fn();
        const abortController = new AbortController();

        await wrapper.getStreamingResponse(
            "Test user prompt",
            onUpdate,
            abortController.signal
        );

        expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
            [
                {
                    role: "system",
                    content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nTest system prompt$/)
                },
                {
                    role: "user",
                    content: "Test user prompt"
                }
            ],
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
        expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
            [
                {
                    role: "system",
                    content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nTest prompt$/)
                },
                {
                    role: "user",
                    content: "Test 1"
                }
            ],
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
        expect(mockOpenRouterProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
            [
                {
                    role: "system",
                    content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nTest prompt$/)
                },
                {
                    role: "user",
                    content: "Test 2"
                }
            ],
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

    describe("System Prompt Functionality", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("should prepend system prompt when available", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
                [
                    { role: "system", content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nYou are a helpful assistant$/) },
                    { role: "user", content: "Hello" }
                ],
                onUpdate,
                abortController.signal
            );
        });

        it("should not prepend system prompt if already present", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [
                    { role: "system", content: "Custom system prompt" },
                    { role: "user", content: "Hello" }
                ],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
                [
                    { role: "system", content: "Custom system prompt" },
                    { role: "user", content: "Hello" }
                ],
                onUpdate,
                abortController.signal
            );
        });

        it("should handle empty system prompt gracefully", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
                [
                    { role: "system", content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)$/) },
                    { role: "user", content: "Hello" }
                ],
                onUpdate,
                abortController.signal
            );
        });

        it("should handle whitespace-only system prompt gracefully", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "   ",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
                [
                    { role: "system", content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)$/) },
                    { role: "user", content: "Hello" }
                ],
                onUpdate,
                abortController.signal
            );
        });

        it("should work with OpenRouter provider", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openrouter",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openrouter: {
                        api_key: "test-key",
                        model: "openai/gpt-4o",
                        system_prompt: "OpenRouter system prompt",
                        temperature: 0.7,
                    } as OpenRouterProviderSettings,
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

            expect(mockOpenRouterProvider.getStreamingResponseWithConversation).toHaveBeenCalledWith(
                [
                    { role: "system", content: expect.stringMatching(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nOpenRouter system prompt$/) },
                    { role: "user", content: "Test prompt" }
                ],
                onUpdate,
                abortController.signal
            );
        });
    });

    describe("DateTime in System Prompts", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("should include current datetime in system prompt when system_prompt is configured", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have system message with datetime
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0].role).toBe("system");
            expect(calledArgs[0].content).toMatch(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nYou are a helpful assistant$/);
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });

        it("should include only datetime when no system_prompt is configured", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have system message with only datetime
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0].role).toBe("system");
            expect(calledArgs[0].content).toMatch(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)$/);
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });

        it("should include datetime even with empty system_prompt", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have system message with only datetime (empty system_prompt treated as null)
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0].role).toBe("system");
            expect(calledArgs[0].content).toMatch(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)$/);
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });

        it("should not override existing system message in conversation", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [
                    { role: "system", content: "Custom system prompt" },
                    { role: "user", content: "Hello" }
                ],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should preserve the existing system message
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0]).toEqual({ role: "system", content: "Custom system prompt" });
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });

        it("should work with OpenRouter provider as well", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openrouter",
                chatSeparator: "---",
                recordApiCalls: true,
                aiProviderSettings: {
                    openrouter: {
                        api_key: "test-key",
                        model: "openai/gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenRouterProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenRouterProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenRouterProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have system message with datetime
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0].role).toBe("system");
            expect(calledArgs[0].content).toMatch(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nYou are a helpful assistant$/);
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });

        it("should not include datetime when toggle is disabled", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                includeDatetime: false,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have system message without datetime
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0].role).toBe("system");
            expect(calledArgs[0].content).toBe("You are a helpful assistant");
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });

        it("should return no system message when datetime is disabled and no system prompt", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                includeDatetime: false,
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have no system message
            expect(calledArgs).toHaveLength(1);
            expect(calledArgs[0]).toEqual({ role: "user", content: "Hello" });
        });

        it("should default to including datetime when setting is undefined", async () => {
            const settings: VaultBotPluginSettings = {
                apiProvider: "openai",
                chatSeparator: "---",
                recordApiCalls: true,
                includeDatetime: true, // Explicitly set to true for this test
                // includeDatetime is undefined, should default to true
                aiProviderSettings: {
                    openai: {
                        api_key: "test-key",
                        model: "gpt-4o",
                        system_prompt: "You are a helpful assistant",
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                },
            };

            const wrapper = new AIProviderWrapper(settings);
            const onUpdate = vi.fn();
            const abortController = new AbortController();

            await wrapper.getStreamingResponseWithConversation(
                [{ role: "user", content: "Hello" }],
                onUpdate,
                abortController.signal
            );

            expect(mockOpenAIProvider.getStreamingResponseWithConversation).toHaveBeenCalledTimes(1);
            const calledArgs = mockOpenAIProvider.getStreamingResponseWithConversation.mock.calls[0][0];
            
            // Should have system message with datetime
            expect(calledArgs).toHaveLength(2);
            expect(calledArgs[0].role).toBe("system");
            expect(calledArgs[0].content).toMatch(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nYou are a helpful assistant$/);
            expect(calledArgs[1]).toEqual({ role: "user", content: "Hello" });
        });
    });
});