import { Plugin, MarkdownView } from 'obsidian';
import { openAiBotConfigModal } from './src/prompt_modal';
import { AiBotSidePanel, AI_BOT_PANEL_VIEW_TYPE, openAiBotSidePanel } from './src/side_panel';
import { CommandHandler } from './src/command_handler';
import { zipOldAiCalls } from './src/archiveCalls';
import { VaultBotPluginSettings, DEFAULT_SETTINGS, VaultBotSettingTab } from './src/settings';

export default class VaultBotPlugin extends Plugin {
	settings: VaultBotPluginSettings;
	commandHandler: CommandHandler;

	async onload() {
		await this.loadSettings();
		this.commandHandler = new CommandHandler(this);

		// Register the side panel view
		this.registerView(
			AI_BOT_PANEL_VIEW_TYPE,
			(leaf) => new AiBotSidePanel(leaf, this)
		);

		// On startup, sort prior-day AI call logs into date folders (skip today), then solid-compress those folders
		try { await zipOldAiCalls((this as any).app); } catch (err) { console.error('zipOldAiCalls failed:', err); }

		this.addCommand({
			id: 'get-response-below',
			name: 'Get Response Below',
			editorCallback: (editor, view) => {
				if (view instanceof MarkdownView) {
					this.commandHandler.handleGetResponseBelow(editor, view);
				}
			}
		});

		this.addCommand({
			id: 'get-response-above',
			name: 'Get Response Above',
			editorCallback: (editor, view) => {
				if (view instanceof MarkdownView) {
					this.commandHandler.handleGetResponseAbove(editor, view);
				}
			}
		});

		this.addCommand({
		  id: 'stop-response',
		  name: 'Stop Response',
		  checkCallback: (checking) => this.commandHandler.handleStopResponse(checking)
		});

		// Add command to open AI Bot configuration modal
		this.addCommand({
		  id: 'open-ai-bot-config',
		  name: 'Configure AI Bot',
		  callback: () => openAiBotConfigModal(this)
		});

		// Add command to open AI Bot side panel
		this.addCommand({
		  id: 'open-ai-bot-panel',
		  name: 'Open AI Bot Panel',
		  callback: () => openAiBotSidePanel(this)
		});

		// Add ribbon icon for quick access to side panel
		this.addRibbonIcon('bot', 'AI Bot Panel', () => {
			openAiBotSidePanel(this);
		});

		this.addSettingTab(new VaultBotSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.commandHandler.onSettingsChanged();
	}
}

