/**
 * Embedding Provider Types and Interfaces
 *
 * Defines the abstraction layer for different embedding providers:
 * - Local: Transformers.js models running in offscreen document
 * - OpenAI: OpenAI Embeddings API
 * - Custom: Any OpenAI-compatible endpoint (Ollama, LM Studio, Azure, etc.)
 */

import type { ModelPreset } from '../semantic-similarity-engine';

// ============================================================
// Provider Types
// ============================================================

export type EmbeddingProviderType = 'local' | 'openai' | 'custom';

/**
 * Base interface for all embedding providers.
 * Provides a unified API regardless of the underlying implementation.
 */
export interface EmbeddingProvider {
  /** Provider type identifier */
  readonly type: EmbeddingProviderType;

  /** Output embedding dimension */
  readonly dimension: number;

  /** Whether the provider is ready to generate embeddings */
  readonly isInitialized: boolean;

  /**
   * Initialize the provider.
   * For local: loads model into offscreen document
   * For API: validates connection and API key
   */
  initialize(): Promise<void>;

  /**
   * Generate embedding for a single text.
   * @param text - Input text to embed
   * @returns Float32Array of embedding values
   */
  getEmbedding(text: string): Promise<Float32Array>;

  /**
   * Generate embeddings for multiple texts (batch).
   * More efficient than calling getEmbedding multiple times for API providers.
   * @param texts - Array of input texts
   * @returns Array of Float32Array embeddings
   */
  getEmbeddingsBatch(texts: string[]): Promise<Float32Array[]>;

  /**
   * Clean up resources (unload model, close connections).
   */
  dispose(): Promise<void>;
}

// ============================================================
// Provider Configurations
// ============================================================

/**
 * Configuration for local Transformers.js models.
 */
export interface LocalProviderConfig {
  /** Model preset name from PREDEFINED_MODELS */
  modelPreset: ModelPreset;
  /** Model version: full, quantized, or compressed */
  modelVersion: 'full' | 'quantized' | 'compressed';
}

/**
 * OpenAI embedding model identifiers.
 */
export type OpenAIEmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

/**
 * Configuration for OpenAI Embeddings API.
 */
export interface OpenAIProviderConfig {
  /** OpenAI API key (required) */
  apiKey: string;
  /** Model to use for embeddings */
  model: OpenAIEmbeddingModel;
  /**
   * Optional dimension override for text-embedding-3-* models.
   * Reduces output dimension (and cost) while maintaining quality.
   * Only supported by text-embedding-3-small and text-embedding-3-large.
   */
  dimensions?: number;
}

/**
 * Configuration for custom OpenAI-compatible endpoints.
 * Works with Ollama, LM Studio, Azure OpenAI, vLLM, etc.
 */
export interface CustomProviderConfig {
  /** Base URL of the API (e.g., "http://localhost:11434/v1") */
  baseUrl: string;
  /** API key (optional for local servers like Ollama) */
  apiKey?: string;
  /** Model name as recognized by the server */
  model: string;
  /** Output embedding dimension (required - must match model's actual output) */
  dimensions: number;
  /** Optional custom headers for authentication or routing */
  headers?: Record<string, string>;
}

/**
 * Complete embedding configuration stored in chrome.storage.local.
 * Only one provider is active at a time (no fallback).
 */
export interface EmbeddingConfig {
  /** Currently active provider type */
  providerType: EmbeddingProviderType;
  /** Local provider configuration (used when providerType === 'local') */
  local?: LocalProviderConfig;
  /** OpenAI provider configuration (used when providerType === 'openai') */
  openai?: OpenAIProviderConfig;
  /** Custom provider configuration (used when providerType === 'custom') */
  custom?: CustomProviderConfig;
}

// ============================================================
// OpenAI Model Specifications
// ============================================================

/**
 * OpenAI embedding model specifications.
 */
export interface OpenAIModelSpec {
  /** Default output dimension */
  dimension: number;
  /** Whether the model supports dimension reduction via API parameter */
  supportsReduction: boolean;
  /** Minimum dimension when reduction is supported */
  minDimension?: number;
}

/**
 * OpenAI embedding models and their specifications.
 * Reference: https://platform.openai.com/docs/guides/embeddings
 */
export const OPENAI_MODELS: Record<OpenAIEmbeddingModel, OpenAIModelSpec> = {
  'text-embedding-3-small': {
    dimension: 1536,
    supportsReduction: true,
    minDimension: 256,
  },
  'text-embedding-3-large': {
    dimension: 3072,
    supportsReduction: true,
    minDimension: 256,
  },
  'text-embedding-ada-002': {
    dimension: 1536,
    supportsReduction: false,
  },
} as const;

// ============================================================
// Default Configuration
// ============================================================

/**
 * Default embedding configuration (local provider with multilingual-e5-small).
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  providerType: 'local',
  local: {
    modelPreset: 'multilingual-e5-small',
    modelVersion: 'quantized',
  },
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get the effective dimension for a given embedding configuration.
 */
export function getConfigDimension(
  config: EmbeddingConfig,
  predefinedModels: Record<string, { dimension: number }>,
): number {
  switch (config.providerType) {
    case 'local':
      if (!config.local) {
        throw new Error('Local provider config is missing');
      }
      return predefinedModels[config.local.modelPreset]?.dimension ?? 384;

    case 'openai':
      if (!config.openai) {
        throw new Error('OpenAI provider config is missing');
      }
      // Use custom dimensions if specified, otherwise use model default
      return config.openai.dimensions ?? OPENAI_MODELS[config.openai.model].dimension;

    case 'custom':
      if (!config.custom) {
        throw new Error('Custom provider config is missing');
      }
      return config.custom.dimensions;

    default:
      throw new Error(`Unknown provider type: ${config.providerType}`);
  }
}

/**
 * Validate embedding configuration completeness.
 */
export function validateConfig(config: EmbeddingConfig): { valid: boolean; error?: string } {
  switch (config.providerType) {
    case 'local':
      if (!config.local?.modelPreset) {
        return { valid: false, error: 'Local provider requires modelPreset' };
      }
      break;

    case 'openai':
      if (!config.openai?.apiKey) {
        return { valid: false, error: 'OpenAI provider requires apiKey' };
      }
      if (!config.openai?.model) {
        return { valid: false, error: 'OpenAI provider requires model' };
      }
      break;

    case 'custom':
      if (!config.custom?.baseUrl) {
        return { valid: false, error: 'Custom provider requires baseUrl' };
      }
      if (!config.custom?.model) {
        return { valid: false, error: 'Custom provider requires model' };
      }
      if (!config.custom?.dimensions || config.custom.dimensions <= 0) {
        return { valid: false, error: 'Custom provider requires valid dimensions' };
      }
      break;

    default:
      return { valid: false, error: `Unknown provider type: ${config.providerType}` };
  }

  return { valid: true };
}
