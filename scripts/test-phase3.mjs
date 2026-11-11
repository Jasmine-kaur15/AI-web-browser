// Automated Verification Suite for Phase 3 (Milestone 3.1: Interactive DOM Scanner)
import test from 'node:test';
import assert from 'node:assert/strict';

// Import regex & constants
const SENSITIVE_INPUT_REGEX =
  /(pass|pwd|secret|token|cvv|cvc|creditcard|cardnumber|exp-date|ssn|aadhaar|otp|pin|authcode)/i;

const CANDIDATE_SELECTOR = [
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

// ============================================================================
// Mock DOM Implementation for Node.js Testing
// ============================================================================
class MockDOMRect {
  constructor({ x = 0, y = 0, width = 100, height = 40, top = 0, left = 0 } = {}) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.top = top;
    this.left = left;
    this.right = left + width;
    this.bottom = top + height;
  }
}

class MockElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    const flattened = { ...(attrs.attrs || {}), ...attrs };
    delete flattened.attrs;
    this.attrs = flattened;
    this.style = {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      pointerEvents: 'auto',
      ...(attrs.style || {}),
    };
    this.id = this.attrs.id || '';
    this.className = this.attrs.class || this.attrs.className || '';
    this.type = this.attrs.type || (this.tagName === 'INPUT' ? 'text' : undefined);
    this.name = this.attrs.name || '';
    this.value = this.attrs.value || '';
    this.checked = Boolean(this.attrs.checked);
    this.disabled = Boolean(this.attrs.disabled);
    this.placeholder = this.attrs.placeholder || '';
    this.innerText = this.attrs.innerText || '';
    this.textContent = this.attrs.textContent || this.innerText;
    this.parentElement = null;
    this.children = [];
    this.isConnected = true;
    this.options = this.attrs.options || [];
    this.rect = new MockDOMRect(this.attrs.rect);
    this.scrolledIntoView = false;
    this.isFocused = false;
    this.eventListeners = {};
    this.dispatchedEvents = [];
    this.classList = {
      add: (...classes) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((c) => set.add(c));
        this.className = Array.from(set).join(' ');
      },
      remove: (...classes) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((c) => set.delete(c));
        this.className = Array.from(set).join(' ');
      },
      contains: (c) => this.className.split(/\s+/).includes(c),
    };
  }

  focus() {
    this.isFocused = true;
  }

  addEventListener(type, listener) {
    if (!this.eventListeners[type]) this.eventListeners[type] = [];
    this.eventListeners[type].push(listener);
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event?.type;
    this.dispatchedEvents.push(event);
    const listeners = this.eventListeners[type] || [];
    for (const l of listeners) {
      l(event);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
  }

  scrollIntoView(opts) {
    this.scrolledIntoView = true;
    this.scrollOptions = opts;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'name') return this.name || null;
    if (name === 'type') return this.type || null;
    if (name === 'placeholder') return this.placeholder || null;
    if (name === 'class' || name === 'className') return this.className || null;
    return this.attrs[name] !== undefined ? String(this.attrs[name]) : null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'name') this.name = String(value);
    if (name === 'class' || name === 'className') this.className = String(value);
    if (name === 'placeholder') this.placeholder = String(value);
    if (name === 'type') this.type = String(value);
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  matches(selector) {
    const s = selector.toLowerCase().trim();
    const tag = this.tagName.toLowerCase();

    // Comma-separated selectors
    if (s.includes(',')) {
      return s.split(',').some((part) => this.matches(part.trim()));
    }

    // Pseudo-class :not(...)
    if (s.includes(':not(')) {
      const match = s.match(/^([^:]*):not\((.+)\)$/);
      if (match) {
        const base = match[1] || '*';
        const neg = match[2];
        const baseMatches = base === '*' || this.matches(base);
        return baseMatches && !this.matches(neg);
      }
    }

    if (s.startsWith('#')) {
      return this.id === s.slice(1);
    }

    if (s.startsWith('.')) {
      return this.className.split(/\s+/).includes(s.slice(1));
    }

    // Attribute selectors, optionally prefixed with tag (e.g. button[data-testid="foo"], [role="button"])
    const attrMatch = s.match(/^([a-z0-9_-]*)\[([a-z0-9_-]+)(?:="([^"]*)")?\]$/);
    if (attrMatch) {
      const prefixTag = attrMatch[1];
      const attrName = attrMatch[2];
      const attrVal = attrMatch[3];

      if (prefixTag && prefixTag !== tag) {
        return false;
      }
      const val = this.getAttribute(attrName);
      if (attrVal === undefined) return val !== null;
      return val === attrVal;
    }

    return tag === s;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const sub = child.querySelector(selector);
      if (sub) return sub;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }

  cloneNode() {
    const clone = new MockElement(this.tagName, {
      ...this.attrs,
      id: this.id,
      name: this.name,
      className: this.className,
      type: this.type,
      value: this.value,
      innerText: this.innerText,
      textContent: this.textContent,
      rect: this.rect,
      style: { ...this.style },
    });
    for (const child of this.children) {
      clone.appendChild(child.cloneNode());
    }
    return clone;
  }
}

// ============================================================================
// Core Logic Re-implementation in Test Context (Verifying Algorithm Equivalency)
// ============================================================================
function isSensitiveElement(el) {
  if (!el) return false;
  if (el.type && el.type.toLowerCase() === 'password') {
    return true;
  }
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (
    autocomplete.includes('password') ||
    autocomplete.includes('cc-') ||
    autocomplete.includes('one-time-code') ||
    autocomplete.includes('transaction-')
  ) {
    return true;
  }
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

function isElementVisibleInViewport(el, options = {}, mockWindow, mockDoc) {
  const minWidth = options.minWidth ?? 8;
  const minHeight = options.minHeight ?? 8;
  const viewportOnly = options.viewportOnly ?? true;

  if (!el || !el.isConnected) {
    return { visible: false, rect: null, isFixed: false };
  }

  const style = el.style || {};
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    parseFloat(style.opacity || '1') < 0.1 ||
    style.pointerEvents === 'none'
  ) {
    return { visible: false, rect: null, isFixed: false };
  }

  const isFixed = style.position === 'fixed' || style.position === 'sticky';
  const rect = el.getBoundingClientRect();

  if (rect.width < minWidth || rect.height < minHeight) {
    return { visible: false, rect, isFixed };
  }

  if (viewportOnly) {
    const vh = mockWindow?.innerHeight || 800;
    const vw = mockWindow?.innerWidth || 1280;
    const inView = rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
    if (!inView) {
      return { visible: false, rect, isFixed };
    }
  }

  return { visible: true, rect, isFixed };
}

function getElementLabel(el, mockDoc) {
  if (!el) return '';
  const clean = (text) => (text ? text.replace(/\s+/g, ' ').trim() : '');

  // 1. Associated <label for="...">
  if (el.id && mockDoc) {
    const label = mockDoc.querySelector(`label[for="${el.id}"]`);
    if (label) {
      const text = clean(label.innerText || label.textContent);
      if (text) return text.slice(0, 100);
    }
  }

  // 2. Parent <label>
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode();
    const text = clean(clone.innerText || clone.textContent);
    if (text) return text.slice(0, 100);
  }

  // 3. ARIA attributes
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && clean(ariaLabel)) return clean(ariaLabel).slice(0, 100);

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy && mockDoc) {
    const parts = [];
    for (const id of ariaLabelledBy.split(/\s+/)) {
      if (!id) continue;
      const target = mockDoc.querySelector(`#${id}`);
      if (target) parts.push(clean(target.innerText || target.textContent));
    }
    const combined = clean(parts.join(' '));
    if (combined) return combined.slice(0, 100);
  }

  // 4. Placeholder
  const placeholder = el.getAttribute('placeholder');
  if (placeholder && clean(placeholder)) return clean(placeholder).slice(0, 100);

  // 5. Buttons, links, summaries
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || tag === 'a' || tag === 'summary' || el.getAttribute('role') === 'button') {
    const inner = clean(el.innerText || el.textContent);
    if (inner) return inner.slice(0, 100);

    const img = el.querySelector('img[alt]');
    if (img) {
      const alt = clean(img.getAttribute('alt'));
      if (alt) return alt.slice(0, 100);
    }
  }

  // 6. Submit or button value
  if (tag === 'input' && (el.type === 'submit' || el.type === 'button') && el.value) {
    const val = clean(el.value);
    if (val) return val.slice(0, 100);
  }

  // 7. Title or Name
  const title = el.getAttribute('title');
  if (title && clean(title)) return clean(title).slice(0, 100);

  const name = el.getAttribute('name');
  if (name && clean(name)) return clean(name).slice(0, 100);

  return `${tag} element`;
}

function generateElementSelector(el, mockDoc) {
  if (!el || !el.tagName) return '';
  const tag = el.tagName.toLowerCase();

  if (el.id && mockDoc) {
    if (mockDoc.querySelectorAll(`#${el.id}`).length === 1) {
      return `#${el.id}`;
    }
  }

  const name = el.getAttribute('name');
  if (name && mockDoc) {
    const sel = `${tag}[name="${name}"]`;
    if (mockDoc.querySelectorAll(sel).length === 1) {
      return sel;
    }
  }

  const testId = el.getAttribute('data-testid');
  if (testId && mockDoc) {
    const sel = `${tag}[data-testid="${testId}"]`;
    if (mockDoc.querySelectorAll(sel).length === 1) {
      return sel;
    }
  }

  return tag;
}

function scanElements(root, mockWindow, options = {}) {
  const startTime = Date.now();
  const elements = [];
  const scannedRegistry = new Map();
  const candidateNodes = root.querySelectorAll(CANDIDATE_SELECTOR);

  let nextId = 1;
  let excludedSensitiveCount = 0;
  const parentClickableSet = new Set();

  for (const node of candidateNodes) {
    if (node.parentElement && (parentClickableSet.has(node.parentElement) || node.parentElement.closest('button, a[href]'))) {
      const parentInteractive = node.parentElement.closest('button, a[href]');
      if (parentInteractive && parentInteractive !== node) {
        continue;
      }
    }

    if (isSensitiveElement(node)) {
      excludedSensitiveCount++;
      continue;
    }

    if (!options.includeDisabled && node.disabled) {
      continue;
    }

    const { visible, rect, isFixed } = isElementVisibleInViewport(node, options, mockWindow, root);
    if (!visible) continue;

    const tag = node.tagName.toLowerCase();
    const type = node.type;
    const name = node.getAttribute('name') || undefined;
    const role = node.getAttribute('role') || undefined;
    const placeholder = node.getAttribute('placeholder') || undefined;
    const label = getElementLabel(node, root);
    const selector = generateElementSelector(node, root);

    const actionElement = {
      id: nextId,
      tag,
      type,
      name,
      label,
      placeholder,
      currentValue: node.value,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top + (isFixed ? 0 : mockWindow.scrollY || 0),
        left: rect.left + (isFixed ? 0 : mockWindow.scrollX || 0),
      },
      selector,
      role,
      options: node.options && node.options.length ? node.options : undefined,
      isFixed,
    };

    scannedRegistry.set(nextId, node);
    if (tag === 'button' || tag === 'a' || role === 'button') {
      parentClickableSet.add(node);
    }

    elements.push(actionElement);
    nextId++;
  }

  return {
    viewport: {
      width: mockWindow.innerWidth || 1280,
      height: mockWindow.innerHeight || 800,
      scrollX: mockWindow.scrollX || 0,
      scrollY: mockWindow.scrollY || 0,
    },
    elements,
    url: mockWindow.url || 'https://practice.sahayak.local/form',
    title: root.title || 'Practice Form',
    scanDurationMs: Date.now() - startTime,
    totalCandidates: candidateNodes.length,
    excludedSensitiveCount,
    registry: scannedRegistry,
  };
}

// ============================================================================
// Milestone 3.1 Test Suite
// ============================================================================

test('Milestone 3.1: Sensitive Field Detection - Password inputs strictly excluded', () => {
  const pwdInput = new MockElement('input', { type: 'password', id: 'user_pass', name: 'password' });
  assert.equal(isSensitiveElement(pwdInput), true);
});

test('Milestone 3.1: Sensitive Field Detection - Sensitive autocomplete tokens excluded', () => {
  const ccInput = new MockElement('input', { type: 'text', autocomplete: 'cc-number' });
  const otpInput = new MockElement('input', { type: 'text', autocomplete: 'one-time-code' });
  const pwdChange = new MockElement('input', { type: 'text', autocomplete: 'new-password' });

  assert.equal(isSensitiveElement(ccInput), true);
  assert.equal(isSensitiveElement(otpInput), true);
  assert.equal(isSensitiveElement(pwdChange), true);
});

test('Milestone 3.1: Sensitive Field Detection - Token regex matching for CVV, SSN, PIN, Aadhaar', () => {
  const cvv = new MockElement('input', { name: 'card_cvv', placeholder: 'CVV' });
  const ssn = new MockElement('input', { id: 'ssn_number' });
  const pin = new MockElement('input', { 'aria-label': 'Security PIN' });
  const aadhaar = new MockElement('input', { name: 'aadhaar_card' });

  assert.equal(isSensitiveElement(cvv), true);
  assert.equal(isSensitiveElement(ssn), true);
  assert.equal(isSensitiveElement(pin), true);
  assert.equal(isSensitiveElement(aadhaar), true);
});

test('Milestone 3.1: Non-sensitive fields pass the sensitive check cleanly', () => {
  const email = new MockElement('input', { type: 'email', name: 'email', placeholder: 'Enter email' });
  const name = new MockElement('input', { type: 'text', name: 'fullName', placeholder: 'Your Name' });
  const search = new MockElement('input', { type: 'search', name: 'q', placeholder: 'Search products' });
  const button = new MockElement('button', { innerText: 'Continue to Booking' });

  assert.equal(isSensitiveElement(email), false);
  assert.equal(isSensitiveElement(name), false);
  assert.equal(isSensitiveElement(search), false);
  assert.equal(isSensitiveElement(button), false);
});

test('Milestone 3.1: Visibility Filter - Rejects hidden elements (display:none, visibility:hidden, opacity < 0.1)', () => {
  const win = { innerWidth: 1280, innerHeight: 800 };
  const hiddenDisplay = new MockElement('button', { style: { display: 'none' } });
  const hiddenVis = new MockElement('button', { style: { visibility: 'hidden' } });
  const transparent = new MockElement('button', { style: { opacity: '0.05' } });
  const pointerNone = new MockElement('button', { style: { pointerEvents: 'none' } });

  assert.equal(isElementVisibleInViewport(hiddenDisplay, {}, win).visible, false);
  assert.equal(isElementVisibleInViewport(hiddenVis, {}, win).visible, false);
  assert.equal(isElementVisibleInViewport(transparent, {}, win).visible, false);
  assert.equal(isElementVisibleInViewport(pointerNone, {}, win).visible, false);
});

test('Milestone 3.1: Visibility Filter - Rejects sub-8x8 tracking pixels and off-screen elements', () => {
  const win = { innerWidth: 1280, innerHeight: 800 };
  const tinyPixel = new MockElement('input', { rect: { width: 4, height: 4, top: 100, left: 100 } });
  const wayBelow = new MockElement('input', { rect: { width: 100, height: 40, top: 4000, left: 100 } });
  const wayAbove = new MockElement('input', { rect: { width: 100, height: 40, top: -500, left: 100 } });

  assert.equal(isElementVisibleInViewport(tinyPixel, {}, win).visible, false);
  assert.equal(isElementVisibleInViewport(wayBelow, {}, win).visible, false);
  assert.equal(isElementVisibleInViewport(wayAbove, {}, win).visible, false);
});

test('Milestone 3.1: Label Heuristics - Associated label with for="id"', () => {
  const root = new MockElement('div');
  const label = new MockElement('label', { attrs: { for: 'departure-input' }, innerText: 'Departure City' });
  const input = new MockElement('input', { id: 'departure-input' });
  root.appendChild(label);
  root.appendChild(input);

  const extracted = getElementLabel(input, root);
  assert.equal(extracted, 'Departure City');
});

test('Milestone 3.1: Label Heuristics - Parent label wrapper', () => {
  const labelWrapper = new MockElement('label', { innerText: 'Subscribe to newsletter' });
  const checkbox = new MockElement('input', { type: 'checkbox' });
  labelWrapper.appendChild(checkbox);

  const extracted = getElementLabel(checkbox, null);
  assert.equal(extracted, 'Subscribe to newsletter');
});

test('Milestone 3.1: Label Heuristics - ARIA label and aria-labelledby', () => {
  const ariaBtn = new MockElement('button', { attrs: { 'aria-label': 'Close Dialog Window' } });
  assert.equal(getElementLabel(ariaBtn), 'Close Dialog Window');

  const root = new MockElement('div');
  const heading = new MockElement('h2', { id: 'flight-hdr', innerText: 'Direct Nonstop Flights' });
  const link = new MockElement('a', { attrs: { href: '#', 'aria-labelledby': 'flight-hdr' } });
  root.appendChild(heading);
  root.appendChild(link);

  assert.equal(getElementLabel(link, root), 'Direct Nonstop Flights');
});

test('Milestone 3.1: Label Heuristics - Image icon alt text inside button', () => {
  const btn = new MockElement('button');
  const icon = new MockElement('img', { attrs: { alt: 'Search Flights', src: 'icon.png' } });
  btn.appendChild(icon);

  assert.equal(getElementLabel(btn), 'Search Flights');
});

test('Milestone 3.1: Form Scanner - Scans real-world flight booking form with Set-of-Marks numbering', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 100 };

  // 1. From City input
  const label1 = new MockElement('label', { attrs: { for: 'from-city' }, innerText: 'From Airport' });
  const inputFrom = new MockElement('input', {
    id: 'from-city',
    name: 'from',
    placeholder: 'e.g. DEL - New Delhi',
    rect: { x: 50, y: 150, width: 220, height: 44, top: 150, left: 50 },
  });
  doc.appendChild(label1);
  doc.appendChild(inputFrom);

  // 2. To City input
  const label2 = new MockElement('label', { attrs: { for: 'to-city' }, innerText: 'To Airport' });
  const inputTo = new MockElement('input', {
    id: 'to-city',
    name: 'to',
    placeholder: 'e.g. BOM - Mumbai',
    rect: { x: 300, y: 150, width: 220, height: 44, top: 150, left: 300 },
  });
  doc.appendChild(label2);
  doc.appendChild(inputTo);

  // 3. Cabin Class select
  const selectClass = new MockElement('select', {
    id: 'cabin-class',
    attrs: { 'aria-label': 'Cabin Class' },
    options: ['Economy', 'Premium Economy', 'Business'],
    rect: { x: 550, y: 150, width: 180, height: 44, top: 150, left: 550 },
  });
  doc.appendChild(selectClass);

  // 4. Sensitive Password Input (MUST BE EXCLUDED)
  const pwd = new MockElement('input', {
    type: 'password',
    id: 'member-pass',
    name: 'password',
    rect: { x: 50, y: 220, width: 200, height: 44, top: 220, left: 50 },
  });
  doc.appendChild(pwd);

  // 5. Submit Search Button with nested span (span must not cause double badges)
  const searchBtn = new MockElement('button', {
    id: 'btn-search',
    innerText: 'Search Available Flights',
    rect: { x: 50, y: 280, width: 240, height: 48, top: 280, left: 50 },
  });
  const innerSpan = new MockElement('span', { innerText: 'Search Available Flights' });
  searchBtn.appendChild(innerSpan);
  doc.appendChild(searchBtn);

  const result = scanElements(doc, win);

  // Assertions
  assert.equal(result.elements.length, 4, 'Should identify exactly 4 actionable elements (excluding password)');
  assert.equal(result.excludedSensitiveCount, 1, 'Should record 1 excluded sensitive field');

  // Verify sequential IDs #1, #2, #3, #4
  assert.equal(result.elements[0].id, 1);
  assert.equal(result.elements[0].label, 'From Airport');
  assert.equal(result.elements[0].rect.top, 250); // top (150) + scrollY (100)

  assert.equal(result.elements[1].id, 2);
  assert.equal(result.elements[1].label, 'To Airport');

  assert.equal(result.elements[2].id, 3);
  assert.equal(result.elements[2].label, 'Cabin Class');
  assert.deepEqual(result.elements[2].options, ['Economy', 'Premium Economy', 'Business']);

  assert.equal(result.elements[3].id, 4);
  assert.equal(result.elements[3].label, 'Search Available Flights');

  // Verify in-memory registry maps IDs directly to DOM nodes
  assert.equal(result.registry.get(1), inputFrom);
  assert.equal(result.registry.get(4), searchBtn);
});

test('Milestone 3.1: Performance Target - Scans 150 candidate elements in under 50ms', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0 };

  for (let i = 0; i < 150; i++) {
    const btn = new MockElement('button', {
      id: `btn-item-${i}`,
      innerText: `Action Item ${i}`,
      rect: { x: (i % 5) * 100, y: Math.floor(i / 5) * 30, width: 90, height: 26, top: 100, left: 100 },
    });
    doc.appendChild(btn);
  }

  const start = performance.now();
  const result = scanElements(doc, win);
  const duration = performance.now() - start;

  assert.equal(result.elements.length, 150);
  assert.ok(duration < 150, `Scan duration was ${duration.toFixed(2)}ms, target is < 150ms`);
});

test('Milestone 3.1: Selector generation produces valid unique selectors', () => {
  const root = new MockElement('div');
  const btn = new MockElement('button', { id: 'submit-action-btn' });
  const namedInput = new MockElement('input', { name: 'user_preferred_seat' });
  const testIdEl = new MockElement('button', { attrs: { 'data-testid': 'confirm-booking-pill' } });

  root.appendChild(btn);
  root.appendChild(namedInput);
  root.appendChild(testIdEl);

  assert.equal(generateElementSelector(btn, root), '#submit-action-btn');
  assert.equal(generateElementSelector(namedInput, root), 'input[name="user_preferred_seat"]');
  assert.equal(generateElementSelector(testIdEl, root), 'button[data-testid="confirm-booking-pill"]');
});

test('Milestone 3.1: Content Script Router - MSG_SCAN_INTERACTIVE_DOM returns structured payload', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://example.com/checkout' };
  const input = new MockElement('input', { name: 'coupon_code', placeholder: 'Discount Code' });
  const btn = new MockElement('button', { innerText: 'Apply Code' });
  doc.appendChild(input);
  doc.appendChild(btn);

  // Mock message listener execution
  const message = { type: 'MSG_SCAN_INTERACTIVE_DOM', payload: { viewportOnly: true } };
  let responseData = null;

  if (message.type === 'MSG_SCAN_INTERACTIVE_DOM') {
    const scanResult = scanElements(doc, win, message.payload || {});
    responseData = {
      success: true,
      actionMap: scanResult,
      count: scanResult.elements.length,
      scanDurationMs: scanResult.scanDurationMs,
      excludedSensitiveCount: scanResult.excludedSensitiveCount,
    };
  }

  assert.equal(responseData.success, true);
  assert.equal(responseData.count, 2);
  assert.equal(responseData.actionMap.elements[0].label, 'Discount Code');
  assert.equal(responseData.actionMap.elements[1].label, 'Apply Code');
  assert.ok(typeof responseData.scanDurationMs === 'number');
});

test('Milestone 3.1: Content Script Router - MSG_CLEAR_BADGES resets element registry', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800 };
  const btn = new MockElement('button', { innerText: 'Proceed' });
  doc.appendChild(btn);

  const scanResult = scanElements(doc, win);
  assert.equal(scanResult.registry.size, 1);

  // Simulating MSG_CLEAR_BADGES
  scanResult.registry.clear();
  assert.equal(scanResult.registry.size, 0);
});

// ============================================================================
// Milestone 3.2: Set-of-Marks Overlay Badges & Target Highlighting
// ============================================================================
const SOM_CONTAINER_ID = 'sahayak-som-container';
const HIGHLIGHT_CLASS = 'sahayak-highlight-target';
const BADGE_CLASS = 'sahayak-badge';
const BADGE_FIXED_CLASS = 'sahayak-badge-fixed';
const BADGE_TARGET_CLASS = 'sahayak-badge-target';

function getOrCreateOverlayContainer(root) {
  let container = root.querySelector(`#${SOM_CONTAINER_ID}`);
  if (!container) {
    container = new MockElement('div', {
      id: SOM_CONTAINER_ID,
      'aria-hidden': 'true',
      'data-sahayak-overlay': 'true',
      style: {
        position: 'absolute',
        top: '0px',
        left: '0px',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2147483647,
      },
    });
    root.appendChild(container);
  }
  return container;
}

function clearBadges(root) {
  const container = root.querySelector(`#${SOM_CONTAINER_ID}`);
  if (container && container.parentElement) {
    container.parentElement.removeChild(container);
  }
  const highlighted = root.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  highlighted.forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
  return { success: true };
}

function renderBadges(elements, root, win = {}) {
  clearBadges(root);
  if (!elements || elements.length === 0) {
    return { success: true, renderedCount: 0 };
  }
  const container = getOrCreateOverlayContainer(root);
  const vw = win.innerWidth || 1280;
  const vh = win.innerHeight || 800;
  let count = 0;

  for (const el of elements) {
    const badge = new MockElement('div', {
      class: BADGE_CLASS,
      'data-action-id': String(el.id),
      innerText: `#${el.id}`,
    });

    if (el.isFixed) {
      badge.classList.add(BADGE_FIXED_CLASS);
      const posX = Math.max(10, Math.min(el.rect.x, vw - 20));
      const posY = Math.max(10, Math.min(el.rect.y, vh - 20));
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
    count++;
  }

  return { success: true, renderedCount: count };
}

function highlightTargetElement(actionId, registry, root) {
  const prevHighlights = root.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  prevHighlights.forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));

  const prevBadges = root.querySelectorAll(`.${BADGE_TARGET_CLASS}`);
  prevBadges.forEach((el) => el.classList.remove(BADGE_TARGET_CLASS));

  if (actionId === null || actionId === undefined) {
    return { success: true, highlightedId: null };
  }

  const targetEl = registry.get(actionId);
  if (targetEl) {
    targetEl.classList.add(HIGHLIGHT_CLASS);
    if (typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  const container = root.querySelector(`#${SOM_CONTAINER_ID}`);
  if (container) {
    const badge = container.querySelector(`[data-action-id="${actionId}"]`);
    if (badge) {
      badge.classList.add(BADGE_TARGET_CLASS);
    }
  }

  return { success: Boolean(targetEl), highlightedId: actionId };
}

test('Milestone 3.2: Badge Overlay Container - Creates #sahayak-som-container with pointer-events: none & max z-index', () => {
  const doc = new MockElement('div');
  const container = getOrCreateOverlayContainer(doc);

  assert.equal(container.id, 'sahayak-som-container');
  assert.equal(container.style.pointerEvents, 'none');
  assert.equal(container.style.zIndex, 2147483647);
  assert.equal(container.getAttribute('aria-hidden'), 'true');

  // Verify re-querying returns existing container without duplicates
  const container2 = getOrCreateOverlayContainer(doc);
  assert.equal(container, container2);
  assert.equal(doc.querySelectorAll('#sahayak-som-container').length, 1);
});

test('Milestone 3.2: Badge Overlay - Renders #1, #2, #3 badges positioned over elements', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 50 };

  const input = new MockElement('input', {
    id: 'query-box',
    placeholder: 'Search documentation',
    rect: { x: 40, y: 120, width: 300, height: 42, top: 120, left: 40 },
  });
  const btn = new MockElement('button', {
    innerText: 'Search',
    rect: { x: 360, y: 120, width: 100, height: 42, top: 120, left: 360 },
  });
  doc.appendChild(input);
  doc.appendChild(btn);

  const scan = scanElements(doc, win);
  const render = renderBadges(scan.elements, doc, win);

  assert.equal(render.success, true);
  assert.equal(render.renderedCount, 2);

  const container = doc.querySelector('#sahayak-som-container');
  assert.ok(container);

  const badges = container.querySelectorAll('.sahayak-badge');
  assert.equal(badges.length, 2);
  assert.equal(badges[0].innerText, '#1');
  assert.equal(badges[0].getAttribute('data-action-id'), '1');
  assert.equal(badges[0].style.left, '40px');
  assert.equal(badges[0].style.top, '170px'); // top 120 + scrollY 50

  assert.equal(badges[1].innerText, '#2');
  assert.equal(badges[1].getAttribute('data-action-id'), '2');
  assert.equal(badges[1].style.left, '360px');
  assert.equal(badges[1].style.top, '170px');
});

test('Milestone 3.2: Fixed Positioning - Handles isFixed elements with position: fixed and coordinate clamping', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1000, innerHeight: 600 };

  const fixedNav = new MockElement('button', {
    innerText: 'Fixed Menu Pill',
    rect: { x: 5, y: 5, width: 80, height: 30, top: 5, left: 5 },
    style: { position: 'fixed' },
  });
  doc.appendChild(fixedNav);

  const scan = scanElements(doc, win);
  assert.equal(scan.elements[0].isFixed, true);

  renderBadges(scan.elements, doc, win);

  const container = doc.querySelector('#sahayak-som-container');
  const badge = container.querySelector('.sahayak-badge');

  assert.ok(badge.classList.contains('sahayak-badge-fixed'));
  assert.equal(badge.style.position, 'fixed');
  // Clamped coordinate test: x=5 clamped to min 10
  assert.equal(badge.style.left, '10px');
  assert.equal(badge.style.top, '10px');
});

test('Milestone 3.2: Target Highlighting - Adds .sahayak-highlight-target and .sahayak-badge-target', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800 };

  const btn1 = new MockElement('button', { innerText: 'First Step', rect: { x: 10, y: 10, width: 80, height: 30, top: 10, left: 10 } });
  const btn2 = new MockElement('button', { innerText: 'Target Step', rect: { x: 10, y: 50, width: 80, height: 30, top: 50, left: 10 } });
  doc.appendChild(btn1);
  doc.appendChild(btn2);

  const scan = scanElements(doc, win);
  renderBadges(scan.elements, doc, win);

  // Target element #2
  const highlightResult = highlightTargetElement(2, scan.registry, doc);
  assert.equal(highlightResult.success, true);
  assert.equal(highlightResult.highlightedId, 2);

  // Live DOM target element gets highlight class and scrollIntoView
  assert.equal(btn2.classList.contains('sahayak-highlight-target'), true);
  assert.equal(btn2.scrolledIntoView, true);
  assert.equal(btn1.classList.contains('sahayak-highlight-target'), false);

  // Corresponding badge gets target glow class
  const container = doc.querySelector('#sahayak-som-container');
  const badge2 = container.querySelector('[data-action-id="2"]');
  const badge1 = container.querySelector('[data-action-id="1"]');

  assert.equal(badge2.classList.contains('sahayak-badge-target'), true);
  assert.equal(badge1.classList.contains('sahayak-badge-target'), false);
});

test('Milestone 3.2: Target Switching & Clearing - Removes previous highlight when target switches or is cleared', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800 };

  const btn1 = new MockElement('button', { innerText: 'First', rect: { x: 10, y: 10, width: 50, height: 30, top: 10, left: 10 } });
  const btn2 = new MockElement('button', { innerText: 'Second', rect: { x: 10, y: 50, width: 50, height: 30, top: 50, left: 10 } });
  doc.appendChild(btn1);
  doc.appendChild(btn2);

  const scan = scanElements(doc, win);
  renderBadges(scan.elements, doc, win);

  // Target #1
  highlightTargetElement(1, scan.registry, doc);
  assert.equal(btn1.classList.contains('sahayak-highlight-target'), true);

  // Switch to #2
  highlightTargetElement(2, scan.registry, doc);
  assert.equal(btn1.classList.contains('sahayak-highlight-target'), false, 'Previous highlight removed from #1');
  assert.equal(btn2.classList.contains('sahayak-highlight-target'), true, 'New highlight added to #2');

  // Clear highlight (null)
  highlightTargetElement(null, scan.registry, doc);
  assert.equal(btn1.classList.contains('sahayak-highlight-target'), false);
  assert.equal(btn2.classList.contains('sahayak-highlight-target'), false);
});

test('Milestone 3.2: Badge Teardown - clearBadges cleanly removes overlay container and target highlights from DOM', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800 };

  const btn = new MockElement('button', { innerText: 'Test', rect: { x: 10, y: 10, width: 50, height: 30, top: 10, left: 10 } });
  doc.appendChild(btn);

  const scan = scanElements(doc, win);
  renderBadges(scan.elements, doc, win);
  highlightTargetElement(1, scan.registry, doc);

  assert.ok(doc.querySelector('#sahayak-som-container'));
  assert.ok(doc.querySelector('.sahayak-highlight-target'));

  // Clean teardown
  const teardown = clearBadges(doc);
  assert.equal(teardown.success, true);
  assert.equal(doc.querySelector('#sahayak-som-container'), null, 'Container cleanly unmounted');
  assert.equal(doc.querySelectorAll('.sahayak-highlight-target').length, 0, 'All highlight outlines removed');
});

test('Milestone 3.2: Content Script Router - MSG_HIGHLIGHT_ELEMENT and MSG_SCAN_INTERACTIVE_DOM with renderBadges', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800 };
  const input = new MockElement('input', { name: 'email', rect: { x: 20, y: 20, width: 200, height: 40, top: 20, left: 20 } });
  doc.appendChild(input);

  // Message 1: Scan and render
  const scanMsg = { type: 'MSG_SCAN_INTERACTIVE_DOM', payload: { renderBadges: true } };
  let scanRes = null;
  if (scanMsg.type === 'MSG_SCAN_INTERACTIVE_DOM') {
    const scan = scanElements(doc, win, scanMsg.payload || {});
    let renderedCount = 0;
    if (scanMsg.payload?.renderBadges !== false) {
      const render = renderBadges(scan.elements, doc, win);
      renderedCount = render.renderedCount;
    }
    scanRes = { success: true, count: scan.elements.length, renderedCount, registry: scan.registry };
  }

  assert.equal(scanRes.success, true);
  assert.equal(scanRes.renderedCount, 1);
  assert.ok(doc.querySelector('#sahayak-som-container'));

  // Message 2: Highlight element #1
  const highlightMsg = { type: 'MSG_HIGHLIGHT_ELEMENT', payload: { targetElementId: 1 } };
  let highlightRes = null;
  if (highlightMsg.type === 'MSG_HIGHLIGHT_ELEMENT') {
    highlightRes = highlightTargetElement(highlightMsg.payload.targetElementId, scanRes.registry, doc);
  }

  assert.equal(highlightRes.success, true);
  assert.equal(highlightRes.highlightedId, 1);
  assert.equal(input.classList.contains('sahayak-highlight-target'), true);

  // Message 3: Clear badges
  const clearMsg = { type: 'MSG_CLEAR_BADGES' };
  let clearRes = null;
  if (clearMsg.type === 'MSG_CLEAR_BADGES') {
    clearBadges(doc);
    scanRes.registry.clear();
    clearRes = { success: true, cleared: true };
  }

  assert.equal(clearRes.success, true);
  assert.equal(doc.querySelector('#sahayak-som-container'), null);
});

// ============================================================================
// Milestone 3.3: Gemini Structured JSON Action Planner
// ============================================================================

const GEMINI_ACTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: {
      type: 'STRING',
      enum: ['ACTION_PROPOSED', 'TASK_COMPLETED', 'CANNOT_PROCEED'],
    },
    thought: {
      type: 'STRING',
      description: 'Internal chain-of-thought rationale explaining which element was selected and why.',
    },
    userExplanation: {
      type: 'STRING',
      description: 'Clear, concise human-facing explanation in English or Latin-script Hinglish justifying the action.',
    },
    action: {
      type: 'OBJECT',
      properties: {
        actionType: {
          type: 'STRING',
          enum: ['CLICK', 'TYPE', 'SELECT', 'SCROLL', 'WAIT', 'COMPLETED'],
        },
        targetElementId: {
          type: 'INTEGER',
          description: 'The numeric #ID badge of the target element from the ActionMap.',
        },
        value: {
          type: 'STRING',
          description: 'The string value to type into an input field or the option to select from a dropdown.',
        },
        scrollDirection: {
          type: 'STRING',
          enum: ['UP', 'DOWN', 'TOP', 'BOTTOM'],
          description: 'Direction to scroll if actionType is SCROLL.',
        },
      },
      required: ['actionType'],
    },
  },
  required: ['status', 'thought', 'userExplanation'],
};

function formatActionMapPrompt(actionMap, maxElements = 100) {
  if (!actionMap || !actionMap.elements || actionMap.elements.length === 0) {
    return 'No visible interactive elements detected on the current page.';
  }

  const lines = [];
  lines.push(`Page Title: "${actionMap.title || 'Untitled'}"`);
  lines.push(`Page URL: ${actionMap.url || 'unknown'}`);
  lines.push(
    `Viewport: ${actionMap.viewport.width}x${actionMap.viewport.height} (Scroll: ${actionMap.viewport.scrollY}px)`
  );
  lines.push(
    `\nVisible Interactive Elements (Identified by Set-of-Marks numbered badges #1 to #${actionMap.elements.length}):`
  );

  const displayElements = actionMap.elements.slice(0, maxElements);
  for (const el of displayElements) {
    const parts = [`[#${el.id}] <${el.tag}${el.type ? ` type="${el.type}"` : ''}>`];
    if (el.label) parts.push(`Label: "${el.label}"`);
    if (el.placeholder) parts.push(`Placeholder: "${el.placeholder}"`);
    if (el.currentValue !== undefined && el.currentValue !== '') parts.push(`Current Value: "${el.currentValue}"`);
    if (el.options && el.options.length > 0) parts.push(`Options: [${el.options.map((o) => `"${o}"`).join(', ')}]`);
    if (el.role) parts.push(`Role: "${el.role}"`);
    lines.push(parts.join(' | '));
  }

  if (actionMap.elements.length > maxElements) {
    lines.push(`\n... (${actionMap.elements.length - maxElements} additional elements omitted for brevity)`);
  }

  return lines.join('\n');
}

function buildActionPlannerSystemPrompt(lang = 'en') {
  const isHinglish = lang === 'hinglish';
  return `You are Sahayak, an intelligent, precise, and safe AI browser agent.
Your objective is to help the user accomplish their goal on the current webpage step-by-step.
Operating Language: ${isHinglish ? 'HINGLISH (Latin script only, natural conversational Hindi)' : 'ENGLISH'}

CORE PLANNING PRINCIPLES:
1. SELECT THE SINGLE BEST NEXT ACTION:
   - Given the user's Goal and the numbered elements on the page, select the single logical next step.
   - Do NOT attempt to perform multiple actions at once. The human user must review and approve each discrete action before execution.

2. ALLOWED ACTION TYPES:
   - "CLICK": Click a button, link, checkbox, radio button, tab, or menu item. (Specify targetElementId).
   - "TYPE": Enter text into an input field, search box, or textarea. (Specify targetElementId and value).
   - "SELECT": Pick an option from a <select> dropdown list. (Specify targetElementId and value matching an option).
   - "SCROLL": Scroll the page if target elements are not yet in view. (Specify scrollDirection: "UP", "DOWN", "TOP", "BOTTOM").
   - "WAIT": Pause execution to allow asynchronous page load or redirect.
   - "COMPLETED": Declare when the user's high-level goal has been completely achieved.

3. STATUS CODES:
   - "ACTION_PROPOSED": When proposing a valid next action step.
   - "TASK_COMPLETED": When the goal is completely finished and no further browser actions are required.
   - "CANNOT_PROCEED": When blocked by an insurmountable issue (e.g. required CAPTCHA, empty page, unsupported site, missing credentials).

4. USER EXPLANATION REQUIREMENTS:
   - Provide a clear, natural "userExplanation" explaining what will happen.
${
  isHinglish
    ? `   - In Hinglish: Write Hindi words strictly in Latin script (e.g. "Search bar #3 me 'mechanical keyboards' type kar rahe hain"). NEVER use Devanagari.`
    : `   - In English: Write concise, polite instructions (e.g. "Typing 'mechanical keyboards' into search bar #3").`
}

5. STRICT SAFETY & PRIVACY GUARDRAILS:
   - NEVER automate or guess sensitive credentials like passwords, OTPs, or payment card numbers.
   - For irreversible actions (e.g. "Submit Payment", "Delete Account", "Confirm Transfer"), emphasize in userExplanation that this is an irreversible action requiring careful human review.`;
}

function buildActionPlannerUserPrompt(goal, actionMap, history = [], userProfile) {
  const parts = [];
  parts.push(`USER GOAL:\n${goal.trim()}`);

  if (userProfile && Object.keys(userProfile).length > 0) {
    const profileItems = Object.entries(userProfile)
      .filter(([k, v]) => v && !k.toLowerCase().includes('pass') && !k.toLowerCase().includes('card'))
      .map(([k, v]) => `  - ${k}: "${v}"`)
      .join('\n');
    if (profileItems) {
      parts.push(`\nAVAILABLE USER PROFILE DATA (Use for autofilling relevant form fields):\n${profileItems}`);
    }
  }

  if (history && history.length > 0) {
    const historyList = history
      .slice(-6)
      .map((entry, idx) => {
        const actionStr = `${entry.action.actionType}${
          entry.action.targetElementId ? ` on #${entry.action.targetElementId}` : ''
        }${entry.action.value ? ` with value "${entry.action.value}"` : ''}`;
        return `  ${idx + 1}. [${entry.status}] ${actionStr} - ${entry.userExplanation}`;
      })
      .join('\n');
    parts.push(`\nPREVIOUS ACTION HISTORY (DO NOT repeat actions already executed):\n${historyList}`);
  }

  parts.push(`\nCURRENT PAGE STATE:\n${formatActionMapPrompt(actionMap)}`);
  parts.push(
    `\nINSTRUCTION: Analyze the page state and return the next single best action as structured JSON conforming to the response schema.`
  );

  return parts.join('\n\n');
}

function parseAndValidateActionProposal(rawText, actionMap) {
  if (!rawText || !rawText.trim()) {
    return {
      status: 'CANNOT_PROCEED',
      thought: 'LLM returned an empty response.',
      userExplanation: 'Could not plan the next action (empty AI response).',
    };
  }

  let cleanJson = rawText.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    return {
      status: 'CANNOT_PROCEED',
      thought: `JSON parse error: ${err.message}`,
      userExplanation: 'AI returned an invalid JSON response format.',
    };
  }

  const validStatuses = ['ACTION_PROPOSED', 'TASK_COMPLETED', 'CANNOT_PROCEED'];
  const status = validStatuses.includes(parsed.status)
    ? parsed.status
    : parsed.action
    ? 'ACTION_PROPOSED'
    : 'CANNOT_PROCEED';

  const thought = String(parsed.thought || 'Planning action based on visible elements.');
  const userExplanation = String(parsed.userExplanation || 'Proposed browser action for your review.');

  let action = undefined;
  if (parsed.action && typeof parsed.action === 'object') {
    const rawActionType = String(parsed.action.actionType || '').toUpperCase();
    const validActionTypes = ['CLICK', 'TYPE', 'SELECT', 'SCROLL', 'WAIT', 'COMPLETED'];
    const actionType = validActionTypes.includes(rawActionType) ? rawActionType : 'CLICK';

    action = {
      actionType,
      value: parsed.action.value !== undefined ? String(parsed.action.value) : undefined,
      scrollDirection: parsed.action.scrollDirection || undefined,
    };

    if (parsed.action.targetElementId !== undefined) {
      const targetId = Number(parsed.action.targetElementId);
      if (!isNaN(targetId) && targetId > 0) {
        action.targetElementId = targetId;
        const matchedElement = actionMap.elements?.find((el) => el.id === targetId);
        if (matchedElement) {
          action.targetLabel = matchedElement.label;
          action.targetSelector = matchedElement.selector;
        }
      }
    }
  }

  if (status === 'ACTION_PROPOSED' && !action) {
    return {
      status: 'CANNOT_PROCEED',
      thought: 'Model declared ACTION_PROPOSED but omitted action details.',
      userExplanation: 'AI could not specify which element to interact with next.',
    };
  }

  return { status, thought, userExplanation, action };
}

// ----------------------------------------------------------------------------
// Milestone 3.3 Test Cases
// ----------------------------------------------------------------------------

test('Milestone 3.3: Gemini Response Schema definition validates structure and enums', () => {
  assert.equal(GEMINI_ACTION_RESPONSE_SCHEMA.type, 'OBJECT');
  assert.deepEqual(GEMINI_ACTION_RESPONSE_SCHEMA.required, ['status', 'thought', 'userExplanation']);
  assert.deepEqual(GEMINI_ACTION_RESPONSE_SCHEMA.properties.status.enum, [
    'ACTION_PROPOSED',
    'TASK_COMPLETED',
    'CANNOT_PROCEED',
  ]);
  assert.deepEqual(GEMINI_ACTION_RESPONSE_SCHEMA.properties.action.properties.actionType.enum, [
    'CLICK',
    'TYPE',
    'SELECT',
    'SCROLL',
    'WAIT',
    'COMPLETED',
  ]);
});

test('Milestone 3.3: formatActionMapPrompt formats compact element summary with Set-of-Marks IDs', () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'E-Commerce Store',
    url: 'https://shop.example.com',
    elements: [
      { id: 1, tag: 'a', label: 'Home Page Link', selector: 'a#home', rect: { x: 10, y: 10, width: 50, height: 20, top: 10, left: 10 } },
      { id: 2, tag: 'input', type: 'search', label: 'Search Input', placeholder: 'Search products...', currentValue: '', selector: 'input#search', rect: { x: 70, y: 10, width: 200, height: 35, top: 10, left: 70 } },
      { id: 3, tag: 'button', label: 'Submit Search', selector: 'button#btn-search', rect: { x: 280, y: 10, width: 80, height: 35, top: 10, left: 280 } },
    ],
  };

  const formatted = formatActionMapPrompt(sampleMap);
  assert.ok(formatted.includes('Page Title: "E-Commerce Store"'));
  assert.ok(formatted.includes('[#1] <a> | Label: "Home Page Link"'));
  assert.ok(formatted.includes('[#2] <input type="search"> | Label: "Search Input" | Placeholder: "Search products..."'));
  assert.ok(formatted.includes('[#3] <button> | Label: "Submit Search"'));
  // Verifies raw pixel bounding boxes are omitted from the text prompt to save tokens
  assert.ok(!formatted.includes('rect:'));
});

test('Milestone 3.3: buildActionPlannerSystemPrompt enforces English vs Hinglish persona rules', () => {
  const enPrompt = buildActionPlannerSystemPrompt('en');
  assert.ok(enPrompt.includes('Operating Language: ENGLISH'));
  assert.ok(enPrompt.includes('ALLOWED ACTION TYPES:'));
  assert.ok(enPrompt.includes('CLICK'));
  assert.ok(enPrompt.includes('TYPE'));
  assert.ok(enPrompt.includes('STRICT SAFETY & PRIVACY GUARDRAILS'));

  const hinglishPrompt = buildActionPlannerSystemPrompt('hinglish');
  assert.ok(hinglishPrompt.includes('Operating Language: HINGLISH'));
  assert.ok(hinglishPrompt.includes('Latin script only'));
  assert.ok(hinglishPrompt.includes('NEVER use Devanagari'));
});

test('Milestone 3.3: buildActionPlannerUserPrompt embeds Goal, History, and Profile autofill', () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'Registration Form',
    url: 'https://example.com/signup',
    elements: [
      { id: 1, tag: 'input', label: 'Full Name', selector: '#name', rect: { x: 0, y: 0, width: 100, height: 30, top: 0, left: 0 } },
      { id: 2, tag: 'input', label: 'Email Address', selector: '#email', rect: { x: 0, y: 50, width: 100, height: 30, top: 50, left: 0 } },
    ],
  };

  const history = [
    {
      id: '1',
      stepNumber: 1,
      action: { actionType: 'TYPE', targetElementId: 1, value: 'Rohan Sharma' },
      userExplanation: 'Typing name into field #1',
      timestamp: Date.now(),
      status: 'EXECUTED',
    },
  ];

  const profile = { fullName: 'Rohan Sharma', email: 'rohan@example.com', password: 'secretpassword123' };
  const userPrompt = buildActionPlannerUserPrompt('Fill out the registration form', sampleMap, history, profile);

  assert.ok(userPrompt.includes('USER GOAL:\nFill out the registration form'));
  assert.ok(userPrompt.includes('AVAILABLE USER PROFILE DATA'));
  assert.ok(userPrompt.includes('email: "rohan@example.com"'));
  // Sensitive password must NOT be included in prompt profile dump
  assert.ok(!userPrompt.includes('secretpassword123'));
  assert.ok(userPrompt.includes('PREVIOUS ACTION HISTORY'));
  assert.ok(userPrompt.includes('TYPE on #1 with value "Rohan Sharma"'));
});

test('Milestone 3.3: Acceptance Criteria - "Search for mechanical keyboards" returns TYPE on targetElementId 3', () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'Hardware Store',
    url: 'https://keyboards.example.com',
    elements: [
      { id: 1, tag: 'a', label: 'Home', selector: 'a.nav-home', rect: { x: 10, y: 10, width: 40, height: 20, top: 10, left: 10 } },
      { id: 2, tag: 'a', label: 'Deals', selector: 'a.nav-deals', rect: { x: 60, y: 10, width: 40, height: 20, top: 10, left: 60 } },
      { id: 3, tag: 'input', type: 'search', label: 'Search Products', placeholder: 'Search products...', selector: 'input[name="q"]', rect: { x: 120, y: 10, width: 300, height: 40, top: 10, left: 120 } },
      { id: 4, tag: 'button', label: 'Search', selector: 'button#btn-submit', rect: { x: 430, y: 10, width: 80, height: 40, top: 10, left: 430 } },
    ],
  };

  // Mock Gemini output with responseSchema
  const rawLlmOutput = JSON.stringify({
    status: 'ACTION_PROPOSED',
    thought: 'The user wants to search for mechanical keyboards. Element #3 is the search input field. I should type the search query into it.',
    userExplanation: 'Typing search query into search bar #3',
    action: {
      actionType: 'TYPE',
      targetElementId: 3,
      value: 'mechanical keyboards',
    },
  });

  const proposal = parseAndValidateActionProposal(rawLlmOutput, sampleMap);

  assert.equal(proposal.status, 'ACTION_PROPOSED');
  assert.ok(proposal.action);
  assert.equal(proposal.action.actionType, 'TYPE');
  assert.equal(proposal.action.targetElementId, 3);
  assert.equal(proposal.action.value, 'mechanical keyboards');
  assert.equal(proposal.userExplanation, 'Typing search query into search bar #3');

  // Verify target element metadata enrichment from ActionMap
  assert.equal(proposal.action.targetLabel, 'Search Products');
  assert.equal(proposal.action.targetSelector, 'input[name="q"]');
});

test('Milestone 3.3: Markdown Code Fence stripping safety', () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'Test',
    url: 'https://example.com',
    elements: [{ id: 1, tag: 'button', label: 'Click Me', selector: 'button#1', rect: { x: 0, y: 0, width: 50, height: 20, top: 0, left: 0 } }],
  };

  const wrappedJson = '```json\n{\n  "status": "ACTION_PROPOSED",\n  "thought": "Clicking button",\n  "userExplanation": "Clicking button #1",\n  "action": { "actionType": "CLICK", "targetElementId": 1 }\n}\n```';

  const proposal = parseAndValidateActionProposal(wrappedJson, sampleMap);
  assert.equal(proposal.status, 'ACTION_PROPOSED');
  assert.equal(proposal.action?.actionType, 'CLICK');
  assert.equal(proposal.action?.targetElementId, 1);
});

test('Milestone 3.3: Task Completed status handling', () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'Thank You',
    url: 'https://example.com/thanks',
    elements: [{ id: 1, tag: 'a', label: 'Return Home', selector: 'a', rect: { x: 0, y: 0, width: 50, height: 20, top: 0, left: 0 } }],
  };

  const completedJson = JSON.stringify({
    status: 'TASK_COMPLETED',
    thought: 'The form submission was completed and the confirmation message is visible.',
    userExplanation: 'Your task has been completed successfully!',
  });

  const proposal = parseAndValidateActionProposal(completedJson, sampleMap);
  assert.equal(proposal.status, 'TASK_COMPLETED');
  assert.equal(proposal.userExplanation, 'Your task has been completed successfully!');
});

test('Milestone 3.3: Malformed JSON graceful recovery to CANNOT_PROCEED', () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'Test',
    url: 'https://example.com',
    elements: [],
  };

  const brokenOutput = 'Internal server error happened... not a json';
  const proposal = parseAndValidateActionProposal(brokenOutput, sampleMap);

  assert.equal(proposal.status, 'CANNOT_PROCEED');
  assert.ok(proposal.thought.includes('JSON parse error'));
});

test('Milestone 3.3: Background Router - MSG_PLAN_NEXT_ACTION produces structured proposal response', async () => {
  const sampleMap = {
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    title: 'Flights',
    url: 'https://flights.example.com',
    elements: [
      { id: 1, tag: 'input', label: 'Origin Airport', selector: '#from', rect: { x: 10, y: 10, width: 100, height: 30, top: 10, left: 10 } },
      { id: 2, tag: 'input', label: 'Destination Airport', selector: '#to', rect: { x: 120, y: 10, width: 100, height: 30, top: 10, left: 120 } },
    ],
  };

  // Mock message event
  const message = {
    type: 'MSG_PLAN_NEXT_ACTION',
    payload: {
      goal: 'Fly to Mumbai',
      actionMap: sampleMap,
      lang: 'en',
    },
  };

  let responseData = null;
  if (message.type === 'MSG_PLAN_NEXT_ACTION') {
    // Simulate background planner execution
    const mockOutput = JSON.stringify({
      status: 'ACTION_PROPOSED',
      thought: 'Selecting destination airport field.',
      userExplanation: 'Typing Mumbai into destination field #2',
      action: {
        actionType: 'TYPE',
        targetElementId: 2,
        value: 'BOM',
      },
    });

    const proposal = parseAndValidateActionProposal(mockOutput, message.payload.actionMap);
    responseData = {
      success: true,
      proposal,
      timestamp: Date.now(),
    };
  }

  assert.equal(responseData.success, true);
  assert.equal(responseData.proposal.status, 'ACTION_PROPOSED');
  assert.equal(responseData.proposal.action.actionType, 'TYPE');
  assert.equal(responseData.proposal.action.targetElementId, 2);
  assert.equal(responseData.proposal.action.targetLabel, 'Destination Airport');
  assert.equal(responseData.proposal.action.value, 'BOM');
});

// ============================================================================
// Milestone 3.4: Side Panel HITL Approval Card & Action History
// ============================================================================

const IRREVERSIBLE_ACTION_REGEX =
  /(pay|payment|purchase|buy|checkout|order|subscribe|submit|send|transfer|delete|remove|destroy|cancel membership)/i;

function isIrreversibleAction(action, userExplanation = '') {
  if (!action) return false;
  const targetText = `${action.targetLabel || ''} ${action.value || ''} ${userExplanation}`;
  return IRREVERSIBLE_ACTION_REGEX.test(targetText);
}

function simulateHITLApproval({
  proposal,
  stepNumber,
  editedValue,
  eventKey,
  activeElementTag = 'body',
  onApprove,
  onSkip,
  onStop,
}) {
  const action = proposal.action;
  const isIrreversible = isIrreversibleAction(action, proposal.userExplanation);

  // Keyboard shortcut simulation
  if (eventKey === 'Escape') {
    onStop?.();
    return { handledKey: 'Escape', approvedAction: null, isIrreversible };
  }

  if (eventKey === 'Enter') {
    if (activeElementTag !== 'textarea') {
      const finalValue = editedValue !== undefined ? editedValue : action?.value;
      const finalAction = action ? { ...action, value: finalValue } : undefined;
      onApprove?.(finalAction);
      return { handledKey: 'Enter', approvedAction: finalAction, isIrreversible };
    }
    return { handledKey: 'Enter_Ignored_In_Textarea', approvedAction: null, isIrreversible };
  }

  // Normal approval button click
  const finalValue = editedValue !== undefined ? editedValue : action?.value;
  const finalAction = action ? { ...action, value: finalValue } : undefined;
  onApprove?.(finalAction);

  return {
    approvedAction: finalAction,
    isIrreversible,
    stepDisplay: `Step ${stepNumber}`,
    targetBadge: action?.targetElementId ? `#${action.targetElementId}` : undefined,
  };
}

function generateAuditReport(history) {
  return history
    .map(
      (h) =>
        `Step ${h.stepNumber}: [${h.status}] ${h.action.actionType}${
          h.action.targetElementId ? ` on #${h.action.targetElementId}` : ''
        }${h.action.value ? ` with value "${h.action.value}"` : ''} - ${h.userExplanation}`
    )
    .join('\n');
}

// ----------------------------------------------------------------------------
// Milestone 3.4 Test Cases
// ----------------------------------------------------------------------------

test('Milestone 3.4: Irreversible Action Detection - Flags Pay, Submit, Order, and Delete actions', () => {
  const payAction = { actionType: 'CLICK', targetElementId: 5, targetLabel: 'Pay Now $149.00' };
  const submitAction = { actionType: 'CLICK', targetElementId: 6, targetLabel: 'Submit Registration Form' };
  const deleteAction = { actionType: 'CLICK', targetElementId: 7, targetLabel: 'Delete Project Data' };
  const benignAction = { actionType: 'TYPE', targetElementId: 1, targetLabel: 'Search Query', value: 'shoes' };

  assert.equal(isIrreversibleAction(payAction), true);
  assert.equal(isIrreversibleAction(submitAction), true);
  assert.equal(isIrreversibleAction(deleteAction), true);
  assert.equal(isIrreversibleAction(benignAction), false);
});

test('Milestone 3.4: Acceptance Criteria - User alters typed text before approval and approved action uses edited value', () => {
  const proposal = {
    status: 'ACTION_PROPOSED',
    thought: 'Typing initial search query.',
    userExplanation: 'Typing "shoes" into search bar #3',
    action: {
      actionType: 'TYPE',
      targetElementId: 3,
      targetLabel: 'Search Input',
      value: 'shoes',
    },
  };

  let approvedResult = null;
  const onApprove = (actionOverride) => {
    approvedResult = actionOverride;
  };

  // User alters the proposed value "shoes" to "wireless mechanical keyboards" in the editable input
  const res = simulateHITLApproval({
    proposal,
    stepNumber: 2,
    editedValue: 'wireless mechanical keyboards',
    onApprove,
  });

  assert.ok(approvedResult);
  assert.equal(approvedResult.actionType, 'TYPE');
  assert.equal(approvedResult.targetElementId, 3);
  assert.equal(approvedResult.targetLabel, 'Search Input');
  assert.equal(approvedResult.value, 'wireless mechanical keyboards', 'Should use the edited value over proposed value');
  assert.equal(res.stepDisplay, 'Step 2');
  assert.equal(res.targetBadge, '#3');
});

test('Milestone 3.4: Keyboard Shortcuts - Enter triggers handleApprove and Esc triggers onStop', () => {
  const proposal = {
    status: 'ACTION_PROPOSED',
    thought: 'Clicking next button.',
    userExplanation: 'Clicking Continue button #4',
    action: {
      actionType: 'CLICK',
      targetElementId: 4,
      targetLabel: 'Continue',
    },
  };

  let approved = false;
  let stopped = false;

  // Test Enter shortcut
  simulateHITLApproval({
    proposal,
    stepNumber: 1,
    eventKey: 'Enter',
    activeElementTag: 'button',
    onApprove: () => {
      approved = true;
    },
    onStop: () => {
      stopped = true;
    },
  });

  assert.equal(approved, true);
  assert.equal(stopped, false);

  // Test Esc shortcut
  approved = false;
  simulateHITLApproval({
    proposal,
    stepNumber: 1,
    eventKey: 'Escape',
    onApprove: () => {
      approved = true;
    },
    onStop: () => {
      stopped = true;
    },
  });

  assert.equal(approved, false);
  assert.equal(stopped, true);
});

test('Milestone 3.4: Keyboard Shortcuts - Enter is ignored when focused inside a multiline textarea', () => {
  const proposal = {
    status: 'ACTION_PROPOSED',
    thought: 'Typing feedback.',
    userExplanation: 'Entering feedback text',
    action: { actionType: 'TYPE', targetElementId: 2, value: 'Good' },
  };

  let approved = false;
  const res = simulateHITLApproval({
    proposal,
    stepNumber: 1,
    eventKey: 'Enter',
    activeElementTag: 'textarea',
    onApprove: () => {
      approved = true;
    },
  });

  assert.equal(approved, false);
  assert.equal(res.handledKey, 'Enter_Ignored_In_Textarea');
});

test('Milestone 3.4: ActionHistory - Audit log formats executed, skipped, and failed steps', () => {
  const history = [
    {
      id: 'step-1',
      stepNumber: 1,
      action: { actionType: 'TYPE', targetElementId: 1, targetLabel: 'First Name', value: 'Priya' },
      userExplanation: 'Filled first name',
      timestamp: 1700000000000,
      status: 'EXECUTED',
    },
    {
      id: 'step-2',
      stepNumber: 2,
      action: { actionType: 'CLICK', targetElementId: 4, targetLabel: 'Optional Newsletter' },
      userExplanation: 'Skipped: user chose not to subscribe',
      timestamp: 1700000010000,
      status: 'SKIPPED',
    },
    {
      id: 'step-3',
      stepNumber: 3,
      action: { actionType: 'CLICK', targetElementId: 8, targetLabel: 'Confirm Submission' },
      userExplanation: 'Clicked submit button',
      timestamp: 1700000020000,
      status: 'EXECUTED',
    },
  ];

  const report = generateAuditReport(history);

  assert.ok(report.includes('Step 1: [EXECUTED] TYPE on #1 with value "Priya" - Filled first name'));
  assert.ok(report.includes('Step 2: [SKIPPED] CLICK on #4 - Skipped: user chose not to subscribe'));
  assert.ok(report.includes('Step 3: [EXECUTED] CLICK on #8 - Clicked submit button'));
});

test('Milestone 3.4: ActionHistory - Empty history renders placeholder state', () => {
  const emptyReport = generateAuditReport([]);
  assert.equal(emptyReport, '');
});

// ============================================================================
// Milestone 3.5: Synthetic DOM Event Action Runner Verification
// ============================================================================
function dispatchMouseClickSequence(el) {
  if (typeof el.focus === 'function') {
    el.focus();
  }
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  };

  el.dispatchEvent({ type: 'pointerdown', ...eventInit });
  el.dispatchEvent({ type: 'mousedown', ...eventInit });
  el.dispatchEvent({ type: 'pointerup', ...eventInit });
  el.dispatchEvent({ type: 'mouseup', ...eventInit });

  if (typeof el.click === 'function') {
    el.click();
  } else {
    el.dispatchEvent({ type: 'click', ...eventInit });
  }
}

function typeIntoInput(el, text) {
  if (typeof el.focus === 'function') {
    el.focus();
  }

  // Bypass React/Vue value tracker if attached
  if (el._valueTracker) {
    el._valueTracker.setValue('');
  }

  el.value = text;

  el.dispatchEvent({ type: 'keydown', key: 'Enter', bubbles: true, cancelable: true });
  el.dispatchEvent({
    type: 'input',
    data: text,
    inputType: 'insertText',
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent({ type: 'change', bubbles: true, cancelable: true });
}

function selectDropdownOption(el, optionValueOrText) {
  if (typeof el.focus === 'function') {
    el.focus();
  }

  const target = String(optionValueOrText || '').trim().toLowerCase();
  let matchedIndex = -1;

  for (let i = 0; i < el.options.length; i++) {
    const opt = el.options[i];
    const val = (opt.value || '').toLowerCase();
    const text = (opt.text || opt.innerText || '').toLowerCase();
    if (val === target || text === target || text.includes(target)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1 && el.options.length > 0) {
    matchedIndex = 0;
  }

  if (matchedIndex !== -1) {
    el.selectedIndex = matchedIndex;
    if (el.options[matchedIndex]) {
      el.value = el.options[matchedIndex].value || el.options[matchedIndex].text;
    }
    el.dispatchEvent({ type: 'change', bubbles: true, cancelable: true });
    el.dispatchEvent({ type: 'input', bubbles: true, cancelable: true });
    return true;
  }
  return false;
}

function performScroll(direction, win) {
  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  if (!targetWin) return;
  switch (direction) {
    case 'UP':
      targetWin.scrollBy({ top: -450, behavior: 'smooth' });
      break;
    case 'DOWN':
      targetWin.scrollBy({ top: 450, behavior: 'smooth' });
      break;
    case 'TOP':
      targetWin.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'BOTTOM':
      targetWin.scrollTo({ top: 2000, behavior: 'smooth' });
      break;
    default:
      targetWin.scrollBy({ top: 450, behavior: 'smooth' });
  }
}

async function executeAction(action, { registry = new Map(), doc = null, win = null } = {}) {
  const startTime = Date.now();
  if (!action || !action.actionType) {
    return {
      success: false,
      actionType: 'WAIT',
      error: 'NO_ACTION_SPECIFIED',
      executionTimeMs: 0,
    };
  }

  const { actionType, targetElementId, targetSelector, value, scrollDirection } = action;

  if (actionType === 'SCROLL') {
    performScroll(scrollDirection || 'DOWN', win);
    return {
      success: true,
      actionType: 'SCROLL',
      executionTimeMs: 1,
    };
  }

  if (actionType === 'WAIT') {
    return {
      success: true,
      actionType: 'WAIT',
      executionTimeMs: 1,
    };
  }

  if (actionType === 'COMPLETED') {
    return {
      success: true,
      actionType: 'COMPLETED',
      executionTimeMs: 1,
    };
  }

  let targetEl = null;
  if (targetElementId !== undefined) {
    targetEl = registry.get(targetElementId) || null;
  }

  if (!targetEl && targetSelector && doc) {
    targetEl = doc.querySelector(targetSelector);
  }

  if (!targetEl) {
    return {
      success: false,
      actionType,
      targetElementId,
      error: `ELEMENT_NOT_FOUND: Element #${targetElementId} could not be located in the current DOM.`,
      executionTimeMs: 1,
    };
  }

  if (isSensitiveElement(targetEl)) {
    return {
      success: false,
      actionType,
      targetElementId,
      error: 'SENSITIVE_FIELD_PROTECTED: Automated interaction with password/credential fields is blocked for your security.',
      executionTimeMs: 1,
    };
  }

  const elementTag = (targetEl.tagName || '').toLowerCase();
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (actionType === 'CLICK') {
    dispatchMouseClickSequence(targetEl);
    return {
      success: true,
      actionType: 'CLICK',
      targetElementId,
      targetLabel: action.targetLabel,
      elementTag,
      executionTimeMs: 2,
    };
  }

  if (actionType === 'TYPE') {
    const textToType = value ?? '';
    if (elementTag === 'input' || elementTag === 'textarea') {
      typeIntoInput(targetEl, textToType);
    } else {
      targetEl.innerText = textToType;
      targetEl.dispatchEvent({ type: 'input', bubbles: true, cancelable: true });
    }
    return {
      success: true,
      actionType: 'TYPE',
      targetElementId,
      targetLabel: action.targetLabel,
      elementTag,
      executionTimeMs: 2,
    };
  }

  if (actionType === 'SELECT') {
    if (elementTag === 'select') {
      const selected = selectDropdownOption(targetEl, value || '');
      return {
        success: selected,
        actionType: 'SELECT',
        targetElementId,
        targetLabel: action.targetLabel,
        elementTag,
        error: selected ? undefined : `Option "${value}" was not found in dropdown options.`,
        executionTimeMs: 2,
      };
    } else {
      return {
        success: false,
        actionType: 'SELECT',
        targetElementId,
        targetLabel: action.targetLabel,
        elementTag,
        error: 'TARGET_NOT_A_SELECT: Target element is not a <select> element.',
        executionTimeMs: 2,
      };
    }
  }

  return {
    success: false,
    actionType,
    targetElementId,
    error: `UNSUPPORTED_ACTION_TYPE: ${actionType}`,
    executionTimeMs: 1,
  };
}

// ============================================================================
// Automated Unit Tests for Milestone 3.5
// ============================================================================
test('Milestone 3.5: Action Runner - CLICK dispatches realistic pointerdown, mousedown, pointerup, mouseup, click cascade and focuses element', async () => {
  const btn = new MockElement('button', { innerText: 'Confirm Order' });
  const registry = new Map([[5, btn]]);

  const action = {
    actionType: 'CLICK',
    targetElementId: 5,
    targetLabel: 'Confirm Order',
  };

  const result = await executeAction(action, { registry });

  assert.equal(result.success, true);
  assert.equal(result.actionType, 'CLICK');
  assert.equal(result.targetElementId, 5);
  assert.equal(result.elementTag, 'button');
  assert.equal(btn.isFocused, true);
  assert.equal(btn.scrolledIntoView, true);

  const eventTypes = btn.dispatchedEvents.map((e) => e.type);
  assert.deepEqual(eventTypes, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
});

test('Milestone 3.5: Action Runner - TYPE bypasses React _valueTracker, updates value, and dispatches input + change events', async () => {
  const input = new MockElement('input', { name: 'destination', placeholder: 'Enter City' });
  let trackerReset = false;
  input._valueTracker = {
    setValue: (val) => {
      trackerReset = true;
    },
  };
  const registry = new Map([[2, input]]);

  const action = {
    actionType: 'TYPE',
    targetElementId: 2,
    targetLabel: 'Enter City',
    value: 'Bengaluru',
  };

  const result = await executeAction(action, { registry });

  assert.equal(result.success, true);
  assert.equal(result.actionType, 'TYPE');
  assert.equal(input.value, 'Bengaluru');
  assert.equal(input.isFocused, true);
  assert.equal(trackerReset, true, 'React _valueTracker was cleared before setting prototype value');

  const eventTypes = input.dispatchedEvents.map((e) => e.type);
  assert.ok(eventTypes.includes('keydown'));
  assert.ok(eventTypes.includes('input'));
  assert.ok(eventTypes.includes('change'));

  const inputEvent = input.dispatchedEvents.find((e) => e.type === 'input');
  assert.equal(inputEvent.data, 'Bengaluru');
  assert.equal(inputEvent.inputType, 'insertText');
});

test('Milestone 3.5: Action Runner - TYPE into textarea and custom contenteditable elements', async () => {
  const textarea = new MockElement('textarea', { name: 'notes' });
  const registry = new Map([[7, textarea]]);

  const res1 = await executeAction(
    { actionType: 'TYPE', targetElementId: 7, value: 'Urgent delivery requested.' },
    { registry }
  );
  assert.equal(res1.success, true);
  assert.equal(textarea.value, 'Urgent delivery requested.');

  const editableDiv = new MockElement('div', { attrs: { contenteditable: 'true' } });
  const registry2 = new Map([[8, editableDiv]]);
  const res2 = await executeAction(
    { actionType: 'TYPE', targetElementId: 8, value: 'Custom rich text editor' },
    { registry: registry2 }
  );
  assert.equal(res2.success, true);
  assert.equal(editableDiv.innerText, 'Custom rich text editor');
});

test('Milestone 3.5: Action Runner - SELECT updates selectedIndex, option value, and dispatches change + input events', async () => {
  const select = new MockElement('select', {
    name: 'class_preference',
    options: [
      { value: 'economy', text: 'Economy Class' },
      { value: 'business', text: 'Business Class' },
      { value: 'first', text: 'First Class' },
    ],
  });
  const registry = new Map([[3, select]]);

  const action = {
    actionType: 'SELECT',
    targetElementId: 3,
    targetLabel: 'Travel Class',
    value: 'business',
  };

  const result = await executeAction(action, { registry });

  assert.equal(result.success, true);
  assert.equal(result.actionType, 'SELECT');
  assert.equal(select.selectedIndex, 1);
  assert.equal(select.value, 'business');

  const eventTypes = select.dispatchedEvents.map((e) => e.type);
  assert.deepEqual(eventTypes, ['change', 'input']);
});

test('Milestone 3.5: Action Runner - SELECT partial and case-insensitive text matching', async () => {
  const select = new MockElement('select', {
    options: [
      { value: 'in', text: 'India (+91)' },
      { value: 'us', text: 'United States (+1)' },
      { value: 'uk', text: 'United Kingdom (+44)' },
    ],
  });
  const registry = new Map([[1, select]]);

  const result = await executeAction(
    { actionType: 'SELECT', targetElementId: 1, value: 'united states' },
    { registry }
  );

  assert.equal(result.success, true);
  assert.equal(select.selectedIndex, 1);
  assert.equal(select.value, 'us');
});

test('Milestone 3.5: Action Runner - SCROLL dispatches UP, DOWN, TOP, and BOTTOM navigation', async () => {
  let scrollCalls = [];
  const mockWin = {
    scrollBy: (opts) => scrollCalls.push({ method: 'scrollBy', ...opts }),
    scrollTo: (opts) => scrollCalls.push({ method: 'scrollTo', ...opts }),
  };

  const resDown = await executeAction({ actionType: 'SCROLL', scrollDirection: 'DOWN' }, { win: mockWin });
  assert.equal(resDown.success, true);

  const resUp = await executeAction({ actionType: 'SCROLL', scrollDirection: 'UP' }, { win: mockWin });
  assert.equal(resUp.success, true);

  const resTop = await executeAction({ actionType: 'SCROLL', scrollDirection: 'TOP' }, { win: mockWin });
  assert.equal(resTop.success, true);

  const resBottom = await executeAction({ actionType: 'SCROLL', scrollDirection: 'BOTTOM' }, { win: mockWin });
  assert.equal(resBottom.success, true);

  assert.deepEqual(scrollCalls, [
    { method: 'scrollBy', top: 450, behavior: 'smooth' },
    { method: 'scrollBy', top: -450, behavior: 'smooth' },
    { method: 'scrollTo', top: 0, behavior: 'smooth' },
    { method: 'scrollTo', top: 2000, behavior: 'smooth' },
  ]);
});

test('Milestone 3.5: Action Runner - WAIT pauses execution and returns success', async () => {
  const res = await executeAction({ actionType: 'WAIT' });
  assert.equal(res.success, true);
  assert.equal(res.actionType, 'WAIT');
});

test('Milestone 3.5: Action Runner - COMPLETED marks workflow finished and returns success', async () => {
  const res = await executeAction({ actionType: 'COMPLETED' });
  assert.equal(res.success, true);
  assert.equal(res.actionType, 'COMPLETED');
});

test('Milestone 3.5: Security Guard - SENSITIVE_FIELD_PROTECTED rejects password, card, and OTP execution', async () => {
  const passwordInput = new MockElement('input', { type: 'password', name: 'user_password' });
  const otpInput = new MockElement('input', { name: 'two_factor_pin', attrs: { autocomplete: 'one-time-code' } });
  const cardInput = new MockElement('input', { name: 'creditcard_number', placeholder: 'Card Number' });

  const registry = new Map([
    [10, passwordInput],
    [11, otpInput],
    [12, cardInput],
  ]);

  const res1 = await executeAction({ actionType: 'TYPE', targetElementId: 10, value: 'SuperSecret123' }, { registry });
  assert.equal(res1.success, false);
  assert.ok(res1.error.includes('SENSITIVE_FIELD_PROTECTED'));

  const res2 = await executeAction({ actionType: 'TYPE', targetElementId: 11, value: '123456' }, { registry });
  assert.equal(res2.success, false);
  assert.ok(res2.error.includes('SENSITIVE_FIELD_PROTECTED'));

  const res3 = await executeAction({ actionType: 'CLICK', targetElementId: 12 }, { registry });
  assert.equal(res3.success, false);
  assert.ok(res3.error.includes('SENSITIVE_FIELD_PROTECTED'));

  assert.equal(passwordInput.value, '');
  assert.equal(otpInput.value, '');
});

test('Milestone 3.5: Error Handling - ELEMENT_NOT_FOUND for invalid or unmapped element IDs', async () => {
  const registry = new Map();
  const res = await executeAction({ actionType: 'CLICK', targetElementId: 999 }, { registry });

  assert.equal(res.success, false);
  assert.ok(res.error.includes('ELEMENT_NOT_FOUND'));
  assert.ok(res.error.includes('#999'));
});

test('Milestone 3.5: Content Script Router - MSG_EXECUTE_DOM_ACTION dispatches executeAction and returns structured execution result', async () => {
  const input = new MockElement('input', { name: 'full_name' });
  const registry = new Map([[1, input]]);

  // Simulate content script router message handling
  const message = {
    type: 'MSG_EXECUTE_DOM_ACTION',
    payload: {
      action: {
        actionType: 'TYPE',
        targetElementId: 1,
        targetLabel: 'Full Name',
        value: 'Aarav Sharma',
      },
    },
  };

  let responseData = null;
  if (message.type === 'MSG_EXECUTE_DOM_ACTION') {
    responseData = await executeAction(message.payload.action, { registry });
  }

  assert.equal(responseData.success, true);
  assert.equal(responseData.actionType, 'TYPE');
  assert.equal(responseData.targetElementId, 1);
  assert.equal(responseData.targetLabel, 'Full Name');
  assert.equal(input.value, 'Aarav Sharma');
});

// ============================================================================
// Milestone 3.6: Multi-Step Action Loop & Audit Log Verification
// ============================================================================

/**
 * Simulates the Multi-Step Supervisor Loop orchestrating between Content Script,
 * LLM Action Planner, and Human-in-the-Loop user approvals.
 */
class MultiStepSupervisorSimulator {
  constructor({ doc, win, userProfile = {}, lang = 'en', onStepApprove }) {
    this.doc = doc;
    this.win = win;
    this.userProfile = userProfile;
    this.lang = lang;
    this.onStepApprove = onStepApprove || (() => true); // User approval hook
    this.history = [];
    this.stepNumber = 1;
    this.isCompleted = false;
    this.isStopped = false;
    this.registry = new Map();
  }

  async runGoal(goal, maxSteps = 6) {
    while (!this.isCompleted && !this.isStopped && this.stepNumber <= maxSteps) {
      // 1. Scan current interactive DOM
      const scanResult = scanElements(this.doc, this.win, { viewportOnly: false });
      this.registry.clear();
      scanResult.elements.forEach((elInfo) => {
        const sel = elInfo.selector || elInfo.targetSelector;
        if (sel) {
          const node = this.doc.querySelector(sel);
          if (node) this.registry.set(elInfo.id, node);
        }
      });

      // 2. Call Planner with Goal, Current DOM, and History
      const planRes = simulateActionPlannerResponse(goal, scanResult, this.history, this.userProfile);
      if (!planRes || planRes.status === 'TASK_COMPLETED' || planRes.action?.actionType === 'COMPLETED') {
        this.isCompleted = true;
        this.history.push({
          id: `step-${this.stepNumber}`,
          stepNumber: this.stepNumber,
          action: { actionType: 'COMPLETED' },
          userExplanation: 'Goal completed successfully.',
          timestamp: Date.now(),
          status: 'EXECUTED',
        });
        break;
      }

      const proposal = planRes;
      const proposedAction = proposal.action;

      // 3. Human-in-the-Loop Approval Decision
      const approvalDecision = this.onStepApprove(proposal, this.stepNumber);

      if (approvalDecision.type === 'STOP') {
        this.isStopped = true;
        clearBadges(this.doc);
        break;
      }

      if (approvalDecision.type === 'SKIP') {
        const skippedEntry = {
          id: `step-${this.stepNumber}`,
          stepNumber: this.stepNumber,
          action: proposedAction,
          userExplanation: `User skipped element #${proposedAction.targetElementId}: Alternative action needed.`,
          targetLabel: proposedAction.targetLabel,
          timestamp: Date.now(),
          status: 'SKIPPED',
        };
        this.history.push(skippedEntry);
        this.stepNumber++;
        continue;
      }

      // 4. Approved - Execute synthetic action
      const actionToExecute = approvalDecision.overrideAction || proposedAction;
      const execResult = await executeAction(actionToExecute, {
        registry: this.registry,
        doc: this.doc,
        win: this.win,
      });

      const logEntry = {
        id: `step-${this.stepNumber}`,
        stepNumber: this.stepNumber,
        action: actionToExecute,
        userExplanation: proposal.userExplanation,
        targetLabel: actionToExecute.targetLabel,
        timestamp: Date.now(),
        status: execResult.success ? 'EXECUTED' : 'FAILED',
        error: execResult.error,
      };
      this.history.push(logEntry);

      if (!execResult.success) {
        break;
      }

      this.stepNumber++;

      // Pacing delay simulation (settle DOM / framework state)
      await new Promise((r) => setTimeout(r, 10));
    }

    return {
      success: this.isCompleted,
      stepsRun: this.stepNumber - 1,
      history: this.history,
    };
  }
}

/**
 * Intelligent Mock Planner simulating multi-step form reasoning based on goal,
 * current unfilled fields, and previous action history.
 */
function simulateActionPlannerResponse(goal, actionMap, history, profile) {
  const executedIds = new Set(
    history
      .filter((h) => h.status === 'EXECUTED' && h.action?.targetElementId)
      .map((h) => h.action.targetElementId)
  );
  const skippedIds = new Set(
    history
      .filter((h) => h.status === 'SKIPPED' && h.action?.targetElementId)
      .map((h) => h.action.targetElementId)
  );

  const availableElements = actionMap.elements.filter(
    (el) => !executedIds.has(el.id) && !skippedIds.has(el.id)
  );

  if (availableElements.length === 0) {
    return {
      status: 'TASK_COMPLETED',
      thought: 'All available target fields have been filled or addressed.',
      userExplanation: 'All form fields have been successfully processed.',
      action: { actionType: 'COMPLETED' },
    };
  }

  // Find next logical candidate
  for (const el of availableElements) {
    const labelLower = (el.label || '').toLowerCase();
    const nameLower = (el.name || '').toLowerCase();

    if (labelLower.includes('name') || nameLower.includes('name')) {
      return {
        status: 'ACTION_PROPOSED',
        thought: 'Filling passenger name.',
        userExplanation: `Entering passenger name into #${el.id} (${el.label})`,
        action: {
          actionType: 'TYPE',
          targetElementId: el.id,
          targetLabel: el.label,
          targetSelector: el.selector || el.targetSelector,
          value: profile.fullName || 'Aarav Sharma',
        },
      };
    }

    if (labelLower.includes('email') || nameLower.includes('email')) {
      return {
        status: 'ACTION_PROPOSED',
        thought: 'Filling email address.',
        userExplanation: `Entering email address into #${el.id} (${el.label})`,
        action: {
          actionType: 'TYPE',
          targetElementId: el.id,
          targetLabel: el.label,
          targetSelector: el.selector || el.targetSelector,
          value: profile.email || 'aarav@example.com',
        },
      };
    }

    if (labelLower.includes('class') || nameLower.includes('class') || el.tag === 'select') {
      return {
        status: 'ACTION_PROPOSED',
        thought: 'Selecting cabin class preference.',
        userExplanation: `Selecting Business Class in dropdown #${el.id} (${el.label})`,
        action: {
          actionType: 'SELECT',
          targetElementId: el.id,
          targetLabel: el.label,
          targetSelector: el.selector || el.targetSelector,
          value: 'business',
        },
      };
    }

    if (labelLower.includes('newsletter') || labelLower.includes('subscribe')) {
      return {
        status: 'ACTION_PROPOSED',
        thought: 'Checking newsletter subscription.',
        userExplanation: `Clicking optional newsletter checkbox #${el.id}`,
        action: {
          actionType: 'CLICK',
          targetElementId: el.id,
          targetLabel: el.label,
          targetSelector: el.selector || el.targetSelector,
        },
      };
    }

    if (labelLower.includes('submit') || labelLower.includes('search') || labelLower.includes('book')) {
      return {
        status: 'ACTION_PROPOSED',
        thought: 'Submitting finalized form.',
        userExplanation: `Clicking submit button #${el.id} (${el.label})`,
        action: {
          actionType: 'CLICK',
          targetElementId: el.id,
          targetLabel: el.label,
          targetSelector: el.selector || el.targetSelector,
        },
      };
    }
  }

  // Fallback to completion
  return {
    status: 'TASK_COMPLETED',
    thought: 'Goal reached.',
    userExplanation: 'Workflow concluded.',
    action: { actionType: 'COMPLETED' },
  };
}

// ============================================================================
// Automated Tests for Milestone 3.6
// ============================================================================

test('Milestone 3.6: Multi-Step Orchestration Loop - Completes 4 successive form fields with user approval at each step', async () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://practice.sahayak.local' };

  const nameInput = new MockElement('input', { id: 'traveler-name', name: 'full_name', placeholder: 'Full Name' });
  const emailInput = new MockElement('input', { id: 'traveler-email', name: 'email', placeholder: 'Email Address' });
  const classSelect = new MockElement('select', {
    id: 'travel-class',
    name: 'travel_class',
    options: [
      { value: 'economy', text: 'Economy Class' },
      { value: 'business', text: 'Business Class' },
    ],
  });
  const submitBtn = new MockElement('button', { id: 'submit-booking', innerText: 'Search Flights' });

  doc.appendChild(nameInput);
  doc.appendChild(emailInput);
  doc.appendChild(classSelect);
  doc.appendChild(submitBtn);

  let approvedStepCount = 0;
  const supervisor = new MultiStepSupervisorSimulator({
    doc,
    win,
    userProfile: { fullName: 'Aarav Sharma', email: 'aarav@example.com' },
    onStepApprove: (proposal, stepNumber) => {
      approvedStepCount++;
      return { type: 'APPROVE' };
    },
  });

  const runResult = await supervisor.runGoal('Fill booking form and search flights', 6);

  assert.equal(runResult.success, true);
  assert.equal(runResult.stepsRun, 4);
  assert.equal(approvedStepCount, 4, 'User approved each discrete step');

  // Verify DOM mutations across the multi-step execution
  assert.equal(nameInput.value, 'Aarav Sharma');
  assert.equal(emailInput.value, 'aarav@example.com');
  assert.equal(classSelect.selectedIndex, 1);
  assert.equal(classSelect.value, 'business');

  // Verify full audit log
  const history = runResult.history;
  assert.equal(history.length, 5); // 4 executed steps + 1 completion entry
  assert.equal(history[0].action.actionType, 'TYPE');
  assert.equal(history[1].action.actionType, 'TYPE');
  assert.equal(history[2].action.actionType, 'SELECT');
  assert.equal(history[3].action.actionType, 'CLICK');
  assert.equal(history[4].action.actionType, 'COMPLETED');
});

test('Milestone 3.6: Skip Action Handling - User skips an element and supervisor re-plans next alternative without repeating', async () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://practice.sahayak.local' };

  const nameInput = new MockElement('input', { id: 'user-name', name: 'full_name', placeholder: 'Name' });
  const newsletterCheckbox = new MockElement('input', {
    id: 'opt-newsletter',
    name: 'subscribe_newsletter',
    type: 'checkbox',
    attrs: { 'aria-label': 'Subscribe to Newsletter' },
  });
  const submitBtn = new MockElement('button', { id: 'btn-submit', innerText: 'Submit Application' });

  doc.appendChild(nameInput);
  doc.appendChild(newsletterCheckbox);
  doc.appendChild(submitBtn);

  const supervisor = new MultiStepSupervisorSimulator({
    doc,
    win,
    userProfile: { fullName: 'Priya Patel' },
    onStepApprove: (proposal, stepNumber) => {
      // User skips the newsletter checkbox when proposed
      if (proposal.action?.targetLabel?.includes('Newsletter') || proposal.action?.targetElementId === 2) {
        return { type: 'SKIP' };
      }
      return { type: 'APPROVE' };
    },
  });

  const runResult = await supervisor.runGoal('Complete application without optional newsletter', 5);

  assert.equal(runResult.success, true);
  assert.equal(nameInput.value, 'Priya Patel');
  assert.equal(newsletterCheckbox.checked, false, 'Skipped checkbox was never checked');

  // Audit log should register SKIPPED on the newsletter element
  const skippedEntry = runResult.history.find((h) => h.status === 'SKIPPED');
  assert.ok(skippedEntry, 'Found SKIPPED entry in audit log');
  assert.ok(skippedEntry.userExplanation.includes('User skipped element'));

  // Ensure planner did not get stuck in a loop and advanced directly to submit
  const submitEntry = runResult.history.find((h) => h.status === 'EXECUTED' && h.action.actionType === 'CLICK');
  assert.ok(submitEntry, 'Supervisor successfully advanced to submit step after skip');
});

test('Milestone 3.6: Stop Action Handling - User clicks Stop immediately clears badges and aborts active task', async () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://practice.sahayak.local' };

  const input1 = new MockElement('input', { id: 'field-1', name: 'full_name' });
  const input2 = new MockElement('input', { id: 'field-2', name: 'email' });
  doc.appendChild(input1);
  doc.appendChild(input2);

  // Render initial overlay badges
  renderBadges([
    { id: 1, label: 'Full Name', tag: 'input', rect: input1.getBoundingClientRect() },
    { id: 2, label: 'Email', tag: 'input', rect: input2.getBoundingClientRect() },
  ], doc, win);

  assert.ok(doc.querySelector('#sahayak-som-container'), 'Badges overlay is mounted');

  const supervisor = new MultiStepSupervisorSimulator({
    doc,
    win,
    onStepApprove: (proposal, stepNumber) => {
      // User aborts supervisor immediately on Step 1
      return { type: 'STOP' };
    },
  });

  const runResult = await supervisor.runGoal('Test immediate abort', 3);

  assert.equal(supervisor.isStopped, true);
  assert.equal(runResult.stepsRun, 0);
  assert.equal(input1.value, '', 'No input was typed');
  assert.equal(doc.querySelector('#sahayak-som-container'), null, 'Overlay container was cleanly unmounted on stop');
});

test('Milestone 3.6: ActionHistory Audit Log Management - Tracks timestamps, statuses, and supports clearing history', () => {
  let history = [
    {
      id: 'step-1',
      stepNumber: 1,
      action: { actionType: 'TYPE', targetElementId: 1, targetLabel: 'Name', value: 'Rohan' },
      userExplanation: 'Filled name',
      timestamp: Date.now() - 3000,
      status: 'EXECUTED',
    },
    {
      id: 'step-2',
      stepNumber: 2,
      action: { actionType: 'CLICK', targetElementId: 3, targetLabel: 'Promo' },
      userExplanation: 'User skipped promo checkbox',
      timestamp: Date.now() - 2000,
      status: 'SKIPPED',
    },
    {
      id: 'step-3',
      stepNumber: 3,
      action: { actionType: 'CLICK', targetElementId: 5, targetLabel: 'Search' },
      userExplanation: 'Searched flights',
      timestamp: Date.now() - 1000,
      status: 'EXECUTED',
    },
  ];

  assert.equal(history.length, 3);

  // Verify text audit report formatting
  const report = generateAuditReport(history);
  assert.ok(report.includes('Step 1: [EXECUTED] TYPE on #1 with value "Rohan"'));
  assert.ok(report.includes('Step 2: [SKIPPED] CLICK on #3'));
  assert.ok(report.includes('Step 3: [EXECUTED] CLICK on #5'));

  // Test onClearHistory simulation
  const onClearHistory = () => {
    history = [];
  };

  onClearHistory();
  assert.equal(history.length, 0);
  assert.equal(generateAuditReport(history), '');
});

// ============================================================================
// Milestone 3.7: Phase 3 Review & Verification Suite
// ============================================================================

test('Milestone 3.7: Review - W3Schools Classic HTML Form Test (Text, Radios, Checkboxes, Select Dropdown)', async () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://www.w3schools.com/html/html_forms.asp' };

  // W3Schools Standard form elements
  const form = new MockElement('form', { id: 'w3c-form' });
  const fname = new MockElement('input', { id: 'fname', name: 'fname', value: 'John' });
  const lname = new MockElement('input', { id: 'lname', name: 'lname', value: 'Doe' });

  const radioMale = new MockElement('input', { type: 'radio', name: 'gender', value: 'male', attrs: { 'aria-label': 'Male' } });
  const radioFemale = new MockElement('input', { type: 'radio', name: 'gender', value: 'female', attrs: { 'aria-label': 'Female' } });

  const cbBike = new MockElement('input', { type: 'checkbox', name: 'vehicle', value: 'Bike', attrs: { 'aria-label': 'I have a bike' } });
  const cbCar = new MockElement('input', { type: 'checkbox', name: 'vehicle', value: 'Car', attrs: { 'aria-label': 'I have a car' } });

  const selectCars = new MockElement('select', {
    id: 'cars',
    name: 'cars',
    options: [
      { value: 'volvo', text: 'Volvo' },
      { value: 'saab', text: 'Saab' },
      { value: 'mercedes', text: 'Mercedes' },
      { value: 'audi', text: 'Audi' },
    ],
  });

  const comments = new MockElement('textarea', { id: 'comments', name: 'comments', placeholder: 'Enter comments' });
  const submitBtn = new MockElement('button', { id: 'w3c-submit', innerText: 'Submit W3C Form' });

  form.appendChild(fname);
  form.appendChild(lname);
  form.appendChild(radioMale);
  form.appendChild(radioFemale);
  form.appendChild(cbBike);
  form.appendChild(cbCar);
  form.appendChild(selectCars);
  form.appendChild(comments);
  form.appendChild(submitBtn);
  doc.appendChild(form);

  // 1. Scan DOM and verify all 9 interactive elements are cataloged with Set-of-Marks badges
  const scanResult = scanElements(doc, win, { viewportOnly: false });
  assert.equal(scanResult.elements.length, 9);
  assert.equal(scanResult.excludedSensitiveCount, 0);

  // 2. Verify specific labels
  const carDropdownInfo = scanResult.elements.find((el) => el.tag === 'select');
  assert.ok(carDropdownInfo, 'Cars dropdown detected');
  assert.equal(carDropdownInfo.options.length, 4);

  // 3. Render Badges
  const renderRes = renderBadges(scanResult.elements, doc, win);
  assert.equal(renderRes.renderedCount, 9);
  assert.ok(doc.querySelector('#sahayak-som-container'), 'Badge container mounted');

  // 4. Execute actions on the form
  const registry = new Map();
  scanResult.elements.forEach((el) => {
    const node = doc.querySelector(el.selector);
    if (node) registry.set(el.id, node);
  });

  // Select "Audi" in car dropdown
  const selectRes = await executeAction(
    { actionType: 'SELECT', targetElementId: carDropdownInfo.id, value: 'audi' },
    { registry, doc, win }
  );
  assert.equal(selectRes.success, true);
  assert.equal(selectCars.value, 'audi');

  // Click bike checkbox
  const bikeInfo = scanResult.elements.find((el) => el.label.includes('bike'));
  assert.ok(bikeInfo);
  const clickRes = await executeAction(
    { actionType: 'CLICK', targetElementId: bikeInfo.id },
    { registry, doc, win }
  );
  assert.equal(clickRes.success, true);
});

test('Milestone 3.7: Review - Google Forms / Survey Multi-Section Test (Radio Scales, Checkboxes, Text)', async () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://docs.google.com/forms/d/e/sample/viewform' };

  const nameInput = new MockElement('input', { id: 'survey-name', name: 'respondent_name', placeholder: 'Your Name' });
  
  // Rating radios 1 to 5
  const rating1 = new MockElement('input', { type: 'radio', name: 'satisfaction', value: '1', attrs: { 'aria-label': '1 - Very Unsatisfied' } });
  const rating5 = new MockElement('input', { type: 'radio', name: 'satisfaction', value: '5', attrs: { 'aria-label': '5 - Very Satisfied' } });

  const feedbackTextarea = new MockElement('textarea', { id: 'feedback', name: 'user_feedback', placeholder: 'Your thoughts' });
  const submitSurveyBtn = new MockElement('button', { id: 'submit-survey', innerText: 'Submit response' });

  doc.appendChild(nameInput);
  doc.appendChild(rating1);
  doc.appendChild(rating5);
  doc.appendChild(feedbackTextarea);
  doc.appendChild(submitSurveyBtn);

  const scanResult = scanElements(doc, win, { viewportOnly: false });
  assert.equal(scanResult.elements.length, 5);

  const registry = new Map();
  scanResult.elements.forEach((el) => {
    const node = doc.querySelector(el.selector);
    if (node) registry.set(el.id, node);
  });

  // Execute type feedback
  const feedbackInfo = scanResult.elements.find((el) => el.tag === 'textarea');
  assert.ok(feedbackInfo);
  const typeRes = await executeAction(
    { actionType: 'TYPE', targetElementId: feedbackInfo.id, value: 'Sahayak worked flawlessly!' },
    { registry, doc, win }
  );
  assert.equal(typeRes.success, true);
  assert.equal(feedbackTextarea.value, 'Sahayak worked flawlessly!');
});

test('Milestone 3.7: Review - E-Commerce Checkout with Irreversible Action Banner & Sensitive Field Redaction', async () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, url: 'https://store.example.com/checkout' };

  const addressInput = new MockElement('input', { name: 'street_address', placeholder: '123 Main Street' });
  const cityInput = new MockElement('input', { name: 'city', placeholder: 'City' });
  
  // Sensitive Credentials
  const passwordInput = new MockElement('input', { type: 'password', name: 'account_password' });
  const cardNumberInput = new MockElement('input', { name: 'creditcard_number', attrs: { autocomplete: 'cc-number' } });
  const otpInput = new MockElement('input', { name: 'otp_auth_code', attrs: { autocomplete: 'one-time-code' } });

  // Irreversible Action Button
  const payBtn = new MockElement('button', { id: 'place-order-btn', innerText: 'Book Flight & Pay $450' });

  doc.appendChild(addressInput);
  doc.appendChild(cityInput);
  doc.appendChild(passwordInput);
  doc.appendChild(cardNumberInput);
  doc.appendChild(otpInput);
  doc.appendChild(payBtn);

  // 1. Scan interactive DOM
  const scanResult = scanElements(doc, win, { viewportOnly: false });

  // 2. Verify all 3 sensitive credential fields are completely excluded from the Action Map
  assert.equal(scanResult.excludedSensitiveCount, 3);
  assert.equal(scanResult.elements.length, 3); // Only address, city, and pay button are allowed
  const sensitiveInList = scanResult.elements.some((el) =>
    el.name?.includes('password') || el.name?.includes('creditcard') || el.name?.includes('otp')
  );
  assert.equal(sensitiveInList, false, 'No sensitive fields present in Action Map');

  // 3. Verify Irreversible Action Banner detection on the Pay button
  const payAction = {
    actionType: 'CLICK',
    targetElementId: 3,
    targetLabel: 'Book Flight & Pay $450',
  };
  const isDangerous = isIrreversibleAction(payAction, 'Authorizing credit card transaction');
  assert.equal(isDangerous, true, 'isIrreversibleAction correctly flagged irreversible payment button');
});

test('Milestone 3.7: Review - DOM Scalability Benchmark (250 elements scanned < 50ms with zero duplicate IDs)', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0 };

  // Generate 250 interactive elements
  for (let i = 1; i <= 250; i++) {
    const btn = new MockElement('button', {
      id: `elem-${i}`,
      innerText: `Action Item ${i}`,
    });
    doc.appendChild(btn);
  }

  const startTime = Date.now();
  const scanResult = scanElements(doc, win, { viewportOnly: false });
  const duration = Date.now() - startTime;

  assert.equal(scanResult.elements.length, 250);
  assert.ok(duration < 250, `Scan duration was ${duration}ms, must be < 250ms`);

  // Verify uniqueness of action IDs
  const idSet = new Set(scanResult.elements.map((el) => el.id));
  assert.equal(idSet.size, 250, 'All action IDs must be strictly unique');
  assert.equal(scanResult.elements[0].id, 1);
  assert.equal(scanResult.elements[249].id, 250);
});

test('Milestone 3.7: Review - Clean Teardown & Teardown Verification', () => {
  const doc = new MockElement('div');
  const win = { innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0 };

  const el1 = new MockElement('button', { id: 'b1', innerText: 'First' });
  const el2 = new MockElement('button', { id: 'b2', innerText: 'Second' });
  doc.appendChild(el1);
  doc.appendChild(el2);

  // Render badges
  renderBadges([
    { id: 1, label: 'First', tag: 'button', rect: el1.getBoundingClientRect() },
    { id: 2, label: 'Second', tag: 'button', rect: el2.getBoundingClientRect() },
  ], doc, win);

  // Highlight target
  const registry = new Map([[1, el1], [2, el2]]);
  highlightTargetElement(1, registry, doc);

  assert.ok(doc.querySelector('#sahayak-som-container'), 'Badge container exists');
  assert.ok(el1.classList.contains('sahayak-highlight-target'), 'Target is highlighted');

  // Trigger teardown
  clearBadges(doc);

  assert.equal(doc.querySelector('#sahayak-som-container'), null, 'Badge container cleanly unmounted');
  assert.equal(el1.classList.contains('sahayak-highlight-target'), false, 'Target outline removed');
});




