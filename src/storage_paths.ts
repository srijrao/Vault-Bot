import * as path from 'path';
import * as fs from 'fs';

export type StorageType = 'ai-calls' | 'chats' | 'active-conversation';

/**
 * Central path resolver for all storage types
 * Prefers history directory structure, with fallback to legacy structure if history doesn't exist
 * Supports both production (Obsidian plugin directory) and development/testing environments
 */
export function resolveStorageDir(
  type: StorageType, 
  appLike?: any
): string {
  // Try to use Obsidian vault path when available (prioritize this even in test environment)
  let basePath: string | null = null;
  try {
    basePath = appLike?.vault?.adapter?.basePath || appLike?.vault?.adapter?.getBasePath?.();
  } catch {}

  // If we have a valid basePath from appLike, use it regardless of environment
  if (basePath && typeof basePath === 'string') {
    const pluginDir = path.join(basePath, '.obsidian', 'plugins', 'Vault-Bot');
    const historyDir = path.join(pluginDir, 'history');
    
    // Check if history directory exists (migration completed)
    if (fs.existsSync(historyDir)) {
      switch (type) {
        case 'ai-calls':
          return path.join(historyDir, 'ai-calls');
        case 'chats':
          return path.join(historyDir, 'chats');
        case 'active-conversation':
          return historyDir;
        default:
          throw new Error(`Unknown storage type: ${type}`);
      }
    } else {
      // Fallback to legacy structure if history directory doesn't exist yet
      switch (type) {
        case 'ai-calls':
          return path.join(pluginDir, 'ai-calls');
        case 'chats':
          return path.join(pluginDir, 'chats');
        case 'active-conversation':
          return pluginDir; // active_conversation.json in plugin root
        default:
          throw new Error(`Unknown storage type: ${type}`);
      }
    }
  }

  // Check if we're in a test environment (only when no valid appLike basePath)
  const isTestEnv = process.env.NODE_ENV === 'test' || 
                   process.env.VITEST === 'true' || 
                   typeof global !== 'undefined' && (global as any).__vitest__ ||
                   typeof globalThis !== 'undefined' && (globalThis as any).__vitest__;

  // For test environment, use history-test folder
  if (isTestEnv) {
    const testBase = path.resolve('history-test');
    return path.join(testBase, type);
  }

  // Final fallback for development/standalone environments - use history structure
  const historyBase = path.resolve('history');
  switch (type) {
    case 'ai-calls':
      return path.join(historyBase, 'ai-calls');
    case 'chats':
      return path.join(historyBase, 'chats');
    case 'active-conversation':
      return historyBase;
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

/**
 * Legacy compatibility function for AI calls directory resolution
 * @deprecated Use resolveStorageDir('ai-calls', appLike) instead
 */
export function resolveAiCallsDir(appLike?: any): string {
  return resolveStorageDir('ai-calls', appLike);
}
