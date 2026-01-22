<template>
  <div
    ref="overlayRef"
    class="absolute inset-0 pointer-events-none overflow-hidden"
    :style="overlayStyle"
  >
    <!-- Mirror div that replicates textarea content with highlighted refs -->
    <div
      ref="mirrorRef"
      class="whitespace-pre-wrap break-words"
      :style="mirrorStyle"
      v-html="highlightedHtml"
    />

    <!-- Tooltip (positioned absolutely) -->
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="activeTooltip"
          ref="tooltipRef"
          class="fixed z-[9999] max-w-xs p-2 text-xs rounded-lg shadow-lg pointer-events-none"
          :style="tooltipStyle"
        >
          <div class="font-medium mb-1" :style="{ color: 'var(--ac-accent)' }">
            {{ activeTooltip.label }}
          </div>
          <div class="text-[10px] opacity-80 line-clamp-4">
            {{ activeTooltip.summary }}
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import {
  ELEMENT_REF_PATTERN,
  type ElementReferenceData,
} from '../../composables/useElementReferences';

const props = defineProps<{
  /** Reference to the textarea element */
  textareaRef: HTMLTextAreaElement | null;
  /** Current textarea value */
  value: string;
  /** Map of element number -> reference data */
  references: Map<number, ElementReferenceData>;
}>();

const emit = defineEmits<{
  /** Emitted when user clicks on a reference (for potential future use) */
  'ref:click': [num: number];
}>();

const overlayRef = ref<HTMLDivElement | null>(null);
const mirrorRef = ref<HTMLDivElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);

// Active tooltip state
const activeTooltip = ref<{
  num: number;
  label: string;
  summary: string;
  x: number;
  y: number;
} | null>(null);

// Sync scroll position with textarea
const scrollTop = ref(0);
const scrollLeft = ref(0);

/**
 * Style for the overlay container
 */
const overlayStyle = computed(() => ({
  // Match textarea padding
  padding: '12px', // p-3 = 0.75rem = 12px
}));

/**
 * Style for the mirror div (matches textarea styling)
 */
const mirrorStyle = computed(() => {
  if (!props.textareaRef) return {};

  const styles = window.getComputedStyle(props.textareaRef);
  return {
    fontFamily: styles.fontFamily || 'var(--ac-font-body)',
    fontSize: styles.fontSize || '14px',
    lineHeight: styles.lineHeight || '1.5',
    letterSpacing: styles.letterSpacing,
    wordSpacing: styles.wordSpacing,
    // Offset by scroll position
    transform: `translate(-${scrollLeft.value}px, -${scrollTop.value}px)`,
    // Make text transparent - we only show highlighted parts
    color: 'transparent',
  };
});

/**
 * Style for the tooltip
 */
const tooltipStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  color: 'var(--ac-text)',
  left: `${activeTooltip.value?.x ?? 0}px`,
  top: `${activeTooltip.value?.y ?? 0}px`,
}));

/**
 * Generate HTML with highlighted @Element_N references
 */
const highlightedHtml = computed(() => {
  if (!props.value) return '';

  // Escape HTML entities
  let html = props.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Replace @Element_N with highlighted spans
  // Use a non-global regex to process one at a time for proper indexing
  const regex = /@Element_(\d+)/g;
  html = html.replace(regex, (match, numStr) => {
    const num = parseInt(numStr, 10);
    const hasRef = props.references.has(num);
    const className = hasRef ? 'element-ref' : 'element-ref element-ref--invalid';
    return `<span class="${className}" data-ref-num="${num}">${match}</span>`;
  });

  return html;
});

/**
 * Handle scroll sync with textarea
 */
function syncScroll(): void {
  if (props.textareaRef) {
    scrollTop.value = props.textareaRef.scrollTop;
    scrollLeft.value = props.textareaRef.scrollLeft;
  }
}

/**
 * Handle mouse move over overlay to show tooltips
 */
function handleMouseMove(event: MouseEvent): void {
  if (!mirrorRef.value) return;

  // Find element under cursor
  const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
  const refSpan = elementsAtPoint.find((el) => el.classList.contains('element-ref')) as
    | HTMLElement
    | undefined;

  if (refSpan) {
    const numStr = refSpan.dataset.refNum;
    if (numStr) {
      const num = parseInt(numStr, 10);
      const refData = props.references.get(num);
      if (refData) {
        activeTooltip.value = {
          num,
          label: `@Element_${num}`,
          summary: refData.summary,
          x: event.clientX + 10,
          y: event.clientY + 10,
        };
        return;
      }
    }
  }

  // No ref under cursor
  activeTooltip.value = null;
}

/**
 * Handle mouse leave from overlay
 */
function handleMouseLeave(): void {
  activeTooltip.value = null;
}

// Set up scroll sync and mouse tracking
onMounted(() => {
  if (props.textareaRef) {
    props.textareaRef.addEventListener('scroll', syncScroll);
  }

  // Enable pointer events on the ref spans for hover detection
  // We need to do this via CSS since the overlay is pointer-events: none
  nextTick(() => {
    if (overlayRef.value) {
      // Actually, we'll track mouse on the textarea and calculate position
      const parent = overlayRef.value.parentElement;
      if (parent) {
        parent.addEventListener('mousemove', handleMouseMove);
        parent.addEventListener('mouseleave', handleMouseLeave);
      }
    }
  });
});

onUnmounted(() => {
  if (props.textareaRef) {
    props.textareaRef.removeEventListener('scroll', syncScroll);
  }

  if (overlayRef.value) {
    const parent = overlayRef.value.parentElement;
    if (parent) {
      parent.removeEventListener('mousemove', handleMouseMove);
      parent.removeEventListener('mouseleave', handleMouseLeave);
    }
  }
});

// Re-sync when textarea ref changes
watch(
  () => props.textareaRef,
  (newRef, oldRef) => {
    if (oldRef) {
      oldRef.removeEventListener('scroll', syncScroll);
    }
    if (newRef) {
      newRef.addEventListener('scroll', syncScroll);
      syncScroll();
    }
  },
);
</script>

<style scoped>
/* Tooltip fade transition */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>

<style>
/* Global styles for highlighted refs (needed because v-html) */
.element-ref {
  background-color: var(--ac-accent);
  color: var(--ac-accent-contrast);
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 500;
}

.element-ref--invalid {
  background-color: var(--ac-error);
  opacity: 0.7;
}
</style>
