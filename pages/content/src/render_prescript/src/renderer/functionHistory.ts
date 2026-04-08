/**
 * Function history component for displaying previously executed functions
 * This module provides functionality to display and re-execute previously run functions
 * Using URL-based storage to prevent race conditions and isolate function executions by URL
 */

import type { ExecutedFunction } from '../mcpexecute/storage';
import {
  formatExecutionTime,
  getExecutedFunctionsForCurrentUrl,
  storeExecutedFunction,
  getPreviousExecution,
} from '../mcpexecute/storage';
import { displayResult } from './components';
import { createLogger } from '@extension/shared/lib/logger';

// Add type declaration for global mcpClient access

const logger = createLogger('FunctionHistory');

declare global {
  interface Window {
    mcpClient?: any;
  }
}

const createHistoryExpandableContent = (): HTMLDivElement => {
  const expandableContent = document.createElement('div');
  expandableContent.className = 'function-history-content';
  expandableContent.style.display = 'none';
  expandableContent.style.overflow = 'hidden';
  expandableContent.style.width = '100%';
  expandableContent.style.boxSizing = 'border-box';
  expandableContent.style.transition =
    'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
  expandableContent.style.maxHeight = '0px';
  expandableContent.style.opacity = '0';
  expandableContent.style.paddingTop = '0';
  expandableContent.style.paddingBottom = '0';
  return expandableContent;
};

const createHistoryHeader = (
  title: string,
): { header: HTMLDivElement; expandButton: HTMLButtonElement } => {
  const header = document.createElement('div');
  header.className = 'function-name';
  header.style.cursor = 'pointer';

  const leftSection = document.createElement('div');
  leftSection.className = 'function-name-left';

  const titleElement = document.createElement('div');
  titleElement.className = 'function-name-text';
  titleElement.textContent = title;
  leftSection.appendChild(titleElement);

  const rightSection = document.createElement('div');
  rightSection.className = 'function-name-right';

  const expandButton = document.createElement('button');
  expandButton.className = 'expand-button';
  expandButton.title = 'Expand execution history';
  expandButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 10l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  rightSection.appendChild(expandButton);
  header.appendChild(leftSection);
  header.appendChild(rightSection);

  return { header, expandButton };
};

const setupHistoryExpandCollapse = (
  historyPanel: HTMLDivElement,
  expandableContent: HTMLDivElement,
  expandButton: HTMLButtonElement,
): void => {
  const toggle = (event?: Event) => {
    event?.preventDefault();
    event?.stopPropagation();

    const isExpanded = historyPanel.classList.contains('expanded');
    const expandIcon = expandButton.querySelector('svg path');

    if (isExpanded) {
      historyPanel.classList.remove('expanded');
      const currentHeight = expandableContent.scrollHeight;
      expandableContent.style.maxHeight = `${currentHeight}px`;
      expandableContent.offsetHeight;

      requestAnimationFrame(() => {
        expandableContent.style.maxHeight = '0px';
        expandableContent.style.opacity = '0';
        expandableContent.style.paddingTop = '0';
        expandableContent.style.paddingBottom = '0';
        if (expandIcon) {
          expandIcon.setAttribute('d', 'M8 10l4 4 4-4');
        }
        expandButton.title = 'Expand execution history';
      });

      setTimeout(() => {
        if (!historyPanel.classList.contains('expanded')) {
          expandableContent.style.display = 'none';
        }
      }, 250);

      return;
    }

    historyPanel.classList.add('expanded');
    expandableContent.style.display = 'block';
    expandableContent.style.maxHeight = '0px';
    expandableContent.style.opacity = '0';
    expandableContent.style.paddingTop = '0';
    expandableContent.style.paddingBottom = '0';

    const targetHeight = expandableContent.scrollHeight + 24;
    requestAnimationFrame(() => {
      expandableContent.style.maxHeight = `${targetHeight}px`;
      expandableContent.style.opacity = '1';
      expandableContent.style.paddingTop = '12px';
      expandableContent.style.paddingBottom = '12px';
      if (expandIcon) {
        expandIcon.setAttribute('d', 'M16 14l-4-4-4 4');
      }
      expandButton.title = 'Collapse execution history';
    });
  };

  expandButton.onclick = toggle;
  const header = expandButton.closest('.function-name') as HTMLDivElement | null;
  if (header) {
    header.onclick = toggle;
  }
};

/**
 * Create a history panel for previously executed functions
 *
 * @param blockDiv Function block div container
 * @param callId Unique ID for the function call
 * @param contentSignature Content signature for the function call
 * @returns The created history panel element
 */
export const createHistoryPanel = (
  blockDiv: HTMLDivElement,
  callId: string,
  contentSignature: string,
): HTMLDivElement => {
  // First, remove any existing history panels to ensure we only have one
  const existingPanels = blockDiv.querySelectorAll('.function-history-panel');
  existingPanels.forEach(panel => panel.remove());

  // Also check if we're in a function-buttons container and need to clean up the parent block
  if (blockDiv.classList.contains('function-buttons')) {
    const parentBlock = blockDiv.closest('.function-block');
    if (parentBlock) {
      const parentPanels = parentBlock.querySelectorAll('.function-history-panel');
      parentPanels.forEach(panel => panel.remove());
    }
  }

  // Create history panel
  const historyPanel = document.createElement('div');
  historyPanel.className = 'function-history-panel';
  historyPanel.style.display = 'none';

  // Add to block div
  if (blockDiv.classList.contains('function-buttons')) {
    // If we're in a button container, add historyPanel to the parent
    const parentBlock = blockDiv.closest('.function-block');
    if (parentBlock) {
      parentBlock.appendChild(historyPanel);
    } else {
      blockDiv.appendChild(historyPanel);
    }
  } else {
    blockDiv.appendChild(historyPanel);
  }

  return historyPanel;
};

/**
 * Update the history panel with execution data
 *
 * @param historyPanel History panel element
 * @param executionData Execution data to display
 * @param mcpClient MCP client for re-executing functions (new architecture)
 */
export const updateHistoryPanel = (
  historyPanel: HTMLDivElement,
  executionData: ExecutedFunction,
  mcpClient: any,
): void => {
  // Clear existing content
  historyPanel.innerHTML = '';

  const { header, expandButton } = createHistoryHeader('Execution History');
  historyPanel.appendChild(header);

  const expandableContent = createHistoryExpandableContent();
  historyPanel.appendChild(expandableContent);
  setupHistoryExpandCollapse(historyPanel, expandableContent, expandButton);

  // Create execution info
  const executionInfo = document.createElement('div');
  executionInfo.className = 'function-execution-info';

  // Format the execution time
  const executionTime = formatExecutionTime(executionData.executedAt);

  executionInfo.innerHTML = `
    <div>Function: <strong>${executionData.functionName}</strong></div>
    <div>Last executed: <strong>${executionTime}</strong></div>
  `;
  expandableContent.appendChild(executionInfo);

  // Create re-execute button
  const reExecuteBtn = document.createElement('button');
  reExecuteBtn.className = 'function-reexecute-button';
  reExecuteBtn.textContent = 'Re-execute';

  // Handle re-execution with async mcpClient
  reExecuteBtn.onclick = async () => {
    // Create results panel if it doesn't exist
    let resultsPanel = historyPanel.parentElement?.querySelector(
      `.function-results-panel[data-call-id="${executionData.callId}"]`,
    ) as HTMLDivElement;

    // overflow
    if (resultsPanel) {
      resultsPanel.style.overflow = 'auto';
      resultsPanel.style.maxHeight = '200px';
    }

    if (!resultsPanel) {
      resultsPanel = document.createElement('div');
      resultsPanel.className = 'function-results-panel';
      resultsPanel.setAttribute('data-call-id', executionData.callId);
      resultsPanel.setAttribute('data-function-name', executionData.functionName);
      resultsPanel.style.display = 'block';
      historyPanel.parentElement?.appendChild(resultsPanel);
    } else {
      resultsPanel.style.display = 'block';
      resultsPanel.innerHTML = '';
    }

    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'function-results-loading';
    loadingIndicator.textContent = 'Executing...';
    resultsPanel.appendChild(loadingIndicator);

    try {
      if (!mcpClient) {
        displayResult(resultsPanel, loadingIndicator, false, 'Error: mcpClient not found');
        return;
      }

      // Check if mcpClient is ready
      if (!mcpClient.isReady || !mcpClient.isReady()) {
        displayResult(resultsPanel, loadingIndicator, false, 'Error: MCP client not ready');
        return;
      }

      logger.debug(`Re-executing function ${executionData.functionName} with arguments:`, executionData.params);

      try {
        // Use async/await with the new mcpClient API
        const result = await mcpClient.callTool(executionData.functionName, executionData.params);
        
        displayResult(resultsPanel, loadingIndicator, true, result);

        // Update the execution record with new timestamp
        // Always use the current URL context when storing execution data
        const updatedExecutionData = storeExecutedFunction(
          executionData.functionName,
          executionData.callId,
          executionData.params,
          executionData.contentSignature,
        );

        // Update the history panel with the new timestamp
        updateHistoryPanel(historyPanel, updatedExecutionData, mcpClient);
        
      } catch (toolError: any) {
        // Enhanced error handling for different error types
        let errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
        
        // Check for connection-related errors and provide better user feedback
        if (errorMessage.includes('not connected') || errorMessage.includes('connection')) {
          errorMessage = 'Connection lost. Please check your MCP server connection.';
        } else if (errorMessage.includes('timeout')) {
          errorMessage = 'Request timed out. Please try again.';
        } else if (errorMessage.includes('server unavailable') || errorMessage.includes('SERVER_UNAVAILABLE')) {
          errorMessage = 'MCP server is unavailable. Please check the server status.';
        }
        
        displayResult(resultsPanel, loadingIndicator, false, errorMessage);
      }

    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Re-execute error:', error);
      
      displayResult(
        resultsPanel,
        loadingIndicator,
        false,
        `Unexpected error: ${errorMessage}`,
      );
    }
  };

  expandableContent.appendChild(reExecuteBtn);

  // Show the panel
  historyPanel.style.display = 'block';
};

/**
 * Check for previously executed functions and update the UI accordingly
 *
 * @param blockDiv Function block div container
 * @param functionName Name of the function
 * @param callId Unique ID for the function call
 * @param contentSignature Content signature for the function
 */
export const checkAndDisplayFunctionHistory = (
  blockDiv: HTMLDivElement,
  functionName: string,
  callId: string,
  contentSignature: string,
): void => {
  // Get executed functions for the current URL
  const executedFunctions = getExecutedFunctionsForCurrentUrl();

  // Find matching executions - direct lookup from localStorage to prevent race conditions
  const exactMatch = getPreviousExecution(functionName, callId, contentSignature);
  const matchingExecutions = exactMatch ? [exactMatch] : [];

  // Fallback to filter method if exact match not found
  if (!exactMatch) {
    const filteredMatches = executedFunctions.filter(
      func => func.callId === callId && func.contentSignature === contentSignature,
    );
    filteredMatches.forEach(match => matchingExecutions.push(match));
  }

  if (matchingExecutions.length > 0) {
    // Sort by execution time (newest first) and take only the latest
    const latestExecution = matchingExecutions.sort((a, b) => b.executedAt - a.executedAt)[0];

    // Create history panel (this will remove any existing panels)
    const historyPanel = createHistoryPanel(blockDiv, callId, contentSignature);

    // Access the global mcpClient instead of mcpHandler
    const mcpClient = (window as any).mcpClient;

    // Update the panel with the latest execution data
    updateHistoryPanel(historyPanel, latestExecution, mcpClient);

    // Log that we're showing only the latest execution
    logger.debug(
      `Showing only the latest execution from ${matchingExecutions.length} matches for function ${functionName}`,
    );
  }
};
