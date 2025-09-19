/**
 * Chat message component with hover actions and editing capabilities
 */

import { ChatMessage } from './chat_types';

export class ChatMessageComponent {
  private message: ChatMessage;
  private element: HTMLElement;
  private onEdit: (messageId: string, newContent: string) => void;
  private onDelete: (messageId: string) => void;
  private onCopy: (content: string) => void;
  private onRegenerate: (messageId: string) => void;
  private isEditing: boolean = false;
  private editTextarea: HTMLTextAreaElement | null = null;

  constructor(
    message: ChatMessage,
    callbacks: {
      onEdit: (messageId: string, newContent: string) => void;
      onDelete: (messageId: string) => void;
      onCopy: (content: string) => void;
      onRegenerate: (messageId: string) => void;
    }
  ) {
    this.message = message;
    this.onEdit = callbacks.onEdit;
    this.onDelete = callbacks.onDelete;
    this.onCopy = callbacks.onCopy;
    this.onRegenerate = callbacks.onRegenerate;
    this.element = this.createElement();
  }

  /**
   * Get the DOM element for this message
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Update message content and re-render
   */
  updateMessage(message: ChatMessage): void {
    console.log('ChatMessageComponent: updateMessage called, old content length:', this.message.content.length, 'new content length:', message.content.length);
    this.message = message;
    this.render();
  }

  /**
   * Create the message element
   */
  private createElement(): HTMLElement {
    console.log('ChatMessageComponent: createElement called for message:', this.message);
    
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message chat-message-${this.message.role}`;
    messageEl.dataset.messageId = this.message.id;
    
    console.log('ChatMessageComponent: element created with classes:', messageEl.className);
    
    // Assign to this.element BEFORE calling render()
    this.element = messageEl;
    
    this.render();
    this.attachEventListeners();
    
    console.log('ChatMessageComponent: element fully created');
    
    return messageEl;
  }

  /**
   * Render the message content
   */
  private render(): void {
    const isStreaming = this.message.isStreaming;
    const isEditing = this.message.isEditing || this.isEditing;
    
    this.element.innerHTML = '';
    
    // Message header with role and timestamp
    const header = document.createElement('div');
    header.className = 'chat-message-header';
    
    const roleEl = document.createElement('span');
    roleEl.className = 'chat-message-role';
    roleEl.textContent = this.capitalizeRole(this.message.role);
    header.appendChild(roleEl);
    
    const timestampEl = document.createElement('span');
    timestampEl.className = 'chat-message-timestamp';
    timestampEl.textContent = this.formatTimestamp(this.message.timestamp);
    header.appendChild(timestampEl);
    
    // Streaming indicator
    if (isStreaming) {
      const streamingEl = document.createElement('span');
      streamingEl.className = 'chat-message-streaming';
      streamingEl.textContent = '●';
      header.appendChild(streamingEl);
    }
    
    this.element.appendChild(header);
    
    // Message content
    const contentEl = document.createElement('div');
    contentEl.className = 'chat-message-content';
    
    if (isEditing) {
      this.renderEditMode(contentEl);
    } else {
      this.renderViewMode(contentEl);
    }
    
    this.element.appendChild(contentEl);
    
    // Hover actions (only show for non-system messages and when not editing)
    if (this.message.role !== 'system' && !isEditing && !isStreaming) {
      const actionsEl = this.createActionsElement();
      this.element.appendChild(actionsEl);
    }
  }

  /**
   * Render message in view mode
   */
  private renderViewMode(contentEl: HTMLElement): void {
    const textEl = document.createElement('div');
    textEl.className = 'chat-message-text';
    textEl.textContent = this.message.content;
    contentEl.appendChild(textEl);
  }

  /**
   * Render message in edit mode
   */
  private renderEditMode(contentEl: HTMLElement): void {
    this.editTextarea = document.createElement('textarea');
    this.editTextarea.className = 'chat-message-edit-textarea';
    this.editTextarea.value = this.message.content;
    this.editTextarea.rows = Math.max(3, this.message.content.split('\n').length);
    
    // Auto-resize textarea
    this.editTextarea.addEventListener('input', () => {
      if (this.editTextarea) {
        this.editTextarea.style.height = 'auto';
        this.editTextarea.style.height = this.editTextarea.scrollHeight + 'px';
      }
    });
    
    // Handle keyboard shortcuts
    this.editTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cancelEdit();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.saveEdit();
      }
    });
    
    contentEl.appendChild(this.editTextarea);
    
    // Edit actions
    const editActionsEl = document.createElement('div');
    editActionsEl.className = 'chat-message-edit-actions';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'chat-message-edit-save';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => this.saveEdit();
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'chat-message-edit-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => this.cancelEdit();
    
    editActionsEl.appendChild(saveBtn);
    editActionsEl.appendChild(cancelBtn);
    contentEl.appendChild(editActionsEl);
    
    // Focus textarea
    setTimeout(() => {
      if (this.editTextarea) {
        this.editTextarea.focus();
        this.editTextarea.setSelectionRange(this.editTextarea.value.length, this.editTextarea.value.length);
      }
    }, 0);
  }

  /**
   * Create hover actions element
   */
  private createActionsElement(): HTMLElement {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'chat-message-actions';
    
    // Edit button
    const editBtn = this.createActionButton('edit', 'Edit', () => this.startEdit());
    actionsEl.appendChild(editBtn);
    
    // Copy button
    const copyBtn = this.createActionButton('copy', 'Copy', () => this.copyMessage());
    actionsEl.appendChild(copyBtn);
    
    // Regenerate button (only for assistant messages)
    if (this.message.role === 'assistant') {
      const regenBtn = this.createActionButton('regenerate', 'Regenerate', () => this.regenerateMessage());
      actionsEl.appendChild(regenBtn);
    }
    
    // Delete button
    const deleteBtn = this.createActionButton('delete', 'Delete', () => this.deleteMessage());
    deleteBtn.className += ' chat-message-action-delete';
    actionsEl.appendChild(deleteBtn);
    
    return actionsEl;
  }

  /**
   * Create an action button
   */
  private createActionButton(icon: string, tooltip: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `chat-message-action chat-message-action-${icon}`;
    btn.title = tooltip;
    btn.onclick = onClick;
    
    // Use text content for now, could be replaced with actual icons
    const iconMap: Record<string, string> = {
      edit: '✏️',
      copy: '📋',
      regenerate: '🔄',
      delete: '🗑️'
    };
    
    btn.textContent = iconMap[icon] || '?';
    
    return btn;
  }

  /**
   * Start editing mode
   */
  private startEdit(): void {
    this.isEditing = true;
    this.render();
  }

  /**
   * Save edit changes
   */
  private saveEdit(): void {
    if (this.editTextarea) {
      const newContent = this.editTextarea.value.trim();
      if (newContent !== this.message.content) {
        this.onEdit(this.message.id, newContent);
      }
    }
    this.cancelEdit();
  }

  /**
   * Cancel edit mode
   */
  private cancelEdit(): void {
    this.isEditing = false;
    this.editTextarea = null;
    this.render();
  }

  /**
   * Copy message content to clipboard
   */
  private async copyMessage(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.message.content);
      this.onCopy(this.message.content);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: show content in a modal or notice
    }
  }

  /**
   * Trigger message regeneration
   */
  private regenerateMessage(): void {
    this.onRegenerate(this.message.id);
  }

  /**
   * Delete this message
   */
  private deleteMessage(): void {
    this.onDelete(this.message.id);
  }

  /**
   * Attach event listeners for hover effects
   */
  private attachEventListeners(): void {
    let hoverTimeout: NodeJS.Timeout;
    
    this.element.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimeout);
      this.element.classList.add('chat-message-hover');
    });
    
    this.element.addEventListener('mouseleave', () => {
      hoverTimeout = setTimeout(() => {
        this.element.classList.remove('chat-message-hover');
      }, 100);
    });
  }

  /**
   * Capitalize role name for display
   */
  private capitalizeRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: Date): string {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.element.remove();
  }
}
