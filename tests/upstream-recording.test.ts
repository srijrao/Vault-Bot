import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIProviderWrapper } from '../src/aiprovider';
import type { VaultBotPluginSettings } from '../src/settings';

// Mock underlying providers so we don't perform real API calls
const mockUnderlyingProvider = {
  getStreamingResponseWithConversation: vi.fn(),
  validateApiKey: vi.fn(),
};

vi.mock('../src/providers', () => ({
  AIProvider: vi.fn(),
  OpenAIProvider: vi.fn().mockImplementation(() => mockUnderlyingProvider),
  OpenRouterProvider: vi.fn().mockImplementation(() => mockUnderlyingProvider),
}));

describe('Upstream recording via AIProviderWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures exact messages including datetime when enabled', async () => {
    const settings: VaultBotPluginSettings = {
      apiProvider: 'openai',
      chatSeparator: '\n\n----\n\n',
      recordApiCalls: true,
      includeDatetime: true,
      aiProviderSettings: {
        openai: {
          api_key: 'k',
          model: 'gpt-4o',
          system_prompt: 'You are a helpful assistant',
          temperature: 0.5,
        } as any,
        openrouter: {
          api_key: '',
          model: 'openai/gpt-4o',
          system_prompt: 'You are a helpful assistant',
          temperature: 1.0,
          site_url: '',
          site_name: 'Obsidian Vault-Bot',
        } as any,
      },
    } as any;

    const wrapper = new AIProviderWrapper(settings);

    const onUpdate = vi.fn();
    const ac = new AbortController();
    let captured: any = null;
    const recordingCb = (messages: any[], model: string, options: Record<string, any>) => {
      captured = { messages, model, options };
    };

    await wrapper.getStreamingResponse('Hello world', onUpdate, ac.signal, recordingCb);

    expect(captured).toBeTruthy();
    expect(captured.model).toBe('gpt-4o');
    expect(captured.options).toEqual({ temperature: 0.5 });
    expect(captured.messages[0]).toMatchObject({ role: 'system' });
    // System content should include datetime prefix line followed by blank line and base prompt
    expect(captured.messages[0].content).toMatch(/^Current date and time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC offset [+-]\d{2}:\d{2}\)\n\nYou are a helpful assistant$/);
    expect(captured.messages[1]).toEqual({ role: 'user', content: 'Hello world' });
  });

  it('omits datetime when includeDatetime is false', async () => {
    const settings: VaultBotPluginSettings = {
      apiProvider: 'openai',
      chatSeparator: '\n\n----\n\n',
      recordApiCalls: true,
      includeDatetime: false,
      aiProviderSettings: {
        openai: {
          api_key: 'k',
          model: 'gpt-4o',
          system_prompt: 'Only base prompt',
          temperature: 0.2,
        } as any,
        openrouter: {
          api_key: '',
          model: 'openai/gpt-4o',
          system_prompt: 'You are a helpful assistant',
          temperature: 1.0,
          site_url: '',
          site_name: 'Obsidian Vault-Bot',
        } as any,
      },
    } as any;

    const wrapper = new AIProviderWrapper(settings);
    const onUpdate = vi.fn();
    const ac = new AbortController();
    let captured: any = null;
    const recordingCb = (messages: any[], model: string, options: Record<string, any>) => {
      captured = { messages, model, options };
    };

    await wrapper.getStreamingResponse('Ping', onUpdate, ac.signal, recordingCb);

    expect(captured).toBeTruthy();
    expect(captured.model).toBe('gpt-4o');
    expect(captured.options).toEqual({ temperature: 0.2 });
    expect(captured.messages[0]).toEqual({ role: 'system', content: 'Only base prompt' });
    expect(captured.messages[1]).toEqual({ role: 'user', content: 'Ping' });
  });
});
