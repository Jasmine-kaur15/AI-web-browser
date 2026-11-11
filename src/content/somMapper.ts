// Set-of-Marks (SoM) Interactive DOM Scanner for Sahayak AI Browser Agent
// Milestone 3.1: Scans visible viewport for actionable elements, filters sensitive fields,
// extracts semantic labels, computes bounding boxes, and assigns sequential index badges (#1, #2...).

import { ActionElement, ActionElementRect, ActionMap } from '../shared/types';
import { SENSITIVE_INPUT_REGEX } from '../shared/constants';

/**
 * Interactive element candidate selector query covering links, buttons, inputs,
 * textareas, selects, ARIA interactive roles, editable elements, and tab focusables.
 */
export const CANDIDATE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="searchbox"]',
  '[role="textbox"]',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[tabindex]:not([tabindex="-1"])',
  'summary',
].join(', ');

/**
 * In-memory registry mapping numeric action ID -> live DOM HTMLElement.
 * Enables instant, reliable O(1) element lookup for actionRunner without fragile re-querying.
 */
const scannedElementRegistry = new Map<number, HTMLElement>();

/**
 * Retrieves a live DOM element by its assigned Set-of-Marks action ID.
 */
export function getElementByActionId(id: number): HTMLElement | undefined {
  return scannedElementRegistry.get(id);
}

/**
 * Returns all currently registered scanned elements in memory.
 */
export function getScannedElementsRegistry(): Map<number, HTMLElement> {
  return scannedElementRegistry;
}

/**
 * Clears the in-memory scanned element registry.
 */
export function clearScannedElements(): void {
  scannedElementRegistry.clear();
}

/**
 * Checks whether an element is sensitive (passwords, OTPs, credit cards, CVVs, tokens).
 * Sensitive elements are strictly omitted from the Action Map to protect user privacy.
 */
export function isSensitiveElement(el: HTMLElement): boolean {
  if (!el) return false;

  // 1. Password input type
  if (el instanceof HTMLInputElement && el.type && el.type.toLowerCase() === 'password') {
    return true;
  }

  // 2. Sensitive autocomplete tokens (HTML5 standard tokens)
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (
    autocomplete.includes('password') ||
    autocomplete.includes('cc-') ||
    autocomplete.includes('one-time-code') ||
    autocomplete.includes('transaction-')
  ) {
    return true;
  }

  // 3. Inspect attributes against sensitive regex pattern
  const attributesToInspect = [
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('title'),
    el.className,
    el.getAttribute('data-testid'),
  ];

  for (const attr of attributesToInspect) {
    if (attr && typeof attr === 'string' && SENSITIVE_INPUT_REGEX.test(attr)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines if an element is genuinely visible within the current browser viewport.
 * Checks DOM attachment, computed styles (display, visibility, opacity), bounding size (>= 8x8),
 * and viewport boundary intersection.
 */
export function isElementVisibleInViewport(
  el: HTMLElement,
  options: {
    minWidth?: number;
    minHeight?: number;
    checkComputedStyle?: boolean;
    viewportOnly?: boolean;
  } = {}
): { visible: boolean; rect: DOMRect; isFixed: boolean } {
  const minWidth = options.minWidth ?? 8;
  const minHeight = options.minHeight ?? 8;
  const checkStyle = options.checkComputedStyle ?? true;
  const viewportOnly = options.viewportOnly ?? true;

  // Initial dummy rect fallback
  const dummyRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  } as DOMRect;

  // 1. Connection check
  if (!el || !el.isConnected) {
    return { visible: false, rect: dummyRect, isFixed: false };
  }

  // 2. Computed style check
  let isFixed = false;
  if (checkStyle && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        parseFloat(style.opacity || '1') < 0.1 ||
        style.pointerEvents === 'none'
      ) {
        return { visible: false, rect: dummyRect, isFixed: false };
      }
      isFixed = style.position === 'fixed' || style.position === 'sticky';
    } catch {
      // Graceful fallback if style computation fails
    }
  }

  // 3. Bounding box check
  let rect: DOMRect = dummyRect;
  try {
    rect = el.getBoundingClientRect();
  } catch {
    return { visible: false, rect: dummyRect, isFixed: false };
  }

  if (rect.width < minWidth || rect.height < minHeight) {
    return { visible: false, rect, isFixed };
  }

  // 4. Viewport intersection check
  if (viewportOnly && typeof window !== 'undefined') {
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;

    if (vh > 0 && vw > 0) {
      const inView =
        rect.bottom > 0 &&
        rect.top < vh &&
        rect.right > 0 &&
        rect.left < vw;

      if (!inView) {
        return { visible: false, rect, isFixed };
      }
    }
  }

  return { visible: true, rect, isFixed };
}

/**
 * Extracts a human-readable, semantic label for an interactive element using prioritized heuristics:
 * 1. Explicit <label for="id"> or parent <label>
 * 2. aria-label or aria-labelledby
 * 3. placeholder attribute (for inputs)
 * 4. innerText or textContent (for buttons/links)
 * 5. alt attribute of inner <img> or SVG title
 * 6. name or id fallback
 */
export function getElementLabel(el: HTMLElement): string {
  if (!el) return '';

  // Helper to sanitize text
  const clean = (text: string | null | undefined): string => {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  };

  // 1. Associated <label for="...">
  if (el.id && typeof document !== 'undefined') {
    try {
      const safeId = CSS.escape ? CSS.escape(el.id) : el.id;
      const label = document.querySelector(`label[for="${safeId}"]`);
      if (label) {
        const text = clean((label as HTMLElement).innerText || label.textContent);
        if (text) return text.slice(0, 100);
      }
    } catch {
      // Ignore selector syntax issues on invalid IDs
    }
  }

  // 2. Closest wrapping <label>
  try {
    const parentLabel = el.closest('label');
    if (parentLabel) {
      // Clone label and remove this element to prevent reading current input text as label
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      const innerInput = clone.querySelector('input, select, textarea');
      if (innerInput && innerInput.parentNode) {
        innerInput.parentNode.removeChild(innerInput);
      }
      const text = clean(clone.innerText || clone.textContent);
      if (text) return text.slice(0, 100);
    }
  } catch {
    // Ignore error
  }

  // 3. ARIA attributes
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && clean(ariaLabel)) {
    return clean(ariaLabel).slice(0, 100);
  }

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy && typeof document !== 'undefined') {
    const parts: string[] = [];
    for (const id of ariaLabelledBy.split(/\s+/)) {
      if (!id) continue;
      const target = document.getElementById(id);
      if (target) {
        parts.push(clean(target.innerText || target.textContent));
      }
    }
    const combined = clean(parts.join(' '));
    if (combined) return combined.slice(0, 100);
  }

  // 4. Placeholder (for text inputs / textareas)
  const placeholder = el.getAttribute('placeholder');
  if (placeholder && clean(placeholder)) {
    return clean(placeholder).slice(0, 100);
  }

  // 5. Buttons, links, summary, tabs: extract visible text
  const tag = el.tagName.toLowerCase();
  if (
    tag === 'button' ||
    tag === 'a' ||
    tag === 'summary' ||
    el.getAttribute('role') === 'button' ||
    el.getAttribute('role') === 'link' ||
    el.getAttribute('role') === 'tab'
  ) {
    const inner = clean(el.innerText || el.textContent);
    if (inner) return inner.slice(0, 100);

    // If text is empty (e.g. icon button), check inner img alt or svg
    const img = el.querySelector('img[alt]');
    if (img) {
      const alt = clean(img.getAttribute('alt'));
      if (alt) return alt.slice(0, 100);
    }

    const svg = el.querySelector('svg');
    if (svg) {
      const svgTitle = clean(svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent);
      if (svgTitle) return svgTitle.slice(0, 100);
    }
  }

  // 6. Submit or button inputs: check value attribute
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if ((type === 'submit' || type === 'button' || type === 'reset') && el.value) {
      const val = clean(el.value);
      if (val) return val.slice(0, 100);
    }
  }

  // 7. Title attribute
  const title = el.getAttribute('title');
  if (title && clean(title)) {
    return clean(title).slice(0, 100);
  }

  // 8. Name attribute
  const name = el.getAttribute('name');
  if (name && clean(name)) {
    return clean(name).slice(0, 100);
  }

  // 9. Fallback: tag name + role description
  const role = el.getAttribute('role');
  if (role) {
    return `${role} element`;
  }

  return `${tag} element`;
}

/**
 * Generates a unique, reproducible CSS selector for the given element.
 */
export function generateElementSelector(el: HTMLElement): string {
  if (!el || !el.tagName) return '';

  const tag = el.tagName.toLowerCase();

  // 1. Unique ID
  if (el.id && typeof document !== 'undefined') {
    try {
      const safeId = CSS.escape ? CSS.escape(el.id) : el.id;
      if (document.querySelectorAll(`#${safeId}`).length === 1) {
        return `#${safeId}`;
      }
    } catch {
      // Fallback if ID is invalid CSS identifier
    }
  }

  // 2. Unique name attribute on form elements
  const name = el.getAttribute('name');
  if (name && typeof document !== 'undefined') {
    try {
      const safeName = CSS.escape ? CSS.escape(name) : name;
      const selector = `${tag}[name="${safeName}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    } catch {
      // Ignore
    }
  }

  // 3. Unique data-testid
  const testId = el.getAttribute('data-testid');
  if (testId && typeof document !== 'undefined') {
    try {
      const safeTestId = CSS.escape ? CSS.escape(testId) : testId;
      const selector = `${tag}[data-testid="${safeTestId}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    } catch {
      // Ignore
    }
  }

  // 4. Unique role + aria-label
  const ariaLabel = el.getAttribute('aria-label');
  const role = el.getAttribute('role');
  if (ariaLabel && typeof document !== 'undefined') {
    try {
      const safeLabel = CSS.escape ? CSS.escape(ariaLabel) : ariaLabel;
      const selector = role
        ? `[role="${role}"][aria-label="${safeLabel}"]`
        : `${tag}[aria-label="${safeLabel}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    } catch {
      // Ignore
    }
  }

  // 5. Hierarchical path with nth-of-type
  const path: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
    let selector = current.tagName.toLowerCase();

    if (current.id && CSS.escape) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    } else {
      let nth = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName.toLowerCase() === current.tagName.toLowerCase()) {
          nth++;
        }
        sibling = sibling.previousElementSibling;
      }
      selector += `:nth-of-type(${nth})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ') || tag;
}

/**
 * Extracts current value or state from an input/select/textarea.
 */
function extractCurrentValue(el: HTMLElement): string | undefined {
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      return el.checked ? 'checked' : 'unchecked';
    }
    return el.value ? el.value.slice(0, 100) : '';
  }

  if (el instanceof HTMLTextAreaElement) {
    return el.value ? el.value.slice(0, 100) : '';
  }

  if (el instanceof HTMLSelectElement) {
    return el.value || '';
  }

  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    return (el.innerText || el.textContent || '').slice(0, 100);
  }

  return undefined;
}

/**
 * Extracts available options from a <select> element (up to 10 options).
 */
function extractSelectOptions(el: HTMLElement): string[] | undefined {
  if (!(el instanceof HTMLSelectElement)) return undefined;

  const options: string[] = [];
  const maxOptions = 10;

  for (let i = 0; i < el.options.length && i < maxOptions; i++) {
    const opt = el.options[i];
    const text = (opt.text || opt.value || '').trim();
    if (text) {
      options.push(text);
    }
  }

  return options.length > 0 ? options : undefined;
}

export interface ScanOptions {
  viewportOnly?: boolean;
  minWidth?: number;
  minHeight?: number;
  includeDisabled?: boolean;
}

export interface ScanInteractiveResult extends ActionMap {
  scanDurationMs: number;
  totalCandidates: number;
  excludedSensitiveCount: number;
}

/**
 * Scans the current page/viewport for interactive elements, filters out sensitive fields,
 * assigns sequential numbered IDs (#1, #2...), and registers elements in memory for execution.
 *
 * Performance target: < 50ms on standard forms.
 */
export function scanInteractiveElements(options: ScanOptions = {}): ScanInteractiveResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // Reset in-memory registry for new scan session
  clearScannedElements();

  const viewportOnly = options.viewportOnly ?? true;
  const minWidth = options.minWidth ?? 8;
  const minHeight = options.minHeight ?? 8;
  const includeDisabled = options.includeDisabled ?? false;

  const viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
    scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
  };

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const title = typeof document !== 'undefined' ? document.title : '';

  if (typeof document === 'undefined') {
    return {
      viewport,
      elements: [],
      url,
      title,
      scanDurationMs: 0,
      totalCandidates: 0,
      excludedSensitiveCount: 0,
    };
  }

  // 1. Query candidate elements
  let candidateNodes: NodeListOf<Element>;
  try {
    candidateNodes = document.querySelectorAll(CANDIDATE_SELECTOR);
  } catch {
    candidateNodes = document.querySelectorAll('button, a, input, select, textarea');
  }

  const elements: ActionElement[] = [];
  let nextId = 1;
  let excludedSensitiveCount = 0;

  // Track parent clickable containers to avoid redundant marks on internal spans/icons
  const parentClickableSet = new Set<HTMLElement>();

  for (let i = 0; i < candidateNodes.length; i++) {
    const node = candidateNodes[i];
    if (!(node instanceof HTMLElement)) continue;

    // Check if element is a child of an already-indexed button or anchor (e.g. <span> inside <button>)
    if (
      node.parentElement &&
      (parentClickableSet.has(node.parentElement) ||
        node.parentElement.closest('button, a[href]'))
    ) {
      // Skip redundant internal child if parent is already an interactive button/link
      const parentInteractive = node.parentElement.closest('button, a[href]');
      if (parentInteractive && parentInteractive !== node) {
        continue;
      }
    }

    // 2. Strict Sensitive Field Check (Passwords, OTPs, CVVs, Card numbers)
    if (isSensitiveElement(node)) {
      excludedSensitiveCount++;
      continue; // Exclude sensitive element completely from ActionMap
    }

    // 3. Disabled element filter
    if (!includeDisabled) {
      const isDisabled =
        (node as any).disabled === true ||
        node.getAttribute('aria-disabled') === 'true' ||
        node.classList.contains('disabled');
      if (isDisabled) {
        continue;
      }
    }

    // 4. Viewport visibility & bounding box check
    const { visible, rect, isFixed } = isElementVisibleInViewport(node, {
      minWidth,
      minHeight,
      viewportOnly,
    });

    if (!visible) {
      continue;
    }

    // 5. Extract metadata
    const tag = node.tagName.toLowerCase();
    const type = node instanceof HTMLInputElement ? (node.type || 'text').toLowerCase() : undefined;
    const name = node.getAttribute('name') || undefined;
    const role = node.getAttribute('role') || undefined;
    const placeholder = node.getAttribute('placeholder') || undefined;
    const label = getElementLabel(node);
    const currentValue = extractCurrentValue(node);
    const optionsList = extractSelectOptions(node);
    const selector = generateElementSelector(node);

    // Compute absolute coordinates relative to document for accurate overlay badges
    const elementRect: ActionElementRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top + (isFixed ? 0 : viewport.scrollY)),
      left: Math.round(rect.left + (isFixed ? 0 : viewport.scrollX)),
    };

    const actionElement: ActionElement = {
      id: nextId,
      tag,
      type,
      name,
      label: label || `${tag} #${nextId}`,
      placeholder,
      currentValue,
      rect: elementRect,
      selector,
      role,
      options: optionsList,
      isFixed,
    };

    // Store in live in-memory registry
    scannedElementRegistry.set(nextId, node);

    if (tag === 'button' || tag === 'a' || role === 'button') {
      parentClickableSet.add(node);
    }

    elements.push(actionElement);
    nextId++;
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const scanDurationMs = Math.round((endTime - startTime) * 100) / 100;
  const hasPasswordField =
    typeof document !== 'undefined'
      ? document.querySelector('input[type="password"]') !== null
      : false;
  const isSensitivePage = hasPasswordField;

  return {
    viewport,
    elements,
    url,
    title,
    scanDurationMs,
    totalCandidates: candidateNodes.length,
    excludedSensitiveCount,
    hasPasswordField,
    isSensitivePage,
  };
}

// Re-export overlay functions for Milestone 3.2
export { renderBadges, highlightTargetElement, clearBadges } from './somOverlay';


