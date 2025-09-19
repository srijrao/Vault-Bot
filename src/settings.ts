import { App, Plugin, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import { resolveAiCallsDir } from './recorder';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from './aiprovider';
import type { AIProviderSettings } from './providers';
import { AIProviderWrapper } from './aiprovider';
import { zipOldAiCalls } from './archiveCalls';
import { renderModelSettingsSection, type PluginLike } from './ui/model_settings_shared';
import { renderCoreConfigSection } from './ui/ai_bot_config_shared';
import { renderNoteExclusionsSettings } from './services/content_retrieval';
import { openChatView } from './chat/chat_view';

export interface VaultBotPluginSettings {
	apiProvider: string;
	chatSeparator: string;
	aiProviderSettings: Record<string, AIProviderSettings>;
	recordApiCalls: boolean;
	includeDatetime?: boolean;
	includeCurrentNote?: boolean;
	includeOpenNotes?: boolean;
	includeLinkedNotes?: boolean;
	extractNotesInReadingView?: boolean;
	includeLinksInRenderedHTML?: boolean;
	linkRecursionDepth?: number;
	noteExclusionsLevel1?: string[];
	noteExclusionsDeepLink?: string[];
	chatDefaultSaveLocation?: string;
	chatAutoSaveNotes?: boolean;
	uiState?: {
		collapsedSections?: Record<string, boolean>;
	};
}

export const DEFAULT_SETTINGS: VaultBotPluginSettings = {
	apiProvider: 'openai',
	chatSeparator: '\n\n----\n\n',
	recordApiCalls: true,
	includeDatetime: true,
	includeCurrentNote: true,
	includeOpenNotes: false,
	includeLinkedNotes: true,
	extractNotesInReadingView: false,
	includeLinksInRenderedHTML: false,
	linkRecursionDepth: 1,
	noteExclusionsLevel1: [],
	noteExclusionsDeepLink: [],
	chatDefaultSaveLocation: "",
	chatAutoSaveNotes: false,
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
	uiState: {
		collapsedSections: {}
	}
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

		   // Main header for the plugin settings
		   containerEl.createEl('h1', { text: 'Vault Bot' });

		const saver = async () => { this.debouncedSave(); };
		
		// Create separate containers for each shared section
		const coreConfigContainer = containerEl.createDiv();
		const modelSettingsContainer = containerEl.createDiv();
		
		// Render shared core configuration section
		renderCoreConfigSection(coreConfigContainer, this.plugin as unknown as PluginLike, saver, () => {
			openChatView(this.plugin as any);
		});
		
		// Render shared model settings section
		renderModelSettingsSection(modelSettingsContainer, this.plugin as unknown as PluginLike, saver);

		// Create separate container for note exclusions settings
		const noteExclusionsContainer = containerEl.createDiv();
		
		// Render note exclusions settings
		renderNoteExclusionsSettings(noteExclusionsContainer, this.plugin as unknown as PluginLike, saver);

		// Settings-specific: API Key test button (add after the shared API key field)
		new Setting(containerEl)
			.setName('Test API Key')
			.setDesc('Verify that your API key is valid and working.')
			.addButton(button => {
				button
					.setButtonText('Test API Key')
					.setTooltip('Test if the API key is valid')
					.onClick(async () => {
						await this.testApiKey();
					});
			});

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
		const allProviders = Object.keys(this.plugin.settings.aiProviderSettings);
		const providersWithKeys = allProviders.filter(provider => 
			this.plugin.settings.aiProviderSettings[provider]?.api_key
		);
		
		if (providersWithKeys.length === 0) {
			new Notice('Please enter at least one API key first');
			return;
		}

		new Notice(`Testing ${providersWithKeys.length} API key(s)...`);
		
		const results: Array<{provider: string, valid: boolean, error?: string}> = [];
		
		for (const provider of providersWithKeys) {
			try {
				// Create a temporary settings object with the provider we want to test
				const tempSettings = {
					...this.plugin.settings,
					apiProvider: provider
				};
				
				const providerWrapper = new AIProviderWrapper(tempSettings);
				const result = await providerWrapper.validateApiKey();
				
				results.push({
					provider,
					valid: result.valid,
					error: result.error
				});
			} catch (error: any) {
				console.error(`Error testing ${provider} API key:`, error);
				results.push({
					provider,
					valid: false,
					error: error.message
				});
			}
		}
		
		// Show results
		const validKeys = results.filter(r => r.valid);
		const invalidKeys = results.filter(r => !r.valid);
		
		if (invalidKeys.length === 0) {
			new Notice(`✅ All ${validKeys.length} API key(s) are valid!`);
		} else {
			const validProviders = validKeys.map(r => r.provider).join(', ');
			const invalidProviders = invalidKeys.map(r => `${r.provider} (${r.error})`).join(', ');
			
			let message = '';
			if (validKeys.length > 0) {
				message += `✅ Valid: ${validProviders}. `;
			}
			message += `❌ Invalid: ${invalidProviders}`;
			
			new Notice(message, 8000); // Show for 8 seconds for longer messages
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


