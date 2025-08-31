import { App, Modal, Setting, Notice, Plugin } from 'obsidian';
import type { VaultBotPluginSettings } from './settings';
import { renderCoreConfigSection, type PluginLike } from './ui/ai_bot_config_shared';

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

    const saver = async () => { await this.plugin.saveSettings(); };
    
    // Render shared core configuration section
    renderCoreConfigSection(contentEl, this.plugin as unknown as PluginLike, saver);

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