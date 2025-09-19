/**
 * Load chat conversations from vault notes with YAML frontmatter parsing
 */

import { App, TFile, Notice, FuzzySuggestModal } from 'obsidian';
import { ChatConversation, ChatMessage, SavedChatMetadata, createChatMessage, generateConversationId } from './chat_types';
import { VaultBotPluginSettings } from '../settings';

interface ParsedNote {
  metadata: SavedChatMetadata | null;
  content: string;
}

export class NoteLoader {
  private app: App;
  private settings: VaultBotPluginSettings;

  constructor(app: App, settings: VaultBotPluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Show file picker modal for selecting a note to load
   */
  async showNotePicker(): Promise<TFile | null> {
    return new Promise((resolve) => {
      const modal = new ChatNotePickerModal(this.app, (file) => {
        resolve(file);
      });
      modal.open();
    });
  }

  /**
   * Load conversation from a specific note file
   */
  async loadConversationFromNote(file: TFile): Promise<ChatConversation | null> {
    try {
      const content = await this.app.vault.read(file);
      const parsed = this.parseNoteContent(content);
      
      if (!parsed.metadata && !this.isValidChatNote(content)) {
        new Notice('Selected note does not appear to be a valid chat note');
        return null;
      }
      
      const conversation = this.reconstructConversation(parsed, file.basename);
      
      if (conversation.messages.length === 0) {
        new Notice('No messages found in the selected note');
        return null;
      }
      
      new Notice(`Loaded chat with ${conversation.messages.length} messages`);
      return conversation;
    } catch (error) {
      console.error('Failed to load conversation from note:', error);
      new Notice('Failed to load conversation from note');
      return null;
    }
  }

  /**
   * Parse note content to extract metadata and content
   */
  private parseNoteContent(content: string): ParsedNote {
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!yamlMatch) {
      return { metadata: null, content: content.trim() };
    }
    
    const yamlContent = yamlMatch[1];
    const noteContent = yamlMatch[2].trim();
    
    try {
      const metadata = this.parseYamlMetadata(yamlContent);
      return { metadata, content: noteContent };
    } catch (error) {
      console.error('Failed to parse YAML metadata:', error);
      return { metadata: null, content: noteContent };
    }
  }

  /**
   * Parse YAML metadata from frontmatter
   */
  private parseYamlMetadata(yamlContent: string): SavedChatMetadata | null {
    const lines = yamlContent.split('\n');
    const metadata: any = {};
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      
      // Remove quotes from string values
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Parse JSON strings (for chat-separator which may contain newlines)
      if (key === 'chat-separator' && value.startsWith('"')) {
        try {
          value = JSON.parse(line.substring(colonIndex + 1).trim());
        } catch (e) {
          // Fallback to string parsing
        }
      }
      
      // Convert to camelCase for consistency
      const camelKey = this.toCamelCase(key);
      metadata[camelKey] = this.parseValue(value);
    }
    
    // Validate required fields
    if (!metadata.vaultBotChat) {
      return null;
    }
    
    return {
      chatSeparator: metadata.chatSeparator || this.settings.chatSeparator,
      apiProvider: metadata.apiProvider || this.settings.apiProvider,
      model: metadata.model || 'unknown',
      systemPrompt: metadata.systemPrompt || '',
      temperature: metadata.temperature || 1.0,
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: metadata.updatedAt || new Date().toISOString(),
      messageCount: metadata.messageCount || 0
    };
  }

  /**
   * Convert kebab-case to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  /**
   * Parse value from YAML
   */
  private parseValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  /**
   * Check if content looks like a valid chat note (fallback check)
   */
  private isValidChatNote(content: string): boolean {
    // Check if content contains chat separators or looks like a conversation
    const defaultSeparator = this.settings.chatSeparator;
    return content.includes(defaultSeparator) || 
           content.includes('----') || 
           content.includes('User:') || 
           content.includes('Assistant:');
  }

  /**
   * Reconstruct conversation from parsed note
   */
  private reconstructConversation(parsed: ParsedNote, filename: string): ChatConversation {
    const metadata = parsed.metadata;
    const chatSeparator = metadata?.chatSeparator || this.settings.chatSeparator;
    
    // Split content by separator
    const parts = parsed.content.split(chatSeparator);
    const messages: ChatMessage[] = [];
    
    // Add system message if available
    if (metadata?.systemPrompt) {
      messages.push(createChatMessage('system', metadata.systemPrompt));
    }
    
    // Process conversation parts, alternating between user and assistant
    for (let i = 0; i < parts.length; i++) {
      const content = parts[i].trim();
      if (!content) continue;
      
      // Alternate between user and assistant, starting with user
      const role = i % 2 === 0 ? 'user' : 'assistant';
      messages.push(createChatMessage(role, content));
    }
    
    // Create conversation
    const now = new Date();
    return {
      id: generateConversationId(),
      title: this.generateTitleFromFilename(filename),
      messages,
      createdAt: metadata?.createdAt ? new Date(metadata.createdAt) : now,
      updatedAt: metadata?.updatedAt ? new Date(metadata.updatedAt) : now
    };
  }

  /**
   * Generate conversation title from filename
   */
  private generateTitleFromFilename(filename: string): string {
    // Remove date prefix and extension
    let title = filename.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/\.md$/, '');
    // Replace underscores with spaces and capitalize
    title = title.replace(/_/g, ' ');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }
}

/**
 * Modal for selecting a note file to load as chat
 */
class ChatNotePickerModal extends FuzzySuggestModal<TFile> {
  private onChoose: (file: TFile | null) => void;

  constructor(app: App, onChoose: (file: TFile | null) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('Search for a note to load as chat...');
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }

  onClose(): void {
    super.onClose();
    // If modal was closed without selection, call onChoose with null
    this.onChoose(null);
  }
}

/**
 * Utility function to load chat from note with file picker
 */
export async function loadChatFromNote(app: App, settings: VaultBotPluginSettings): Promise<ChatConversation | null> {
  const loader = new NoteLoader(app, settings);
  const selectedFile = await loader.showNotePicker();
  
  if (!selectedFile) {
    return null;
  }
  
  return loader.loadConversationFromNote(selectedFile);
}
