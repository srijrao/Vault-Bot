# Multi-Provider AI System
2025-08-12

This document describes the refactored AI provider system that supports multiple AI providers including OpenAI and OpenRouter.

## Architecture

### Provider Structure
```
src/
├── providers/
│   ├── base.ts          # Base interfaces for all providers
│   ├── openai.ts        # OpenAI provider implementation
│   ├── openrouter.ts    # OpenRouter provider implementation
│   └── index.ts         # Provider exports
├── aiprovider.ts        # AI provider wrapper and factory
└── settings.ts          # Settings with multi-provider support
```

### Provider Interface
All AI providers implement the `AIProvider` interface:
```typescript
interface AIProvider {
    getStreamingResponse(
        prompt: string, 
        onUpdate: (text: string) => void, 
        signal: AbortSignal
    ): Promise<void>;
}
```

### Supported Providers

#### OpenAI Provider
- Uses the official OpenAI SDK
- Supports all OpenAI chat completion models
- Configuration: api_key, model, system_prompt, temperature
- Constructor: `new OpenAIProvider(settings: OpenAIProviderSettings)`

#### OpenRouter Provider  
- Uses the official OpenRouter SDK (`@openrouter/ai-sdk-provider` v1.1.2)
- Built on the Vercel AI SDK (v5.0.11) for excellent streaming and abort support
- Supports hundreds of models from various providers
- Configuration: api_key, model, system_prompt, temperature, site_url, site_name
- Models use format: `provider/model` (e.g., `openai/gpt-4o`, `anthropic/claude-3-haiku`)
- Constructor: `new OpenRouterProvider(settings: OpenRouterProviderSettings)`

### Settings Configuration
The settings structure has been completely refactored for provider-specific configuration:

```typescript
interface VaultBotPluginSettings {
    apiProvider: string;                    // 'openai' or 'openrouter'
    chatSeparator: string;                  // Chat separator string
    aiProviderSettings: Record<string, AIProviderSettings>;
}
```

Each provider has its own settings with API keys:
- **OpenAI Settings**: `{ api_key, model, system_prompt, temperature }`
- **OpenRouter Settings**: `{ api_key, model, system_prompt, temperature, site_url?, site_name? }`
- **No Global API Key**: Each provider manages its own API key in the settings structure

### Usage Example
```typescript
// Settings structure with provider-specific API keys
const settings: VaultBotPluginSettings = {
    apiProvider: 'openrouter',
    chatSeparator: '\n\n----\n\n',
    aiProviderSettings: {
        openai: {
            api_key: 'sk-...',
            model: 'gpt-4o',
            system_prompt: 'You are a helpful assistant.',
            temperature: 0.7
        },
        openrouter: {
            api_key: 'sk-or-...',
            model: 'openai/gpt-4o',
            system_prompt: 'You are a helpful assistant.',
            temperature: 0.7,
            site_url: 'https://myapp.com',
            site_name: 'My App'
        }
    }
};

// Create provider wrapper with settings
const wrapper = new AIProviderWrapper(settings);

// Get streaming response (provider is handled internally)
await wrapper.getStreamingResponse(
    "Hello, how are you?",
    (text) => console.log(text),
    abortController.signal
);

// Update provider when settings change
wrapper.updateProvider(newSettings);
```

### Adding New Providers
To add a new provider:

1. Create provider implementation in `src/providers/newprovider.ts`:
```typescript
export interface NewProviderSettings extends AIProviderSettings {
    // Provider-specific settings
}

export class NewProvider implements AIProvider {
    // Implementation
}
```

2. Update `src/providers/index.ts` to export the new provider

3. Add provider to `AIProviderWrapper` in `src/aiprovider.ts`:
```typescript
case 'newprovider':
    const newProviderSettings = this.settings.aiProviderSettings['newprovider'] as NewProviderSettings;
    return new NewProvider(newProviderSettings);
```

4. Update settings UI in `src/settings.ts` to include the new provider option

5. Add comprehensive tests in `tests/providers/newprovider.test.ts`

### Testing
All providers have comprehensive test coverage:
- Provider instantiation
- Streaming response handling
- Error handling (API errors, network errors, abort errors)
- Provider-specific features

Run tests with: `npm test`

## Implementation Details

### OpenRouter Integration
The OpenRouter provider was completely rewritten to use the official SDK:
- **Before**: Custom fetch API calls
- **After**: Official `@openrouter/ai-sdk-provider` with `streamText()` from Vercel AI SDK
- **Key Fix**: Added `await` to `streamText()` call for proper async handling
- **Benefits**: Better streaming support, proper TypeScript types, official maintenance

### Dependencies Added
```json
{
  "@openrouter/ai-sdk-provider": "^1.1.2",
  "ai": "^5.0.11"
}
```

### TypeScript Compatibility
- Updated TypeScript to latest version for const type parameters required by AI SDK
- Added proper type assertions in tests: `as OpenAIProviderSettings` and `as OpenRouterProviderSettings`
- Removed legacy `apiKey` field from settings interface

### Constructor Pattern Changes
**Before (legacy)**:
```typescript
new OpenAIProvider(apiKey, settings)
new OpenRouterProvider(apiKey, settings)
```

**After (current)**:
```typescript
new OpenAIProvider(settings)  // settings includes api_key
new OpenRouterProvider(settings)  // settings includes api_key
```

### Test Coverage
- **38 tests total**: All passing ✅
- **5 test files**: One for each major component
- **Mocking**: Proper mocking of AI SDK functions with async iterables
- **Error scenarios**: Abort errors, network errors, API errors
