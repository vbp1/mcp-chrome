<template>
  <div
    v-if="open"
    class="fixed top-12 left-4 right-4 z-50 py-2 max-w-[calc(100%-2rem)]"
    :style="{
      backgroundColor: 'var(--ac-surface, #ffffff)',
      border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      borderRadius: 'var(--ac-radius-inner, 8px)',
      boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.1))',
    }"
  >
    <!-- Projects Section -->
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      {{ getMessage('projectsSectionLabel') }}
    </div>

    <!-- Project List -->
    <div class="max-h-[200px] overflow-y-auto ac-scroll">
      <button
        v-for="p in projects"
        :key="p.id"
        class="w-full px-3 py-2 text-left text-sm flex items-center justify-between ac-menu-item"
        :style="{
          color:
            selectedProjectId === p.id ? 'var(--ac-accent, #c87941)' : 'var(--ac-text, #1a1a1a)',
        }"
        @click="$emit('project:select', p.id)"
      >
        <div class="flex-1 min-w-0">
          <div class="truncate">{{ p.name }}</div>
          <div
            class="text-[10px] truncate"
            :style="{
              fontFamily: 'var(--ac-font-mono, monospace)',
              color: 'var(--ac-text-subtle, #a8a29e)',
            }"
          >
            {{ p.rootPath }}
          </div>
        </div>
        <svg
          v-if="selectedProjectId === p.id"
          class="w-4 h-4 flex-shrink-0 ml-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </button>
    </div>

    <!-- New Project -->
    <button
      class="w-full px-3 py-2 text-left text-sm ac-menu-item"
      :style="{ color: 'var(--ac-link, #3b82f6)' }"
      :disabled="isPicking"
      @click="$emit('project:new')"
    >
      {{ isPicking ? getMessage('selectingProjectStatus') : getMessage('newProjectButton') }}
    </button>

    <!-- Divider -->
    <div
      class="my-2"
      :style="{ borderTop: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)' }"
    />

    <!-- CLI & Model Settings -->
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      {{ getMessage('settingsSectionLabel') }}
    </div>

    <!-- CLI Selection -->
    <div class="px-3 py-2 flex items-center gap-2">
      <span class="text-xs w-12" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
        {{ getMessage('cliLabel') }}
      </span>
      <select
        :value="selectedCli"
        class="flex-1 px-2 py-1 text-xs rounded"
        :style="{
          backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
          border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
          color: 'var(--ac-text, #1a1a1a)',
          borderRadius: 'var(--ac-radius-button, 8px)',
        }"
        @change="handleCliChange"
      >
        <option value="">{{ getMessage('autoOption') }}</option>
        <option v-for="e in engines" :key="e.name" :value="e.name">
          {{ e.name }}
        </option>
      </select>
    </div>

    <!-- Model Selection -->
    <div class="px-3 py-2 flex items-center gap-2">
      <span class="text-xs w-12" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
        {{ getMessage('modelSettingLabel') }}
      </span>
      <select
        :value="normalizedModel"
        class="flex-1 px-2 py-1 text-xs rounded"
        :style="{
          backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
          border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
          color: 'var(--ac-text, #1a1a1a)',
          borderRadius: 'var(--ac-radius-button, 8px)',
        }"
        :disabled="isModelDisabled"
        @change="handleModelChange"
      >
        <option value="">{{ getMessage('defaultOption') }}</option>
        <option v-for="model in availableModels" :key="model.id" :value="model.id">
          {{ model.name }}
        </option>
      </select>
    </div>

    <!-- CCR Option (Claude Code Router) - only shown when Claude CLI is selected -->
    <div v-if="showCcrOption" class="px-3 py-2 flex items-center gap-2">
      <span class="text-xs w-12" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
        {{ getMessage('ccrLabel') }}
      </span>
      <label
        class="flex items-center gap-2 cursor-pointer"
        :title="getMessage('claudeCodeRouterTooltip')"
      >
        <input
          type="checkbox"
          :checked="useCcr"
          class="w-4 h-4 rounded"
          :style="{
            accentColor: 'var(--ac-accent, #c87941)',
          }"
          @change="handleCcrChange"
        />
        <span class="text-xs" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
          {{ getMessage('useClaudeCodeRouterLabel') }}
        </span>
      </label>
    </div>

    <!-- Chrome MCP Option - only shown when Claude CLI is selected -->
    <div v-if="showChromeMcpOption" class="px-3 py-2 flex items-center gap-2">
      <span class="text-xs w-12" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
        {{ getMessage('mcpLabel') }}
      </span>
      <label
        class="flex items-center gap-2 cursor-pointer"
        :title="getMessage('chromeMcpServerTooltip')"
      >
        <input
          type="checkbox"
          :checked="enableChromeMcp"
          class="w-4 h-4 rounded"
          :style="{
            accentColor: 'var(--ac-accent, #c87941)',
          }"
          @change="handleChromeMcpChange"
        />
        <span class="text-xs" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
          {{ getMessage('enableChromeMcpServerLabel') }}
        </span>
      </label>
    </div>

    <!-- Save Button -->
    <div class="px-3 py-2">
      <button
        class="w-full px-3 py-1.5 text-xs rounded transition-colors hover:opacity-90 cursor-pointer"
        :style="{
          backgroundColor: 'var(--ac-accent, #c87941)',
          color: 'var(--ac-accent-contrast, #ffffff)',
          borderRadius: 'var(--ac-radius-button, 8px)',
        }"
        :disabled="isSaving"
        @click="handleSave"
      >
        {{ isSaving ? getMessage('savingLabel') : getMessage('saveSettingsButton') }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="px-3 py-1 text-[10px]" :style="{ color: 'var(--ac-danger, #dc2626)' }">
      {{ error }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import type { AgentProject, AgentEngineInfo } from 'chrome-mcp-shared';
import {
  getModelsForCli,
  getDefaultModelForCli,
  type ModelDefinition,
} from '@/common/agent-models';
import { getMessage } from '@/utils/i18n';

const props = defineProps<{
  open: boolean;
  projects: AgentProject[];
  selectedProjectId: string;
  selectedCli: string;
  model: string;
  useCcr: boolean;
  enableChromeMcp: boolean;
  engines: AgentEngineInfo[];
  isPicking: boolean;
  isSaving: boolean;
  error: string | null;
  serverPort: number | null;
}>();

const emit = defineEmits<{
  'project:select': [projectId: string];
  'project:new': [];
  'cli:update': [cli: string];
  'model:update': [model: string];
  'ccr:update': [useCcr: boolean];
  'chrome-mcp:update': [enableChromeMcp: boolean];
  save: [];
}>();

// Dynamic models loaded from server
const dynamicModels = ref<ModelDefinition[]>([]);

async function fetchDynamicModels(engineName: string): Promise<void> {
  if (!engineName || !props.serverPort) return;
  try {
    const url = `http://127.0.0.1:${props.serverPort}/agent/engines/${engineName}/models`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const models: ModelDefinition[] = (data.models || []).map(
        (m: { id: string; name: string; description?: string }) => ({
          id: m.id,
          name: m.name,
          description: m.description,
        }),
      );
      if (models.length > 0) {
        dynamicModels.value = models;
      }
    }
  } catch {
    // Fallback to static models silently
  }
}

watch(
  () => props.selectedCli,
  (cli) => {
    dynamicModels.value = [];
    if (cli) fetchDynamicModels(cli);
  },
  { immediate: true },
);

// Get available models based on selected CLI (dynamic with static fallback)
const availableModels = computed<ModelDefinition[]>(() => {
  if (dynamicModels.value.length > 0) return dynamicModels.value;
  return getModelsForCli(props.selectedCli);
});

// Normalize model value: ensure it exists in available models or fallback to empty
const normalizedModel = computed(() => {
  const trimmedModel = props.model.trim();
  if (!trimmedModel) return '';
  // No CLI selected = model disabled, show empty (server will use default)
  if (!props.selectedCli) return '';
  const models = availableModels.value;
  // If CLI selected but no models defined, fallback to empty
  if (models.length === 0) return '';
  // Check if current model is valid for selected CLI
  const isValid = models.some((m) => m.id === trimmedModel);
  return isValid ? trimmedModel : '';
});

// Check if Model select should be disabled
const isModelDisabled = computed(() => {
  return !props.selectedCli || availableModels.value.length === 0;
});

// Show CCR option only when Claude CLI is selected
const showCcrOption = computed(() => {
  return props.selectedCli === 'claude';
});

// Show Chrome MCP option when Claude or Auto (empty) CLI is selected
const showChromeMcpOption = computed(() => {
  return !props.selectedCli || props.selectedCli === 'claude';
});

// Handle CLI change - auto-select default model for the CLI
function handleCliChange(event: Event): void {
  const cli = (event.target as HTMLSelectElement).value;
  emit('cli:update', cli);

  // Auto-select default model when CLI changes
  if (cli) {
    const defaultModel = getDefaultModelForCli(cli);
    // Validate default model exists in available models
    const models = getModelsForCli(cli);
    const isValidDefault = models.some((m) => m.id === defaultModel);
    emit('model:update', isValidDefault ? defaultModel : (models[0]?.id ?? ''));
  } else {
    emit('model:update', '');
  }

  // Reset CCR when switching away from Claude
  if (cli !== 'claude') {
    emit('ccr:update', false);
  }
}

function handleCcrChange(event: Event): void {
  emit('ccr:update', (event.target as HTMLInputElement).checked);
}

function handleChromeMcpChange(event: Event): void {
  emit('chrome-mcp:update', (event.target as HTMLInputElement).checked);
}

function handleModelChange(event: Event): void {
  const newModel = (event.target as HTMLSelectElement).value;
  emit('model:update', newModel);
}

function handleSave(): void {
  emit('save');
}
</script>
