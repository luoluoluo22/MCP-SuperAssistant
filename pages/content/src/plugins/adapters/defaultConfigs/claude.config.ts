import type { AdapterConfig } from './types';

/**
 * Default configuration for Claude Adapter
 * This serves as the fallback when remote config is not available.
 */
export const CLAUDE_DEFAULT_CONFIG: AdapterConfig = {
  selectors: {
    chatInput: 'div[data-testid="chat-input"][contenteditable="true"], div[contenteditable="true"][aria-label*="Write your prompt to Claude"]',
    submitButton: 'button[aria-label*="Send"], button[data-testid="send-button"], button[type="submit"]',
    fileUploadButton: 'button[aria-label*="Add files"], button[aria-label*="Add files, connectors, and more"]',
    fileInput: 'input[type="file"]',
    mainPanel: 'main, [data-testid="chat-input"], .ProseMirror',
    dropZone: 'div[data-testid="chat-input"][contenteditable="true"], .ProseMirror',
    filePreview: '[data-testid*="attachment"], [class*="attachment"], [class*="preview"]',
    buttonInsertionContainer: 'div.relative.flex.gap-2.w-full.items-center, div:has(> button[aria-label*="Add files, connectors, and more"])',
    fallbackInsertion: 'div:has(> div[data-testid="chat-input"]), form, main',
    newChatButton: 'a[href="/new"], button[aria-label*="New chat"], button[aria-label*="Start new chat"]',
    conversationHistory: '[data-testid*="conversation"], nav, aside',
    conversationItem: '[data-testid*="conversation-item"], a[href*="/chat/"]',
    messageContainer: '[data-message-author-role], [data-testid*="message"]',
    userMessage: '[data-message-author-role="user"], [data-testid="user-message"]',
    aiMessage: '[data-message-author-role="assistant"], [data-testid="assistant-message"]',
    loadingIndicator: '[aria-label*="thinking"], [class*="loading"], [class*="spinner"]',
    typingIndicator: '[aria-label*="thinking"], [class*="typing"], [class*="streaming"]',
    errorMessage: '[role="alert"], [class*="error"]',
    retryButton: 'button[aria-label*="Retry"], button:has-text("Retry")'
  },
  ui: {
    typing: {
      minDelay: 30,
      maxDelay: 120,
      characterDelay: 8
    },
    animations: {
      fadeIn: 220,
      slideIn: 180,
      buttonPress: 100
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000
    },
    fileUpload: {
      maxSize: 52428800,
      allowedTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        'text/csv',
        'application/pdf'
      ],
      timeout: 30000
    },
    polling: {
      elementWait: 100,
      statusCheck: 1000,
      configRefresh: 300000
    }
  },
  features: {
    textInsertion: true,
    formSubmission: true,
    fileAttachment: false,
    voiceInput: false,
    smartRetry: false,
    enhancedUi: true,
    aiAssistance: false,
    contextAwareness: false,
    multimodalSupport: false,
    lazyLoading: true,
    preloading: false,
    caching: true,
    darkModeSupport: true,
    customThemes: false,
    animations: true,
    highContrast: true,
    screenReader: true,
    keyboardNavigation: true
  },
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  schemaVersion: 1
};

export default CLAUDE_DEFAULT_CONFIG;
