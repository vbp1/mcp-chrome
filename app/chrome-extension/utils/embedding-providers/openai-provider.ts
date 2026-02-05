/**
 * OpenAI Embedding Provider
 *
 * Implements embedding generation via OpenAI Embeddings API or any OpenAI-compatible endpoint.
 * Supports:
 * - Official OpenAI API (text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002)
 * - Custom OpenAI-compatible endpoints (Ollama, LM Studio, Azure OpenAI, vLLM, etc.)
 */

import type {
  EmbeddingProvider,
  EmbeddingProviderType,
  OpenAIProviderConfig,
  CustomProviderConfig,
  OpenAIEmbeddingModel,
} from './types';
import { OPENAI_MODELS } from './types';

// ============================================================
// Types
// ============================================================

/** OpenAI API request body for embeddings */
interface OpenAIEmbeddingRequest {
  input: string | string[];
  model: string;
  dimensions?: number;
  encoding_format?: 'float' | 'base64';
}

/** OpenAI API response for embeddings */
interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/** OpenAI API error response */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

// ============================================================
// OpenAI Embedding Provider
// ============================================================

/**
 * Embedding provider for OpenAI API and OpenAI-compatible endpoints.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly type: EmbeddingProviderType;
  private _dimension: number;
  private _isInitialized = false;

  private baseUrl: string;
  private apiKey: string | undefined;
  private model: string;
  private requestDimensions: number | undefined;
  private customHeaders: Record<string, string>;

  /**
   * Create a new OpenAI embedding provider.
   * @param config - Provider configuration (OpenAI or Custom)
   * @param isCustom - Whether this is a custom endpoint (affects type and defaults)
   */
  constructor(config: OpenAIProviderConfig | CustomProviderConfig, isCustom = false) {
    this.type = isCustom ? 'custom' : 'openai';

    if (isCustom) {
      const customConfig = config as CustomProviderConfig;
      this.baseUrl = this.normalizeBaseUrl(customConfig.baseUrl);
      this.apiKey = customConfig.apiKey;
      this.model = customConfig.model;
      this._dimension = customConfig.dimensions;
      this.requestDimensions = undefined; // Custom endpoints may not support this
      this.customHeaders = customConfig.headers ?? {};
    } else {
      const openaiConfig = config as OpenAIProviderConfig;
      this.baseUrl = 'https://api.openai.com/v1';
      this.apiKey = openaiConfig.apiKey;
      this.model = openaiConfig.model;

      // Determine dimension
      const modelSpec = OPENAI_MODELS[openaiConfig.model as OpenAIEmbeddingModel];
      if (openaiConfig.dimensions && modelSpec.supportsReduction) {
        this._dimension = openaiConfig.dimensions;
        this.requestDimensions = openaiConfig.dimensions;
      } else {
        this._dimension = modelSpec.dimension;
        this.requestDimensions = undefined;
      }
      this.customHeaders = {};
    }
  }

  get dimension(): number {
    return this._dimension;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Normalize base URL (remove trailing slash, ensure no /embeddings suffix).
   */
  private normalizeBaseUrl(url: string): string {
    let normalized = url.trim();
    // Remove trailing slash
    while (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    // Remove /embeddings suffix if present
    if (normalized.endsWith('/embeddings')) {
      normalized = normalized.slice(0, -'/embeddings'.length);
    }
    return normalized;
  }

  /**
   * Initialize the provider by testing the connection.
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    // Validate API key for OpenAI (not required for custom endpoints)
    if (this.type === 'openai' && !this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Test connection with a minimal embedding request
    try {
      console.log(`[OpenAIProvider] Initializing with model: ${this.model}`);
      const testEmbedding = await this.getEmbedding('test');

      // Validate returned dimension matches expected
      if (testEmbedding.length !== this._dimension) {
        console.warn(
          `[OpenAIProvider] Dimension mismatch: expected ${this._dimension}, got ${testEmbedding.length}. Updating dimension.`,
        );
        this._dimension = testEmbedding.length;
      }

      this._isInitialized = true;
      console.log(
        `[OpenAIProvider] Initialized successfully. Model: ${this.model}, Dimension: ${this._dimension}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize OpenAI provider: ${message}`);
    }
  }

  /**
   * Generate embedding for a single text.
   */
  async getEmbedding(text: string): Promise<Float32Array> {
    const embeddings = await this.getEmbeddingsBatch([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts in a single API call.
   */
  async getEmbeddingsBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    // Build request body
    const requestBody: OpenAIEmbeddingRequest = {
      input: texts,
      model: this.model,
      encoding_format: 'float',
    };

    // Add dimensions parameter if specified (only for supported OpenAI models)
    if (this.requestDimensions !== undefined) {
      requestBody.dimensions = this.requestDimensions;
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Make API request
    const url = `${this.baseUrl}/embeddings`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      const message = networkError instanceof Error ? networkError.message : String(networkError);
      throw new Error(`Network error connecting to ${this.baseUrl}: ${message}`);
    }

    // Handle error responses
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorBody = (await response.json()) as OpenAIErrorResponse;
        if (errorBody.error?.message) {
          errorMessage = errorBody.error.message;
        }
      } catch {
        // Ignore JSON parse errors, use HTTP status message
      }

      // Provide helpful error messages for common issues
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your API key and try again.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait and try again.');
      }
      if (response.status === 404) {
        throw new Error(`Model "${this.model}" not found. Please check the model name.`);
      }

      throw new Error(`OpenAI API error: ${errorMessage}`);
    }

    // Parse successful response
    let data: OpenAIEmbeddingResponse;
    try {
      data = (await response.json()) as OpenAIEmbeddingResponse;
    } catch {
      throw new Error('Invalid response from API: failed to parse JSON');
    }

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response from API: missing embeddings data');
    }

    // Sort by index to maintain input order and convert to Float32Array
    const sortedData = data.data.sort((a, b) => a.index - b.index);
    return sortedData.map((item) => new Float32Array(item.embedding));
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    this._isInitialized = false;
    console.log('[OpenAIProvider] Disposed');
  }
}
