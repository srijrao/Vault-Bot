import { vi, expect, describe, it, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai";
import { OpenRouterProvider } from "../../src/providers/openrouter";
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from "../../src/aiprovider";

// Mock OpenAI
const mockOpenAI = {
    models: {
        list: vi.fn(),
    },
};

vi.mock("openai", () => ({
    default: vi.fn(() => mockOpenAI),
}));

// Mock fetch for OpenRouter
global.fetch = vi.fn();

describe("API Key Validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("OpenAI Provider", () => {
        const validSettings: OpenAIProviderSettings = {
            api_key: "sk-test123",
            model: "gpt-4o",
            system_prompt: "Test prompt",
            temperature: 0.7,
        };

        it("should return valid when API key is correct", async () => {
            mockOpenAI.models.list.mockResolvedValue({ data: [] });

            const provider = new OpenAIProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockOpenAI.models.list).toHaveBeenCalledOnce();
        });

        it("should return invalid for 401 unauthorized error", async () => {
            const error = new Error("Unauthorized");
            (error as any).status = 401;
            mockOpenAI.models.list.mockRejectedValue(error);

            const provider = new OpenAIProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Invalid API key");
        });

        it("should return invalid for 429 rate limit error", async () => {
            const error = new Error("Rate limit exceeded");
            (error as any).status = 429;
            mockOpenAI.models.list.mockRejectedValue(error);

            const provider = new OpenAIProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Rate limit exceeded");
        });

        it("should return invalid for 500 server error", async () => {
            const error = new Error("Internal server error");
            (error as any).status = 500;
            mockOpenAI.models.list.mockRejectedValue(error);

            const provider = new OpenAIProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("OpenAI service temporarily unavailable");
        });

        it("should handle unknown errors", async () => {
            const error = new Error("Unknown error");
            (error as any).status = 400;
            mockOpenAI.models.list.mockRejectedValue(error);

            const provider = new OpenAIProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Unknown error");
        });

        it("should handle errors without message", async () => {
            const error = new Error("");
            (error as any).status = 400;
            mockOpenAI.models.list.mockRejectedValue(error);

            const provider = new OpenAIProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Unknown error occurred");
        });
    });

    describe("OpenRouter Provider", () => {
        const validSettings: OpenRouterProviderSettings = {
            api_key: "sk-or-test123",
            model: "openai/gpt-4o",
            system_prompt: "Test prompt",
            temperature: 0.7,
            site_url: "https://example.com",
            site_name: "Test App",
        };

        it("should return valid when API key is correct", async () => {
            (global.fetch as any).mockResolvedValue({
                ok: true,
                status: 200,
            });

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            expect(global.fetch).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/models',
                {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer sk-or-test123',
                        'HTTP-Referer': 'https://example.com',
                        'X-Title': 'Test App'
                    }
                }
            );
        });

        it("should use default headers when site info not provided", async () => {
            const settingsWithoutSite: OpenRouterProviderSettings = {
                ...validSettings,
                site_url: undefined,
                site_name: undefined,
            };

            (global.fetch as any).mockResolvedValue({
                ok: true,
                status: 200,
            });

            const provider = new OpenRouterProvider(settingsWithoutSite);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/models',
                {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer sk-or-test123',
                        'HTTP-Referer': 'https://obsidian.md',
                        'X-Title': 'Obsidian Vault-Bot'
                    }
                }
            );
        });

        it("should return invalid for 401 unauthorized error", async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 401,
            });

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Invalid API key");
        });

        it("should return invalid for 429 rate limit error", async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 429,
            });

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Rate limit exceeded");
        });

        it("should return invalid for 500 server error", async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 500,
            });

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("OpenRouter service temporarily unavailable");
        });

        it("should handle other HTTP errors with response text", async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue("Bad request error"),
            });

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Bad request error");
        });

        it("should handle network errors", async () => {
            (global.fetch as any).mockRejectedValue(new Error("Network error"));

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Network error");
        });

        it("should handle errors without message", async () => {
            (global.fetch as any).mockRejectedValue(new Error(""));

            const provider = new OpenRouterProvider(validSettings);
            const result = await provider.validateApiKey();

            expect(result.valid).toBe(false);
            expect(result.error).toBe("Network error occurred");
        });
    });
});
