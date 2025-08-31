import { Setting } from 'obsidian';
import type { VaultBotPluginSettings } from '../settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../aiprovider';

// A minimal "plugin-like" contract used by Settings tab, Side Panel, and Modal
export type PluginLike = {
  settings: VaultBotPluginSettings;
  saveSettings: () => Promise<void> | void;
};

// Ensure defaults exist for provider blocks to avoid undefined access.
function ensureProviderDefaults(settings: VaultBotPluginSettings) {
  if (!settings.aiProviderSettings.openai) {
    settings.aiProviderSettings.openai = {
      api_key: '',
      model: 'gpt-4o',
      system_prompt: 'You are a helpful assistant.',
      temperature: 1.0,
    } as OpenAIProviderSettings;
  }
  if (!settings.aiProviderSettings.openrouter) {
    settings.aiProviderSettings.openrouter = {
      api_key: '',
      model: 'openai/gpt-4o',
      system_prompt: 'You are a helpful assistant.',
      temperature: 1.0,
      site_url: '',
      site_name: 'Obsidian Vault-Bot',
    } as OpenRouterProviderSettings;
  }
}

// Renders the API Provider selector dropdown. Caller should pass a reRender function
// that clears and rebuilds the section so provider-specific controls refresh.
export function renderApiProviderSelector(
  container: HTMLElement,
  plugin: PluginLike,
  reRender: () => void,
  save: (immediate?: boolean) => Promise<void> | void
) {
  ensureProviderDefaults(plugin.settings);
  
  new Setting(container)
    .setName('API Provider')
    .setDesc('Select the AI provider to use.')
    .addDropdown((dropdown) => {
      dropdown
        .addOption('openai', 'OpenAI')
        .addOption('openrouter', 'OpenRouter')
        .setValue(plugin.settings.apiProvider)
        .onChange(async (value) => {
          plugin.settings.apiProvider = value;
          await save(true);
          reRender();
        });
      return dropdown;
    });
}

// Renders the API Key input field for the current provider
export function renderApiKeyField(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  ensureProviderDefaults(plugin.settings);
  
  const currentProvider = plugin.settings.apiProvider;
  const currentSettings = plugin.settings.aiProviderSettings[currentProvider];
  
  new Setting(container)
    .setName('API Key')
    .setDesc(`Your API key for ${currentProvider === 'openai' ? 'OpenAI' : 'OpenRouter'}.`)
    .addText(text => {
      text
        .setPlaceholder('Enter your API key')
        .setValue(currentSettings?.api_key || '')
        .onChange(async (value) => {
          if (currentSettings) {
            currentSettings.api_key = value;
            await save();
          }
        });
      text.inputEl.type = 'password';
      return text;
    });
}

// Renders the Record chat AI calls toggle
export function renderRecordingToggle(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Record chat AI calls')
    .setDesc('May record sensitive chat content. Do not enable if you store private data you do not want on disk.')
    .addToggle(toggle => toggle
      .setValue(plugin.settings.recordApiCalls)
      .onChange(async (value) => {
        plugin.settings.recordApiCalls = value;
        await save();
      }));
}

// Renders the Chat Separator text input field
export function renderChatSeparatorField(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Chat Separator')
    .setDesc('The separator used to distinguish between messages in a chat.')
    .addText(text => text
      .setPlaceholder('e.g. ---')
      .setValue(plugin.settings.chatSeparator)
      .onChange(async (value) => {
        plugin.settings.chatSeparator = value;
        await save();
      }));
}

// Renders the complete Core AI Bot Configuration section (with header + all fields).
// This function manages its own re-render cycle so Settings, Modal, and Side Panel can
// import and display identical UI with a single call.
export function renderCoreConfigSection(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  const reRender = () => {
    container.empty();
    container.createEl('h2', { text: 'AI Bot Configuration' });
    renderApiProviderSelector(container, plugin, reRender, save);
    renderApiKeyField(container, plugin, save);
    renderRecordingToggle(container, plugin, save);
    renderChatSeparatorField(container, plugin, save);
  };
  reRender();
}
