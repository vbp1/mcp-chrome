/**
 * Embedding Providers Module
 *
 * Provides abstraction layer for different embedding sources:
 * - Local: Transformers.js models in offscreen document
 * - OpenAI: OpenAI Embeddings API
 * - Custom: OpenAI-compatible endpoints (Ollama, LM Studio, Azure, etc.)
 */

// Types and interfaces
export type {
  EmbeddingProvider,
  EmbeddingProviderType,
  EmbeddingConfig,
  LocalProviderConfig,
  OpenAIProviderConfig,
  CustomProviderConfig,
  OpenAIEmbeddingModel,
  OpenAIModelSpec,
} from './types';

export {
  OPENAI_MODELS,
  DEFAULT_EMBEDDING_CONFIG,
  getConfigDimension,
  validateConfig,
} from './types';

// Provider implementations
export { LocalEmbeddingProvider } from './local-provider';
export { OpenAIEmbeddingProvider } from './openai-provider';

// Manager
export type { ProviderStatus, ProviderState } from './manager';
export {
  EmbeddingProviderManager,
  getEmbeddingProviderManager,
  getEmbeddingProvider,
} from './manager';
