import * as path from 'path';
import * as fs from 'fs/promises';
import { statSafe, ensureDir } from './fs_utils';

export interface MigrationContext {
	vault: {
		adapter: any; // Obsidian's DataAdapter - using any for flexibility
	};
}

/**
 * Checks if migration is needed for a user with existing data
 * Returns true if old structure exists and new structure doesn't
 */
export async function needsMigration(context: MigrationContext): Promise<boolean> {
	try {
		// Get the plugin base directory
		let basePath: string | null = null;
		try {
			basePath = context.vault.adapter.basePath || context.vault.adapter.getBasePath?.() || null;
		} catch {}
		
		if (!basePath || typeof basePath !== 'string') {
			return false; // No valid base path, no migration needed
		}
		
		const pluginDir = path.join(basePath, '.obsidian', 'plugins', 'Vault-Bot');
		const historyDir = path.join(pluginDir, 'history');
		
		// Check if history directory already exists (migration already done)
		const historyStat = await statSafe(historyDir);
		if (historyStat?.isDirectory()) {
			return false; // History directory exists, migration already done
		}
		
		// Check if any old structure files exist
		const oldAiCallsDir = path.join(pluginDir, 'ai-calls');
		const oldChatsDir = path.join(pluginDir, 'chats');
		const oldActiveConv = path.join(pluginDir, 'active_conversation.json');
		
		const aiCallsStat = await statSafe(oldAiCallsDir);
		const chatsStat = await statSafe(oldChatsDir);
		const activeConvStat = await statSafe(oldActiveConv);
		
		// Migration needed if any old structure exists
		return !!(aiCallsStat?.isDirectory()) || 
		       !!(chatsStat?.isDirectory()) || 
		       !!(activeConvStat?.isFile());
		       
	} catch (error) {
		console.warn('Error checking migration needs:', error);
		return false;
	}
}

/**
 * Migrates existing data from old structure to new history-based structure
 */
export async function migrateToHistoryStructure(context: MigrationContext): Promise<void> {
	try {
		// Get the plugin base directory
		let basePath: string | null = null;
		try {
			basePath = context.vault.adapter.basePath || context.vault.adapter.getBasePath?.() || null;
		} catch {}
		
		if (!basePath || typeof basePath !== 'string') {
			throw new Error('Cannot determine vault base path for migration');
		}
		
		const pluginDir = path.join(basePath, '.obsidian', 'plugins', 'Vault-Bot');
		const historyDir = path.join(pluginDir, 'history');
		
		console.log('Starting migration to history structure...');
		
		// Ensure history directory exists
		await ensureDir(historyDir);
		
		// Migrate ai-calls directory
		const oldAiCallsDir = path.join(pluginDir, 'ai-calls');
		const newAiCallsDir = path.join(historyDir, 'ai-calls');
		
		const aiCallsStat = await statSafe(oldAiCallsDir);
		if (aiCallsStat?.isDirectory()) {
			console.log('Migrating ai-calls directory...');
			await migrateDirectory(oldAiCallsDir, newAiCallsDir);
		}
		
		// Migrate chats directory
		const oldChatsDir = path.join(pluginDir, 'chats');
		const newChatsDir = path.join(historyDir, 'chats');
		
		const chatsStat = await statSafe(oldChatsDir);
		if (chatsStat?.isDirectory()) {
			console.log('Migrating chats directory...');
			await migrateDirectory(oldChatsDir, newChatsDir);
		}
		
		// Migrate active_conversation.json
		const oldActiveConv = path.join(pluginDir, 'active_conversation.json');
		const newActiveConv = path.join(historyDir, 'active_conversation.json');
		
		const activeConvStat = await statSafe(oldActiveConv);
		if (activeConvStat?.isFile()) {
			console.log('Migrating active_conversation.json...');
			await fs.copyFile(oldActiveConv, newActiveConv);
			await fs.unlink(oldActiveConv);
		}
		
		console.log('Migration to history structure completed successfully');
		
	} catch (error) {
		console.error('Migration failed:', error);
		throw error;
	}
}

/**
 * Recursively migrates a directory from old location to new location
 */
async function migrateDirectory(oldDir: string, newDir: string): Promise<void> {
	try {
		// Ensure target directory exists
		await ensureDir(newDir);
		
		// Read contents of old directory
		const entries = await fs.readdir(oldDir, { withFileTypes: true });
		
		for (const entry of entries) {
			const oldPath = path.join(oldDir, entry.name);
			const newPath = path.join(newDir, entry.name);
			
			if (entry.isDirectory()) {
				// Recursively migrate subdirectory
				await migrateDirectory(oldPath, newPath);
			} else if (entry.isFile()) {
				// Copy file to new location
				await fs.copyFile(oldPath, newPath);
			}
		}
		
		// Remove old directory after successful migration
		await fs.rmdir(oldDir, { recursive: true });
		
	} catch (error) {
		console.error(`Failed to migrate directory ${oldDir} to ${newDir}:`, error);
		throw error;
	}
}

/**
 * Creates a backup of the current plugin directory structure before migration
 */
export async function createPreMigrationBackup(context: MigrationContext): Promise<string | null> {
	try {
		let basePath: string | null = null;
		try {
			basePath = context.vault.adapter.basePath || context.vault.adapter.getBasePath?.() || null;
		} catch {}
		
		if (!basePath || typeof basePath !== 'string') {
			return null;
		}
		
		const pluginDir = path.join(basePath, '.obsidian', 'plugins', 'Vault-Bot');
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupDir = path.join(pluginDir, `backup-pre-migration-${timestamp}`);
		
		// Create backup directory
		await ensureDir(backupDir);
		
		// Copy important files/directories
		const itemsToBackup = ['ai-calls', 'chats', 'active_conversation.json'];
		
		for (const item of itemsToBackup) {
			const sourcePath = path.join(pluginDir, item);
			const targetPath = path.join(backupDir, item);
			
			const stat = await statSafe(sourcePath);
			if (stat?.isDirectory()) {
				await copyDirectoryRecursive(sourcePath, targetPath);
			} else if (stat?.isFile()) {
				await fs.copyFile(sourcePath, targetPath);
			}
		}
		
		console.log(`Pre-migration backup created at: ${backupDir}`);
		return backupDir;
		
	} catch (error) {
		console.warn('Failed to create pre-migration backup:', error);
		return null;
	}
}

async function copyDirectoryRecursive(source: string, target: string): Promise<void> {
	await ensureDir(target);
	
	const entries = await fs.readdir(source, { withFileTypes: true });
	for (const entry of entries) {
		const sourcePath = path.join(source, entry.name);
		const targetPath = path.join(target, entry.name);
		
		if (entry.isDirectory()) {
			await copyDirectoryRecursive(sourcePath, targetPath);
		} else if (entry.isFile()) {
			await fs.copyFile(sourcePath, targetPath);
		}
	}
}
