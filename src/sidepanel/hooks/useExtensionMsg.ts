import { useState, useCallback, useEffect } from 'react';
import { getErrorMessage } from '../../shared/helpers';
import { MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/constants';
import { ContextMenuActionId, ContextMenuTriggerPayload } from '../../shared/types';

export function useExtensionMsg() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async <T = any>(message: any): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        throw new Error('Chrome extension runtime is not available');
      }
      const response = await chrome.runtime.sendMessage(message);
      return response as T;
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      console.warn('[useExtensionMsg] Error sending runtime message:', msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTabMessage = useCallback(async <T = any>(tabId: number, message: any): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.sendMessage) {
        throw new Error('Chrome tabs runtime is not available');
      }
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response as T;
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      console.warn('[useExtensionMsg] Error sending tab message:', msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendMessage, sendTabMessage, loading, error };
}

/**
 * Returns a human-readable title for a context action.
 */
export function getContextActionTitle(action: ContextMenuActionId): string {
  switch (action) {
    case 'sahayak-explain':
      return 'Explaining selected text';
    case 'sahayak-translate':
      return 'Translating to Hinglish';
    case 'sahayak-reply':
      return 'Drafting a reply';
    default:
      return 'Processing selected text';
  }
}

/**
 * Generates an optimized instruction prompt for the context action.
 */
export function buildContextActionPrompt(
  action: ContextMenuActionId,
  selectedText: string
): string {
  const snippet = selectedText.trim();
  switch (action) {
    case 'sahayak-explain':
      return `Please explain the following highlighted text in clear, concise, and easy-to-understand terms. Break down complex concepts and provide brief definitions where appropriate:\n\n"""\n${snippet}\n"""`;

    case 'sahayak-translate':
      return `Please translate the following highlighted text into natural, fluent Latin-script Hinglish (Hindi written using English/Roman alphabet, e.g. "Is topic ko samajhne ke liye..."). Strictly keep technical terms, brand names, and UI elements in English:\n\n"""\n${snippet}\n"""`;

    case 'sahayak-reply':
      return `Please draft an articulate, polite, and effective reply or response to the following highlighted message/content. Offer 1-2 practical variations (e.g. professional and concise):\n\n"""\n${snippet}\n"""`;

    default:
      return snippet;
  }
}

/**
 * Hook to listen for Context Menu triggers from background service worker (Milestone 2.2).
 * Handles both:
 * 1. Storage cache consumption upon Side Panel mounting (when opened via context menu).
 * 2. Live runtime messages when the Side Panel is already mounted and active.
 */
export function useContextMenuListener(
  onAction: (payload: ContextMenuTriggerPayload) => void
): void {
  useEffect(() => {
    // 1. Consume pending action cached in storage
    const checkPendingStorage = async () => {
      try {
        let pending: ContextMenuTriggerPayload | null = null;

        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          const sessionData = await chrome.storage.session.get(
            STORAGE_KEYS.PENDING_CONTEXT_ACTION
          );
          pending = sessionData[STORAGE_KEYS.PENDING_CONTEXT_ACTION];
          if (pending) {
            await chrome.storage.session.remove(STORAGE_KEYS.PENDING_CONTEXT_ACTION);
          }
        }

        if (!pending && typeof chrome !== 'undefined' && chrome.storage?.local) {
          const localData = await chrome.storage.local.get(
            STORAGE_KEYS.PENDING_CONTEXT_ACTION
          );
          pending = localData[STORAGE_KEYS.PENDING_CONTEXT_ACTION];
          if (pending) {
            await chrome.storage.local.remove(STORAGE_KEYS.PENDING_CONTEXT_ACTION);
          }
        }

        // Only consume actions within 60s freshness window
        if (
          pending &&
          pending.selectedText &&
          Date.now() - (pending.timestamp || 0) < 60000
        ) {
          console.log(
            '[useContextMenuListener] Consuming pending context action from storage:',
            pending.action
          );
          onAction(pending);
        }
      } catch (err) {
        console.warn('[useContextMenuListener] Could not read pending context action:', err);
      }
    };

    checkPendingStorage();

    // 2. Listen for live runtime message when Side Panel is already open
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const liveListener = (msg: any) => {
        if (msg?.type === MESSAGE_TYPES.CONTEXT_MENU_TRIGGER && msg.payload) {
          console.log(
            '[useContextMenuListener] Received live context menu trigger:',
            msg.payload.action
          );
          // Clean up storage just in case
          if (chrome.storage?.session) {
            chrome.storage.session.remove(STORAGE_KEYS.PENDING_CONTEXT_ACTION).catch(() => {});
          }
          if (chrome.storage?.local) {
            chrome.storage.local.remove(STORAGE_KEYS.PENDING_CONTEXT_ACTION).catch(() => {});
          }
          onAction(msg.payload);
        }
      };

      chrome.runtime.onMessage.addListener(liveListener);
      return () => {
        chrome.runtime.onMessage.removeListener(liveListener);
      };
    }
  }, [onAction]);
}
