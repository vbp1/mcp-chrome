/**
 * Local Embedding Provider
 *
 * Wrapper around SemanticSimilarityEngineProxy for local Transformers.js models.
 * Maintains backward compatibility with existing offscreen document infrastructure.
 */

import type { EmbeddingProvider, LocalProviderConfig } from './types';
import {
  SemanticSimilarityEngineProxy,
  PREDEFINED_MODELS,
  type ModelPreset,
} from '../semantic-similarity-engine';

/**
 * Embedding provider for local Transformers.js models.
 * Delegates to SemanticSimilarityEngineProxy which manages offscreen document communication.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly type = 'local' as const;
  private config: LocalProviderConfig;
  private proxy: SemanticSimilarityEngineProxy | null = null;
  private _dimension: number;
  private _isInitialized = false;

  /**
   * Create a new local embedding provider.
   * @param config - Local provider configuration
   */
  constructor(config: LocalProviderConfig) {
    this.config = config;

    // Get dimension from predefined models
    const modelInfo = PREDEFINED_MODELS[config.modelPreset];
    if (!modelInfo) {
      throw new Error(`Unknown model preset: ${config.modelPreset}`);
    }
    this._dimension = modelInfo.dimension;
  }

  get dimension(): number {
    return this._dimension;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Get the current model preset.
   */
  get modelPreset(): ModelPreset {
    return this.config.modelPreset;
  }

  /**
   * Initialize the local provider.
   * Creates SemanticSimilarityEngineProxy and initializes the offscreen engine.
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    const modelInfo = PREDEFINED_MODELS[this.config.modelPreset];

    console.log(
      `[LocalProvider] Initializing with model: ${this.config.modelPreset}, version: ${this.config.modelVersion}`,
    );

    this.proxy = new SemanticSimilarityEngineProxy({
      modelPreset: this.config.modelPreset,
      modelVersion: this.config.modelVersion,
      dimension: modelInfo.dimension,
      forceOffscreen: true,
    });

    await this.proxy.initialize();
    this._isInitialized = true;

    console.log(
      `[LocalProvider] Initialized successfully. Model: ${this.config.modelPreset}, Dimension: ${this._dimension}`,
    );
  }

  /**
   * Generate embedding for a single text.
   */
  async getEmbedding(text: string): Promise<Float32Array> {
    if (!this.proxy) {
      throw new Error('Local embedding provider not initialized');
    }
    return this.proxy.getEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts.
   */
  async getEmbeddingsBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.proxy) {
      throw new Error('Local embedding provider not initialized');
    }
    return this.proxy.getEmbeddingsBatch(texts);
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    // Note: SemanticSimilarityEngineProxy doesn't have a dispose method
    // The offscreen document is managed by OffscreenManager
    this.proxy = null;
    this._isInitialized = false;
    console.log('[LocalProvider] Disposed');
  }
}
