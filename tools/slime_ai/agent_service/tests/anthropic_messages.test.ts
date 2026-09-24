import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anthropicMessagesResponse } from '../src/anthropic_messages.ts';
import { ProviderTurnError, type ProviderEvent } from '../src/provider_events.ts';
import { createProfileSnapshot } from '../src/provider_profiles.ts';
import type { FetchLike, ProviderRequest } from '../src/providers.ts';

const model = 'explicit-test-model';
const profile = createProfileSnapshot('anthropic_messages', model);
const request = (overrides: Partial<ProviderRequest> = {}): ProviderRequest => ({
  provider: 'anthropic_messages', profile, model, intent: 'propose', prompt: 'Inspect a marker', context: '{"scene_ref":"scene-雪"}',
  max_output_tokens: 256, request_timeout_ms: 2000, signal: new AbortController().signal, ...overrides,
});
const msg = (id = 'msg-1', usage: object = { input_tokens: 11, output_tokens: 1 }) =>
  ({ type: 'message_start', message: { id, role: 'assistant', content: [], stop_reason: null, usage } });
const start = (index: number, content_block: object) => ({ type: 'content_block_start', index, content_block });
const delta = (index: number, value: object) => ({ type: 'content_block_delta', index, delta: value });
const stop = (index: number) => ({ type: 'content_block_stop', index });
const end = (reason: string, usage: object = { output_tokens: 7 }) => [
  { type: 'message_delta', delta: { stop_reason: reason, stop_sequence: null }, usage }, { type: 'message_stop' },
];
const textTurn = (value = '雪 ready') => [msg(), start(0, { type: 'text', text: '' }), delta(0, { type: 'text_delta', text: value }), stop(0), ...end('end_turn')];
const toolTurn = (name = 'project_inspect', args = '{}', id = 'tool-1') => [
  msg(), start(0, { type: 'text', text: '' }), delta(0, { type: 'text_delta', text: 'Looking up.' }), stop(0),
  start(1, { type: 'tool_use', id, name, input: {} }),
  delta(1, { type: 'input_json_delta', partial_json: args.slice(0, 1) }),
  delta(1, { type: 'input_json_delta', partial_json: args.slice(1) }), stop(1), ...end('tool_use'),
];
function wire(events: object[], splits: number[] = []): Response {
  const bytes = Buffer.from(events.map(value => `event: ${(value as { type: string }).type}\ndata: ${JSON.stringify(value)}\n\n`).join(''));
  const chunks: Uint8Array[] = [];
  let previous = 0;
  for (const split of [...splits, bytes.length]) { chunks.push(bytes.subarray(previous, split)); previous = split; }
  let index = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
function captured(response: Response): { fetchImpl: FetchLike; requests: Array<{ url: string; options: RequestInit; body: Record<string, unknown> }> } {
  const requests: Array<{ url: string; options: RequestInit; body: Record<string, unknown> }> = [];
  const fetchImpl: FetchLike = async (url, options) => {
    requests.push({ url: String(url), options: options ?? {}, body: JSON.parse(String(options?.body)) as Record<string, unknown> });
    return response;
  };
  return { fetchImpl, requests };
}
const credential = async () => 'fixture-key';
const code = (expected: string) => (error: unknown): boolean => error instanceof ProviderTurnError && error.code === expected;

test('Anthropic text stream uses frozen endpoint, headers, schema, scope, and cumulative usage', async () => {
  const unicode = Buffer.from(textTurn().map(value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`).join(''));
  const split = unicode.indexOf(Buffer.from('雪'));
  const fetch = captured(wire(textTurn(), [split + 1, split + 2]));
  const events: ProviderEvent[] = [];
  const result = await anthropicMessagesResponse(request(), event => events.push(event), fetch.fetchImpl, credential);
  assert.equal(fetch.requests.length, 1);
  assert.equal(fetch.requests[0].url, profile.endpoint);
  assert.equal(fetch.requests[0].options.method, 'POST');
  assert.deepEqual(fetch.requests[0].options.headers, { Authorization: 'Bearer fixture-key', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' });
  const body = fetch.requests[0].body;
  assert.equal(body.model, model);
  assert.equal(body.max_tokens, 256);
  assert.equal(body.stream, true);
  assert.deepEqual(body.tool_choice, { type: 'auto', disable_parallel_tool_use: true });
  assert.ok(Array.isArray(body.tools));
  assert.ok((body.tools as Array<{ name: string; input_schema: object }>).some(tool => tool.name === 'scene_patch_preview' && Boolean(tool.input_schema)));
  assert.match(JSON.stringify(body.messages), /scene-雪/);
  assert.equal(result.text, '雪 ready');
  assert.equal(result.call, null);
  assert.deepEqual(result.usage, { input_tokens: 11, output_tokens: 7 });
  assert.equal(events.filter(event => event.kind === 'turn_completed').length, 1);
});

test('Discuss omits native preview from the outbound tool definitions', async () => {
  const fetch = captured(wire(textTurn()));
  await anthropicMessagesResponse(request({ intent: 'discuss' }), () => {}, fetch.fetchImpl, credential);
  assert.equal((fetch.requests[0].body.tools as Array<{ name: string }>).some(tool => tool.name === 'scene_patch_preview'), false);
});

test('multiple message deltas use the last cumulative token counts', async () => {
  const events = [msg('msg-usage', { input_tokens: 9, output_tokens: 1 }),
    start(0, { type: 'text', text: '' }), delta(0, { type: 'text_delta', text: 'Ready' }), stop(0),
    { type: 'message_delta', delta: { stop_reason: null }, usage: { output_tokens: 3 } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 12, output_tokens: 8 } },
    { type: 'message_stop' }];
  const result = await anthropicMessagesResponse(request(), () => {}, captured(wire(events)).fetchImpl, credential);
  assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 8 });
});

test('completed tool turn links ordered assistant blocks and exact tool_result on continuation', async () => {
  const first = captured(wire(toolTurn()));
  const events: ProviderEvent[] = [];
  const result = await anthropicMessagesResponse(request(), event => events.push(event), first.fetchImpl, credential);
  assert.equal(result.call?.call_id, 'tool-1');
  assert.equal(result.call?.tool_name, 'project_inspect');
  assert.equal(result.call?.provider_response_id, 'msg-1');
  assert.deepEqual(result.call?.arguments, {});
  assert.equal(events.filter(event => event.kind === 'turn_completed').length, 1);
  const second = captured(wire([msg('msg-2'), start(0, { type: 'text', text: '' }), delta(0, { type: 'text_delta', text: 'Done.' }), stop(0), ...end('end_turn')]));
  const followup = request({ previous_response_id: result.response_id, call_id: 'tool-1', tool_result: '{"status":"passed"}', continuation: result.continuation });
  const next = await anthropicMessagesResponse(followup, () => {}, second.fetchImpl, credential);
  const messages = second.requests[0].body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
  assert.equal(messages.length, 3);
  assert.deepEqual(messages[1].content.map(block => block.type), ['text', 'tool_use']);
  assert.deepEqual(messages[1].content[1], { type: 'tool_use', id: 'tool-1', name: 'project_inspect', input: {} });
  assert.deepEqual(messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '{"status":"passed"}' }] });
  assert.equal(next.call, null);
  assert.equal(next.text, 'Done.');
});

test('opaque reasoning and signature stay in continuation, never in displayed text', async () => {
  const events = [msg(), start(0, { type: 'thinking', thinking: '', signature: '' }),
    delta(0, { type: 'thinking_delta', thinking: 'private reasoning' }), delta(0, { type: 'signature_delta', signature: 'signed' }), stop(0),
    start(1, { type: 'tool_use', id: 'tool-1', name: 'project_inspect', input: {} }), stop(1), ...end('tool_use')];
  const result = await anthropicMessagesResponse(request(), () => {}, captured(wire(events)).fetchImpl, credential);
  assert.equal(result.text, '');
  const content = (result.continuation as { messages: Array<{ content: object[] }> }).messages.at(-1)?.content;
  assert.deepEqual(content?.[0], { type: 'thinking', thinking: 'private reasoning', signature: 'signed' });
});

test('profile/model/call ID mismatch rejects continuation before HTTP request', async () => {
  const first = await anthropicMessagesResponse(request(), () => {}, captured(wire(toolTurn())).fetchImpl, credential);
  let called = false;
  const fetchImpl: FetchLike = async () => { called = true; return wire(textTurn()); };
  for (const override of [
    { call_id: 'wrong' },
    { model: 'another-model' },
    { continuation: { ...(first.continuation as object), profile_fingerprint: 'wrong' } },
    { previous_response_id: 'wrong' },
  ]) {
    await assert.rejects(anthropicMessagesResponse(request({ call_id: first.call?.call_id, tool_result: '{}', continuation: first.continuation, previous_response_id: first.response_id, ...override }), () => {}, fetchImpl, credential), code('PROVIDER_PROTOCOL_ERROR'));
  }
  assert.equal(called, false);
});

test('truncation, early EOF, and late error never emit turn_completed or release a tool', async () => {
  const complete = toolTurn();
  const cases = [
    complete.slice(0, -1),
    [...complete.slice(0, -2), { type: 'error', error: { type: 'overloaded_error' } }],
    [...complete, { type: 'error', error: { type: 'overloaded_error' } }],
    [...complete.slice(0, -2), ...end('max_tokens')],
    [...complete.slice(0, -2), ...end('refusal')],
    [...complete.slice(0, -2), ...end('stop_sequence')],
  ];
  for (const events of cases) {
    const seen: ProviderEvent[] = [];
    await assert.rejects(anthropicMessagesResponse(request(), event => seen.push(event), captured(wire(events)).fetchImpl, credential));
    assert.equal(seen.some(event => event.kind === 'turn_completed'), false);
  }
});

test('malformed, unknown, duplicate, and oversized tool calls never complete', async () => {
  const multi = [...toolTurn().slice(0, -2), start(2, { type: 'tool_use', id: 'tool-2', name: 'scene_inspect', input: {} }), stop(2), ...end('tool_use')];
  for (const events of [toolTurn('project_inspect', '{'), toolTurn('unknown_tool'), multi, toolTurn('project_inspect', '{"bad":true}'), toolTurn('project_inspect', `{"x":"${'a'.repeat(33000)}"}`)]) {
    const seen: ProviderEvent[] = [];
    await assert.rejects(anthropicMessagesResponse(request(), event => seen.push(event), captured(wire(events)).fetchImpl, credential));
    assert.equal(seen.some(event => event.kind === 'turn_completed'), false);
  }
});

test('mismatched block indices and tool stop reason are rejected', async () => {
  const mismatched = [msg(), start(1, { type: 'tool_use', id: 'tool-1', name: 'project_inspect', input: {} }), stop(1), ...end('tool_use')];
  const wrongStop = [...toolTurn().slice(0, -2), ...end('end_turn')];
  for (const events of [mismatched, wrongStop]) await assert.rejects(anthropicMessagesResponse(request(), () => {}, captured(wire(events)).fetchImpl, credential), code('PROVIDER_PROTOCOL_ERROR'));
});

test('401, 429, and 503 HTTP statuses map without exposing response bodies', async () => {
  for (const [status, expected] of [[401, 'PROVIDER_AUTH_FAILED'], [429, 'PROVIDER_RATE_LIMITED'], [503, 'PROVIDER_UNAVAILABLE']] as const) {
    const fetchImpl: FetchLike = async () => new Response('secret error body', { status });
    await assert.rejects(anthropicMessagesResponse(request(), () => {}, fetchImpl, credential), code(expected));
  }
});

test('missing credential and pre-cancelled request do not reach network', async () => {
  let called = false;
  const fetchImpl: FetchLike = async () => { called = true; return wire(textTurn()); };
  await assert.rejects(anthropicMessagesResponse(request(), () => {}, fetchImpl), code('CREDENTIAL_MISSING'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(anthropicMessagesResponse(request({ signal: controller.signal }), () => {}, fetchImpl, credential), code('CANCELLED'));
  assert.equal(called, false);
});

test('cancellation during transport prevents terminal tool emission', async () => {
  const controller = new AbortController();
  const events: ProviderEvent[] = [];
  const fetchImpl: FetchLike = async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    queueMicrotask(() => controller.abort());
  });
  await assert.rejects(anthropicMessagesResponse(request({ signal: controller.signal }), event => events.push(event), fetchImpl, credential), code('CANCELLED'));
  assert.equal(events.some(event => event.kind === 'turn_completed'), false);
});
