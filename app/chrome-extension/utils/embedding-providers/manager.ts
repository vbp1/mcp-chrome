/**
 * Embedding Provider Manager
 *
 * Singleton manager for embedding providers.
 * Handles:
 * - Loading/saving configuration from chrome.storage.local
 * - Creating appropriate provider based on configuration
 * - Detecting dimension changes and clearing vector database
 * - Providing unified interface for ContentIndexer
 */

import type { EmbeddingProvider, EmbeddingConfig } from './types';
import { DEFAULT_EMBEDDING_CONFIG, getConfigDimension, validateConfig } from './types';
import { LocalEmbeddingProvider } from './local-provider';
import { OpenAIEmbeddingProvider } from './openai-provider';
import { PREDEFINED_MODELS } from '../semantic-similarity-engine';
import { clearAllVectorData } from '../vector-database';

// Storage key for embedding configuration
const STORAGE_KEY = 'embeddingConfig';

// ============================================================
// Provider Status Types
// ============================================================

export type ProviderStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface ProviderState {
  status: ProviderStatus;
  error?: string;
  dimension?: number;
  providerType?: string;
}

// ============================================================
// Embedding Provider Manager
// ============================================================

/**
 * Singleton manager for embedding providers.
 */
export class EmbeddingProviderManager {
  private static instance: EmbeddingProviderManager | null = null;
  private provider: EmbeddingProvider | null = null;
  private config: EmbeddingConfig | null = null;
  private previousDimension: number | null = null;
  private previousConfigFingerprint: string | null = null;
  private _status: ProviderStatus = 'idle';
  private _error: string | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): EmbeddingProviderManager {
    if (!EmbeddingProviderManager.instance) {
      EmbeddingProviderManager.instance = new EmbeddingProviderManager();
    }
    return EmbeddingProviderManager.instance;
  }

  /**
   * Reset the singleton (for testing purposes).
   */
  static resetInstance(): void {
    if (EmbeddingProviderManager.instance) {
      EmbeddingProviderManager.instance.provider = null;
      EmbeddingProviderManager.instance.config = null;
      EmbeddingProviderManager.instance.previousDimension = null;
      EmbeddingProviderManager.instance.previousConfigFingerprint = null;
      EmbeddingProviderManager.instance._status = 'idle';
      EmbeddingProviderManager.instance._error = null;
    }
    EmbeddingProviderManager.instance = null;
  }

  // ============================================================
  // Status Getters
  // ============================================================

  get status(): ProviderStatus {
    return this._status;
  }

  get error(): string | null {
    return this._error;
  }

  get currentConfig(): EmbeddingConfig | null {
    return this.config;
  }

  get currentDimension(): number | null {
    return this.provider?.dimension ?? null;
  }

  get isInitialized(): boolean {
    return this.provider?.isInitialized ?? false;
  }

  /**
   * Get current provider state for UI display.
   */
  getState(): ProviderState {
    return {
      status: this._status,
      error: this._error ?? undefined,
      dimension: this.provider?.dimension,
      providerType: this.config?.providerType,
    };
  }

  // ============================================================
  // Config Fingerprinting (for detecting model/provider changes)
  // ============================================================

  /**
   * Generate a unique fingerprint for an embedding configuration.
   * Used to detect when the embedding source has changed
   * (even if dimensions remain the same).
   */
  private getConfigFingerprint(config: EmbeddingConfig): string {
    switch (config.providerType) {
      case 'local':
        return `local:${config.local?.modelPreset}:${config.local?.modelVersion}`;
      case 'openai':
        return `openai:${config.openai?.model}`;
      case 'custom':
        // Include baseUrl to handle different servers with same model name
        return `custom:${config.custom?.baseUrl}:${config.custom?.model}`;
      default:
        return `unknown:${config.providerType}`;
    }
  }

  // ============================================================
  // Configuration Management
  // ============================================================

  /**
   * Load configuration from chrome.storage.local.
   */
  async loadConfig(): Promise<EmbeddingConfig> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);

      if (result[STORAGE_KEY]) {
        const config = result[STORAGE_KEY] as EmbeddingConfig;
        console.log('[EmbeddingProviderManager] Loaded config from storage:', config.providerType);
        return config;
      }
    } catch (error) {
      console.warn('[EmbeddingProviderManager] Failed to load config from storage:', error);
    }

    console.log('[EmbeddingProviderManager] Using default config');
    return DEFAULT_EMBEDDING_CONFIG;
  }

  /**
   * Save configuration to chrome.storage.local.
   */
  async saveConfig(config: EmbeddingConfig): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
      this.config = config;
      console.log('[EmbeddingProviderManager] Saved config to storage:', config.providerType);
    } catch (error) {
      console.error('[EmbeddingProviderManager] Failed to save config to storage:', error);
      throw error;
    }
  }

  // ============================================================
  // Provider Management
  // ============================================================

  /**
   * Get the current provider, initializing if necessary.
   */
  async getProvider(): Promise<EmbeddingProvider> {
    if (this.provider && this.provider.isInitialized) {
      return this.provider;
    }

    await this.initializeProvider();
    return this.provider!;
  }

  /**
   * Initialize or reinitialize the provider with the given (or loaded) configuration.
   * @param config - Optional configuration; if not provided, loads from storage
   */
  async initializeProvider(config?: EmbeddingConfig): Promise<void> {
    this._status = 'initializing';
    this._error = null;

    try {
      const targetConfig = config ?? (await this.loadConfig());

      // Validate configuration
      const validation = validateConfig(targetConfig);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Calculate new dimension and fingerprint
      const newDimension = getConfigDimension(targetConfig, PREDEFINED_MODELS);
      const newFingerprint = this.getConfigFingerprint(targetConfig);

      // Check if provider/model or dimension changed - need to clear vector database
      // Embeddings from different models are incompatible even if dimensions match
      const fingerprintChanged =
        this.previousConfigFingerprint !== null &&
        this.previousConfigFingerprint !== newFingerprint;
      const dimensionChanged =
        this.previousDimension !== null && this.previousDimension !== newDimension;

      if (fingerprintChanged || dimensionChanged) {
        const reason = fingerprintChanged
          ? `model/provider changed from ${this.previousConfigFingerprint} to ${newFingerprint}`
          : `dimension changed from ${this.previousDimension} to ${newDimension}`;
        console.log(`[EmbeddingProviderManager] ${reason}, clearing vector data`);
        try {
          await clearAllVectorData();
          console.log('[EmbeddingProviderManager] Vector data cleared successfully');
        } catch (clearError) {
          console.warn('[EmbeddingProviderManager] Failed to clear vector data:', clearError);
          // Continue anyway - worst case is stale data that won't match
        }
      }

      // Dispose previous provider
      if (this.provider) {
        try {
          await this.provider.dispose();
        } catch (disposeError) {
          console.warn(
            '[EmbeddingProviderManager] Error disposing previous provider:',
            disposeError,
          );
        }
        this.provider = null;
      }

      // Create new provider based on type
      console.log(`[EmbeddingProviderManager] Creating ${targetConfig.providerType} provider`);

      switch (targetConfig.providerType) {
        case 'local':
          if (!targetConfig.local) {
            throw new Error('Local provider config is missing');
          }
          this.provider = new LocalEmbeddingProvider(targetConfig.local);
          break;

        case 'openai':
          if (!targetConfig.openai) {
            throw new Error('OpenAI provider config is missing');
          }
          this.provider = new OpenAIEmbeddingProvider(targetConfig.openai, false);
          break;

        case 'custom':
          if (!targetConfig.custom) {
            throw new Error('Custom provider config is missing');
          }
          this.provider = new OpenAIEmbeddingProvider(targetConfig.custom, true);
          break;

        default:
          throw new Error(`Unknown provider type: ${targetConfig.providerType}`);
      }

      // Initialize provider
      await this.provider.initialize();

      // Update state
      this.config = targetConfig;
      this.previousDimension = this.provider.dimension;
      this.previousConfigFingerprint = newFingerprint;
      this._status = 'ready';
      this._error = null;

      // Save config after successful initialization
      await this.saveConfig(targetConfig);

      console.log(
        `[EmbeddingProviderManager] Provider initialized. Type: ${targetConfig.providerType}, Dimension: ${this.provider.dimension}`,
      );
    } catch (error) {
      this._status = 'error';
      this._error = error instanceof Error ? error.message : String(error);
      console.error('[EmbeddingProviderManager] Failed to initialize provider:', error);
      throw error;
    }
  }

  /**
   * Test a provider configuration without saving it.
   * Useful for "Test Connection" functionality in UI.
   * @returns Object with success status, dimension, and optional error
   */
  async testProvider(config: EmbeddingConfig): Promise<{
    success: boolean;
    dimension?: number;
    error?: string;
  }> {
    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    let testProvider: EmbeddingProvider | null = null;

    try {
      // Create temporary provider
      switch (config.providerType) {
        case 'local': {
          // For local, just return the expected dimension without full initialization
          const dimension = getConfigDimension(config, PREDEFINED_MODELS);
          return { success: true, dimension };
        }

        case 'openai':
          testProvider = new OpenAIEmbeddingProvider(config.openai!, false);
          break;

        case 'custom':
          testProvider = new OpenAIEmbeddingProvider(config.custom!, true);
          break;

        default:
          return { success: false, error: `Unknown provider type: ${config.providerType}` };
      }

      // Initialize (this will test the connection)
      await testProvider.initialize();

      return {
        success: true,
        dimension: testProvider.dimension,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Clean up test provider
      if (testProvider) {
        try {
          await testProvider.dispose();
        } catch {
          // Ignore disposal errors
        }
      }
    }
  }

  /**
   * Dispose the current provider.
   */
  async dispose(): Promise<void> {
    if (this.provider) {
      await this.provider.dispose();
      this.provider = null;
    }
    this._status = 'idle';
    this._error = null;
    console.log('[EmbeddingProviderManager] Disposed');
  }
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Get the global embedding provider manager instance.
 */
export function getEmbeddingProviderManager(): EmbeddingProviderManager {
  return EmbeddingProviderManager.getInstance();
}

/**
 * Get the current embedding provider.
 * Initializes if not already done.
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  return EmbeddingProviderManager.getInstance().getProvider();
}
