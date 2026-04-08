import { createLogger } from '@extension/shared/lib/logger';
import {
  DEFAULT_LOCAL_LAYER_CONFIG,
  DEFAULT_SYNC_LAYER_CONFIG,
  type EffectiveCloudConfig,
  type LocalLayerConfig,
  type SyncLayerConfig,
} from '../types/cloudSync';

const logger = createLogger('CloudConfigStorage');

const SYNC_STORAGE_KEY = 'mcp_cloud_sync_config';
const LOCAL_STORAGE_KEY = 'mcp_cloud_local_config';

function hasChromeStorageArea(area: 'sync' | 'local'): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage[area];
}

function deepMerge<T extends Record<string, any>>(base: T, override?: Partial<T>): T {
  if (!override) {
    return structuredClone(base);
  }

  const result: Record<string, any> = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      result[key] = [...value];
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const baseValue = result[key];
      result[key] = deepMerge(
        baseValue && typeof baseValue === 'object' ? baseValue : {},
        value as Record<string, any>,
      );
      continue;
    }

    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

export async function getSyncLayerConfig(): Promise<SyncLayerConfig> {
  if (!hasChromeStorageArea('sync')) {
    logger.warn('chrome.storage.sync unavailable, falling back to defaults');
    return structuredClone(DEFAULT_SYNC_LAYER_CONFIG);
  }

  const result = await chrome.storage.sync.get(SYNC_STORAGE_KEY);
  return deepMerge(DEFAULT_SYNC_LAYER_CONFIG, result[SYNC_STORAGE_KEY] as Partial<SyncLayerConfig> | undefined);
}

export async function saveSyncLayerConfig(config: Partial<SyncLayerConfig>): Promise<SyncLayerConfig> {
  const merged = deepMerge(await getSyncLayerConfig(), config);

  if (!hasChromeStorageArea('sync')) {
    logger.warn('chrome.storage.sync unavailable, save skipped');
    return merged;
  }

  await chrome.storage.sync.set({ [SYNC_STORAGE_KEY]: merged });
  return merged;
}

export async function getLocalLayerConfig(): Promise<LocalLayerConfig> {
  if (!hasChromeStorageArea('local')) {
    logger.warn('chrome.storage.local unavailable, falling back to defaults');
    return structuredClone(DEFAULT_LOCAL_LAYER_CONFIG);
  }

  const result = await chrome.storage.local.get(LOCAL_STORAGE_KEY);
  return deepMerge(DEFAULT_LOCAL_LAYER_CONFIG, result[LOCAL_STORAGE_KEY] as Partial<LocalLayerConfig> | undefined);
}

export async function saveLocalLayerConfig(config: Partial<LocalLayerConfig>): Promise<LocalLayerConfig> {
  const merged = deepMerge(await getLocalLayerConfig(), config);

  if (!hasChromeStorageArea('local')) {
    logger.warn('chrome.storage.local unavailable, save skipped');
    return merged;
  }

  await chrome.storage.local.set({ [LOCAL_STORAGE_KEY]: merged });
  return merged;
}

export async function getEffectiveCloudConfig(): Promise<EffectiveCloudConfig> {
  const [sync, local] = await Promise.all([getSyncLayerConfig(), getLocalLayerConfig()]);

  return { sync, local };
}

export async function updateCachedRemoteFile(
  cacheKey: 'globalPrompt' | 'profilesIndex' | 'memoryIndex',
  content: string,
  etag?: string | null,
): Promise<LocalLayerConfig> {
  const local = await getLocalLayerConfig();
  return saveLocalLayerConfig({
    ...local,
    cache: {
      ...local.cache,
      [cacheKey]: {
        content,
        etag: etag ?? null,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export async function updateCachedPromptProfile(
  profileId: string,
  content: string,
  etag?: string | null,
): Promise<LocalLayerConfig> {
  const local = await getLocalLayerConfig();
  return saveLocalLayerConfig({
    ...local,
    cache: {
      ...local.cache,
      promptProfiles: {
        ...local.cache.promptProfiles,
        [profileId]: {
          content,
          etag: etag ?? null,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });
}

export async function updateSyncTimestamps(
  type: 'pull' | 'push' | 'sync',
  error: string | null = null,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const [sync, local] = await Promise.all([getSyncLayerConfig(), getLocalLayerConfig()]);

  await Promise.all([
    saveSyncLayerConfig({
      ...sync,
      syncMeta: {
        ...sync.syncMeta,
        lastRemoteSyncAt: type === 'sync' ? timestamp : sync.syncMeta.lastRemoteSyncAt,
        lastRemotePullAt: type === 'pull' ? timestamp : sync.syncMeta.lastRemotePullAt,
        lastRemotePushAt: type === 'push' ? timestamp : sync.syncMeta.lastRemotePushAt,
      },
    }),
    saveLocalLayerConfig({
      ...local,
      syncState: {
        ...local.syncState,
        lastPullAt: type === 'pull' ? timestamp : local.syncState.lastPullAt,
        lastPushAt: type === 'push' ? timestamp : local.syncState.lastPushAt,
        lastError: error,
      },
    }),
  ]);
}
