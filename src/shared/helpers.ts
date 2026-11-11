import { BLACKLISTED_DOMAINS } from './constants';
import { isSecurityBlockedUrl } from '../background/safetyGuard';

/**
 * Checks whether the given URL matches blacklisted sensitive/financial/auth domains.
 */
export function isBlacklistedUrl(rawUrl: string, options?: { allowLocalhost?: boolean }): boolean {
  return isSecurityBlockedUrl(rawUrl, options);
}

/**
 * Validates whether the URL can be accessed by Chrome extension content scripts.
 */
export function isRestrictedBrowserUrl(rawUrl: string): boolean {
  if (!rawUrl) return true;
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'devtools://',
    'edge://',
    'about:',
    'view-source:',
    'https://chromewebstore.google.com',
  ];
  return restrictedPrefixes.some(prefix => rawUrl.startsWith(prefix));
}

/**
 * Safely parses JSON strings returned by LLMs, stripping code fences if present.
 */
export function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    let clean = raw.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}

/**
 * Truncates text cleanly at word boundaries.
 */
export function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '... [Content truncated]';
}

/**
 * Extracts a human-readable error message from any error object.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

