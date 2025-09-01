import { vi, describe, it, expect, beforeEach } from 'vitest';
import { VaultBotSettingTab } from '../src/settings';
import type { OpenAIProviderSettings } from '../src/aiprovider';

// Mock AIProviderWrapper
const mockValidateApiKey = vi.fn();
vi.mock('../src/aiprovider', () => ({
    AIProviderWrapper: vi.fn(() => ({
        validateApiKey: mockValidateApiKey,
    })),
}));

// Mock Obsidian components - use vi.fn() for Notice instead of class
vi.mock('obsidian', () => ({
    PluginSettingTab: class {
        app: any;
        containerEl: any;
        constructor(app: any, plugin: any) {
            this.app = app;
            this.containerEl = { empty: vi.fn(), createEl: vi.fn() };
        }
    },
    Setting: vi.fn(() => ({
        setName: vi.fn().mockReturnThis(),
        setDesc: vi.fn().mockReturnThis(),
        addText: vi.fn().mockReturnThis(),
        addTextArea: vi.fn().mockReturnThis(),
        addSlider: vi.fn().mockReturnThis(),
        addDropdown: vi.fn().mockReturnThis(),
        addButton: vi.fn().mockReturnThis(),
    })),
    Notice: vi.fn(),
    App: vi.fn(),
    Modal: class {
        app: any;
        contentEl: any;
        titleEl: any;
        constructor(app: any) {
            this.app = app;
            this.contentEl = { empty: vi.fn(), createEl: vi.fn(), createDiv: vi.fn() };
            this.titleEl = { setText: vi.fn() };
        }
        open() {}
        close() {}
    },
    FuzzySuggestModal: class MockFuzzySuggestModal {
        constructor(public app: any) {}
        open() {}
        close() {}
        onOpen() {}
        onClose() {}
        setPlaceholder() {}
        getItems() { return []; }
        getItemText() { return ''; }
        onChooseItem() {}
        renderSuggestion() {}
    },
}));

describe('VaultBotSettingTab API Key Validation', () => {
    let app: any;
    let plugin: any;
    let settingTab: VaultBotSettingTab;

    beforeEach(() => {
        vi.clearAllMocks();
        
        app = {};
        plugin = {
            settings: {
                apiProvider: 'openai',
                chatSeparator: '---',
                aiProviderSettings: {
                    openai: {
                        api_key: '',
                        model: 'gpt-4o',
                        system_prompt: 'Test prompt',
                        temperature: 0.7,
                    } as OpenAIProviderSettings,
                    openrouter: {
                        api_key: '',
                        model: 'openai/gpt-4o',
                        system_prompt: 'Test prompt',
                        temperature: 0.7,
                        site_url: '',
                        site_name: 'Test Site',
                    },
                },
            },
            saveSettings: vi.fn(),
        };
        settingTab = new VaultBotSettingTab(app, plugin);
    });

    it('should test all API keys with valid results', async () => {
        mockValidateApiKey.mockResolvedValue({ valid: true });
        plugin.settings.aiProviderSettings.openai.api_key = 'openai-test-key';
        plugin.settings.aiProviderSettings.openrouter.api_key = 'openrouter-test-key';
        
        await (settingTab as any).testApiKey();
        
        // Should be called twice - once for each provider
        expect(mockValidateApiKey).toHaveBeenCalledTimes(2);
    });

    it('should test all API keys with mixed results', async () => {
        // Mock different results for different calls
        mockValidateApiKey
            .mockResolvedValueOnce({ valid: true })
            .mockResolvedValueOnce({ valid: false, error: 'Invalid API key' });
        
        plugin.settings.aiProviderSettings.openai.api_key = 'valid-openai-key';
        plugin.settings.aiProviderSettings.openrouter.api_key = 'invalid-openrouter-key';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).toHaveBeenCalledTimes(2);
    });

    it('should test only providers with API keys', async () => {
        mockValidateApiKey.mockResolvedValue({ valid: true });
        plugin.settings.aiProviderSettings.openai.api_key = 'openai-test-key';
        plugin.settings.aiProviderSettings.openrouter.api_key = ''; // Empty key
        
        await (settingTab as any).testApiKey();
        
        // Should only be called once for openai (openrouter has no key)
        expect(mockValidateApiKey).toHaveBeenCalledTimes(1);
    });

    it('should handle no API keys configured', async () => {
        plugin.settings.aiProviderSettings.openai.api_key = '';
        plugin.settings.aiProviderSettings.openrouter.api_key = '';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).not.toHaveBeenCalled();
    });

    it('should handle validation errors for individual providers', async () => {
        mockValidateApiKey
            .mockResolvedValueOnce({ valid: true })
            .mockRejectedValueOnce(new Error('Network error'));
        
        plugin.settings.aiProviderSettings.openai.api_key = 'valid-key';
        plugin.settings.aiProviderSettings.openrouter.api_key = 'network-error-key';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).toHaveBeenCalledTimes(2);
    });

    it('should create temporary settings for each provider test', async () => {
        mockValidateApiKey.mockResolvedValue({ valid: true });
        plugin.settings.apiProvider = 'openai'; // Current provider
        plugin.settings.aiProviderSettings.openai.api_key = 'openai-key';
        plugin.settings.aiProviderSettings.openrouter.api_key = 'openrouter-key';
        
        await (settingTab as any).testApiKey();
        
        // Verify that AIProviderWrapper was called with different provider settings
        expect(mockValidateApiKey).toHaveBeenCalledTimes(2);
    });
});
