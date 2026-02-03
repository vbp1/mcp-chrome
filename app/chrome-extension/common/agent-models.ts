/**
 * Agent CLI Model Definitions.
 *
 * Static model definitions for each CLI type.
 * Based on the pattern from Claudable (other/cweb).
 */

// ============================================================
// Types
// ============================================================

export interface ModelDefinition {
  id: string;
  name: string;
  description?: string;
  supportsImages?: boolean;
}

export type AgentCliType = 'claude';

// ============================================================
// Claude Models
// ============================================================

export const CLAUDE_MODELS: ModelDefinition[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced model with large context window',
    supportsImages: true,
  },
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Strongest reasoning model',
    supportsImages: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast and cost-efficient',
    supportsImages: true,
  },
];

export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// ============================================================
// Aggregated Definitions
// ============================================================

export const CLI_MODEL_DEFINITIONS: Record<AgentCliType, ModelDefinition[]> = {
  claude: CLAUDE_MODELS,
};

export const CLI_DEFAULT_MODELS: Record<AgentCliType, string> = {
  claude: CLAUDE_DEFAULT_MODEL,
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get model definitions for a specific CLI type.
 */
export function getModelsForCli(cli: string | null | undefined): ModelDefinition[] {
  if (!cli) return [];
  const key = cli.toLowerCase() as AgentCliType;
  return CLI_MODEL_DEFINITIONS[key] || [];
}

/**
 * Get the default model for a CLI type.
 */
export function getDefaultModelForCli(cli: string | null | undefined): string {
  if (!cli) return '';
  const key = cli.toLowerCase() as AgentCliType;
  return CLI_DEFAULT_MODELS[key] || '';
}

/**
 * Get display name for a model ID.
 */
export function getModelDisplayName(
  cli: string | null | undefined,
  modelId: string | null | undefined,
): string {
  if (!cli || !modelId) return modelId || '';
  const models = getModelsForCli(cli);
  const model = models.find((m) => m.id === modelId);
  return model?.name || modelId;
}
