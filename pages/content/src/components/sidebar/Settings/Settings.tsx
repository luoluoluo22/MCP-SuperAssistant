import React from 'react';
import { useUserPreferences } from '@src/hooks';
import { Card, CardContent } from '@src/components/ui/card';
import { Typography, Button } from '../ui';
import { AutomationService } from '@src/services/automation.service';
import { cloudSyncService } from '@src/services/cloudSync.service';
import { cn } from '@src/lib/utils';
import { createLogger } from '@extension/shared/lib/logger';
import type { EffectiveCloudConfig } from '@src/types/cloudSync';

// Default delay values in seconds

const logger = createLogger('Settings');

const DEFAULT_DELAYS = {
  autoInsertDelay: 2,
  autoSubmitDelay: 2,
  autoExecuteDelay: 2
} as const;

const Settings: React.FC = () => {
  const { preferences, updatePreferences } = useUserPreferences();
  const [cloudConfig, setCloudConfig] = React.useState<EffectiveCloudConfig | null>(null);
  const [isCloudLoading, setIsCloudLoading] = React.useState(true);
  const [isSavingCloudConfig, setIsSavingCloudConfig] = React.useState(false);
  const [isTestingConnection, setIsTestingConnection] = React.useState(false);
  const [isPullingRemote, setIsPullingRemote] = React.useState(false);
  const [isPullingGlobalPrompt, setIsPullingGlobalPrompt] = React.useState(false);
  const [isPushingGlobalPrompt, setIsPushingGlobalPrompt] = React.useState(false);
  const [cloudStatus, setCloudStatus] = React.useState<string>('');

  const [nutstoreEnabled, setNutstoreEnabled] = React.useState(false);
  const [nutstoreBaseUrl, setNutstoreBaseUrl] = React.useState('https://dav.jianguoyun.com/dav/');
  const [nutstoreUsername, setNutstoreUsername] = React.useState('');
  const [nutstoreRootPath, setNutstoreRootPath] = React.useState('/MCP-SuperAssistant/');
  const [nutstoreAppPassword, setNutstoreAppPassword] = React.useState('');
  const [defaultWorkspace, setDefaultWorkspace] = React.useState('F:\\Desktop');
  const [activeProfileId, setActiveProfileId] = React.useState('default');

  // Handle delay input changes
  const handleDelayChange = (type: 'autoInsert' | 'autoSubmit' | 'autoExecute', value: string) => {
    const delay = Math.max(0, parseInt(value) || 0); // Ensure non-negative integer
    logger.debug(`${type} delay changed to: ${delay}`);
    
    // Update user preferences store with the new delay
    updatePreferences({ [`${type}Delay`]: delay });

    // Store in localStorage
    try {
      const storedDelays = JSON.parse(localStorage.getItem('mcpDelaySettings') || '{}');
      localStorage.setItem('mcpDelaySettings', JSON.stringify({
        ...storedDelays,
        [`${type}Delay`]: delay
      }));
    } catch (error) {
      logger.error('[Settings] Error storing delay settings:', error);
    }

    // Update automation state on window
    AutomationService.getInstance().updateAutomationStateOnWindow().catch(console.error);
  };

  // Load stored delays on component mount, set default to 2 seconds if not set
  React.useEffect(() => {
    try {
      const storedDelays = JSON.parse(localStorage.getItem('mcpDelaySettings') || '{}');
      // If no stored delays, use defaults
      if (Object.keys(storedDelays).length === 0) {
        updatePreferences(DEFAULT_DELAYS);
        localStorage.setItem('mcpDelaySettings', JSON.stringify(DEFAULT_DELAYS));
      } else {
        // Use stored delays
        updatePreferences(storedDelays);
      }
    } catch (error) {
      logger.error('[Settings] Error loading stored delay settings:', error);
      // Set defaults on error
      updatePreferences(DEFAULT_DELAYS);
      localStorage.setItem('mcpDelaySettings', JSON.stringify(DEFAULT_DELAYS));
    }
  }, [updatePreferences]);

  React.useEffect(() => {
    const loadCloudConfig = async () => {
      setIsCloudLoading(true);

      try {
        const config = await cloudSyncService.getConfig();
        setCloudConfig(config);
        setNutstoreEnabled(config.sync.nutstore.enabled);
        setNutstoreBaseUrl(config.sync.nutstore.baseUrl);
        setNutstoreUsername(config.sync.nutstore.username);
        setNutstoreRootPath(config.sync.nutstore.rootPath);
        setNutstoreAppPassword(config.local.secrets.nutstoreAppPassword);
        setDefaultWorkspace(config.sync.defaultWorkspace);
        setActiveProfileId(config.sync.activeProfileId);
      } catch (error) {
        logger.error('[Settings] Failed to load cloud config:', error);
        setCloudStatus(`Failed to load cloud config: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsCloudLoading(false);
      }
    };

    loadCloudConfig().catch(error => {
      logger.error('[Settings] Unexpected cloud config load error:', error);
      setIsCloudLoading(false);
    });
  }, []);

  const refreshCloudConfig = async () => {
    const config = await cloudSyncService.getConfig();
    setCloudConfig(config);
  };

  const handleSaveCloudConfig = async () => {
    setIsSavingCloudConfig(true);
    setCloudStatus('');

    try {
      await Promise.all([
        cloudSyncService.updateSyncConfig({
          activeProfileId,
          defaultWorkspace,
          nutstore: {
            ...(cloudConfig?.sync.nutstore ?? {
              remoteRefs: {
                globalPrompt: 'prompts/global.md',
                profilesIndex: 'config/profiles-index.json',
                memoryIndex: 'config/memory-index.json',
              },
            }),
            enabled: nutstoreEnabled,
            baseUrl: nutstoreBaseUrl,
            username: nutstoreUsername,
            rootPath: nutstoreRootPath,
          },
        }),
        cloudSyncService.updateLocalConfig({
          secrets: {
            ...(cloudConfig?.local.secrets ?? { notionToken: '' }),
            nutstoreAppPassword,
          },
        }),
      ]);

      await refreshCloudConfig();
      setCloudStatus('Cloud sync configuration saved.');
    } catch (error) {
      logger.error('[Settings] Failed to save cloud config:', error);
      setCloudStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSavingCloudConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setCloudStatus('');

    try {
      await handleSaveCloudConfig();
      const result = await cloudSyncService.testNutstoreConnection();
      setCloudStatus(result.message);
      await refreshCloudConfig();
    } catch (error) {
      logger.error('[Settings] Nutstore connection test failed:', error);
      setCloudStatus(`Connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handlePullCoreFiles = async () => {
    setIsPullingRemote(true);
    setCloudStatus('');

    try {
      await handleSaveCloudConfig();
      const results = await cloudSyncService.pullCoreRemoteFiles();
      setCloudStatus(`Pulled ${results.length} core remote files successfully.`);
      await refreshCloudConfig();
    } catch (error) {
      logger.error('[Settings] Nutstore pull failed:', error);
      setCloudStatus(`Pull failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsPullingRemote(false);
    }
  };

  const handlePullGlobalPrompt = async () => {
    setIsPullingGlobalPrompt(true);
    setCloudStatus('');

    try {
      await handleSaveCloudConfig();
      const result = await cloudSyncService.pullGlobalPrompt();
      updatePreferences({
        customInstructions: result.content,
        customInstructionsEnabled: true,
      });
      setCloudStatus('Pulled global prompt and applied it to Custom Instructions.');
      await refreshCloudConfig();
    } catch (error) {
      logger.error('[Settings] Pull global prompt failed:', error);
      setCloudStatus(`Pull global prompt failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsPullingGlobalPrompt(false);
    }
  };

  const handlePushGlobalPrompt = async () => {
    setIsPushingGlobalPrompt(true);
    setCloudStatus('');

    try {
      await handleSaveCloudConfig();
      const content = preferences.customInstructions || '';
      if (!content.trim()) {
        throw new Error('Current Custom Instructions is empty');
      }

      await cloudSyncService.pushGlobalPrompt(content);
      setCloudStatus('Pushed current Custom Instructions to Nutstore global prompt.');
      await refreshCloudConfig();
    } catch (error) {
      logger.error('[Settings] Push global prompt failed:', error);
      setCloudStatus(`Push global prompt failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsPushingGlobalPrompt(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800">
        <CardContent className="p-4">
          <Typography variant="h4" className="mb-4 text-slate-700 dark:text-slate-300">
            自动化延迟设置
          </Typography>
          
          <div className="space-y-4">
            {/* Auto Insert Delay */}
            <div>
              <label
                htmlFor="auto-insert-delay"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                自动插入延迟（秒）
              </label>
              <input
                id="auto-insert-delay"
                type="number"
                min="0"
                value={preferences.autoInsertDelay || 0}
                onChange={(e) => handleDelayChange('autoInsert', e.target.value)}
                disabled={false}
                className={cn(
                  "w-full p-2 text-sm border rounded-md",
                  "bg-white dark:bg-slate-900",
                  "border-slate-300 dark:border-slate-600",
                  "text-slate-900 dark:text-slate-100"
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                自动插入内容前的等待时间
              </p>
            </div>

            {/* Auto Submit Delay */}
            <div>
              <label
                htmlFor="auto-submit-delay"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                自动提交延迟（秒）
              </label>
              <input
                id="auto-submit-delay"
                type="number"
                min="0"
                value={preferences.autoSubmitDelay || 0}
                onChange={(e) => handleDelayChange('autoSubmit', e.target.value)}
                disabled={false}
                className={cn(
                  "w-full p-2 text-sm border rounded-md",
                  "bg-white dark:bg-slate-900",
                  "border-slate-300 dark:border-slate-600",
                  "text-slate-900 dark:text-slate-100"
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                自动提交表单前的等待时间
              </p>
            </div>

            {/* Auto Execute Delay */}
            <div>
              <label
                htmlFor="auto-execute-delay"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                自动执行延迟（秒）
              </label>
              <input
                id="auto-execute-delay"
                type="number"
                min="0"
                value={preferences.autoExecuteDelay || 0}
                onChange={(e) => handleDelayChange('autoExecute', e.target.value)}
                disabled={false}
                className={cn(
                  "w-full p-2 text-sm border rounded-md",
                  "bg-white dark:bg-slate-900",
                  "border-slate-300 dark:border-slate-600",
                  "text-slate-900 dark:text-slate-100"
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                自动执行函数前的等待时间
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800">
        <CardContent className="p-4 space-y-4">
          <Typography variant="h4" className="text-slate-700 dark:text-slate-300">
            云端同步
          </Typography>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  启用坚果云同步
                </label>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  将提示词和记忆文件保存在坚果云 WebDAV 中，同时把密钥只保留在本地。
                </p>
              </div>
              <input
                type="checkbox"
                checked={nutstoreEnabled}
                onChange={e => setNutstoreEnabled(e.target.checked)}
                className="h-4 w-4"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                当前配置档 ID
              </label>
              <input
                type="text"
                value={activeProfileId}
                onChange={e => setActiveProfileId(e.target.value)}
                className={cn(
                  'w-full p-2 text-sm border rounded-md',
                  'bg-white dark:bg-slate-900',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-900 dark:text-slate-100',
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                默认工作区
              </label>
              <input
                type="text"
                value={defaultWorkspace}
                onChange={e => setDefaultWorkspace(e.target.value)}
                className={cn(
                  'w-full p-2 text-sm border rounded-md',
                  'bg-white dark:bg-slate-900',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-900 dark:text-slate-100',
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                坚果云 WebDAV 地址
              </label>
              <input
                type="text"
                value={nutstoreBaseUrl}
                onChange={e => setNutstoreBaseUrl(e.target.value)}
                placeholder="https://dav.jianguoyun.com/dav/"
                className={cn(
                  'w-full p-2 text-sm border rounded-md',
                  'bg-white dark:bg-slate-900',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-900 dark:text-slate-100',
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                坚果云用户名
              </label>
              <input
                type="text"
                value={nutstoreUsername}
                onChange={e => setNutstoreUsername(e.target.value)}
                className={cn(
                  'w-full p-2 text-sm border rounded-md',
                  'bg-white dark:bg-slate-900',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-900 dark:text-slate-100',
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                坚果云应用密码
              </label>
              <input
                type="password"
                value={nutstoreAppPassword}
                onChange={e => setNutstoreAppPassword(e.target.value)}
                className={cn(
                  'w-full p-2 text-sm border rounded-md',
                  'bg-white dark:bg-slate-900',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-900 dark:text-slate-100',
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                仅保存在本地存储中，不会进入同步存储。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                坚果云根目录
              </label>
              <input
                type="text"
                value={nutstoreRootPath}
                onChange={e => setNutstoreRootPath(e.target.value)}
                placeholder="/MCP-SuperAssistant/"
                className={cn(
                  'w-full p-2 text-sm border rounded-md',
                  'bg-white dark:bg-slate-900',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-900 dark:text-slate-100',
                )}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveCloudConfig} disabled={isSavingCloudConfig || isCloudLoading}>
                {isSavingCloudConfig ? '保存中...' : '保存云端配置'}
              </Button>
              <Button variant="outline" onClick={handleTestConnection} disabled={isTestingConnection || isCloudLoading || !nutstoreEnabled}>
                {isTestingConnection ? '测试中...' : '测试坚果云连接'}
              </Button>
              <Button variant="outline" onClick={handlePullCoreFiles} disabled={isPullingRemote || isCloudLoading || !nutstoreEnabled}>
                {isPullingRemote ? '拉取中...' : '拉取核心文件'}
              </Button>
              <Button variant="outline" onClick={handlePullGlobalPrompt} disabled={isPullingGlobalPrompt || isCloudLoading || !nutstoreEnabled}>
                {isPullingGlobalPrompt ? '拉取提示词中...' : '拉取全局提示词'}
              </Button>
              <Button variant="outline" onClick={handlePushGlobalPrompt} disabled={isPushingGlobalPrompt || isCloudLoading || !nutstoreEnabled}>
                {isPushingGlobalPrompt ? '推送提示词中...' : '推送全局提示词'}
              </Button>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <div>上次远程同步：{cloudConfig?.sync.syncMeta.lastRemoteSyncAt || '从未'}</div>
              <div>上次远程拉取：{cloudConfig?.sync.syncMeta.lastRemotePullAt || '从未'}</div>
              <div>上次远程推送：{cloudConfig?.sync.syncMeta.lastRemotePushAt || '从未'}</div>
              <div>本地同步错误：{cloudConfig?.local.syncState.lastError || '无'}</div>
            </div>

            {cloudStatus ? (
              <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {cloudStatus}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
