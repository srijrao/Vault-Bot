import { ItemView, WorkspaceLeaf, Setting } from 'obsidian';
import VaultBotPlugin from '../main';
import type { VaultBotPluginSettings } from './settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from './aiprovider';

export const AI_BOT_PANEL_VIEW_TYPE = 'ai-bot-panel';

export class AiBotSidePanel extends ItemView {
    plugin: VaultBotPlugin;
    settings: VaultBotPluginSettings;

    constructor(leaf: WorkspaceLeaf, plugin: VaultBotPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.settings = plugin.settings;
    }

    getViewType() {
        return AI_BOT_PANEL_VIEW_TYPE;
    }

    getDisplayText() {
        return 'AI Bot Settings';
    }

    getIcon() {
        return 'bot';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.createEl('h2', { text: 'AI Bot Model Settings' });

        this.renderModelSettings(container);
    }

    private renderModelSettings(container: HTMLElement) {
        // API Provider Selection
        new Setting(container)
            .setName('Provider')
            .setDesc('Select the AI provider to use')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('openai', 'OpenAI')
                    .addOption('openrouter', 'OpenRouter')
                    .setValue(this.settings.apiProvider)
                    .onChange(async (value) => {
                        this.settings.apiProvider = value;
                        await this.plugin.saveSettings();
                        // Refresh the panel to show provider-specific settings
                        container.empty();
                        container.createEl('h2', { text: 'AI Bot Model Settings' });
                        this.renderModelSettings(container);
                    });
            });

        // Provider-specific settings
        if (this.settings.apiProvider === 'openai') {
            this.renderOpenAISettings(container);
        } else if (this.settings.apiProvider === 'openrouter') {
            this.renderOpenRouterSettings(container);
        }
    }

    private renderOpenAISettings(container: HTMLElement) {
        const openaiSettings = this.settings.aiProviderSettings.openai as OpenAIProviderSettings;
        
        if (!openaiSettings) {
            return;
        }

        container.createEl('h3', { text: 'OpenAI Settings' });

        // Model
        new Setting(container)
            .setName('Model')
            .setDesc('The OpenAI model to use for generating responses')
            .addText(text => text
                .setPlaceholder('e.g. gpt-4o, gpt-3.5-turbo')
                .setValue(openaiSettings.model)
                .onChange(async (value) => {
                    openaiSettings.model = value;
                    await this.plugin.saveSettings();
                }));

        // System Prompt
        new Setting(container)
            .setName('System Prompt')
            .setDesc('The system prompt that defines the AI assistant behavior')
            .addTextArea(text => {
                text
                    .setPlaceholder('You are a helpful assistant...')
                    .setValue(openaiSettings.system_prompt)
                    .onChange(async (value) => {
                        openaiSettings.system_prompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Temperature
        new Setting(container)
            .setName('Temperature')
            .setDesc('Controls randomness: 0 = focused, 2 = creative')
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(openaiSettings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    openaiSettings.temperature = value;
                    await this.plugin.saveSettings();
                }));
    }

    private renderOpenRouterSettings(container: HTMLElement) {
        const openrouterSettings = this.settings.aiProviderSettings.openrouter as OpenRouterProviderSettings;
        
        if (!openrouterSettings) {
            return;
        }

        container.createEl('h3', { text: 'OpenRouter Settings' });

        // Model
        new Setting(container)
            .setName('Model')
            .setDesc('The model to use (format: provider/model)')
            .addText(text => text
                .setPlaceholder('e.g. openai/gpt-4o, anthropic/claude-3')
                .setValue(openrouterSettings.model)
                .onChange(async (value) => {
                    openrouterSettings.model = value;
                    await this.plugin.saveSettings();
                }));

        // System Prompt
        new Setting(container)
            .setName('System Prompt')
            .setDesc('The system prompt that defines the AI assistant behavior')
            .addTextArea(text => {
                text
                    .setPlaceholder('You are a helpful assistant...')
                    .setValue(openrouterSettings.system_prompt)
                    .onChange(async (value) => {
                        openrouterSettings.system_prompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Temperature
        new Setting(container)
            .setName('Temperature')
            .setDesc('Controls randomness: 0 = focused, 2 = creative')
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(openrouterSettings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    openrouterSettings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        // Site URL
        new Setting(container)
            .setName('Site URL')
            .setDesc('Your site URL for OpenRouter analytics (optional)')
            .addText(text => text
                .setPlaceholder('https://yoursite.com')
                .setValue(openrouterSettings.site_url || '')
                .onChange(async (value) => {
                    openrouterSettings.site_url = value;
                    await this.plugin.saveSettings();
                }));

        // Site Name
        new Setting(container)
            .setName('Site Name')
            .setDesc('Your site name for OpenRouter analytics (optional)')
            .addText(text => text
                .setPlaceholder('Your App Name')
                .setValue(openrouterSettings.site_name || '')
                .onChange(async (value) => {
                    openrouterSettings.site_name = value;
                    await this.plugin.saveSettings();
                }));
    }

    async onClose() {
        // Nothing to clean up
    }
}

export function openAiBotSidePanel(plugin: VaultBotPlugin) {
    const { workspace } = plugin.app;
    
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(AI_BOT_PANEL_VIEW_TYPE);
    
    if (leaves.length > 0) {
        // Panel already exists, activate it
        leaf = leaves[0];
    } else {
        // Create new panel in right sidebar
        leaf = workspace.getRightLeaf(false);
        leaf?.setViewState({ type: AI_BOT_PANEL_VIEW_TYPE, active: true });
    }
    
    if (leaf) {
        workspace.revealLeaf(leaf);
    }
}
