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
import { generateTitle } from '../utils/title_generator';
import { recordChatCall, type ChatMessage as RecorderChatMessage, type ChatRequestRecord, type ChatResponseRecord, resolveAiCallsDir } from '../recorder';

export const CHAT_VIEW_TYPE = 'vault-bot-chat';

export class ChatView extends ItemView {
  private plugin: VaultBotPlugin;
  private state: ChatViewState;
  private storage: ChatStorage;
  private noteSaver: NoteSaver;
  private noteLoader: NoteLoader;
  private messageComponents: Map<string, ChatMessageComponent> = new Map();
  private renderingMode: 'reading' | 'source' = 'reading';
  private lastAutoSaveIndicator: HTMLElement | null = null;
  private pendingRecording: {
    requestRecord: ChatRequestRecord;
    responseRecord: ChatResponseRecord;
    requestStart: Date;
  } | null = null;
  
  // UI Elements
  private headerEl: HTMLElement;
  private messagesContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private inputTextarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private stopButton: HTMLButtonElement;
  private toggleSwitch: HTMLElement;
  private toggleLabels: HTMLElement;
  private modelInfoEl: HTMLElement;

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
    // Model info (faded text at top)
    this.modelInfoEl = this.headerEl.createDiv('chat-view-model-info');
    this.updateModelInfo();

    // Header row with title and main controls
    const headerRowEl = this.headerEl.createDiv('chat-view-header-row');
    
    // Title
    const titleEl = headerRowEl.createDiv('chat-view-title');
    titleEl.textContent = this.state.currentConversation?.title || 'New Chat';

    // Controls container
    const controlsEl = headerRowEl.createDiv('chat-view-controls');

    // Rendering mode toggle group
    const toggleGroupEl = controlsEl.createDiv('chat-view-toggle-group');
    
    // Left label (Reading)
    const readingLabelEl = toggleGroupEl.createSpan({
      text: 'Reading',
      cls: 'chat-view-toggle-label active'
    });
    
    // Toggle switch
    const toggleSwitchEl = toggleGroupEl.createDiv('chat-view-toggle-switch');
    const toggleSliderEl = toggleSwitchEl.createDiv('chat-view-toggle-slider');
    
    // Right label (Source)  
    const sourceLabelEl = toggleGroupEl.createSpan({
      text: 'Source',
      cls: 'chat-view-toggle-label'
    });
    
    // Store references
    this.toggleSwitch = toggleSwitchEl;
    this.toggleLabels = toggleGroupEl;
    
    // Click handler for the entire toggle group
    toggleSwitchEl.onclick = () => {
      const newMode = this.renderingMode === 'reading' ? 'source' : 'reading';
      this.setRenderingMode(newMode);
    };

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
    // Button area above input
    const buttonAreaEl = this.inputContainer.createDiv('chat-input-button-area');
    
    // Settings button
    const settingsBtn = buttonAreaEl.createEl('button', {
      text: 'Model Settings',
      cls: 'chat-input-button'
    });
    settingsBtn.onclick = () => this.openModelSettings();

    // Auto-save indicator
    const autoSaveIndicator = buttonAreaEl.createDiv('chat-auto-save-indicator');
    autoSaveIndicator.innerHTML = '<span class="save-icon">💾</span>Auto-saved';
    this.lastAutoSaveIndicator = autoSaveIndicator;

    // Main input area
    const inputMainEl = this.inputContainer.createDiv('chat-input-main');

    // Input textarea
    this.inputTextarea = inputMainEl.createEl('textarea', {
      cls: 'chat-input-textarea',
      attr: { placeholder: 'Type your message...' }
    });
    
    // Auto-resize textarea
    this.inputTextarea.addEventListener('input', this.handleInputResize.bind(this));
    
    // Handle keyboard shortcuts
    this.inputTextarea.addEventListener('keydown', this.handleInputKeydown.bind(this));

    // Send button
    this.sendButton = inputMainEl.createEl('button', {
      text: 'Send',
      cls: 'chat-send-button'
    });
    this.sendButton.onclick = () => this.sendMessage();
  }

  /**
   * Initialize with a new conversation or load existing
   */
  private async initializeConversation(): Promise<void> {
    // Try to load the last active conversation
    const lastConversation = await this.loadLastActiveConversation();
    
    if (lastConversation) {
      this.state.currentConversation = lastConversation;
      this.renderAllMessages();
      this.updateTitle();
    } else {
      // Start with a new conversation if none exists
      this.startNewChat();
    }
  }

  /**
   * Load the last active conversation
   */
  private async loadLastActiveConversation(): Promise<ChatConversation | null> {
    try {
      const adapter = this.app.vault.adapter;
      const activeConversationPath = `${this.plugin.manifest.dir}/active_conversation.json`;
      
      if (await adapter.exists(activeConversationPath)) {
        const data = await adapter.read(activeConversationPath);
        const conversationData = JSON.parse(data);
        
        // Convert timestamp strings back to Date objects
        conversationData.messages = conversationData.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        conversationData.createdAt = new Date(conversationData.createdAt);
        conversationData.updatedAt = new Date(conversationData.updatedAt);
        
        return conversationData as ChatConversation;
      }
    } catch (error) {
      console.error('Error loading last active conversation:', error);
    }
    
    return null;
  }

  /**
   * Save current conversation as active
   */
  private async saveActiveConversation(): Promise<void> {
    if (!this.state.currentConversation) return;
    
    try {
      const adapter = this.app.vault.adapter;
      const activeConversationPath = `${this.plugin.manifest.dir}/active_conversation.json`;
      
      // Prepare data for saving (convert dates to strings)
      const dataToSave = {
        ...this.state.currentConversation,
        messages: this.state.currentConversation.messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString(),
          // Remove runtime-only properties
          isStreaming: undefined,
          isEditing: undefined
        })),
        createdAt: this.state.currentConversation.createdAt.toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await adapter.write(activeConversationPath, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
      console.error('Error saving active conversation:', error);
    }
  }

  /**
   * Start a new chat conversation
   */
  private async startNewChat(): Promise<void> {
    // Auto-save current conversation if enabled and conversation has content
    if (this.state.currentConversation && 
        this.state.currentConversation.messages.length > 0 && 
        this.plugin.settings.chatAutoSaveNotes) {
      await this.autoSaveCurrentConversation();
    }

    // Save current conversation to storage if it exists
    if (this.state.currentConversation && this.state.currentConversation.messages.length > 0) {
      this.storage.autoSaveConversation(this.state.currentConversation);
    }

    // Create new conversation
    this.state.currentConversation = createConversation();
    this.clearMessages();
    this.updateTitle();
    
    // Save the new empty conversation as active
    this.saveActiveConversation();
  }

  /**
   * Auto-save current conversation to a note
   */
  private async autoSaveCurrentConversation(): Promise<void> {
    if (!this.state.currentConversation || this.state.currentConversation.messages.length === 0) {
      return;
    }

    try {
      const savedFile = await this.noteSaver.saveConversationToNote(this.state.currentConversation);
      
      if (savedFile && this.lastAutoSaveIndicator) {
        // Show auto-save indicator with clickable link
        this.lastAutoSaveIndicator.innerHTML = `
          <span class="save-icon">💾</span>
          Auto-saved: <span class="chat-saved-note-link">${savedFile.basename}</span>
        `;
        this.lastAutoSaveIndicator.classList.add('visible');
        
        // Add click handler to open the saved note
        const link = this.lastAutoSaveIndicator.querySelector('.chat-saved-note-link');
        if (link) {
          link.addEventListener('click', () => {
            this.app.workspace.openLinkText(savedFile.path, '', false);
          });
        }
        
        // Hide indicator after 5 seconds
        setTimeout(() => {
          if (this.lastAutoSaveIndicator) {
            this.lastAutoSaveIndicator.classList.remove('visible');
          }
        }, 5000);
      }
    } catch (error) {
      console.error('Error auto-saving conversation:', error);
    }
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

    // Generate title after 2 messages (user message + first AI response)
    const messageCount = this.state.currentConversation!.messages.length;
    if (messageCount === 1) {
      // Use simple title for first message
      this.state.currentConversation!.title = generateConversationTitle(content);
      this.updateTitle();
    }

    // Get AI response
    console.log('ChatView: getting AI response');
    await this.getAIResponse();
    
    // Generate AI title after 2 messages
    if (messageCount === 1 && this.state.currentConversation!.messages.length >= 2) {
      this.generateAndSetTitle();
    }
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

      const onComplete = async () => {
        console.log('ChatView: AI response complete, final content:', accumulatedContent);
        assistantMessage.content = accumulatedContent;
        assistantMessage.isStreaming = false;
        this.updateMessage(assistantMessage);
        this.state.isStreaming = false;
        this.state.abortController = null;
        this.updateStreamingUI();
        
        // Complete recording if enabled
        if (this.pendingRecording && this.plugin.settings.recordApiCalls) {
          try {
            this.pendingRecording.responseRecord.content = accumulatedContent;
            this.pendingRecording.responseRecord.timestamp = new Date().toISOString();
            this.pendingRecording.responseRecord.duration_ms = Date.now() - this.pendingRecording.requestStart.getTime();

            const dir = resolveAiCallsDir(this.app);
            await recordChatCall({
              dir,
              provider: this.pendingRecording.requestRecord.provider,
              model: this.pendingRecording.requestRecord.model,
              request: this.pendingRecording.requestRecord,
              response: this.pendingRecording.responseRecord
            });
            
            this.pendingRecording = null;
          } catch (error) {
            console.error('Error completing chat call recording:', error);
          }
        }
        
        // Auto-save conversation
        if (this.state.currentConversation) {
          this.storage.autoSaveConversation(this.state.currentConversation);
        }
      };

      console.log('ChatView: starting streaming response');
      await provider.getStreamingResponseWithConversation(
        aiMessages,
        onUpdate,
        this.state.abortController.signal,
        this.createRecordingCallback(), // Recording callback
        undefined, // currentFile
        true // isConversationMode
      );
      
      await onComplete();
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
   * Update model info display
   */
  private updateModelInfo(): void {
    const provider = this.plugin.settings.apiProvider;
    const settings = this.plugin.settings.aiProviderSettings[provider];
    const model = settings && 'model' in settings ? (settings as any).model : 'Unknown';
    
    this.modelInfoEl.textContent = `${provider.toUpperCase()} - ${model}`;
  }

  /**
   * Set rendering mode and update all messages
   */
  private setRenderingMode(mode: 'reading' | 'source'): void {
    this.renderingMode = mode;
    
    // Update toggle switch state
    this.toggleSwitch.classList.toggle('active', mode === 'source');
    
    // Update label states
    const labels = this.toggleLabels.querySelectorAll('.chat-view-toggle-label');
    labels.forEach((label, index) => {
      const isActive = (index === 0 && mode === 'reading') || (index === 1 && mode === 'source');
      label.classList.toggle('active', isActive);
    });
    
    // Update all existing message components
    for (const component of this.messageComponents.values()) {
      component.setRenderingMode(mode);
    }
  }

  /**
   * Open model settings
   */
  private openModelSettings(): void {
    // Open the plugin settings tab
    // @ts-ignore - app.setting is available in Obsidian
    this.app.setting.open();
    
    // Try to navigate to the plugin's tab
    // @ts-ignore
    const settingTab = this.app.setting.openTabById(this.plugin.manifest.id);
    if (settingTab) {
      // Focus on model settings section if possible
      setTimeout(() => {
        const modelSection = document.querySelector('[data-setting-key="model-settings"]');
        if (modelSection) {
          modelSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }

  /**
   * Generate and set conversation title using AI
   */
  private async generateAndSetTitle(): Promise<void> {
    if (!this.state.currentConversation || this.state.currentConversation.messages.length < 2) {
      return;
    }

    try {
      // Use the first user message and AI response to generate a title
      const conversationText = this.state.currentConversation.messages
        .slice(0, 2)
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const generatedTitle = await generateTitle(conversationText, this.plugin.settings);
      
      if (generatedTitle && generatedTitle !== 'Chat Conversation') {
        this.state.currentConversation.title = generatedTitle;
        this.updateTitle();
        this.saveActiveConversation();
      }
    } catch (error) {
      console.error('Error generating conversation title:', error);
    }
  }

  /**
   * Create recording callback for AI calls
   */
  private createRecordingCallback() {
    return async (messages: RecorderChatMessage[], model: string, options: Record<string, any>) => {
      if (this.plugin.settings.recordApiCalls) {
        try {
          const requestStart = new Date();
          
          const requestRecord: ChatRequestRecord = {
            messages: messages,
            provider: this.plugin.settings.apiProvider,
            model: model,
            timestamp: requestStart.toISOString(),
            options: options
          };

          // Create a response record - we'll update this after streaming completes
          const responseRecord: ChatResponseRecord = {
            content: '', // Will be filled by streaming
            provider: this.plugin.settings.apiProvider,
            model: model,
            timestamp: new Date().toISOString(),
            duration_ms: 0 // Will be calculated
          };

          // Store for later completion
          this.pendingRecording = {
            requestRecord,
            responseRecord,
            requestStart
          };

        } catch (error) {
          console.error('Error preparing chat call recording:', error);
        }
      }
    };
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
    
    // Save conversation state
    this.saveActiveConversation();
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
    }, this.renderingMode);
    
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
  /**
   * Refresh the model info display (called when settings change)
   */
  public refreshModelInfo(): void {
    if (this.modelInfoEl) {
      this.updateModelInfo();
    }
  }

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
