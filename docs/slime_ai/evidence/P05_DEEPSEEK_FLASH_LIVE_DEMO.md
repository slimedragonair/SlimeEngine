# DeepSeek Flash first live-provider session: preflight only

**Live status: `not_run`.** As of 2026-09-24, no external DeepSeek request, credential use for a request, or billable action occurred. A no-network credential check returned `missing` for the user-scoped Windows Credential Manager target `SlimeEngine/DeepSeek`. The key previously shared in chat was not installed, copied into source, placed in an environment variable, or included in these artifacts. Rotate that key before private installation because it appeared in chat.

## Source and artifact identity

- Checkout branch: `codex/slime-ai-p00-p03`; final preflight source HEAD `bda77699e8b99335f03fdcf236fa0b3d32a36938` (DeepSeek preflight implementation `d198db95c3`, asynchronous test correction `bda77699e8`). Later evidence-only commits do not alter this source identity.
- Built editor: `E:\SlimeEngine\bin\godot.windows.editor.dev.x86_64.console.exe`, SHA-256 `F7D20A4C95EA208ADC5175204F3D3178BDC53D0305A69729BDD01E52700C93FB`; build manifest `editor-build-20260924-151602-284-manifest.txt`.
- Service lockfile SHA-256 `B4B9EAF42178EC6F360C4FFD5230012658B7A9C43BAC8EB317FE85E32E01284A`. No new package or provider SDK was installed.
- Local fixture: disposable copy at `C:\Users\logan\AppData\Local\Temp\slime-ai-deepseek-live-9ef060775dd44768a0127cab8f17ba70`, loaded scene `res://main.tscn`, permission mode `Manual`. The approved-image candidate is `frame_001.png` in that copy, also preserved as `p05-deepseek-frame_001.png` beside this note: 2560×1440, 198,496 bytes, SHA-256 `394D072F637CE27DAEB0AB445B353E6CDB36807B54824FA74496AE074CB253D9`. Its generic filename and image prompt contain no visual answer hint. The exact image itself must be approved in the final policy before live use.

## No-network preflight result

The selected direct profile resolves to base URL `https://api.deepseek.com`, endpoint `https://api.deepseek.com/chat/completions`, model `deepseek-flash`, Chat Completions protocol. No alternate provider, model, route, or beta endpoint is configured. Requests use streaming SSE, `parallel_tool_calls:false`, one serial service run, no redirect following, and a dummy credential only in the intercepted offline preflight. The first, non-thinking calls send `thinking:{type:"disabled"}`. The later thinking stage sends `thinking:{type:"enabled"}`, `reasoning_effort:"low"`, and omits `tool_choice`; it never forces a named or required tool. The adapter preserves `reasoning_content` and linked tool IDs/results on continuation. Strict-schema beta mode is not requested.

Native editor inspection produced **708 serialized context bytes**. The actual `transmitted_context` JSON is in `p05-deepseek-native-preflight.json`; it contains the copied loaded scene path, revision, root and child references, class/position/visibility summaries, and `editor_unsaved:false`. It is freshly recomputed for each editor run, so instance references in this snapshot are not authority for a later reopened scene. The production adapter's intercepted outbound bodies and exact stage prompts are sanitized in `p05-deepseek-adapter-preflight.json`. The vision request sends a `user` content array with a text block and an actual `data:image/png;base64,...` `image_url` block; the evidence replaces only the base64 with its SHA-256/byte count. It sends no scene summary, filename, or visual ground truth in the prompt and defines **zero tools** with `tool_choice:"none"`. A provider tool call on that image turn fails closed.

Normal Discuss tools: `project_inspect`, `scene_inspect`, `object_inspect`, `api_describe`, `project_search`, `code_read`, `changeset_status`. Propose adds `scene_patch_preview`, which can only preview one `create_child` in one loaded scene. A model cannot grant or apply a preview. The current fixture project contains only its copied trusted source; code reads remain bounded by the existing service/native path. The live run must keep this fixture selected and review the fresh context before each stage.

## Proposed run policy requiring approval

| Bound | Enforced setting |
|---|---|
| Total pilot allowance | $2 maximum pre-request reservation, using DeepSeek Flash **peak** cache-miss input $0.30/1M tokens and output $1.20/1M tokens, checked 2026-09-24 against [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/). Reserve twice serialized outbound text bytes as input tokens, plus a 1024-token image upper bound, and the full output limit. Never refund an ambiguous attempt. Recheck rates before a later live date. |
| Provider attempts | 12 total per local service session, including retries; 3 per run; at most one request in flight. A service restart ends this approval and requires fresh review of the ledger and authorization. |
| Native calls and writes | 24 total service-side tool calls; 4 per run; one native write in flight. Exactly one supported preview/application is proposed for this ladder. Every edit remains under native revision, grant, journal, status, deduplication, undo, and recovery controls. |
| Time and input | 30 seconds per request and 120 seconds per run; prompt at most 16 KiB, native scene context at most 32 KiB, bounded continuation at most 256 KiB. Vision allows one validated PNG at most 256 KiB and 4096 pixels per side; no URL fetching or unrestricted capture. |
| Output per planned stage | Connection 256; scene inspection 1024; proposal 512; image 512; low-effort thinking tool round trip 2048. The manual native apply/save stage has no independent provider output allowance. |
| Failure rule | Stop at the first failed stage or exhausted bound. Reconcile an uncertain native operation by existing status before any retry. Do not substitute a new operation ID, model, provider, route, or endpoint. No limit increase is automatic. |

The five intercepted initial request shapes reserved 14,601,000 nanodollars ($0.014601) in a fresh **offline** budget object; this is an upper-bound demonstration, not a charge or a prediction of the full ladder. Production reserves each actual continuation and retry before its HTTP request. Provider usage and invoice cost remain unobserved. The $2 reservation is a local guard, not an invoice guarantee.

## Verification and staged live results

| Dimension / stage | State | Evidence or reason |
|---|---|---|
| Text connection, non-thinking | `not_run` live | Outbound payload generated through the production adapter with injected fetch; credential missing and policy unapproved. |
| Scene inspection and tool-result continuation | `not_run` live | Existing offline adapter/native tests cover linked tool output; no real model turn. |
| Non-mutating native proposal | `not_run` live | Existing preview path remains authoritative; no real model proposal. |
| Human review, exact preview grant, apply once | `not_run` live | Requires the actual preview and separate human grant. |
| Fresh inspection, undo/redo, save/reopen | `not_run` live | P03–P05 fixture persistence tests passed previously, but this live effect does not exist. |
| Read-only image input | `not_run` live | Production adapter built a valid `user` image block from the real PNG bytes offline. Actual model vision unobserved. |
| Low-effort thinking tool round trip | `not_run` live | Offline SSE fixtures verify `reasoning_content` continuation and unforced tool choice. Real reasoning/continuation unobserved. |
| Requested model | `deepseek-flash` | Fixed direct DeepSeek profile. |
| Returned model and backend fingerprint | `not_run` live | Adapter captures both if SSE provides them; offline fixture values are not vendor evidence. |
| Editor integration | passed offline; `not_run` live | Built editor/native 41/41 cases, 512/512 assertions. No live editor run. |
| Persistence verification | `not_run` live | No live mutation, save, or reopen to verify. |
| Other provider live states | unchanged `not_run` | DeepSeek preparation does not verify OpenAI, Anthropic, Moonshot/Kimi, or OpenRouter live. |

Exact commands: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/slime_ai/harness/build_editor.ps1 -Jobs 8` (exit 0); `powershell -NoProfile -ExecutionPolicy Bypass -File tools/slime_ai/harness/run_native_tests.ps1` (41/41, 512/512, exit 0); `npm test` in `tools/slime_ai/agent_service` (68/68, exit 0, `p05-deepseek-service-tests.txt`); `npm run typecheck` (exit 0, `p05-deepseek-typecheck.txt`). The built editor no-network capture used `SLIME_AI_TEST_NO_NETWORK_PREFLIGHT=1`, `SLIME_AI_PREFLIGHT_OUTPUT=...\p05-deepseek-native-preflight.json`, `--headless --editor --rendering-method gl_compatibility --path <copied fixture> res://main.tscn --quit-after 60` (exit 0, `p05-deepseek-native-preflight.log`). The adapter capture used `node --disable-warning=ExperimentalWarning --experimental-strip-types tests/deepseek_no_network_preflight.ts <native-json> <frame_001.png> <adapter-json>` and reported `credential=missing external_requests=0 stages=5`.

An earlier final parallel native run failed one P04 pause/resume assertion because the state event preceded the asynchronous tool-call event; its log and manifest are preserved as `p05-deepseek-native-first-failed.*`. The test now waits for the tool event after Resume. A solo rebuild and native rerun passed 41/41 and 512/512. The full upstream Godot suite remains `not_run` (1429 cases excluded by the focused native filter).
