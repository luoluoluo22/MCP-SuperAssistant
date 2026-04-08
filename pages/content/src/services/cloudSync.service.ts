import { createLogger } from '@extension/shared/lib/logger';
import {
  getEffectiveCloudConfig,
  getLocalLayerConfig,
  saveLocalLayerConfig,
  saveSyncLayerConfig,
  updateCachedPromptProfile,
  updateCachedRemoteFile,
  updateSyncTimestamps,
} from '../utils/cloudConfigStorage';
import type {
  EffectiveCloudConfig,
  LocalLayerConfig,
  RemoteFileFetchResult,
  SyncLayerConfig,
} from '../types/cloudSync';

const logger = createLogger('CloudSyncService');

export class CloudSyncService {
  async getConfig(): Promise<EffectiveCloudConfig> {
    return getEffectiveCloudConfig();
  }

  async updateSyncConfig(config: Partial<SyncLayerConfig>): Promise<SyncLayerConfig> {
    return saveSyncLayerConfig(config);
  }

  async updateLocalConfig(config: Partial<LocalLayerConfig>): Promise<LocalLayerConfig> {
    return saveLocalLayerConfig(config);
  }

  async pullCoreRemoteFiles(): Promise<RemoteFileFetchResult[]> {
    const config = await this.getConfig();
    this.assertNutstoreEnabled(config);

    const targets = [
      { key: 'globalPrompt' as const, path: config.sync.nutstore.remoteRefs.globalPrompt },
      { key: 'profilesIndex' as const, path: config.sync.nutstore.remoteRefs.profilesIndex },
      { key: 'memoryIndex' as const, path: config.sync.nutstore.remoteRefs.memoryIndex },
    ];

    const results = await Promise.all(targets.map(target => this.fetchRemoteFile(target.path)));

    await updateCachedRemoteFile('globalPrompt', results[0].content, results[0].etag);
    await updateCachedRemoteFile('profilesIndex', results[1].content, results[1].etag);
    await updateCachedRemoteFile('memoryIndex', results[2].content, results[2].etag);
    await updateSyncTimestamps('pull');

    return results;
  }

  async initializeNutstoreWorkspace(): Promise<void> {
    const config = await this.getConfig();
    this.assertNutstoreEnabled(config);

    const rootSegments = this.getRootPathSegments(config.sync.nutstore.rootPath);

    await this.ensureDirectorySegments(config, rootSegments);
    await this.ensureDirectorySegments(config, [...rootSegments, 'prompts']);
    await this.ensureDirectorySegments(config, [...rootSegments, 'config']);
    await this.ensureDirectorySegments(config, [...rootSegments, 'memory']);
    await this.ensureDirectorySegments(config, [...rootSegments, 'tasks']);

    await updateSyncTimestamps('sync');
  }

  async testNutstoreConnection(): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    this.assertNutstoreEnabled(config);

    const url = this.buildRemoteRootUrl(config);
    const response = await this.requestViaBackground({
      url,
      method: 'PROPFIND',
      headers: {
        Authorization: this.buildBasicAuthHeader(config),
        Depth: '0',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>`,
    });

    if (!response.ok && response.status !== 207) {
      throw new Error(`Nutstore connection test failed: ${response.status} ${response.statusText}`);
    }

    return {
      success: true,
      message: `Connected successfully: ${response.status}`,
    };
  }

  async pullPromptProfile(profileId: string, remotePath: string): Promise<RemoteFileFetchResult> {
    const result = await this.fetchRemoteFile(remotePath);
    await updateCachedPromptProfile(profileId, result.content, result.etag);
    await updateSyncTimestamps('pull');
    return result;
  }

  async pullGlobalPrompt(): Promise<RemoteFileFetchResult> {
    const config = await this.getConfig();
    const result = await this.fetchRemoteFile(config.sync.nutstore.remoteRefs.globalPrompt);
    await updateCachedRemoteFile('globalPrompt', result.content, result.etag);
    await updateSyncTimestamps('pull');
    return result;
  }

  async pushGlobalPrompt(content: string): Promise<void> {
    const config = await this.getConfig();
    await updateCachedRemoteFile('globalPrompt', content, config.local.cache.globalPrompt?.etag ?? null);
    await this.pushRemoteFile(config.sync.nutstore.remoteRefs.globalPrompt, content, 'text/markdown;charset=utf-8');
    await updateSyncTimestamps('sync');
  }

  async getCachedGlobalPrompt(): Promise<string> {
    const local = await getLocalLayerConfig();
    return local.cache.globalPrompt?.content || '';
  }

  async pushRemoteFile(remotePath: string, content: string, contentType = 'text/plain;charset=utf-8'): Promise<void> {
    const config = await this.getConfig();
    this.assertNutstoreEnabled(config);

    await this.ensureParentDirectories(remotePath);

    const url = this.buildRemoteUrl(config, remotePath);
    const response = await this.requestViaBackground({
      url,
      method: 'PUT',
      headers: {
        Authorization: this.buildBasicAuthHeader(config),
        'Content-Type': contentType,
      },
      body: content,
    });

    if (!response.ok) {
      const error = `Nutstore PUT failed: ${response.status} ${response.statusText}`;
      await updateSyncTimestamps('push', error);
      throw new Error(error);
    }

    await updateSyncTimestamps('push');
  }

  async syncGlobalPromptFromCache(): Promise<void> {
    const config = await this.getConfig();
    const cache = config.local.cache.globalPrompt;
    if (!cache?.content) {
      logger.warn('No cached global prompt available for remote sync');
      return;
    }

    await this.pushRemoteFile(config.sync.nutstore.remoteRefs.globalPrompt, cache.content, 'text/markdown;charset=utf-8');
    await updateSyncTimestamps('sync');
  }

  private async fetchRemoteFile(remotePath: string): Promise<RemoteFileFetchResult> {
    const config = await this.getConfig();
    const url = this.buildRemoteUrl(config, remotePath);

    const response = await this.requestViaBackground({
      url,
      method: 'GET',
      headers: {
        Authorization: this.buildBasicAuthHeader(config),
      },
    });

    if (!response.ok) {
      const error = `Nutstore GET failed for ${remotePath}: ${response.status} ${response.statusText}`;
      await updateSyncTimestamps('pull', error);
      throw new Error(error);
    }

    return {
      path: remotePath,
      content: response.text,
      etag: response.headers.etag ?? null,
      lastModified: response.headers['last-modified'] ?? null,
    };
  }

  private async ensureParentDirectories(remotePath: string): Promise<void> {
    const config = await this.getConfig();
    const rootSegments = this.getRootPathSegments(config.sync.nutstore.rootPath);
    const pathSegments = remotePath
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean);

    if (pathSegments.length <= 1) {
      if (rootSegments.length > 0) {
        await this.ensureDirectorySegments(config, rootSegments);
      }
      return;
    }

    const parentSegments = pathSegments.slice(0, -1);
    await this.ensureDirectorySegments(config, [...rootSegments, ...parentSegments]);
  }

  private async ensureDirectorySegments(config: EffectiveCloudConfig, segments: string[]): Promise<void> {
    if (segments.length === 0) {
      return;
    }

    for (let index = 0; index < segments.length; index += 1) {
      const currentSegments = segments.slice(0, index + 1);
      const dirUrl = this.buildRawUrlFromSegments(config, currentSegments) + '/';
      const response = await this.requestViaBackground({
        url: dirUrl,
        method: 'MKCOL',
        headers: {},
      });

      if ([201, 301, 405].includes(response.status)) {
        continue;
      }

      if (response.status === 409) {
        throw new Error(`Nutstore MKCOL failed for ${dirUrl}: 409 AncestorsNotFound`);
      }

      if (!response.ok) {
        throw new Error(`Nutstore MKCOL failed for ${dirUrl}: ${response.status} ${response.statusText}`);
      }
    }
  }

  private buildRemoteUrl(config: EffectiveCloudConfig, remotePath: string): string {
    const baseUrl = config.sync.nutstore.baseUrl.replace(/\/+$/, '');
    const rootPath = config.sync.nutstore.rootPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const path = remotePath.replace(/^\/+/, '');
    const segments = [baseUrl];
    if (rootPath) {
      segments.push(rootPath);
    }
    if (path) {
      segments.push(path);
    }
    return segments.join('/');
  }

  private buildRemoteRootUrl(config: EffectiveCloudConfig): string {
    const baseUrl = config.sync.nutstore.baseUrl.replace(/\/+$/, '');
    const rootPath = config.sync.nutstore.rootPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const segments = [baseUrl];
    if (rootPath) {
      segments.push(rootPath);
    }
    return segments.join('/') + '/';
  }

  private buildRawUrlFromSegments(config: EffectiveCloudConfig, segments: string[]): string {
    const baseUrl = config.sync.nutstore.baseUrl.replace(/\/+$/, '');
    return [baseUrl, ...segments.filter(Boolean)].join('/');
  }

  private getRootPathSegments(rootPath: string): string[] {
    return rootPath
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean);
  }

  private buildBasicAuthHeader(config: EffectiveCloudConfig): string {
    const username = config.sync.nutstore.username;
    const password = config.local.secrets.nutstoreAppPassword;

    if (!username || !password) {
      throw new Error('Nutstore username or app password is missing');
    }

    return `Basic ${btoa(`${username}:${password}`)}`;
  }

  private assertNutstoreEnabled(config: EffectiveCloudConfig): void {
    if (!config.sync.nutstore.enabled) {
      throw new Error('Nutstore sync is not enabled');
    }
  }

  private async requestViaBackground(payload: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    text: string;
  }> {
    const response = await chrome.runtime.sendMessage({
      type: 'cloud-sync:request',
      payload,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Cloud sync background request failed');
    }

    return response.data;
  }
}

export const cloudSyncService = new CloudSyncService();

export async function initializeCloudSyncService(): Promise<void> {
  logger.debug('[CloudSyncService] Initialized');
}

export async function cleanupCloudSyncService(): Promise<void> {
  logger.debug('[CloudSyncService] Cleaned up');
}
