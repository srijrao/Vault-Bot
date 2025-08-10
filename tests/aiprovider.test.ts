import OpenAI from "openai";
import { vi, expect, describe, it, beforeEach } from "vitest";
import { OpenAIProvider, OpenAIProviderSettings } from "../src/aiprovider";
import { VaultBotPluginSettings } from "../src/settings";

// Mock the entire 'openai' module
vi.mock("openai", () => {
    const mockCreate = vi.fn();
    const MockOpenAI = vi.fn().mockImplementation(() => {
        return {
            chat: {
                completions: {
                    create: mockCreate,
                },
            },
        };
    });
    return {
        default: MockOpenAI,
        __mockCreate: mockCreate,
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
    let mockSettings: VaultBotPluginSettings;
    let mockCreate: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        // Reset mocks before each test
        vi.clearAllMocks();
        // Import the mocked module to get access to the mock
        const openai = await import("openai") as any;
        mockCreate = openai.__mockCreate;
        mockCreate.mockReset();

        const openAIProviderSettings: OpenAIProviderSettings = {
            model: "gpt-4-test",
            system_prompt: "You are a testing assistant.",
            temperature: 0.5,
        };
        mockSettings = {
            apiKey: "test-api-key",
            apiProvider: "openai",
            chatSeparator: "---",
            aiProviderSettings: {
                openai: openAIProviderSettings,
            },
        };
    });

    it("should stream responses correctly in the happy path", async () => {
        const mockStream = createMockStream([
            "Hello",
            ", ",
            "world",
            "!",
        ]);
        mockCreate.mockReturnValue(mockStream);

        provider = new OpenAIProvider(mockSettings);

        const onUpdate = vi.fn();
        const abortController = new AbortController();

        await provider.getStreamingResponse(
            "Hi there!",
            onUpdate,
            abortController.signal
        );

        expect(onUpdate).toHaveBeenCalledTimes(4);
        expect(onUpdate).toHaveBeenNthCalledWith(1, "Hello");
        expect(onUpdate).toHaveBeenNthCalledWith(2, ", ");
        expect(onUpdate).toHaveBeenNthCalledWith(3, "world");
        expect(onUpdate).toHaveBeenNthCalledWith(4, "!");
    });

    it("should handle cancellation gracefully", async () => {
        // The mock implementation will throw an AbortError if the signal is aborted.
        mockCreate.mockImplementation(async (params: any, options?: { signal?: AbortSignal }) => {
            const signal = options?.signal;
            if (signal?.aborted) {
                throw new MockAbortError();
            }
            // Return a promise that never resolves, but rejects on abort
            return new Promise((_, reject) => {
                signal?.addEventListener('abort', () => {
                    reject(new MockAbortError());
                });
            });
        });

        provider = new OpenAIProvider(mockSettings);

        const onUpdate = vi.fn();
        const abortController = new AbortController();

        const promise = provider.getStreamingResponse(
            "A long prompt",
            onUpdate,
            abortController.signal
        );

        abortController.abort();

        // Assert that the promise completes without error and no updates are sent.
        // The provider should catch the AbortError and handle it.
        await expect(promise).resolves.toBeUndefined();
        expect(onUpdate).not.toHaveBeenCalled();
    });
});