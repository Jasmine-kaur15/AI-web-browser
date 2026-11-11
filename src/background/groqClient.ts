// Groq API Client for Sahayak AI Browser
// Provides BYOK (Bring Your Own Key) authentication, fast LPU inference,
// and SSE streaming for grounded chat, article summarization, and task planning.

import {
  GroqModel,
  GroqChatMessage,
  GroqStreamOptions,
  GroqValidationResult,
  UserSettings,
} from '../shared/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants';

const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

/**
 * Filter out moderation, safety guard, audio, and classification models
 * that reject chat completions or streaming.
 */
export function isChatGenerationModel(modelId: string): boolean {
  const lower = String(modelId || '').toLowerCase();
  if (
    lower.includes('guard') ||
    lower.includes('whisper') ||
    lower.includes('audio') ||
    lower.includes('embed') ||
    lower.includes('moderation') ||
    lower.includes('classifier') ||
    lower.includes('safeguard') ||
    lower.includes('tts')
  ) {
    return false;
  }
  return true;
}

/**
 * Retrieves the currently configured Groq API Key from local storage,
 * falling back to constants/environment variables.
 */
export async function getStoredGroqApiKey(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const settings: UserSettings | undefined = data[STORAGE_KEYS.SETTINGS];
      if (settings?.groqApiKey && settings.groqApiKey.trim()) {
        return settings.groqApiKey.trim();
      }
    }
  } catch (err) {
    console.warn('[GroqClient] Could not read groqApiKey from chrome.storage:', err);
  }

  return DEFAULT_SETTINGS.groqApiKey || '';
}

/**
 * Retrieves the currently configured Groq model from storage or default.
 */
export async function getStoredGroqModel(): Promise<GroqModel> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const settings: UserSettings | undefined = data[STORAGE_KEYS.SETTINGS];
      if (settings?.groqModel && isChatGenerationModel(settings.groqModel)) {
        return settings.groqModel;
      }
    }
  } catch (err) {
    console.warn('[GroqClient] Could not read groqModel from storage:', err);
  }

  return DEFAULT_SETTINGS.groqModel || 'llama-3.1-8b-instant';
}

/**
 * Fetches all models accessible to the given Groq API Key,
 * separated into all models and permitted chat models.
 */
export async function getAvailableGroqModels(apiKey: string): Promise<{
  all: string[];
  chat: string[];
}> {
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const all: string[] = Array.isArray(data?.data)
        ? data.data.map((m: any) => String(m.id || '')).filter(Boolean)
        : [];
      const chat = all.filter(isChatGenerationModel);
      return { all, chat };
    }
  } catch (err) {
    console.warn('[GroqClient] Could not fetch models:', err);
  }
  return { all: [], chat: [] };
}

/**
 * Lightweight ping to validate whether a Groq API Key is valid and active.
 */
export async function validateGroqApiKey(
  apiKey: string,
  model: GroqModel | string = 'llama-3.1-8b-instant'
): Promise<GroqValidationResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return {
      success: false,
      message: 'API key is required. Please paste your Groq key (starts with gsk_).',
      status: 400,
      model,
    };
  }

  try {
    const res = await fetch(GROQ_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      const allModels: string[] = Array.isArray(data?.data)
        ? data.data.map((m: any) => String(m.id || '')).filter(Boolean)
        : [];
      
      // Filter out non-chat models (like llama-guard-3-8b, whisper) that reject streaming
      const availableModels = allModels.filter(isChatGenerationModel);

      if (availableModels.length === 0) {
        return {
          success: false,
          message: `API Key is valid, but this key does not have access to any chat models (only: ${allModels.join(', ') || 'none'}). Please create a new unrestricted key with Default Project permissions at console.groq.com/keys.`,
          status: 403,
          model,
          availableModels: [],
        };
      }

      const modelExists =
        Boolean(model) &&
        isChatGenerationModel(model) &&
        availableModels.includes(model);

      if (!modelExists) {
        // Suggested fallback model from user's active permitted chat models
        const fallback =
          availableModels.find((m) => m === 'llama-3.1-8b-instant') ||
          availableModels.find((m) => m.includes('3.1-8b') || m.includes('instant')) ||
          availableModels.find(
            (m) => m.includes('llama3-8b') || (m.includes('8b') && !m.includes('guard'))
          ) ||
          availableModels.find((m) => m.includes('llama')) ||
          availableModels[0];

        return {
          success: true,
          message: `Groq key active! Selected model "${model}" is not permitted on this key. Auto-selected active model "${fallback}".`,
          status: res.status,
          model: fallback,
          availableModels,
        };
      }

      return {
        success: true,
        message: `Groq API Key verified successfully! Connected to ${model}. (${availableModels.length} chat models available)`,
        status: res.status,
        model,
        availableModels,
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        message: 'Invalid Groq API Key. Please verify your key at console.groq.com/keys.',
        status: 401,
        model,
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        message: 'Groq rate limit reached (HTTP 429). Please wait a few moments.',
        status: 429,
        model,
      };
    }

    const errorData = await res.json().catch(() => null);
    const apiError = errorData?.error?.message || `HTTP ${res.status}: Validation failed`;

    return {
      success: false,
      message: apiError,
      status: res.status,
      model,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Network request failed while testing Groq API key.',
      status: 0,
      model,
    };
  }
}

/**
 * Fetch wrapper with exponential backoff for HTTP 429 (rate limits) and HTTP 503.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 1000,
  onRetry?: (attempt: number, maxRetries: number, delayMs: number) => void
): Promise<Response> {
  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(url, options);

      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        attempt++;
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[GroqClient] Rate limit/busy (${res.status}). Retrying in ${delayMs}ms (Attempt ${attempt}/${maxRetries})...`
        );
        onRetry?.(attempt, maxRetries, delayMs);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err;
      }
      if (attempt < maxRetries) {
        attempt++;
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[GroqClient] Network failure: ${err.message}. Retrying in ${delayMs}ms...`
        );
        onRetry?.(attempt, maxRetries, delayMs);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Streams chat responses from Groq's high-speed inference engine using SSE.
 */
export async function streamGroqChat(
  messages: GroqChatMessage[],
  options: GroqStreamOptions
): Promise<string> {
  const activeKey = options.apiKey ? options.apiKey.trim() : await getStoredGroqApiKey();
  if (!activeKey) {
    const keyError = new Error(
      'Missing Groq API Key. Please add your free key in Settings (starts with gsk_).'
    );
    options.onError?.(keyError);
    throw keyError;
  }

  let activeModel = options.model || (await getStoredGroqModel());

  // Prevent non-chat / guard models (e.g. llama-guard-3-8b) from throwing streaming errors
  if (!isChatGenerationModel(activeModel) || activeModel === 'llama-3.3-70b-versatile') {
    console.warn(
      `[GroqClient] Incompatible or restricted model "${activeModel}" detected for chat streaming. Auto-switching to "llama-3.1-8b-instant"...`
    );
    activeModel = 'llama-3.1-8b-instant';
  }

  const payload = {
    model: activeModel,
    messages: messages.map((m) => ({
      role: m.role,
      content: String(m.content || ''),
    })),
    temperature: options.temperature ?? 0.3,
    stream: true,
  };

  const response = await fetchWithRetry(
    GROQ_COMPLETIONS_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    },
    2,
    1000,
    options.onRetry
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail =
      errorBody?.error?.message || `HTTP ${response.status}: Failed to stream Groq response`;

    // Automatic fallback if requested model does not exist, lacks access, or is a text classification model
    if (
      response.status === 404 ||
      response.status === 400 ||
      detail.includes('text classification models do not support streaming') ||
      detail.includes('does not exist or you do not have access to it')
    ) {
      console.warn(
        `[GroqClient] Model "${activeModel}" failed (${detail}). Querying permitted models for key...`
      );

      const { all, chat } = await getAvailableGroqModels(activeKey);
      const alternate = chat.find((m) => m !== activeModel);

      if (alternate) {
        console.warn(
          `[GroqClient] Auto-switching from "${activeModel}" to working model "${alternate}"...`
        );

        // Auto-heal stored model preference so subsequent calls are instant
        try {
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
            if (stored[STORAGE_KEYS.SETTINGS]) {
              await chrome.storage.local.set({
                [STORAGE_KEYS.SETTINGS]: {
                  ...stored[STORAGE_KEYS.SETTINGS],
                  groqModel: alternate,
                },
              });
            }
          }
        } catch (storeErr) {
          console.debug('[GroqClient] Could not auto-update stored model preference:', storeErr);
        }

        return streamGroqChat(messages, {
          ...options,
          model: alternate,
        });
      }

      // If no valid alternate chat model is accessible on this key
      const helpfulDetail =
        chat.length === 0
          ? `Your Groq key has no access to chat models (only: ${all.length > 0 ? all.join(', ') : 'none'}). Please create a new unrestricted key at console.groq.com/keys with Default project permissions.`
          : `Model "${activeModel}" is not enabled on your Groq key. Permitted chat models: ${chat.join(', ')}.`;

      const err = new Error(helpfulDetail);
      options.onError?.(err);
      throw err;
    }

    if (response.status === 429) {
      const rateLimitError = new Error(
        'Groq API rate limit exceeded (HTTP 429). Please wait a few seconds and try again.'
      );
      options.onError?.(rateLimitError);
      throw rateLimitError;
    }

    const err = new Error(detail);
    options.onError?.(err);
    throw err;
  }

  if (!response.body) {
    const err = new Error('ReadableStream not supported by browser environment.');
    options.onError?.(err);
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  const abortHandler = () => {
    try {
      reader.cancel().catch(() => {});
    } catch {}
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortHandler();
      return '';
    }
    options.signal.addEventListener('abort', abortHandler, { once: true });
  }

  try {
    while (true) {
      if (options.signal?.aborted) {
        await reader.cancel().catch(() => {});
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              fullText += deltaContent;
              options.onChunk(deltaContent);
            }
          } catch (jsonErr) {
            console.debug('[GroqClient] Could not parse SSE data chunk:', jsonStr);
          }
        }
      }
    }

    // Flush any remaining line in buffer
    if (buffer.trim().startsWith('data: ')) {
      const jsonStr = buffer.trim().slice(6).trim();
      if (jsonStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(jsonStr);
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (deltaContent) {
            fullText += deltaContent;
            options.onChunk(deltaContent);
          }
        } catch {
          // Ignore trailing incomplete bytes
        }
      }
    }

    options.onEnd?.(fullText);
    return fullText;
  } catch (streamErr: any) {
    if (streamErr.name === 'AbortError' || options.signal?.aborted) {
      console.log('[GroqClient] Stream aborted by user.');
      return fullText;
    }
    options.onError?.(streamErr);
    throw streamErr;
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
  }
}

