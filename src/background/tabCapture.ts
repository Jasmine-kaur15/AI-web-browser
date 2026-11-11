// Viewport Screen Capture Pipeline for Sahayak AI Browser Agent (Milestone 2.3)
// Captures the active browser viewport as a lightweight base64 JPEG image,
// validates against privacy/security guardrails, and caches in session storage.

import { ScreenCaptureResult } from '../shared/types';
import { STORAGE_KEYS } from '../shared/constants';
import { isRestrictedBrowserUrl, isBlacklistedUrl } from '../shared/helpers';

export interface CaptureViewportOptions {
  quality?: number;
  format?: 'jpeg' | 'png';
  tabId?: number;
  windowId?: number;
}

/**
 * Extracts raw base64 data, mimeType, and calculates approximate byte size from a data URL.
 */
export function parseCaptureDataUrl(dataUrl: string): {
  base64: string;
  mimeType: string;
  byteSize: number;
} {
  if (!dataUrl || !dataUrl.includes(',')) {
    return { base64: '', mimeType: 'image/jpeg', byteSize: 0 };
  }

  const parts = dataUrl.split(',');
  const header = parts[0];
  const base64 = parts[1] || '';

  let mimeType = 'image/jpeg';
  const match = header.match(/data:([^;]+);/);
  if (match && match[1]) {
    mimeType = match[1];
  }

  // Calculate approximate decoded byte size from base64 length
  const byteSize = Math.round((base64.length * 3) / 4);

  return { base64, mimeType, byteSize };
}

/**
 * Downscales high-DPI or ultra-wide viewport captures to standard web dimensions (max 1280px).
 * Prevents massive multi-megabyte payloads and drastically accelerates Gemini Vision inference time.
 */
export async function optimizeViewportDataUrl(
  dataUrl: string,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.60
): Promise<{ dataUrl: string; byteSize: number }> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    const { byteSize } = parseCaptureDataUrl(dataUrl);
    return { dataUrl, byteSize };
  }

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const { width, height } = bitmap;
    if (width <= maxWidth && height <= maxHeight) {
      bitmap.close();
      return { dataUrl, byteSize: blob.size };
    }

    const scale = Math.min(maxWidth / width, maxHeight / height);
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { dataUrl, byteSize: blob.size };
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const optimizedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const buffer = await optimizedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
    }
    const optimizedBase64 = btoa(binary);
    const optimizedDataUrl = `data:image/jpeg;base64,${optimizedBase64}`;

    return {
      dataUrl: optimizedDataUrl,
      byteSize: optimizedBlob.size,
    };
  } catch (err) {
    console.debug('[TabCapture] Could not downscale capture with OffscreenCanvas:', err);
    const { byteSize } = parseCaptureDataUrl(dataUrl);
    return { dataUrl, byteSize };
  }
}

/**
 * Finds the currently active browser tab to capture.
 */
async function getActiveCaptureTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    return null;
  }

  try {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url && !tab.url.startsWith('chrome-extension://')) {
      return tab;
    }

    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && !tab.url.startsWith('chrome-extension://')) {
      return tab;
    }

    const allActive = await chrome.tabs.query({ active: true });
    tab = allActive.find((t) => t.url && !t.url.startsWith('chrome-extension://')) || allActive[0];
    return tab || null;
  } catch (err) {
    console.warn('[Sahayak TabCapture] Error querying active tab:', err);
    return null;
  }
}

/**
 * Captures the visible area of the active browser viewport.
 * Uses chrome.tabs.captureVisibleTab with quality: 75 JPEG to keep token footprint minimal.
 */
export async function captureActiveTabViewport(
  options: CaptureViewportOptions = {}
): Promise<ScreenCaptureResult> {
  const timestamp = Date.now();

  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.captureVisibleTab) {
    return {
      success: false,
      error: 'chrome.tabs.captureVisibleTab API is unavailable in this environment.',
      mimeType: 'image/jpeg',
      timestamp,
    };
  }

  // 1. Locate active tab
  let targetTab: chrome.tabs.Tab | null = null;
  if (options.tabId && chrome.tabs.get) {
    try {
      targetTab = await chrome.tabs.get(options.tabId);
    } catch {
      targetTab = await getActiveCaptureTab();
    }
  } else {
    targetTab = await getActiveCaptureTab();
  }

  if (!targetTab || !targetTab.url) {
    return {
      success: false,
      error: 'No active browser tab found to capture.',
      mimeType: 'image/jpeg',
      timestamp,
    };
  }

  // 2. Privacy & Security Guardrails
  if (isRestrictedBrowserUrl(targetTab.url)) {
    return {
      success: false,
      error: 'Cannot capture screen on protected browser pages (e.g. chrome://, Web Store, or extension URLs).',
      mimeType: 'image/jpeg',
      tabId: targetTab.id,
      pageUrl: targetTab.url,
      timestamp,
    };
  }

  if (isBlacklistedUrl(targetTab.url)) {
    return {
      success: false,
      error: 'Screen capture is disabled on sensitive and financial portals for your privacy.',
      mimeType: 'image/jpeg',
      tabId: targetTab.id,
      pageUrl: targetTab.url,
      timestamp,
    };
  }

  // 3. Resolve target window
  const windowId =
    options.windowId !== undefined
      ? options.windowId
      : targetTab.windowId !== undefined
      ? targetTab.windowId
      : null;

  const captureFormat = options.format || 'jpeg';
  const captureQuality = Math.min(Math.max(options.quality ?? 60, 10), 95);

  try {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        windowId as any,
        {
          format: captureFormat,
          quality: captureQuality,
        },
        (resultUrl) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!resultUrl) {
            return reject(new Error('captureVisibleTab returned empty image data.'));
          }
          resolve(resultUrl);
        }
      );
    });

    // Optimize and downscale capture if high-DPI/Retina to accelerate Vision API by 3-5x
    const { dataUrl, byteSize: optimizedSize } = await optimizeViewportDataUrl(
      rawDataUrl,
      1024,
      1024,
      0.60
    );
    const { base64, mimeType } = parseCaptureDataUrl(dataUrl);
    const byteSize = optimizedSize || parseCaptureDataUrl(dataUrl).byteSize;

    let devicePixelRatio = 1;
    if (targetTab.id && typeof chrome !== 'undefined' && chrome.tabs?.getZoom) {
      try {
        const zoom = await chrome.tabs.getZoom(targetTab.id);
        if (zoom && typeof zoom === 'number') {
          devicePixelRatio = zoom;
        }
      } catch {}
    }

    const result: ScreenCaptureResult = {
      success: true,
      dataUrl,
      base64,
      mimeType,
      byteSize,
      width: targetTab.width,
      height: targetTab.height,
      devicePixelRatio,
      tabId: targetTab.id,
      pageUrl: targetTab.url,
      timestamp,
    };

    // 4. Cache in chrome.storage.session for active questions & multimodal analysis
    try {
      if (chrome.storage?.session) {
        await chrome.storage.session.set({
          [STORAGE_KEYS.CAPTURED_SCREEN]: result,
        });
      } else if (chrome.storage?.local) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.CAPTURED_SCREEN]: result,
        });
      }
    } catch (storeErr) {
      console.warn('[Sahayak TabCapture] Could not cache capture in session storage:', storeErr);
    }

    console.log(
      `[Sahayak TabCapture] Successfully captured viewport (${Math.round(
        byteSize / 1024
      )} KB, ${mimeType}):`,
      targetTab.url
    );

    return result;
  } catch (captureErr: any) {
    console.warn('[Sahayak TabCapture] captureVisibleTab failed:', captureErr);
    return {
      success: false,
      error: captureErr.message || 'Failed to capture visible browser tab.',
      mimeType: 'image/jpeg',
      tabId: targetTab.id,
      pageUrl: targetTab.url,
      timestamp,
    };
  }
}

/**
 * Retrieves the most recently captured screen from storage.
 */
export async function getStoredCapturedScreen(): Promise<ScreenCaptureResult | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const data = await chrome.storage.session.get(STORAGE_KEYS.CAPTURED_SCREEN);
      return data[STORAGE_KEYS.CAPTURED_SCREEN] || null;
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.CAPTURED_SCREEN);
      return data[STORAGE_KEYS.CAPTURED_SCREEN] || null;
    }
  } catch (err) {
    console.warn('[Sahayak TabCapture] Error reading stored capture:', err);
  }
  return null;
}

/**
 * Clears any cached captured screen from session and local storage.
 */
export async function clearStoredCapturedScreen(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove(STORAGE_KEYS.CAPTURED_SCREEN);
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(STORAGE_KEYS.CAPTURED_SCREEN);
    }
  } catch (err) {
    console.debug('[Sahayak TabCapture] Could not clear stored capture:', err);
  }
}

