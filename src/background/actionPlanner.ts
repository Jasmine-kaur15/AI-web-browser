// Set-of-Marks Structured JSON Action Planner for Sahayak AI Browser Agent
// Milestone 3.3: Analyzes user goal and numbered DOM elements, evaluates page state,
// and plans discrete next actions using Gemini's structured responseSchema (or Groq JSON mode).

import {
  ActionMap,
  ActionLogEntry,
  LanguageMode,
  LLMActionProposalResponse,
  ProposedAction,
  GeminiModel,
  UserSettings,
} from '../shared/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants';
import {
  getEffectiveApiKey,
  getEffectiveModel,
  sanitizeModelName,
  generateContent,
} from './geminiClient';
import { getStoredGroqApiKey, getStoredGroqModel } from './groqClient';
import { formatProfileMatchingGuidance } from './profileMatcher';

/**
 * Strict JSON schema for Google Gemini API structured output (v1beta responseSchema).
 * Compliant with architecture.md section 5.3.
 */
export const GEMINI_ACTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: {
      type: 'STRING',
      enum: ['ACTION_PROPOSED', 'TASK_COMPLETED', 'CANNOT_PROCEED'],
    },
    thought: {
      type: 'STRING',
      description: 'Internal chain-of-thought rationale explaining which element was selected and why.',
    },
    userExplanation: {
      type: 'STRING',
      description: 'Clear, concise human-facing explanation in English or Latin-script Hinglish justifying the action.',
    },
    action: {
      type: 'OBJECT',
      properties: {
        actionType: {
          type: 'STRING',
          enum: ['CLICK', 'TYPE', 'SELECT', 'SCROLL', 'WAIT', 'COMPLETED'],
        },
        targetElementId: {
          type: 'INTEGER',
          description: 'The numeric #ID badge of the target element from the ActionMap.',
        },
        value: {
          type: 'STRING',
          description: 'The string value to type into an input field or the option to select from a dropdown.',
        },
        scrollDirection: {
          type: 'STRING',
          enum: ['UP', 'DOWN', 'TOP', 'BOTTOM'],
          description: 'Direction to scroll if actionType is SCROLL.',
        },
      },
      required: ['actionType'],
    },
  },
  required: ['status', 'thought', 'userExplanation'],
};

/**
 * Serializes an ActionMap into a compact, token-efficient text representation for LLM prompt ingestion.
 * Omits raw bounding box pixel numbers while highlighting ID, tag, label, placeholder, and current values.
 */
export function formatActionMapPrompt(actionMap: ActionMap, maxElements = 100): string {
  if (!actionMap || !actionMap.elements || actionMap.elements.length === 0) {
    return 'No visible interactive elements detected on the current page.';
  }

  const lines: string[] = [];
  lines.push(`Page Title: "${actionMap.title || 'Untitled'}"`);
  lines.push(`Page URL: ${actionMap.url || 'unknown'}`);
  lines.push(
    `Viewport: ${actionMap.viewport.width}x${actionMap.viewport.height} (Scroll: ${actionMap.viewport.scrollY}px)`
  );
  lines.push(
    `\nVisible Interactive Elements (Identified by Set-of-Marks numbered badges #1 to #${actionMap.elements.length}):`
  );

  const displayElements = actionMap.elements.slice(0, maxElements);
  for (const el of displayElements) {
    const parts: string[] = [`[#${el.id}] <${el.tag}${el.type ? ` type="${el.type}"` : ''}>`];

    if (el.label) {
      parts.push(`Label: "${el.label}"`);
    }
    if (el.placeholder) {
      parts.push(`Placeholder: "${el.placeholder}"`);
    }
    if (el.currentValue !== undefined && el.currentValue !== '') {
      parts.push(`Current Value: "${el.currentValue}"`);
    }
    if (el.options && el.options.length > 0) {
      parts.push(`Options: [${el.options.map((o) => `"${o}"`).join(', ')}]`);
    }
    if (el.role) {
      parts.push(`Role: "${el.role}"`);
    }

    lines.push(parts.join(' | '));
  }

  if (actionMap.elements.length > maxElements) {
    lines.push(`\n... (${actionMap.elements.length - maxElements} additional elements omitted for brevity)`);
  }

  return lines.join('\n');
}

/**
 * Constructs the system instruction prompt enforcing structured action planning,
 * supported action types, privacy guardrails, and language persona.
 */
export function buildActionPlannerSystemPrompt(lang: LanguageMode = 'en'): string {
  const isHinglish = lang === 'hinglish';

  let prompt = `You are Sahayak, an intelligent, precise, and safe AI browser agent.
Your objective is to help the user accomplish their goal on the current webpage step-by-step.
Operating Language: ${isHinglish ? 'HINGLISH (Latin script only, natural conversational Hindi)' : 'ENGLISH'}

CORE PLANNING PRINCIPLES:
1. SELECT THE SINGLE BEST NEXT ACTION:
   - Given the user's Goal and the numbered elements on the page, select the single logical next step.
   - Do NOT attempt to perform multiple actions at once. The human user must review and approve each discrete action before execution.

2. ALLOWED ACTION TYPES:
   - "CLICK": Click a button, link, checkbox, radio button, tab, or menu item. (Specify targetElementId).
   - "TYPE": Enter text into an input field, search box, or textarea. (Specify targetElementId and value).
   - "SELECT": Pick an option from a <select> dropdown list. (Specify targetElementId and value matching an option).
   - "SCROLL": Scroll the page if target elements are not yet in view. (Specify scrollDirection: "UP", "DOWN", "TOP", "BOTTOM").
   - "WAIT": Pause execution to allow asynchronous page load or redirect.
   - "COMPLETED": Declare when the user's high-level goal has been completely achieved.

3. STATUS CODES:
   - "ACTION_PROPOSED": When proposing a valid next action step.
   - "TASK_COMPLETED": When the goal is completely finished and no further browser actions are required.
   - "CANNOT_PROCEED": When blocked by an insurmountable issue (e.g. required CAPTCHA, empty page, unsupported site, missing credentials).

4. USER EXPLANATION REQUIREMENTS (PROPER, THOROUGH & EXPLAINABLE):
   - Provide a comprehensive, clearly structured "userExplanation" that gives the human user full context on what is happening and why.
   - NEVER output bare single-word or two-word points (e.g. "- Name", "- Submit").
   - The explanation MUST clearly state:
     1) The exact element targeted and the action performed (e.g. Typing into Full Name field #1).
     2) The value being entered or selected and its source (e.g. using saved data from Profile Vault).
     3) The reason this step is chosen to achieve the overall goal.
   - If multiple details or reasons are provided, format them as clean, well-spaced bullet points where each point begins with a bold label followed by a complete explanatory sentence.
   - If the task is finished (status: "TASK_COMPLETED"), provide a structured point-by-point summary of what was accomplished:
     * **1. Form Fields Completed:** All required passenger fields have been filled.
     * **2. Next Action:** Ready for your review and manual submission.
${
  isHinglish
    ? `   - In Hinglish: Write Hindi words strictly in Latin script (e.g. "Passenger Full Name field #1 me Profile Vault se 'Rohan Mehra' type kar rahe hain taaki booking information complete ho sake."). NEVER use Devanagari.`
    : `   - In English: Write clear, proper explanatory sentences (e.g. "Typing 'Rohan Mehra' into the Passenger Full Name input (#1) using your saved profile details to complete the passenger requirement.").`
}

5. STRICT SAFETY & PRIVACY GUARDRAILS:
   - NEVER automate or guess sensitive credentials like passwords, OTPs, or payment card numbers.
   - For irreversible actions (e.g. "Submit Payment", "Delete Account", "Confirm Transfer"), emphasize in userExplanation that this is an irreversible action requiring careful human review.`;

  return prompt;
}

/**
 * Builds the user turn prompt combining user goal, interactive element map,
 * previous action history, and optional user profile autofill data.
 */
export function buildActionPlannerUserPrompt(
  goal: string,
  actionMap: ActionMap,
  history: ActionLogEntry[] = [],
  userProfile?: Record<string, string>
): string {
  const parts: string[] = [];

  parts.push(`USER GOAL:\n${goal.trim()}`);

  if (userProfile && Object.keys(userProfile).length > 0) {
    const profileItems = Object.entries(userProfile)
      .filter(([k, v]) => v && !k.toLowerCase().includes('pass') && !k.toLowerCase().includes('card'))
      .map(([k, v]) => `  - ${k}: "${v}"`)
      .join('\n');
    if (profileItems) {
      parts.push(`\nAVAILABLE USER PROFILE DATA (Use for autofilling relevant form fields):\n${profileItems}`);
    }

    const matchingGuidance = formatProfileMatchingGuidance(actionMap, userProfile as any);
    if (matchingGuidance) {
      parts.push(`\n${matchingGuidance}`);
    }
  }

  if (history && history.length > 0) {
    const historyList = history
      .slice(-6)
      .map((entry, idx) => {
        const actionStr = `${entry.action.actionType}${
          entry.action.targetElementId ? ` on #${entry.action.targetElementId}` : ''
        }${entry.action.value ? ` with value "${entry.action.value}"` : ''}`;
        return `  ${idx + 1}. [${entry.status}] ${actionStr} - ${entry.userExplanation}`;
      })
      .join('\n');
    parts.push(`\nPREVIOUS ACTION HISTORY (DO NOT repeat actions already executed):\n${historyList}`);
  }

  parts.push(`\nCURRENT PAGE STATE:\n${formatActionMapPrompt(actionMap)}`);

  parts.push(
    `\nINSTRUCTION: Analyze the page state and return the next single best action as structured JSON conforming to the response schema.`
  );

  return parts.join('\n\n');
}

/**
 * Sanitizes and validates the raw JSON response from the LLM.
 * Cross-references targetElementId with actual elements in the ActionMap.
 */
export function parseAndValidateActionProposal(
  rawText: string,
  actionMap: ActionMap
): LLMActionProposalResponse {
  if (!rawText || !rawText.trim()) {
    return {
      status: 'CANNOT_PROCEED',
      thought: 'LLM returned an empty response.',
      userExplanation: 'Could not plan the next action (empty AI response).',
    };
  }

  // Strip Markdown code fences if model enclosed JSON
  let cleanJson = rawText.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (err: any) {
    console.error('[ActionPlanner] Failed to parse JSON response:', cleanJson);
    return {
      status: 'CANNOT_PROCEED',
      thought: `JSON parse error: ${err.message}. Raw output: ${cleanJson.slice(0, 200)}`,
      userExplanation: 'AI returned an invalid JSON response format.',
    };
  }

  // Validate status
  const validStatuses = ['ACTION_PROPOSED', 'TASK_COMPLETED', 'CANNOT_PROCEED'];
  const status = validStatuses.includes(parsed.status)
    ? parsed.status
    : parsed.action
    ? 'ACTION_PROPOSED'
    : 'CANNOT_PROCEED';

  const thought = String(parsed.thought || 'Planning action based on visible elements.');
  const userExplanation = String(
    parsed.userExplanation || 'Proposed browser action for your review.'
  );

  let action: ProposedAction | undefined = undefined;

  if (parsed.action && typeof parsed.action === 'object') {
    const rawActionType = String(parsed.action.actionType || '').toUpperCase();
    const validActionTypes = ['CLICK', 'TYPE', 'SELECT', 'SCROLL', 'WAIT', 'COMPLETED'];
    const actionType = validActionTypes.includes(rawActionType)
      ? (rawActionType as any)
      : 'CLICK';

    action = {
      actionType,
      value: parsed.action.value !== undefined ? String(parsed.action.value) : undefined,
      scrollDirection: parsed.action.scrollDirection || undefined,
    };

    if (parsed.action.targetElementId !== undefined) {
      const targetId = Number(parsed.action.targetElementId);
      if (!isNaN(targetId) && targetId > 0) {
        action.targetElementId = targetId;

        // Cross-reference with actionMap elements to enrich proposal
        const matchedElement = actionMap.elements?.find((el) => el.id === targetId);
        if (matchedElement) {
          action.targetLabel = matchedElement.label;
          action.targetSelector = matchedElement.selector;
        }
      }
    }
  }

  // Edge case: If status is ACTION_PROPOSED but no action is defined
  if (status === 'ACTION_PROPOSED' && !action) {
    return {
      status: 'CANNOT_PROCEED',
      thought: 'Model declared ACTION_PROPOSED but omitted action details.',
      userExplanation: 'AI could not specify which element to interact with next.',
    };
  }

  return {
    status,
    thought,
    userExplanation,
    action,
  };
}

export interface PlanActionParams {
  goal: string;
  actionMap: ActionMap;
  history?: ActionLogEntry[];
  lang?: LanguageMode;
  userProfile?: Record<string, string>;
  apiKeyOverride?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  modelOverride?: GeminiModel;
  groqModel?: string;
  providerOverride?: 'groq' | 'gemini';
  signal?: AbortSignal;
}

/**
 * Plans the single next browser action using Google Gemini Structured Outputs (responseSchema).
 */
export async function planActionWithGemini(
  params: PlanActionParams
): Promise<LLMActionProposalResponse> {
  const { goal, actionMap, history = [], lang = 'en', userProfile, modelOverride } = params;

  if (!actionMap || !actionMap.elements || actionMap.elements.length === 0) {
    return {
      status: 'CANNOT_PROCEED',
      thought: 'ActionMap contains zero interactive elements.',
      userExplanation: 'No clickable or input elements were found on this page.',
    };
  }

  const systemInstruction = buildActionPlannerSystemPrompt(lang);
  const userPrompt = buildActionPlannerUserPrompt(goal, actionMap, history, userProfile);

  const rawKey = params.geminiApiKey || params.apiKeyOverride;
  const apiKey = (await getEffectiveApiKey(rawKey)).trim();
  if (!apiKey) {
    throw new Error('Google Gemini API Key is missing. Please configure it in Settings.');
  }

  const model = sanitizeModelName(await getEffectiveModel(modelOverride));
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0.1, // Low temperature for deterministic planning
      responseMimeType: 'application/json',
      responseSchema: GEMINI_ACTION_RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: params.signal,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const detail =
      errorBody?.error?.message || `HTTP ${res.status}: Failed to plan action with Gemini`;
    throw new Error(detail);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseAndValidateActionProposal(rawText, actionMap);
}

/**
 * Plans the next action using Groq (OpenAI JSON Mode) as high-speed primary or fallback.
 */
export async function planActionWithGroq(
  params: PlanActionParams
): Promise<LLMActionProposalResponse> {
  const { goal, actionMap, history = [], lang = 'en', userProfile } = params;

  const rawKey = params.groqApiKey || params.apiKeyOverride;
  const apiKey = (rawKey ? rawKey.trim() : await getStoredGroqApiKey()).trim();
  if (!apiKey) {
    throw new Error('Groq API Key is missing. Please configure it in Settings.');
  }

  const model = (params.groqModel || (await getStoredGroqModel())) as any;
  const systemInstruction = `${buildActionPlannerSystemPrompt(
    lang
  )}\n\nCRITICAL: You MUST respond ONLY with valid JSON conforming to this exact schema:\n${JSON.stringify(
    GEMINI_ACTION_RESPONSE_SCHEMA,
    null,
    2
  )}`;
  const userPrompt = buildActionPlannerUserPrompt(goal, actionMap, history, userProfile);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const detail =
      errorBody?.error?.message || `HTTP ${res.status}: Failed to plan action with Groq`;
    throw new Error(detail);
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content || '';

  return parseAndValidateActionProposal(rawText, actionMap);
}

/**
 * Master Action Planning function with dual-provider Groq / Gemini auto-fallback support.
 */
export async function planNextAction(
  params: PlanActionParams
): Promise<LLMActionProposalResponse> {
  let provider = params.providerOverride;

  if (!provider) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        const settings = stored[STORAGE_KEYS.SETTINGS] as UserSettings | undefined;
        provider = settings?.provider || 'groq';
      }
    } catch {
      provider = DEFAULT_SETTINGS.provider;
    }
  }

  const hasGroq = Boolean(
    (params.groqApiKey || (await getStoredGroqApiKey())).trim()
  );
  const hasGemini = Boolean(
    (params.geminiApiKey || params.apiKeyOverride || (await getEffectiveApiKey())).trim()
  );

  if (!hasGroq && !hasGemini) {
    throw new Error(
      'Please configure a valid Groq or Gemini API Key in Settings (gear icon) to run the Action Planner.'
    );
  }

  // Auto-switch provider if user's selected provider has no key configured
  if (provider === 'groq' && !hasGroq && hasGemini) {
    provider = 'gemini';
  } else if (provider === 'gemini' && !hasGemini && hasGroq) {
    provider = 'groq';
  }

  // 1. If provider is Gemini, call Gemini directly with native responseSchema
  if (provider === 'gemini') {
    try {
      return await planActionWithGemini(params);
    } catch (geminiErr: any) {
      console.warn('[ActionPlanner] Gemini failed, attempting Groq fallback:', geminiErr);
      if (hasGroq) {
        return await planActionWithGroq(params);
      }
      throw geminiErr;
    }
  }

  // 2. If provider is Groq (LPU fast inference), call Groq with JSON Mode
  try {
    return await planActionWithGroq(params);
  } catch (groqErr: any) {
    console.warn('[ActionPlanner] Groq failed, attempting Gemini fallback:', groqErr);
    if (hasGemini) {
      return await planActionWithGemini(params);
    }
    throw groqErr;
  }
}

