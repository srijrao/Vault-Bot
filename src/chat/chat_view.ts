/**
 * Main chat view component using Obsidian ItemView
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import VaultBotPlugin from '../../main';
import { 
  ChatConversation, 
  ChatMessage, 
  ChatViewState, 
  createConversation, 
  createChatMessage, 
  generateConversationTitle 
} from './chat_types';
import { ChatStorage } from './chat_storage';
import { NoteSaver } from './note_saver';
import { NoteLoader, loadChatFromNote } from './note_loader';
import { ChatMessageComponent } from './chat_message';
import { AIProviderWrapper, AIMessage } from '../aiprovider';

export const CHAT_VIEW_TYPE = 'vault-bot-chat';

export class ChatView extends ItemView {
  private plugin: VaultBotPlugin;
  private state: ChatViewState;
  private storage: ChatStorage;
  private noteSaver: NoteSaver;
  private noteLoader: NoteLoader;
  private messageComponents: Map<string, ChatMessageComponent> = new Map();
  
  // UI Elements
  private headerEl: HTMLElement;
  private messagesContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private inputTextarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: VaultBotPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = {
      currentConversation: null,
      isStreaming: false,
      abortController: null
    };
    
    this.storage = new ChatStorage(this.app, this.plugin.manifest.dir || '');
    this.noteSaver = new NoteSaver(this.app, this.plugin.settings);
    this.noteLoader = new NoteLoader(this.app, this.plugin.settings);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'AI Chat';
  }

  getIcon(): string {
    return 'message-circle';
  }

  async onOpen(): Promise<void> {
    this.createUI();
    await this.initializeConversation();
  }

  async onClose(): Promise<void> {
    this.cleanup();
  }

  /**
   * Create the main UI structure
   */
  private createUI(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('chat-view-container');

    // Header with controls
    this.headerEl = container.createDiv('chat-view-header');
    this.createHeaderControls();

    // Messages container
    this.messagesContainer = container.createDiv('chat-view-messages');
    this.messagesContainer.addEventListener('scroll', this.handleScroll.bind(this));

    // Input container
    this.inputContainer = container.createDiv('chat-view-input');
    this.createInputControls();

    // Add CSS classes for styling
    this.addCustomStyles();
  }

  /**
   * Create header controls
   */
  private createHeaderControls(): void {
    // Title
    const titleEl = this.headerEl.createDiv('chat-view-title');
    titleEl.textContent = this.state.currentConversation?.title || 'New Chat';

    // Controls container
    const controlsEl = this.headerEl.createDiv('chat-view-controls');

    // New chat button
    const newChatBtn = controlsEl.createEl('button', {
      text: 'New Chat',
      cls: 'chat-control-button'
    });
    newChatBtn.onclick = () => this.startNewChat();

    // Save to note button
    const saveBtn = controlsEl.createEl('button', {
      text: 'Save to Note',
      cls: 'chat-control-button'
    });
    saveBtn.onclick = () => this.saveToNote();

    // Copy all button
    const copyAllBtn = controlsEl.createEl('button', {
      text: 'Copy All',
      cls: 'chat-control-button'
    });
    copyAllBtn.onclick = () => this.copyAllMessages();

    // Stop button (hidden by default)
    this.stopButton = controlsEl.createEl('button', {
      text: 'Stop',
      cls: 'chat-control-button chat-control-stop'
    });
    this.stopButton.style.display = 'none';
    this.stopButton.onclick = () => this.stopStreaming();
  }

  /**
   * Create input controls
   */
  private createInputControls(): void {
    // Input textarea
    this.inputTextarea = this.inputContainer.createEl('textarea', {
      cls: 'chat-input-textarea',
      attr: { placeholder: 'Type your message...' }
    });
    
    // Auto-resize textarea
    this.inputTextarea.addEventListener('input', this.handleInputResize.bind(this));
    
    // Handle keyboard shortcuts
    this.inputTextarea.addEventListener('keydown', this.handleInputKeydown.bind(this));

    // Send button
    this.sendButton = this.inputContainer.createEl('button', {
      text: 'Send',
      cls: 'chat-send-button'
    });
    this.sendButton.onclick = () => this.sendMessage();
  }

  /**
   * Initialize with a new conversation or load existing
   */
  private async initializeConversation(): Promise<void> {
    // For now, always start with a new conversation
    // Later we could add conversation list and persistence
    this.startNewChat();
  }

  /**
   * Start a new chat conversation
   */
  private startNewChat(): void {
    // Save current conversation if it exists
    if (this.state.currentConversation && this.state.currentConversation.messages.length > 0) {
      this.storage.autoSaveConversation(this.state.currentConversation);
    }

    // Create new conversation
    this.state.currentConversation = createConversation();
    this.clearMessages();
    this.updateTitle();
  }

  /**
   * Load chat from note
   */
  async loadChatFromNote(): Promise<void> {
    const conversation = await loadChatFromNote(this.app, this.plugin.settings);
    if (conversation) {
      this.state.currentConversation = conversation;
      this.renderAllMessages();
      this.updateTitle();
    }
  }

  /**
   * Send a message
   */
  private async sendMessage(): Promise<void> {
    console.log('ChatView: sendMessage called');
    
    if (this.state.isStreaming) {
      new Notice('Please wait for the current response to complete');
      return;
    }

    const content = this.inputTextarea.value.trim();
    console.log('ChatView: message content:', content);
    
    if (!content) {
      console.log('ChatView: empty content, returning');
      return;
    }

    // Check if conversation exists
    if (!this.state.currentConversation) {
      console.log('ChatView: no conversation, creating new one');
      this.startNewChat();
    }

    console.log('ChatView: current conversation:', this.state.currentConversation);

    // Clear input
    this.inputTextarea.value = '';
    this.handleInputResize();

    // Add user message
    const userMessage = createChatMessage('user', content);
    console.log('ChatView: created user message:', userMessage);
    this.addMessage(userMessage);

    // Update title if this is the first message
    if (this.state.currentConversation!.messages.length === 1) {
      this.state.currentConversation!.title = generateConversationTitle(content);
      this.updateTitle();
    }

    // Get AI response
    console.log('ChatView: getting AI response');
    await this.getAIResponse();
  }

  /**
   * Get AI response with streaming
   */
  private async getAIResponse(): Promise<void> {
    console.log('ChatView: getAIResponse called');
    
    if (!this.state.currentConversation) {
      console.log('ChatView: no conversation for AI response');
      return;
    }

    this.state.isStreaming = true;
    this.state.abortController = new AbortController();
    this.updateStreamingUI();

    try {
      console.log('ChatView: creating AI provider');
      const provider = new AIProviderWrapper(this.plugin.settings, this.app);
      
      // Create assistant message for streaming
      const assistantMessage = createChatMessage('assistant', '', { isStreaming: true });
      console.log('ChatView: created assistant message:', assistantMessage);
      this.addMessage(assistantMessage);
      
      // Convert chat messages to AI messages
      const aiMessages = this.convertToAIMessages();
      console.log('ChatView: converted messages for AI:', aiMessages);
      
      // Track accumulated content for streaming
      let accumulatedContent = '';
      
      // Stream response
      const onUpdate = (text: string) => {
        // Accumulate the text content
        accumulatedContent += text;
        console.log('ChatView: AI response update, total length:', accumulatedContent.length);
        
        // Update the message with accumulated content
        assistantMessage.content = accumulatedContent;
        this.updateMessage(assistantMessage);
      };

      const onComplete = () => {
        console.log('ChatView: AI response complete, final content:', accumulatedContent);
        assistantMessage.content = accumulatedContent;
        assistantMessage.isStreaming = false;
        this.updateMessage(assistantMessage);
        this.state.isStreaming = false;
        this.state.abortController = null;
        this.updateStreamingUI();
        
        // Auto-save conversation
        if (this.state.currentConversation) {
          this.storage.autoSaveConversation(this.state.currentConversation);
        }
      };

      console.log('ChatView: starting streaming response');
      await provider.getStreamingResponseWithConversation(
        aiMessages,
        onUpdate,
        this.state.abortController.signal
      );
      
      onComplete();
    } catch (error: any) {
      console.error('ChatView: AI response error:', error);
      if (error.name !== 'AbortError') {
        new Notice('Error getting AI response: ' + error.message);
      }
      
      this.state.isStreaming = false;
      this.state.abortController = null;
      this.updateStreamingUI();
    }
  }

  /**
   * Convert chat messages to AI messages
   */
  private convertToAIMessages(): AIMessage[] {
    if (!this.state.currentConversation) return [];
    
    const messages: AIMessage[] = [];
    
    // Add system prompt
    const provider = new AIProviderWrapper(this.plugin.settings, this.app);
    const systemPrompt = provider.getSystemPrompt();
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    // Add conversation messages (excluding streaming ones)
    for (const msg of this.state.currentConversation.messages) {
      if (!msg.isStreaming) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    return messages;
  }

  /**
   * Stop streaming
   */
  private stopStreaming(): void {
    if (this.state.abortController) {
      this.state.abortController.abort();
      this.state.abortController = null;
    }
    this.state.isStreaming = false;
    this.updateStreamingUI();
  }

  /**
   * Add message to conversation and UI
   */
  private addMessage(message: ChatMessage): void {
    console.log('ChatView: addMessage called with:', message);
    
    if (!this.state.currentConversation) {
      console.log('ChatView: no current conversation');
      return;
    }
    
    this.state.currentConversation.messages.push(message);
    console.log('ChatView: message added to conversation, total messages:', this.state.currentConversation.messages.length);
    
    this.renderMessage(message);
    console.log('ChatView: message rendered');
    
    this.scrollToBottom();
  }

  /**
   * Update existing message
   */
  private updateMessage(message: ChatMessage): void {
    console.log('ChatView: updateMessage called for message:', message.id, 'content length:', message.content.length);
    const component = this.messageComponents.get(message.id);
    if (component) {
      console.log('ChatView: updating component');
      component.updateMessage(message);
    } else {
      console.log('ChatView: component not found for message:', message.id);
    }
  }

  /**
   * Render a single message
   */
  private renderMessage(message: ChatMessage): void {
    console.log('ChatView: renderMessage called with:', message);
    
    const component = new ChatMessageComponent(message, {
      onEdit: this.handleMessageEdit.bind(this),
      onDelete: this.handleMessageDelete.bind(this),
      onCopy: this.handleMessageCopy.bind(this),
      onRegenerate: this.handleMessageRegenerate.bind(this)
    });
    
    console.log('ChatView: message component created');
    
    this.messageComponents.set(message.id, component);
    const element = component.getElement();
    console.log('ChatView: component element:', element);
    
    this.messagesContainer.appendChild(element);
    console.log('ChatView: element appended to container');
  }

  /**
   * Render all messages in the conversation
   */
  private renderAllMessages(): void {
    this.clearMessages();
    if (this.state.currentConversation) {
      for (const message of this.state.currentConversation.messages) {
        this.renderMessage(message);
      }
    }
    this.scrollToBottom();
  }

  /**
   * Clear all rendered messages
   */
  private clearMessages(): void {
    this.messagesContainer.empty();
    this.messageComponents.clear();
  }

  /**
   * Update conversation title
   */
  private updateTitle(): void {
    const titleEl = this.headerEl.querySelector('.chat-view-title') as HTMLElement;
    if (titleEl) {
      titleEl.textContent = this.state.currentConversation?.title || 'New Chat';
    }
  }

  /**
   * Update UI for streaming state
   */
  private updateStreamingUI(): void {
    this.sendButton.disabled = this.state.isStreaming;
    this.inputTextarea.disabled = this.state.isStreaming;
    this.stopButton.style.display = this.state.isStreaming ? 'block' : 'none';
  }

  /**
   * Handle scroll events
   */
  private handleScroll(): void {
    // Could implement auto-scroll behavior or load more messages
  }

  /**
   * Handle input textarea resize
   */
  private handleInputResize(): void {
    this.inputTextarea.style.height = 'auto';
    this.inputTextarea.style.height = Math.min(this.inputTextarea.scrollHeight, 200) + 'px';
  }

  /**
   * Handle input keydown events
   */
  private handleInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  /**
   * Scroll to bottom of messages
   */
  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Handle message edit
   */
  private handleMessageEdit(messageId: string, newContent: string): void {
    if (!this.state.currentConversation) return;
    
    const message = this.state.currentConversation.messages.find(m => m.id === messageId);
    if (message) {
      message.content = newContent;
      this.updateMessage(message);
      
      // Auto-save
      this.storage.autoSaveConversation(this.state.currentConversation);
    }
  }

  /**
   * Handle message delete
   */
  private handleMessageDelete(messageId: string): void {
    if (!this.state.currentConversation) return;
    
    const messageIndex = this.state.currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      // Remove message from conversation
      this.state.currentConversation.messages.splice(messageIndex, 1);
      
      // Remove message component
      const component = this.messageComponents.get(messageId);
      if (component) {
        component.destroy();
        this.messageComponents.delete(messageId);
      }
      
      // Auto-save
      this.storage.autoSaveConversation(this.state.currentConversation);
    }
  }

  /**
   * Handle message copy
   */
  private handleMessageCopy(content: string): void {
    new Notice('Message copied to clipboard');
  }

  /**
   * Handle message regeneration
   */
  private async handleMessageRegenerate(messageId: string): Promise<void> {
    if (!this.state.currentConversation || this.state.isStreaming) return;
    
    const messageIndex = this.state.currentConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    // Remove the selected message and all messages after it
    const messagesToRemove = this.state.currentConversation.messages.splice(messageIndex);
    
    // Remove components for deleted messages
    for (const msg of messagesToRemove) {
      const component = this.messageComponents.get(msg.id);
      if (component) {
        component.destroy();
        this.messageComponents.delete(msg.id);
      }
    }
    
    // Get new AI response
    await this.getAIResponse();
  }

  /**
   * Save conversation to note
   */
  private async saveToNote(): Promise<void> {
    if (!this.state.currentConversation || this.state.currentConversation.messages.length === 0) {
      new Notice('No conversation to save');
      return;
    }
    
    await this.noteSaver.quickSave(this.state.currentConversation);
  }

  /**
   * Copy all messages to clipboard
   */
  private async copyAllMessages(): Promise<void> {
    if (!this.state.currentConversation || this.state.currentConversation.messages.length === 0) {
      new Notice('No messages to copy');
      return;
    }
    
    const separator = this.plugin.settings.chatSeparator;
    const content = this.state.currentConversation.messages
      .filter(m => m.role !== 'system')
      .map(m => m.content)
      .join(separator);
    
    try {
      await navigator.clipboard.writeText(content);
      new Notice('All messages copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      new Notice('Failed to copy messages');
    }
  }

  /**
   * Add custom styles
   */
  private addCustomStyles(): void {
    // Add CSS classes that will be styled in styles.css
    this.containerEl.addClass('vault-bot-chat-view');
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.state.abortController) {
      this.state.abortController.abort();
    }
    
    this.storage.cleanup();
    
    for (const component of this.messageComponents.values()) {
      component.destroy();
    }
    this.messageComponents.clear();
  }
}

/**
 * Open chat view in workspace
 */
export async function openChatView(plugin: VaultBotPlugin): Promise<void> {
  const { workspace } = plugin.app;
  
  let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
  if (!leaf) {
    const rightLeaf = workspace.getRightLeaf(false);
    if (rightLeaf) {
      leaf = rightLeaf;
      await leaf.setViewState({ type: CHAT_VIEW_TYPE });
    } else {
      // Fallback to creating a new leaf
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: CHAT_VIEW_TYPE });
    }
  }
  
  workspace.revealLeaf(leaf);
}
