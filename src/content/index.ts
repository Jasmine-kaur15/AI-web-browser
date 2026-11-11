// Content Script Entrypoint for Sahayak AI Browser Agent (Manifest V3)
import { MESSAGE_TYPES } from '../shared/constants';
import { extractPageContent } from './readabilityScraper';
import { extractYouTubeTranscript, isYouTubeWatchUrl } from './youtubeTranscript';
import { findActiveEditableElement, insertTextIntoElement } from './textInserter';
import { scanInteractiveElements, clearScannedElements, getElementByActionId } from './somMapper';
import { renderBadges, highlightTargetElement, clearBadges } from './somOverlay';
import { executeAction } from './actionRunner';

console.log('[Sahayak Content] Content script loaded on:', window.location.href);

// Milestone 4.4: Dynamic SPA Navigation Watcher (HTML5 History API, popstate, hashchange, YouTube)
let lastObservedUrl = window.location.href;

function handleSpaNavigationDetected(source: string) {
  const currentUrl = window.location.href;
  if (currentUrl === lastObservedUrl && source !== 'yt-navigate-finish') {
    return;
  }
  lastObservedUrl = currentUrl;
  console.log(`[Sahayak Content] SPA navigation detected via ${source}:`, currentUrl);

  // Clear stale Set-of-Marks badges and element registries from previous route
  clearBadges();
  clearScannedElements();

  // Notify background service worker & side panel about dynamic route transition
  try {
    chrome.runtime.sendMessage({
      type: 'MSG_SPA_NAVIGATED',
      payload: {
        url: currentUrl,
        title: document.title || '',
        source,
      },
    }).catch(() => {
      // Background worker might be waking up or dormant
    });
  } catch {
    // Context invalidated defensively handled
  }
}

// 1. YouTube in-page SPA navigation
window.addEventListener('yt-navigate-finish', () => {
  handleSpaNavigationDetected('yt-navigate-finish');
});

// 2. HTML5 History API monkey-patching
if (typeof history !== 'undefined') {
  const origPushState = history.pushState;
  history.pushState = function (...args: any[]) {
    const res = origPushState.apply(this, args as any);
    setTimeout(() => handleSpaNavigationDetected('pushState'), 50);
    return res;
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args: any[]) {
    const res = origReplaceState.apply(this, args as any);
    setTimeout(() => handleSpaNavigationDetected('replaceState'), 50);
    return res;
  };
}

// 3. Browser Back / Forward and Hash Navigation
window.addEventListener('popstate', () => {
  setTimeout(() => handleSpaNavigationDetected('popstate'), 50);
});

window.addEventListener('hashchange', () => {
  setTimeout(() => handleSpaNavigationDetected('hashchange'), 50);
});

// Central listener for messages from background service worker or side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // 1. Healthcheck Ping
  if (message?.type === 'MSG_CONTENT_PING') {
    sendResponse({
      status: 'PONG',
      url: window.location.href,
      title: document.title,
      isYouTube: isYouTubeWatchUrl(),
    });
    return true;
  }

  // 2. Milestone 1.3: Extract Article Content via Readability Scraper
  if (
    message?.type === MESSAGE_TYPES.EXTRACT_PAGE_CONTENT ||
    message?.type === 'MSG_EXTRACT_PAGE_CONTENT'
  ) {
    try {
      const extraction = extractPageContent();
      sendResponse({
        success: true,
        ...extraction,
      });
    } catch (err: any) {
      console.error('[Sahayak Content] Failed to extract page content:', err);
      sendResponse({
        success: false,
        error: err.message || 'DOM content extraction failed',
        title: document.title || '',
        cleanText: '',
        url: window.location.href,
        wordCount: 0,
      });
    }
    return true;
  }

  // 3. Milestone 1.4: Extract YouTube Video Transcript & Metadata
  if (
    message?.type === MESSAGE_TYPES.EXTRACT_YOUTUBE_TRANSCRIPT ||
    message?.type === 'MSG_EXTRACT_YOUTUBE_TRANSCRIPT'
  ) {
    const preferredLang = message?.payload?.preferredLang || 'en';
    extractYouTubeTranscript(preferredLang)
      .then((extraction) => {
        sendResponse({
          success: true,
          ...extraction,
        });
      })
      .catch((err: any) => {
        console.error('[Sahayak Content] Failed to extract YouTube transcript:', err);
        sendResponse({
          success: false,
          error: err.message || 'Failed to extract YouTube transcript',
          hasCaptions: false,
          transcript: '',
          wordCount: 0,
        });
      });
    return true; // Keep channel open for async response
  }

  // 4. Milestone 2.5: Insert Text into Active / Focused Input Element
  if (
    message?.type === MESSAGE_TYPES.INSERT_TEXT_ACTIVE_FIELD ||
    message?.type === 'MSG_INSERT_TEXT_ACTIVE_FIELD'
  ) {
    const textToInsert = message?.payload?.text || '';
    const activeEl = findActiveEditableElement();

    if (!activeEl) {
      sendResponse({
        success: false,
        error: 'NO_ACTIVE_FIELD',
      });
      return true;
    }

    const result = insertTextIntoElement(activeEl, textToInsert);
    sendResponse(result);
    return true;
  }

  // 5. Milestone 3.1 & 3.2: Interactive DOM Scanner & Set-of-Marks Badges
  if (
    message?.type === MESSAGE_TYPES.SCAN_INTERACTIVE_DOM ||
    message?.type === 'MSG_SCAN_INTERACTIVE_DOM'
  ) {
    try {
      const scanResult = scanInteractiveElements(message?.payload || {});

      // Milestone 3.2: Render overlay badges unless explicitly disabled
      let renderedCount = 0;
      if (message?.payload?.renderBadges !== false) {
        const renderResult = renderBadges(scanResult.elements);
        renderedCount = renderResult.renderedCount;
      }

      sendResponse({
        success: true,
        actionMap: scanResult,
        count: scanResult.elements.length,
        renderedCount,
        scanDurationMs: scanResult.scanDurationMs,
        excludedSensitiveCount: scanResult.excludedSensitiveCount,
      });
    } catch (err: any) {
      console.error('[Sahayak Content] DOM scanning failed:', err);
      sendResponse({
        success: false,
        error: err.message || 'Interactive DOM scan failed',
        elements: [],
      });
    }
    return true;
  }

  // 6. Milestone 3.2: Highlight Proposed Target Element
  if (
    message?.type === MESSAGE_TYPES.HIGHLIGHT_ELEMENT ||
    message?.type === 'MSG_HIGHLIGHT_ELEMENT'
  ) {
    const targetId =
      message?.payload?.targetElementId ?? message?.payload?.actionId ?? null;
    const result = highlightTargetElement(targetId);
    sendResponse(result);
    return true;
  }

  // 7. Milestone 3.2: Clear Scanned Elements & Overlay Badges
  if (
    message?.type === MESSAGE_TYPES.CLEAR_BADGES ||
    message?.type === 'MSG_CLEAR_BADGES'
  ) {
    clearBadges();
    clearScannedElements();
    sendResponse({ success: true, cleared: true });
    return true;
  }

  // 8. Milestone 3.5: Execute Approved DOM Action
  if (
    message?.type === MESSAGE_TYPES.EXECUTE_DOM_ACTION ||
    message?.type === 'MSG_EXECUTE_DOM_ACTION'
  ) {
    const action = message?.payload?.action;
    executeAction(action)
      .then((result) => {
        sendResponse(result);
      })
      .catch((err: any) => {
        console.error('[Sahayak Content] Action execution failed:', err);
        sendResponse({
          success: false,
          actionType: action?.actionType || 'WAIT',
          error: err.message || 'Action execution threw an unexpected error',
          executionTimeMs: 0,
        });
      });
    return true; // Keep channel open for async response
  }

  return false;
});
