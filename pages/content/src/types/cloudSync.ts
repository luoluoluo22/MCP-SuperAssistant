export interface NutstoreSyncConfig {
  enabled: boolean;
  baseUrl: string;
  username: string;
  rootPath: string;
  remoteRefs: {
    globalPrompt: string;
    profilesIndex: string;
    memoryIndex: string;
  };
}

export interface CloudSyncMeta {
  schemaVersion: number;
  lastRemoteSyncAt: string | null;
  lastRemotePullAt: string | null;
  lastRemotePushAt: string | null;
}

export interface SyncLayerConfig {
  activeProfileId: string;
  defaultWorkspace: string;
  enabledPlugins: string[];
  memoryMode: 'local' | 'remote' | 'hybrid';
  nutstore: NutstoreSyncConfig;
  syncMeta: CloudSyncMeta;
}

export interface LocalSecretsConfig {
  nutstoreAppPassword: string;
  notionToken: string;
}

export interface LocalCacheEntry {
  content: string;
  etag?: string | null;
  updatedAt: string;
}

export interface LocalLayerConfig {
  secrets: LocalSecretsConfig;
  cache: {
    globalPrompt?: LocalCacheEntry;
    profilesIndex?: LocalCacheEntry;
    memoryIndex?: LocalCacheEntry;
    promptProfiles: Record<string, LocalCacheEntry>;
  };
  runtime: {
    currentWorkspace: string;
    lastSessionId: string | null;
  };
  syncState: {
    lastPullAt: string | null;
    lastPushAt: string | null;
    lastError: string | null;
  };
}

export interface EffectiveCloudConfig {
  sync: SyncLayerConfig;
  local: LocalLayerConfig;
}

export interface RemoteFileFetchResult {
  path: string;
  content: string;
  etag: string | null;
  lastModified: string | null;
}

export const DEFAULT_SYNC_LAYER_CONFIG: SyncLayerConfig = {
  activeProfileId: 'default',
  defaultWorkspace: 'F:\\Desktop',
  enabledPlugins: [],
  memoryMode: 'hybrid',
  nutstore: {
    enabled: false,
    baseUrl: 'https://dav.jianguoyun.com/dav/',
    username: '',
    rootPath: '/MCP-SuperAssistant/',
    remoteRefs: {
      globalPrompt: 'prompts/global.md',
      profilesIndex: 'config/profiles-index.json',
      memoryIndex: 'config/memory-index.json',
    },
  },
  syncMeta: {
    schemaVersion: 1,
    lastRemoteSyncAt: null,
    lastRemotePullAt: null,
    lastRemotePushAt: null,
  },
};

export const DEFAULT_LOCAL_LAYER_CONFIG: LocalLayerConfig = {
  secrets: {
    nutstoreAppPassword: '',
    notionToken: '',
  },
  cache: {
    promptProfiles: {},
  },
  runtime: {
    currentWorkspace: 'F:\\Desktop',
    lastSessionId: null,
  },
  syncState: {
    lastPullAt: null,
    lastPushAt: null,
    lastError: null,
  },
};
