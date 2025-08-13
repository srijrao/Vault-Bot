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
                },
            },
            saveSettings: vi.fn(),
        };
        settingTab = new VaultBotSettingTab(app, plugin);
    });

    it('should handle API key validation success', async () => {
        mockValidateApiKey.mockResolvedValue({ valid: true });
        plugin.settings.aiProviderSettings.openai.api_key = 'test-key';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).toHaveBeenCalled();
    });

    it('should handle API key validation failure', async () => {
        mockValidateApiKey.mockResolvedValue({ valid: false, error: 'Invalid API key' });
        plugin.settings.aiProviderSettings.openai.api_key = 'invalid-key';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).toHaveBeenCalled();
    });

    it('should handle missing API key', async () => {
        plugin.settings.aiProviderSettings.openai.api_key = '';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).not.toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
        mockValidateApiKey.mockRejectedValue(new Error('Network error'));
        plugin.settings.aiProviderSettings.openai.api_key = 'test-key';
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).toHaveBeenCalled();
    });

    it('should handle openrouter provider', async () => {
        plugin.settings.apiProvider = 'openrouter';
        plugin.settings.aiProviderSettings.openrouter = {
            api_key: 'test-key',
            model: 'openai/gpt-4o',
            system_prompt: 'Test prompt',
            temperature: 0.7,
        };
        mockValidateApiKey.mockResolvedValue({ valid: true });
        
        await (settingTab as any).testApiKey();
        
        expect(mockValidateApiKey).toHaveBeenCalled();
    });
});
