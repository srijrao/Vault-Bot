import { Plugin, MarkdownView } from 'obsidian';
import { CommandHandler } from './src/command_handler';
import { VaultBotPluginSettings, DEFAULT_SETTINGS, VaultBotSettingTab } from './src/settings';

export default class VaultBotPlugin extends Plugin {
	settings: VaultBotPluginSettings;
	commandHandler: CommandHandler;

	async onload() {
		await this.loadSettings();
		this.commandHandler = new CommandHandler(this);

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

