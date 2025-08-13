import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from './aiprovider';
import type { AIProviderSettings } from './providers';
import { AIProviderWrapper } from './aiprovider';

export interface VaultBotPluginSettings {
	apiProvider: string;
	chatSeparator: string;
	aiProviderSettings: Record<string, AIProviderSettings>;
}

export const DEFAULT_SETTINGS: VaultBotPluginSettings = {
	apiProvider: 'openai',
	chatSeparator: '\n\n----\n\n',
	aiProviderSettings: {
		openai: {
			api_key: '',
			model: "gpt-4o",
			system_prompt: "You are a helpful assistant.",
			temperature: 1.0,
		} as OpenAIProviderSettings,
		openrouter: {
			api_key: '',
			model: "openai/gpt-4o",
			system_prompt: "You are a helpful assistant.",
			temperature: 1.0,
			site_url: "",
			site_name: "Obsidian Vault-Bot",
		} as OpenRouterProviderSettings
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
			.setName('API Provider')
			.setDesc('Select the AI provider to use.')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('openrouter', 'OpenRouter')
				.setValue(this.plugin.settings.apiProvider)
				.onChange(async (value) => {
					this.plugin.settings.apiProvider = value;
					this.debouncedSave();
					this.display(); // Refresh the settings to show provider-specific options
				}));

		new Setting(containerEl)
			.setName('API Key')
			.setDesc(`Your API key for ${this.plugin.settings.apiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'}.`)
			.addText(text => {
				const currentProvider = this.plugin.settings.apiProvider;
				const currentSettings = this.plugin.settings.aiProviderSettings[currentProvider];
				text
					.setPlaceholder('Enter your API key')
					.setValue(currentSettings?.api_key || '')
					.onChange(async (value) => {
						if (currentSettings) {
							currentSettings.api_key = value;
							this.debouncedSave();
						}
					});
				text.inputEl.type = 'password';
			})
			.addButton(button => {
				button
					.setButtonText('Test API Key')
					.setTooltip('Test if the API key is valid')
					.onClick(async () => {
						await this.testApiKey();
					});
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

		// Show provider-specific settings
		if (this.plugin.settings.apiProvider === 'openai') {
			this.displayOpenAISettings(containerEl);
		} else if (this.plugin.settings.apiProvider === 'openrouter') {
			this.displayOpenRouterSettings(containerEl);
		}
	}

	private displayOpenAISettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'OpenAI Provider Settings' });

		// Ensure the settings object for openai exists.
		if (!this.plugin.settings.aiProviderSettings.openai) {
			this.plugin.settings.aiProviderSettings.openai = {
				api_key: '',
				model: "gpt-4o",
				system_prompt: "You are a helpful assistant.",
				temperature: 1.0,
			} as OpenAIProviderSettings;
		}
		const openaiSettings = this.plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings;

		new Setting(containerEl)
			.setName('Model')
			.setDesc('The model to use for generating responses.')
			.addText(text => text
				.setPlaceholder('e.g. gpt-4o')
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

	private displayOpenRouterSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'OpenRouter Provider Settings' });

		// Ensure the settings object for openrouter exists.
		if (!this.plugin.settings.aiProviderSettings.openrouter) {
			this.plugin.settings.aiProviderSettings.openrouter = {
				api_key: '',
				model: "openai/gpt-4o",
				system_prompt: "You are a helpful assistant.",
				temperature: 1.0,
				site_url: "",
				site_name: "Obsidian Vault-Bot",
			} as OpenRouterProviderSettings;
		}
		const openrouterSettings = this.plugin.settings.aiProviderSettings.openrouter as OpenRouterProviderSettings;

		new Setting(containerEl)
			.setName('Model')
			.setDesc('The model to use for generating responses. Use format: provider/model (e.g., openai/gpt-4o)')
			.addText(text => text
				.setPlaceholder('e.g. openai/gpt-4o')
				.setValue(openrouterSettings.model)
				.onChange(async (value) => {
					openrouterSettings.model = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('The system prompt to use for the AI.')
			.addTextArea(text => text
				.setPlaceholder('You are a helpful assistant.')
				.setValue(openrouterSettings.system_prompt)
				.onChange(async (value) => {
					openrouterSettings.system_prompt = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.')
			.addSlider(slider => slider
				.setLimits(0, 2, 0.1)
				.setValue(openrouterSettings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					openrouterSettings.temperature = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Site URL (Optional)')
			.setDesc('Your site URL for OpenRouter analytics.')
			.addText(text => text
				.setPlaceholder('https://yoursite.com')
				.setValue(openrouterSettings.site_url || '')
				.onChange(async (value) => {
					openrouterSettings.site_url = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Site Name (Optional)')
			.setDesc('Your site name for OpenRouter analytics.')
			.addText(text => text
				.setPlaceholder('Your App Name')
				.setValue(openrouterSettings.site_name || '')
				.onChange(async (value) => {
					openrouterSettings.site_name = value;
					this.debouncedSave();
				}));
	}

	private async testApiKey(): Promise<void> {
		const currentProvider = this.plugin.settings.apiProvider;
		const currentSettings = this.plugin.settings.aiProviderSettings[currentProvider];
		
		if (!currentSettings?.api_key) {
			new Notice('Please enter an API key first');
			return;
		}

		new Notice('Testing API key...');
		
		try {
			const providerWrapper = new AIProviderWrapper(this.plugin.settings);
			const result = await providerWrapper.validateApiKey();
			
			if (result.valid) {
				new Notice('✅ API key is valid!');
			} else {
				new Notice(`❌ API key validation failed: ${result.error}`);
			}
		} catch (error: any) {
			console.error('Error testing API key:', error);
			new Notice(`❌ Error testing API key: ${error.message}`);
		}
	}
}
