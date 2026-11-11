import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Header, AgentStatus } from './components/Header';
import { NavigationTabs, TabId } from './components/NavigationTabs';
import { ChatView, PageContextInfo, DraftComposerState } from './components/ChatView';
import { QuickActions } from './components/QuickActions';
import { HITLApproval } from './components/HITLApproval';
import { ActionHistory } from './components/ActionHistory';
import { ProfileVault } from './components/ProfileVault';
import { SkillsLibrary } from './components/SkillsLibrary';
import { SecurityBanner } from './components/SecurityBanner';
import { RateLimitBanner, RateLimitState } from './components/RateLimitBanner';
import { SettingsView } from './components/SettingsView';
import { SettingsModal } from './components/SettingsModal';
import { ToastNotification, ToastData } from './components/ToastNotification';
import { useStorage } from './hooks/useStorage';
import {
  useExtensionMsg,
  useContextMenuListener,
  buildContextActionPrompt,
  getContextActionTitle,
} from './hooks/useExtensionMsg';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  MESSAGE_TYPES,
} from '../shared/constants';
import {
  UserSettings,
  UserProfile,
  ChatMessage,
  LLMActionProposalResponse,
  ProposedAction,
  ActionLogEntry,
  SkillItem,
  SecurityAssessment,
  ContextMenuTriggerPayload,
  ScreenCaptureResult,
  ReplyTone,
  ReplyPlatform,
} from '../shared/types';
import { buildDraftReplyPrompt, detectPlatformFromUrl } from '../shared/prompts';
import { getSkillExecutionTarget } from '../skills/skillManager';
import { assessUrlSecurity } from '../background/safetyGuard';
import {
  saveChatSession,
  getChatSession,
  saveActiveTask,
  getActiveTask,
  clearActiveTask,
} from '../background/lifecycle';
import { Sparkles, Play, UserCheck, Zap, Square } from 'lucide-react';
import './index.css';

const DEFAULT_PROFILE: UserProfile = {
  fullName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  linkedInUrl: '',
  githubUrl: '',
  bio: '',
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [profileSubTab, setProfileSubTab] = useState<'profile' | 'skills'>('profile');
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const [stagedScreenshot, setStagedScreenshot] = useState<ScreenCaptureResult | null>(null);
  const [draftState, setDraftState] = useState<DraftComposerState | null>(null);

  // Storage hooks
  const [settings, setSettings] = useStorage<UserSettings>(
    STORAGE_KEYS.SETTINGS,
    DEFAULT_SETTINGS
  );

  // Auto-migrate settings from local storage
  React.useEffect(() => {
    let changed = false;
    const next = { ...settings };
    if (!next.provider) {
      next.provider = 'groq';
      changed = true;
    }
    if (
      !next.groqModel ||
      next.groqModel.includes('guard') ||
      next.groqModel === 'llama-3.3-70b-versatile'
    ) {
      next.groqModel = 'llama-3.1-8b-instant';
      changed = true;
    }
    if (next.groqApiKey === undefined) {
      next.groqApiKey = '';
      changed = true;
    }
    if (next.model === 'gemini-2.0-flash') {
      next.model = 'gemini-3.8-flash';
      changed = true;
    }
    if (changed) {
      setSettings(next);
    }
  }, [settings, setSettings]);

  const [profile, setProfile] = useStorage<UserProfile>(
    STORAGE_KEYS.PROFILE,
    DEFAULT_PROFILE
  );

  // Chat & Grounded Context state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeContext, setActiveContext] = useState<PageContextInfo | null>(null);
  const [securityAssessment, setSecurityAssessment] = useState<SecurityAssessment | null>(null);
  const [allowLocalhost, setAllowLocalhost] = useState<boolean>(true);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  // HITL Action state
  const [pendingProposal, setPendingProposal] = useState<LLMActionProposalResponse | null>(null);
  const [actionHistory, setActionHistory] = useState<ActionLogEntry[]>([]);
  const [stepNumber, setStepNumber] = useState(1);
  const [isPlanningAction, setIsPlanningAction] = useState(false);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionGoalInput, setActionGoalInput] = useState('');
  const [activeGoal, setActiveGoal] = useState('');
  const isMountedRef = useRef(true);

  const { sendMessage } = useExtensionMsg();

  // Compute live agent status (Active | Idle | Busy)
  const agentStatus: AgentStatus = isStreaming || isExecutingAction || isPlanningAction
    ? 'busy'
    : pendingProposal
    ? 'active'
    : 'active';

  // Milestone 1.5 & 1.7: Listen for streaming token chunks and rate-limit backoff events
  useEffect(() => {
    const messageListener = (msg: any) => {
      if (msg?.type === MESSAGE_TYPES.STREAM_CHUNK) {
        setRateLimitState(null);
        const chunk = msg.payload?.text || '';
        setDraftState((prev) => {
          if (prev?.isOpen && prev.isGenerating) {
            return { ...prev, generatedDraft: prev.generatedDraft + chunk };
          }
          return prev;
        });
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: lastMsg.content + chunk },
            ];
          }
          return prev;
        });
      }

      if (msg?.type === MESSAGE_TYPES.STREAM_END) {
        const fullText = msg.payload?.fullText;
        setDraftState((prev) => {
          if (prev?.isOpen && prev.isGenerating) {
            return {
              ...prev,
              generatedDraft: fullText !== undefined ? fullText : prev.generatedDraft,
              isGenerating: false,
            };
          }
          return prev;
        });
        if (msg.payload?.context) {
          setActiveContext(msg.payload.context);
        }
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                content: fullText !== undefined ? fullText : lastMsg.content,
                isStreaming: false,
              },
            ];
          }
          return prev;
        });
        setIsStreaming(false);
        setRateLimitState(null);
      }

      // Milestone 4.4: Rate limit retry notifications with live visual countdown banner
      if (msg?.type === MESSAGE_TYPES.STREAM_RETRY) {
        const delaySeconds =
          msg.payload?.retryAfterSeconds ||
          Math.max(1, Math.round((msg.payload?.delayMs || 4000) / 1000));
        setRateLimitState({
          secondsRemaining: delaySeconds,
          totalSeconds: delaySeconds,
          attempt: msg.payload?.attempt || 1,
          maxAttempts: msg.payload?.maxRetries || 3,
          message: msg.payload?.message,
          provider: msg.payload?.provider || 'gemini',
        });
      }

      // Automatic Fallback notification (Groq -> Gemini)
      if (msg?.type === MESSAGE_TYPES.STREAM_FALLBACK) {
        const fallbackMsg =
          msg.payload?.message ||
          'Groq encountered an issue. Automatically switched to Google Gemini fallback...';

        setToast({
          id: String(Date.now()),
          type: 'warning',
          title: '⚡ Switched to Gemini Fallback',
          message: fallbackMsg,
          durationMs: 7000,
        });

        // If Groq already emitted partial text, reset the current streaming assistant message
        if (msg.payload?.hadPartialOutput) {
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  content: '',
                  isStreaming: true,
                },
              ];
            }
            return prev;
          });
        }
      }

      if (msg?.type === MESSAGE_TYPES.STREAM_ERROR) {
        setRateLimitState(null);
        setDraftState((prev) => (prev ? { ...prev, isGenerating: false } : null));
        const errorText = msg.payload?.error || 'Streaming error occurred.';
        const is429 = Boolean(
          errorText.includes('429') ||
          errorText.toLowerCase().includes('rate limit') ||
          errorText.toLowerCase().includes('quota')
        );

        setToast({
          id: String(Date.now()),
          type: 'error',
          title: is429 ? 'Rate Limit Exceeded (HTTP 429)' : 'AI Request Error',
          message: is429
            ? 'Gemini free tier rate limit reached. Please wait 15-30 seconds before submitting another prompt.'
            : errorText,
          isRateLimit: is429,
          durationMs: is429 ? 9000 : 6000,
        });

        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                content: lastMsg.content || `⚠️ Error: ${errorText}`,
                isStreaming: false,
              },
            ];
          }
          return prev;
        });
        setIsStreaming(false);
      }

      if (msg?.type === 'MSG_PAGE_CONTEXT_ATTACHED') {
        setActiveContext(msg.payload);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Milestone 4.4 & 4.6: Port keep-alive connection & Automatic Task Termination on Panel Close
  useEffect(() => {
    isMountedRef.current = true;
    let keepalivePort: chrome.runtime.Port | null = null;
    let heartbeatTimer: any = null;

    if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
      try {
        keepalivePort = chrome.runtime.connect({ name: 'sahayak_keepalive' });
        // Active heartbeat so background worker knows panel is open and never disconnects prematurely
        heartbeatTimer = setInterval(() => {
          try {
            keepalivePort?.postMessage({ type: 'PING' });
          } catch {
            clearInterval(heartbeatTimer);
          }
        }, 8000);
      } catch (err) {
        console.debug('[Sahayak UI] Keepalive port skipped:', err);
      }
    }

    // Comprehensive teardown when Sahayak is closed by user (window unload or unmount)
    const terminateTasksOnClose = () => {
      // 1. Purge active task so it does NOT resume upon re-open or consume background tokens
      clearActiveTask().catch(() => {});

      // 2. Instruct background worker to abort active AI streams / action plans
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'MSG_STOP_ACTIVE_TASK' }).catch(() => {});
      }

      // 3. Clean up any visual Set-of-Marks badges on the active web tab
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.CLEAR_BADGES }).catch(() => {});
          }
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', terminateTasksOnClose);
    window.addEventListener('pagehide', terminateTasksOnClose);

    return () => {
      isMountedRef.current = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      terminateTasksOnClose();
      window.removeEventListener('beforeunload', terminateTasksOnClose);
      window.removeEventListener('pagehide', terminateTasksOnClose);
      if (keepalivePort) {
        try {
          keepalivePort.disconnect();
        } catch {}
      }
    };
  }, []);

  // Hydrate chat session on mount; purge stale tasks so reopening Sahayak starts 100% clean without background token burn
  useEffect(() => {
    getChatSession().then((cachedMsgs) => {
      if (cachedMsgs && cachedMsgs.length > 0) {
        // Sanitize: ensure no restored message is left stuck in isStreaming state
        const sanitized = cachedMsgs
          .filter((m) => m && m.content && m.content.trim())
          .map((m) => ({ ...m, isStreaming: false }));
        setMessages((prev) => (prev.length === 0 ? sanitized : prev));
      }
    });

    // Explicitly purge active task and notify background to abort any running tasks
    clearActiveTask().catch(() => {});
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'MSG_STOP_ACTIVE_TASK' }).catch(() => {});
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.CLEAR_BADGES }).catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  // Persist chat session to survive tab switching & worker reboots
  useEffect(() => {
    if (messages.length > 0) {
      saveChatSession(messages);
    }
  }, [messages]);

  // Clean active task in storage whenever there is no pending proposal
  useEffect(() => {
    if (!pendingProposal) {
      clearActiveTask().catch(() => {});
    }
  }, [pendingProposal]);

  // Proactively fetch active tab info for the grounding context pill
  const refreshActiveContext = async () => {
    try {
      let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.url || tab.url.startsWith('chrome-extension://')) {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      if (!tab?.url || tab.url.startsWith('chrome-extension://')) {
        const allTabs = await chrome.tabs.query({ active: true });
        tab = allTabs.find((t) => t.url && !t.url.startsWith('chrome-extension://')) || allTabs[0];
      }
      if (!tab?.url) return;

      // Milestone 4.3: Proactively assess active tab URL against security blacklist
      const assessment = assessUrlSecurity(tab.url, { allowLocalhost });
      setSecurityAssessment(assessment);

      if (assessment.isBlocked) {
        setActiveContext({
          title: tab.title || assessment.domain || 'Sensitive Page',
          url: tab.url,
          wordCount: 0,
          isYouTube: false,
        });
        return;
      }

      const isYT =
        tab.url.includes('youtube.com/watch') || tab.url.includes('youtube.com/shorts');

      if (isYT) {
        const ytRes = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.EXTRACT_YOUTUBE_TRANSCRIPT,
          payload: { preferredLang: settings.preferredLang },
        });
        if (ytRes && ytRes.title) {
          setActiveContext({
            title: ytRes.title,
            url: ytRes.url,
            wordCount: ytRes.wordCount,
            isYouTube: true,
          });
        }
      } else {
        const pageRes = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.EXTRACT_PAGE_CONTENT,
        });
        if (pageRes && pageRes.cleanText) {
          setActiveContext({
            title: pageRes.title,
            url: pageRes.url,
            wordCount: pageRes.wordCount,
            isYouTube: false,
          });
        }
      }
    } catch (err) {
      console.debug('[Sahayak UI] Could not refresh context:', err);
    }
  };

  useEffect(() => {
    refreshActiveContext();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleTabActivated = () => {
        refreshActiveContext();
      };
      const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (changeInfo.status === 'complete' || changeInfo.url) {
          refreshActiveContext();
        }
      };

      chrome.tabs.onActivated?.addListener(handleTabActivated);
      chrome.tabs.onUpdated?.addListener(handleTabUpdated);

      return () => {
        chrome.tabs.onActivated?.removeListener(handleTabActivated);
        chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
      };
    }
  }, [settings.preferredLang]);

  // Quick Language Toggle
  const handleToggleLang = async () => {
    const nextLang = settings.preferredLang === 'en' ? 'hinglish' : 'en';
    await setSettings({ ...settings, preferredLang: nextLang });
  };

  const handleSetLang = async (lang: 'en' | 'hinglish') => {
    await setSettings({ ...settings, preferredLang: lang });
  };

  // Milestone 1.5 & 2.4: Send message via background Grounded Streaming pipeline (supporting Multimodal Vision)
  const handleSendMessage = async (
    text: string,
    screenshot?: ScreenCaptureResult | null
  ) => {
    const shotToUse = screenshot !== undefined ? screenshot : stagedScreenshot;
    if (stagedScreenshot) {
      setStagedScreenshot(null);
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      screenshot: shotToUse?.dataUrl
        ? {
            dataUrl: shotToUse.dataUrl,
            mimeType: shotToUse.mimeType || 'image/jpeg',
            byteSize: shotToUse.byteSize,
            width: shotToUse.width,
            height: shotToUse.height,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);

    const isGroq = (settings.provider || 'groq') === 'groq';
    const cleanGroqKey = (settings.groqApiKey?.trim() || DEFAULT_SETTINGS.groqApiKey || '').trim();
    const cleanGeminiKey = (settings.geminiApiKey?.trim() || DEFAULT_SETTINGS.geminiApiKey || '').trim();
    const activeGroqModel =
      settings.groqModel &&
      !settings.groqModel.includes('guard') &&
      settings.groqModel !== 'llama-3.3-70b-versatile'
        ? settings.groqModel
        : 'llama-3.1-8b-instant';
    const activeGeminiModel = settings.model || 'gemini-3.8-flash';

    if (shotToUse && !cleanGeminiKey) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content:
          settings.preferredLang === 'hinglish'
            ? `Screenshot inspect karne ke liye Google Gemini API key zaroori hai. Kripya Settings me Gemini key dalein.`
            : `Google Gemini API key is required for image and screenshot analysis. Please configure your free Gemini key in Settings.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    if (!cleanGroqKey && !cleanGeminiKey) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content:
          settings.preferredLang === 'hinglish'
            ? `Kripya Settings tab me jaakar apna Groq ya Google Gemini API key enter karein.`
            : `Please configure your Groq or Google Gemini API key in Settings to start chatting.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    const assistantMsgId = String(Date.now() + 1);
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);
    setIsStreaming(true);

    try {
      // Dispatches streaming request to background service worker with grounding & automatic fallback
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.REQUEST_STREAM_CHAT,
        payload: {
          prompt: text,
          lang: settings.preferredLang,
          provider: shotToUse ? 'gemini' : (settings.provider || 'groq'),
          groqApiKey: cleanGroqKey,
          geminiApiKey: cleanGeminiKey,
          groqModel: activeGroqModel,
          geminiModel: activeGeminiModel,
          enableFallback: settings.enableFallback ?? true,
          history: messages,
          screenshot: shotToUse
            ? {
                dataUrl: shotToUse.dataUrl,
                base64: shotToUse.base64,
                mimeType: shotToUse.mimeType || 'image/jpeg',
                byteSize: shotToUse.byteSize,
              }
            : undefined,
        },
      });
    } catch (err: any) {
      console.error('[Sahayak UI] Failed to start streaming chat:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `⚠️ Error: ${err.message}`, isStreaming: false }
            : msg
        )
      );
      setIsStreaming(false);
    }
  };

  // 1-Click Action: Summarize Article (Milestone 1.6: Respects active persona language)
  const handleSummarizeArticle = async () => {
    setActiveTab('chat');
    const prompt =
      settings.preferredLang === 'hinglish'
        ? 'Is webpage ka ek proper, well-explained summary provide karein. Isme 3-5 detailed bullet points shamil karein, jisme har point me ek bold heading aur 1-2 descriptive sentences ho (kewal 1 ya 2 words nahi). End me key takeaways bhi explain karein.'
        : 'Provide a comprehensive and well-explained summary of this webpage. Include 3 to 5 detailed bullet points where each point begins with a clear bold heading followed by 1-2 thorough explanatory sentences (not just single words or fragments). Conclude with actionable key takeaways.';
    handleSendMessage(prompt);
  };

  // 1-Click Action: Summarize YouTube (Milestone 1.6: Respects active persona language)
  const handleSummarizeYouTube = async () => {
    setActiveTab('chat');
    const prompt =
      settings.preferredLang === 'hinglish'
        ? 'Is YouTube video transcript ka ek proper, well-explained summary provide karein. Har key topic ko detailed bullet points me explain karein (bold title aur complete explanatory sentences ke saath, no one-word points), aur har point ke saath [MM:SS] timestamp citations shamil karein.'
        : 'Provide a thorough, well-explained summary of this YouTube video. Format each major concept as a detailed bullet point with a bold topic heading, complete explanatory sentences (not single-word points), and corresponding [MM:SS] timestamp citations.';
    handleSendMessage(prompt);
  };

  // Milestone 2.2: Context Menu Trigger Event Router
  const handleContextMenuAction = React.useCallback(
    async (payload: ContextMenuTriggerPayload) => {
      if (!payload?.selectedText) return;

      // 1. Ensure user is in Chat tab
      setActiveTab('chat');

      // Milestone 2.5: If "Draft a reply" action was triggered, open the Draft Composer
      if (payload.action === 'sahayak-reply') {
        setDraftState({
          isOpen: true,
          selectedText: payload.selectedText,
          pageUrl: payload.pageUrl,
          tone: 'professional',
          platform: detectPlatformFromUrl(payload.pageUrl),
          customInstructions: '',
          generatedDraft: '',
          isGenerating: false,
        });
        return;
      }

      const actionTitle = getContextActionTitle(payload.action);
      const generatedPrompt = buildContextActionPrompt(payload.action, payload.selectedText);

      // 2. Insert user message with Context Action Card metadata
      const userMsgId = String(Date.now());
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'user',
        content: actionTitle,
        timestamp: Date.now(),
        contextAction: {
          action: payload.action,
          selectedText: payload.selectedText,
          pageUrl: payload.pageUrl,
          tabId: payload.tabId,
        },
      };

      setMessages((prev) => [...prev, userMsg]);

      // 3. Insert initial streaming assistant message
      const assistantMsgId = String(Date.now() + 1);
      const initialAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, initialAssistantMsg]);
      setIsStreaming(true);

      const cleanGroqKey = (settings.groqApiKey?.trim() || DEFAULT_SETTINGS.groqApiKey || '').trim();
      const cleanGeminiKey = (settings.geminiApiKey?.trim() || DEFAULT_SETTINGS.geminiApiKey || '').trim();
      const activeGroqModel =
        settings.groqModel &&
        !settings.groqModel.includes('guard') &&
        settings.groqModel !== 'llama-3.3-70b-versatile'
          ? settings.groqModel
          : 'llama-3.1-8b-instant';
      const activeGeminiModel = settings.model || 'gemini-3.8-flash';

      if (!cleanGroqKey && !cleanGeminiKey) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content:
                    settings.preferredLang === 'hinglish'
                      ? 'Kripya Settings tab me jaakar apna Groq ya Gemini API key configure karein tabhi action run hoga.'
                      : 'Please configure your Groq or Gemini API key in Settings to run selection actions.',
                  isStreaming: false,
                }
              : msg
          )
        );
        setIsStreaming(false);
        return;
      }

      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.REQUEST_STREAM_CHAT,
          payload: {
            prompt: generatedPrompt,
            lang: payload.action === 'sahayak-translate' ? 'hinglish' : settings.preferredLang,
            provider: settings.provider || 'groq',
            groqApiKey: cleanGroqKey,
            geminiApiKey: cleanGeminiKey,
            groqModel: activeGroqModel,
            geminiModel: activeGeminiModel,
            enableFallback: settings.enableFallback ?? true,
            history: messages,
          },
        });
      } catch (err: any) {
        console.error('[Sahayak UI] Failed to start context menu streaming action:', err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: `⚠️ Error: ${err.message}`, isStreaming: false }
              : msg
          )
        );
        setIsStreaming(false);
      }
    },
    [messages, settings]
  );

  // Milestone 2.3 & 2.4: Viewport Screen Capture Pipeline Trigger & Multimodal Staging
  const handleCaptureScreen = async () => {
    setActiveTab('chat');
    setIsCapturingScreen(true);

    try {
      const res = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.CAPTURE_SCREEN,
      });

      if (res && res.success && res.dataUrl) {
        setStagedScreenshot(res);
        setToast({
          id: String(Date.now()),
          type: 'success',
          title: 'Viewport Staged for Vision',
          message: `Screen captured (${Math.round(
            (res.byteSize || 0) / 1024
          )} KB). Click a visual analysis chip or ask a question below.`,
          durationMs: 4500,
        });
      } else {
        const errorMsg = res?.error || 'Failed to capture visible screen.';
        setToast({
          id: String(Date.now()),
          type: 'error',
          title: 'Capture Failed',
          message: errorMsg,
          durationMs: 6000,
        });
      }
    } catch (err: any) {
      console.error('[Sahayak UI] Error triggering screen capture:', err);
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'Capture Error',
        message: err.message || 'Could not communicate with background script for screen capture.',
        durationMs: 5000,
      });
    } finally {
      setIsCapturingScreen(false);
    }
  };

  // Milestone 2.5: Open Draft Reply Composer
  const handleOpenDraftComposer = async () => {
    setActiveTab('chat');
    let selectedText = '';

    try {
      let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.url || tab.url.startsWith('chrome-extension://')) {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      }

      if (tab?.id) {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || '',
        });
        if (res?.result) {
          selectedText = String(res.result).trim();
        }
      }
    } catch (err) {
      console.debug('[Sahayak UI] Could not query tab selection:', err);
    }

    setDraftState({
      isOpen: true,
      selectedText:
        selectedText ||
        (activeContext?.title
          ? `Discussion on: ${activeContext.title}`
          : 'Please paste or type the message you want to reply to here...'),
      pageUrl: activeContext?.url,
      tone: 'professional',
      platform: detectPlatformFromUrl(activeContext?.url),
      customInstructions: '',
      generatedDraft: '',
      isGenerating: false,
    });
  };

  // Milestone 2.5: Stream Draft Reply Generation
  const handleGenerateDraft = async (options: {
    selectedText: string;
    tone: ReplyTone;
    platform: ReplyPlatform;
    customInstructions?: string;
  }) => {
    setDraftState((prev) =>
      prev
        ? {
            ...prev,
            tone: options.tone,
            platform: options.platform,
            customInstructions: options.customInstructions,
            generatedDraft: '',
            isGenerating: true,
          }
        : null
    );

    const promptText = buildDraftReplyPrompt({
      selectedText: options.selectedText,
      tone: options.tone,
      platform: options.platform,
      customInstructions: options.customInstructions,
      pageUrl: activeContext?.url,
    });

    const isHinglish = options.tone === 'hinglish';
    const cleanGroqKey = (settings.groqApiKey?.trim() || DEFAULT_SETTINGS.groqApiKey || '').trim();
    const cleanGeminiKey = (settings.geminiApiKey?.trim() || DEFAULT_SETTINGS.geminiApiKey || '').trim();
    const activeGroqModel =
      settings.groqModel &&
      !settings.groqModel.includes('guard') &&
      settings.groqModel !== 'llama-3.3-70b-versatile'
        ? settings.groqModel
        : 'llama-3.1-8b-instant';
    const activeGeminiModel = settings.model || 'gemini-3.8-flash';

    if (!cleanGroqKey && !cleanGeminiKey) {
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'API Key Required',
        message: 'Please configure your Groq or Gemini API key in Settings to generate replies.',
        durationMs: 5000,
      });
      setDraftState((prev) => (prev ? { ...prev, isGenerating: false } : null));
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.REQUEST_STREAM_CHAT,
        payload: {
          prompt: promptText,
          lang: isHinglish ? 'hinglish' : settings.preferredLang,
          provider: settings.provider || 'groq',
          groqApiKey: cleanGroqKey,
          geminiApiKey: cleanGeminiKey,
          groqModel: activeGroqModel,
          geminiModel: activeGeminiModel,
          enableFallback: settings.enableFallback ?? true,
          skipGrounding: true, // Reply drafting focuses on selected text rather than full page context
        },
      });
    } catch (err: any) {
      console.error('[Sahayak UI] Failed to start draft reply generation:', err);
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'Drafting Failed',
        message: err.message || 'Error communicating with AI background service.',
        durationMs: 5000,
      });
      setDraftState((prev) => (prev ? { ...prev, isGenerating: false } : null));
    }
  };

  // Milestone 2.5: Insert Draft Text into Active Field on Page
  const handleInsertDraftToPage = async (
    text: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.INSERT_TEXT_ACTIVE_FIELD,
        payload: { text },
      });

      if (res && res.success) {
        setToast({
          id: String(Date.now()),
          type: 'success',
          title: 'Inserted into Webpage',
          message: `Reply draft inserted directly into <${res.elementTag || 'field'}> element!`,
          durationMs: 3500,
        });
        return { success: true };
      } else {
        return { success: false, error: res?.error || 'NO_ACTIVE_FIELD' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'COMMUNICATION_ERROR' };
    }
  };

  // Hook up context menu listener (storage check on mount + live message listener)
  useContextMenuListener(handleContextMenuAction);

  // Milestone 3.3, 3.4 & 3.6: Scan page elements and plan next action via Supervisor
  const handlePlanTaskAction = async (
    goalToPlan?: string,
    historyOverride?: ActionLogEntry[]
  ) => {
    const targetGoal = (
      goalToPlan ||
      activeGoal ||
      actionGoalInput ||
      'Analyze page and plan the next action'
    ).trim();

    setActiveGoal(targetGoal);

    // Verify user has at least one API key configured
    const cleanGroqKey = (settings.groqApiKey || '').trim();
    const cleanGeminiKey = (settings.geminiApiKey || '').trim();
    if (!cleanGroqKey && !cleanGeminiKey) {
      setToast({
        id: String(Date.now()),
        type: 'warning',
        title: 'API Key Required',
        message: 'Please paste your Groq or Gemini API key in Settings (gear icon in header) before using the Action Planner.',
        durationMs: 7000,
      });
      setIsSettingsModalOpen(true);
      return;
    }

    setIsPlanningAction(true);
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        throw new Error('Chrome extension APIs unavailable.');
      }

      // 1. Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active browser tab detected.');
      }

      // Milestone 4.3: Hard Lockout on Blacklisted Domains & Sensitive Portals
      const assessment = assessUrlSecurity(tab.url || '', { allowLocalhost });
      setSecurityAssessment(assessment);
      if (assessment.isBlocked) {
        setToast({
          id: String(Date.now()),
          type: 'error',
          title: 'Actions Paused for Safety',
          message: assessment.advice || 'Sahayak is paused for your safety on this sensitive page.',
          durationMs: 7000,
        });
        setIsPlanningAction(false);
        return;
      }

      // 2. Scan interactive DOM and render Set-of-Marks badges on page
      let scanRes: any;
      try {
        scanRes = await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.SCAN_INTERACTIVE_DOM,
          payload: { renderBadges: true },
        });
      } catch (tabMsgErr: any) {
        throw new Error('Could not communicate with webpage content script. Please refresh the web page tab and try again.');
      }

      if (!scanRes?.success || !scanRes.actionMap) {
        throw new Error(scanRes?.error || 'Failed to scan webpage elements. Please ensure the page is loaded.');
      }

      // 3. Plan action with Gemini / Groq structured JSON
      const planRes = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.PLAN_NEXT_ACTION,
        payload: {
          goal: targetGoal,
          actionMap: scanRes.actionMap,
          history: historyOverride || actionHistory,
          lang: settings.preferredLang,
          userProfile: profile,
          providerOverride: settings.provider,
          groqApiKey: cleanGroqKey,
          geminiApiKey: cleanGeminiKey,
          groqModel: settings.groqModel,
          modelOverride: settings.model,
        },
      });

      if (!planRes) {
        throw new Error(
          'The background service worker is updating or inactive. Please reload the extension at chrome://extensions and try again.'
        );
      }

      if (planRes.success && planRes.proposal) {
        setPendingProposal(planRes.proposal);
        setActionGoalInput('');
      } else {
        const errorDetail =
          planRes.error ||
          planRes.proposal?.userExplanation ||
          'Failed to generate action proposal from AI.';
        throw new Error(errorDetail);
      }
    } catch (err: any) {
      console.error('[Sahayak Sidepanel] Plan action error:', err);
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'Action Planning Failed',
        message: err.message || 'Could not plan action for current page.',
        durationMs: 7000,
      });
    } finally {
      setIsPlanningAction(false);
    }
  };

  // Milestone 3.5 & 3.6: Execute approved DOM action and advance multi-step feedback loop
  const handleApproveAction = async (actionOverride?: ProposedAction) => {
    if (!pendingProposal || isExecutingAction) return;
    const finalAction = actionOverride || pendingProposal.action;
    if (!finalAction) return;

    setIsExecutingAction(true);
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        throw new Error('Chrome extension APIs unavailable.');
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active browser tab detected.');
      }

      const res = await chrome.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.EXECUTE_DOM_ACTION,
        payload: { action: finalAction },
      });

      if (res && res.success) {
        const newEntry: ActionLogEntry = {
          id: String(Date.now()),
          stepNumber,
          action: finalAction,
          userExplanation: pendingProposal.userExplanation,
          targetLabel: finalAction.targetLabel,
          timestamp: Date.now(),
          status: 'EXECUTED',
        };
        const nextHistory = [...actionHistory, newEntry];
        setActionHistory(nextHistory);

        const actionFeedback =
          finalAction.actionType === 'TYPE'
            ? `Typed "${finalAction.value}" into ${finalAction.targetLabel || 'field'}`
            : finalAction.actionType === 'CLICK'
            ? `Clicked ${finalAction.targetLabel || 'element'}`
            : finalAction.actionType === 'SELECT'
            ? `Selected "${finalAction.value}"`
            : finalAction.actionType === 'SCROLL'
            ? `Scrolled page ${finalAction.scrollDirection || 'DOWN'}`
            : finalAction.actionType === 'COMPLETED'
            ? 'Goal marked as completed!'
            : 'Action performed successfully';

        setToast({
          id: String(Date.now()),
          type: 'success',
          title: `Step #${stepNumber} Executed`,
          message: actionFeedback,
          durationMs: 3000,
        });

        setPendingProposal(null);
        setStepNumber((prev) => prev + 1);

        // Milestone 3.6: If action was COMPLETED or TASK_COMPLETED, finish task cleanly
        if (
          finalAction.actionType === 'COMPLETED' ||
          pendingProposal.status === 'TASK_COMPLETED'
        ) {
          setActiveGoal('');
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.CLEAR_BADGES }).catch(() => {});
          return;
        }

        // Milestone 3.6 Multi-step Feedback Loop:
        // Wait 600ms for dynamic DOM, React rerenders, and network state to settle
        await new Promise((resolve) => setTimeout(resolve, 600));

        // Stop feedback loop immediately if user closed Sahayak during execution
        if (!isMountedRef.current) {
          console.log('[Sahayak UI] Sidepanel unmounted/closed. Aborting subsequent action planning.');
          return;
        }

        // Re-scan and plan next step automatically
        const ongoingGoal = activeGoal || actionGoalInput || pendingProposal.thought;
        if (ongoingGoal) {
          await handlePlanTaskAction(ongoingGoal, nextHistory);
        }
      } else {
        const errorMsg = res?.error || 'Action execution failed in webpage.';
        const failedEntry: ActionLogEntry = {
          id: String(Date.now()),
          stepNumber,
          action: finalAction,
          userExplanation: `Failed: ${errorMsg}`,
          targetLabel: finalAction.targetLabel,
          timestamp: Date.now(),
          status: 'FAILED',
        };
        const nextHistory = [...actionHistory, failedEntry];
        setActionHistory(nextHistory);

        setToast({
          id: String(Date.now()),
          type: 'error',
          title: 'Action Execution Error',
          message: errorMsg,
          durationMs: 6000,
        });
      }
    } catch (err: any) {
      console.error('[Sahayak Sidepanel] Action execution exception:', err);
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'Execution Error',
        message: err.message || 'Could not communicate with tab content script.',
        durationMs: 5000,
      });
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Milestone 3.6: Skip current proposed action and re-plan alternative
  const handleSkipAction = async () => {
    if (!pendingProposal) return;
    const skippedAction = pendingProposal.action;
    const skipDesc = skippedAction
      ? `User skipped ${skippedAction.actionType} on #${skippedAction.targetElementId || 'element'} (${
          skippedAction.targetLabel || 'element'
        }). Alternative action needed.`
      : `User skipped action proposal: ${pendingProposal.userExplanation}`;

    const skippedEntry: ActionLogEntry = {
      id: String(Date.now()),
      stepNumber,
      action: skippedAction || { actionType: 'WAIT' },
      userExplanation: skipDesc,
      targetLabel: skippedAction?.targetLabel,
      timestamp: Date.now(),
      status: 'SKIPPED',
    };

    const nextHistory = [...actionHistory, skippedEntry];
    setActionHistory(nextHistory);
    setPendingProposal(null);
    setStepNumber((prev) => prev + 1);

    setToast({
      id: String(Date.now()),
      type: 'warning',
      title: `Step #${stepNumber} Skipped`,
      message: 'Skipping element. Planning alternative step...',
      durationMs: 3000,
    });

    // Auto-plan next alternative step using updated history
    const ongoingGoal = activeGoal || actionGoalInput;
    if (ongoingGoal) {
      await handlePlanTaskAction(ongoingGoal, nextHistory);
    }
  };

  // Milestone 3.6: Stop execution and teardown all page overlays immediately
  const handleStopAction = () => {
    setPendingProposal(null);
    setActiveGoal('');
    setIsPlanningAction(false);
    setIsExecutingAction(false);

    clearActiveTask().catch(() => {});

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'MSG_STOP_ACTIVE_TASK' }).catch(() => {});
    }

    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: MESSAGE_TYPES.CLEAR_BADGES,
          }).catch(() => {});
        }
      });
    }

    setToast({
      id: String(Date.now()),
      type: 'info',
      title: 'Task Cancelled',
      message: 'Supervisor stopped and visual badges cleared from webpage.',
      durationMs: 3500,
    });
  };

  // Milestone 4.2: 1-Click Skill Execution Handler
  const handleExecuteSkill = (skill: SkillItem) => {
    const target = getSkillExecutionTarget(skill);
    if (target === 'action') {
      setActiveTab('actions');
      handlePlanTaskAction(skill.prompt);
    } else {
      setActiveTab('chat');
      handleSendMessage(skill.prompt);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* Step 1: Modern Glassmorphic Header */}
      <Header
        currentLang={settings.preferredLang}
        onToggleLang={handleToggleLang}
        onSetLang={handleSetLang}
        onOpenSettings={() => setActiveTab('settings')}
        status={agentStatus}
      />

      {/* Step 2: Tab Bar (Chat, Actions, Profile, Settings) */}
      <NavigationTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingActionsCount={pendingProposal ? 1 : 0}
      />

      {/* Main Tab Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* TAB 1: Grounded Chat View */}
        {activeTab === 'chat' && (
          <>
            {rateLimitState && (
              <div className="p-2.5 bg-slate-950 border-b border-amber-500/30">
                <RateLimitBanner
                  state={rateLimitState}
                  onCancel={() => setRateLimitState(null)}
                />
              </div>
            )}
            {securityAssessment?.isBlocked && (
              <div className="p-2 bg-slate-950 border-b border-slate-800">
                <SecurityBanner
                  assessment={securityAssessment}
                  compact={true}
                />
              </div>
            )}
            <QuickActions
              onSummarizeArticle={handleSummarizeArticle}
              onSummarizeYouTube={handleSummarizeYouTube}
              onCaptureScreen={handleCaptureScreen}
              onDraftReply={handleOpenDraftComposer}
              disabled={isStreaming}
              isCapturing={isCapturingScreen}
            />
            <ChatView
              messages={messages}
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
              hasApiKey={Boolean(
                (settings.groqApiKey?.trim() || DEFAULT_SETTINGS.groqApiKey)?.trim() ||
                (settings.geminiApiKey?.trim() || DEFAULT_SETTINGS.geminiApiKey)?.trim()
              )}
              onOpenSettings={() => setActiveTab('settings')}
              activeContext={activeContext}
              onRefreshContext={refreshActiveContext}
              lang={settings.preferredLang}
              stagedScreenshot={stagedScreenshot}
              onClearStagedScreenshot={() => setStagedScreenshot(null)}
              draftState={draftState}
              onCloseDraft={() => setDraftState(null)}
              onGenerateDraft={handleGenerateDraft}
              onInsertDraftToPage={handleInsertDraftToPage}
            />
          </>
        )}

        {/* TAB 2: Actions (HITL Supervisor) */}
        {activeTab === 'actions' && (
          <div className="flex-1 overflow-y-auto bg-slate-900">
            {rateLimitState && (
              <div className="p-3 border-b border-amber-500/30">
                <RateLimitBanner
                  state={rateLimitState}
                  onCancel={() => setRateLimitState(null)}
                />
              </div>
            )}
            {securityAssessment?.isBlocked ? (
              <div className="p-4 space-y-4">
                <SecurityBanner
                  assessment={securityAssessment}
                  onNavigateToChat={() => setActiveTab('chat')}
                  onAllowLocalhost={() => {
                    setAllowLocalhost(true);
                    if (activeContext?.url) {
                      const updated = assessUrlSecurity(activeContext.url, { allowLocalhost: true });
                      setSecurityAssessment(updated);
                    }
                  }}
                />
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-1.5">
                  <p className="text-xs font-medium text-slate-300">
                    Automation Engine is Inactive
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                    To automate actions or fill forms, navigate to a standard public webpage (such as news, documentation, blogs, or general forms).
                  </p>
                </div>
              </div>
            ) : pendingProposal ? (
              <HITLApproval
                proposal={pendingProposal}
                stepNumber={stepNumber}
                isExecuting={isExecutingAction}
                onApprove={handleApproveAction}
                onSkip={handleSkipAction}
                onStop={handleStopAction}
              />
            ) : isPlanningAction ? (
              <div className="p-8 text-center text-slate-400 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-950/70 border border-sky-500/40 flex items-center justify-center mx-auto text-sky-400 animate-pulse shadow-lg">
                  <Sparkles className="w-6 h-6 animate-spin text-sky-300" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-1">
                    Planning Step #{stepNumber}...
                  </h3>
                  <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
                    {activeGoal ? `Goal: "${activeGoal}"` : 'AI supervisor is scanning the DOM and reasoning about the next best action.'}
                  </p>
                </div>
                <button
                  onClick={handleStopAction}
                  className="px-3 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/50 transition inline-flex items-center gap-1.5"
                >
                  <Square className="w-3 h-3 text-rose-400" />
                  <span>Cancel Supervisor</span>
                </button>
              </div>
            ) : (
              <div className="p-5 text-center text-slate-400 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-950/60 border border-sky-500/30 flex items-center justify-center mx-auto text-sky-400 shadow-md">
                  <Play className="w-6 h-6 ml-0.5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-1">
                    Browser Task Supervisor
                  </h3>
                  <p className="text-xs text-slate-400 max-w-[260px] mx-auto leading-relaxed">
                    Give Sahayak a goal on this page. It will badge interactive elements and propose step-by-step actions for your approval.
                  </p>
                </div>

                {/* Interactive Task Goal Input */}
                <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/70 text-left space-y-2">
                  <label className="text-[11px] font-semibold text-slate-300 block">
                    Enter Goal on Current Page:
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={actionGoalInput}
                      onChange={(e) => setActionGoalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isPlanningAction) {
                          handlePlanTaskAction();
                        }
                      }}
                      placeholder="e.g. Search for mechanical keyboards"
                      disabled={isPlanningAction}
                      className="flex-1 text-xs py-2 px-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={() => handlePlanTaskAction()}
                      disabled={isPlanningAction}
                      className="btn-primary text-xs px-3 py-2 shrink-0 flex items-center gap-1.5 shadow"
                    >
                      {isPlanningAction ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Planning...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-sky-200" />
                          <span>Scan & Plan</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick Goal Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      'Search for mechanical keyboards',
                      'Fill form fields using my profile',
                      'Click primary submit button',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setActionGoalInput(suggestion);
                          handlePlanTaskAction(suggestion);
                        }}
                        disabled={isPlanningAction}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/90 text-slate-300 border border-slate-700 hover:border-sky-500 hover:text-sky-300 transition text-left"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <ActionHistory
              history={actionHistory}
              onClearHistory={() => {
                setActionHistory([]);
                clearActiveTask();
              }}
            />
          </div>
        )}

        {/* TAB 3: Profile & Skills Vault */}
        {activeTab === 'profile' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
            {/* Sub-tab navigation */}
            <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 gap-2 shrink-0">
              <button
                onClick={() => setProfileSubTab('profile')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                  profileSubTab === 'profile'
                    ? 'bg-sky-950/70 border border-sky-500/60 text-sky-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Profile Info</span>
              </button>
              <button
                onClick={() => setProfileSubTab('skills')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                  profileSubTab === 'skills'
                    ? 'bg-sky-950/70 border border-sky-500/60 text-sky-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>1-Click Skills</span>
              </button>
            </div>

            {profileSubTab === 'profile' ? (
              <ProfileVault
                initialProfile={profile}
                onSaveProfile={async (newProfile) => {
                  await setProfile(newProfile);
                }}
              />
            ) : (
              <SkillsLibrary
                onExecuteSkill={handleExecuteSkill}
                onOpenSettings={() => setActiveTab('settings')}
              />
            )}
          </div>
        )}

        {/* TAB 4: Settings (BYOK & Preferences) */}
        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSaveSettings={async (newSettings) => {
              await setSettings(newSettings);
            }}
          />
        )}
      </main>

      {/* Settings Modal (kept for secondary shortcut compatibility) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={async (newSettings) => {
          await setSettings(newSettings);
        }}
      />

      {/* Floating System & Rate Limit Error Toast */}
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
