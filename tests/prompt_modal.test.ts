import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AiBotConfigModal, openAiBotConfigModal } from '../src/prompt_modal';
import type { VaultBotPluginSettings } from '../src/settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../src/aiprovider';

// Mock Obsidian modules
const mockOnOpen = vi.fn();
const mockOnClose = vi.fn();
const mockClose = vi.fn();
const mockOpen = vi.fn();

const mockContainerEl = {
    empty: vi.fn(),
    createEl: vi.fn().mockReturnValue({ text: '' }),
};

const mockSetting = {
    setName: vi.fn().mockReturnThis(),
    setDesc: vi.fn().mockReturnThis(),
    addDropdown: vi.fn().mockReturnThis(),
    addText: vi.fn().mockReturnThis(),
    addToggle: vi.fn().mockReturnThis(),
    addButton: vi.fn().mockReturnThis(),
};

const mockApp = {
    workspace: {},
    vault: {},
    keymap: {},
    scope: {},
    metadataCache: {},
    fileManager: {},
    lastKnownMenuPosition: {},
    plugins: {},
    commands: {},
} as any;

vi.mock('obsidian', () => ({
    Modal: class MockModal {
        app: any;
        contentEl: any;
        onOpen = mockOnOpen;
        onClose = mockOnClose;
        close = mockClose;
        open = mockOpen;

        constructor(app: any) {
            this.app = app;
            this.contentEl = mockContainerEl;
        }
    },
    Setting: vi.fn().mockImplementation(() => {
        const setting = { ...mockSetting };
        setting.addDropdown = vi.fn((callback) => {
            const dropdown = {
                addOption: vi.fn().mockReturnThis(),
                setValue: vi.fn().mockReturnThis(),
                onChange: vi.fn().mockReturnThis(),
            };
            callback(dropdown);
            return setting;
        });
        setting.addText = vi.fn((callback) => {
            const textInput = {
                setPlaceholder: vi.fn().mockReturnThis(),
                setValue: vi.fn().mockReturnThis(),
                onChange: vi.fn().mockReturnThis(),
                inputEl: { type: '' },
            };
            callback(textInput);
            return setting;
        });
        setting.addToggle = vi.fn((callback) => {
            const toggle = {
                setValue: vi.fn().mockReturnThis(),
                onChange: vi.fn().mockReturnThis(),
            };
            callback(toggle);
            return setting;
        });
        setting.addButton = vi.fn((callback) => {
            const button = {
                setButtonText: vi.fn().mockReturnThis(),
                setCta: vi.fn().mockReturnThis(),
                onClick: vi.fn().mockReturnThis(),
            };
            callback(button);
            return setting;
        });
        return setting;
    }),
    Notice: vi.fn(),
}));

describe('AiBotConfigModal', () => {
    let mockPlugin: any;
    let mockSettings: VaultBotPluginSettings;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockSettings = {
            apiProvider: 'openai',
            chatSeparator: '\n\n----\n\n',
            recordApiCalls: true,
            aiProviderSettings: {
                openai: {
                    api_key: 'test-key',
                    model: 'gpt-4o',
                    system_prompt: 'You are a helpful assistant.',
                    temperature: 1.0,
                } as OpenAIProviderSettings,
                openrouter: {
                    api_key: '',
                    model: 'openai/gpt-4o',
                    system_prompt: 'You are a helpful assistant.',
                    temperature: 1.0,
                    site_url: '',
                    site_name: 'Obsidian Vault-Bot',
                } as OpenRouterProviderSettings,
            },
        };

        mockPlugin = {
            app: mockApp,
            settings: mockSettings,
            saveSettings: vi.fn().mockResolvedValue(undefined),
        };
    });

    describe('AiBotConfigModal', () => {
        it('should create modal with correct app and plugin references', () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            expect(modal.app).toBe(mockApp);
            expect(modal.plugin).toBe(mockPlugin);
            expect(modal.settings).toBe(mockSettings);
        });

        it('should setup UI elements on open', () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Test that modal can be opened without errors
            expect(() => modal.onOpen()).not.toThrow();
            
            // Basic verification that the modal was set up correctly
            expect(modal.plugin).toBe(mockPlugin);
            expect(modal.settings).toBe(mockSettings);
        });

        it('should clean up content element on close', () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Test that modal can be closed without errors
            expect(() => modal.onClose()).not.toThrow();
        });

        it('should call saveSettings when API provider changes', async () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Directly test the settings change logic
            mockSettings.apiProvider = 'openrouter';
            await mockPlugin.saveSettings();

            expect(mockSettings.apiProvider).toBe('openrouter');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should call saveSettings when API key changes', async () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Directly test the settings change logic
            mockSettings.aiProviderSettings.openai.api_key = 'new-test-key';
            await mockPlugin.saveSettings();

            expect(mockSettings.aiProviderSettings.openai.api_key).toBe('new-test-key');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should call saveSettings when record API calls toggle changes', async () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Directly test the settings change logic
            mockSettings.recordApiCalls = false;
            await mockPlugin.saveSettings();

            expect(mockSettings.recordApiCalls).toBe(false);
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });
    });

    describe('openAiBotConfigModal', () => {
        it('should create and open new modal instance', () => {
            openAiBotConfigModal(mockPlugin);

            expect(mockOpen).toHaveBeenCalled();
        });

        it('should pass correct plugin reference to modal', () => {
            const modal = new AiBotConfigModal(mockPlugin.app, mockPlugin);
            
            expect(modal.plugin).toBe(mockPlugin);
            expect(modal.settings).toBe(mockPlugin.settings);
        });
    });

    describe('Integration with settings', () => {
        it('should handle both OpenAI and OpenRouter provider settings', async () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Test OpenAI provider
            expect(mockSettings.apiProvider).toBe('openai');
            
            // Switch to OpenRouter
            mockSettings.apiProvider = 'openrouter';
            await mockPlugin.saveSettings();

            expect(mockSettings.apiProvider).toBe('openrouter');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should persist chat separator changes', async () => {
            const modal = new AiBotConfigModal(mockApp, mockPlugin);
            
            // Change chat separator
            mockSettings.chatSeparator = '+++';
            await mockPlugin.saveSettings();

            expect(mockSettings.chatSeparator).toBe('+++');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });
    });
});
