// Context Menu Engine for Sahayak AI Browser (Milestone 2.1)
// Registers right-click menu items for text selections ("Explain this", "Translate to Hinglish", "Draft a reply")
// and captures selected text and routing data for the side panel.

import { MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';
import { ContextMenuActionId, ContextMenuTriggerPayload } from '../shared/types';

export const CONTEXT_MENU_IDS = {
  ROOT: 'sahayak-root',
  EXPLAIN: 'sahayak-explain' as ContextMenuActionId,
  TRANSLATE: 'sahayak-translate' as ContextMenuActionId,
  REPLY: 'sahayak-reply' as ContextMenuActionId,
} as const;

/**
 * Checks if a context menu ID is one of the valid Sahayak action items.
 */
export function isContextMenuAction(id: string | number): id is ContextMenuActionId {
  return (
    id === CONTEXT_MENU_IDS.EXPLAIN ||
    id === CONTEXT_MENU_IDS.TRANSLATE ||
    id === CONTEXT_MENU_IDS.REPLY
  );
}

/**
 * Constructs a bounded, sanitized ContextMenuTriggerPayload from a context menu click.
 * Truncates raw text selection to 4,000 characters to prevent token blowout.
 */
export function createContextMenuPayload(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): ContextMenuTriggerPayload | null {
  const menuItemId = String(info.menuItemId);
  if (!isContextMenuAction(menuItemId)) {
    return null;
  }

  const rawSelection = info.selectionText || '';
  const selectedText = rawSelection.trim().slice(0, 4000); // 4000 character safety bound
  const pageUrl = info.pageUrl || tab?.url || '';
  const frameUrl = info.frameUrl;
  const tabId = tab?.id;

  return {
    action: menuItemId,
    selectedText,
    pageUrl,
    frameUrl,
    tabId,
    timestamp: Date.now(),
  };
}

/**
 * Registers Sahayak context menus for highlighted/selected text in browser pages.
 * Clears existing menus first to prevent duplicate ID runtime errors during reloads/updates.
 */
export function registerContextMenus(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) {
    console.warn('[Sahayak ContextMenus] chrome.contextMenus API unavailable.');
    return;
  }

  chrome.contextMenus.removeAll(() => {
    // 1. Parent Root Menu: "Sahayak AI"
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IDS.ROOT,
        title: 'Sahayak AI',
        contexts: ['selection'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug(
            '[Sahayak ContextMenus] Error creating root menu:',
            chrome.runtime.lastError.message
          );
        }
      }
    );

    // 2. Child Item: "Explain this"
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IDS.EXPLAIN,
        parentId: CONTEXT_MENU_IDS.ROOT,
        title: 'Explain this',
        contexts: ['selection'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug(
            '[Sahayak ContextMenus] Error creating explain menu:',
            chrome.runtime.lastError.message
          );
        }
      }
    );

    // 3. Child Item: "Translate to Hinglish"
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IDS.TRANSLATE,
        parentId: CONTEXT_MENU_IDS.ROOT,
        title: 'Translate to Hinglish',
        contexts: ['selection'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug(
            '[Sahayak ContextMenus] Error creating translate menu:',
            chrome.runtime.lastError.message
          );
        }
      }
    );

    // 4. Child Item: "Draft a reply"
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IDS.REPLY,
        parentId: CONTEXT_MENU_IDS.ROOT,
        title: 'Draft a reply',
        contexts: ['selection'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.debug(
            '[Sahayak ContextMenus] Error creating reply menu:',
            chrome.runtime.lastError.message
          );
        }
      }
    );

    console.log('[Sahayak ContextMenus] Context menus registered successfully.');
  });
}

/**
 * Handles context menu clicks on selected text.
 * Captures selection, tabId, pageUrl, caches in storage, opens the side panel,
 * and notifies active listeners.
 */
export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const payload = createContextMenuPayload(info, tab);
  if (!payload) {
    return;
  }

  // Resolve active tabId if not provided in tab
  if (!payload.tabId && typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab?.id) {
        payload.tabId = activeTab.id;
      }
    } catch {
      // ignore
    }
  }

  console.log('[Sahayak ContextMenus] Clicked:', payload.action, {
    url: payload.pageUrl,
    selectionLength: payload.selectedText.length,
    tabId: payload.tabId,
  });

  // 1. Cache action in storage so Side Panel picks it up immediately upon mounting if opening
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session
        .set({ [STORAGE_KEYS.PENDING_CONTEXT_ACTION]: payload })
        .catch(() => {
          chrome.storage.local
            .set({ [STORAGE_KEYS.PENDING_CONTEXT_ACTION]: payload })
            .catch(() => {});
        });
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local
        .set({ [STORAGE_KEYS.PENDING_CONTEXT_ACTION]: payload })
        .catch(() => {});
    }
  } catch (storeErr) {
    console.warn('[Sahayak ContextMenus] Could not store pending action:', storeErr);
  }

  // 2. Open side panel automatically for this tab
  if (payload.tabId && chrome.sidePanel && chrome.sidePanel.open) {
    chrome.sidePanel.open({ tabId: payload.tabId }).catch((openErr) => {
      console.warn('[Sahayak ContextMenus] chrome.sidePanel.open failed:', openErr);
    });
  }

  // 3. Dispatch runtime message in case Side Panel is already open
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime
      .sendMessage({
        type: MESSAGE_TYPES.CONTEXT_MENU_TRIGGER,
        payload,
      })
      .catch(() => {
        // Expected if sidepanel is not open yet
      });
  }
}
