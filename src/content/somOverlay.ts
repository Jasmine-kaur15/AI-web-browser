// Set-of-Marks (SoM) Visual Badge Overlay Renderer for Sahayak AI Browser Agent
// Milestone 3.2: Renders high-contrast numbered badges (#1, #2...) over actionable elements,
// handles fixed/scrolled positioning, pulsing target element highlights, and clean teardown.

import { ActionElement } from '../shared/types';
import { getElementByActionId } from './somMapper';

export const SOM_CONTAINER_ID = 'sahayak-som-container';
export const SOM_INLINE_STYLE_ID = 'sahayak-som-inline-style';
export const HIGHLIGHT_CLASS = 'sahayak-highlight-target';
export const BADGE_CLASS = 'sahayak-badge';
export const BADGE_FIXED_CLASS = 'sahayak-badge-fixed';
export const BADGE_TARGET_CLASS = 'sahayak-badge-target';

/**
 * Fallback CSS rules injected dynamically if extension is reloaded on an already-open tab.
 */
const INLINE_OVERLAY_CSS = `
#${SOM_CONTAINER_ID} {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none !important;
  z-index: 2147483647 !important;
  overflow: visible;
  margin: 0;
  padding: 0;
}

.${BADGE_CLASS} {
  position: absolute;
  pointer-events: none !important;
  background: #facc15 !important;
  color: #000000 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  padding: 2px 6px !important;
  border-radius: 9999px !important;
  border: 1.5px solid #000000 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4) !important;
  transform: translate(-50%, -50%) !important;
  user-select: none !important;
  white-space: nowrap !important;
  transition: transform 0.15s ease-out, background-color 0.15s ease-out !important;
}

.${BADGE_FIXED_CLASS} {
  position: fixed !important;
}

.${BADGE_TARGET_CLASS} {
  background: #38bdf8 !important;
  color: #0f172a !important;
  border-color: #0284c7 !important;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.9), 0 2px 6px rgba(0, 0, 0, 0.4) !important;
  transform: translate(-50%, -50%) scale(1.18) !important;
  z-index: 2147483647 !important;
}

.${HIGHLIGHT_CLASS} {
  outline: 3px solid #38bdf8 !important;
  outline-offset: 3px !important;
  animation: sahayak-pulse 1.5s infinite alternate ease-in-out !important;
}

@keyframes sahayak-pulse {
  0% {
    outline-color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
  }
  100% {
    outline-color: #f43f5e;
    box-shadow: 0 0 16px rgba(244, 63, 94, 0.8);
  }
}
`;

/**
 * Ensures fallback styling is present in the DOM for live extension reloads.
 */
function ensureOverlayStyles(): void {
  if (typeof document === 'undefined') return;
  if (!document.getElementById(SOM_INLINE_STYLE_ID)) {
    const styleEl = document.createElement('style');
    styleEl.id = SOM_INLINE_STYLE_ID;
    styleEl.textContent = INLINE_OVERLAY_CSS;
    (document.head || document.documentElement).appendChild(styleEl);
  }
}

/**
 * Gets or creates the master overlay container in the DOM.
 */
export function getOrCreateOverlayContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById(SOM_CONTAINER_ID);
  if (!container) {
    ensureOverlayStyles();
    container = document.createElement('div');
    container.id = SOM_CONTAINER_ID;
    container.setAttribute('aria-hidden', 'true');
    container.setAttribute('data-sahayak-overlay', 'true');
    container.style.cssText =
      'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647; overflow: visible; margin: 0; padding: 0;';

    const parent = document.body || document.documentElement;
    if (parent) {
      parent.appendChild(container);
    }
  }

  return container;
}

/**
 * Clamps coordinates to ensure badges stay within viewport boundaries.
 */
function clampCoord(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(val, max));
}

/**
 * Renders high-contrast Set-of-Marks badges (#1, #2, #3...) directly onto the web page.
 * Positions fixed elements with position: fixed and scrolled elements with absolute coordinates.
 */
export function renderBadges(elements: ActionElement[]): {
  success: boolean;
  renderedCount: number;
} {
  if (typeof document === 'undefined') {
    return { success: false, renderedCount: 0 };
  }

  // Clear existing container to prevent stale badges
  clearBadges();

  if (!elements || elements.length === 0) {
    return { success: true, renderedCount: 0 };
  }

  const container = getOrCreateOverlayContainer();
  if (!container) {
    return { success: false, renderedCount: 0 };
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let renderedCount = 0;

  for (const el of elements) {
    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    badge.setAttribute('data-action-id', String(el.id));
    badge.textContent = `#${el.id}`;

    if (el.isFixed) {
      badge.classList.add(BADGE_FIXED_CLASS);
      const posX = clampCoord(el.rect.x, 10, vw - 20);
      const posY = clampCoord(el.rect.y, 10, vh - 20);
      badge.style.position = 'fixed';
      badge.style.left = `${posX}px`;
      badge.style.top = `${posY}px`;
    } else {
      const posX = Math.max(10, el.rect.left);
      const posY = Math.max(10, el.rect.top);
      badge.style.position = 'absolute';
      badge.style.left = `${posX}px`;
      badge.style.top = `${posY}px`;
    }

    container.appendChild(badge);
    renderedCount++;
  }

  return { success: true, renderedCount };
}

/**
 * Highlights a specific target element by its Set-of-Marks ID:
 * 1. Adds pulsating border (.sahayak-highlight-target) to the live DOM node.
 * 2. Adds cyan glow (.sahayak-badge-target) to the corresponding badge.
 * 3. Scrolls target into view smoothly if not currently visible.
 */
export function highlightTargetElement(actionId: number | null): {
  success: boolean;
  highlightedId: number | null;
} {
  if (typeof document === 'undefined') {
    return { success: false, highlightedId: null };
  }

  // 1. Remove highlight from all previously targeted elements
  const prevHighlighted = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  prevHighlighted.forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));

  const prevBadges = document.querySelectorAll(`.${BADGE_TARGET_CLASS}`);
  prevBadges.forEach((el) => el.classList.remove(BADGE_TARGET_CLASS));

  if (actionId === null || actionId === undefined) {
    return { success: true, highlightedId: null };
  }

  // 2. Find live DOM element from in-memory registry
  const targetEl = getElementByActionId(actionId);
  if (targetEl) {
    targetEl.classList.add(HIGHLIGHT_CLASS);

    // Scroll smoothly into view if needed
    try {
      targetEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    } catch {
      // Fallback
    }
  }

  // 3. Highlight the matching badge in the overlay container
  const container = document.getElementById(SOM_CONTAINER_ID);
  if (container) {
    const badge = container.querySelector(`[data-action-id="${actionId}"]`);
    if (badge) {
      badge.classList.add(BADGE_TARGET_CLASS);
    }
  }

  return { success: Boolean(targetEl), highlightedId: actionId };
}

/**
 * Cleanly removes all badges, highlights, and overlay containers from the DOM.
 */
export function clearBadges(): { success: boolean } {
  if (typeof document === 'undefined') {
    return { success: true };
  }

  // 1. Remove overlay container
  const container = document.getElementById(SOM_CONTAINER_ID);
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }

  // 2. Clear any lingering highlight classes from page elements
  const highlighted = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  highlighted.forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));

  return { success: true };
}

