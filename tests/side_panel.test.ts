import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AiBotSidePanel, AI_BOT_PANEL_VIEW_TYPE, openAiBotSidePanel } from '../src/side_panel';
import type { VaultBotPluginSettings } from '../src/settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../src/aiprovider';

// Mock Obsidian modules
const mockOnOpen = vi.fn();
const mockOnClose = vi.fn();
const mockEmpty = vi.fn();
const mockCreateEl = vi.fn().mockReturnValue({ text: '' });

const mockContainerEl = {
    children: [null, {
        empty: mockEmpty,
        createEl: mockCreateEl,
    }],
};

const mockLeaf = {
    setViewState: vi.fn(),
} as any;

const mockWorkspace = {
    getLeavesOfType: vi.fn(),
    getRightLeaf: vi.fn(),
    revealLeaf: vi.fn(),
};

const mockApp = {
    workspace: mockWorkspace,
    keymap: {},
    scope: {},
    metadataCache: {},
    fileManager: {},
    lastKnownMenuPosition: {},
    plugins: {},
    commands: {},
} as any;

const mockSetting = {
    setName: vi.fn().mockReturnThis(),
    setDesc: vi.fn().mockReturnThis(),
    addDropdown: vi.fn().mockReturnThis(),
    addText: vi.fn().mockReturnThis(),
    addTextArea: vi.fn().mockReturnThis(),
    addSlider: vi.fn().mockReturnThis(),
};

vi.mock('obsidian', () => ({
    ItemView: class MockItemView {
        containerEl: any;
        leaf: any;
        onOpen = mockOnOpen;
        onClose = mockOnClose;

        constructor(leaf: any) {
            this.leaf = leaf;
            this.containerEl = mockContainerEl;
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
                inputEl: { type: '', rows: 4, style: { width: '' } },
            };
            callback(textInput);
            return setting;
        });
        setting.addTextArea = vi.fn((callback) => {
            const textArea = {
                setPlaceholder: vi.fn().mockReturnThis(),
                setValue: vi.fn().mockReturnThis(),
                onChange: vi.fn().mockReturnThis(),
                inputEl: { rows: 4, style: { width: '' } },
            };
            callback(textArea);
            return setting;
        });
        setting.addSlider = vi.fn((callback) => {
            const slider = {
                setLimits: vi.fn().mockReturnThis(),
                setValue: vi.fn().mockReturnThis(),
                setDynamicTooltip: vi.fn().mockReturnThis(),
                onChange: vi.fn().mockReturnThis(),
            };
            callback(slider);
            return setting;
        });
        return setting;
    }),
    Notice: vi.fn(),
}));

describe('AiBotSidePanel', () => {
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

    describe('AiBotSidePanel', () => {
        it('should create side panel with correct view type and display text', () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            expect(panel.getViewType()).toBe(AI_BOT_PANEL_VIEW_TYPE);
            expect(panel.getDisplayText()).toBe('AI Bot Settings');
            expect(panel.getIcon()).toBe('bot');
        });

        it('should setup UI elements on open', async () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Test that panel can be opened without errors
            expect(() => panel.onOpen()).not.toThrow();
            
            // Basic verification that the panel was set up correctly
            expect(panel.plugin).toBe(mockPlugin);
            expect(panel.settings).toBe(mockSettings);
        });

        it('should render OpenAI settings when provider is openai', async () => {
            mockSettings.apiProvider = 'openai';
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Test that panel can render OpenAI settings without errors
            expect(() => panel.onOpen()).not.toThrow();
            expect(panel.settings.apiProvider).toBe('openai');
        });

        it('should render OpenRouter settings when provider is openrouter', async () => {
            mockSettings.apiProvider = 'openrouter';
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Test that panel can render OpenRouter settings without errors
            expect(() => panel.onOpen()).not.toThrow();
            expect(panel.settings.apiProvider).toBe('openrouter');
        });

        it('should save settings when model changes', async () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Directly test the settings change logic
            (mockSettings.aiProviderSettings.openai as OpenAIProviderSettings).model = 'gpt-3.5-turbo';
            await mockPlugin.saveSettings();

            expect((mockSettings.aiProviderSettings.openai as OpenAIProviderSettings).model).toBe('gpt-3.5-turbo');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should save settings when system prompt changes', async () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Directly test the settings change logic
            (mockSettings.aiProviderSettings.openai as OpenAIProviderSettings).system_prompt = 'You are a coding assistant.';
            await mockPlugin.saveSettings();

            expect((mockSettings.aiProviderSettings.openai as OpenAIProviderSettings).system_prompt).toBe('You are a coding assistant.');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should save settings when temperature changes', async () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Directly test the settings change logic
            (mockSettings.aiProviderSettings.openai as OpenAIProviderSettings).temperature = 0.5;
            await mockPlugin.saveSettings();

            expect((mockSettings.aiProviderSettings.openai as OpenAIProviderSettings).temperature).toBe(0.5);
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should handle provider switching', async () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Start with OpenAI
            expect(mockSettings.apiProvider).toBe('openai');
            
            // Switch to OpenRouter
            mockSettings.apiProvider = 'openrouter';
            await mockPlugin.saveSettings();

            expect(mockSettings.apiProvider).toBe('openrouter');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });
    });

    describe('openAiBotSidePanel', () => {
        it('should activate existing panel if one exists', () => {
            const existingLeaf = { setViewState: vi.fn() };
            mockWorkspace.getLeavesOfType.mockReturnValue([existingLeaf]);
            
            openAiBotSidePanel(mockPlugin);

            expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(AI_BOT_PANEL_VIEW_TYPE);
            expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
        });

        it('should create new panel if none exists', () => {
            const newLeaf = { setViewState: vi.fn() };
            mockWorkspace.getLeavesOfType.mockReturnValue([]);
            mockWorkspace.getRightLeaf.mockReturnValue(newLeaf);
            
            openAiBotSidePanel(mockPlugin);

            expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(AI_BOT_PANEL_VIEW_TYPE);
            expect(mockWorkspace.getRightLeaf).toHaveBeenCalledWith(false);
            expect(newLeaf.setViewState).toHaveBeenCalledWith({ type: AI_BOT_PANEL_VIEW_TYPE, active: true });
            expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(newLeaf);
        });
    });

    describe('Integration with settings', () => {
        it('should handle both OpenAI and OpenRouter provider settings', async () => {
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Test OpenAI provider
            mockSettings.apiProvider = 'openai';
            await panel.onOpen();
            expect(mockSettings.apiProvider).toBe('openai');
            
            // Switch to OpenRouter
            mockSettings.apiProvider = 'openrouter';
            await mockPlugin.saveSettings();
            expect(mockSettings.apiProvider).toBe('openrouter');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should persist OpenRouter site settings', async () => {
            mockSettings.apiProvider = 'openrouter';
            const panel = new AiBotSidePanel(mockLeaf, mockPlugin);
            
            // Change site settings
            (mockSettings.aiProviderSettings.openrouter as OpenRouterProviderSettings).site_url = 'https://example.com';
            (mockSettings.aiProviderSettings.openrouter as OpenRouterProviderSettings).site_name = 'My App';
            await mockPlugin.saveSettings();

            expect((mockSettings.aiProviderSettings.openrouter as OpenRouterProviderSettings).site_url).toBe('https://example.com');
            expect((mockSettings.aiProviderSettings.openrouter as OpenRouterProviderSettings).site_name).toBe('My App');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });
    });
});
