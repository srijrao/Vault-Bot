/**
 * Utility function for generating titles using AI providers
 */

import { AIProviderWrapper } from '../aiprovider';
import { VaultBotPluginSettings } from '../settings';

/**
 * Generate a title for given text using the current AI provider
 */
export async function generateTitle(
  text: string, 
  settings: VaultBotPluginSettings,
  maxLength: number = 50
): Promise<string> {
  try {
    const aiProvider = new AIProviderWrapper(settings);
    
    // Create a simple prompt for title generation
    const prompt = `Generate a short, descriptive title (max ${maxLength} characters) for the following text. Return only the title, no quotes or extra text:\n\n${text.substring(0, 500)}`;
    
    // Use streaming but collect the full response
    let fullResponse = '';
    
    await aiProvider.getStreamingResponseWithConversation(
      [{ role: 'user', content: prompt }],
      (chunk: string) => {
        fullResponse += chunk;
      },
      new AbortController().signal
    );
    
    if (fullResponse) {
      // Clean up the response - remove quotes, extra whitespace, etc.
      let title = fullResponse
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .substring(0, maxLength);
      
      // Ensure title doesn't end mid-word
      if (title.length === maxLength && fullResponse.length > maxLength) {
        const lastSpace = title.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.7) { // Only truncate if we don't lose too much
          title = title.substring(0, lastSpace);
        }
      }
      
      return title || 'Chat Conversation';
    }
    
    return 'Chat Conversation';
    
  } catch (error) {
    console.error('Error generating title:', error);
    
    // Fallback: generate title from first few words of the text
    return generateFallbackTitle(text, maxLength);
  }
}

/**
 * Generate a simple fallback title from text without AI
 */
export function generateFallbackTitle(text: string, maxLength: number = 50): string {
  if (!text || text.trim().length === 0) {
    return 'Chat Conversation';
  }
  
  // Clean the text and take first few words
  const cleanText = text
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' '); // Normalize whitespace
  
  const words = cleanText.split(' ').slice(0, 8);
  let title = words.join(' ');
  
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }
  
  return title || 'Chat Conversation';
}

/**
 * Generate filename-safe title for notes
 */
export function generateFilenameSafeTitle(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, 100); // Limit length for filesystem compatibility
}
