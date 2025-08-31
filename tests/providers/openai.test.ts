import OpenAI from "openai";
import { vi, expect, describe, it, beforeEach } from "vitest";
import { OpenAIProvider, OpenAIProviderSettings } from "../../src/providers/openai";

// Mock the entire 'openai' module
const mockCreate = vi.fn();
vi.mock("openai", () => {
    const MockOpenAI = vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: mockCreate,
            },
        },
    }));
    return {
        default: MockOpenAI,
    };
});

// Helper to create a mock async stream
async function* createMockStream(chunks: string[]) {
    for (const chunk of chunks) {
        // A short delay to allow for abortion to be tested
        await new Promise(resolve => setTimeout(resolve, 10));
        yield {
            choices: [{ delta: { content: chunk } }],
        };
    }
}

// A simple error class to mock OpenAI's AbortError
class MockAbortError extends Error {
    constructor() {
        super("The request was aborted.");
        this.name = "AbortError";
    }
}

describe("OpenAIProvider", () => {
    let provider: OpenAIProvider;
    let mockSettings: OpenAIProviderSettings;

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        mockSettings = {
            api_key: "test-api-key",
            model: "gpt-4o",
            system_prompt: "You are a helpful assistant.",
            temperature: 1.0,
        };

        provider = new OpenAIProvider(mockSettings);
    });

    it("should create a provider with correct API key and settings", () => {
        expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("should handle streaming response correctly", async () => {
        const mockStreamData = ["Hello", " world", "!"];
        const mockStream = createMockStream(mockStreamData);
        mockCreate.mockResolvedValue(mockStream);

        const onUpdate = vi.fn();
        const abortController = new AbortController();

        await provider.getStreamingResponse(
            "Test prompt",
            onUpdate,
            abortController.signal
        );

        expect(mockCreate).toHaveBeenCalledWith(
            {
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: "Test prompt",
                    },
                ],
                temperature: 1.0,
                stream: true,
            },
            { signal: abortController.signal }
        );

        expect(onUpdate).toHaveBeenCalledTimes(3);
        expect(onUpdate).toHaveBeenNthCalledWith(1, "Hello");
        expect(onUpdate).toHaveBeenNthCalledWith(2, " world");
        expect(onUpdate).toHaveBeenNthCalledWith(3, "!");
    });

    it("should handle abort errors gracefully", async () => {
        mockCreate.mockRejectedValue(new MockAbortError());

        const onUpdate = vi.fn();
        const abortController = new AbortController();

        // Should not throw
        await provider.getStreamingResponse(
            "Test prompt",
            onUpdate,
            abortController.signal
        );

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it("should handle other errors and throw", async () => {
        const mockError = new Error("API Error");
        mockCreate.mockRejectedValue(mockError);

        const onUpdate = vi.fn();
        const abortController = new AbortController();

        await expect(
            provider.getStreamingResponse(
                "Test prompt",
                onUpdate,
                abortController.signal
            )
        ).rejects.toThrow("Failed to get response from OpenAI.");

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it("should handle empty content chunks", async () => {
        const mockStream = async function* () {
            yield { choices: [{ delta: { content: "Hello" } }] };
            yield { choices: [{ delta: { content: "" } }] };
            yield { choices: [{ delta: { content: " world" } }] };
            yield { choices: [{ delta: {} }] };
        };
        mockCreate.mockResolvedValue(mockStream());

        const onUpdate = vi.fn();
        const abortController = new AbortController();

        await provider.getStreamingResponse(
            "Test prompt",
            onUpdate,
            abortController.signal
        );

        expect(onUpdate).toHaveBeenCalledTimes(4);
        expect(onUpdate).toHaveBeenNthCalledWith(1, "Hello");
        expect(onUpdate).toHaveBeenNthCalledWith(2, "");
        expect(onUpdate).toHaveBeenNthCalledWith(3, " world");
        expect(onUpdate).toHaveBeenNthCalledWith(4, "");
    });
});
