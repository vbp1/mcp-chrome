<template>
  <div class="text-sm font-semibold leading-relaxed" :style="{ color: 'var(--ac-text)' }">
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="segment.type === 'text'" class="whitespace-pre-wrap">{{ segment.content }}</span>
      <span
        v-else-if="segment.type === 'element'"
        class="element-ref-chip"
        :title="segment.summary || `Element ${segment.elementNum}`"
        @click="handleChipClick(segment)"
        >@Element_{{ segment.elementNum }}</span
      >
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, type Ref } from 'vue';
import type { ThreadHeader } from '../../composables/useAgentThreads';
import { ELEMENT_REFERENCES_KEY } from '../../composables/useElementReferences';
import type { ElementReferenceData } from 'chrome-mcp-shared';

const props = defineProps<{
  title: string;
  metadata?: ThreadHeader;
}>();

// Inject element references from parent
const elementReferences = inject<Ref<Map<number, ElementReferenceData>>>(
  ELEMENT_REFERENCES_KEY,
  undefined,
);

// Pattern to match @Element_N references
const ELEMENT_REF_PATTERN = /@Element_(\d+)/g;

interface TextSegment {
  type: 'text';
  content: string;
}

interface ElementSegment {
  type: 'element';
  elementNum: number;
  summary?: string;
  selector?: string;
  selectorType?: 'css' | 'xpath';
  pageUrl?: string;
}

type Segment = TextSegment | ElementSegment;

/**
 * Get element reference data by number.
 * Priority: 1) metadata.elementReferences (persisted), 2) injected refs (current session)
 */
function getRefData(elementNum: number): ElementReferenceData | undefined {
  // First try metadata (persisted with message)
  const metaRefs = props.metadata?.elementReferences;
  if (metaRefs) {
    const ref = metaRefs[String(elementNum)];
    if (ref) return ref;
  }
  // Fall back to injected refs (current session only)
  return elementReferences?.value?.get(elementNum);
}

// Parse title into segments (text and element references)
const segments = computed<Segment[]>(() => {
  const text = props.title;
  const result: Segment[] = [];
  let lastIndex = 0;

  // Reset regex state
  ELEMENT_REF_PATTERN.lastIndex = 0;

  let match;
  while ((match = ELEMENT_REF_PATTERN.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      result.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    // Add element reference
    const elementNum = parseInt(match[1], 10);
    const refData = getRefData(elementNum);

    result.push({
      type: 'element',
      elementNum,
      summary: refData?.summary,
      selector: refData?.selector,
      selectorType: refData?.selectorType,
      pageUrl: refData?.pageUrl,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return result;
});

// Handle chip click - highlight element in browser
async function handleChipClick(segment: ElementSegment): Promise<void> {
  if (!segment.selector || !segment.pageUrl) return;

  try {
    // Find tabs with matching URL
    const tabs = await chrome.tabs.query({ url: segment.pageUrl });
    if (tabs.length === 0) {
      // Try with wildcard pattern
      const urlObj = new URL(segment.pageUrl);
      const pattern = `${urlObj.origin}${urlObj.pathname}*`;
      const wildcardTabs = await chrome.tabs.query({ url: pattern });
      if (wildcardTabs.length === 0) return;
      tabs.push(...wildcardTabs);
    }

    const tab = tabs[0];
    if (!tab.id) return;

    // Inject element-marker script if needed
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['inject-scripts/element-marker.js'],
    });

    // Send highlight message
    await chrome.tabs.sendMessage(tab.id, {
      action: 'element_marker_highlight',
      selector: segment.selector,
      selectorType: segment.selectorType || 'css',
      listMode: false,
    });

    // Focus the tab
    await chrome.tabs.update(tab.id, { active: true });
  } catch (error) {
    console.warn('Failed to highlight element:', error);
  }
}
</script>

<style scoped>
.element-ref-chip {
  display: inline;
  background-color: var(--ac-accent);
  color: var(--ac-accent-contrast);
  border-radius: 3px;
  padding: 0 3px;
  margin: 0 1px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.element-ref-chip:hover {
  opacity: 0.85;
}
</style>
