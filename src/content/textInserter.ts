// Milestone 2.5: Active Field Text Inserter for Content Script
import { InsertTextResult } from '../shared/types';

/**
 * Finds the currently active, focused, or editable element on the web page.
 * Recursively resolves active elements inside Shadow DOMs.
 */
export function findActiveEditableElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;

  // Resolve shadow DOM active element
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement as HTMLElement;
  }

  if (!el) return null;

  // 1. Textarea
  if (el instanceof HTMLTextAreaElement) {
    return el;
  }

  // 2. Text Input types
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    const nonTextTypes = [
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'file',
      'image',
      'color',
      'range',
      'hidden',
    ];
    if (!nonTextTypes.includes(type) && !el.readOnly && !el.disabled) {
      return el;
    }
  }

  // 3. Contenteditable container (Gmail, Twitter/X, LinkedIn, Notion, Slack)
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    return el;
  }

  // 4. Check if any editable field has visual focus on page
  const focused = document.querySelector<HTMLElement>(
    'textarea:focus, input:focus, [contenteditable="true"]:focus, [role="textbox"]:focus'
  );
  if (focused) {
    return focused;
  }

  return null;
}

/**
 * Inserts text into an editable element with full React/Vue/Angular synthetic event dispatch.
 */
export function insertTextIntoElement(el: HTMLElement, text: string): InsertTextResult {
  try {
    el.focus();

    // Handling Input / Textarea
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const originalValue = el.value || '';

      const newValue = originalValue.slice(0, start) + text + originalValue.slice(end);

      // Use prototype value descriptor setter so reactive frameworks detect changes
      const prototype =
        el instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (valueSetter) {
        valueSetter.call(el, newValue);
      } else {
        el.value = newValue;
      }

      const newPos = start + text.length;
      try {
        el.setSelectionRange(newPos, newPos);
      } catch {}

      // Dispatch synthetic input and change events
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      return {
        success: true,
        elementTag: el.tagName.toLowerCase(),
      };
    }

    // Handling Rich Text / Contenteditable (Gmail, Twitter/X, LinkedIn)
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      // 1. Try execCommand insertText (preserves undo history in modern browsers)
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {}

      // 2. Fallback to Selection API range replacement
      if (!inserted) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          inserted = true;
        } else {
          el.textContent = (el.textContent || '') + text;
          inserted = true;
        }
      }

      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      return {
        success: true,
        elementTag: el.tagName.toLowerCase(),
      };
    }

    return {
      success: false,
      error: 'ELEMENT_NOT_EDITABLE',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Insertion failed',
    };
  }
}

