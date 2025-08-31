import { Setting } from 'obsidian';
import type { VaultBotPluginSettings } from '../settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../aiprovider';

// A minimal "plugin-like" contract used by both Settings tab and Side Panel
export type PluginLike = {
  settings: VaultBotPluginSettings;
  saveSettings: () => Promise<void> | void;
};

// Renders the shared Provider selector. Caller should pass a reRender function
// that clears and rebuilds the section so provider-specific controls refresh.
export function renderProviderSelector(
  container: HTMLElement,
  plugin: PluginLike,
  reRender: () => void,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Provider')
    .setDesc('Select the AI provider')
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

// Render provider-specific model settings (model, system prompt, temperature, etc.).
export function renderProviderSpecificSettings(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  ensureProviderDefaults(plugin.settings);

  if (plugin.settings.apiProvider === 'openai') {
    const openai = plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings;

    new Setting(container)
      .setName('Model')
      .setDesc('The OpenAI model to use for generating responses')
      .addText((text) => {
        text
          .setPlaceholder('e.g. gpt-4o')
          .setValue(openai.model)
          .onChange(async (value) => {
            openai.model = value;
            await save();
          });
        return text;
      });

    new Setting(container)
      .setName('System Prompt')
      .setDesc('The system prompt that defines the AI assistant behavior')
      .addTextArea((text) => {
        text
          .setPlaceholder('You are a helpful assistant...')
          .setValue(openai.system_prompt)
          .onChange(async (value) => {
            openai.system_prompt = value;
            await save();
          });
        const anyInput: any = (text as any).inputEl;
        if (anyInput) {
          if (typeof anyInput.rows !== 'undefined') anyInput.rows = 4;
          if (anyInput.style) anyInput.style.width = '100%';
        }
        return text;
      });

    new Setting(container)
      .setName('Temperature')
      .setDesc('Controls randomness: 0 = focused, 2 = creative')
      .addSlider((slider) => {
        slider
          .setLimits(0, 2, 0.1)
          .setValue(openai.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            openai.temperature = value;
            await save();
          });
        return slider;
      });
  } else if (plugin.settings.apiProvider === 'openrouter') {
    const or = plugin.settings.aiProviderSettings.openrouter as OpenRouterProviderSettings;

    new Setting(container)
      .setName('Model')
      .setDesc('The model to use (format: provider/model)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. openai/gpt-4o')
          .setValue(or.model)
          .onChange(async (value) => {
            or.model = value;
            await save();
          });
        return text;
      });

    new Setting(container)
      .setName('System Prompt')
      .setDesc('The system prompt that defines the AI assistant behavior')
      .addTextArea((text) => {
        text
          .setPlaceholder('You are a helpful assistant...')
          .setValue(or.system_prompt)
          .onChange(async (value) => {
            or.system_prompt = value;
            await save();
          });
        const anyInput: any = (text as any).inputEl;
        if (anyInput) {
          if (typeof anyInput.rows !== 'undefined') anyInput.rows = 4;
          if (anyInput.style) anyInput.style.width = '100%';
        }
        return text;
      });

    new Setting(container)
      .setName('Temperature')
      .setDesc('Controls randomness: 0 = focused, 2 = creative')
      .addSlider((slider) => {
        slider
          .setLimits(0, 2, 0.1)
          .setValue(or.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            or.temperature = value;
            await save();
          });
        return slider;
      });

    new Setting(container)
      .setName('Site URL (Optional)')
      .setDesc('Your site URL for OpenRouter analytics')
      .addText((text) => {
        text
          .setPlaceholder('https://yoursite.com')
          .setValue(or.site_url || '')
          .onChange(async (value) => {
            or.site_url = value;
            await save();
          });
        return text;
      });

    new Setting(container)
      .setName('Site Name (Optional)')
      .setDesc('Your site name for OpenRouter analytics')
      .addText((text) => {
        text
          .setPlaceholder('Your App Name')
          .setValue(or.site_name || '')
          .onChange(async (value) => {
            or.site_name = value;
            await save();
          });
        return text;
      });
  }
}

// Render the complete Model Settings section (with header + provider selector + fields).
// This function manages its own re-render cycle so both Settings and Side Panel can
// import and display identical UI with a single call.
export function renderModelSettingsSection(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  const reRender = () => {
    container.empty();
    container.createEl('h2', { text: 'AI Bot Model Settings' });
    renderProviderSelector(container, plugin, reRender, save);
    renderProviderSpecificSettings(container, plugin, save);
  };
  reRender();
}
