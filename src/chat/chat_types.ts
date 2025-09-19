/**
 * Chat data models and types for the Vault-Bot chat view
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isEditing?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatViewState {
  currentConversation: ChatConversation | null;
  isStreaming: boolean;
  abortController: AbortController | null;
}

export interface SavedChatMetadata {
  chatSeparator: string;
  apiProvider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Generate a unique ID for chat messages
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique ID for conversations
 */
export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new chat message
 */
export function createChatMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  options: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: generateMessageId(),
    role,
    content,
    timestamp: new Date(),
    isStreaming: false,
    isEditing: false,
    ...options
  };
}

/**
 * Create a new conversation
 */
export function createConversation(title?: string): ChatConversation {
  const now = new Date();
  return {
    id: generateConversationId(),
    title: title || `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Generate a conversation title from first user message
 */
export function generateConversationTitle(firstMessage: string): string {
  // Take first 30 characters of the message, truncate at word boundary
  const truncated = firstMessage.substring(0, 30);
  const lastSpace = truncated.lastIndexOf(' ');
  const title = lastSpace > 15 ? truncated.substring(0, lastSpace) : truncated;
  return title + (firstMessage.length > 30 ? '...' : '');
}
