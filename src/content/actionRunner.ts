// Synthetic DOM Event Action Runner for Sahayak AI Browser Agent
// Milestone 3.5: Dispatches human-like synthetic DOM events (clicks, typing, select, scroll)
// with proper event bubbling, React/Vue controlled input value tracker updates, and safety checks.

import { ProposedAction, ActionType } from '../shared/types';
import { getElementByActionId, isSensitiveElement } from './somMapper';

export interface ExecuteActionResult {
  success: boolean;
  actionType: ActionType;
  targetElementId?: number;
  targetLabel?: string;
  elementTag?: string;
  error?: string;
  executionTimeMs: number;
}

/**
 * Dispatches realistic mouse event sequence: pointerdown -> mousedown -> pointerup -> mouseup -> click.
 */
function dispatchMouseClickSequence(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    detail: 1,
    screenX: window.screenX + clientX,
    screenY: window.screenY + clientY,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  };

  try {
    el.focus();
  } catch {}

  // Pointer & Mouse down
  if (typeof PointerEvent !== 'undefined') {
    el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  }
  el.dispatchEvent(new MouseEvent('mousedown', eventInit));

  // Pointer & Mouse up
  if (typeof PointerEvent !== 'undefined') {
    el.dispatchEvent(new PointerEvent('pointerup', eventInit));
  }
  el.dispatchEvent(new MouseEvent('mouseup', eventInit));

  // Native click method or MouseEvent click
  if (typeof el.click === 'function') {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', eventInit));
  }
}

/**
 * Types text into an input or textarea, bypassing React/Vue synthetic event tracking guards.
 */
function typeIntoInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void {
  try {
    el.focus();
  } catch {}

  // Save current value tracker state for React 16+
  const tracker = (el as any)._valueTracker;
  if (tracker) {
    tracker.setValue('');
  }

  // Use prototype setter so React/Vue/Angular controlled inputs detect change
  const prototype =
    el instanceof HTMLInputElement
      ? window.HTMLInputElement.prototype
      : window.HTMLTextAreaElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (valueSetter) {
    valueSetter.call(el, text);
  } else {
    el.value = text;
  }

  // Dispatch natural event sequence: keydown -> input -> change
  try {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
    );
  } catch {}

  // Standard input event with inputType 'insertText'
  if (typeof InputEvent !== 'undefined') {
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: text,
        inputType: 'insertText',
      })
    );
  } else {
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }

  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

/**
 * Selects an option from a <select> dropdown by matching text or value.
 */
function selectDropdownOption(el: HTMLSelectElement, optionValueOrText: string): boolean {
  try {
    el.focus();
  } catch {}

  const target = optionValueOrText.trim().toLowerCase();
  let matchedIndex = -1;

  for (let i = 0; i < el.options.length; i++) {
    const opt = el.options[i];
    if (
      opt.value.toLowerCase() === target ||
      (opt.text && opt.text.trim().toLowerCase() === target) ||
      (opt.text && opt.text.trim().toLowerCase().includes(target))
    ) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1 && el.options.length > 0) {
    matchedIndex = 0; // Fallback to first valid option if no exact match
  }

  if (matchedIndex !== -1) {
    el.selectedIndex = matchedIndex;

    const prototype = window.HTMLSelectElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (valueSetter && el.options[matchedIndex]) {
      valueSetter.call(el, el.options[matchedIndex].value);
    }

    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    return true;
  }

  return false;
}

/**
 * Performs smooth viewport scrolling.
 */
function performScroll(direction: 'UP' | 'DOWN' | 'TOP' | 'BOTTOM' = 'DOWN'): void {
  if (typeof window === 'undefined') return;

  switch (direction) {
    case 'UP':
      window.scrollBy({ top: -450, behavior: 'smooth' });
      break;
    case 'DOWN':
      window.scrollBy({ top: 450, behavior: 'smooth' });
      break;
    case 'TOP':
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'BOTTOM':
      window.scrollTo({
        top: Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0
        ),
        behavior: 'smooth',
      });
      break;
    default:
      window.scrollBy({ top: 450, behavior: 'smooth' });
  }
}

/**
 * Executes a single discrete proposed browser action.
 */
export async function executeAction(action: ProposedAction): Promise<ExecuteActionResult> {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (!action || !action.actionType) {
    return {
      success: false,
      actionType: 'WAIT',
      error: 'NO_ACTION_SPECIFIED',
      executionTimeMs: 0,
    };
  }

  const { actionType, targetElementId, targetSelector, value, scrollDirection } = action;

  // Case 1: SCROLL action (does not require a target element)
  if (actionType === 'SCROLL') {
    performScroll(scrollDirection || 'DOWN');
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: true,
      actionType: 'SCROLL',
      executionTimeMs: elapsed,
    };
  }

  // Case 2: WAIT action
  if (actionType === 'WAIT') {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: true,
      actionType: 'WAIT',
      executionTimeMs: elapsed,
    };
  }

  // Case 3: COMPLETED action
  if (actionType === 'COMPLETED') {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: true,
      actionType: 'COMPLETED',
      executionTimeMs: elapsed,
    };
  }

  // For CLICK, TYPE, and SELECT: resolve the live target element
  let targetEl: HTMLElement | null = null;

  if (targetElementId !== undefined) {
    targetEl = getElementByActionId(targetElementId) || null;
  }

  if (!targetEl && targetSelector && typeof document !== 'undefined') {
    try {
      targetEl = document.querySelector(targetSelector) as HTMLElement | null;
    } catch {}
  }

  if (!targetEl) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: false,
      actionType,
      targetElementId,
      error: `ELEMENT_NOT_FOUND: Element #${targetElementId} could not be located in the current DOM.`,
      executionTimeMs: elapsed,
    };
  }

  // Security Guard: Verify element is not a sensitive credential or password field
  if (isSensitiveElement(targetEl)) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: false,
      actionType,
      targetElementId,
      error: 'SENSITIVE_FIELD_PROTECTED: Automated interaction with password/credential fields is blocked for your security.',
      executionTimeMs: elapsed,
    };
  }

  const elementTag = targetEl.tagName.toLowerCase();

  // Scroll element into view smoothly before interacting
  try {
    targetEl.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  } catch {}

  // Allow smooth scroll to settle
  await new Promise((resolve) => setTimeout(resolve, 60));

  try {
    // Action 1: CLICK
    if (actionType === 'CLICK') {
      dispatchMouseClickSequence(targetEl);
      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        success: true,
        actionType: 'CLICK',
        targetElementId,
        targetLabel: action.targetLabel,
        elementTag,
        executionTimeMs: elapsed,
      };
    }

    // Action 2: TYPE
    if (actionType === 'TYPE') {
      const textToType = value ?? '';

      if (
        targetEl instanceof HTMLInputElement ||
        targetEl instanceof HTMLTextAreaElement
      ) {
        typeIntoInput(targetEl, textToType);
      } else if (
        targetEl.isContentEditable ||
        targetEl.getAttribute('contenteditable') === 'true'
      ) {
        try {
          targetEl.focus();
        } catch {}
        targetEl.innerText = textToType;
        targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        targetEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      } else {
        // Fallback for custom textboxes
        targetEl.innerText = textToType;
        targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }

      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        success: true,
        actionType: 'TYPE',
        targetElementId,
        targetLabel: action.targetLabel,
        elementTag,
        executionTimeMs: elapsed,
      };
    }

    // Action 3: SELECT
    if (actionType === 'SELECT') {
      if (targetEl instanceof HTMLSelectElement) {
        const selected = selectDropdownOption(targetEl, value || '');
        const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
        return {
          success: selected,
          actionType: 'SELECT',
          targetElementId,
          targetLabel: action.targetLabel,
          elementTag,
          error: selected ? undefined : `Option "${value}" was not found in dropdown options.`,
          executionTimeMs: elapsed,
        };
      } else {
        const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
        return {
          success: false,
          actionType: 'SELECT',
          targetElementId,
          targetLabel: action.targetLabel,
          elementTag,
          error: 'TARGET_NOT_A_SELECT: Target element is not a <select> element.',
          executionTimeMs: elapsed,
        };
      }
    }

    return {
      success: false,
      actionType,
      targetElementId,
      error: `UNSUPPORTED_ACTION_TYPE: ${actionType}`,
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  } catch (err: any) {
    return {
      success: false,
      actionType,
      targetElementId,
      error: err.message || 'Action execution failed.',
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }
}

