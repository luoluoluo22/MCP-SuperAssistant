import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const outputDir = resolve(projectRoot, 'dist-mobile-packages');
const defaultServerHost = process.env.MCP_MOBILE_SERVER_HOST || '43.156.149.208:3006';
const websocketUrl = process.env.CEB_DEFAULT_WEBSOCKET_URL || `ws://${defaultServerHost}/message`;
const streamableHttpUrl = process.env.CEB_DEFAULT_STREAMABLE_HTTP_URL || `http://${defaultServerHost}`;
const sseUrl = process.env.CEB_DEFAULT_SSE_URL || `http://${defaultServerHost}/sse`;
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const baseName = `mcp-superassistant-mobile-${timestamp}`;
const keyPath = resolve(outputDir, `${baseName}.pem`);
const crxPath = resolve(outputDir, `${baseName}.crx`);
const zipPath = resolve(outputDir, `${baseName}.zip`);

mkdirSync(outputDir, { recursive: true });

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CLI_CEB_DEV: 'false',
      CLI_CEB_FIREFOX: 'false',
      CEB_MOBILE: 'true',
      CEB_DEFAULT_WEBSOCKET_URL: websocketUrl,
      CEB_DEFAULT_STREAMABLE_HTTP_URL: streamableHttpUrl,
      CEB_DEFAULT_SSE_URL: sseUrl,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('pnpm', ['base-build']);
run('npx', ['crx3', '-p', keyPath, '-o', crxPath, '-z', zipPath, '--', distDir]);

const files = readdirSync(outputDir)
  .map(name => ({ name, fullPath: resolve(outputDir, name) }))
  .filter(entry => statSync(entry.fullPath).isFile())
  .sort((left, right) => left.name.localeCompare(right.name));

console.log('\nMobile extension packages created:');
for (const file of files) {
  console.log(file.fullPath);
}
