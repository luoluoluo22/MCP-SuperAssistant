export interface ExternalSkillMetadata {
  id: string;
  name: string;
  description: string;
  priority: number;
  triggers: string[];
  body: string;
}

const DEFAULT_SKILL_LOADER_URL = 'http://localhost:3006';

function normalizeSkillLoaderBaseUrl(serverUrl: string): string {
  try {
    const parsedUrl = new URL(serverUrl);
    const normalizedProtocol =
      parsedUrl.protocol === 'ws:' ? 'http:' : parsedUrl.protocol === 'wss:' ? 'https:' : parsedUrl.protocol;

    return `${normalizedProtocol}//${parsedUrl.host}`;
  } catch {
    return DEFAULT_SKILL_LOADER_URL;
  }
}

async function resolveSkillLoaderBaseUrl(baseUrl?: string): Promise<string> {
  if (baseUrl) {
    return normalizeSkillLoaderBaseUrl(baseUrl);
  }

  try {
    const result = await chrome.storage.local.get(['mcpServerUrl']);
    if (typeof result.mcpServerUrl === 'string' && result.mcpServerUrl.trim().length > 0) {
      return normalizeSkillLoaderBaseUrl(result.mcpServerUrl);
    }
  } catch {
    // Fall back to the default local service URL.
  }

  return DEFAULT_SKILL_LOADER_URL;
}

export async function fetchExternalSkills(
  baseUrl?: string,
): Promise<ExternalSkillMetadata[]> {
  const resolvedBaseUrl = await resolveSkillLoaderBaseUrl(baseUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${resolvedBaseUrl}/skills`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Skill loader request failed: ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.skills) ? payload.skills : [];
  } finally {
    window.clearTimeout(timeout);
  }
}
