import OpenAI from 'openai';
import { config } from '../config.js';

export type AiRequest = {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  effort: 'none' | 'low' | 'medium' | 'high';
  maxOutputTokens: number;
};
export type AiResult = { text: string; model: string; inputTokens: number | null; outputTokens: number | null };
export interface AiProvider { name: string; generate(r: AiRequest): Promise<AiResult> }

class OpenAiProvider implements AiProvider {
  name = 'openai';
  private client = new OpenAI({ apiKey: config.ai.apiKey, timeout: 180_000, maxRetries: 2 });
  async generate(r: AiRequest): Promise<AiResult> {
    const res = await this.client.responses.create({
      model: r.model,
      instructions: r.instructions,
      input: r.input,
      reasoning: { effort: r.effort },
      max_output_tokens: r.maxOutputTokens,
      store: false,
      text: { format: { type: 'json_schema', name: r.schemaName, schema: r.jsonSchema, strict: true } },
    });
    if (res.status === 'incomplete') throw new Error(`Response incomplete: ${res.incomplete_details?.reason ?? 'unknown'}`);
    return { text: res.output_text, model: res.model, inputTokens: res.usage?.input_tokens ?? null, outputTokens: res.usage?.output_tokens ?? null };
  }
}

let provider: AiProvider | null = null;

export function getProvider(): AiProvider | null {
  if (provider) return provider;
  if (config.ai.apiKey) provider = new OpenAiProvider();
  return provider;
}

// Tests swap in a scripted provider. Refused in production so no live button can run on fake output.
export function setProviderForTests(p: AiProvider | null) {
  if (config.isProd) throw new Error('Test AI providers are not allowed in production.');
  provider = p;
}
