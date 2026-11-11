// Resilient State Hydration and Service Worker Lifecycle Management for Sahayak (MV3)
import { STORAGE_KEYS } from '../shared/constants';
import type { ActiveTaskState, ChatMessage } from '../shared/types';

/**
 * Persists active task state into chrome.storage.session (or local fallback)
 * to survive ephemeral service worker termination.
 */
export async function saveActiveTask(task: ActiveTaskState): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ [STORAGE_KEYS.ACTIVE_TASK]: task });
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TASK]: task });
    }
  } catch (err) {
    console.warn('[Sahayak Lifecycle] Failed to persist active task:', err);
  }
}

/**
 * Hydrates active task state upon service worker wake-up or side panel reconnect.
 */
export async function getActiveTask(): Promise<ActiveTaskState | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const data = await chrome.storage.session.get(STORAGE_KEYS.ACTIVE_TASK);
      if (data && data[STORAGE_KEYS.ACTIVE_TASK]) {
        return data[STORAGE_KEYS.ACTIVE_TASK] as ActiveTaskState;
      }
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_TASK);
      if (data && data[STORAGE_KEYS.ACTIVE_TASK]) {
        return data[STORAGE_KEYS.ACTIVE_TASK] as ActiveTaskState;
      }
    }
  } catch (err) {
    console.warn('[Sahayak Lifecycle] Failed to hydrate active task:', err);
  }
  return null;
}

/**
 * Clears active task state from storage upon completion or cancellation.
 */
export async function clearActiveTask(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove(STORAGE_KEYS.ACTIVE_TASK);
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(STORAGE_KEYS.ACTIVE_TASK);
    }
  } catch (err) {
    console.warn('[Sahayak Lifecycle] Failed to clear active task:', err);
  }
}

/**
 * Persists chat messages to survive tab switching and service worker reboots.
 * Caps at 50 messages to strictly avoid hitting storage quotas.
 */
export async function saveChatSession(messages: ChatMessage[]): Promise<void> {
  try {
    const capped = (messages || []).slice(-50);
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ [STORAGE_KEYS.CHAT_HISTORY]: capped });
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.CHAT_HISTORY]: capped });
    }
  } catch (err) {
    console.warn('[Sahayak Lifecycle] Failed to persist chat session:', err);
  }
}

/**
 * Retrieves persisted chat messages from session storage.
 */
export async function getChatSession(): Promise<ChatMessage[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const data = await chrome.storage.session.get(STORAGE_KEYS.CHAT_HISTORY);
      if (data && Array.isArray(data[STORAGE_KEYS.CHAT_HISTORY])) {
        return data[STORAGE_KEYS.CHAT_HISTORY] as ChatMessage[];
      }
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
      if (data && Array.isArray(data[STORAGE_KEYS.CHAT_HISTORY])) {
        return data[STORAGE_KEYS.CHAT_HISTORY] as ChatMessage[];
      }
    }
  } catch (err) {
    console.warn('[Sahayak Lifecycle] Failed to read chat session:', err);
  }
  return [];
}

/**
 * Clears persisted chat messages.
 */
export async function clearChatSession(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove(STORAGE_KEYS.CHAT_HISTORY);
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(STORAGE_KEYS.CHAT_HISTORY);
    }
  } catch (err) {
    console.warn('[Sahayak Lifecycle] Failed to clear chat session:', err);
  }
}

/**
 * Sets up port keep-alive connection listener in the background worker.
 * Prevents premature worker dormancy while side panel is open, and cleanly
 * terminates active tasks and clears state as soon as the side panel is closed.
 */
export function setupPortKeepAlive(onDisconnect?: () => void): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onConnect) return;

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sahayak_keepalive') {
      port.onMessage.addListener((msg) => {
        if (msg?.type === 'PING') {
          try {
            port.postMessage({ type: 'PONG', timestamp: Date.now() });
          } catch {}
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[Sahayak Lifecycle] Sidepanel disconnected/closed. Terminating active tasks.');
        clearActiveTask().catch(() => {});
        onDisconnect?.();
      });
    }
  });
}

