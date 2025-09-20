import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveStorageDir, resolveAiCallsDir } from '../src/storage_paths';

// Mock fs at the module level
vi.mock('fs', () => ({
  existsSync: vi.fn()
}));

import * as fs from 'fs';

// Mock path module for cross-platform testing
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: (...parts: string[]) => parts.join('/'),
    resolve: (p: string) => `/${p}`
  };
});

describe('storage_paths', () => {
  let mockAppLike: any;

  beforeEach(() => {
    mockAppLike = {
      vault: {
        adapter: {
          basePath: '/test/vault'
        }
      }
    };

    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    delete (global as any).__vitest__;
    delete (globalThis as any).__vitest__;
  });

  describe('resolveStorageDir', () => {
    it('should resolve ai-calls directory with history structure', () => {
      // Mock history directory existence to simulate post-migration state
      (fs.existsSync as any).mockReturnValue(true);
      
      const result = resolveStorageDir('ai-calls', mockAppLike);
      expect(result).toBe('/test/vault/.obsidian/plugins/Vault-Bot/history/ai-calls');
    });

    it('should resolve chats directory with history structure', () => {
      // Mock history directory existence to simulate post-migration state
      (fs.existsSync as any).mockReturnValue(true);
      
      const result = resolveStorageDir('chats', mockAppLike);
      expect(result).toBe('/test/vault/.obsidian/plugins/Vault-Bot/history/chats');
    });

    it('should resolve active-conversation directory to history root', () => {
      // Mock history directory existence to simulate post-migration state
      (fs.existsSync as any).mockReturnValue(true);
      
      const result = resolveStorageDir('active-conversation', mockAppLike);
      expect(result).toBe('/test/vault/.obsidian/plugins/Vault-Bot/history');
    });

    it('should fallback to legacy structure when history does not exist', () => {
      // Mock history directory non-existence to simulate pre-migration state
      (fs.existsSync as any).mockReturnValue(false);
      
      const aiCallsResult = resolveStorageDir('ai-calls', mockAppLike);
      expect(aiCallsResult).toBe('/test/vault/.obsidian/plugins/Vault-Bot/ai-calls');
      
      const chatsResult = resolveStorageDir('chats', mockAppLike);
      expect(chatsResult).toBe('/test/vault/.obsidian/plugins/Vault-Bot/chats');
      
      const activeConvResult = resolveStorageDir('active-conversation', mockAppLike);
      expect(activeConvResult).toBe('/test/vault/.obsidian/plugins/Vault-Bot');
    });

    it('should use test environment paths when in test mode', () => {
      process.env.NODE_ENV = 'test';
      const result = resolveStorageDir('ai-calls', undefined);
      expect(result).toBe('/history-test/ai-calls');
    });

    it('should fallback to history paths when no vault path available', () => {
      const result = resolveStorageDir('ai-calls', undefined);
      expect(result).toBe('/history/ai-calls');
    });

    it('should handle invalid storage types', () => {
      expect(() => {
        resolveStorageDir('invalid-type' as any, mockAppLike);
      }).toThrow('Unknown storage type: invalid-type');
    });
  });

  describe('resolveAiCallsDir (legacy)', () => {
    it('should maintain backward compatibility with history structure', () => {
      // Mock history directory existence to simulate post-migration state
      (fs.existsSync as any).mockReturnValue(true);
      
      const result = resolveAiCallsDir(mockAppLike);
      expect(result).toBe('/test/vault/.obsidian/plugins/Vault-Bot/history/ai-calls');
    });
  });
});