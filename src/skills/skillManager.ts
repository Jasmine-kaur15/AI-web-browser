// Skill Engine Management and Utilities for Sahayak
import type { SkillItem } from '../shared/types';
import builtinSkillsData from './builtinSkills.json';

export const BUILTIN_SKILLS: SkillItem[] = (builtinSkillsData as SkillItem[]).map((s) => ({
  ...s,
  isBuiltin: true,
}));

export const SKILL_CATEGORIES = [
  { id: 'all', label: 'All Skills' },
  { id: 'summary', label: 'Summary & TL;DR' },
  { id: 'action', label: 'Browser Actions' },
  { id: 'draft', label: 'Draft & Reply' },
  { id: 'translate', label: 'Hinglish & Translate' },
  { id: 'custom', label: 'My Custom' },
] as const;

export type SkillCategoryFilter = 'all' | 'summary' | 'action' | 'draft' | 'translate' | 'custom';

/**
 * Returns all built-in skills
 */
export function getBuiltinSkills(): SkillItem[] {
  return [...BUILTIN_SKILLS];
}

/**
 * Merges built-in skills with user-defined custom skills
 */
export function getAllSkills(customSkills: SkillItem[] = []): SkillItem[] {
  const custom = customSkills.map((c) => ({
    ...c,
    isBuiltin: false,
  }));
  return [...BUILTIN_SKILLS, ...custom];
}

/**
 * Filters a list of skills by category and text search query
 */
export function filterSkills(
  skills: SkillItem[],
  options: { category?: string; query?: string } = {}
): SkillItem[] {
  const { category = 'all', query = '' } = options;
  const cleanQuery = query.trim().toLowerCase();

  return skills.filter((skill) => {
    // Category match
    if (category !== 'all') {
      if (category === 'custom') {
        if (skill.isBuiltin) return false;
      } else if (skill.category !== category) {
        return false;
      }
    }

    // Text search query match
    if (cleanQuery) {
      const matchTitle = skill.title.toLowerCase().includes(cleanQuery);
      const matchDesc = skill.description.toLowerCase().includes(cleanQuery);
      const matchPrompt = skill.prompt.toLowerCase().includes(cleanQuery);
      const matchCategory = skill.category.toLowerCase().includes(cleanQuery);
      if (matchTitle || matchDesc || matchPrompt || matchCategory) {
        return true;
      }

      // Also try normalized alphanumeric matching (e.g. 'tldr' matches 'TL;DR')
      const normQuery = cleanQuery.replace(/[^a-z0-9]/g, '');
      if (normQuery) {
        const normTitle = skill.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normDesc = skill.description.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normTitle.includes(normQuery) || normDesc.includes(normQuery)) {
          return true;
        }
      }

      return false;
    }

    return true;
  });
}

/**
 * Validates a custom skill schema before saving
 */
export function validateSkill(skill: Partial<SkillItem>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!skill.title || !skill.title.trim()) {
    errors.push('Skill title is required.');
  } else if (skill.title.trim().length > 60) {
    errors.push('Skill title cannot exceed 60 characters.');
  }

  if (!skill.prompt || !skill.prompt.trim()) {
    errors.push('Skill prompt template is required.');
  }

  const validCategories: SkillItem['category'][] = [
    'summary',
    'action',
    'draft',
    'translate',
    'custom',
  ];
  if (skill.category && !validCategories.includes(skill.category)) {
    errors.push(`Invalid category: ${skill.category}. Must be one of: ${validCategories.join(', ')}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Factory for creating a validated custom skill
 */
export function createSkillItem(params: {
  title: string;
  description: string;
  prompt: string;
  category?: SkillItem['category'];
}): SkillItem {
  const { title, description, prompt, category = 'custom' } = params;
  const validation = validateSkill({ title, prompt, category });
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return {
    id: `custom-${slug}-${Date.now().toString(36)}`,
    title: title.trim(),
    description: (description || '').trim(),
    prompt: prompt.trim(),
    category,
    isBuiltin: false,
    createdAt: Date.now(),
  };
}

/**
 * Routes skill execution to either the HITL browser action runner or the chat streaming engine
 */
export function getSkillExecutionTarget(skill: SkillItem): 'action' | 'chat' {
  if (skill.category === 'action') {
    return 'action';
  }

  const actionKeywords = [
    'fill out',
    'fill form',
    'profile vault',
    'som-badge',
    'click on',
    'submit button',
    'execute action',
  ];
  const promptLower = (skill.prompt || '').toLowerCase();
  for (const kw of actionKeywords) {
    if (promptLower.includes(kw)) {
      return 'action';
    }
  }

  return 'chat';
}

/**
 * Export skills array to structured JSON
 */
export function exportSkillsAsJSON(skills: SkillItem[]): string {
  return JSON.stringify(skills, null, 2);
}

/**
 * Import skills from JSON string with schema validation
 */
export function importSkillsFromJSON(jsonString: string): {
  success: boolean;
  skills?: SkillItem[];
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Imported payload must be a JSON array of skills.' };
    }

    const validated: SkillItem[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') {
        return { success: false, error: `Item at index ${i} is not a valid object.` };
      }
      const check = validateSkill(item);
      if (!check.valid) {
        return { success: false, error: `Item at index ${i} invalid: ${check.errors.join(' ')}` };
      }
      validated.push({
        id: item.id || `imported-${Date.now()}-${i}`,
        title: String(item.title).trim(),
        description: String(item.description || '').trim(),
        prompt: String(item.prompt).trim(),
        category: (item.category as SkillItem['category']) || 'custom',
        isBuiltin: false,
        createdAt: item.createdAt || Date.now(),
      });
    }

    return { success: true, skills: validated };
  } catch (err: any) {
    return { success: false, error: `Invalid JSON syntax: ${err.message}` };
  }
}
