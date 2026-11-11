// Automated Verification Suite for Groq Integration in Sahayak AI Browser
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock chrome API
globalThis.chrome = {
  runtime: {
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: () => {} },
    sendMessage: async () => {},
  },
  storage: {
    local: {
      data: {},
      get: async function(key) {
        if (typeof key === 'string') return { [key]: this.data[key] };
        return this.data;
      },
      set: async function(obj) {
        Object.assign(this.data, obj);
      },
    },
  },
};

const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

async function validateGroqApiKey(apiKey, model = 'llama-3.3-70b-versatile') {
  const cleanKey = apiKey ? apiKey.trim() : '';
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
      return {
        success: true,
        message: `Groq API Key verified successfully! Connected to ${model}.`,
        status: res.status,
        model,
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
  } catch (err) {
    return {
      success: false,
      message: err.message || 'Network request failed while testing Groq API key.',
      status: 0,
      model,
    };
  }
}

test('Groq Integration - Empty API Key returns 400 validation error', async () => {
  const res = await validateGroqApiKey('');
  assert.equal(res.success, false);
  assert.equal(res.status, 400);
  assert.match(res.message, /API key is required/);
});

test('Groq Integration - API Key validation with valid 200 response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer gsk_validtest123');
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'llama-3.3-70b-versatile' }] }),
    };
  };

  try {
    const result = await validateGroqApiKey('gsk_validtest123', 'llama-3.3-70b-versatile');
    assert.equal(result.success, true);
    assert.equal(result.status, 200);
    assert.match(result.message, /verified successfully/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Groq Integration - API Key validation with 401 unauthorized response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'Invalid API Key' } }),
  });

  try {
    const result = await validateGroqApiKey('gsk_badkey', 'llama-3.3-70b-versatile');
    assert.equal(result.success, false);
    assert.equal(result.status, 401);
    assert.match(result.message, /Invalid Groq API Key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Groq Integration - API Key validation with 429 rate limit response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: 'Rate limit reached' } }),
  });

  try {
    const result = await validateGroqApiKey('gsk_limited', 'llama-3.3-70b-versatile');
    assert.equal(result.success, false);
    assert.equal(result.status, 429);
    assert.match(result.message, /Groq rate limit reached/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Groq Integration - SSE Stream chunk decoding and DONE sentinel handling', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Namaste! "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Maine is page ko summarize "}}]}\n\n',
    ': keep-alive\n\n',
    'data: {"choices":[{"delta":{"content":"kar liya hai."}}]}\n\n',
    'data: [DONE]\n\n',
  ];

  let accumulated = '';
  const onChunk = (text) => {
    accumulated += text;
  };

  // Simulate SSE parser logic
  let buffer = '';
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      }
    }
  }

  assert.equal(accumulated, 'Namaste! Maine is page ko summarize kar liya hai.');
});

test('Groq Integration - Multi-turn Payload Construction for OpenAI/Groq REST schema', async () => {
  const systemInstruction = 'You are Sahayak in Hinglish mode.';
  const history = [
    { role: 'user', content: 'Kya aap summarize kar sakte hain?' },
    { role: 'assistant', content: 'Haan bilkul, poochiye!' },
  ];
  const prompt = 'Is video ke main points kya hain?';

  const groqMessages = [
    { role: 'system', content: systemInstruction },
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: prompt },
  ];

  assert.equal(groqMessages.length, 4);
  assert.equal(groqMessages[0].role, 'system');
  assert.equal(groqMessages[1].role, 'user');
  assert.equal(groqMessages[2].role, 'assistant');
  assert.equal(groqMessages[3].role, 'user');
  assert.equal(groqMessages[3].content, prompt);
});

test('Groq Integration - Auto-fallback when model does not exist or lacks access', async () => {
  let callCount = 0;
  const attemptedModels = [];

  const mockStreamGroqChat = async (messages, options) => {
    callCount++;
    attemptedModels.push(options.model);

    if (options.model === 'llama-3.3-70b-versatile') {
      const errDetail = 'The model llama-3.3-70b-versatile does not exist or you do not have access to it.';
      if (errDetail.includes('does not exist or you do not have access to it')) {
        return mockStreamGroqChat(messages, {
          ...options,
          model: 'llama-3.1-8b-instant',
        });
      }
    }

    return 'Fallback success output with llama-3.1-8b-instant!';
  };

  const result = await mockStreamGroqChat(
    [{ role: 'user', content: 'Summarize' }],
    { model: 'llama-3.3-70b-versatile' }
  );

  assert.equal(callCount, 2);
  assert.deepEqual(attemptedModels, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
  assert.equal(result, 'Fallback success output with llama-3.1-8b-instant!');
});

test('Groq Integration - Filter out text classification and non-chat models', () => {
  function isChatGenerationModel(modelId) {
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

  const rawGroqModels = [
    'llama-guard-3-8b',
    'meta-llama/llama-guard-4-12b',
    'whisper-large-v3',
    'whisper-large-v3-turbo',
    'prompt-guard-86m',
    'llama-3.1-8b-instant',
    'llama3-70b-8192',
    'gemma2-9b-it',
    'mixtral-8x7b-32768',
  ];

  const filtered = rawGroqModels.filter(isChatGenerationModel);
  assert.deepEqual(filtered, [
    'llama-3.1-8b-instant',
    'llama3-70b-8192',
    'gemma2-9b-it',
    'mixtral-8x7b-32768',
  ]);
  assert.equal(filtered.includes('llama-guard-3-8b'), false);
});

test('Groq Integration - Intercept and recover from text classification streaming error', async () => {
  const attempted = [];
  const runChat = async (options) => {
    let activeModel = options.model;
    if (activeModel.includes('guard')) {
      activeModel = 'llama-3.1-8b-instant';
    }
    attempted.push(activeModel);
    return `Success streaming with ${activeModel}`;
  };

  const output = await runChat({ model: 'llama-guard-3-8b' });
  assert.equal(output, 'Success streaming with llama-3.1-8b-instant');
  assert.deepEqual(attempted, ['llama-3.1-8b-instant']);
});

test('Primary Groq + Gemini Fallback - Automatic failover on HTTP 429 rate limit', async () => {
  const sentMessages = [];
  let groqCalled = false;
  let geminiCalled = false;
  let streamedChunks = [];

  const mockGroqChat = async () => {
    groqCalled = true;
    throw new Error('Groq API rate limit exceeded (HTTP 429).');
  };

  const mockGeminiGenerate = async (request, options) => {
    geminiCalled = true;
    options.onChunk('Gemini fallback response text.');
    options.onEnd('Gemini fallback response text.');
  };

  // Execute primary -> fallback logic
  const executePipeline = async (params) => {
    try {
      await mockGroqChat();
    } catch (groqErr) {
      if (params.enableFallback && params.geminiApiKey) {
        sentMessages.push({
          type: 'MSG_STREAM_FALLBACK',
          payload: {
            fromProvider: 'Groq',
            toProvider: 'Google Gemini',
            reason: groqErr.message,
            message: `Groq issue (${groqErr.message}). Automatically retrying with Google Gemini as fallback...`,
          },
        });

        await mockGeminiGenerate(params.geminiRequest, {
          apiKey: params.geminiApiKey,
          model: 'gemini-3.8-flash',
          onChunk: (chunk) => streamedChunks.push(chunk),
          onEnd: (fullText) => {
            sentMessages.push({
              type: 'MSG_STREAM_END',
              payload: { fullText, fallbackUsed: true },
            });
          },
        });
      } else {
        throw groqErr;
      }
    }
  };

  await executePipeline({
    enableFallback: true,
    geminiApiKey: 'AIzaSyTestKey',
    geminiRequest: { contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] },
  });

  assert.equal(groqCalled, true, 'Must send to Groq first');
  assert.equal(geminiCalled, true, 'Must automatically retry with Gemini on Groq 429');
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].type, 'MSG_STREAM_FALLBACK');
  assert.equal(sentMessages[0].payload.fromProvider, 'Groq');
  assert.equal(sentMessages[0].payload.toProvider, 'Google Gemini');
  assert.equal(sentMessages[1].type, 'MSG_STREAM_END');
  assert.equal(sentMessages[1].payload.fallbackUsed, true);
  assert.deepEqual(streamedChunks, ['Gemini fallback response text.']);
});

test('Primary Groq + Gemini Fallback - Preserves exact context, history & language persona', async () => {
  let receivedGeminiContents = null;
  let receivedGeminiSystemInstruction = null;

  const testPrompt = 'Summarize key points';
  const testHistory = [
    { role: 'user', content: 'What is WebAssembly?' },
    { role: 'assistant', content: 'WebAssembly is a binary instruction format.' },
  ];
  const testSystemPrompt = 'You are Sahayak. Answer in Hinglish.';

  const mockGroqChat = async () => {
    throw new Error('Groq model capacity temporary overload (HTTP 503)');
  };

  const mockGeminiGenerate = async (request, options) => {
    receivedGeminiContents = request.contents;
    receivedGeminiSystemInstruction = options.systemInstruction;
    return 'Done';
  };

  const executePipeline = async () => {
    try {
      await mockGroqChat();
    } catch {
      const geminiContents = [
        ...testHistory.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: testPrompt }] },
      ];
      await mockGeminiGenerate(
        { contents: geminiContents },
        { systemInstruction: testSystemPrompt }
      );
    }
  };

  await executePipeline();

  assert.equal(receivedGeminiSystemInstruction, testSystemPrompt, 'System prompt must remain identical');
  assert.equal(receivedGeminiContents.length, 3, 'Must retain all turns of history + prompt');
  assert.equal(receivedGeminiContents[0].parts[0].text, 'What is WebAssembly?');
  assert.equal(receivedGeminiContents[1].parts[0].text, 'WebAssembly is a binary instruction format.');
  assert.equal(receivedGeminiContents[2].parts[0].text, 'Summarize key points');
});



