// System constants and message identifiers for Sahayak

import { UserSettings } from './types';

export const STORAGE_KEYS = {
  SETTINGS: 'sahayak_settings',
  PROFILE: 'sahayak_profile',
  ACTIVE_TASK: 'sahayak_active_task',
  SKILLS: 'sahayak_custom_skills',
  CHAT_HISTORY: 'sahayak_chat_history',
  PENDING_CONTEXT_ACTION: 'sahayak_pending_context_action',
  CAPTURED_SCREEN: 'sahayak_captured_screen',
} as const;

// Optional developer API key from .env (VITE_GEMINI_API_KEY)
const getEnvApiKey = (): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return String(import.meta.env.VITE_GEMINI_API_KEY || '').trim();
    }
  } catch {
    // Graceful fallback for environments where import.meta is unavailable
  }
  return '';
};

// Optional developer Groq API key from .env (VITE_GROQ_API_KEY)
const getEnvGroqApiKey = (): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return String(import.meta.env.VITE_GROQ_API_KEY || '').trim();
    }
  } catch {
    // Graceful fallback for environments where import.meta is unavailable
  }
  return '';
};

export const DEFAULT_SETTINGS: UserSettings = {
  provider: 'groq',
  fallbackProvider: 'gemini',
  enableFallback: true,
  groqApiKey: getEnvGroqApiKey(),
  groqModel: 'llama-3.1-8b-instant',
  geminiApiKey: getEnvApiKey(),
  preferredLang: 'en',
  model: 'gemini-3.8-flash',
};

export const MESSAGE_TYPES = {
  // Key Validation
  VALIDATE_API_KEY: 'MSG_VALIDATE_API_KEY',
  VALIDATE_GROQ_KEY: 'MSG_VALIDATE_GROQ_KEY',

  // Page Scraper & Grounding
  EXTRACT_PAGE_CONTENT: 'MSG_EXTRACT_PAGE_CONTENT',
  EXTRACT_YOUTUBE_TRANSCRIPT: 'MSG_EXTRACT_YOUTUBE_TRANSCRIPT',
  PAGE_CONTENT_RESULT: 'MSG_PAGE_CONTENT_RESULT',
  
  // Streaming Chat
  REQUEST_STREAM_CHAT: 'MSG_REQUEST_STREAM_CHAT',
  STREAM_CHUNK: 'MSG_STREAM_CHUNK',
  STREAM_END: 'MSG_STREAM_END',
  STREAM_ERROR: 'MSG_STREAM_ERROR',
  STREAM_RETRY: 'MSG_STREAM_RETRY',
  STREAM_FALLBACK: 'MSG_STREAM_FALLBACK',
  
  // Screen Multimodal
  CAPTURE_SCREEN: 'MSG_CAPTURE_SCREEN',
  
  // Set-of-Marks & DOM Action Loop
  START_TASK: 'MSG_START_TASK',
  PLAN_NEXT_ACTION: 'MSG_PLAN_NEXT_ACTION',
  SCAN_INTERACTIVE_DOM: 'MSG_SCAN_INTERACTIVE_DOM',
  DOM_MAP_RESULT: 'MSG_DOM_MAP_RESULT',
  HIGHLIGHT_ELEMENT: 'MSG_HIGHLIGHT_ELEMENT',
  EXECUTE_DOM_ACTION: 'MSG_EXECUTE_DOM_ACTION',
  DOM_ACTION_RESULT: 'MSG_DOM_ACTION_RESULT',
  CLEAR_BADGES: 'MSG_CLEAR_BADGES',
  ABORT_TASK: 'MSG_ABORT_TASK',
  SKIP_ACTION: 'MSG_SKIP_ACTION',
  
  // Context Menu
  CONTEXT_MENU_TRIGGER: 'MSG_CONTEXT_MENU_TRIGGER',

  // Milestone 2.5: Active Field Text Insertion
  INSERT_TEXT_ACTIVE_FIELD: 'MSG_INSERT_TEXT_ACTIVE_FIELD',
} as const;

// Blacklisted domain regexes for financial, auth, sensitive portals
export const BLACKLISTED_DOMAINS = [
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'hdfcbank.com',
  'icicibank.com',
  'paypal.com',
  'stripe.com',
  'accounts.google.com',
  'login.microsoftonline.com',
  'github.com/login',
  'incometax.gov.in',
  'uidai.gov.in',
  'irs.gov',
];

// Sensitive input field tokens for automated exclusion
export const SENSITIVE_INPUT_REGEX =
  /(password|passwd|passcode|\bpass\b|\bpwd\b|\bpin\b|secret|token|cvv|cvc|creditcard|card_number|card-number|cardnumber|cc-number|exp-date|ssn|aadhaar|otp|authcode)/i;

