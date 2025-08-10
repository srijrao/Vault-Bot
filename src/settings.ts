import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { AIProviderSettings, OpenAIProviderSettings } from './aiprovider';

export interface VaultBotPluginSettings {
	apiKey: string;
	apiProvider: string;
	chatSeparator: string;
	aiProviderSettings: Record<string, AIProviderSettings>;
}

export const DEFAULT_SETTINGS: VaultBotPluginSettings = {
	apiKey: '',
	apiProvider: 'openai',
	chatSeparator: '\n\n----\n\n',
	aiProviderSettings: {
		openai: {
			model: "gpt-4o",
			system_prompt: "You are a helpful assistant.",
			temperature: 1.0,
		} as OpenAIProviderSettings
	},
}

export class VaultBotSettingTab extends PluginSettingTab {
	plugin: Plugin & { settings: VaultBotPluginSettings, saveSettings: () => Promise<void> };
	private saveTimeout: NodeJS.Timeout | null = null;

	constructor(app: App, plugin: Plugin & { settings: VaultBotPluginSettings, saveSettings: () => Promise<void> }) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private debouncedSave() {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(async () => {
			await this.plugin.saveSettings();
			this.saveTimeout = null;
		}, 500); // Save after 500ms of no changes
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your API key for the selected AI provider.')
			.addText(text => {
				text
					.setPlaceholder('Enter your API key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						this.debouncedSave();
					});
				text.inputEl.type = 'password';
			});

		new Setting(containerEl)
			.setName('Chat Separator')
			.setDesc('The separator used to distinguish between messages in a chat.')
			.addText(text => text
				.setPlaceholder('e.g. ---')
				.setValue(this.plugin.settings.chatSeparator)
				.onChange(async (value) => {
					this.plugin.settings.chatSeparator = value;
					this.debouncedSave();
				}));

		containerEl.createEl('h2', { text: 'OpenAI Provider Settings' });

		// Ensure the settings object for openai exists.
		if (!this.plugin.settings.aiProviderSettings.openai) {
			this.plugin.settings.aiProviderSettings.openai = {
				model: "gpt-4o",
				system_prompt: "You are a helpful assistant.",
				temperature: 1.0,
			};
		}
		const openaiSettings = this.plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings;

		new Setting(containerEl)
			.setName('Model')
			.setDesc('The model to use for generating responses.')
			.addText(text => text
				.setPlaceholder('e.g. gpt-3.5-turbo')
				.setValue(openaiSettings.model)
				.onChange(async (value) => {
					openaiSettings.model = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('The system prompt to use for the AI.')
			.addTextArea(text => text
				.setPlaceholder('You are a helpful assistant.')
				.setValue(openaiSettings.system_prompt)
				.onChange(async (value) => {
					openaiSettings.system_prompt = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.')
			.addSlider(slider => slider
				.setLimits(0, 2, 0.1)
				.setValue(openaiSettings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					openaiSettings.temperature = value;
					this.debouncedSave();
				}));
	}
}
