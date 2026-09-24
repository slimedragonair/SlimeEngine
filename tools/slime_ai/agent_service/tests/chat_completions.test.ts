import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatCompletionsResponse } from '../src/chat_completions.ts';
import { ProviderTurnError, type ProviderEvent } from '../src/provider_events.ts';
import { createProfileSnapshot, type ProfileId } from '../src/provider_profiles.ts';
import type { ProviderRequest } from '../src/providers.ts';

type ChatId = Extract<ProfileId, 'deepseek_chat' | 'kimi_chat' | 'openrouter_chat'>;
const model = 'explicit-configured-model';
const request = (id: ChatId, signal = new AbortController().signal): ProviderRequest => ({
  provider: id, model, intent: 'propose', prompt: 'Inspect this scene', context: 'selected scene data',
  max_output_tokens: 256, request_timeout_ms: 1000, signal,
  profile: createProfileSnapshot(id, model, id === 'openrouter_chat' ? ['chosen-upstream'] : [], 256),
});
const chunk = (delta: object, finish_reason: string | null = null, id = 'chatcmpl-1'): object =>
  ({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] });
const usage = (input: number, output: number): object => ({ id: 'chatcmpl-1', choices: [], usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output } });
const toolCall = (argumentsText = '{}', reasoning?: string): object[] => [
  chunk({ role: 'assistant', content: null, ...(reasoning ? { reasoning_content: reasoning } : {}), tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'scene_inspect', arguments: '' } }] }),
  chunk({ tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(0, 1) } }] }),
  chunk({ tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(1) } }] }, 'tool_calls'),
  usage(11, 7),
];
const wire = (events: object[], done = true): string => events.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
function response(events: object[], done = true): Response { return new Response(wire(events, done), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); }
function capture(events: object[], done = true): { fetch: typeof fetch; bodies: Record<string, unknown>[]; urls: string[]; headers: Headers } {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const headers = new Headers();
  const fetch: typeof globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    return response(events, done);
  };
  return { fetch, bodies, urls, headers };
}
const key = async (): Promise<string> => 'private-sentinel-key';
const isCode = (code: string) => (error: unknown): boolean => error instanceof ProviderTurnError && error.code === code;

test('DeepSeek wire request uses fixed endpoint and completed call with exact usage', async () => {
  const io = capture(toolCall('{}', 'reasoning-step'));
  const events: ProviderEvent[] = [];
  const result = await chatCompletionsResponse(request('deepseek_chat'), event => events.push(event), io.fetch, key);
  assert.deepEqual(io.urls, ['https://api.deepseek.com/chat/completions']);
  assert.equal(io.headers.get('authorization'), 'Bearer private-sentinel-key');
  assert.equal(io.headers.get('content-type'), 'application/json');
  assert.equal(io.bodies[0].model, model);
  assert.equal(io.bodies[0].stream, true);
  assert.equal(io.bodies[0].parallel_tool_calls, false);
  assert.deepEqual(io.bodies[0].stream_options, { include_usage: true });
  assert.equal(io.bodies[0].provider, undefined);
  const tools = io.bodies[0].tools as Array<{ type: string; function: { name: string; parameters: object } }>;
  assert.equal(tools.some(tool => tool.type === 'function' && tool.function.name === 'scene_patch_preview'), true);
  assert.equal(tools.every(tool => typeof tool.function.parameters === 'object'), true);
  assert.equal(result.call?.tool_name, 'scene_inspect');
  assert.deepEqual(result.call?.arguments, {});
  assert.deepEqual(result.usage, { input_tokens: 11, output_tokens: 7 });
  assert.equal(events.at(-1)?.kind, 'turn_completed');
  assert.equal(events.filter(event => event.kind === 'turn_completed').length, 1);
  assert.equal(JSON.stringify(io.bodies[0]).includes('private-sentinel-key'), false);
});

test('DeepSeek continuation replays assistant reasoning and linked tool result', async () => {
  const first = await chatCompletionsResponse(request('deepseek_chat'), () => {}, capture(toolCall('{}', 'keep this reasoning')).fetch, key);
  const second = capture([chunk({ role: 'assistant', content: 'done' }, 'stop'), usage(15, 3)]);
  const followup: ProviderRequest = { ...request('deepseek_chat'), previous_response_id: first.response_id,
    call_id: first.call!.call_id, tool_result: '{"status":"ok"}', continuation: first.continuation };
  const result = await chatCompletionsResponse(followup, () => {}, second.fetch, key);
  const messages = second.bodies[0].messages as Array<Record<string, unknown>>;
  assert.equal(messages.at(-2)?.role, 'assistant');
  assert.equal(messages.at(-2)?.reasoning_content, 'keep this reasoning');
  assert.equal((messages.at(-2)?.tool_calls as Array<{ id: string }>)[0].id, 'call-1');
  assert.deepEqual(messages.at(-1), { role: 'tool', tool_call_id: 'call-1', content: '{"status":"ok"}' });
  assert.equal(result.call, null);
  assert.equal(result.text, 'done');
  assert.deepEqual(result.usage, { input_tokens: 15, output_tokens: 3 });
});

test('Kimi keeps emitted reasoning but does not invent reasoning for another configured model', async () => {
  const withReasoning = await chatCompletionsResponse(request('kimi_chat'), () => {}, capture(toolCall('{}', 'Kimi reasoning')).fetch, key);
  const io = capture([chunk({ role: 'assistant', content: 'ok' }, 'stop')]);
  await chatCompletionsResponse({ ...request('kimi_chat'), previous_response_id: withReasoning.response_id, call_id: 'call-1', tool_result: '{}', continuation: withReasoning.continuation }, () => {}, io.fetch, key);
  assert.equal(io.urls[0], 'https://api.moonshot.ai/v1/chat/completions');
  assert.equal((io.bodies[0].messages as Array<Record<string, unknown>>).at(-2)?.reasoning_content, 'Kimi reasoning');
  const withoutReasoning = await chatCompletionsResponse(request('kimi_chat'), () => {}, capture(toolCall()).fetch, key);
  const assistant = (withoutReasoning.continuation as { messages: Array<Record<string, unknown>> }).messages.at(-1);
  assert.equal(Object.hasOwn(assistant!, 'reasoning_content'), false);
});

test('OpenRouter pins exact upstream route on first turn and continuation', async () => {
  const firstIo = capture(toolCall());
  const first = await chatCompletionsResponse(request('openrouter_chat'), () => {}, firstIo.fetch, key);
  const secondIo = capture([chunk({ role: 'assistant', content: 'complete' }, 'stop')]);
  await chatCompletionsResponse({ ...request('openrouter_chat'), previous_response_id: first.response_id, call_id: 'call-1', tool_result: '{}', continuation: first.continuation }, () => {}, secondIo.fetch, key);
  for (const io of [firstIo, secondIo]) {
    assert.equal(io.urls[0], 'https://openrouter.ai/api/v1/chat/completions');
    assert.deepEqual(io.bodies[0].provider, { only: ['chosen-upstream'], allow_fallbacks: false, require_parameters: true });
    assert.equal(io.bodies[0].model, model);
  }
});

test('profile, route, model, and continuation changes fail before network', async () => {
  let fetches = 0;
  const fetch: typeof globalThis.fetch = async () => { fetches++; return response([]); };
  const first = await chatCompletionsResponse(request('openrouter_chat'), () => {}, capture(toolCall()).fetch, key);
  const bad: ProviderRequest[] = [
    { ...request('openrouter_chat'), profile: { ...request('openrouter_chat').profile!, route: null } },
    { ...request('openrouter_chat'), profile: { ...request('openrouter_chat').profile!, route: { only: ['changed-upstream'], allow_fallbacks: false, require_parameters: true } } },
    { ...request('deepseek_chat'), model: 'changed-model' },
    { ...request('kimi_chat'), profile: { ...request('kimi_chat').profile!, endpoint: 'https://untrusted.example/chat' } },
    { ...request('openrouter_chat'), previous_response_id: first.response_id, call_id: 'different-call', tool_result: '{}', continuation: first.continuation },
    { ...request('deepseek_chat'), previous_response_id: first.response_id, call_id: 'call-1', tool_result: '{}', continuation: first.continuation },
  ];
  for (const value of bad) await assert.rejects(() => chatCompletionsResponse(value, () => {}, fetch, key), error => error instanceof ProviderTurnError);
  assert.equal(fetches, 0);
});

test('split UTF-8 and interleaved text/argument chunks produce one validated call', async () => {
  const events = [
    chunk({ role: 'assistant', content: '雪', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'scene_inspect', arguments: '' } }] }),
    chunk({ content: ' now', tool_calls: [{ index: 0, function: { arguments: '{' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '}' } }] }, 'tool_calls'),
  ];
  const bytes = Buffer.from(wire(events));
  const split = bytes.indexOf(Buffer.from('雪')) + 1;
  const chunks = [bytes.subarray(0, split), bytes.subarray(split, split + 1), bytes.subarray(split + 1)];
  const fetch: typeof globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const part of chunks) controller.enqueue(part); controller.close(); } }), { status: 200 });
  const observed: ProviderEvent[] = [];
  const result = await chatCompletionsResponse(request('deepseek_chat'), event => observed.push(event), fetch, key);
  assert.equal(result.text, '雪 now');
  assert.equal(result.call?.call_id, 'call-1');
  assert.deepEqual(result.usage, { input_tokens: null, output_tokens: null });
  assert.deepEqual(observed.filter(event => event.kind === 'text_delta').map(event => event.kind === 'text_delta' ? event.text : ''), ['雪', ' now']);
});

test('text-only stop and null content have distinct completed results', async () => {
  const text = await chatCompletionsResponse(request('kimi_chat'), () => {}, capture([chunk({ role: 'assistant', content: 'text answer' }, 'stop'), usage(3, 2)]).fetch, key);
  assert.equal(text.text, 'text answer');
  assert.equal(text.call, null);
  assert.equal(text.continuation, undefined);
  const call = await chatCompletionsResponse(request('kimi_chat'), () => {}, capture(toolCall()).fetch, key);
  assert.equal(call.text, '');
  assert.equal(call.call?.call_id, 'call-1');
});

test('failed, truncated, unknown-finish, and mismatched-finish streams never complete a turn', async () => {
  const failures: Array<{ events: object[]; done?: boolean; code: string }> = [
    { events: toolCall(), done: false, code: 'PROVIDER_DISCONNECTED' },
    { events: [chunk({ role: 'assistant', content: 'partial' })], code: 'PROVIDER_DISCONNECTED' },
    { events: [chunk({ role: 'assistant', content: 'partial' }, 'length')], code: 'PROVIDER_INCOMPLETE' },
    { events: [chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'scene_inspect', arguments: '{}' } }] }, 'stop')], code: 'PROVIDER_PROTOCOL_ERROR' },
  ];
  for (const scenario of failures) {
    const emitted: ProviderEvent[] = [];
    await assert.rejects(() => chatCompletionsResponse(request('deepseek_chat'), event => emitted.push(event), capture(scenario.events, scenario.done ?? true).fetch, key), isCode(scenario.code));
    assert.equal(emitted.some(event => event.kind === 'turn_completed'), false);
  }
});

test('multi-call, multi-choice, invalid arguments, and changed response ID are rejected', async () => {
  const malformed: object[][] = [
    [chunk({ tool_calls: [{ index: 0, id: 'call-1', function: { name: 'scene_inspect', arguments: '{}' } }, { index: 1, id: 'call-2', function: { name: 'scene_inspect', arguments: '{}' } }] }, 'tool_calls')],
    [chunk({ tool_calls: [{ index: 0, id: 'call-1', function: { name: 'scene_inspect', arguments: '{' } }] }), chunk({ tool_calls: [{ index: 1, id: 'call-2', function: { name: 'scene_inspect', arguments: '}' } }] }, 'tool_calls')],
    [{ id: 'chatcmpl-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }, { index: 1, delta: {}, finish_reason: 'stop' }] }],
    [chunk({ tool_calls: [{ index: 0, id: 'call-1', function: { name: 'scene_inspect', arguments: '{bad' } }] }, 'tool_calls')],
    [chunk({ role: 'assistant', content: 'a' }), chunk({ content: 'b' }, 'stop', 'chatcmpl-other')],
  ];
  for (const frames of malformed) {
    const emitted: ProviderEvent[] = [];
    await assert.rejects(() => chatCompletionsResponse(request('deepseek_chat'), event => emitted.push(event), capture(frames).fetch, key), error => error instanceof ProviderTurnError);
    assert.equal(emitted.some(event => event.kind === 'turn_completed'), false);
  }
});

test('OpenRouter HTTP-200 in-stream error fails without tool dispatch', async () => {
  const emitted: ProviderEvent[] = [];
  const frames = [chunk({ tool_calls: [{ index: 0, id: 'call-1', function: { name: 'scene_inspect', arguments: '{}' } }] }), { error: { code: 429, message: 'upstream failed' } }];
  await assert.rejects(() => chatCompletionsResponse(request('openrouter_chat'), event => emitted.push(event), capture(frames).fetch, key), isCode('PROVIDER_FAILED'));
  assert.equal(emitted.some(event => event.kind === 'turn_completed'), false);
});

test('duplicate usage and data after DONE cannot complete a turn', async () => {
  const emitted: ProviderEvent[] = [];
  await assert.rejects(() => chatCompletionsResponse(request('deepseek_chat'), event => emitted.push(event), capture([chunk({ content: 'answer' }, 'stop'), usage(2, 1), usage(3, 1)]).fetch, key), isCode('PROVIDER_PROTOCOL_ERROR'));
  const trailing = `${wire([chunk({ content: 'answer' }, 'stop')])}${wire([{ error: { message: 'late error' } }], false)}`;
  await assert.rejects(() => chatCompletionsResponse(request('openrouter_chat'), event => emitted.push(event), async () => new Response(trailing, { status: 200 }), key), isCode('PROVIDER_PROTOCOL_ERROR'));
  assert.equal(emitted.some(event => event.kind === 'turn_completed'), false);
});

test('cancelled credential lookup and cancelled stream cannot complete', async () => {
  const controller = new AbortController();
  let fetches = 0;
  await assert.rejects(() => chatCompletionsResponse(request('deepseek_chat', controller.signal), () => {}, async () => { fetches++; return response([]); }, async () => { controller.abort(); return 'key'; }), isCode('CANCELLED'));
  assert.equal(fetches, 0);
  const active = new AbortController();
  const emitted: ProviderEvent[] = [];
  const fetch: typeof globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(stream) { stream.enqueue(Buffer.from(wire(toolCall(), false))); active.abort(); stream.enqueue(Buffer.from('data: [DONE]\n\n')); stream.close(); },
  }), { status: 200 });
  await assert.rejects(() => chatCompletionsResponse(request('deepseek_chat', active.signal), event => emitted.push(event), fetch, key), isCode('CANCELLED'));
  assert.equal(emitted.some(event => event.kind === 'turn_completed'), false);
});

test('missing credentials and HTTP authentication/rate failures are redacted and classified', async () => {
  let fetches = 0;
  await assert.rejects(() => chatCompletionsResponse(request('kimi_chat'), () => {}, async () => { fetches++; return response([]); }), isCode('CREDENTIAL_MISSING'));
  assert.equal(fetches, 0);
  for (const [status, code] of [[401, 'PROVIDER_AUTH_FAILED'], [403, 'PROVIDER_AUTH_FAILED'], [429, 'PROVIDER_RATE_LIMITED']] as const) {
    await assert.rejects(() => chatCompletionsResponse(request('kimi_chat'), () => {}, async () => new Response('', { status }), key), error =>
      error instanceof ProviderTurnError && error.code === code && !error.message.includes('private-sentinel-key'));
  }
});

test('Discuss tool schema omits preview and rejects a malicious preview call', async () => {
  const io = capture([chunk({ role: 'assistant', content: 'answer' }, 'stop')]);
  await chatCompletionsResponse({ ...request('deepseek_chat'), intent: 'discuss' }, () => {}, io.fetch, key);
  const tools = io.bodies[0].tools as Array<{ function: { name: string } }>;
  assert.equal(tools.some(tool => tool.function.name === 'scene_patch_preview'), false);
  const preview = '{"scene_ref":"s","base_revision":"r","operations":[{"op":"create_child","parent_ref":"p","class_name":"Node2D","name":"Marker","properties":{"position":{"type":"Vector2","value":[1,2]}}}]}';
  const frames = [chunk({ tool_calls: [{ index: 0, id: 'call-1', function: { name: 'scene_patch_preview', arguments: preview } }] }, 'tool_calls')];
  const emitted: ProviderEvent[] = [];
  await assert.rejects(() => chatCompletionsResponse({ ...request('deepseek_chat'), intent: 'discuss' }, event => emitted.push(event), capture(frames).fetch, key), isCode('PERMISSION_DENIED'));
  assert.equal(emitted.some(event => event.kind === 'turn_completed'), false);
});
