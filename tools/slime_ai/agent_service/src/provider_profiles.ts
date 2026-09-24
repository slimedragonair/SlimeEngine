import { createHash } from 'node:crypto';

export type ProfileId = 'fake' | 'openai_responses' | 'anthropic_messages' | 'deepseek_chat' | 'kimi_chat' | 'openrouter_chat';
export type ProtocolFamily = 'offline_fake' | 'openai_responses' | 'anthropic_messages' | 'chat_completions';
export type RoutePolicy = { only: readonly string[]; allow_fallbacks: false; require_parameters: true };
export type ProfileSnapshot = {
  id: ProfileId; revision: 1; family: ProtocolFamily; endpoint: string; model: string | null;
  credential_target: string | null; api_version: string | null; route: RoutePolicy | null;
  tool_capability: 'offline_contract_tested' | 'unknown_for_selected_model';
  context_limit: null; output_limit: number; fingerprint: string;
};

const specs: Record<ProfileId, Omit<ProfileSnapshot, 'model' | 'route' | 'tool_capability' | 'output_limit' | 'fingerprint'>> = {
  fake: { id: 'fake', revision: 1, family: 'offline_fake', endpoint: 'local://slime-ai-fake', credential_target: null, api_version: null, context_limit: null },
  openai_responses: { id: 'openai_responses', revision: 1, family: 'openai_responses', endpoint: 'https://api.openai.com/v1/responses', credential_target: 'SlimeEngine/OpenAI', api_version: null, context_limit: null },
  anthropic_messages: { id: 'anthropic_messages', revision: 1, family: 'anthropic_messages', endpoint: 'https://api.anthropic.com/v1/messages', credential_target: 'SlimeEngine/Anthropic', api_version: '2023-06-01', context_limit: null },
  deepseek_chat: { id: 'deepseek_chat', revision: 1, family: 'chat_completions', endpoint: 'https://api.deepseek.com/chat/completions', credential_target: 'SlimeEngine/DeepSeek', api_version: null, context_limit: null },
  kimi_chat: { id: 'kimi_chat', revision: 1, family: 'chat_completions', endpoint: 'https://api.moonshot.ai/v1/chat/completions', credential_target: 'SlimeEngine/Moonshot', api_version: null, context_limit: null },
  openrouter_chat: { id: 'openrouter_chat', revision: 1, family: 'chat_completions', endpoint: 'https://openrouter.ai/api/v1/chat/completions', credential_target: 'SlimeEngine/OpenRouter', api_version: null, context_limit: null },
};

export const PROFILE_IDS = Object.freeze(Object.keys(specs) as ProfileId[]);

export function describeProfile(id: ProfileId): Readonly<typeof specs[ProfileId]> {
  const spec = specs[id];
  if (!spec) throw new Error('Unknown provider profile.');
  return spec;
}

export function createProfileSnapshot(id: ProfileId, model: string | null, routeOnly: readonly string[] = [], outputLimit = 1024): ProfileSnapshot {
  const spec = specs[id];
  if (!spec) throw new Error('Unknown provider profile.');
  if (!Number.isSafeInteger(outputLimit) || outputLimit < 64 || outputLimit > 4096) throw new Error('Unsupported output limit.');
  if (id === 'fake' ? model !== null : typeof model !== 'string' || !model.trim() || Buffer.byteLength(model, 'utf8') > 128) throw new Error('An explicit bounded model is required.');
  const normalized = [...new Set(routeOnly.map(value => value.trim()))];
  if (id === 'openrouter_chat') {
    if (!normalized.length || normalized.length > 8 || normalized.some(value => !/^[A-Za-z0-9._/-]{1,96}$/.test(value))) throw new Error('OpenRouter needs a bounded exact upstream allowlist.');
  } else if (normalized.length) throw new Error('Routes are only configured for OpenRouter.');
  const route: RoutePolicy | null = id === 'openrouter_chat' ? Object.freeze({ only: Object.freeze(normalized), allow_fallbacks: false, require_parameters: true }) : null;
  const base = { ...spec, model, route, output_limit: outputLimit, tool_capability: id === 'fake' ? 'offline_contract_tested' : 'unknown_for_selected_model' } as const;
  const fingerprint = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return Object.freeze({ ...base, fingerprint });
}
