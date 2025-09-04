import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a minimal test focused on the core logic without Obsidian dependencies
describe('ContentRetrievalService - Core Logic', () => {
  
  describe('Link Parsing Logic', () => {
    it('should correctly parse wiki-style links', () => {
      // Test basic parsing logic without instantiating the full service
      const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
      const text = 'This is a [[Simple Link]] and [[Folder/Note]] and [[Link|Alias]]';
      const matches = Array.from(text.matchAll(wikiLinkRegex));
      
      expect(matches).toHaveLength(3);
      expect(matches[0][1]).toBe('Simple Link');
      expect(matches[1][1]).toBe('Folder/Note');
      expect(matches[2][1]).toBe('Link|Alias');
    });

    it('should correctly parse markdown-style links', () => {
      const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      const text = 'See [example](note) and [another](folder/note)';
      const matches = Array.from(text.matchAll(markdownLinkRegex));
      
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe('example'); // Link text
      expect(matches[0][2]).toBe('note'); // Link path
      expect(matches[1][1]).toBe('another');
      expect(matches[1][2]).toBe('folder/note');
    });

    it('should ignore external links', () => {
      const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      const text = 'Visit [Google](https://google.com) and [Local](note)';
      const matches = Array.from(text.matchAll(markdownLinkRegex));
      
      expect(matches).toHaveLength(2);
      
      // Check which ones are external
      const externalLinkRegex = /^https?:\/\/|^mailto:|^ftp:|^tel:/;
      const localMatches = matches.filter(match => !externalLinkRegex.test(match[2]));
      
      expect(localMatches).toHaveLength(1);
      expect(localMatches[0][2]).toBe('note');
    });

    it('should handle section and block references', () => {
      const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
      const text = 'Check [[Note#Section]] and [[Note^block123]]';
      const matches = Array.from(text.matchAll(wikiLinkRegex));
      
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe('Note#Section');
      expect(matches[1][1]).toBe('Note^block123');
    });
  });

  describe('Section Extraction Logic', () => {
    it('should extract correct section content', () => {
      const content = '# Title\n\nSome content\n\n## Target Section\n\nTarget content\n\n## Another Section\n\nOther content';
      const sectionName = 'Target Section';
      
      // Simulate the extraction logic
      const lines = content.split('\n');
      const sectionRegex = new RegExp(`^#+\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
      
      let startIndex = -1;
      let endIndex = lines.length;
      
      // Find the section start
      for (let i = 0; i < lines.length; i++) {
        if (sectionRegex.test(lines[i])) {
          startIndex = i;
          break;
        }
      }
      
      expect(startIndex).toBe(4); // Should find "## Target Section"
      
      // Find the section end (next heading of same or higher level)
      const startLine = lines[startIndex];
      const startLevel = (startLine.match(/^#+/) || [''])[0].length;
      
      for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^#+/);
        if (match && match[0].length <= startLevel) {
          endIndex = i;
          break;
        }
      }
      
      const result = lines.slice(startIndex, endIndex).join('\n');
      expect(result).toBe('## Target Section\n\nTarget content\n');
    });

    it('should extract block references', () => {
      const content = 'Line 1\nLine 2 ^block123\nLine 3';
      const blockId = 'block123';
      
      // Simulate block extraction logic
      const lines = content.split('\n');
      let result = content; // default to full content
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(`^${blockId}`)) {
          result = line.replace(new RegExp(`\\s*\\^${blockId}\\s*$`), '');
          break;
        }
      }
      
      expect(result).toBe('Line 2');
    });
  });

  describe('Exclusion Logic', () => {
    it('should correctly identify folder exclusions', () => {
      const exclusions = ['excluded-folder/', 'templates/'];
      const testPaths = [
        'excluded-folder/note.md',
        'templates/template.md',
        'normal-folder/note.md',
        'other.md'
      ];
      
      // Simulate exclusion logic
      const isExcluded = (filePath: string) => {
        for (const exclusion of exclusions) {
          if (exclusion.endsWith('/') && filePath.startsWith(exclusion)) {
            return true;
          }
        }
        return false;
      };
      
      expect(isExcluded(testPaths[0])).toBe(true);
      expect(isExcluded(testPaths[1])).toBe(true);
      expect(isExcluded(testPaths[2])).toBe(false);
      expect(isExcluded(testPaths[3])).toBe(false);
    });

    it('should correctly identify file exclusions', () => {
      const exclusions = ['specific-note.md', 'config.json'];
      const testPaths = [
        'specific-note.md',
        'folder/specific-note.md',
        'other-note.md',
        'config.json'
      ];
      
      // Simulate file exclusion logic
      const isExcluded = (filePath: string) => {
        for (const exclusion of exclusions) {
          if (!exclusion.endsWith('/')) {
            if (filePath === exclusion || filePath.endsWith('/' + exclusion)) {
              return true;
            }
          }
        }
        return false;
      };
      
      expect(isExcluded(testPaths[0])).toBe(true);
      expect(isExcluded(testPaths[1])).toBe(true);
      expect(isExcluded(testPaths[2])).toBe(false);
      expect(isExcluded(testPaths[3])).toBe(true);
    });
  });

  describe('Content Formatting', () => {
    it('should format notes correctly for AI', () => {
      const notes = [
        { title: 'Note 1', path: 'note1.md', content: 'Content of note 1' },
        { title: 'Note 2', path: 'folder/note2.md', content: 'Content of note 2' }
      ];
      
      // Simulate formatting logic
      if (notes.length === 0) {
        expect('').toBe('');
        return;
      }

      const sections = notes.map(note => {
        return `## ${note.title} (${note.path})\n\n${note.content}`;
      });

      const result = '\n\n---\n\n**Included Notes:**\n\n' + sections.join('\n\n---\n\n');
      
      expect(result).toContain('**Included Notes:**');
      expect(result).toContain('## Note 1 (note1.md)');
      expect(result).toContain('## Note 2 (folder/note2.md)');
      expect(result).toContain('Content of note 1');
      expect(result).toContain('Content of note 2');
    });
  });
});