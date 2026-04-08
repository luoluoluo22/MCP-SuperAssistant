import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const DEFAULT_PUBLIC_HOST = process.env.SUPER_SERVICE_HOST || 'localhost';
const DEFAULT_PUBLIC_PORT = Number(process.env.SUPER_SERVICE_PORT || 3006);
const DEFAULT_PROXY_HOST = process.env.SUPER_PROXY_HOST || '127.0.0.1';
const DEFAULT_PROXY_PORT = Number(process.env.SUPER_PROXY_PORT || DEFAULT_PUBLIC_PORT + 100);
const DEFAULT_TRANSPORT = process.env.SUPER_OUTPUT_TRANSPORT || 'ws';
const DEFAULT_SKILLS_DIR = process.env.SUPER_SKILLS_DIR || path.join(os.homedir(), '.super', 'skills');
const DEFAULT_CONFIG_PATH = process.env.SUPER_PROXY_CONFIG || path.join(process.cwd(), 'config.json');

function parseArgs(argv) {
  const options = {
    host: DEFAULT_PUBLIC_HOST,
    port: DEFAULT_PUBLIC_PORT,
    proxyHost: DEFAULT_PROXY_HOST,
    proxyPort: DEFAULT_PROXY_PORT,
    outputTransport: DEFAULT_TRANSPORT,
    config: DEFAULT_CONFIG_PATH,
    skillsDir: DEFAULT_SKILLS_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key.startsWith('--') || value === undefined) {
      continue;
    }

    switch (key) {
      case '--host':
        options.host = value;
        index += 1;
        break;
      case '--port':
        options.port = Number(value);
        index += 1;
        break;
      case '--proxyHost':
        options.proxyHost = value;
        index += 1;
        break;
      case '--proxyPort':
        options.proxyPort = Number(value);
        index += 1;
        break;
      case '--outputTransport':
        options.outputTransport = value;
        index += 1;
        break;
      case '--config':
        options.config = path.resolve(value);
        index += 1;
        break;
      case '--skillsDir':
        options.skillsDir = path.resolve(value);
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

function log(message, payload) {
  if (payload) {
    console.log(`[super-local-service] ${message}`, payload);
    return;
  }

  console.log(`[super-local-service] ${message}`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function parseSkillFile(id, text) {
  const lines = text.split(/\r?\n/);
  const metadata = {};
  let bodyStart = 0;

  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() === '---') {
        bodyStart = i + 1;
        break;
      }

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }

      const metadataKey = line.slice(0, separatorIndex).trim();
      const metadataValue = line.slice(separatorIndex + 1).trim();
      metadata[metadataKey] = metadataValue;
    }
  }

  return {
    id,
    name: metadata.name || id,
    description: metadata.description || '',
    priority: Number(metadata.priority || 0),
    triggers: metadata.triggers ? metadata.triggers.split(',').map(item => item.trim()).filter(Boolean) : [],
    body: lines.slice(bodyStart).join('\n').trim(),
  };
}

async function readSkillDirectory(skillDirPath) {
  const skillId = path.basename(skillDirPath);
  const skillFilePath = path.join(skillDirPath, 'SKILL.md');
  const skillText = await fs.readFile(skillFilePath, 'utf8');
  return parseSkillFile(skillId, skillText);
}

async function readAllSkills() {
  const entries = await fs.readdir(options.skillsDir, { withFileTypes: true }).catch(() => []);
  const skillDirectories = entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(options.skillsDir, entry.name));
  const skills = [];

  for (const directory of skillDirectories) {
    try {
      const skill = await readSkillDirectory(directory);
      skills.push(skill);
    } catch {
      // Skip invalid skill directories.
    }
  }

  return skills.sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
}

function createProxyProcess() {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    '-y',
    '@srbhptl39/mcp-superassistant-proxy@latest',
    '--config',
    options.config,
    '--outputTransport',
    options.outputTransport,
    '--host',
    options.proxyHost,
    '--port',
    String(options.proxyPort),
  ];

  log('starting embedded MCP proxy', {
    config: options.config,
    outputTransport: options.outputTransport,
    proxyHost: options.proxyHost,
    proxyPort: options.proxyPort,
  });

  const child = spawn(npxCommand, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  child.stdout.on('data', chunk => {
    process.stdout.write(`[embedded-proxy] ${chunk}`);
  });

  child.stderr.on('data', chunk => {
    process.stderr.write(`[embedded-proxy] ${chunk}`);
  });

  child.on('exit', (code, signal) => {
    log(`embedded MCP proxy exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
    process.exitCode = code ?? 1;
    server.close(() => {
      process.exit(process.exitCode || 1);
    });
  });

  return child;
}

function proxyHttpRequest(clientReq, clientRes) {
  const requestOptions = {
    protocol: 'http:',
    hostname: options.proxyHost,
    port: options.proxyPort,
    method: clientReq.method,
    path: clientReq.url,
    headers: {
      ...clientReq.headers,
      host: `${options.proxyHost}:${options.proxyPort}`,
    },
  };

  const proxyReq = http.request(requestOptions, proxyRes => {
    clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', error => {
    sendJson(clientRes, 502, {
      error: 'Failed to reach embedded MCP proxy',
      details: error.message,
    });
  });

  clientReq.pipe(proxyReq);
}

function proxyUpgradeRequest(req, socket, head) {
  const upstreamSocket = net.connect(options.proxyPort, options.proxyHost, () => {
    let rawHeaders = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      const headerName = req.rawHeaders[index];
      const headerValue = req.rawHeaders[index + 1];
      rawHeaders += `${headerName}: ${headerValue}\r\n`;
    }
    rawHeaders += '\r\n';

    upstreamSocket.write(rawHeaders);
    if (head?.length) {
      upstreamSocket.write(head);
    }
    socket.pipe(upstreamSocket).pipe(socket);
  });

  upstreamSocket.on('error', () => {
    socket.end();
  });

  socket.on('error', () => {
    upstreamSocket.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const requestUrl = new URL(req.url, `http://${options.host}:${options.port}`);

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'super-local-service',
      skillsDir: options.skillsDir,
      proxy: {
        host: options.proxyHost,
        port: options.proxyPort,
        outputTransport: options.outputTransport,
      },
    });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/skills') {
    const skills = await readAllSkills();
    sendJson(res, 200, { skills });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname.startsWith('/skills/')) {
    const skillId = decodeURIComponent(requestUrl.pathname.replace('/skills/', ''));
    try {
      const skill = await readSkillDirectory(path.join(options.skillsDir, skillId));
      sendJson(res, 200, { skill });
    } catch {
      sendJson(res, 404, { error: `Skill not found: ${skillId}` });
    }
    return;
  }

  proxyHttpRequest(req, res);
});

server.on('upgrade', (req, socket, head) => {
  proxyUpgradeRequest(req, socket, head);
});

const proxyProcess = createProxyProcess();

function shutdown(signal) {
  log(`received ${signal}, shutting down`);
  server.close(() => {
    if (!proxyProcess.killed) {
      proxyProcess.kill();
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(options.port, options.host, () => {
  log(`listening on http://${options.host}:${options.port}`);
  log(`global skills dir: ${options.skillsDir}`);
  log(`proxied MCP traffic -> http://${options.proxyHost}:${options.proxyPort}`);
});
