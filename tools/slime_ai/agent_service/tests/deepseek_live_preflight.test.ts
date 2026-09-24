import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatCompletionsResponse } from '../src/chat_completions.ts';
import { DeepSeekPilotBudget } from '../src/deepseek_pilot_budget.ts';
import { validateInlinePng } from '../src/image_input.ts';
import { parseRequest, ProtocolFault, type RunStartRequest } from '../src/protocol.ts';
import { createProfileSnapshot } from '../src/provider_profiles.ts';
import type { ProviderRequest } from '../src/providers.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
const image = validateInlinePng({ mime_type: 'image/png', base64: png });
const limits = { max_attempts: 3, max_tool_calls: 4, max_output_tokens: 256, request_timeout_ms: 30000, deadline_ms: 120000 };
const start = (extras: Record<string, unknown> = {}): RunStartRequest => parseRequest(JSON.stringify({
  protocol_version: '1.1', request_id: 'start-1', method: 'run_start', params: {
    run_id: 'run-1', provider: 'deepseek_chat', model: 'deepseek-flash', intent: 'discuss',
    prompt: 'Describe the attached approved frame.', context: '{"scene_ref":"fixture"}', limits,
    live_authorized: true, ...extras,
  },
})) as RunStartRequest;
const request = (extras: Partial<ProviderRequest> = {}): ProviderRequest => ({
  provider: 'deepseek_chat', model: 'deepseek-flash', intent: 'discuss',
  prompt: 'Describe the frame.', context: '{"scene_ref":"fixture"}',
  max_output_tokens: 256, request_timeout_ms: 1000, signal: new AbortController().signal,
  profile: createProfileSnapshot('deepseek_chat', 'deepseek-flash', [], 256), ...extras,
});
const sse = (items: object[]): Response => new Response(items.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n',
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const chunk = (delta: object, finish: string | null = null, id = 'response-1'): object => ({
  id, model: 'deepseek-flash', system_fingerprint: 'fp_fixture', choices: [{ index: 0, delta, finish_reason: finish }],
});

test('only a bounded real PNG enters read-only direct DeepSeek run_start', () => {
  const value = start({ image_input: image, deepseek_thinking: 'disabled' });
  assert.deepEqual(value.params.image_input, image);
  assert.equal(value.params.deepseek_thinking, 'disabled');
  for (const extras of [
    { provider: 'openrouter_chat', route_only: ['route'], image_input: image },
    { intent: 'execute', image_input: image },
    { image_input: { ...image, base64: 'not-png' } },
    { deepseek_thinking: 'high' },
    { provider: 'kimi_chat', deepseek_thinking: 'low' },
  ]) assert.throws(() => start(extras), error => error instanceof ProtocolFault);
});

test('production DeepSeek adapter sends a user image block, disables tools, and reports returned identity', async () => {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    assert.equal(init?.redirect, 'error');
    return sse([chunk({ role: 'assistant', content: 'one pixel' }, 'stop'),
      { id: 'response-1', model: 'deepseek-flash', system_fingerprint: 'fp_fixture', choices: [], usage: { prompt_tokens: 103, completion_tokens: 9 } }]);
  };
  const result = await chatCompletionsResponse(request({ image_input: image, deepseek_thinking: 'disabled', context: '{"visual_ground_truth":"must not transmit"}' }), () => {}, fetch, async () => 'dummy');
  assert.deepEqual(urls, ['https://api.deepseek.com/chat/completions']);
  assert.deepEqual(bodies[0].thinking, { type: 'disabled' });
  assert.deepEqual(bodies[0].tools, []);
  assert.equal(bodies[0].tool_choice, 'none');
  const messages = bodies[0].messages as Array<{ role: string; content: unknown }>;
  assert.equal(messages[1].role, 'user');
  const parts = messages[1].content as Array<Record<string, unknown>>;
  assert.equal(parts[0].type, 'text');
  assert.equal(JSON.stringify(parts).includes('visual_ground_truth'), false);
  assert.deepEqual(parts[1], { type: 'image_url', image_url: { url: `data:image/png;base64,${png}`, detail: 'low' } });
  assert.equal(result.call, null);
  assert.equal(result.returned_model, 'deepseek-flash');
  assert.equal(result.backend_fingerprint, 'fp_fixture');
  assert.deepEqual(result.usage, { input_tokens: 103, output_tokens: 9 });
});

test('image tool call and malformed image fail without native tool dispatch', async () => {
  let fetches = 0;
  const fetch: typeof globalThis.fetch = async () => {
    fetches++;
    return sse([chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'scene_inspect', arguments: '{}' } }] }, 'tool_calls')]);
  };
  await assert.rejects(() => chatCompletionsResponse(request({ image_input: image }), () => {}, fetch, async () => 'dummy'));
  assert.equal(fetches, 1);
  await assert.rejects(() => chatCompletionsResponse(request({ image_input: { mime_type: 'image/png', base64: 'garbage' } }), () => {}, fetch, async () => 'dummy'));
  assert.equal(fetches, 1);
});

test('low-effort thinking keeps tool choice unforced and returns reasoning on linked continuation', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return bodies.length === 1 ? sse([
      chunk({ role: 'assistant', reasoning_content: 'private reasoning', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'scene_inspect', arguments: '{}' } }] }, 'tool_calls'),
    ]) : sse([chunk({ role: 'assistant', content: 'done' }, 'stop')]);
  };
  const first = await chatCompletionsResponse(request({ deepseek_thinking: 'low' }), () => {}, fetch, async () => 'dummy');
  assert.deepEqual(bodies[0].thinking, { type: 'enabled' });
  assert.equal(bodies[0].reasoning_effort, 'low');
  assert.equal(bodies[0].tool_choice, undefined);
  assert.equal(first.call?.call_id, 'call-1');
  await chatCompletionsResponse(request({ deepseek_thinking: 'low', call_id: 'call-1', previous_response_id: first.response_id,
    continuation: first.continuation, tool_result: '{"status":"ok"}' }), () => {}, fetch, async () => 'dummy');
  const messages = bodies[1].messages as Array<Record<string, unknown>>;
  assert.equal(messages.at(-2)?.reasoning_content, 'private reasoning');
  assert.equal((messages.at(-2)?.tool_calls as Array<{ id: string }>)[0].id, 'call-1');
  assert.deepEqual(messages.at(-1), { role: 'tool', tool_call_id: 'call-1', content: '{"status":"ok"}' });
  assert.equal(bodies[1].tool_choice, undefined);
});

test('pilot reserves peak-rate maximum before each attempt and never refunds unknown attempts', () => {
  const budget = new DeepSeekPilotBudget();
  const body = { model: 'deepseek-flash', messages: [{ role: 'user', content: 'fixture' }], max_tokens: 256 };
  for (let i = 0; i < 12; i++) budget.reserve(body, false);
  assert.equal((budget.status() as { attempts: number }).attempts, 12);
  assert.throws(() => budget.reserve(body, false));
  const tools = new DeepSeekPilotBudget();
  for (let i = 0; i < 24; i++) tools.recordToolCall();
  assert.throws(() => tools.recordToolCall());
  const expensive = new DeepSeekPilotBudget();
  assert.throws(() => expensive.reserve({ ...body, messages: [{ role: 'user', content: 'x'.repeat(4_000_000) }] }, false));
  assert.equal((expensive.status() as { attempts: number }).attempts, 0);
});
