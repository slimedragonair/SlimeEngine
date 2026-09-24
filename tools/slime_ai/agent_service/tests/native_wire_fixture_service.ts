// Test-only JSONL service. The production adapters consume provider-format
// HTTP/SSE bytes here; no socket, credential store, or external origin is used.
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { FrameDecoder } from '../src/frame_decoder.ts';
import { responseFor } from '../src/fake_provider.ts';
import { parseRequest, errorResponse, ProtocolFault } from '../src/protocol.ts';
import { RunManager } from '../src/run_manager.ts';
import { openAIResponse, type FetchLike, type ProviderRequest } from '../src/providers.ts';
import { anthropicMessagesResponse } from '../src/anthropic_messages.ts';
import { chatCompletionsResponse } from '../src/chat_completions.ts';
import type { ProviderEvent, TurnResult } from '../src/provider_events.ts';

const decoder = new FrameDecoder();
const write = (frame: object): void => { process.stdout.write(`${JSON.stringify(frame)}\n`); };
const record = (value: object): void => {
  const path = process.env.SLIME_AI_TEST_WIRE_LOG;
  if (path) appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
};
const key = async (): Promise<string> => 'offline-fixture-key';
const sse = (value: object): string => `data: ${JSON.stringify(value)}\n\n`;
const anthropicEvent = (value: { type: string }): string => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`;

function stream(bytes: string): Response {
  const data = Buffer.from(bytes, 'utf8');
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < data.length) { controller.enqueue(data.subarray(offset, Math.min(offset + 7, data.length))); offset += 7; }
      else controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function sceneArguments(request: ProviderRequest): string {
  const context = JSON.parse(request.context) as { scene_ref: string; base_revision: string; parent_ref: string; root_class: string };
  assert.equal(context.root_class, 'Node2D');
  assert.ok(context.scene_ref && context.base_revision && context.parent_ref);
  return JSON.stringify({ scene_ref: context.scene_ref, base_revision: context.base_revision, operations: [{
    op: 'create_child', parent_ref: context.parent_ref, class_name: 'Node2D', name: 'AI_Marker',
    properties: { position: { type: 'Vector2', value: [48, 24] } },
  }] });
}

function openAIWire(argumentsText: string | null): string {
  if (argumentsText === null) return sse({ type: 'response.output_text.delta', delta: 'Host result received.' }) +
    sse({ type: 'response.completed', response: { id: 'wire-openai-2', status: 'completed', output: [], usage: { input_tokens: 9, output_tokens: 3 } } });
  const item = { type: 'function_call', id: 'wire-item-1', call_id: 'wire-call-1', name: 'scene_patch_preview', arguments: argumentsText };
  return [
    { type: 'response.output_item.added', item },
    { type: 'response.function_call_arguments.delta', item_id: item.id, delta: argumentsText },
    { type: 'response.function_call_arguments.done', item_id: item.id, arguments: argumentsText },
    { type: 'response.output_item.done', item },
    { type: 'response.completed', response: { id: 'wire-openai-1', status: 'completed', output: [item], usage: { input_tokens: 11, output_tokens: 7 } } },
  ].map(sse).join('');
}

function anthropicWire(argumentsText: string | null): string {
  const start = { type: 'message_start', message: { id: argumentsText === null ? 'wire-anthropic-2' : 'wire-anthropic-1', role: 'assistant', content: [], stop_reason: null, usage: { input_tokens: 11, output_tokens: 0 } } };
  const events: Array<{ type: string; [key: string]: unknown }> = [start];
  if (argumentsText !== null) {
    events.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'wire-call-1', name: 'scene_patch_preview', input: {} } });
    events.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: argumentsText } });
    events.push({ type: 'content_block_stop', index: 0 });
  } else {
    events.push({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    events.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Host result received.' } });
    events.push({ type: 'content_block_stop', index: 0 });
  }
  events.push({ type: 'message_delta', delta: { stop_reason: argumentsText === null ? 'end_turn' : 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } });
  events.push({ type: 'message_stop' });
  return events.map(anthropicEvent).join('');
}

function chatWire(argumentsText: string | null): string {
  const id = argumentsText === null ? 'wire-chat-2' : 'wire-chat-1';
  const chunk = (delta: object, finish_reason: string | null = null): object => ({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] });
  const events = argumentsText === null
    ? [chunk({ role: 'assistant', content: 'Host result received.' }, 'stop')]
    : [chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'wire-call-1', type: 'function', function: { name: 'scene_patch_preview', arguments: '' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: argumentsText } }] }, 'tool_calls')];
  events.push({ id, choices: [], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } });
  return events.map(sse).join('') + 'data: [DONE]\n\n';
}

async function fixtureProvider(request: ProviderRequest, onEvent: (event: ProviderEvent) => void): Promise<TurnResult> {
  assert.notEqual(request.provider, 'fake');
  assert.ok(request.profile);
  assert.equal(request.model, 'offline-fixture-model');
  assert.equal(request.profile.model, request.model);
  const continuation = Boolean(request.call_id);
  const argumentsText = continuation ? null : sceneArguments(request);
  const fetchImpl: FetchLike = async (url, options) => {
    assert.equal(String(url), request.profile!.endpoint);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('authorization'), 'Bearer offline-fixture-key');
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    assert.equal(body.model, request.model);
    assert.equal(body.stream, true);
    assert.ok(Array.isArray(body.tools));
    if (request.provider === 'openrouter_chat') assert.deepEqual(body.provider, { only: ['offline/upstream'], allow_fallbacks: false, require_parameters: true });
    else assert.equal(body.provider, undefined);
    if (continuation) {
      assert.equal(request.call_id, 'wire-call-1');
      assert.ok(request.tool_result?.includes('"status":"preview"'));
      if (request.provider === 'openai_responses') {
        assert.equal(body.previous_response_id, 'wire-openai-1');
        assert.equal((body.input as Array<{ call_id: string }>)[0].call_id, 'wire-call-1');
      } else if (request.provider === 'anthropic_messages') {
        const last = (body.messages as Array<{ content: Array<{ tool_use_id?: string }> }>).at(-1);
        assert.equal(last?.content[0].tool_use_id, 'wire-call-1');
      } else {
        const last = (body.messages as Array<{ role: string; tool_call_id: string }>).at(-1);
        assert.equal(last?.role, 'tool');
        assert.equal(last?.tool_call_id, 'wire-call-1');
      }
    }
    record({ provider: request.provider, stage: continuation ? 'continuation' : 'initial', endpoint: String(url), model: body.model,
      tool_schema_present: (body.tools as object[]).length > 0, route: body.provider ?? null, linked_result: continuation,
      profile_fingerprint: request.profile!.fingerprint, outbound_assertions: 'passed' });
    const wire = request.provider === 'openai_responses' ? openAIWire(argumentsText) :
      request.provider === 'anthropic_messages' ? anthropicWire(argumentsText) : chatWire(argumentsText);
    return stream(wire);
  };
  if (request.provider === 'openai_responses') return openAIResponse(request, onEvent, fetchImpl, key);
  if (request.provider === 'anthropic_messages') return anthropicMessagesResponse(request, onEvent, fetchImpl, key);
  return chatCompletionsResponse(request, onEvent, fetchImpl, key);
}

const runs = new RunManager(write, fixtureProvider);
for await (const chunk of process.stdin) {
  if (!Buffer.isBuffer(chunk)) continue;
  for (const event of decoder.push(chunk)) {
    if (event.kind !== 'frame') continue;
    try {
      const request = parseRequest(event.text);
      if (request.protocol_version === '1.1') {
        if (request.method === 'provider_status') write({ protocol_version: '1.1', request_id: request.request_id, status: 'ok', result: { provider: request.params.profile_id ?? 'fake', credential: 'fixture_only' } });
        else write(runs.handle(request));
      } else write(responseFor(request));
    } catch (error) {
      const fault = error instanceof ProtocolFault ? error : new ProtocolFault('PROVIDER_PROTOCOL_ERROR', 'Fixture service rejected a request.', '__fixture_error__', 'Inspect the offline fixture.');
      write(errorResponse(fault));
    }
  }
}
