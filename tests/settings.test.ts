import { vi, describe, it, expect, beforeEach } from 'vitest';
import { VaultBotSettingTab, DEFAULT_SETTINGS } from '../src/settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../src/aiprovider';
import VaultBotPlugin from '../main';

// Mock Modal separately
vi.mock('obsidian', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        PluginSettingTab: class {
            app: any;
            containerEl: any;
            constructor(app: any, plugin: any) {
                this.app = app;
                this.containerEl = mockContainerEl;
            }
        },
        Setting: vi.fn(() => {
            const setting = { ...mockSetting };
            setting.addText = vi.fn((callback) => {
                callback(mockTextInput);
                return setting;
            });
            setting.addTextArea = vi.fn((callback) => {
                callback(mockTextInput);
                return setting;
            });
            setting.addSlider = vi.fn((callback) => {
                callback(mockSlider);
                return setting;
            });
            setting.addDropdown = vi.fn((callback) => {
                callback(mockDropdown);
                return setting;
            });
            setting.addToggle = vi.fn((callback) => {
                const toggle = { setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() };
                callback(toggle);
                return setting;
            });
            setting.addButton = vi.fn((callback) => {
                callback(mockButton);
                return setting;
            });
            return setting;
        }),
        Notice: mockNotice,
        App: vi.fn(),
        Modal: class {
            app: any;
            contentEl: any;
            titleEl: any;
            constructor(app: any) {
                this.app = app;
                this.contentEl = mockContainerEl;
                this.titleEl = { setText: vi.fn() };
            }
            open() {}
            close() {}
        },
        Component: class {},
        TFile: class {},
        TFolder: class {},
        normalizePath: vi.fn((path) => path),
        requestUrl: vi.fn(),
        Platform: {
            isDesktop: true,
            isMobile: false,
        },
    };
});

// Mock AIProviderWrapper
const mockValidateApiKey = vi.fn();
vi.mock('../src/aiprovider', () => ({
    AIProviderWrapper: vi.fn(() => ({
        validateApiKey: mockValidateApiKey,
    })),
}));

// Mock archiver
const mockZipOldAiCalls = vi.fn();
vi.mock('../src/archiveCalls', () => ({
    zipOldAiCalls: (...args: any[]) => mockZipOldAiCalls(...args),
}));

// Mock Notice
const mockNotice = vi.fn();
vi.mock('obsidian', () => ({
    PluginSettingTab: class {
        app: any;
        containerEl: any;
        constructor(app: any, plugin: any) {
            this.app = app;
            this.containerEl = mockContainerEl;
        }
    },
    Setting: vi.fn(() => {
        const setting = { ...mockSetting };
        setting.addText = vi.fn((callback) => {
            callback(mockTextInput);
            return setting;
        });
        setting.addTextArea = vi.fn((callback) => {
            callback(mockTextInput);
            return setting;
        });
        setting.addSlider = vi.fn((callback) => {
            callback(mockSlider);
            return setting;
        });
        setting.addDropdown = vi.fn((callback) => {
            callback(mockDropdown);
            return setting;
        });
        setting.addToggle = vi.fn((callback) => {
            const toggle = { setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() };
            callback(toggle);
            return setting;
        });
        setting.addButton = vi.fn((callback) => {
            callback(mockButton);
            return setting;
        });
        return setting;
    }),
    Notice: mockNotice,
    App: vi.fn(),
    Modal: class {
        app: any;
        contentEl: any;
        titleEl: any;
        constructor(app: any) {
            this.app = app;
            this.contentEl = mockContainerEl;
            this.titleEl = { setText: vi.fn() };
        }
        open() {}
        close() {}
    },
    Component: class {},
    TFile: class {},
    TFolder: class {},
    normalizePath: vi.fn((path) => path),
    requestUrl: vi.fn(),
    Platform: {
        isDesktop: true,
        isMobile: false,
    },
}));
const mockSetting = {
    setName: vi.fn().mockReturnThis(),
    setDesc: vi.fn().mockReturnThis(),
    addText: vi.fn().mockReturnThis(),
    addTextArea: vi.fn().mockReturnThis(),
    addSlider: vi.fn().mockReturnThis(),
    addDropdown: vi.fn().mockReturnThis(),
    addToggle: vi.fn().mockReturnThis(),
    addButton: vi.fn().mockReturnThis(),
};

const mockTextInput = {
    setPlaceholder: vi.fn().mockReturnThis(),
    setValue: vi.fn().mockReturnThis(),
    onChange: vi.fn().mockReturnThis(),
    inputEl: { type: '' },
};

const mockSlider = {
    setLimits: vi.fn().mockReturnThis(),
    setValue: vi.fn().mockReturnThis(),
    setDynamicTooltip: vi.fn().mockReturnThis(),
    onChange: vi.fn().mockReturnThis(),
};

const mockDropdown = {
    addOption: vi.fn().mockReturnThis(),
    setValue: vi.fn().mockReturnThis(),
    onChange: vi.fn().mockReturnThis(),
};

const mockButton = {
    setButtonText: vi.fn().mockReturnThis(),
    setTooltip: vi.fn().mockReturnThis(),
    onClick: vi.fn().mockReturnThis(),
};

const mockContainerEl = {
    empty: vi.fn(),
    createEl: vi.fn(),
};

vi.mock('obsidian', () => ({
    PluginSettingTab: class {
        app: any;
        containerEl: any;
        constructor(app: any, plugin: any) {
            this.app = app;
            this.containerEl = mockContainerEl;
        }
    },
    Setting: vi.fn(() => {
        const setting = { ...mockSetting };
        setting.addText = vi.fn((callback) => {
            callback(mockTextInput);
            return setting;
        });
        setting.addTextArea = vi.fn((callback) => {
            callback(mockTextInput);
            return setting;
        });
        setting.addSlider = vi.fn((callback) => {
            callback(mockSlider);
            return setting;
        });
        setting.addDropdown = vi.fn((callback) => {
            callback(mockDropdown);
            return setting;
        });
        setting.addToggle = vi.fn((callback) => {
            const toggle = { setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() };
            callback(toggle);
            return setting;
        });
        setting.addButton = vi.fn((callback) => {
            callback(mockButton);
            return setting;
        });
        return setting;
    }),
    App: vi.fn(),
}));

describe('VaultBotSettingTab', () => {
    let app: any;
    let plugin: VaultBotPlugin;
    let settingTab: VaultBotSettingTab;

    beforeEach(() => {
        vi.clearAllMocks();
        app = {};
        plugin = {
            settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), // Deep copy to avoid mutation
            saveSettings: vi.fn(),
        } as any;
        settingTab = new VaultBotSettingTab(app, plugin);
    });

    it('should display all settings controls', async () => {
        settingTab.display();
        
        expect(mockContainerEl.empty).toHaveBeenCalled();
        expect(mockContainerEl.createEl).toHaveBeenCalledWith('h2', { text: 'OpenAI Provider Settings' });
        
    // Should create 8 settings: Provider Dropdown, API Key, Record toggle, Folder actions, Chat Separator, Model, System Prompt, Temperature
        const { Setting } = await import('obsidian');
    expect(Setting).toHaveBeenCalledTimes(9); // +1 for Archive AI calls now
    });

    it('should set up API Key setting correctly', () => {
        settingTab.display();
        
        expect(mockSetting.setName).toHaveBeenCalledWith('API Key');
        expect(mockSetting.setDesc).toHaveBeenCalledWith('Your API key for OpenAI.');
        expect(mockTextInput.setPlaceholder).toHaveBeenCalledWith('Enter your API key');
        expect(mockTextInput.setValue).toHaveBeenCalledWith((plugin.settings.aiProviderSettings.openai as any).api_key);
    });

    it('should set up temperature slider correctly', () => {
        settingTab.display();
        
        expect(mockSlider.setLimits).toHaveBeenCalledWith(0, 2, 0.1);
        expect(mockSlider.setValue).toHaveBeenCalledWith(1.0); // Default temperature
        expect(mockSlider.setDynamicTooltip).toHaveBeenCalled();
    });

    it('should initialize openai settings if they do not exist', () => {
        plugin.settings.aiProviderSettings.openai = undefined as any;
        
        settingTab.display();
        
        expect(plugin.settings.aiProviderSettings.openai).toBeDefined();
        expect((plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings).model).toBe('gpt-4o');
    });

    it('should test API key validation functionality exists', () => {
        // Just verify the method exists without testing Notice integration
        expect(typeof (settingTab as any).testApiKey).toBe('function');
    });

    it('should wire Archive AI calls now button to call zipOldAiCalls', async () => {
        settingTab.display();
        // Find the call for the Archive setting's button
        const { Setting } = await import('obsidian');
        // Last few calls will include our button wiring; we can simulate by invoking the onClick passed earlier.
        // Since our mock Setting returns the same object, we can inspect mockButton.onClick
        expect(typeof (mockButton.onClick as any).mock).toBe('object');
        // Simulate click
        await (mockButton.onClick as any).mock.calls[ (mockButton.onClick as any).mock.calls.length - 1][0]();
        expect(mockZipOldAiCalls).toHaveBeenCalled();
    });
});

describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', () => {
        expect(DEFAULT_SETTINGS.apiProvider).toBe('openai');
        expect(DEFAULT_SETTINGS.chatSeparator).toBe('\n\n----\n\n');
        expect((DEFAULT_SETTINGS.aiProviderSettings.openai as OpenAIProviderSettings).api_key).toBe('');
        expect((DEFAULT_SETTINGS.aiProviderSettings.openai as OpenAIProviderSettings).model).toBe('gpt-4o');
        expect((DEFAULT_SETTINGS.aiProviderSettings.openai as OpenAIProviderSettings).system_prompt).toBe('You are a helpful assistant.');
        expect((DEFAULT_SETTINGS.aiProviderSettings.openai as OpenAIProviderSettings).temperature).toBe(1.0);
        expect((DEFAULT_SETTINGS.aiProviderSettings.openrouter as OpenRouterProviderSettings).api_key).toBe('');
        expect((DEFAULT_SETTINGS.aiProviderSettings.openrouter as OpenRouterProviderSettings).model).toBe('openai/gpt-4o');
        expect((DEFAULT_SETTINGS.aiProviderSettings.openrouter as OpenRouterProviderSettings).site_name).toBe('Obsidian Vault-Bot');
    });
});
