<template>
  <div class="flex flex-col gap-2">
    <!-- Root override -->
    <div class="flex items-center gap-2">
      <span class="whitespace-nowrap">Root override</span>
      <input
        :value="projectRoot"
        class="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
        placeholder="Optional override path; defaults to selected project workspace"
        @input="$emit('update:project-root', ($event.target as HTMLInputElement).value)"
        @change="$emit('save-root')"
      />
      <button
        class="btn-secondary !px-2 !py-1 text-[11px]"
        type="button"
        :disabled="isSavingRoot"
        @click="$emit('save-root')"
      >
        {{ isSavingRoot ? 'Saving...' : 'Save' }}
      </button>
    </div>

    <!-- CLI & Model selection -->
    <div class="flex items-center gap-2">
      <span class="whitespace-nowrap">CLI</span>
      <select
        :value="selectedCli"
        class="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
        @change="handleCliChange"
      >
        <option value="">Auto (per project / server default)</option>
        <option v-for="e in engines" :key="e.name" :value="e.name">
          {{ e.name }}
        </option>
      </select>
      <span class="whitespace-nowrap">Model</span>
      <select
        :value="model"
        class="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
        @change="$emit('update:model', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Default</option>
        <option v-for="m in availableModels" :key="m.id" :value="m.id">
          {{ m.name }}
        </option>
      </select>
      <!-- CCR option (Claude Code Router) - only shown when Claude CLI is selected -->
      <label
        v-if="showCcrOption"
        class="flex items-center gap-1 whitespace-nowrap cursor-pointer"
        title="Use Claude Code Router for API routing"
      >
        <input
          type="checkbox"
          :checked="useCcr"
          class="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          @change="$emit('update:use-ccr', ($event.target as HTMLInputElement).checked)"
        />
        <span class="text-[11px] text-slate-600">CCR</span>
      </label>
      <button
        class="btn-secondary !px-2 !py-1 text-[11px]"
        type="button"
        :disabled="!selectedProject || isSavingPreference"
        @click="$emit('save-preference')"
      >
        {{ isSavingPreference ? 'Saving...' : 'Save' }}
      </button>
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

const props = defineProps<{
  projectRoot: string;
  selectedCli: string;
  model: string;
  useCcr: boolean;
  engines: AgentEngineInfo[];
  selectedProject: AgentProject | null;
  isSavingRoot: boolean;
  isSavingPreference: boolean;
  serverPort: number | null;
}>();

const emit = defineEmits<{
  'update:project-root': [value: string];
  'update:selected-cli': [value: string];
  'update:model': [value: string];
  'update:use-ccr': [value: boolean];
  'save-root': [];
  'save-preference': [];
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

// Show CCR option only when Claude CLI is selected
const showCcrOption = computed(() => {
  return props.selectedCli === 'claude';
});

// Handle CLI change - auto-select default model for the CLI
function handleCliChange(event: Event): void {
  const cli = (event.target as HTMLSelectElement).value;
  emit('update:selected-cli', cli);

  // Auto-select default model when CLI changes
  if (cli) {
    const defaultModel = getDefaultModelForCli(cli);
    emit('update:model', defaultModel);
  } else {
    emit('update:model', '');
  }

  // Reset CCR when switching away from Claude
  if (cli !== 'claude') {
    emit('update:use-ccr', false);
  }
}
</script>
