import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';
import { CLAUDE_DEFAULT_CONFIG } from './defaultConfigs/claude.config';
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('ClaudeAdapter');

export class ClaudeAdapter extends BaseAdapterPlugin {
  readonly name = 'ClaudeAdapter';
  readonly version = '1.0.0';
  readonly hostnames = ['claude.ai'];
  readonly capabilities: AdapterCapability[] = [
    'text-insertion',
    'form-submission',
    'dom-manipulation'
  ];

  private readonly selectors = CLAUDE_DEFAULT_CONFIG.selectors;
  private lastUrl = '';
  private urlCheckInterval: NodeJS.Timeout | null = null;
  private mutationObserver: MutationObserver | null = null;
  private popoverCheckInterval: NodeJS.Timeout | null = null;
  private mcpPopoverContainer: HTMLElement | null = null;
  private mcpPopoverRoot: { unmount: () => void } | null = null;
  private stylesInjected = false;
  private uiSetup = false;
  private observersSetup = false;

  async initialize(context: PluginContext): Promise<void> {
    if (this.currentStatus === 'initializing' || this.currentStatus === 'active') {
      return;
    }

    await super.initialize(context);
    this.lastUrl = window.location.href;
    this.setupUrlTracking();
  }

  async activate(): Promise<void> {
    if (this.currentStatus === 'active') {
      return;
    }

    await super.activate();
    this.injectClaudeButtonStyles();
    this.setupDOMObservers();
    this.setupUIIntegration();
  }

  async deactivate(): Promise<void> {
    await super.deactivate();
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();
    this.uiSetup = false;
    this.observersSetup = false;
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }
    if (this.popoverCheckInterval) {
      clearInterval(this.popoverCheckInterval);
      this.popoverCheckInterval = null;
    }
    this.cleanupUIIntegration();
    this.cleanupDOMObservers();

    const styleElement = document.getElementById('mcp-claude-button-styles');
    if (styleElement) {
      styleElement.remove();
    }
    this.stylesInjected = false;
  }

  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    const target = options?.targetElement ?? this.findChatInput();
    if (!target) {
      this.context.logger.error('Claude chat input not found');
      return false;
    }

    try {
      target.focus();

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        selection.addRange(range);
      }

      document.execCommand('insertText', false, text);

      if ((target.textContent || '').trim().length === 0) {
        target.textContent = text;
      }

      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: text,
        inputType: 'insertText'
      }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (error) {
      this.context.logger.error('Error inserting text into Claude input:', error);
      return false;
    }
  }

  async submitForm(): Promise<boolean> {
    const submitButton = this.findSubmitButton();
    if (submitButton && !submitButton.disabled) {
      submitButton.click();
      return true;
    }

    const target = this.findChatInput();
    if (!target) {
      this.context.logger.error('Claude submit target not found');
      return false;
    }

    target.focus();
    const enterOptions = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };
    target.dispatchEvent(new KeyboardEvent('keydown', enterOptions));
    target.dispatchEvent(new KeyboardEvent('keypress', enterOptions));
    target.dispatchEvent(new KeyboardEvent('keyup', enterOptions));
    return true;
  }

  isSupported(): boolean {
    return window.location.hostname.includes('claude.ai');
  }

  onPageChanged?(url: string, oldUrl?: string): void {
    this.context.logger.debug(`Claude page changed: from ${oldUrl || 'N/A'} to ${url}`);
    this.lastUrl = url;
    if (this.isSupported()) {
      this.injectClaudeButtonStyles();
      setTimeout(() => this.setupUIIntegration(), 500);
    }
  }

  private setupUrlTracking(): void {
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
    }

    this.urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastUrl) {
        const oldUrl = this.lastUrl;
        this.lastUrl = currentUrl;
        this.onPageChanged?.(currentUrl, oldUrl);
      }
    }, 1000);
  }

  private setupDOMObservers(): void {
    if (this.observersSetup) {
      return;
    }

    this.mutationObserver = new MutationObserver(() => {
      if (!this.isSupported()) {
        return;
      }
      this.setupUIIntegration();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observersSetup = true;
  }

  private cleanupDOMObservers(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private setupUIIntegration(): void {
    if (!this.isSupported()) {
      return;
    }

    this.injectMCPPopoverWithRetry();
    this.uiSetup = true;
  }

  private cleanupUIIntegration(): void {
    if (this.mcpPopoverRoot) {
      try {
        this.mcpPopoverRoot.unmount();
      } catch (error) {
        this.context.logger.warn('Error unmounting Claude popover root:', error);
      }
      this.mcpPopoverRoot = null;
    }

    if (this.mcpPopoverContainer?.isConnected) {
      this.mcpPopoverContainer.remove();
    }
    this.mcpPopoverContainer = null;
  }

  private injectMCPPopoverWithRetry(maxRetries = 5): void {
    let retries = 0;
    const tryInject = () => {
      if (document.getElementById('mcp-popover-container')) {
        return;
      }

      const insertionPoint = this.findButtonInsertionPoint();
      if (!insertionPoint) {
        if (retries < maxRetries) {
          retries += 1;
          setTimeout(tryInject, 500);
        }
        return;
      }

      this.injectMCPPopover(insertionPoint);
    };

    tryInject();

    if (!this.popoverCheckInterval) {
      this.popoverCheckInterval = setInterval(() => {
        if (!document.getElementById('mcp-popover-container') && this.isSupported()) {
          this.injectMCPPopoverWithRetry(3);
        }
      }, 3000);
    }
  }

  private findButtonInsertionPoint(): { container: Element; insertAfter: Element | null } | null {
    const plusButton = document.querySelector('button[aria-label*="Add files, connectors, and more"], button[aria-label*="Add files"]');
    if (plusButton?.parentElement) {
      return { container: plusButton.parentElement, insertAfter: plusButton };
    }

    const selectors = this.selectors.buttonInsertionContainer.split(', ');
    for (const selector of selectors) {
      const container = document.querySelector(selector.trim());
      if (container) {
        const firstButton = container.querySelector('button');
        return { container, insertAfter: firstButton };
      }
    }

    const fallbackSelectors = this.selectors.fallbackInsertion.split(', ');
    for (const selector of fallbackSelectors) {
      const container = document.querySelector(selector.trim());
      if (container) {
        return { container, insertAfter: null };
      }
    }

    return null;
  }

  private injectMCPPopover(insertionPoint: { container: Element; insertAfter: Element | null }): void {
    if (document.getElementById('mcp-popover-container')) {
      return;
    }

    const reactContainer = document.createElement('div');
    reactContainer.id = 'mcp-popover-container';
    reactContainer.style.display = 'inline-flex';
    reactContainer.style.alignItems = 'center';
    reactContainer.style.marginLeft = '8px';

    const { container, insertAfter } = insertionPoint;
    if (insertAfter && insertAfter.parentNode === container) {
      container.insertBefore(reactContainer, insertAfter.nextSibling);
    } else {
      container.appendChild(reactContainer);
    }

    this.mcpPopoverContainer = reactContainer;
    this.renderMCPPopover(reactContainer);
  }

  private renderMCPPopover(container: HTMLElement): void {
    import('react').then(React => {
      import('react-dom/client').then(ReactDOM => {
        import('../../components/mcpPopover/mcpPopover').then(({ MCPPopover }) => {
          if (!container.isConnected) {
            return;
          }

          if (this.mcpPopoverRoot) {
            this.mcpPopoverRoot.unmount();
            this.mcpPopoverRoot = null;
          }

          const root = ReactDOM.createRoot(container);
          this.mcpPopoverRoot = root;

          root.render(
            React.createElement(MCPPopover, {
              toggleStateManager: this.createToggleStateManager(),
              adapterButtonConfig: {
                className: 'mcp-claude-button-base',
                contentClassName: 'mcp-claude-button-content',
                textClassName: 'mcp-claude-button-text',
                activeClassName: 'mcp-button-active'
              },
              adapterName: this.name
            })
          );
        }).catch(error => {
          this.context.logger.error('Failed to import MCPPopover for Claude:', error);
        });
      }).catch(error => {
        this.context.logger.error('Failed to import ReactDOM for Claude:', error);
      });
    }).catch(error => {
      this.context.logger.error('Failed to import React for Claude:', error);
    });
  }

  private createToggleStateManager() {
    const context = this.context;

    const stateManager = {
      getState: () => {
        const uiState = context.stores.ui;
        return {
          mcpEnabled: uiState?.mcpEnabled ?? false,
          autoInsert: uiState?.preferences?.autoInsert ?? false,
          autoSubmit: uiState?.preferences?.autoSubmit ?? false,
          autoExecute: uiState?.preferences?.autoExecute ?? false
        };
      },
      setMCPEnabled: (enabled: boolean) => {
        if (context.stores.ui?.setMCPEnabled) {
          context.stores.ui.setMCPEnabled(enabled, 'mcp-popover-toggle');
        } else if (context.stores.ui?.setSidebarVisibility) {
          context.stores.ui.setSidebarVisibility(enabled, 'mcp-popover-toggle-fallback');
        }

        const sidebarManager = (window as any).activeSidebarManager;
        if (sidebarManager) {
          if (enabled) {
            sidebarManager.show().catch((error: any) => context.logger.error('Error showing sidebar:', error));
          } else {
            sidebarManager.hide().catch((error: any) => context.logger.error('Error hiding sidebar:', error));
          }
        }

        stateManager.updateUI();
      },
      setAutoInsert: (enabled: boolean) => {
        context.stores.ui?.updatePreferences?.({ autoInsert: enabled });
        stateManager.updateUI();
      },
      setAutoSubmit: (enabled: boolean) => {
        context.stores.ui?.updatePreferences?.({ autoSubmit: enabled });
        stateManager.updateUI();
      },
      setAutoExecute: (enabled: boolean) => {
        context.stores.ui?.updatePreferences?.({ autoExecute: enabled });
        stateManager.updateUI();
      },
      updateUI: () => {
        const popoverContainer = document.getElementById('mcp-popover-container');
        if (popoverContainer) {
          popoverContainer.dispatchEvent(new CustomEvent('mcp:update-toggle-state', {
            detail: { toggleState: stateManager.getState() }
          }));
        }
      }
    };

    return stateManager;
  }

  private injectClaudeButtonStyles(): void {
    if (this.stylesInjected || document.getElementById('mcp-claude-button-styles')) {
      this.stylesInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = 'mcp-claude-button-styles';
    style.textContent = `
      .mcp-claude-button-base {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 32px;
        padding: 0 10px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: var(--text-500, #6b7280);
        cursor: pointer;
        transition: background-color 0.2s ease, color 0.2s ease;
      }

      .mcp-claude-button-base:hover {
        background: rgba(127, 127, 127, 0.12);
        color: inherit;
      }

      .mcp-claude-button-base.mcp-button-active {
        background: rgba(127, 127, 127, 0.18);
      }

      .mcp-claude-button-content {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .mcp-claude-button-text {
        font-size: 12px;
        font-weight: 600;
      }
    `;

    document.head.appendChild(style);
    this.stylesInjected = true;
  }

  private findChatInput(): HTMLElement | null {
    const selectors = this.selectors.chatInput.split(', ');
    for (const selector of selectors) {
      const input = document.querySelector(selector.trim()) as HTMLElement | null;
      if (input) {
        return input;
      }
    }
    return null;
  }

  private findSubmitButton(): HTMLButtonElement | null {
    const selectors = this.selectors.submitButton.split(', ');
    for (const selector of selectors) {
      const button = document.querySelector(selector.trim()) as HTMLButtonElement | null;
      if (button && button.offsetParent !== null) {
        return button;
      }
    }
    return null;
  }
}
