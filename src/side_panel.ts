import { ItemView, WorkspaceLeaf } from 'obsidian';
import VaultBotPlugin from '../main';
import type { VaultBotPluginSettings } from './settings';
import { renderModelSettingsSection } from './ui/model_settings_shared';
import { renderCoreConfigSection } from './ui/ai_bot_config_shared';

export const AI_BOT_PANEL_VIEW_TYPE = 'ai-bot-panel';

export class AiBotSidePanel extends ItemView {
    plugin: VaultBotPlugin;
    settings: VaultBotPluginSettings;

    constructor(leaf: WorkspaceLeaf, plugin: VaultBotPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.settings = plugin.settings;
    }

    getViewType() {
        return AI_BOT_PANEL_VIEW_TYPE;
    }

    getDisplayText() {
        return 'AI Bot Settings';
    }

    getIcon() {
        return 'bot';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        const saver = async () => { await this.plugin.saveSettings(); };
        
        // Render core configuration section
        renderCoreConfigSection(container, this.plugin, saver);
        
        // Render model settings section
        renderModelSettingsSection(container, this.plugin, saver);
    }

    async onClose() {
        // Nothing to clean up
    }
}

export function openAiBotSidePanel(plugin: VaultBotPlugin) {
    const { workspace } = plugin.app;
    
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(AI_BOT_PANEL_VIEW_TYPE);
    
    if (leaves.length > 0) {
        // Panel already exists, activate it
        leaf = leaves[0];
    } else {
        // Create new panel in right sidebar
        leaf = workspace.getRightLeaf(false);
        leaf?.setViewState({ type: AI_BOT_PANEL_VIEW_TYPE, active: true });
    }
    
    if (leaf) {
        workspace.revealLeaf(leaf);
    }
}
