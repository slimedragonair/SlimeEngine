# P05 provider verification matrix

Source commit: `2fced2f7c06e6e8de29c88212cfcefc7cdec17cd`. Built editor SHA-256: `1E16C51ACB85D91DBB4EA4E71A098C9916EA4ACAA651ED291E79AD01A0B52855`. Verification date: 2026-09-24. The offline model string `offline-fixture-model` is a fixture value, not a claim that a vendor serves it.

| Profile | Protocol / fixed endpoint | Implementation | Offline wire | Built-editor native loop | Real-input control | Live |
|---|---|---|---|---|---|---|
| OpenAI Responses | Responses, `https://api.openai.com/v1/responses` | complete | passed | passed | profile control visible; prior fake Execute walkthrough | not_run |
| Anthropic Messages | Messages, `https://api.anthropic.com/v1/messages` | complete | passed | passed | profile control visible | not_run |
| DeepSeek | Chat Completions, `https://api.deepseek.com/chat/completions` | complete | passed | passed | profile/model selected; unapproved Start blocked | not_run |
| Moonshot/Kimi | Chat Completions, `https://api.moonshot.ai/v1/chat/completions` | complete | passed | passed | profile control visible | not_run |
| OpenRouter | Chat Completions, `https://openrouter.ai/api/v1/chat/completions` | complete | passed with exact requested route | passed | profile/route controls visible | not_run |

The offline wire fixture asserts the initial outbound request and tool-result continuation for each profile, including endpoint, model, auth header with a dummy credential, tool schema, profile fingerprint, and response/result linkage. OpenRouter asserts `provider.only=["offline/upstream"]`, `allow_fallbacks=false`, `require_parameters=true` for both requests. A serialized requested route is not proof of the route actually served. Completion, failure, cancellation, and usage cases map to tests in `evidence/P05_WIRE_CONFORMANCE.md`.

The native loop for each profile goes through the same editor-owned preview, grant, revision, apply, status, undo/redo, and deduplication path. The adapter does not have a direct editor mutation channel. The shared transaction remains one allowlisted operation in one loaded scene, with `create_child` the only model-facing mutation. `P05_OFFLINE_EDITOR_DEMO.md` and `P04_CONTROL_REVIEW.md` distinguish built-editor probes from mouse/keyboard review.

No profile has live verification. The user's proposed DeepSeek model is `deepseek-flash`; it was selected in the dock without credential use or external request. A later run needs explicit endpoint/route, scene/context scope, finite limits, and one-run authorization.
