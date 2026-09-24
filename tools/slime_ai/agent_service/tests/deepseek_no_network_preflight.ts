import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chatCompletionsResponse } from '../src/chat_completions.ts';
import { profileCredentialStatus } from '../src/credentials.ts';
import { DeepSeekPilotBudget } from '../src/deepseek_pilot_budget.ts';
import { validateInlinePng } from '../src/image_input.ts';
import { createProfileSnapshot } from '../src/provider_profiles.ts';
import type { ProviderRequest } from '../src/providers.ts';

const [nativePath, imagePath, outputPath] = process.argv.slice(2);
if (!nativePath || !imagePath || !outputPath) throw new Error('Pass native preflight JSON, approved PNG, and output JSON paths.');
const native = JSON.parse(await readFile(nativePath, 'utf8')) as Record<string, unknown>;
if (native.status !== 'no_network_preflight' || native.permission_mode !== 'Manual' || native.network_request !== 'not_run' ||
    !native.transmitted_context || typeof native.transmitted_context !== 'object') throw new Error('Native fixture preflight is missing or not Manual.');
const imageBytes = await readFile(imagePath);
const image = validateInlinePng({ mime_type: 'image/png', base64: imageBytes.toString('base64') });
const context = JSON.stringify(native.transmitted_context);
const budget = new DeepSeekPilotBudget();
const requests: Record<string, unknown>[] = [];
const stages = [
  { id: 'connection', intent: 'discuss' as const, prompt: 'Reply with one brief sentence confirming you can respond. Do not call a tool.', output: 256, thinking: 'disabled' as const },
  { id: 'scene_inspection', intent: 'discuss' as const, prompt: 'Inspect the selected loaded scene with the scene_inspect tool, then summarize the returned scene facts.', output: 1024, thinking: 'disabled' as const },
  { id: 'proposal', intent: 'propose' as const, prompt: 'Preview one supported create_child marker in the selected scene. Do not apply it.', output: 512, thinking: 'disabled' as const },
  { id: 'vision', intent: 'discuss' as const, prompt: 'Describe only what is visually observable in the attached approved screenshot. Do not infer saved state.', output: 512, thinking: 'disabled' as const, image },
  { id: 'thinking_tool', intent: 'discuss' as const, prompt: 'Inspect the selected scene with one read-only tool and summarize the returned facts.', output: 2048, thinking: 'low' as const },
];
for (const stage of stages) {
  const request: ProviderRequest = {
    provider: 'deepseek_chat', model: 'deepseek-flash', intent: stage.intent, prompt: stage.prompt,
    context: stage.id === 'vision' ? '{}' : context,
    max_output_tokens: stage.output, request_timeout_ms: 30000,
    profile: createProfileSnapshot('deepseek_chat', 'deepseek-flash', [], stage.output),
    signal: new AbortController().signal, deepseek_thinking: stage.thinking,
    image_input: 'image' in stage ? stage.image : undefined,
    reserve_pre_request: (body, hasImage) => budget.reserve(body, hasImage),
  };
  let intercepted = false;
  const fakeFetch: typeof globalThis.fetch = async (url, init) => {
    if (intercepted || String(url) !== 'https://api.deepseek.com/chat/completions' || init?.redirect !== 'error') throw new Error('Unexpected outbound route.');
    intercepted = true;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const messages = body.messages as Array<Record<string, unknown>>;
    const user = messages[1];
    const content = user.content as string | Array<Record<string, unknown>>;
    const sanitizedContent = typeof content === 'string' ? content : content.map(part => part.type === 'image_url' ?
      { type: 'image_url', image_url: { data_sha256: createHash('sha256').update(imageBytes).digest('hex'),
        data_bytes: imageBytes.length, detail: (part.image_url as { detail: string }).detail } } : part);
    requests.push({ stage: stage.id, endpoint: String(url), model: body.model,
      messages: [{ role: 'system', content: messages[0].content }, { role: 'user', content: sanitizedContent }],
      tools: (body.tools as Array<{ function: { name: string } }>).map(tool => tool.function.name),
      tool_choice: body.tool_choice ?? 'omitted', thinking: body.thinking, reasoning_effort: body.reasoning_effort ?? null,
      stream: body.stream, stream_options: body.stream_options, parallel_tool_calls: body.parallel_tool_calls,
      max_tokens: body.max_tokens, route_only: null, automatic_fallback: false,
      request_timeout_ms: request.request_timeout_ms, deadline_ms: 120000, per_run_attempts: 3, per_run_tool_calls: 4 });
    const response = { id: 'dry-run-response', model: 'deepseek-flash', system_fingerprint: 'fixture-only',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'dry run' }, finish_reason: 'stop' }] };
    return new Response(`data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  await chatCompletionsResponse(request, () => {}, fakeFetch, async () => 'dummy-preflight-only');
  if (!intercepted) throw new Error('Production adapter did not build the request.');
}
const report = { status: 'no_network_preflight', credential: await profileCredentialStatus('deepseek_chat'),
  provider: 'deepseek_chat', model: 'deepseek-flash', base_url: 'https://api.deepseek.com',
  protocol: 'Chat Completions', permission_mode: 'Manual', native_context: native.transmitted_context,
  native_context_bytes: native.serialized_context_bytes, image: { path: imagePath,
    sha256: createHash('sha256').update(imageBytes).digest('hex'), bytes: imageBytes.length,
    width: imageBytes.readUInt32BE(16), height: imageBytes.readUInt32BE(20) },
  requests, pilot_budget_after_five_intercepted_attempts: budget.status(), external_requests: 0 };
await writeFile(outputPath, JSON.stringify(report, null, 2));
process.stdout.write(`preflight=passed credential=${report.credential} external_requests=0 stages=${requests.length}\n`);
