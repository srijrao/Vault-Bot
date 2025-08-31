import { App, Plugin, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import { openAiBotConfigModal } from './prompt_modal';
import { resolveAiCallsDir } from './recorder';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from './aiprovider';
import type { AIProviderSettings } from './providers';
import { AIProviderWrapper } from './aiprovider';
import { zipOldAiCalls } from './archiveCalls';
import { renderModelSettingsSection, type PluginLike } from './ui/model_settings_shared';

export interface VaultBotPluginSettings {
	apiProvider: string;
	chatSeparator: string;
	aiProviderSettings: Record<string, AIProviderSettings>;
	recordApiCalls: boolean;
}

export const DEFAULT_SETTINGS: VaultBotPluginSettings = {
	apiProvider: 'openai',
	chatSeparator: '\n\n----\n\n',
	recordApiCalls: true,
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
	private lastRecordingError: string | null = null;

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

		   // Button to open shared AI Bot configuration modal
		   new Setting(containerEl)
			   .setName('Configure AI Bot')
			   .setDesc('Open the shared AI Bot configuration modal')
			   .addButton(btn => btn
				   .setButtonText('Open Modal')
				   .setCta()
				   .onClick(() => openAiBotConfigModal(this.plugin))
			   );

		const saver = async () => { this.debouncedSave(); };
		renderModelSettingsSection(containerEl, this.plugin as unknown as PluginLike, saver);

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
			.setName('Record chat AI calls')
			.setDesc('May record sensitive chat content. Do not enable if you store private data you do not want on disk.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.recordApiCalls)
				.onChange(async (value) => {
					this.plugin.settings.recordApiCalls = value;
					this.debouncedSave();
				}))

		new Setting(containerEl)
			.setName('AI call records folder')
			.setDesc(this.lastRecordingError ? `Recording errors detected: ${this.lastRecordingError}` : 'Open or clear recorded calls')
			.addButton(btn => btn
				.setButtonText('Open Folder')
				.onClick(async () => {
					try {
						const dir = resolveAiCallsDir((this as any).app);
						await fs.promises.mkdir(dir, { recursive: true });
						// Use robust openFolder which tries Electron, Obsidian API, then OS shell
						await this.openFolder(dir);
						new Notice(`Opened AI calls folder: ${dir}`);
					} catch (e: any) {
						this.lastRecordingError = e?.message || 'Open failed';
						this.display();
					}
				}))
			.addButton(btn => {
				btn.setButtonText('Clear Files');
				// Mark as destructive if API supports it; tolerate mocks without setWarning
				( (btn as any).setWarning?.(true) );
				btn.setTooltip('Deletes recorded AI call text files, with an option to also delete archives (.7z). Date folders are not removed.');
				btn.onClick(async () => {
					try {
						const mode = await confirmDeletionMode(this.app);
						if (!mode) { new Notice('Clear canceled'); return; }

						const dir = resolveAiCallsDir((this as any).app);
						const entries = await fs.promises.readdir(dir).catch(() => [] as string[]);
						let removed = 0;
						for (const name of entries) {
							const isTxt = name.endsWith('.txt') || name.includes('vault-bot-');
							const isArchive = name.endsWith('.7z');
							const isDateFolder = /^\d{4}-\d{2}-\d{2}$/.test(name);
							if (mode === 'txt' && isTxt) {
								await fs.promises.unlink(path.join(dir, name)).catch(() => {});
								removed++;
							} else if (mode === 'archives' && (isTxt || isArchive)) {
								await fs.promises.unlink(path.join(dir, name)).catch(() => {});
								removed++;
							} else if (mode === 'everything') {
								if (isTxt || isArchive) {
									await fs.promises.unlink(path.join(dir, name)).catch(() => {});
									removed++;
								}
							}
						}
						// If 'everything', remove date folders too (exclude today)
						if (mode === 'everything') {
							const todayKey = new Date();
							const pad = (n: number) => String(n).padStart(2, '0');
							const todayFolder = `${todayKey.getFullYear()}-${pad(todayKey.getMonth() + 1)}-${pad(todayKey.getDate())}`;
							for (const name of entries) {
								if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name !== todayFolder) {
									await fs.promises.rm(path.join(dir, name), { recursive: true, force: true }).catch(() => {});
								}
							}
						}
						new Notice(`Removed ${removed} file(s) (${mode === 'everything' ? '.txt + archives + folders' : mode === 'archives' ? '.txt + archives' : '.txt only'})`);
					} catch (e: any) {
						this.lastRecordingError = e?.message || 'Clear failed';
						this.display();
					}
				});
			})

		new Setting(containerEl)
			.setName('Archive AI calls now')
			.setDesc('Sort prior-day files into date folders and solid-compress them')
			.addButton(btn => btn
				.setButtonText('Compress Now')
				.setTooltip('Sorts previous days into folders and creates solid .7z archives')
				.onClick(async () => {
					try {
						await zipOldAiCalls((this as any).app);
					} catch (e) {
						console.error('Manual archive failed', e);
					}
				}));

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

		// Model settings section is already rendered above via shared section
	}

	/**
	 * Open a folder in the user's OS file explorer in a cross-platform way.
	 */
	private openFolder(dir: string): Promise<void> {
		return (async () => {
			const target = path.resolve(dir);

			// On Windows, avoid Obsidian's openWithDefaultApp to prevent duplicated path bug
			if (process.platform !== 'win32') {
				try {
					const anyApp = (this.app as any);
					if (typeof anyApp.openWithDefaultApp === 'function') {
						await anyApp.openWithDefaultApp(target);
						return;
					}
				} catch {}
			}

			// Try Electron shell
			try {
				const electron = (window as any)?.require?.('electron');
				if (electron?.shell) {
					// If there is a file in the folder, show it in the folder view (often more reliable on Windows)
					try {
						const files = await fs.promises.readdir(target);
						const first = files?.[0];
						if (first && typeof electron.shell.showItemInFolder === 'function') {
							electron.shell.showItemInFolder(path.join(target, first));
							return;
						}
					} catch {}
					if (typeof electron.shell.openPath === 'function') {
						const errMsg: string = await electron.shell.openPath(target);
						if (!errMsg) return; // success when empty string
					}
				}
			} catch {}

			// OS-specific fallback using spawn to avoid shell quoting issues
			await new Promise<void>(async (resolve, reject) => {
				let child;
				if (process.platform === 'win32') {
					// Prefer selecting an item to avoid odd parsing; if empty, open folder
					let args: string[] = [];
					try {
						const files = await fs.promises.readdir(target);
						if (files && files.length > 0) {
							args = ['/select,', path.join(target, files[0])];
						} else {
							args = [target];
						}
					} catch {
						args = [target];
					}
					child = spawn('explorer.exe', args, { shell: false });
				} else if (process.platform === 'darwin') {
					child = spawn('open', [target], { shell: false });
				} else {
					child = spawn('xdg-open', [target], { shell: false });
				}
				child.on('error', (err) => reject(err));
				child.on('close', (code) => {
					if (code === 0 || code === null) return resolve();
					if (process.platform === 'win32') {
						// Last-chance: open parent in Explorer
						const parent = path.dirname(target);
						const p = spawn('explorer.exe', [parent], { shell: false });
						p.on('error', (e2) => reject(e2));
						p.on('close', (code2) => code2 === 0 ? resolve() : reject(new Error('Failed to open folder')));
						return;
					}
					reject(new Error('Failed to open folder'));
				});
			});
		})()
	}

	// Removed provider-specific implementations in favor of shared renderer

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

// Simple confirmation modal helper used before destructive actions
class ConfirmClearModal extends Modal {
  private resolver: (value: 'txt' | 'archives' | 'everything' | null) => void;
  constructor(app: App, resolver: (value: 'txt' | 'archives' | 'everything' | null) => void) {
    super(app);
    this.resolver = resolver;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Clear Recorded AI Call Files' });
    contentEl.createEl('p', { text: 'Choose what to delete:' });
    const options = contentEl.createDiv({ cls: 'modal-button-container' });
    const btn1 = options.createEl('button', { text: '1. .txt files only' });
    const btn2 = options.createEl('button', { text: '2. .txt + .7z archives' });
    const btn3 = options.createEl('button', { text: '3. .txt + .7z + date folders', cls: 'mod-warning' });
    const cancel = options.createEl('button', { text: 'Cancel' });
    btn1.addEventListener('click', () => { this.resolver('txt'); this.close(); });
    btn2.addEventListener('click', () => { this.resolver('archives'); this.close(); });
    btn3.addEventListener('click', () => { this.resolver('everything'); this.close(); });
    cancel.addEventListener('click', () => { this.resolver(null); this.close(); });
  }
}

// Confirmation helper: ask whether to delete only .txt, or .txt + archives, or everything
function confirmDeletionMode(app: App): Promise<'txt' | 'archives' | 'everything' | null> {
  return new Promise<'txt' | 'archives' | 'everything' | null>((resolve) => {
    const modal = new ConfirmClearModal(app, resolve);
    modal.open();
  });
}


