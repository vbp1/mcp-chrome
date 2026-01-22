/**
 * Composable for contenteditable input with atomic @Element_N references.
 *
 * Features:
 * - Converts plain text to DOM nodes with atomic (non-editable) spans for @Element_N
 * - Serializes DOM back to plain text
 * - Handles atomic deletion (Backspace/Delete treats spans as single unit)
 * - Auto-resize based on content
 * - Cursor position preservation after DOM updates
 */
import { ref, watch, nextTick, onMounted, onUnmounted, type Ref } from 'vue';
import type { ElementReferenceData } from './useElementReferences';

export interface UseContentEditableInputOptions {
  /** Ref to the contenteditable element */
  containerRef: Ref<HTMLDivElement | null>;
  /** Current value as plain text */
  value: Ref<string>;
  /** Element references map for validation and styling */
  references: Ref<Map<number, ElementReferenceData>>;
  /** Minimum height in pixels */
  minHeight?: number;
  /** Maximum height in pixels */
  maxHeight?: number;
  /** Callback when value changes */
  onInput: (value: string) => void;
  /** Callback when Enter is pressed (submit) */
  onSubmit?: () => void;
  /** Whether Cmd/Ctrl+Enter is required (drawer mode) */
  requireModifierForSubmit?: boolean;
  /** Callback when an element chip is clicked (for highlighting in browser) */
  onChipClick?: (data: ElementReferenceData, elementNum: number) => void;
}

export interface UseContentEditableInputReturn {
  /** Current calculated height */
  height: Ref<number>;
  /** Whether content exceeds max height (is overflowing) */
  isOverflowing: Ref<boolean>;
  /** Handle input event */
  handleInput: (event: Event) => void;
  /** Handle keydown event */
  handleKeyDown: (event: KeyboardEvent) => void;
  /** Handle paste event */
  handlePaste: (event: ClipboardEvent) => void;
  /** Manually trigger height recalculation */
  recalculate: () => void;
  /** Focus the input */
  focus: () => void;
  /** Render content (call when value or references change externally) */
  render: () => void;
}

const DEFAULT_MIN_HEIGHT = 50;
const DEFAULT_MAX_HEIGHT = 200;

/**
 * Parse plain text into DOM nodes with atomic spans for @Element_N references.
 *
 * @param text - Plain text containing @Element_N patterns
 * @param references - Map of element numbers to reference data
 * @returns DocumentFragment with text nodes and atomic spans
 */
export function parseTextToNodes(
  text: string,
  references: Map<number, ElementReferenceData>,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  if (!text) {
    return fragment;
  }

  // Split text by @Element_N pattern while keeping the delimiters
  const regex = /@Element_(\d+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      fragment.appendChild(document.createTextNode(textBefore));
    }

    // Create atomic span for the reference
    const num = parseInt(match[1], 10);
    const refData = references.get(num);
    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset.elementRef = String(num);
    span.className = refData ? 'element-chip' : 'element-chip element-chip--invalid';
    span.textContent = match[0]; // @Element_N

    // Add tooltip and data for click handling
    if (refData) {
      span.title = refData.summary;
      span.dataset.selector = refData.selector;
      span.dataset.pageUrl = refData.pageUrl;
    }

    fragment.appendChild(span);
    lastIndex = regex.lastIndex;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

/**
 * Serialize DOM content back to plain text.
 *
 * @param container - The contenteditable container
 * @returns Plain text with @Element_N references
 */
export function serializeNodesToText(container: HTMLElement): string {
  let result = '';

  function processNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      // Check if it's an atomic element chip
      if (el.dataset.elementRef !== undefined) {
        const num = el.dataset.elementRef;
        result += `@Element_${num}`;
        return;
      }

      // Handle line breaks
      if (el.tagName === 'BR') {
        result += '\n';
        return;
      }

      // Handle block elements (they create newlines)
      const isBlock = el.tagName === 'DIV' || el.tagName === 'P';
      if (isBlock && result.length > 0 && !result.endsWith('\n')) {
        result += '\n';
      }

      // Process children
      for (const child of el.childNodes) {
        processNode(child);
      }
    }
  }

  for (const child of container.childNodes) {
    processNode(child);
  }

  return result;
}

/**
 * Restore cursor position after DOM changes.
 * Uses text content offset to find the equivalent position in new DOM.
 */
function restoreCursorPosition(container: HTMLElement, textOffset: number): void {
  // Walk through nodes to find the position at textOffset
  let currentOffset = 0;

  function findPosition(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length || 0;
      if (currentOffset + len >= textOffset) {
        return { node, offset: textOffset - currentOffset };
      }
      currentOffset += len;
      return null;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      // Atomic chip counts as its full @Element_N length
      if (el.dataset.elementRef !== undefined) {
        const refText = `@Element_${el.dataset.elementRef}`;
        const len = refText.length;
        if (currentOffset + len >= textOffset) {
          // Position cursor after the chip
          const parent = el.parentNode;
          if (parent) {
            const index = Array.from(parent.childNodes).indexOf(el as ChildNode);
            return { node: parent, offset: index + 1 };
          }
        }
        currentOffset += len;
        return null;
      }

      // BR counts as newline
      if (el.tagName === 'BR') {
        currentOffset += 1;
        if (currentOffset >= textOffset) {
          const parent = el.parentNode;
          if (parent) {
            const index = Array.from(parent.childNodes).indexOf(el as ChildNode);
            return { node: parent, offset: index + 1 };
          }
        }
        return null;
      }

      // Process children
      for (const child of el.childNodes) {
        const result = findPosition(child);
        if (result) return result;
      }
    }

    return null;
  }

  // First pass: find position
  for (const child of container.childNodes) {
    const result = findPosition(child);
    if (result) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStart(result.node, result.offset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return;
    }
  }

  // If we couldn't find exact position, put cursor at end
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false); // false = end
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * Get text offset of current cursor position.
 */
function getCursorTextOffset(container: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer)) return 0;

  let offset = 0;

  function countOffset(node: Node): boolean {
    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.startOffset;
      }
      return true; // Stop counting
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length || 0;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.dataset.elementRef !== undefined) {
        offset += `@Element_${el.dataset.elementRef}`.length;
        return false;
      }

      if (el.tagName === 'BR') {
        offset += 1;
        return false;
      }

      for (const child of el.childNodes) {
        if (countOffset(child)) return true;
      }
    }

    return false;
  }

  for (const child of container.childNodes) {
    if (countOffset(child)) break;
  }

  return offset;
}

/**
 * Check if cursor is at position 0 of a text node and previous sibling is an atomic chip.
 */
function isBackspaceOnChip(container: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;

  const node = range.startContainer;
  const offset = range.startOffset;

  // Case 1: Cursor at start of text node
  if (node.nodeType === Node.TEXT_NODE && offset === 0) {
    let prevSibling = node.previousSibling;
    while (prevSibling) {
      if (
        prevSibling.nodeType === Node.ELEMENT_NODE &&
        (prevSibling as HTMLElement).dataset.elementRef !== undefined
      ) {
        return prevSibling as HTMLElement;
      }
      // Skip empty text nodes
      if (prevSibling.nodeType === Node.TEXT_NODE && (prevSibling.textContent?.length || 0) > 0) {
        return null;
      }
      prevSibling = prevSibling.previousSibling;
    }
  }

  // Case 2: Cursor is in container directly, check child at offset - 1
  if (node === container && offset > 0) {
    const prevChild = container.childNodes[offset - 1];
    if (
      prevChild &&
      prevChild.nodeType === Node.ELEMENT_NODE &&
      (prevChild as HTMLElement).dataset.elementRef !== undefined
    ) {
      return prevChild as HTMLElement;
    }
  }

  return null;
}

/**
 * Check if cursor is at end of text node and next sibling is an atomic chip.
 */
function isDeleteOnChip(container: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;

  const node = range.startContainer;
  const offset = range.startOffset;

  // Case 1: Cursor at end of text node
  if (node.nodeType === Node.TEXT_NODE) {
    const len = node.textContent?.length || 0;
    if (offset === len) {
      let nextSibling = node.nextSibling;
      while (nextSibling) {
        if (
          nextSibling.nodeType === Node.ELEMENT_NODE &&
          (nextSibling as HTMLElement).dataset.elementRef !== undefined
        ) {
          return nextSibling as HTMLElement;
        }
        // Skip empty text nodes
        if (nextSibling.nodeType === Node.TEXT_NODE && (nextSibling.textContent?.length || 0) > 0) {
          return null;
        }
        nextSibling = nextSibling.nextSibling;
      }
    }
  }

  // Case 2: Cursor is in container directly, check child at offset
  if (node === container) {
    const nextChild = container.childNodes[offset];
    if (
      nextChild &&
      nextChild.nodeType === Node.ELEMENT_NODE &&
      (nextChild as HTMLElement).dataset.elementRef !== undefined
    ) {
      return nextChild as HTMLElement;
    }
  }

  return null;
}

/**
 * Composable for contenteditable input with atomic element references.
 */
export function useContentEditableInput(
  options: UseContentEditableInputOptions,
): UseContentEditableInputReturn {
  const {
    containerRef,
    value,
    references,
    minHeight = DEFAULT_MIN_HEIGHT,
    maxHeight = DEFAULT_MAX_HEIGHT,
    onInput,
    onSubmit,
    requireModifierForSubmit = false,
    onChipClick,
  } = options;

  const height = ref<number>(minHeight);
  const isOverflowing = ref(false);

  let scheduled = false;
  let resizeObserver: ResizeObserver | null = null;
  let lastWidth = 0;
  let isRendering = false;

  /**
   * Calculate height based on content.
   */
  function recalculate(): void {
    const el = containerRef.value;
    if (!el) return;

    const contentHeight = el.scrollHeight;
    const clampedHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight));

    height.value = clampedHeight;
    isOverflowing.value = contentHeight > maxHeight + 1;
  }

  /**
   * Schedule height recalculation.
   */
  function scheduleRecalculate(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      recalculate();
    });
  }

  /**
   * Render the current value into the contenteditable.
   */
  function render(): void {
    const container = containerRef.value;
    if (!container) return;

    isRendering = true;

    // Save cursor position as text offset
    const cursorOffset = getCursorTextOffset(container);

    // Clear and rebuild content
    container.innerHTML = '';
    const fragment = parseTextToNodes(value.value, references.value);
    container.appendChild(fragment);

    // Ensure there's always at least a BR for empty state (Firefox needs this)
    if (container.childNodes.length === 0) {
      container.appendChild(document.createElement('br'));
    }

    // Restore cursor position
    restoreCursorPosition(container, cursorOffset);

    isRendering = false;
    scheduleRecalculate();
  }

  /**
   * Handle input event - serialize DOM to text and emit.
   */
  function handleInput(_event: Event): void {
    if (isRendering) return;

    const container = containerRef.value;
    if (!container) return;

    const newValue = serializeNodesToText(container);

    // Only emit if value actually changed
    if (newValue !== value.value) {
      onInput(newValue);
    }
  }

  /**
   * Handle keydown event for atomic deletion and submit.
   */
  function handleKeyDown(event: KeyboardEvent): void {
    const container = containerRef.value;
    if (!container) return;

    // Handle Enter for submit
    if (event.key === 'Enter') {
      if (requireModifierForSubmit) {
        // Drawer mode: Cmd/Ctrl+Enter to submit
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.();
          return;
        }
        // Allow regular Enter for newlines
      } else {
        // Normal mode: Enter to submit (Shift+Enter for newline)
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          onSubmit?.();
          return;
        }
      }
    }

    // Handle Backspace for atomic chip deletion
    if (event.key === 'Backspace') {
      const chip = isBackspaceOnChip(container);
      if (chip) {
        event.preventDefault();
        chip.remove();
        handleInput(event);
        return;
      }
    }

    // Handle Delete for atomic chip deletion
    if (event.key === 'Delete') {
      const chip = isDeleteOnChip(container);
      if (chip) {
        event.preventDefault();
        chip.remove();
        handleInput(event);
        return;
      }
    }
  }

  /**
   * Handle paste - extract text and insert at cursor.
   * For images, we let the event propagate to be handled by parent.
   */
  function handlePaste(event: ClipboardEvent): void {
    // Check for images - let parent handle
    const items = event.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          // Don't prevent default, let parent handle
          return;
        }
      }
    }

    // Handle text paste
    const text = event.clipboardData?.getData('text/plain');
    if (text) {
      event.preventDefault();

      // Insert text at cursor position
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      range.deleteContents();

      // Insert text node (will be parsed on next render)
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // Move cursor after inserted text
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      handleInput(event);
    }
  }

  /**
   * Focus the contenteditable.
   */
  function focus(): void {
    containerRef.value?.focus();
  }

  /**
   * Handle click events on element chips.
   */
  function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Check if click was on an element chip
    if (target.dataset.elementRef !== undefined) {
      const num = parseInt(target.dataset.elementRef, 10);
      const refData = references.value.get(num);

      if (refData && onChipClick) {
        event.preventDefault();
        event.stopPropagation();
        onChipClick(refData, num);
      }
    }
  }

  // Watch value changes from external source
  watch(
    value,
    async () => {
      if (isRendering) return;
      await nextTick();
      render();
    },
    { flush: 'post' },
  );

  // Watch references changes (may affect chip styling)
  watch(
    references,
    async () => {
      await nextTick();
      render();
    },
    { deep: true, flush: 'post' },
  );

  // Watch container ref changes
  watch(
    containerRef,
    async (newEl, oldEl) => {
      if (resizeObserver && oldEl) {
        resizeObserver.unobserve(oldEl);
      }

      if (!newEl) return;

      await nextTick();
      render();

      if (resizeObserver) {
        lastWidth = newEl.offsetWidth;
        resizeObserver.observe(newEl);
      }
    },
    { immediate: true },
  );

  onMounted(() => {
    const el = containerRef.value;
    if (!el) return;

    // Initial render
    render();

    // Add click handler for element chips
    el.addEventListener('click', handleClick);

    // Setup ResizeObserver for width changes
    if (typeof ResizeObserver !== 'undefined') {
      lastWidth = el.offsetWidth;
      resizeObserver = new ResizeObserver(() => {
        const current = containerRef.value;
        if (!current) return;

        const currentWidth = current.offsetWidth;
        if (currentWidth !== lastWidth) {
          lastWidth = currentWidth;
          scheduleRecalculate();
        }
      });
      resizeObserver.observe(el);
    }
  });

  onUnmounted(() => {
    const el = containerRef.value;
    if (el) {
      el.removeEventListener('click', handleClick);
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return {
    height,
    isOverflowing,
    handleInput,
    handleKeyDown,
    handlePaste,
    recalculate,
    focus,
    render,
  };
}
