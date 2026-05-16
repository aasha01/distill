import { apiClient } from "../config/api";

export interface LLMConfig {
  provider: string;
  model: string;
}

export const PROVIDERS = ["ollama", "lmstudio", "openai", "anthropic", "gemini"] as const;
export type Provider = typeof PROVIDERS[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

export async function getLLMConfig(): Promise<LLMConfig> {
  const { data } = await apiClient.get<LLMConfig>("/api/config/llm");
  return data;
}

export async function patchLLMConfig(config: LLMConfig): Promise<LLMConfig> {
  const { data } = await apiClient.patch<LLMConfig>("/api/config/llm", config);
  return data;
}

export async function listModels(provider: string): Promise<string[]> {
  const { data } = await apiClient.get<{ models: string[]; error?: string }>(
    `/api/providers/${provider}/models`
  );
  return data.models;
}
