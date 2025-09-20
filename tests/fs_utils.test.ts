import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeAtomic, ensureDir, statSafe } from '../src/fs_utils';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('fs_utils', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vault-bot-fs-utils-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writeAtomic', () => {
    it('should write a file atomically', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Hello, world!';

      await writeAtomic(filePath, content);

      const result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe(content);
    });

    it('should create directories if they do not exist', async () => {
      const filePath = path.join(testDir, 'subdir', 'nested', 'test.txt');
      const content = 'Nested file content';

      await writeAtomic(filePath, content);

      const result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe(content);

      // Verify directories were created
      const stats = await fs.promises.stat(path.dirname(filePath));
      expect(stats.isDirectory()).toBe(true);
    });

    it('should handle UTF-8 content correctly', async () => {
      const filePath = path.join(testDir, 'utf8.txt');
      const content = 'Hello 世界! 🌍 émojis and ñoñó';

      await writeAtomic(filePath, content);

      const result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe(content);
    });

    it('should overwrite existing files', async () => {
      const filePath = path.join(testDir, 'overwrite.txt');
      
      // Write initial content
      await writeAtomic(filePath, 'First content');
      let result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe('First content');

      // Overwrite with new content
      await writeAtomic(filePath, 'Second content');
      result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe('Second content');
    });

    it('should retry on rename failures', async () => {
      const filePath = path.join(testDir, 'retry.txt');
      
      // Mock fs.promises.rename to fail twice then succeed
      let renameCallCount = 0;
      const originalRename = fs.promises.rename;
      const mockRename = vi.fn().mockImplementation(async (oldPath, newPath) => {
        renameCallCount++;
        if (renameCallCount <= 2) {
          const error = new Error('Simulated file lock');
          (error as any).code = 'EBUSY';
          throw error;
        }
        return originalRename(oldPath, newPath);
      });

      vi.spyOn(fs.promises, 'rename').mockImplementation(mockRename);

      await writeAtomic(filePath, 'Retry test content');

      const result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe('Retry test content');
      expect(renameCallCount).toBe(3);

      vi.restoreAllMocks();
    });

    it('should create partial file on max retries exceeded', async () => {
      const filePath = path.join(testDir, 'partial.txt');
      const content = 'Partial file content';
      
      // Mock fs.promises.rename to always fail
      const originalRename = fs.promises.rename;
      const mockRename = vi.fn().mockImplementation(async (oldPath, newPath) => {
        // Allow the partial file rename to succeed
        if (newPath.includes('.partial-')) {
          return originalRename(oldPath, newPath);
        }
        throw new Error('Persistent file lock');
      });
      vi.spyOn(fs.promises, 'rename').mockImplementation(mockRename);

      await expect(writeAtomic(filePath, content, 2)).rejects.toThrow('Persistent file lock');

      // Should have created a partial file
      const files = await fs.promises.readdir(testDir);
      const partialFile = files.find(f => f.startsWith('partial.txt.partial-'));
      expect(partialFile).toBeDefined();

      if (partialFile) {
        const partialContent = await fs.promises.readFile(path.join(testDir, partialFile), 'utf8');
        expect(partialContent).toBe(content);
      }

      vi.restoreAllMocks();
    });

    it('should handle very large files', async () => {
      const filePath = path.join(testDir, 'large.txt');
      const content = 'x'.repeat(1024 * 1024); // 1MB of data

      await writeAtomic(filePath, content);

      const result = await fs.promises.readFile(filePath, 'utf8');
      expect(result).toBe(content);
      expect(result.length).toBe(1024 * 1024);
    });
  });

  describe('ensureDir', () => {
    it('should create a single directory', async () => {
      const dirPath = path.join(testDir, 'newdir');
      
      await ensureDir(dirPath);
      
      const stats = await fs.promises.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories', async () => {
      const dirPath = path.join(testDir, 'level1', 'level2', 'level3');
      
      await ensureDir(dirPath);
      
      const stats = await fs.promises.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not fail if directory already exists', async () => {
      const dirPath = path.join(testDir, 'existing');
      
      // Create directory first
      await fs.promises.mkdir(dirPath);
      
      // Should not throw when called again
      await expect(ensureDir(dirPath)).resolves.not.toThrow();
      
      const stats = await fs.promises.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should handle root directory gracefully', async () => {
      // This test is platform-specific and may fail on Windows, so we'll mock it
      const mockMkdir = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'mkdir').mockImplementation(mockMkdir);
      
      await expect(ensureDir('/')).resolves.not.toThrow();
      
      vi.restoreAllMocks();
    });
  });

  describe('statSafe', () => {
    it('should return stats for existing file', async () => {
      const filePath = path.join(testDir, 'existing.txt');
      await fs.promises.writeFile(filePath, 'test content');
      
      const stats = await statSafe(filePath);
      
      expect(stats).not.toBeNull();
      expect(stats!.isFile()).toBe(true);
    });

    it('should return stats for existing directory', async () => {
      const dirPath = path.join(testDir, 'existing-dir');
      await fs.promises.mkdir(dirPath);
      
      const stats = await statSafe(dirPath);
      
      expect(stats).not.toBeNull();
      expect(stats!.isDirectory()).toBe(true);
    });

    it('should return null for non-existent path', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.txt');
      
      const stats = await statSafe(nonExistentPath);
      
      expect(stats).toBeNull();
    });

    it('should return null for permission denied', async () => {
      // This test may not work on all systems, so we'll mock it
      const mockStat = vi.fn().mockRejectedValue(new Error('Permission denied'));
      vi.spyOn(fs.promises, 'stat').mockImplementation(mockStat);
      
      const stats = await statSafe('/some/protected/path');
      
      expect(stats).toBeNull();
      
      vi.restoreAllMocks();
    });

    it('should return null for any stat error', async () => {
      const mockStat = vi.fn().mockRejectedValue(new Error('Unknown error'));
      vi.spyOn(fs.promises, 'stat').mockImplementation(mockStat);
      
      const stats = await statSafe('/some/path');
      
      expect(stats).toBeNull();
      
      vi.restoreAllMocks();
    });
  });

  describe('integration tests', () => {
    it('should work together: ensureDir + writeAtomic + statSafe', async () => {
      const dirPath = path.join(testDir, 'integration', 'test');
      const filePath = path.join(dirPath, 'file.txt');
      const content = 'Integration test content';

      // Ensure directory exists
      await ensureDir(dirPath);
      
      // Verify directory was created
      const dirStats = await statSafe(dirPath);
      expect(dirStats).not.toBeNull();
      expect(dirStats!.isDirectory()).toBe(true);

      // Write file atomically
      await writeAtomic(filePath, content);
      
      // Verify file was created and has correct content
      const fileStats = await statSafe(filePath);
      expect(fileStats).not.toBeNull();
      expect(fileStats!.isFile()).toBe(true);

      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      expect(fileContent).toBe(content);
    });
  });
});
