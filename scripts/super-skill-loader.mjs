import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const PORT = Number(process.env.SUPER_SKILL_LOADER_PORT || 3210);
const HOST = process.env.SUPER_SKILL_LOADER_HOST || '127.0.0.1';
const SKILLS_DIR = process.env.SUPER_SKILLS_DIR || path.join(os.homedir(), '.super', 'skills');

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
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '---') {
        bodyStart = i + 1;
        break;
      }

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      metadata[key] = value;
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
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => []);
  const directories = entries.filter(entry => entry.isDirectory()).map(entry => path.join(SKILLS_DIR, entry.name));
  const skills = [];

  for (const directory of directories) {
    try {
      const skill = await readSkillDirectory(directory);
      skills.push(skill);
    } catch {
      // Skip invalid skill folders.
    }
  }

  return skills.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
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

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, skillsDir: SKILLS_DIR });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/skills') {
    const skills = await readAllSkills();
    sendJson(res, 200, { skills });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/skills/')) {
    const skillId = decodeURIComponent(url.pathname.replace('/skills/', ''));
    try {
      const skill = await readSkillDirectory(path.join(SKILLS_DIR, skillId));
      sendJson(res, 200, { skill });
    } catch {
      sendJson(res, 404, { error: `Skill not found: ${skillId}` });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[super-skill-loader] listening on http://${HOST}:${PORT}`);
  console.log(`[super-skill-loader] skills dir: ${SKILLS_DIR}`);
});
