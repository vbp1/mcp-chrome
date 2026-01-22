import { ref, computed, type InjectionKey, type Ref } from 'vue';
import type { ElementReferenceData } from 'chrome-mcp-shared';

/**
 * Injection key for element references map.
 * Provided by AgentChat.vue for child components to access element data.
 */
export const ELEMENT_REFERENCES_KEY: InjectionKey<Ref<Map<number, ElementReferenceData>>> =
  Symbol('elementReferences');

/**
 * Element reference data stored for each @Element_N reference
 * @deprecated Use ElementReferenceData from chrome-mcp-shared instead
 */
export interface ElementReferenceData {
  /** The full markdown text to send to LLM */
  fullText: string;
  /** Short summary for tooltip display */
  summary: string;
  /** Original selector for identification */
  selector: string;
  /** Selector type: 'css' or 'xpath' */
  selectorType: 'css' | 'xpath';
  /** Page URL where element was captured */
  pageUrl: string;
}

/**
 * Regex pattern to match @Element_N references in text
 */
export const ELEMENT_REF_PATTERN = /@Element_(\d+)/g;

/**
 * Composable for managing @Element_N references in chat input.
 *
 * Features:
 * - Stores mapping between @Element_N and full element data
 * - Counter resets on session change
 * - Provides functions to add, get, and expand references
 * - Detects and cleans up broken/partial references
 */
export function useElementReferences() {
  // Counter for generating unique element numbers (1-based)
  const counter = ref(0);

  // Map of element number -> reference data
  const references = ref<Map<number, ElementReferenceData>>(new Map());

  /**
   * Add a new element reference and return the @Element_N string
   */
  function addReference(data: ElementReferenceData): string {
    counter.value += 1;
    const num = counter.value;
    references.value.set(num, data);
    return `@Element_${num}`;
  }

  /**
   * Get reference data by number
   */
  function getReference(num: number): ElementReferenceData | undefined {
    return references.value.get(num);
  }

  /**
   * Get all current references
   */
  const allReferences = computed(() => {
    return new Map(references.value);
  });

  /**
   * Check if a specific reference exists
   */
  function hasReference(num: number): boolean {
    return references.value.has(num);
  }

  /**
   * Expand all @Element_N references in text to their full text
   * Used when sending message to LLM
   */
  function expandReferences(text: string): string {
    return text.replace(ELEMENT_REF_PATTERN, (match, numStr) => {
      const num = parseInt(numStr, 10);
      const ref = references.value.get(num);
      if (ref) {
        return ref.fullText;
      }
      // Reference not found, leave as-is (shouldn't happen normally)
      return match;
    });
  }

  /**
   * Find all @Element_N patterns in text and return their numbers
   */
  function findReferencesInText(text: string): number[] {
    const found: number[] = [];
    const regex = new RegExp(ELEMENT_REF_PATTERN.source, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      found.push(parseInt(match[1], 10));
    }
    return found;
  }

  /**
   * Check for broken references (partial deletions like "@Element" without number)
   * Returns positions of broken refs that should be auto-deleted
   */
  function findBrokenReferences(text: string): Array<{ start: number; end: number }> {
    const broken: Array<{ start: number; end: number }> = [];

    // Match "@Element" that is NOT followed by "_" and digit(s)
    // This catches partial deletions like "@Element" or "@Element_"
    const brokenPattern = /@Element(?:_(?!\d))?(?![_\d])/g;
    let match;
    while ((match = brokenPattern.exec(text)) !== null) {
      broken.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return broken;
  }

  /**
   * Remove broken references from text
   * Called on input change to auto-clean partial deletions
   */
  function cleanBrokenReferences(text: string): string {
    // Remove "@Element" without valid number suffix
    return text.replace(/@Element(?:_(?!\d))?(?![_\d])/g, '');
  }

  /**
   * Reset all references (call on session change)
   */
  function reset(): void {
    counter.value = 0;
    references.value.clear();
  }

  /**
   * Remove references that are no longer in the text
   * Call this after text changes to keep the map clean
   */
  function pruneUnusedReferences(text: string): void {
    const usedNums = new Set(findReferencesInText(text));
    for (const num of references.value.keys()) {
      if (!usedNums.has(num)) {
        references.value.delete(num);
      }
    }
  }

  /**
   * Extract references data for all @Element_N in text
   * Used when saving message to persist reference data
   * Returns a record of { "1": {...}, "2": {...} } for serialization
   */
  function extractReferencesForText(
    text: string,
  ): Record<string, ElementReferenceData> | undefined {
    const nums = findReferencesInText(text);
    if (nums.length === 0) return undefined;

    const result: Record<string, ElementReferenceData> = {};
    for (const num of nums) {
      const ref = references.value.get(num);
      if (ref) {
        result[String(num)] = ref;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  return {
    // State
    counter,
    references,
    allReferences,

    // Methods
    addReference,
    getReference,
    hasReference,
    expandReferences,
    findReferencesInText,
    findBrokenReferences,
    cleanBrokenReferences,
    pruneUnusedReferences,
    extractReferencesForText,
    reset,
  };
}

export type UseElementReferences = ReturnType<typeof useElementReferences>;
