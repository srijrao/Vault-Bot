import { describe, it, expect, vi } from 'vitest';
import { AIProviderWrapper } from '../src/aiprovider';
import { VaultBotPluginSettings } from '../src/settings';

describe('Image extraction regexes', () => {
  it('detects data URI images', () => {
    const text = 'Inline image data: data:image/png;base64,iVBORw0KGgoAAAANSUhEUg... and more text';
    const dataUriRegex = /data:(image\/[a-zA-Z0-9.+-]+);base64,[A-Za-z0-9+/=]+/g;
    const matches = Array.from(text.matchAll(dataUriRegex));
    expect(matches.length).toBe(1);
    expect(matches[0][1]).toBe('image/png');
  });

  it('detects markdown image syntax', () => {
    const text = 'Here is an image ![alt text](images/pic.png) and another ![d](data:image/jpeg;base64,AAAA)';
    const imageMarkdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = Array.from(text.matchAll(imageMarkdownRegex));
    expect(matches.length).toBe(2);
    expect(matches[0][1]).toBe('alt text');
    expect(matches[0][2]).toBe('images/pic.png');
    expect(matches[1][1]).toBe('d');
    expect(matches[1][2]).toContain('data:image/jpeg');
  });
});

describe('AIProviderWrapper image upload integration (stubbed)', () => {
  it('calls provider uploadImageFromDataURI and replaces reference in message', async () => {
    const settings: VaultBotPluginSettings = {
      apiProvider: 'openai',
      chatSeparator: '---',
      recordApiCalls: false,
  includeLinkedNotes: true,
      aiProviderSettings: {
        openai: {
          api_key: 'test',
          model: 'gpt-4o',
          system_prompt: 'Test',
          temperature: 0.5
        }
      }
    } as any;

    const wrapper = new AIProviderWrapper(settings as any);

    // Stub contentRetrievalService to return a note with a data-uri image
    const dataUri = 'data:image/png;base64,AAAA';
    const retrievedNote = {
      file: {} as any,
      path: 'note.md',
      title: 'Note',
      content: `Here is an image ![alt](${dataUri})`,
      images: [ { sourceType: 'data', raw: dataUri, alt: 'alt' } ]
    };

    (wrapper as any).contentRetrievalService = {
  retrieveContent: async () => [retrievedNote],
  formatNotesForAI: (notes: any) => '\n\n---\n\n**Included Notes:**\n\n' + notes.map((n: any) => `## ${n.title} (${n.path})\n\n${n.content}`).join('\n\n---\n\n')
    };

    // Replace provider with a mock that has uploadImageFromDataURI
    const uploadedUrl = 'https://cdn.example.com/image.png';
    const mockProvider: any = {
      getStreamingResponseWithConversation: vi.fn().mockResolvedValue(undefined),
      validateApiKey: vi.fn(),
      listModels: vi.fn(),
      uploadImageFromDataURI: vi.fn().mockResolvedValue({ url: uploadedUrl, id: 'file1' })
    };

    (wrapper as any).provider = mockProvider;

    const onUpdate = vi.fn();
    const abortController = new AbortController();

    await wrapper.getStreamingResponseWithConversation([
      { role: 'user', content: 'Please analyze my note' }
    ], onUpdate, abortController.signal);

    // Ensure upload was called with the data URI
    expect(mockProvider.uploadImageFromDataURI).toHaveBeenCalled();
    const calledWith = mockProvider.uploadImageFromDataURI.mock.calls[0][0];
    expect(calledWith).toBe(dataUri);

    // Ensure provider received a message where the data URI was replaced with uploaded URL
    expect(mockProvider.getStreamingResponseWithConversation).toHaveBeenCalled();
    const sentMessages = mockProvider.getStreamingResponseWithConversation.mock.calls[0][0];
    const userMsg = sentMessages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toContain(uploadedUrl);
  });
});
