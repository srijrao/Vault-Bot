/**
 * Chat storage layer for persisting conversations in plugin data directory
 */

import { App, TFile } from 'obsidian';
import { ChatConversation, ChatMessage } from './chat_types';

export class ChatStorage {
  private app: App;
  private dataDir: string;

  constructor(app: App, pluginDataDir: string, chatsDirOverride?: string) {
    this.app = app;
    this.dataDir = chatsDirOverride || `${pluginDataDir}/chats`;
  }

  /**
   * Ensure the chat storage directory exists
   */
  private async ensureDataDir(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.dataDir))) {
      await adapter.mkdir(this.dataDir);
    }
  }

  /**
   * Save a conversation to storage
   */
  async saveConversation(conversation: ChatConversation): Promise<void> {
    await this.ensureDataDir();
    const filename = `${conversation.id}.json`;
    const filepath = `${this.dataDir}/${filename}`;
    
    const data = {
      ...conversation,
      messages: conversation.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString(),
        // Remove runtime-only properties
        isStreaming: undefined,
        isEditing: undefined
      }))
    };

    await this.app.vault.adapter.write(filepath, JSON.stringify(data, null, 2));
  }

  /**
   * Load a conversation from storage
   */
  async loadConversation(conversationId: string): Promise<ChatConversation | null> {
    const filename = `${conversationId}.json`;
    const filepath = `${this.dataDir}/${filename}`;
    
    try {
      const content = await this.app.vault.adapter.read(filepath);
      const data = JSON.parse(content);
      
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        messages: data.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          isStreaming: false,
          isEditing: false
        }))
      };
    } catch (error) {
      console.error(`Failed to load conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * List all saved conversations
   */
  async listConversations(): Promise<ChatConversation[]> {
    await this.ensureDataDir();
    
    try {
      const files = await this.app.vault.adapter.list(this.dataDir);
      const conversations: ChatConversation[] = [];
      
      for (const file of files.files) {
        if (file.endsWith('.json')) {
          const conversationId = file.replace('.json', '').split('/').pop();
          if (conversationId) {
            const conversation = await this.loadConversation(conversationId);
            if (conversation) {
              conversations.push(conversation);
            }
          }
        }
      }
      
      // Sort by updated date, most recent first
      return conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.error('Failed to list conversations:', error);
      return [];
    }
  }

  /**
   * Delete a conversation from storage
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const filename = `${conversationId}.json`;
    const filepath = `${this.dataDir}/${filename}`;
    
    try {
      await this.app.vault.adapter.remove(filepath);
    } catch (error) {
      console.error(`Failed to delete conversation ${conversationId}:`, error);
    }
  }

  /**
   * Update conversation metadata (title, updatedAt)
   */
  async updateConversationMetadata(
    conversationId: string, 
    updates: Partial<Pick<ChatConversation, 'title' | 'updatedAt'>>
  ): Promise<void> {
    const conversation = await this.loadConversation(conversationId);
    if (conversation) {
      Object.assign(conversation, updates);
      await this.saveConversation(conversation);
    }
  }

  /**
   * Auto-save conversation with debouncing
   */
  private saveTimeouts = new Map<string, NodeJS.Timeout>();
  
  autoSaveConversation(conversation: ChatConversation, debounceMs: number = 1000): void {
    const existingTimeout = this.saveTimeouts.get(conversation.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const timeout = setTimeout(async () => {
      try {
        conversation.updatedAt = new Date();
        await this.saveConversation(conversation);
        this.saveTimeouts.delete(conversation.id);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, debounceMs);
    
    this.saveTimeouts.set(conversation.id, timeout);
  }

  /**
   * Clean up any pending auto-save operations
   */
  cleanup(): void {
    for (const timeout of this.saveTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.saveTimeouts.clear();
  }
}
