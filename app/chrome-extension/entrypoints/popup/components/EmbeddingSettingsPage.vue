<template>
  <div class="embedding-settings-page">
    <!-- Back button -->
    <div class="page-header">
      <button class="back-button" @click="$emit('back')" :title="getMessage('backToHomeTitle')">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span>{{ getMessage('backButton') }}</span>
      </button>
      <h2 class="page-title">Embedding Settings</h2>
    </div>

    <div class="page-content">
      <!-- Provider Type Selection -->
      <div class="section">
        <h3 class="section-title">Provider</h3>
        <div class="provider-tabs">
          <button
            v-for="provider in providerTypes"
            :key="provider.type"
            :class="['provider-tab', { active: selectedProviderType === provider.type }]"
            @click="selectProviderType(provider.type)"
            :disabled="isApplying"
          >
            <component :is="provider.icon" class="tab-icon" />
            <span>{{ provider.label }}</span>
          </button>
        </div>
      </div>

      <!-- Local Provider Settings -->
      <div v-if="selectedProviderType === 'local'" class="section">
        <h3 class="section-title">Local Model</h3>

        <ProgressIndicator
          v-if="isApplying"
          :visible="isApplying"
          text="Initializing model..."
          :showSpinner="true"
        />

        <div class="model-list">
          <div
            v-for="model in localModels"
            :key="model.preset"
            :class="[
              'model-card',
              { selected: localConfig.modelPreset === model.preset, disabled: isApplying },
            ]"
            @click="!isApplying && selectLocalModel(model.preset)"
          >
            <div class="model-header">
              <div class="model-info">
                <p
                  class="model-name"
                  :class="{ 'selected-text': localConfig.modelPreset === model.preset }"
                >
                  {{ model.preset }}
                </p>
                <p class="model-description">{{ model.description }}</p>
              </div>
              <div v-if="localConfig.modelPreset === model.preset" class="check-icon">
                <CheckIcon class="text-white" />
              </div>
            </div>
            <div class="model-tags">
              <span class="model-tag performance">{{ model.performance }}</span>
              <span class="model-tag size">{{ model.size }}</span>
              <span class="model-tag dimension">{{ model.dimension }}D</span>
            </div>
          </div>
        </div>
      </div>

      <!-- OpenAI Provider Settings -->
      <div v-if="selectedProviderType === 'openai'" class="section">
        <h3 class="section-title">OpenAI API</h3>
        <div class="config-card">
          <div class="form-group">
            <label class="form-label">API Key <span class="required">*</span></label>
            <input
              type="password"
              v-model="openaiConfig.apiKey"
              class="form-input"
              placeholder="sk-..."
              :disabled="isApplying"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Model</label>
            <select v-model="openaiConfig.model" class="form-select" :disabled="isApplying">
              <option value="text-embedding-3-small">text-embedding-3-small (1536D)</option>
              <option value="text-embedding-3-large">text-embedding-3-large (3072D)</option>
              <option value="text-embedding-ada-002">text-embedding-ada-002 (1536D)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Custom Provider Settings -->
      <div v-if="selectedProviderType === 'custom'" class="section">
        <h3 class="section-title">Custom OpenAI-Compatible API</h3>
        <div class="config-card">
          <div class="form-group">
            <label class="form-label">Base URL <span class="required">*</span></label>
            <input
              type="text"
              v-model="customConfig.baseUrl"
              class="form-input"
              placeholder="http://localhost:11434/v1"
              :disabled="isApplying"
            />
            <p class="form-hint">Examples: Ollama, LM Studio, Azure OpenAI</p>
          </div>

          <div class="form-group">
            <label class="form-label">API Key <span class="optional">(optional)</span></label>
            <input
              type="password"
              v-model="customConfig.apiKey"
              class="form-input"
              placeholder="Optional for local servers"
              :disabled="isApplying"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Model Name <span class="required">*</span></label>
            <input
              type="text"
              v-model="customConfig.model"
              class="form-input"
              placeholder="nomic-embed-text"
              :disabled="isApplying"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Dimensions <span class="required">*</span></label>
            <input
              type="number"
              v-model.number="customConfig.dimensions"
              class="form-input"
              placeholder="768"
              min="1"
              :disabled="isApplying"
            />
            <p class="form-hint">Must match your model's output dimension</p>
          </div>
        </div>
      </div>

      <!-- Error Display -->
      <div v-if="errorMessage" class="error-card">
        <div class="error-content">
          <div class="error-icon">⚠️</div>
          <div class="error-details">
            <p class="error-title">Configuration Error</p>
            <p class="error-message">{{ errorMessage }}</p>
          </div>
        </div>
      </div>

      <!-- Test Result -->
      <div v-if="testResult" :class="['test-result', testResult.success ? 'success' : 'error']">
        <span v-if="testResult.success">✓ Connection successful ({{ testResult.dimension }}D)</span>
        <span v-else>✗ {{ testResult.error }}</span>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button
          v-if="selectedProviderType !== 'local'"
          class="secondary-button"
          :disabled="isApplying || isTesting || !isConfigValid"
          @click="testConnection"
        >
          <span v-if="isTesting">Testing...</span>
          <span v-else>Test Connection</span>
        </button>

        <button
          class="primary-action-button"
          :disabled="isApplying || !isConfigValid || !hasChanges"
          @click="applyConfiguration"
        >
          <span v-if="isApplying">Applying...</span>
          <span v-else>Apply Configuration</span>
        </button>
      </div>

      <!-- Current Status -->
      <div v-if="currentProviderInfo" class="current-status">
        <p class="status-label">Current Provider:</p>
        <p class="status-value">{{ currentProviderInfo }}</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { getMessage } from '@/utils/i18n';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import type {
  EmbeddingConfig,
  EmbeddingProviderType,
  OpenAIEmbeddingModel,
} from '@/utils/embedding-providers';
import ProgressIndicator from './ProgressIndicator.vue';
import { CheckIcon } from './icons';

// Inline SVG icons for provider tabs
const LocalIcon = {
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
    <path d="M4 12h2M18 12h2M12 4v2M12 18v2" stroke-linecap="round" />
  </svg>`,
};

const OpenAIIcon = {
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
  </svg>`,
};

const CustomIcon = {
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2" y="3" width="20" height="6" rx="1" />
    <rect x="2" y="15" width="20" height="6" rx="1" />
    <path d="M6 6h.01M6 18h.01" stroke-linecap="round" />
  </svg>`,
};

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'configChanged'): void;
}>();

// Provider type options
const providerTypes = [
  { type: 'local' as const, label: 'Local', icon: LocalIcon },
  { type: 'openai' as const, label: 'OpenAI', icon: OpenAIIcon },
  { type: 'custom' as const, label: 'Custom API', icon: CustomIcon },
];

// Local models list
const localModels = [
  {
    preset: 'multilingual-e5-small',
    description: 'Lightweight multilingual model (100+ languages)',
    performance: 'Fast',
    size: '116MB',
    dimension: 384,
  },
  {
    preset: 'multilingual-e5-base',
    description: 'Higher quality multilingual model',
    performance: 'Balanced',
    size: '279MB',
    dimension: 768,
  },
];

// State
const selectedProviderType = ref<EmbeddingProviderType>('local');
const originalConfig = ref<EmbeddingConfig | null>(null);
const isApplying = ref(false);
const isTesting = ref(false);
const errorMessage = ref<string | null>(null);
const testResult = ref<{ success: boolean; dimension?: number; error?: string } | null>(null);

// Local provider config
const localConfig = ref({
  modelPreset: 'multilingual-e5-small' as string,
  modelVersion: 'quantized' as const,
});

// OpenAI provider config
const openaiConfig = ref({
  apiKey: '',
  model: 'text-embedding-3-small' as OpenAIEmbeddingModel,
  dimensions: undefined as number | undefined,
});

// Custom provider config
const customConfig = ref({
  baseUrl: '',
  apiKey: '',
  model: '',
  dimensions: 768,
});

// Computed
const isConfigValid = computed(() => {
  switch (selectedProviderType.value) {
    case 'local':
      return !!localConfig.value.modelPreset;
    case 'openai':
      return !!openaiConfig.value.apiKey && !!openaiConfig.value.model;
    case 'custom':
      return (
        !!customConfig.value.baseUrl &&
        !!customConfig.value.model &&
        customConfig.value.dimensions > 0
      );
    default:
      return false;
  }
});

const hasChanges = computed(() => {
  if (!originalConfig.value) return true;

  const current = buildConfig();
  return JSON.stringify(current) !== JSON.stringify(originalConfig.value);
});

const currentProviderInfo = computed(() => {
  if (!originalConfig.value) return null;

  switch (originalConfig.value.providerType) {
    case 'local':
      return `Local (${originalConfig.value.local?.modelPreset})`;
    case 'openai':
      return `OpenAI (${originalConfig.value.openai?.model})`;
    case 'custom':
      return `Custom (${originalConfig.value.custom?.model})`;
    default:
      return null;
  }
});

// Methods
function selectProviderType(type: EmbeddingProviderType) {
  selectedProviderType.value = type;
  testResult.value = null;
  errorMessage.value = null;
}

function selectLocalModel(preset: string) {
  localConfig.value.modelPreset = preset;
  testResult.value = null;
}

function buildConfig(): EmbeddingConfig {
  const config: EmbeddingConfig = {
    providerType: selectedProviderType.value,
  };

  switch (selectedProviderType.value) {
    case 'local':
      config.local = {
        modelPreset: localConfig.value.modelPreset as any,
        modelVersion: localConfig.value.modelVersion,
      };
      break;
    case 'openai':
      config.openai = {
        apiKey: openaiConfig.value.apiKey,
        model: openaiConfig.value.model,
        dimensions: openaiConfig.value.dimensions,
      };
      break;
    case 'custom':
      config.custom = {
        baseUrl: customConfig.value.baseUrl,
        apiKey: customConfig.value.apiKey || undefined,
        model: customConfig.value.model,
        dimensions: customConfig.value.dimensions,
      };
      break;
  }

  return config;
}

async function loadConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_EMBEDDING_CONFIG,
    });

    if (response?.success && response.config) {
      originalConfig.value = response.config;
      selectedProviderType.value = response.config.providerType;

      if (response.config.local) {
        localConfig.value = { ...localConfig.value, ...response.config.local };
      }
      if (response.config.openai) {
        openaiConfig.value = { ...openaiConfig.value, ...response.config.openai };
      }
      if (response.config.custom) {
        customConfig.value = { ...customConfig.value, ...response.config.custom };
      }
    }
  } catch (error) {
    console.error('Failed to load embedding config:', error);
  }
}

async function testConnection() {
  if (!isConfigValid.value) return;

  isTesting.value = true;
  testResult.value = null;
  errorMessage.value = null;

  try {
    const config = buildConfig();
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.TEST_EMBEDDING_PROVIDER,
      config,
    });

    testResult.value = response;
  } catch (error) {
    testResult.value = {
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    };
  } finally {
    isTesting.value = false;
  }
}

async function applyConfiguration() {
  if (!isConfigValid.value) return;

  isApplying.value = true;
  errorMessage.value = null;
  testResult.value = null;

  try {
    const config = buildConfig();
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.SET_EMBEDDING_CONFIG,
      config,
    });

    if (response?.success) {
      originalConfig.value = config;
      emit('configChanged');
    } else {
      errorMessage.value = response?.error || 'Failed to apply configuration';
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to apply configuration';
  } finally {
    isApplying.value = false;
  }
}

// Watch for dimension changes in OpenAI model
onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.embedding-settings-page {
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ac-border, #e7e5e4);
  background: var(--ac-surface, #ffffff);
}

.back-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--ac-surface-muted, #f2f0eb);
  border: none;
  border-radius: var(--ac-radius-button, 8px);
  color: var(--ac-text-muted, #6e6e6e);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.back-button:hover {
  background: var(--ac-hover-bg, #f5f5f4);
  color: var(--ac-text, #1a1a1a);
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ac-text, #1a1a1a);
  margin: 0;
}

.page-content {
  padding: 16px 20px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ac-text, #374151);
  margin-bottom: 12px;
}

/* Provider Tabs */
.provider-tabs {
  display: flex;
  gap: 8px;
  background: var(--ac-surface-muted, #f5f5f4);
  padding: 4px;
  border-radius: 10px;
}

.provider-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text-muted, #6b7280);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.provider-tab:hover:not(:disabled) {
  color: var(--ac-text, #1a1a1a);
}

.provider-tab.active {
  background: var(--ac-surface, #ffffff);
  color: var(--ac-accent, #d97757);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.provider-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-icon {
  width: 16px;
  height: 16px;
}

/* Config Card */
.config-card {
  background: var(--ac-surface, white);
  border-radius: var(--ac-radius-card, 12px);
  box-shadow: var(--ac-shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  padding: 16px;
}

/* Form Elements */
.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text, #374151);
  margin-bottom: 6px;
}

.required {
  color: #ef4444;
}

.optional {
  color: var(--ac-text-muted, #9ca3af);
  font-weight: 400;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--ac-border, #d1d5db);
  border-radius: 8px;
  font-size: 14px;
  color: var(--ac-text, #1a1a1a);
  background: var(--ac-surface, white);
  transition: border-color var(--ac-motion-fast, 120ms) ease;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--ac-accent, #d97757);
}

.form-input:disabled,
.form-select:disabled {
  background: var(--ac-surface-muted, #f5f5f4);
  opacity: 0.7;
}

.form-hint {
  font-size: 12px;
  color: var(--ac-text-muted, #9ca3af);
  margin: 6px 0 0 0;
}

/* Model List */
.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-card {
  background: var(--ac-surface, white);
  border-radius: var(--ac-radius-card, 12px);
  padding: 16px;
  cursor: pointer;
  border: 1px solid var(--ac-border, #e5e7eb);
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.model-card:hover {
  border-color: var(--ac-accent, #d97757);
}

.model-card.selected {
  border: 2px solid var(--ac-accent, #d97757);
  background: var(--ac-accent-subtle, rgba(217, 119, 87, 0.08));
}

.model-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.model-info {
  flex: 1;
}

.model-name {
  font-weight: 600;
  color: var(--ac-text, #1e293b);
  margin: 0 0 4px 0;
}

.model-name.selected-text {
  color: var(--ac-accent, #d97757);
}

.model-description {
  font-size: 14px;
  color: var(--ac-text-muted, #64748b);
  margin: 0;
}

.check-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background: var(--ac-accent, #d97757);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.model-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.model-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
}

.model-tag.performance {
  background: #d1fae5;
  color: #065f46;
}

.model-tag.size {
  background: var(--ac-accent-subtle, #ddd6fe);
  color: var(--ac-accent, #5b21b6);
}

.model-tag.dimension {
  background: var(--ac-surface-muted, #e5e7eb);
  color: var(--ac-text-muted, #4b5563);
}

/* Error Card */
.error-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--ac-radius-card, 12px);
  padding: 16px;
  margin-bottom: 16px;
}

.error-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.error-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.error-details {
  flex: 1;
}

.error-title {
  font-size: 14px;
  font-weight: 600;
  color: #dc2626;
  margin: 0 0 4px 0;
}

.error-message {
  font-size: 14px;
  color: #991b1b;
  margin: 0;
}

/* Test Result */
.test-result {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
}

.test-result.success {
  background: #dcfce7;
  color: #166534;
}

.test-result.error {
  background: #fef2f2;
  color: #dc2626;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.primary-action-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--ac-accent, #d97757);
  color: var(--ac-accent-contrast, white);
  font-weight: 600;
  padding: 12px 16px;
  border-radius: var(--ac-radius-button, 8px);
  border: none;
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.primary-action-button:hover:not(:disabled) {
  background: var(--ac-accent-hover, #c4664a);
}

.primary-action-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--ac-surface, white);
  border: 1px solid var(--ac-border, #d1d5db);
  color: var(--ac-text, #374151);
  font-weight: 600;
  padding: 12px 16px;
  border-radius: var(--ac-radius-button, 8px);
  cursor: pointer;
  transition: all var(--ac-motion-fast, 120ms) ease;
}

.secondary-button:hover:not(:disabled) {
  border-color: var(--ac-accent, #d97757);
  color: var(--ac-accent, #d97757);
}

.secondary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Current Status */
.current-status {
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--ac-surface-muted, #f5f5f4);
  border-radius: 8px;
}

.status-label {
  font-size: 12px;
  color: var(--ac-text-muted, #6b7280);
  margin: 0 0 4px 0;
}

.status-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--ac-text, #1a1a1a);
  margin: 0;
}
</style>
