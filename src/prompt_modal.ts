import { App, Modal, Setting, Notice, Plugin } from 'obsidian';
import type { VaultBotPluginSettings } from './settings';

/**
 * Plugin interface with settings and saveSettings, compatible with VaultBotPlugin.
 */
type PluginWithSettings = Plugin & {
  settings: VaultBotPluginSettings;
  saveSettings: () => Promise<void>;
};

export class AiBotConfigModal extends Modal {
  plugin: PluginWithSettings;
  settings: VaultBotPluginSettings;

  constructor(app: App, plugin: PluginWithSettings) {
    super(app);
    this.plugin = plugin;
    this.settings = plugin.settings;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Configure AI Bot' });

    // API Provider
    new Setting(contentEl)
      .setName('API Provider')
      .setDesc('Select the AI provider to use.')
      .addDropdown(dropdown => {
        dropdown
          .addOption('openai', 'OpenAI')
          .addOption('openrouter', 'OpenRouter')
          .setValue(this.settings.apiProvider)
          .onChange(async (value) => {
            this.settings.apiProvider = value;
            await this.plugin.saveSettings();
          });
      });

    // API Key
    new Setting(contentEl)
      .setName('API Key')
      .setDesc(`Your API key for ${this.settings.apiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'}.`)
      .addText(text => {
        text
          .setPlaceholder('Enter your API key')
          .setValue(this.settings.aiProviderSettings[this.settings.apiProvider]?.api_key || '')
          .onChange(async (value) => {
            this.settings.aiProviderSettings[this.settings.apiProvider].api_key = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    // Record chat AI calls
    new Setting(contentEl)
      .setName('Record chat AI calls')
      .setDesc('May record sensitive chat content.')
      .addToggle(toggle =>
        toggle
          .setValue(this.settings.recordApiCalls)
          .onChange(async (value) => {
            this.settings.recordApiCalls = value;
            await this.plugin.saveSettings();
          })
      );

    // Chat Separator
    new Setting(contentEl)
      .setName('Chat Separator')
      .setDesc('Separator used between chat messages.')
      .addText(text =>
        text
          .setPlaceholder('e.g. ----')
          .setValue(this.settings.chatSeparator)
          .onChange(async (value) => {
            this.settings.chatSeparator = value;
            await this.plugin.saveSettings();
          })
      );

    // Close Button
    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Close')
          .setCta()
          .onClick(() => this.close())
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Opens the shared AI Bot configuration modal.
 */
export function openAiBotConfigModal(plugin: PluginWithSettings) {
  new AiBotConfigModal(plugin.app, plugin).open();
}