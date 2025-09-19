/**
 * Save chat conversations to vault notes with YAML frontmatter
 */

import { App, TFile, Notice } from 'obsidian';
import { ChatConversation, SavedChatMetadata } from './chat_types';
import { VaultBotPluginSettings } from '../settings';

export class NoteSaver {
  private app: App;
  private settings: VaultBotPluginSettings;

  constructor(app: App, settings: VaultBotPluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Save a conversation to a note in the vault
   */
  async saveConversationToNote(
    conversation: ChatConversation,
    customFilename?: string
  ): Promise<TFile | null> {
    try {
      const filename = customFilename || this.generateFilename(conversation);
      const savePath = this.getSavePath(filename);
      
      // Ensure save directory exists
      await this.ensureSaveDirectory();
      
      const content = this.generateNoteContent(conversation);
      
      // Check if file already exists and handle collision
      const finalPath = await this.handleFileCollision(savePath);
      
      const file = await this.app.vault.create(finalPath, content);
      
      new Notice(`Chat saved to: ${file.path}`);
      return file;
    } catch (error) {
      console.error('Failed to save chat to note:', error);
      new Notice('Failed to save chat to note');
      return null;
    }
  }

  /**
   * Generate filename from conversation
   */
  private generateFilename(conversation: ChatConversation): string {
    const date = conversation.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Use conversation title if available, otherwise generate from first message
    let title = conversation.title;
    if (!title || title.startsWith('Chat ')) {
      const firstUserMessage = conversation.messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        title = this.truncateForFilename(firstUserMessage.content);
      } else {
        title = 'untitled-chat';
      }
    }
    
    // Sanitize title for filename
    const sanitizedTitle = this.sanitizeFilename(title);
    
    return `${date}_${sanitizedTitle}.md`;
  }

  /**
   * Truncate text for filename use
   */
  private truncateForFilename(text: string): string {
    // Remove newlines and extra spaces
    const cleaned = text.replace(/\s+/g, ' ').trim();
    // Take first 30 characters, truncate at word boundary
    const truncated = cleaned.substring(0, 30);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 15 ? truncated.substring(0, lastSpace) : truncated;
  }

  /**
   * Sanitize filename to remove invalid characters
   */
  private sanitizeFilename(filename: string): string {
    // Replace invalid filename characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }

  /**
   * Get the full save path
   */
  private getSavePath(filename: string): string {
    const saveLocation = this.settings.chatDefaultSaveLocation || '';
    return saveLocation ? `${saveLocation}/${filename}` : filename;
  }

  /**
   * Ensure save directory exists
   */
  private async ensureSaveDirectory(): Promise<void> {
    const saveLocation = this.settings.chatDefaultSaveLocation;
    if (saveLocation && !(await this.app.vault.adapter.exists(saveLocation))) {
      await this.app.vault.createFolder(saveLocation);
    }
  }

  /**
   * Handle file collision by appending counter
   */
  private async handleFileCollision(originalPath: string): Promise<string> {
    let finalPath = originalPath;
    let counter = 1;
    
    while (await this.app.vault.adapter.exists(finalPath)) {
      const pathParts = originalPath.split('.');
      const extension = pathParts.pop();
      const basePath = pathParts.join('.');
      finalPath = `${basePath}_${counter}.${extension}`;
      counter++;
    }
    
    return finalPath;
  }

  /**
   * Generate the complete note content with YAML frontmatter
   */
  private generateNoteContent(conversation: ChatConversation): string {
    const metadata = this.generateMetadata(conversation);
    const yamlFrontmatter = this.generateYamlFrontmatter(metadata);
    const chatContent = this.generateChatContent(conversation);
    
    return `${yamlFrontmatter}\n${chatContent}`;
  }

  /**
   * Generate metadata for the saved chat
   */
  private generateMetadata(conversation: ChatConversation): SavedChatMetadata {
    const providerSettings = this.settings.aiProviderSettings[this.settings.apiProvider] as any;
    
    return {
      chatSeparator: this.settings.chatSeparator,
      apiProvider: this.settings.apiProvider,
      model: providerSettings.model || 'unknown',
      systemPrompt: providerSettings.system_prompt || '',
      temperature: providerSettings.temperature || 1.0,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: conversation.messages.length
    };
  }

  /**
   * Generate YAML frontmatter
   */
  private generateYamlFrontmatter(metadata: SavedChatMetadata): string {
    return `---
vault-bot-chat: true
chat-separator: ${JSON.stringify(metadata.chatSeparator)}
api-provider: "${metadata.apiProvider}"
model: "${metadata.model}"
system-prompt: ${JSON.stringify(metadata.systemPrompt)}
temperature: ${metadata.temperature}
created-at: "${metadata.createdAt}"
updated-at: "${metadata.updatedAt}"
message-count: ${metadata.messageCount}
---`;
  }

  /**
   * Generate chat content using chat separator
   */
  private generateChatContent(conversation: ChatConversation): string {
    const separator = this.settings.chatSeparator;
    const parts: string[] = [];
    
    for (const message of conversation.messages) {
      // Skip system messages in the note content
      if (message.role === 'system') continue;
      
      parts.push(message.content.trim());
    }
    
    return parts.join(separator);
  }

  /**
   * Quick save current conversation (for use in chat view)
   */
  async quickSave(conversation: ChatConversation): Promise<TFile | null> {
    if (conversation.messages.length === 0) {
      new Notice('Cannot save empty conversation');
      return null;
    }
    
    return this.saveConversationToNote(conversation);
  }
}
