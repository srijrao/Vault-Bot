import { Plugin, MarkdownView } from 'obsidian';
import { openAiBotConfigModal } from './src/prompt_modal';
import { AiBotSidePanel, AI_BOT_PANEL_VIEW_TYPE, openAiBotSidePanel } from './src/side_panel';
import { ChatView, CHAT_VIEW_TYPE, openChatView } from './src/chat/chat_view';
import { loadChatFromNote } from './src/chat/note_loader';
import { CommandHandler } from './src/command_handler';
import { zipOldAiCalls } from './src/archiveCalls';
import { VaultBotPluginSettings, DEFAULT_SETTINGS, VaultBotSettingTab } from './src/settings';
import { initDebugMode } from './src/utils/debug';
import { needsMigration, migrateToHistoryStructure, createPreMigrationBackup } from './src/migration';

export default class VaultBotPlugin extends Plugin {
	settings: VaultBotPluginSettings;
	commandHandler: CommandHandler;

	async onload() {
		await this.loadSettings();
		
		// Check for migration needs and perform migration if necessary
		await this.performMigrationIfNeeded();
		
		this.commandHandler = new CommandHandler(this);

		// Register the side panel view
		this.registerView(
			AI_BOT_PANEL_VIEW_TYPE,
			(leaf) => new AiBotSidePanel(leaf, this)
		);

		// Register the chat view
		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf) => new ChatView(leaf, this)
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

		// Add command to open AI Chat view
		this.addCommand({
		  id: 'open-ai-chat',
		  name: 'Open AI Chat',
		  callback: () => openChatView(this)
		});

		// Add command to load chat from note
		this.addCommand({
		  id: 'load-chat-from-note',
		  name: 'Load Chat from Note',
		  callback: async () => {
			const conversation = await loadChatFromNote(this.app, this.settings);
			if (conversation) {
			  // Open chat view and load the conversation
			  await openChatView(this);
			  // We'll need to pass the conversation to the chat view
			  // For now, just open the chat view - we can enhance this later
			}
		  }
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
		initDebugMode(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		initDebugMode(this.settings);
		this.commandHandler.onSettingsChanged();
		
		// Refresh chat view if it's open
		const chatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (chatLeaves.length > 0) {
			const chatView = chatLeaves[0].view as ChatView;
			chatView.refreshModelInfo();
		}
	}

	/**
	 * Checks if migration from old file structure to new history structure is needed
	 * and performs the migration automatically with backup
	 */
	async performMigrationIfNeeded() {
		try {
			const migrationContext = { vault: this.app.vault };
			
			if (await needsMigration(migrationContext)) {
				console.log('Vault-Bot: Migration to history structure needed, starting migration...');
				
				// Create backup before migration
				const backupPath = await createPreMigrationBackup(migrationContext);
				if (backupPath) {
					console.log(`Vault-Bot: Backup created at ${backupPath}`);
				}
				
				// Perform migration
				await migrateToHistoryStructure(migrationContext);
				
				console.log('Vault-Bot: Migration completed successfully');
				
				// Show notice to user
				new (this.app as any).Notice('Vault-Bot: Successfully migrated data to new history structure');
			}
		} catch (error) {
			console.error('Vault-Bot: Migration failed:', error);
			new (this.app as any).Notice(`Vault-Bot: Migration failed - ${error.message}`, 5000);
		}
	}
}

