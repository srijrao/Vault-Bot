import { App, TFile, Notice, Vault, MetadataCache, MarkdownRenderer, Component, Setting } from 'obsidian';
import { VaultBotPluginSettings } from '../settings';

// Plugin-like interface for settings UI
interface PluginLike {
  settings: VaultBotPluginSettings;
}

export interface RetrievedNote {
  file: TFile;
  path: string;
  title: string;
  content: string;
}

export interface LinkInfo {
  path: string;
  section?: string;
  block?: string;
  alias?: string;
}

export class ContentRetrievalService {
  private app: App;
  private vault: Vault;
  private metadataCache: MetadataCache;
  private settings: VaultBotPluginSettings;

  constructor(app: App, settings: VaultBotPluginSettings) {
    this.app = app;
    this.vault = app.vault;
    this.metadataCache = app.metadataCache;
    this.settings = settings;
  }

  /**
   * Main entry point for retrieving content based on settings
   */
  async retrieveContent(messageText: string, currentFile?: TFile): Promise<RetrievedNote[]> {
    const retrievedNotes: Map<string, RetrievedNote> = new Map();

    try {
      // Include current note if enabled
      if (this.settings.includeCurrentNote && currentFile) {
        const currentNote = await this.retrieveNote(currentFile);
        if (currentNote) {
          retrievedNotes.set(currentFile.path, currentNote);
        }
      }

      // Include open notes if enabled
      if (this.settings.includeOpenNotes) {
        const openNotes = await this.getOpenNotes();
        for (const note of openNotes) {
          if (!retrievedNotes.has(note.path)) {
            retrievedNotes.set(note.path, note);
          }
        }
      }

      // Include linked notes if enabled
      if (this.settings.includeLinkedNotes) {
        const linkedNotes = await this.getLinkedNotes(messageText, 1);
        for (const note of linkedNotes) {
          if (!retrievedNotes.has(note.path)) {
            retrievedNotes.set(note.path, note);
          }
        }
      }

      return Array.from(retrievedNotes.values());
    } catch (error) {
      console.error('Error retrieving content:', error);
      new Notice('Failed to retrieve some linked content');
      return [];
    }
  }

  /**
   * Parse links from text content
   */
  private parseLinks(text: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    
    // Wiki-style links: [[Note]], [[path/to/Note]], [[Note|alias]], [[Note#section]], [[Note^blockId]]
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    
    while ((match = wikiLinkRegex.exec(text)) !== null) {
      const linkText = match[1];
      const linkInfo = this.parseWikiLink(linkText);
      if (linkInfo) {
        links.push(linkInfo);
      }
    }

    // Markdown links: [text](note), [text](path/to/note), [text](note#section)
    const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    
    while ((match = markdownLinkRegex.exec(text)) !== null) {
      const linkPath = match[2];
      const linkText = match[1];
      
      // Skip external links
      if (this.isExternalLink(linkPath)) {
        continue;
      }
      
      const linkInfo = this.parseMarkdownLink(linkPath, linkText);
      if (linkInfo) {
        links.push(linkInfo);
      }
    }

    return links;
  }

  /**
   * Parse wiki-style link
   */
  private parseWikiLink(linkText: string): LinkInfo | null {
    // Handle [[Note|alias]] format
    const parts = linkText.split('|');
    const pathPart = parts[0].trim();
    const alias = parts.length > 1 ? parts[1].trim() : undefined;

    // Handle [[Note#section]] or [[Note^blockId]] format
    let path: string;
    let section: string | undefined;
    let block: string | undefined;

    if (pathPart.includes('#')) {
      const [notePath, sectionName] = pathPart.split('#', 2);
      path = notePath.trim();
      section = sectionName.trim();
    } else if (pathPart.includes('^')) {
      const [notePath, blockId] = pathPart.split('^', 2);
      path = notePath.trim();
      block = blockId.trim();
    } else {
      path = pathPart;
    }

    return { path, section, block, alias };
  }

  /**
   * Parse markdown-style link
   */
  private parseMarkdownLink(linkPath: string, linkText: string): LinkInfo | null {
    let path: string;
    let section: string | undefined;
    let block: string | undefined;

    if (linkPath.includes('#')) {
      const [notePath, sectionName] = linkPath.split('#', 2);
      path = notePath.trim();
      section = sectionName.trim();
    } else if (linkPath.includes('^')) {
      const [notePath, blockId] = linkPath.split('^', 2);
      path = notePath.trim();
      block = blockId.trim();
    } else {
      path = linkPath;
    }

    return { path, section, block, alias: linkText };
  }

  /**
   * Check if a link is external
   */
  private isExternalLink(link: string): boolean {
    return /^https?:\/\/|^mailto:|^ftp:|^tel:/.test(link);
  }

  /**
   * Resolve a link to a TFile
   */
  private resolveLinkToFile(linkInfo: LinkInfo, sourcePath?: string): TFile | null {
    try {
      // Try to resolve the link using Obsidian's metadata cache
      const file = this.metadataCache.getFirstLinkpathDest(linkInfo.path, sourcePath || '');
      return file;
    } catch (error) {
      console.warn(`Failed to resolve link: ${linkInfo.path}`, error);
      return null;
    }
  }

  /**
   * Retrieve content for a specific note
   */
  private async retrieveNote(file: TFile, linkInfo?: LinkInfo): Promise<RetrievedNote | null> {
    try {
      const content = await this.vault.read(file);
      
      let processedContent = content;
      
      // If specific section or block requested, extract it
      if (linkInfo?.section) {
        processedContent = this.extractSection(content, linkInfo.section);
      } else if (linkInfo?.block) {
        processedContent = this.extractBlock(content, linkInfo.block);
      }

      // Apply reading view extraction if enabled
      if (this.settings.extractNotesInReadingView) {
        processedContent = await this.extractFromReadingView(processedContent, file);
      }

      return {
        file,
        path: file.path,
        title: file.basename,
        content: processedContent
      };
    } catch (error) {
      console.warn(`Failed to read note: ${file.path}`, error);
      new Notice(`Failed to read note: ${file.path}`);
      return null;
    }
  }

  /**
   * Extract a specific section from markdown content
   */
  private extractSection(content: string, sectionName: string): string {
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
    
    if (startIndex === -1) {
      return content; // Section not found, return full content
    }
    
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
    
    return lines.slice(startIndex, endIndex).join('\n');
  }

  /**
   * Extract a specific block from markdown content
   */
  private extractBlock(content: string, blockId: string): string {
    const lines = content.split('\n');
    
    // Look for block reference
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(`^${blockId}`)) {
        // Return the line with the block reference
        return line.replace(new RegExp(`\\s*\\^${blockId}\\s*$`), '');
      }
    }
    
    return content; // Block not found, return full content
  }

  /**
   * Extract text content from reading view (HTML rendering)
   */
  private async extractFromReadingView(content: string, file: TFile): Promise<string> {
    try {
      // Create a temporary container for rendering
      const container = document.createElement('div');
      
      // Use Obsidian's markdown renderer
      const component = new Component();
      await MarkdownRenderer.renderMarkdown(content, container, file.path, component);
      
      // Extract text content from rendered HTML
      const textContent = container.innerText || container.textContent || '';
      
      // Clean up
      component.unload();
      
      // If enabled, also scan rendered HTML for additional links
      if (this.settings.includeLinksInRenderedHTML) {
        // This is a placeholder - in practice, we would extract links from the HTML
        // and add them to the processing queue, but not resolve them recursively
        // to avoid infinite loops
      }
      
      return textContent;
    } catch (error) {
      console.warn(`HTML rendering failed for ${file.path}, using markdown:`, error);
      new Notice(`HTML rendering failed for ${file.path}, using markdown`);
      return content;
    }
  }

  /**
   * Get all currently open notes
   */
  private async getOpenNotes(): Promise<RetrievedNote[]> {
    const openFiles: TFile[] = [];
    
    // Get all open leaves
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === 'markdown') {
        const file = (leaf.view as any).file;
        if (file instanceof TFile) {
          openFiles.push(file);
        }
      }
    });

    const notes: RetrievedNote[] = [];
    for (const file of openFiles) {
      if (!this.isExcluded(file.path, 1)) {
        const note = await this.retrieveNote(file);
        if (note) {
          notes.push(note);
        }
      }
    }

    return notes;
  }

  /**
   * Get linked notes with recursion support
   */
  private async getLinkedNotes(text: string, currentDepth: number): Promise<RetrievedNote[]> {
    const maxDepth = this.settings.linkRecursionDepth || 1;
    if (currentDepth > maxDepth) {
      return [];
    }

    const links = this.parseLinks(text);
    const notes: RetrievedNote[] = [];
    const processedPaths = new Set<string>();

    for (const linkInfo of links) {
      const file = this.resolveLinkToFile(linkInfo);
      if (!file) {
        new Notice(`Could not resolve link to: ${linkInfo.path}`);
        continue;
      }

      if (processedPaths.has(file.path)) {
        continue; // Already processed this file
      }

      if (this.isExcluded(file.path, currentDepth)) {
        continue; // File is excluded
      }

      const note = await this.retrieveNote(file, linkInfo);
      if (note) {
        notes.push(note);
        processedPaths.add(file.path);

        // Recursive processing for deeper levels
        if (currentDepth < maxDepth) {
          const nestedNotes = await this.getLinkedNotes(note.content, currentDepth + 1);
          for (const nestedNote of nestedNotes) {
            if (!processedPaths.has(nestedNote.path)) {
              notes.push(nestedNote);
              processedPaths.add(nestedNote.path);
            }
          }
        }
      }
    }

    return notes;
  }

  /**
   * Check if a file path should be excluded based on settings
   */
  private isExcluded(filePath: string, depth: number): boolean {
    const exclusions = depth === 1 
      ? this.settings.noteExclusionsLevel1 || []
      : this.settings.noteExclusionsDeepLink || [];

    for (const exclusion of exclusions) {
      const trimmed = exclusion.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#')) {
        // Tag-based exclusion - check if file has this tag
        const file = this.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const cache = this.metadataCache.getFileCache(file);
          const tags = cache?.tags?.map(tag => tag.tag) || [];
          if (tags.includes(trimmed)) {
            return true;
          }
        }
      } else if (trimmed.endsWith('/')) {
        // Folder exclusion
        if (filePath.startsWith(trimmed)) {
          return true;
        }
      } else {
        // Exact file path exclusion
        if (filePath === trimmed || filePath.endsWith('/' + trimmed)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Format retrieved notes for inclusion in AI requests
   */
  formatNotesForAI(notes: RetrievedNote[]): string {
    if (notes.length === 0) {
      return '';
    }

    const sections = notes.map(note => {
      return `## ${note.title} (${note.path})\n\n${note.content}`;
    });

    return '\n\n---\n\n**Included Notes:**\n\n' + sections.join('\n\n---\n\n');
  }
}

/**
 * Renders the note exclusions settings UI
 */
export function renderNoteExclusionsSettings(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  const exclusionsContainer = container.createDiv();
  exclusionsContainer.createEl('h3', { text: 'Note Exclusions' });
  exclusionsContainer.createEl('p', { 
    text: 'Exclude specific folders, notes, or tags from link retrieval. One entry per line.',
    cls: 'setting-item-description'
  });

  new Setting(exclusionsContainer)
    .setName('Level 1 Exclusions')
    .setDesc('Excludes from direct link retrieval. Format: folder paths, note paths, or tags (with #)')
    .addTextArea((text) => {
      text
        .setPlaceholder('folder/\nspecific-note.md\n#tag-to-exclude')
        .setValue((plugin.settings.noteExclusionsLevel1 || []).join('\n'))
        .onChange(async (value) => {
          plugin.settings.noteExclusionsLevel1 = value.split('\n').filter(line => line.trim());
          await save();
        });
      const anyInput: any = (text as any).inputEl;
      if (anyInput) {
        if (typeof anyInput.rows !== 'undefined') anyInput.rows = 4;
        if (anyInput.style) anyInput.style.width = '100%';
      }
      return text;
    });

  new Setting(exclusionsContainer)
    .setName('Deep Link Exclusions')
    .setDesc('Excludes from level 2+ recursive retrieval. Format: folder paths, note paths, or tags (with #)')
    .addTextArea((text) => {
      text
        .setPlaceholder('templates/\nlarge-reference-note.md\n#private')
        .setValue((plugin.settings.noteExclusionsDeepLink || []).join('\n'))
        .onChange(async (value) => {
          plugin.settings.noteExclusionsDeepLink = value.split('\n').filter(line => line.trim());
          await save();
        });
      const anyInput: any = (text as any).inputEl;
      if (anyInput) {
        if (typeof anyInput.rows !== 'undefined') anyInput.rows = 4;
        if (anyInput.style) anyInput.style.width = '100%';
      }
      return text;
    });
}