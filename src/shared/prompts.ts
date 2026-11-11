// Milestone 2.5: Selection-Aware "Draft Reply" Prompt Templates & Utilities
import { ReplyTone, ReplyPlatform, DraftReplyOptions } from './types';

export interface ToneOption {
  id: ReplyTone;
  label: string;
  tagline: string;
  iconName: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'professional',
    label: 'Polite & Professional',
    tagline: 'Courteous, structured workplace correspondence',
    iconName: 'Briefcase',
  },
  {
    id: 'concise',
    label: 'Direct & Concise',
    tagline: '1-3 brief sentences, zero filler',
    iconName: 'Zap',
  },
  {
    id: 'enthusiastic',
    label: 'Enthusiastic',
    tagline: 'Warm, engaging, positive energy',
    iconName: 'Sparkles',
  },
  {
    id: 'hinglish',
    label: 'Friendly Hinglish',
    tagline: 'Natural Latin-script conversational Hindi',
    iconName: 'Languages',
  },
];

export interface PlatformInfo {
  id: ReplyPlatform;
  label: string;
  badge: string;
  description: string;
}

export const PLATFORM_INFO: Record<ReplyPlatform, PlatformInfo> = {
  email: {
    id: 'email',
    label: 'Email / Message',
    badge: '📧 Email',
    description: 'Formatted with proper salutation, clear paragraphing, and polite sign-off',
  },
  twitter: {
    id: 'twitter',
    label: 'Twitter / X',
    badge: '🐦 Twitter / X',
    description: 'Punchy, conversational, strictly under 280 characters',
  },
  github: {
    id: 'github',
    label: 'GitHub Issue / PR',
    badge: '🐙 GitHub',
    description: 'Helpful developer tone with Markdown formatting where appropriate',
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn Post',
    badge: '💼 LinkedIn',
    description: 'Professional networking tone with industry insight',
  },
  general: {
    id: 'general',
    label: 'General Web Reply',
    badge: '💬 Comment',
    description: 'Context-tailored response ready to paste anywhere',
  },
};

/**
 * Automatically detects the web platform based on the current active page URL.
 */
export function detectPlatformFromUrl(url?: string): ReplyPlatform {
  if (!url) return 'general';
  const lower = url.toLowerCase();
  if (lower.includes('twitter.com') || lower.includes('x.com')) {
    return 'twitter';
  }
  if (
    lower.includes('mail.google.com') ||
    lower.includes('outlook.live.com') ||
    lower.includes('mail.yahoo.com') ||
    lower.includes('mail.')
  ) {
    return 'email';
  }
  if (lower.includes('github.com') || lower.includes('gitlab.com')) {
    return 'github';
  }
  if (lower.includes('linkedin.com')) {
    return 'linkedin';
  }
  return 'general';
}

/**
 * Builds an optimized instruction prompt for the LLM to draft a reply to selected text.
 */
export function buildDraftReplyPrompt(options: DraftReplyOptions): string {
  const { selectedText, tone, customInstructions, pageUrl } = options;
  const platform = options.platform || detectPlatformFromUrl(pageUrl);
  const snippet = selectedText.trim();

  const platformGuides: Record<ReplyPlatform, string> = {
    email:
      'PLATFORM: EMAIL. Structure with a polite greeting and sign-off if context permits. Keep paragraphs well-spaced.',
    twitter:
      'PLATFORM: TWITTER / X. Keep the reply punchy, engaging, conversational, and strictly under 280 characters.',
    github:
      'PLATFORM: GITHUB. Maintain a helpful, technical developer tone. Use Markdown code snippets or bullet lists if relevant.',
    linkedin:
      'PLATFORM: LINKEDIN. Maintain an articulate, professional networking tone suitable for professional discussions.',
    general:
      'PLATFORM: WEB COMMENT / FORUM. Maintain an articulate, conversational, and respectful tone directly addressing the comment.',
  };

  const toneGuides: Record<ReplyTone, string> = {
    professional:
      'TONE: POLITE & PROFESSIONAL. Express ideas with courteous professionalism, clarity, and respect. No slang.',
    concise:
      'TONE: DIRECT & CONCISE. Be brief and to the point. Limit the reply to 1-3 crisp sentences. Omit all pleasantries and filler.',
    enthusiastic:
      'TONE: ENTHUSIASTIC. Warm, positive, engaging, and appreciative. Express genuine excitement or support.',
    hinglish:
      'TONE: FRIENDLY HINGLISH. Natural, conversational Latin-script Hinglish (Hindi written ONLY using the English/Roman alphabet, e.g. "Haan bilkul, main dekh leta hoon"). NEVER use Devanagari script. Keep all technical, UI, and business terms in English.',
  };

  let prompt = `You are an expert communication assistant. Your task is to draft an exceptional reply to the following highlighted incoming text or message.

${platformGuides[platform]}
${toneGuides[tone]}

INCOMING MESSAGE TO REPLY TO:
"""
${snippet}
"""`;

  if (customInstructions && customInstructions.trim()) {
    prompt += `\n\nUSER'S SPECIFIC INSTRUCTIONS FOR THIS REPLY:
"""
${customInstructions.trim()}
"""`;
  }

  prompt += `\n\nCRITICAL OUTPUT RULES:
1. Output ONLY the raw final reply draft text.
2. Do NOT add meta comments (e.g. do NOT write "Here is your draft:", "Sure!", or "Hope this helps!").
3. Do NOT wrap the draft in outer quotes or code fences unless code is requested.
4. The output must be immediately ready to copy-paste or insert directly into the input field.`;

  return prompt;
}

