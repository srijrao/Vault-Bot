import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../src/aiprovider';
import type VaultBotPlugin from '../main';

// Define mocks for UI components that will be used across tests FIRST so the module mock can close over them
const mockContainerEl = {
    createEl: vi.fn(() => mockContainerEl),
    createDiv: vi.fn(() => mockContainerEl),
    setText: vi.fn(),
    empty: vi.fn(),
    style: {},
    classList: { add: vi.fn(), remove: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    click: vi.fn(),
};

const mockTextInput = {
    inputEl: { value: '' },
    setValue: vi.fn(function(val: string) { this.inputEl.value = val; return this; }),
    setPlaceholder: vi.fn().mockReturnThis(),
    onChange: vi.fn().mockReturnThis(),
    getValue: vi.fn(function() { return this.inputEl.value; }),
};

const mockSlider = {
    setLimits: vi.fn().mockReturnThis(),
    setDynamicTooltip: vi.fn().mockReturnThis(),
    setValue: vi.fn().mockReturnThis(),
    onChange: vi.fn().mockReturnThis(),
};

const mockDropdown = {
    addOption: vi.fn().mockReturnThis(),
    setValue: vi.fn().mockReturnThis(),
    onChange: vi.fn().mockReturnThis(),
};

// Track buttons created so we can click by label reliably
const createdButtons: Array<{ text?: string; onClick?: () => Promise<any> | void }> = [];

// Helper to fetch button by its label
function getButtonByText(text: string) {
    return createdButtons.find(b => b.text === text);
}

// Mock the entire obsidian module
vi.mock('obsidian', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        Modal: class MockModal {
            constructor(public app: any) {}
            open() {}
            close() {}
            onOpen() {}
            onClose() {}
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
        PluginSettingTab: class {
            app: any;
            containerEl: any;
            constructor(app: any, plugin: any) {
                this.app = app;
                this.containerEl = mockContainerEl;
            }
        },
        Setting: vi.fn(() => {
            const setting = {
                setName: vi.fn().mockReturnThis(),
                setDesc: vi.fn().mockReturnThis(),
                controlEl: mockContainerEl, // Add controlEl for new model selector
                addText: vi.fn((callback: any) => { callback(mockTextInput); return setting; }),
                addTextArea: vi.fn((callback: any) => { callback(mockTextInput); return setting; }),
                addSlider: vi.fn((callback: any) => { callback(mockSlider); return setting; }),
                addToggle: vi.fn((callback: any) => { callback({ setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() }); return setting; }),
                addDropdown: vi.fn((callback: any) => { callback(mockDropdown); return setting; }),
                addButton: vi.fn((callback: any) => {
                    const btnRecord: { text?: string; onClick?: () => Promise<any> | void } = {};
                    createdButtons.push(btnRecord);
                    const button = {
                        setButtonText: vi.fn((txt: string) => { btnRecord.text = txt; return button; }),
                        setTooltip: vi.fn(() => button),
                        setCta: vi.fn(() => button),
                        setWarning: vi.fn(() => button),
                        onClick: vi.fn((handler: any) => { btnRecord.onClick = handler; return button; }),
                    } as any;
                    callback(button);
                    return setting;
                }),
            } as any;
            return setting;
        }),
        Notice: vi.fn(),
        App: vi.fn(),
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

// Mock dependencies of settings
vi.mock('../src/archiveCalls', () => ({
    zipOldAiCalls: vi.fn(),
}));

// Mock the shared modal to avoid pulling in extra UI
vi.mock('../src/prompt_modal', () => ({
    openAiBotConfigModal: vi.fn(),
}));

// Mock AIProviderWrapper used by settings.ts testApiKey path
const mockValidateApiKey = vi.fn().mockResolvedValue({ valid: true });
vi.mock('../src/aiprovider', async (importOriginal) => {
    const actual = await importOriginal() as any;
    class MockAIProviderWrapper {
        settings: any;
        constructor(settings: any) { this.settings = settings; }
        validateApiKey = mockValidateApiKey;
    }
    return {
        ...actual,
        AIProviderWrapper: MockAIProviderWrapper,
    };
});

// (No need to redefine Setting later; it's fully defined in the obsidian mock)

describe('VaultBotSettingTab', () => {
    let app: any;
    let plugin: VaultBotPlugin;
    let settingTab: any;
    let VaultBotSettingTab: any;
    let DEFAULT_SETTINGS: any;

    beforeEach(async () => {
        // Dynamically import the modules after mocks are set up
        const settingsModule = await import('../src/settings');
        VaultBotSettingTab = settingsModule.VaultBotSettingTab;
        DEFAULT_SETTINGS = settingsModule.DEFAULT_SETTINGS;

        vi.clearAllMocks();
    createdButtons.length = 0;
        app = {};
        plugin = {
            settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), // Deep copy
            saveSettings: vi.fn(),
        } as any;
        settingTab = new VaultBotSettingTab(app, plugin);

        // Set a default value for the API key for tests that need it
        (plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings).api_key = 'default-openai-key';
    });

    it('should display all settings controls', async () => {
        settingTab.display();
        
        expect(mockContainerEl.empty).toHaveBeenCalled();
    const obsidian = await import('obsidian');
    expect((obsidian as any).Setting).toHaveBeenCalled(); 
    });

    it('should set up API Key settings correctly for both providers', () => {
        settingTab.display();
        // Should set up both OpenAI and OpenRouter API key fields
        expect(mockTextInput.setValue).toHaveBeenCalledWith('default-openai-key');
        expect(mockTextInput.setValue).toHaveBeenCalledWith(''); // OpenRouter has empty default
    });

    it('should set up temperature slider correctly', () => {
        settingTab.display();
        expect(mockSlider.setLimits).toHaveBeenCalledWith(0, 2, 0.1);
        expect(mockSlider.setValue).toHaveBeenCalledWith(1.0);
    });

    it('should initialize openai settings if they do not exist', () => {
        delete plugin.settings.aiProviderSettings.openai;
        settingTab = new VaultBotSettingTab(app, plugin);
        settingTab.display();
        expect(plugin.settings.aiProviderSettings.openai).toBeDefined();
        expect((plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings).model).toBe('gpt-4o');
    });

    it('should test API key validation functionality exists and tests all providers', async () => {
        // Set up multiple providers with API keys
        plugin.settings.aiProviderSettings.openai.api_key = 'openai-test-key';
        (plugin.settings.aiProviderSettings.openrouter as OpenRouterProviderSettings).api_key = 'openrouter-test-key';
        
        settingTab.display();
        const validateBtn = getButtonByText('Test API Key');
        expect(validateBtn?.onClick).toBeDefined();
        await validateBtn?.onClick?.();
        
        // Should be called twice for both providers
        expect(mockValidateApiKey).toHaveBeenCalledTimes(2);
    });

    it('should wire Archive AI calls now button to call zipOldAiCalls', async () => {
        const { zipOldAiCalls } = await import('../src/archiveCalls');
        settingTab.display();
        const archiveBtn = getButtonByText('Compress Now');
        expect(archiveBtn?.onClick).toBeDefined();
        await archiveBtn?.onClick?.();
        expect(zipOldAiCalls).toHaveBeenCalled();
    });
});

describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', async () => {
        const { DEFAULT_SETTINGS } = await import('../src/settings');
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
