import desktopCommanderSpecialistSkillText from './skills/desktop-commander-specialist/SKILL.md?raw';
import desktopFilesSkillText from './skills/desktop-files/SKILL.md?raw';
import desktopProcessSkillText from './skills/desktop-process/SKILL.md?raw';
import browserAutomationSkillText from './skills/browser-automation/SKILL.md?raw';
import webResearchSkillText from './skills/web-research/SKILL.md?raw';
import mediaAnalysisSkillText from './skills/media-analysis/SKILL.md?raw';
import timeAndDateSkillText from './skills/time-and-date/SKILL.md?raw';
import mathAndCalcSkillText from './skills/math-and-calc/SKILL.md?raw';
import genericUtilitiesSkillText from './skills/generic-utilities/SKILL.md?raw';

export interface InstructionTool {
  name: string;
  schema: string;
  description: string;
}

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  priority: number;
  triggers: string[];
  body: string;
}

export interface SkillBundle {
  id: string;
  name: string;
  description: string;
  body: string;
  tools: InstructionTool[];
  priority: number;
  expanded: boolean;
}

const RAW_SKILLS: Array<{ id: string; text: string }> = [
  { id: 'desktop-commander-specialist', text: desktopCommanderSpecialistSkillText },
  { id: 'desktop-files', text: desktopFilesSkillText },
  { id: 'desktop-process', text: desktopProcessSkillText },
  { id: 'browser-automation', text: browserAutomationSkillText },
  { id: 'web-research', text: webResearchSkillText },
  { id: 'media-analysis', text: mediaAnalysisSkillText },
  { id: 'time-and-date', text: timeAndDateSkillText },
  { id: 'math-and-calc', text: mathAndCalcSkillText },
  { id: 'generic-utilities', text: genericUtilitiesSkillText },
];

const DESKTOP_COMMANDER_TOOL_NAMES = new Set([
  'create_directory',
  'edit_block',
  'force_terminate',
  'get_config',
  'get_file_info',
  'get_more_search_results',
  'get_prompts',
  'get_recent_tool_calls',
  'get_usage_stats',
  'give_feedback_to_desktop_commander',
  'interact_with_process',
  'kill_process',
  'list_directory',
  'list_processes',
  'list_searches',
  'list_sessions',
  'move_file',
  'read_file',
  'read_multiple_files',
  'read_process_output',
  'set_config_value',
  'start_process',
  'start_search',
  'stop_search',
  'write_file',
  'write_pdf',
]);

function parseSkillFile(id: string, text: string): SkillMetadata {
  const lines = text.split(/\r?\n/);
  const metadata: Record<string, string> = {};
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

const BUILTIN_SKILL_TEMPLATES: SkillMetadata[] = RAW_SKILLS.map(skill => parseSkillFile(skill.id, skill.text));

function inferSkillTemplate(tool: InstructionTool, skillTemplates: SkillMetadata[]): SkillMetadata {
  if (DESKTOP_COMMANDER_TOOL_NAMES.has(tool.name)) {
    const desktopCommanderSkill = skillTemplates.find(template => template.id === 'desktop-commander-specialist');
    if (desktopCommanderSkill) {
      return desktopCommanderSkill;
    }
  }

  const haystack = `${tool.name} ${tool.description || ''}`.toLowerCase();
  return (
    skillTemplates.find(template =>
      template.triggers.some(keyword => haystack.includes(keyword.toLowerCase())),
    ) || skillTemplates.find(template => template.id === 'generic-utilities') || BUILTIN_SKILL_TEMPLATES.find(template => template.id === 'generic-utilities')!
  );
}

function getHostBoost(skillId: string, currentHost: string): number {
  if (!currentHost) return 0;

  if (currentHost.includes('gemini') || currentHost.includes('chatgpt') || currentHost.includes('openai')) {
    if (
      skillId === 'desktop-commander-specialist' ||
      skillId === 'desktop-files' ||
      skillId === 'desktop-process'
    ) {
      return 8;
    }
    if (skillId === 'time-and-date' || skillId === 'math-and-calc') return 4;
  }

  return 0;
}

export function getBuiltinSkillTemplates(): SkillMetadata[] {
  return BUILTIN_SKILL_TEMPLATES;
}

export function buildSkillBundles(
  tools: InstructionTool[],
  currentHost: string,
  skillTemplates: SkillMetadata[] = BUILTIN_SKILL_TEMPLATES,
): SkillBundle[] {
  const bundleMap = new Map<string, SkillBundle>();

  tools.forEach(tool => {
    const template = inferSkillTemplate(tool, skillTemplates);
    const existing = bundleMap.get(template.id);

    if (existing) {
      existing.tools.push(tool);
      return;
    }

    bundleMap.set(template.id, {
      id: template.id,
      name: template.name,
      description: template.description,
      body: template.body,
      tools: [tool],
      priority: template.priority + getHostBoost(template.id, currentHost),
      expanded: false,
    });
  });

  const bundles = Array.from(bundleMap.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.tools.length !== a.tools.length) return b.tools.length - a.tools.length;
    return a.name.localeCompare(b.name);
  });

  const expandedCount = bundles.length <= 4 ? bundles.length : 4;
  return bundles.map((bundle, index) => ({
    ...bundle,
    expanded: index < expandedCount || bundle.tools.length === 1,
  }));
}

export function summarizeToolParameters(schemaText: string): {
  required: string[];
  optionalCount: number;
} {
  try {
    const schema = JSON.parse(schemaText);
    const properties = schema?.properties || {};
    const required = Array.isArray(schema?.required) ? schema.required : [];
    const propertyNames = Object.keys(properties);

    return {
      required,
      optionalCount: Math.max(0, propertyNames.length - required.length),
    };
  } catch {
    return {
      required: [],
      optionalCount: 0,
    };
  }
}
