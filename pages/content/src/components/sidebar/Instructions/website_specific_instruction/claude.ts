/**
 * Custom instructions for Claude
 * This file contains specific instructions for the Claude AI platform
 */

export const claudeInstructions = `
How SuperAssistant works on Claude:
  1. PRINT the function JSONL commands directly in the response.
  2. The DOM observer reads those JSONL lines and lets the user run them locally.
  3. Always emit only one function call per response.
  4. The tool result will be provided later in <function_results>.
  5. Use a \`\`\`jsonl code block for tool calls, not XML and not python snippets.
  6. Do not use custom scripting wrappers for tool calls. Output only the JSONL event lines.
`;
