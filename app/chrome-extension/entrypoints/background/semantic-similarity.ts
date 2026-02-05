import type { ModelPreset } from '@/utils/semantic-similarity-engine';
import { OffscreenManager } from '@/utils/offscreen-manager';
import { BACKGROUND_MESSAGE_TYPES, OFFSCREEN_MESSAGE_TYPES } from '@/common/message-types';
import { STORAGE_KEYS, ERROR_MESSAGES } from '@/common/constants';
import { hasAnyModelCache } from '@/utils/semantic-similarity-engine';
import type { EmbeddingConfig } from '@/utils/embedding-providers';
import { EmbeddingProviderManager } from '@/utils/embedding-providers';

/**
 * Model configuration state management interface
 */
interface ModelConfig {
  modelPreset: ModelPreset;
  modelVersion: 'full' | 'quantized' | 'compressed';
  modelDimension: number;
}

let currentBackgroundModelConfig: ModelConfig | null = null;

/**
 * Initialize embedding provider on startup.
 *
 * Flow:
 * 1. Check if embeddingConfig exists in storage (new config format)
 *    - If yes: use EmbeddingProviderManager to initialize the configured provider
 * 2. If no embeddingConfig, check for local model cache (backward compatibility)
 *    - If cache exists: initialize default local provider
 * 3. If nothing configured: skip initialization, wait for user to configure
 */
export async function initializeSemanticEngineIfCached(): Promise<boolean> {
  try {
    console.log('Background: Checking embedding provider configuration...');

    // First, check if new embeddingConfig exists
    const storageResult = await chrome.storage.local.get(['embeddingConfig']);
    const embeddingConfig = storageResult.embeddingConfig as EmbeddingConfig | undefined;

    if (embeddingConfig) {
      console.log(
        `Background: Found embedding config (${embeddingConfig.providerType}), initializing...`,
      );

      // For local provider, verify model files are actually cached before attempting initialization
      if (embeddingConfig.providerType === 'local') {
        const hasCachedModel = await hasAnyModelCache();
        if (!hasCachedModel) {
          console.log(
            'Background: Local provider configured but model not cached yet, skipping initialization',
          );
          return false;
        }
      }

      try {
        const manager = EmbeddingProviderManager.getInstance();
        await manager.initializeProvider(embeddingConfig);

        // Initialize ContentIndexer
        try {
          const { getGlobalContentIndexer } = await import('@/utils/content-indexer');
          const contentIndexer = getGlobalContentIndexer();
          contentIndexer.startSemanticEngineInitialization();
          console.log('Background: ContentIndexer initialization triggered');
        } catch (indexerError) {
          console.warn('Background: Failed to initialize ContentIndexer:', indexerError);
        }

        await updateModelStatus('ready', 100);
        return true;
      } catch (error) {
        console.error('Background: Failed to initialize embedding provider:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateModelStatus('error', 0, errorMessage, 'unknown');
        return false;
      }
    }

    // Backward compatibility: check for local model cache
    const hasCachedModel = await hasAnyModelCache();
    if (!hasCachedModel) {
      console.log(
        'Background: No embedding config or cached models found, skipping initialization',
      );
      return false;
    }

    // Initialize with default local provider (legacy path)
    console.log('Background: Found cached local models, initializing default local provider...');
    await initializeDefaultSemanticEngine();
    return true;
  } catch (error) {
    console.error('Background: Error during embedding provider initialization:', error);
    return false;
  }
}

/**
 * Initialize default semantic engine model
 */
export async function initializeDefaultSemanticEngine(): Promise<void> {
  try {
    console.log('Background: Initializing default semantic engine...');

    // Update status to initializing
    await updateModelStatus('initializing', 0);

    const result = await chrome.storage.local.get([STORAGE_KEYS.SEMANTIC_MODEL, 'selectedVersion']);
    const defaultModel =
      (result[STORAGE_KEYS.SEMANTIC_MODEL] as ModelPreset) || 'multilingual-e5-small';
    const defaultVersion =
      (result.selectedVersion as 'full' | 'quantized' | 'compressed') || 'quantized';

    const { PREDEFINED_MODELS } = await import('@/utils/semantic-similarity-engine');
    const modelInfo = PREDEFINED_MODELS[defaultModel];

    await OffscreenManager.getInstance().ensureOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: OFFSCREEN_MESSAGE_TYPES.SIMILARITY_ENGINE_INIT,
      config: {
        useLocalFiles: false,
        modelPreset: defaultModel,
        modelVersion: defaultVersion,
        modelDimension: modelInfo.dimension,
        forceOffscreen: true,
      },
    });

    if (response && response.success) {
      currentBackgroundModelConfig = {
        modelPreset: defaultModel,
        modelVersion: defaultVersion,
        modelDimension: modelInfo.dimension,
      };
      console.log('Semantic engine initialized successfully:', currentBackgroundModelConfig);

      // Update status to ready
      await updateModelStatus('ready', 100);

      // Also initialize ContentIndexer now that semantic engine is ready
      try {
        const { getGlobalContentIndexer } = await import('@/utils/content-indexer');
        const contentIndexer = getGlobalContentIndexer();
        contentIndexer.startSemanticEngineInitialization();
        console.log('ContentIndexer initialization triggered after semantic engine initialization');
      } catch (indexerError) {
        console.warn(
          'Failed to initialize ContentIndexer after semantic engine initialization:',
          indexerError,
        );
      }
    } else {
      const errorMessage = response?.error || ERROR_MESSAGES.TOOL_EXECUTION_FAILED;
      await updateModelStatus('error', 0, errorMessage, 'unknown');
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Background: Failed to initialize default semantic engine:', error);
    const errorMessage = error?.message || 'Unknown error during semantic engine initialization';
    await updateModelStatus('error', 0, errorMessage, 'unknown');
    // Don't throw error, let the extension continue running
  }
}

/**
 * Check if model switch is needed
 */
function needsModelSwitch(
  modelPreset: ModelPreset,
  modelVersion: 'full' | 'quantized' | 'compressed',
  modelDimension?: number,
): boolean {
  if (!currentBackgroundModelConfig) {
    return true;
  }

  const keyFields = ['modelPreset', 'modelVersion', 'modelDimension'];
  for (const field of keyFields) {
    const newValue =
      field === 'modelPreset'
        ? modelPreset
        : field === 'modelVersion'
          ? modelVersion
          : modelDimension;
    if (newValue !== currentBackgroundModelConfig[field as keyof ModelConfig]) {
      return true;
    }
  }

  return false;
}

/**
 * Handle model switching
 */
export async function handleModelSwitch(
  modelPreset: ModelPreset,
  modelVersion: 'full' | 'quantized' | 'compressed' = 'quantized',
  modelDimension?: number,
  previousDimension?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const needsSwitch = needsModelSwitch(modelPreset, modelVersion, modelDimension);
    if (!needsSwitch) {
      await updateModelStatus('ready', 100);
      return { success: true };
    }

    await updateModelStatus('downloading', 0);

    try {
      await OffscreenManager.getInstance().ensureOffscreenDocument();
    } catch (offscreenError) {
      console.error('Background: Failed to create offscreen document:', offscreenError);
      const errorMessage = `Failed to create offscreen document: ${offscreenError}`;
      await updateModelStatus('error', 0, errorMessage, 'unknown');
      return { success: false, error: errorMessage };
    }

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: OFFSCREEN_MESSAGE_TYPES.SIMILARITY_ENGINE_INIT,
      config: {
        useLocalFiles: false,
        modelPreset: modelPreset,
        modelVersion: modelVersion,
        modelDimension: modelDimension,
        forceOffscreen: true,
      },
    });

    if (response && response.success) {
      currentBackgroundModelConfig = {
        modelPreset: modelPreset,
        modelVersion: modelVersion,
        modelDimension: modelDimension!,
      };

      // Only reinitialize ContentIndexer when dimension changes
      try {
        if (modelDimension && previousDimension && modelDimension !== previousDimension) {
          const { getGlobalContentIndexer } = await import('@/utils/content-indexer');
          const contentIndexer = getGlobalContentIndexer();
          await contentIndexer.reinitialize();
        }
      } catch (indexerError) {
        console.warn('Background: Failed to reinitialize ContentIndexer:', indexerError);
      }

      await updateModelStatus('ready', 100);
      return { success: true };
    } else {
      const errorMessage = response?.error || 'Failed to switch model';
      const errorType = analyzeErrorType(errorMessage);
      await updateModelStatus('error', 0, errorMessage, errorType);
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('Model switch failed:', error);
    const errorMessage = error.message || 'Unknown error';
    const errorType = analyzeErrorType(errorMessage);
    await updateModelStatus('error', 0, errorMessage, errorType);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get model status
 */
export async function handleGetModelStatus(): Promise<{
  success: boolean;
  status?: any;
  error?: string;
}> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.error('Background: chrome.storage.local is not available for status query');
      return {
        success: true,
        status: {
          initializationStatus: 'idle',
          downloadProgress: 0,
          isDownloading: false,
          lastUpdated: Date.now(),
        },
      };
    }

    const result = await chrome.storage.local.get(['modelState']);
    const modelState = result.modelState || {
      status: 'idle',
      downloadProgress: 0,
      isDownloading: false,
      lastUpdated: Date.now(),
    };

    return {
      success: true,
      status: {
        initializationStatus: modelState.status,
        downloadProgress: modelState.downloadProgress,
        isDownloading: modelState.isDownloading,
        lastUpdated: modelState.lastUpdated,
        errorMessage: modelState.errorMessage,
        errorType: modelState.errorType,
      },
    };
  } catch (error: any) {
    console.error('Failed to get model status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update model status
 */
export async function updateModelStatus(
  status: string,
  progress: number,
  errorMessage?: string,
  errorType?: string,
): Promise<void> {
  try {
    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.error('Background: chrome.storage.local is not available for status update');
      return;
    }

    const modelState = {
      status,
      downloadProgress: progress,
      isDownloading: status === 'downloading' || status === 'initializing',
      lastUpdated: Date.now(),
      errorMessage: errorMessage || '',
      errorType: errorType || '',
    };
    await chrome.storage.local.set({ modelState });
  } catch (error) {
    console.error('Failed to update model status:', error);
  }
}

/**
 * Handle model status updates from offscreen document
 */
export async function handleUpdateModelStatus(
  modelState: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.error('Background: chrome.storage.local is not available');
      return { success: false, error: 'chrome.storage.local is not available' };
    }

    await chrome.storage.local.set({ modelState });
    return { success: true };
  } catch (error: any) {
    console.error('Background: Failed to update model status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Analyze error type based on error message
 */
function analyzeErrorType(errorMessage: string): 'network' | 'file' | 'unknown' {
  const message = errorMessage.toLowerCase();

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('cors') ||
    message.includes('failed to fetch')
  ) {
    return 'network';
  }

  if (
    message.includes('corrupt') ||
    message.includes('invalid') ||
    message.includes('format') ||
    message.includes('parse') ||
    message.includes('decode') ||
    message.includes('onnx')
  ) {
    return 'file';
  }

  return 'unknown';
}

/**
 * Initialize semantic similarity module message listeners
 */
export const initSemanticSimilarityListener = () => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === BACKGROUND_MESSAGE_TYPES.SWITCH_SEMANTIC_MODEL) {
      handleModelSwitch(
        message.modelPreset,
        message.modelVersion,
        message.modelDimension,
        message.previousDimension,
      )
        .then((result: { success: boolean; error?: string }) => sendResponse(result))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    } else if (message.type === BACKGROUND_MESSAGE_TYPES.GET_MODEL_STATUS) {
      handleGetModelStatus()
        .then((result: { success: boolean; status?: any; error?: string }) => sendResponse(result))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    } else if (message.type === BACKGROUND_MESSAGE_TYPES.UPDATE_MODEL_STATUS) {
      handleUpdateModelStatus(message.modelState)
        .then((result: { success: boolean; error?: string }) => sendResponse(result))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    } else if (message.type === BACKGROUND_MESSAGE_TYPES.INITIALIZE_SEMANTIC_ENGINE) {
      initializeDefaultSemanticEngine()
        .then(() => sendResponse({ success: true }))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    } else if (message.type === BACKGROUND_MESSAGE_TYPES.GET_EMBEDDING_CONFIG) {
      handleGetEmbeddingConfig()
        .then((result) => sendResponse(result))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    } else if (message.type === BACKGROUND_MESSAGE_TYPES.SET_EMBEDDING_CONFIG) {
      handleSetEmbeddingConfig(message.config)
        .then((result) => sendResponse(result))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    } else if (message.type === BACKGROUND_MESSAGE_TYPES.TEST_EMBEDDING_PROVIDER) {
      handleTestEmbeddingProvider(message.config)
        .then((result) => sendResponse(result))
        .catch((error: any) => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });
};

// ============================================================
// Embedding Provider Configuration Handlers
// ============================================================

/**
 * Get current embedding configuration
 */
export async function handleGetEmbeddingConfig(): Promise<{
  success: boolean;
  config?: EmbeddingConfig;
  state?: { status: string; dimension?: number; error?: string };
  error?: string;
}> {
  try {
    const manager = EmbeddingProviderManager.getInstance();
    const config = await manager.loadConfig();
    const state = manager.getState();

    return {
      success: true,
      config,
      state: {
        status: state.status,
        dimension: state.dimension,
        error: state.error,
      },
    };
  } catch (error: any) {
    console.error('Background: Failed to get embedding config:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Set embedding configuration and reinitialize provider
 */
export async function handleSetEmbeddingConfig(config: EmbeddingConfig): Promise<{
  success: boolean;
  dimension?: number;
  error?: string;
}> {
  try {
    console.log('Background: Setting embedding config:', config.providerType);

    const manager = EmbeddingProviderManager.getInstance();
    await manager.initializeProvider(config);

    // Reinitialize ContentIndexer if needed
    try {
      const { getGlobalContentIndexer } = await import('@/utils/content-indexer');
      const contentIndexer = getGlobalContentIndexer();
      await contentIndexer.reinitialize();
      console.log('Background: ContentIndexer reinitialized after embedding config change');
    } catch (indexerError) {
      console.warn('Background: Failed to reinitialize ContentIndexer:', indexerError);
      // Don't fail the whole operation if ContentIndexer fails
    }

    return {
      success: true,
      dimension: manager.currentDimension ?? undefined,
    };
  } catch (error: any) {
    console.error('Background: Failed to set embedding config:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test embedding provider configuration without saving
 */
export async function handleTestEmbeddingProvider(config: EmbeddingConfig): Promise<{
  success: boolean;
  dimension?: number;
  error?: string;
}> {
  try {
    console.log('Background: Testing embedding provider:', config.providerType);

    const manager = EmbeddingProviderManager.getInstance();
    const result = await manager.testProvider(config);

    return result;
  } catch (error: any) {
    console.error('Background: Failed to test embedding provider:', error);
    return { success: false, error: error.message };
  }
}
