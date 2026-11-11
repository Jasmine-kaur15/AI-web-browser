// Service Worker Entrypoint for Sahayak AI Browser Agent (Manifest V3)
import { DEFAULT_SETTINGS, STORAGE_KEYS, MESSAGE_TYPES } from '../shared/constants';
import {
  streamGenerateContent,
  validateGeminiApiKey,
  sanitizeModelName,
  buildBilingualSystemPrompt,
  buildMultimodalChatContents,
} from './geminiClient';
import { validateGroqApiKey, streamGroqChat } from './groqClient';
import {
  GeminiGenerateContentRequest,
  GroqChatMessage,
  PageContentExtraction,
  YouTubeTranscriptExtraction,
} from '../shared/types';
import { isRestrictedBrowserUrl, isBlacklistedUrl } from '../shared/helpers';
import { registerContextMenus, handleContextMenuClick } from './contextMenus';
import { captureActiveTabViewport } from './tabCapture';
import { planNextAction } from './actionPlanner';
import { assessUrlSecurity } from './safetyGuard';
import { setupPortKeepAlive, saveActiveTask, getActiveTask, clearActiveTask } from './lifecycle';

console.log('[Sahayak Background] Service worker initialized.');

// Active AbortController tracking in-flight API requests (chat streams & action planning)
let activeBackgroundAbortController: AbortController | null = null;

export function abortActiveBackgroundRequests(): void {
  if (activeBackgroundAbortController) {
    console.log('[Sahayak Background] Aborting active AI request to conserve tokens.');
    try {
      activeBackgroundAbortController.abort();
    } catch {}
    activeBackgroundAbortController = null;
  }
}

// Milestone 4.4 & 4.6: Setup port keep-alive listener. When sidepanel closes, abort running requests & clear task
setupPortKeepAlive(() => {
  abortActiveBackgroundRequests();
  clearActiveTask().catch(() => {});
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    chrome.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.CLEAR_BADGES }).catch(() => {});
        }
      }
    }).catch(() => {});
  }
});

// Configure Side Panel behavior on extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[Sahayak Background] Extension installed/updated: ${details.reason}`);

  // Initialize or migrate default settings
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  if (!stored[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    });
    console.log('[Sahayak Background] Default settings initialized in local storage.');
  } else {
    const current = stored[STORAGE_KEYS.SETTINGS];
    const updated = {
      ...DEFAULT_SETTINGS,
      ...current,
      provider: current.provider || 'groq',
      fallbackProvider: current.fallbackProvider || 'gemini',
      enableFallback: current.enableFallback ?? true,
      groqApiKey: current.groqApiKey || DEFAULT_SETTINGS.groqApiKey,
      geminiApiKey: current.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey,
      groqModel:
        !current.groqModel ||
        current.groqModel.includes('guard') ||
        current.groqModel === 'llama-3.3-70b-versatile'
          ? 'llama-3.1-8b-instant'
          : current.groqModel,
      model:
        current.model === 'gemini-2.0-flash'
          ? 'gemini-3.8-flash'
          : current.model || DEFAULT_SETTINGS.model,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    console.log('[Sahayak Background] Settings verified/migrated in local storage.');
  }

  // Ensure side panel opens when user clicks the extension action icon in toolbar
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[Sahayak Background] Side panel behavior set to openPanelOnActionClick.');
    }
  } catch (err) {
    console.warn('[Sahayak Background] sidePanel API setPanelBehavior not supported:', err);
  }

  // Register Context Menus on installation or extension update (Milestone 2.1)
  registerContextMenus();
});

// Register context menu click listener at top level (MV3 service worker requirement)
if (typeof chrome !== 'undefined' && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}

// Re-register context menus on browser startup if needed
if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    registerContextMenus();
  });
}

// Milestone 4.4: Dynamic Content Script Re-injection & SPA Navigation Watcher
if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only monitor completed updates on valid web pages
    if (changeInfo.status === 'complete' && tab?.url && !isRestrictedBrowserUrl(tab.url)) {
      try {
        const ping = await chrome.tabs.sendMessage(tabId, { type: 'MSG_CONTENT_PING' });
        if (!ping) throw new Error('NO_PING');
      } catch {
        // Content script disconnected or missing on dynamic navigation -> dynamically re-inject
        try {
          if (chrome.scripting?.executeScript) {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content/index.js'],
            });
            console.log(`[Sahayak Background] Re-injected content script into tab ${tabId}`);
          }
        } catch (injectErr) {
          console.debug('[Sahayak Background] Script re-injection skipped:', injectErr);
        }
      }
    }
  });
}



/**
 * Reliably finds the active browser tab, whether invoked from service worker or side panel.
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url && !tab.url.startsWith('chrome-extension://')) {
      return tab;
    }

    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && !tab.url.startsWith('chrome-extension://')) {
      return tab;
    }

    const allTabs = await chrome.tabs.query({ active: true });
    tab = allTabs.find((t) => t.url && !t.url.startsWith('chrome-extension://')) || allTabs[0];
    return tab || null;
  } catch (err) {
    console.warn('[Sahayak Background] Could not query active tab:', err);
    return null;
  }
}

/**
 * Sends a message to a tab with a safety timeout to prevent hanging the background thread.
 */
function sendMessageWithTimeout(tabId: number, message: any, timeoutMs = 3500): Promise<any> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for content script response.`));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Safely extracts page content from the active tab.
 * Injects content script on-demand if not already loaded.
 */
async function getActiveTabPageContent(): Promise<PageContentExtraction> {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    throw new Error('No active browser tab found.');
  }

  if (isRestrictedBrowserUrl(tab.url)) {
    throw new Error(
      'Cannot access protected browser pages (e.g. chrome://, Web Store, or system URLs).'
    );
  }

  if (isBlacklistedUrl(tab.url)) {
    throw new Error('Sahayak is paused on this sensitive or financial website for your privacy.');
  }

  try {
    const res = await sendMessageWithTimeout(tab.id, {
      type: MESSAGE_TYPES.EXTRACT_PAGE_CONTENT,
    }, 2500);
    if (res && res.cleanText !== undefined) {
      return res;
    }
  } catch (err) {
    console.log('[Sahayak Background] Content script not detected, attempting programmatic injection...');
  }

  // On-demand injection if content script was disconnected / reloaded
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/index.js'],
  });

  // Short pause for listener registration
  await new Promise((r) => setTimeout(r, 100));

  const res = await sendMessageWithTimeout(tab.id, {
    type: MESSAGE_TYPES.EXTRACT_PAGE_CONTENT,
  }, 3500);

  if (!res) {
    throw new Error('Failed to communicate with page content script.');
  }

  return res;
}

/**
 * Safely extracts YouTube transcript and metadata from the active tab.
 */
async function getActiveTabYouTubeTranscript(
  preferredLang = 'en'
): Promise<YouTubeTranscriptExtraction> {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    throw new Error('No active browser tab found.');
  }

  const u = new URL(tab.url);
  const isYT = u.hostname.includes('youtube.com') || u.hostname === 'youtu.be';
  if (!isYT || (!u.searchParams.has('v') && !u.pathname.startsWith('/shorts/'))) {
    throw new Error(
      'Please navigate to a YouTube video watch page to extract video transcripts.'
    );
  }

  try {
    const res = await sendMessageWithTimeout(tab.id, {
      type: MESSAGE_TYPES.EXTRACT_YOUTUBE_TRANSCRIPT,
      payload: { preferredLang },
    }, 3000);
    if (res && res.transcript !== undefined) {
      return res;
    }
  } catch (err) {
    console.log('[Sahayak Background] Content script not active on YouTube tab, injecting...');
  }

  // On-demand injection
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/index.js'],
  });

  await new Promise((r) => setTimeout(r, 120));

  const res = await sendMessageWithTimeout(tab.id, {
    type: MESSAGE_TYPES.EXTRACT_YOUTUBE_TRANSCRIPT,
    payload: { preferredLang },
  }, 4000);

  if (!res) {
    throw new Error('Failed to retrieve YouTube transcript from the page.');
  }

  return res;
}

// Central message listener for communications between sidepanel, content script, and background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Sahayak Background] Received message:', message?.type, {
    tabId: sender.tab?.id,
  });

  // Healthcheck Ping
  if (message?.type === 'MSG_PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return true;
  }

  // Milestone 4.4 & 4.6: Explicit Task Termination & Token Saver
  if (
    message?.type === 'MSG_STOP_ACTIVE_TASK' ||
    message?.type === 'MSG_CLEAR_ACTIVE_TASK' ||
    message?.type === (MESSAGE_TYPES as any).STOP_TASK
  ) {
    abortActiveBackgroundRequests();
    clearActiveTask().catch(() => {});
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.CLEAR_BADGES }).catch(() => {});
          }
        }
      }).catch(() => {});
    }
    sendResponse({ success: true, stopped: true });
    return true;
  }

  // Milestone 1.2: BYOK Gemini Key Validation Ping
  if (
    message?.type === 'MSG_VALIDATE_API_KEY' ||
    message?.type === MESSAGE_TYPES.VALIDATE_API_KEY
  ) {
    const { apiKey, model } = message.payload || {};
    validateGeminiApiKey(apiKey, model).then((result) => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  // BYOK Groq Key Validation Ping
  if (
    message?.type === 'MSG_VALIDATE_GROQ_KEY' ||
    message?.type === MESSAGE_TYPES.VALIDATE_GROQ_KEY
  ) {
    const { apiKey, model } = message.payload || {};
    validateGroqApiKey(apiKey, model).then((result) => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  // Milestone 1.3: Background coordination for Page Content Extraction
  if (
    message?.type === MESSAGE_TYPES.EXTRACT_PAGE_CONTENT ||
    message?.type === 'MSG_EXTRACT_PAGE_CONTENT'
  ) {
    getActiveTabPageContent()
      .then((extraction) => {
        sendResponse({ success: true, ...extraction });
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'Page content extraction failed',
          title: '',
          cleanText: '',
          url: '',
          wordCount: 0,
        });
      });
    return true; // Keep channel open for async response
  }

  // Milestone 1.4: Background coordination for YouTube Transcript Extraction
  if (
    message?.type === MESSAGE_TYPES.EXTRACT_YOUTUBE_TRANSCRIPT ||
    message?.type === 'MSG_EXTRACT_YOUTUBE_TRANSCRIPT'
  ) {
    const preferredLang = message?.payload?.preferredLang || 'en';
    getActiveTabYouTubeTranscript(preferredLang)
      .then((extraction) => {
        sendResponse({ success: true, ...extraction });
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'YouTube transcript extraction failed',
          hasCaptions: false,
          transcript: '',
          wordCount: 0,
        });
      });
    return true; // Keep channel open for async response
  }

  // Milestone 2.3: Viewport Screen Capture Pipeline
  if (
    message?.type === MESSAGE_TYPES.CAPTURE_SCREEN ||
    message?.type === 'MSG_CAPTURE_SCREEN'
  ) {
    captureActiveTabViewport(message?.payload || {})
      .then((result) => {
        sendResponse(result);
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'Screen capture failed',
          mimeType: 'image/jpeg',
          timestamp: Date.now(),
        });
      });
    return true; // Keep channel open for async response
  }

  // Milestone 2.5: Forward Insert Text Request to Active Tab's Content Script
  if (
    message?.type === MESSAGE_TYPES.INSERT_TEXT_ACTIVE_FIELD ||
    message?.type === 'MSG_INSERT_TEXT_ACTIVE_FIELD'
  ) {
    (async () => {
      try {
        const tab = await getActiveTab();
        if (!tab?.id) {
          sendResponse({ success: false, error: 'NO_ACTIVE_TAB' });
          return;
        }

        const res = await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.INSERT_TEXT_ACTIVE_FIELD,
          payload: message?.payload || {},
        });
        sendResponse(res || { success: false, error: 'NO_RESPONSE_FROM_TAB' });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message || 'FAILED_TO_DISPATCH_TO_TAB' });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Milestone 3.3: Plan Next Action with Gemini Structured JSON (or Groq JSON mode)
  if (
    message?.type === MESSAGE_TYPES.PLAN_NEXT_ACTION ||
    message?.type === 'MSG_PLAN_NEXT_ACTION'
  ) {
    (async () => {
      try {
        const payload = message?.payload || {};

        // Milestone 4.3: Hard Lockout on Blacklisted & Sensitive Domains
        const targetUrl = payload.actionMap?.url || '';
        const assessment = assessUrlSecurity(targetUrl, {
          hasPasswordField: payload.actionMap?.hasPasswordField,
          allowLocalhost: true,
        });

        if (assessment.isBlocked) {
          console.warn(`[Sahayak Background] Action planning blocked by Safety Guard: ${assessment.reason}`);
          sendResponse({
            success: false,
            blocked: true,
            securityAssessment: assessment,
            error: assessment.reason,
            proposal: {
              status: 'CANNOT_PROCEED',
              thought: `Security guard triggered: ${assessment.reason}`,
              userExplanation: `Sahayak is paused for your safety on this sensitive page. Automated actions are strictly disabled on ${assessment.domain || assessment.category}.`,
            },
          });
          return;
        }

        abortActiveBackgroundRequests();
        activeBackgroundAbortController = new AbortController();

        const proposal = await planNextAction({
          ...payload,
          signal: activeBackgroundAbortController.signal,
        });
        sendResponse({
          success: true,
          proposal,
          timestamp: Date.now(),
        });
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          console.log('[Sahayak Background] Action planning was aborted (Sidepanel closed or user stopped).');
          sendResponse({
            success: false,
            aborted: true,
            error: 'Action planning was cancelled.',
            proposal: {
              status: 'CANNOT_PROCEED',
              thought: 'Planning aborted by user or panel close.',
              userExplanation: 'Action planning stopped.',
            },
          });
          return;
        }
        console.error('[Sahayak Background] Plan next action failed:', err);
        sendResponse({
          success: false,
          error: err.message || 'Action planning failed',
          proposal: {
            status: 'CANNOT_PROCEED',
            thought: `Planning error: ${err.message}`,
            userExplanation: `Unable to plan action: ${err.message}`,
          },
        });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Milestone 4.3: Query Security Assessment for Active Tab or URL
  if (
    message?.type === 'MSG_CHECK_SECURITY_STATUS' ||
    message?.type === (MESSAGE_TYPES as any).CHECK_SECURITY_STATUS
  ) {
    (async () => {
      try {
        let urlToCheck = message?.payload?.url;
        if (!urlToCheck) {
          const tab = await getActiveTab();
          urlToCheck = tab?.url || '';
        }
        const assessment = assessUrlSecurity(urlToCheck, {
          hasPasswordField: message?.payload?.hasPasswordField,
          allowLocalhost: true,
        });
        sendResponse({ success: true, assessment });
      } catch (err: any) {
        sendResponse({
          success: false,
          error: err.message,
          assessment: {
            isBlocked: true,
            category: 'restricted_browser',
            reason: 'Error evaluating URL security.',
            advice: 'Sahayak was paused due to a security verification error.',
          },
        });
      }
    })();
    return true;
  }

  // Milestone 4.4: In-Page SPA Navigation Notification
  if (message?.type === 'MSG_SPA_NAVIGATED') {
    const { url, title, source } = message.payload || {};
    console.log(`[Sahayak Background] SPA navigated (${source}):`, url);

    // Forward updated context info to side panel so UI context pill refreshes automatically
    chrome.runtime.sendMessage({
      type: 'MSG_PAGE_CONTEXT_ATTACHED',
      payload: {
        title: title || 'Webpage',
        url: url || '',
        wordCount: 0,
        isYouTube: Boolean(url && (url.includes('youtube.com/watch') || url.includes('youtube.com/shorts'))),
      },
    }).catch(() => {});

    sendResponse({ success: true, acknowledged: true });
    return true;
  }

  // Milestone 1.5 & 1.6: Grounded Streaming Chat Request Pipeline with Dual-Language Persona & Dual Provider (Groq / Gemini)
  if (message?.type === MESSAGE_TYPES.REQUEST_STREAM_CHAT) {
    const {
      prompt,
      lang,
      provider,
      model,
      apiKey,
      groqApiKey,
      geminiApiKey,
      groqModel,
      geminiModel,
      enableFallback: payloadEnableFallback,
      history,
      skipGrounding,
      screenshot,
    } = message.payload || {};

    (async () => {
      // Abort any previous background AI requests so tokens are conserved
      abortActiveBackgroundRequests();
      activeBackgroundAbortController = new AbortController();
      const currentStreamSignal = activeBackgroundAbortController.signal;

      let rawContextText = '';
      let rawPageTitle = '';
      let contextInfo = null;

      const hasVisionScreenshot = Boolean(
        screenshot &&
          (typeof screenshot === 'string' ||
            (typeof screenshot === 'object' && (screenshot.dataUrl || screenshot.base64)))
      );

      // Extract grounded context unless explicitly skipped or vision screenshot is staged
      if (!skipGrounding && !hasVisionScreenshot) {
        try {
          const activeTab = await getActiveTab();
          if (activeTab?.url) {
            const isYT =
              activeTab.url.includes('youtube.com/watch') || activeTab.url.includes('youtube.com/shorts');

            if (isYT) {
              const ytData = await getActiveTabYouTubeTranscript(lang || 'en');
              if (ytData && ytData.transcript) {
                rawContextText = ytData.transcript;
                rawPageTitle = ytData.title;
                contextInfo = {
                  title: ytData.title,
                  url: ytData.url,
                  wordCount: ytData.wordCount,
                  isYouTube: true,
                };
              }
            } else if (!isRestrictedBrowserUrl(activeTab.url) && !isBlacklistedUrl(activeTab.url)) {
              const pageData = await getActiveTabPageContent();
              if (pageData && pageData.cleanText) {
                rawContextText = pageData.cleanText;
                rawPageTitle = pageData.title;
                contextInfo = {
                  title: pageData.title,
                  url: pageData.url,
                  wordCount: pageData.wordCount,
                  isYouTube: false,
                };
              }
            }
          }
        } catch (ctxErr) {
          console.warn('[Sahayak Background] Could not attach page context for grounding:', ctxErr);
        }
      } else if (hasVisionScreenshot) {
        // Fast path for visual inspection: quickly query tab metadata without blocking on slow DOM readability scrape
        try {
          const activeTab = await getActiveTab();
          if (activeTab?.url) {
            rawPageTitle = activeTab.title || 'Webpage Viewport';
            contextInfo = {
              title: activeTab.title || 'Webpage Viewport',
              url: activeTab.url,
              wordCount: 0,
              isYouTube: false,
            };
          }
        } catch {}
      }

      // Notify sidepanel about attached context if found
      if (contextInfo) {
        chrome.runtime.sendMessage({
          type: 'MSG_PAGE_CONTEXT_ATTACHED',
          payload: contextInfo,
        }).catch(() => {});
      }

      // Milestone 1.6: Build bilingual system instruction (English or Hinglish) with strict grounding
      const groundedSystemInstruction = buildBilingualSystemPrompt({
        lang: (lang as any) || 'en',
        contextText: rawContextText || undefined,
        pageTitle: rawPageTitle || undefined,
      });

      // Retrieve stored user settings for fallback & credentials
      let storedSettings: any = {};
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        storedSettings = stored[STORAGE_KEYS.SETTINGS] || {};
      } catch (err) {
        console.warn('[Sahayak Background] Could not read stored settings:', err);
      }

      // Determine active AI provider (Default: Groq as primary)
      let activeProvider = provider || storedSettings.provider || 'groq';

      // Resolve API keys for both providers
      const activeGroqKey = (
        groqApiKey ||
        (activeProvider === 'groq' ? apiKey : undefined) ||
        storedSettings.groqApiKey ||
        DEFAULT_SETTINGS.groqApiKey ||
        ''
      ).trim();

      const activeGeminiKey = (
        geminiApiKey ||
        (activeProvider === 'gemini' ? apiKey : undefined) ||
        storedSettings.geminiApiKey ||
        DEFAULT_SETTINGS.geminiApiKey ||
        ''
      ).trim();

      // Resolve models
      const rawGroqModel =
        groqModel ||
        (activeProvider === 'groq' && model && !String(model).includes('gemini') ? model : undefined) ||
        storedSettings.groqModel ||
        DEFAULT_SETTINGS.groqModel ||
        'llama-3.1-8b-instant';

      const cleanGroqModel =
        !rawGroqModel || String(rawGroqModel).includes('guard') || rawGroqModel === 'llama-3.3-70b-versatile'
          ? 'llama-3.1-8b-instant'
          : rawGroqModel;

      const rawGeminiModel =
        geminiModel ||
        (activeProvider === 'gemini' && model ? model : undefined) ||
        storedSettings.model ||
        DEFAULT_SETTINGS.model ||
        'gemini-3.8-flash';

      const activeGeminiModel = sanitizeModelName(rawGeminiModel);

      // Fallback enabled by default
      const enableFallback = payloadEnableFallback ?? storedSettings.enableFallback ?? true;

      const promptText = String(prompt || '').trim() || 'Please summarize the page.';

      // Shared prompt history and message arrays for Groq and Gemini
      const groqMessages: GroqChatMessage[] = [
        { role: 'system', content: groundedSystemInstruction },
        ...(Array.isArray(history) ? history.slice(-6) : [])
          .filter((m: any) => m && m.content && String(m.content).trim())
          .map((m: any) => ({
            role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: String(m.content).trim(),
          })),
        {
          role: 'user',
          content: promptText,
        },
      ];

      const geminiContents = [
        ...(Array.isArray(history) ? history.slice(-6) : [])
          .filter((m: any) => m && m.content && String(m.content).trim())
          .map((m: any) => ({
            role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
            parts: [{ text: String(m.content).trim() }],
          })),
        {
          role: 'user' as const,
          parts: [{ text: promptText }],
        },
      ];

      const geminiRequest: GeminiGenerateContentRequest = {
        contents: geminiContents,
      };

      // -------------------------------------------------------------
      // Milestone 2.4: Multimodal Vision Routing (Google Gemini Multimodal)
      // If a screenshot is present, route directly to Google Gemini Multimodal API.
      // (Groq free-tier chat models are text-only and do not accept visual parts).
      // -------------------------------------------------------------
      const hasScreenshot = Boolean(
        screenshot &&
          ((typeof screenshot === 'string' &&
            (screenshot.startsWith('data:') || screenshot.length > 50)) ||
            (typeof screenshot === 'object' && (screenshot.dataUrl || screenshot.base64)))
      );

      if (hasScreenshot) {
        if (!activeGeminiKey) {
          throw new Error(
            'Google Gemini API Key is required for screenshot and visual reasoning. Please configure your free Gemini key in Sahayak Settings.'
          );
        }

        let cleanBase64 = '';
        let screenshotMime = 'image/jpeg';

        if (typeof screenshot === 'string') {
          if (screenshot.startsWith('data:')) {
            const parts = screenshot.split(',');
            const match = parts[0].match(/data:([^;]+);/);
            if (match && match[1]) screenshotMime = match[1];
            cleanBase64 = parts[1] || '';
          } else {
            cleanBase64 = screenshot;
          }
        } else if (typeof screenshot === 'object') {
          screenshotMime = screenshot.mimeType || 'image/jpeg';
          if (screenshot.base64) {
            cleanBase64 = screenshot.base64.includes(',')
              ? screenshot.base64.split(',')[1]
              : screenshot.base64;
          } else if (screenshot.dataUrl) {
            if (screenshot.dataUrl.startsWith('data:')) {
              const parts = screenshot.dataUrl.split(',');
              const match = parts[0].match(/data:([^;]+);/);
              if (match && match[1]) screenshotMime = match[1];
              cleanBase64 = parts[1] || '';
            } else {
              cleanBase64 = screenshot.dataUrl;
            }
          }
        }

        console.log(
          `[Sahayak Background] Executing Gemini Multimodal Vision reasoning with model ${activeGeminiModel}...`
        );

        const visionSystemInstruction =
          lang === 'hinglish'
            ? `Aap Sahayak ke visual data aur chart analysis expert hain. Is screenshot me dikhaye gaye charts, graphs, tables, ya UI metrics par direct focus karein.
Apna answer turant structured format me dein:
1. **Chart Type & Title**: Chart ka type (Bar, Line, Pie, Area, etc.) aur title/metric kya hai.
2. **Key Metrics & Numbers**: Highest values, lowest values, current/latest numbers.
3. **Core Insight & Trend**: Visual data ka main takeaway ya trend kya hai (growth, drop, anomaly).
Bina kisi lambe preamble ke seedha point-to-point aur clearly explain karein.`
            : `You are an expert visual data and chart analyst for Sahayak AI Browser Agent.
Focus directly and immediately on the visual elements (charts, plots, graphs, tables, or UI metrics) in this screenshot.
Format your answer with clear, structured bullet points and bold titles:
1. **Chart Type & Scope**: Identify the chart type (e.g. Bar, Line, Candlestick, Scatter, Pie) and what variables it measures.
2. **Key Data Points & Values**: Highlight peaks, troughs, current values, and notable legend metrics.
3. **Primary Insight & Trend**: State the key takeaway or directional trend (e.g. steady growth, drop, seasonality, outlier).
Avoid generic filler or lengthy preambles; provide your analysis directly, crisply, and accurately.`;

        const multimodalRequest = buildMultimodalChatContents(
          promptText,
          cleanBase64,
          history,
          screenshotMime
        );

        await streamGenerateContent(multimodalRequest, {
          apiKey: activeGeminiKey,
          model: activeGeminiModel,
          systemInstruction: visionSystemInstruction,
          signal: currentStreamSignal,
          onChunk: (chunk) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_CHUNK,
              payload: { text: chunk },
            }).catch(() => {});
          },
          onEnd: (fullText) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_END,
              payload: { fullText, context: contextInfo, isMultimodal: true },
            }).catch(() => {});
          },
          onError: (geminiErr) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_ERROR,
              payload: { error: `Gemini Vision Error: ${geminiErr.message}` },
            }).catch(() => {});
          },
          onRetry: (attempt, maxRetries, delayMs) => {
            const retryAfterSeconds = Math.max(1, Math.round(delayMs / 1000));
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_RETRY,
              payload: {
                attempt,
                maxRetries,
                delayMs,
                retryAfterSeconds,
                provider: 'gemini',
                message: `Gemini rate limit encountered. Retrying in ${retryAfterSeconds}s (Attempt ${attempt}/${maxRetries})...`,
              },
            }).catch(() => {});
          },
        });

        return;
      }

      let executeGeminiFallback = false;
      let fallbackReason = '';
      let groqStreamStarted = false;

      // -------------------------------------------------------------
      // PRIMARY: Execute Groq first
      // -------------------------------------------------------------
      if (activeProvider === 'groq') {
        if (!activeGroqKey) {
          if (enableFallback && activeGeminiKey) {
            console.warn('[Sahayak Background] Groq key missing. Auto-falling back to Gemini.');
            executeGeminiFallback = true;
            fallbackReason = 'Groq API Key not configured';
          } else {
            throw new Error(
              'Missing Groq API Key. Please add your key in Sahayak Settings (starts with gsk_).'
            );
          }
        } else {
          try {
            await streamGroqChat(groqMessages, {
              apiKey: activeGroqKey,
              model: cleanGroqModel,
              signal: currentStreamSignal,
              onChunk: (chunk) => {
                groqStreamStarted = true;
                chrome.runtime.sendMessage({
                  type: MESSAGE_TYPES.STREAM_CHUNK,
                  payload: { text: chunk },
                }).catch(() => {});
              },
              onEnd: (fullText) => {
                chrome.runtime.sendMessage({
                  type: MESSAGE_TYPES.STREAM_END,
                  payload: { fullText, context: contextInfo },
                }).catch(() => {});
              },
              onError: (err) => {
                console.warn('[Sahayak Background] Groq streaming error encountered:', err.message);
              },
              onRetry: (attempt, maxRetries, delayMs) => {
                const retryAfterSeconds = Math.max(1, Math.round(delayMs / 1000));
                chrome.runtime.sendMessage({
                  type: MESSAGE_TYPES.STREAM_RETRY,
                  payload: {
                    attempt,
                    maxRetries,
                    delayMs,
                    retryAfterSeconds,
                    provider: 'groq',
                    message: `Groq rate limit encountered. Retrying in ${retryAfterSeconds}s (Attempt ${attempt}/${maxRetries})...`,
                  },
                }).catch(() => {});
              },
            });
          } catch (groqErr: any) {
            console.warn('[Sahayak Background] Groq execution failed:', groqErr.message);

            // If request was aborted by user stopping or panel closing, do NOT fallback
            if (currentStreamSignal.aborted || groqErr.name === 'AbortError' || groqErr.message?.includes('aborted')) {
              console.log('[Sahayak Background] Groq stream aborted by user or panel close. Suppressing fallback.');
              return;
            }

            if (enableFallback && activeGeminiKey) {
              executeGeminiFallback = true;
              fallbackReason = groqErr.message || 'Groq service error';
            } else {
              throw groqErr;
            }
          }
        }
      }

      // -------------------------------------------------------------
      // FALLBACK: Execute Gemini (or direct if provider === 'gemini')
      // -------------------------------------------------------------
      if (executeGeminiFallback) {
        if (currentStreamSignal.aborted) {
          console.log('[Sahayak Background] Gemini fallback suppressed because request was aborted.');
          return;
        }
        console.log(
          `[Sahayak Background] Automatically retrying request with Google Gemini fallback (Reason: ${fallbackReason})...`
        );

        // Notify Side Panel UI about fallback trigger
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.STREAM_FALLBACK,
          payload: {
            fromProvider: 'Groq',
            toProvider: 'Google Gemini',
            reason: fallbackReason,
            hadPartialOutput: groqStreamStarted,
            message: `Groq issue (${fallbackReason}). Automatically retrying with Google Gemini as fallback...`,
          },
        }).catch(() => {});

        // Seamless retry preserving exact conversation & grounding context
        await streamGenerateContent(geminiRequest, {
          apiKey: activeGeminiKey,
          model: activeGeminiModel,
          systemInstruction: groundedSystemInstruction,
          signal: currentStreamSignal,
          onChunk: (chunk) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_CHUNK,
              payload: { text: chunk },
            }).catch(() => {});
          },
          onEnd: (fullText) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_END,
              payload: { fullText, context: contextInfo, fallbackUsed: true },
            }).catch(() => {});
          },
          onError: (geminiErr) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_ERROR,
              payload: {
                error: `Groq failed (${fallbackReason}), and Gemini fallback also failed: ${geminiErr.message}`,
              },
            }).catch(() => {});
          },
          onRetry: (attempt, maxRetries, delayMs) => {
            const retryAfterSeconds = Math.max(1, Math.round(delayMs / 1000));
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_RETRY,
              payload: {
                attempt,
                maxRetries,
                delayMs,
                retryAfterSeconds,
                provider: 'gemini',
                message: `Gemini rate limit encountered. Retrying in ${retryAfterSeconds}s (Attempt ${attempt}/${maxRetries})...`,
              },
            }).catch(() => {});
          },
        });
      } else if (activeProvider === 'gemini') {
        // Direct Gemini request
        await streamGenerateContent(geminiRequest, {
          apiKey: activeGeminiKey,
          model: activeGeminiModel,
          systemInstruction: groundedSystemInstruction,
          signal: currentStreamSignal,
          onChunk: (chunk) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_CHUNK,
              payload: { text: chunk },
            }).catch(() => {});
          },
          onEnd: (fullText) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_END,
              payload: { fullText, context: contextInfo },
            }).catch(() => {});
          },
          onError: (err) => {
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_ERROR,
              payload: { error: err.message },
            }).catch(() => {});
          },
          onRetry: (attempt, maxRetries, delayMs) => {
            const retryAfterSeconds = Math.max(1, Math.round(delayMs / 1000));
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.STREAM_RETRY,
              payload: {
                attempt,
                maxRetries,
                delayMs,
                retryAfterSeconds,
                provider: 'gemini',
                message: `Gemini rate limit encountered. Retrying in ${retryAfterSeconds}s (Attempt ${attempt}/${maxRetries})...`,
              },
            }).catch(() => {});
          },
        });
      }
    })().catch((err) => {
      console.error('[Sahayak Background] Streaming execution failed:', err);
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.STREAM_ERROR,
        payload: { error: err.message },
      }).catch(() => {});
    });

    sendResponse({ status: 'STREAMING_STARTED' });
    return true;
  }

  return false;
});
