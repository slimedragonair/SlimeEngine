# Confirmed local source map

- `editor/SCsub`: editor source collection and subordinate `SConscript` calls; now includes `editor/slime_ai/SCsub`.
- `editor/register_editor_types.cpp::register_editor_types`: built-in editor plugin registration via `EditorPlugins::add_by_type<T>()`. `EditorNode` creates these in `editor/editor_node.cpp` near the `EditorPlugins::create()` loop.
- `editor/plugins/editor_plugin.h`: `EditorPlugin` base, `add_dock(EditorDock *)`, scene save/close notifications, and `get_undo_redo()`.
- `editor/editor_node.h::get_edited_scene`, `get_editor_selection`, `is_scene_unsaved`: current editor scene, selection, and unsaved status. `editor/editor_interface.cpp::get_open_scenes`, `get_unsaved_scenes` are public wrappers.
- `editor/editor_data.h::get_edited_scene_root`, `get_current_edited_scene_history_id`, `is_scene_changed`: edited roots/history. `is_scene_changed` updates its last checked version and is unsuitable as a pure read-only dirty query. Use `EditorNode::is_scene_unsaved` and a content revision for P02.
- `editor/editor_undo_redo_manager.h`: `create_action_for_history`, do/undo methods, reference ownership, and `commit_action(bool p_execute)`; `commit_action` defaults to executing do actions. Account for that when applying a transaction exactly once.
- `platform/windows/os_windows.cpp::execute_with_pipe`: returns `stdio`, `stderr`, `pid`; `drivers/windows/file_access_windows_pipe.cpp::get_length` uses `PeekNamedPipe`. `OS::kill` and `is_process_running` are available for child cleanup.
- `tests/SCsub`: auto-discovers nested test `.cpp` files and builds force-link header. `tests/test_main.cpp` uses doctest and the `--test` entry point. A nonzero matching case count is required for test evidence.

The implementation is split by responsibility: `slime_ai_editor_plugin` owns the dock and editor lifecycle; `slime_ai_service_client` owns private pipe transport; `slime_ai_project_inspector`, `slime_ai_scene_inspector`, `slime_ai_object_inspector`, and `slime_ai_api_describer` own read-only observations; `slime_ai_scene_commands`, `slime_ai_scene_transaction`, and `slime_ai_journal` own the allowlist, preview/grants/undo, and durable operation records. `editor/slime_ai/SCsub` enters only the editor build. `tools/slime_ai/agent_service` contains the offline fake child.

These symbols were inspected at local HEAD, not inferred from the remote plan. The final editor-only build and native tests verified the integration.

## P03 closeout and P04 additions at local HEAD `b6112992` plus working tree

- `editor/editor_node.{h,cpp}`, `editor/editor_interface.cpp`: return the actual scene save `Error` to callers; emit saved state only after success. `scene/resources/resource_format_text.cpp` closes/checks the text writer. `drivers/windows/file_access_windows.cpp` reports a failed Windows safe-save replace rather than success.
- `editor/slime_ai/slime_ai_scene_transaction.{h,cpp}`: native unresolved-operation scene lock, separate execution/persistence/verification status, explicit revision-bound resolution. `slime_ai_journal` remains the durable operation record.
- `editor/slime_ai/slime_ai_protocol.{h,cpp}` and `slime_ai_service_client.{h,cpp}`: version 1.1 run/event envelope and private child correlation alongside P03 version 1.0 compatibility.
- `editor/slime_ai/slime_ai_run_controller.{h,cpp}`: one bounded editor-owned run, selected-scene context and identity, provider-event barrier, read-only tool dispatch, preview/intent/grant/apply/status transition, pause/cancel, and observed status axes. `slime_ai_editor_plugin.{h,cpp}` exposes the controls in the existing dock.
- `editor/slime_ai/slime_ai_project_search.{h,cpp}` and `slime_ai_code_reader.{h,cpp}`: bounded project text search and path-scoped reads, including the actual unsaved ScriptEditor buffer when available. These are read-only data sources.
- `tools/slime_ai/agent_service/src/provider_events.ts`, `providers.ts`, `run_manager.ts`, `tool_schema.ts`, `credentials.ts`: complete-turn event accumulation, OpenAI Responses plus offline fake provider, finite serial loop, strict model tools with local semantic checks, and user-scoped credential lookup. `main.ts` and `protocol.ts` route versioned run frames. No provider SDK or general agent framework was added.
- `editor/slime_ai/slime_ai_save_failure_probe.{h,cpp}` with `tools/slime_ai/harness/run_denied_save_probe.ps1`, and `slime_ai_p04_editor_probe.{h,cpp}` with `run_p04_offline_editor_probe.ps1`: opt-in disposable fixture acceptance probes in the real built editor. The latter runs visibly with `-Gui` for unsaved ScriptEditor evidence. They do not run in ordinary editor startup.
- `tests/editor/slime_ai/test_slime_ai.cpp`, `test_slime_ai_p03_3d.cpp`, `test_slime_ai_p04_read.cpp`, and `test_slime_ai_p04_run.cpp`: native transaction/recovery, 3D create persistence, scoped reads, and offline run policy. `tools/slime_ai/agent_service/tests/provider.test.ts` covers adapter and service boundaries with synthetic responses.

`editor/slime_ai/SCsub` already collects the focused sources; no second registration path or new dock was created. The source/build identity and exact evidence are in `STATUS.md` and `TEST_MATRIX.md`.

## P05 source map at commit `2fced2f7c0`

- `tools/slime_ai/agent_service/src/provider_profiles.ts`: immutable endpoint, protocol family, credential target, route policy, model/limit validation, and nonsecret run fingerprint for five live profiles and fake.
- `src/anthropic_messages.ts`, `src/chat_completions.ts`, and retained `src/providers.ts`: provider-format SSE assembly and complete-turn barrier. Anthropic keeps assistant/thinking blocks for continuation; Chat Completions keeps result and reasoning linkage; OpenAI keeps Responses call IDs. Fixed endpoints reject redirects.
- `src/run_manager.ts`, `src/protocol.ts`, `src/main.ts`, `src/credentials.ts`: one serial finite run, profile snapshot, stale/duplicate continuation rejection, per-attempt usage/reservation, versioned frames, and profile-specific user credential lookup. `src/tool_schema.ts` remains the one model-facing operation validator.
- `editor/slime_ai/slime_ai_run_controller.{h,cpp}`: editor-owned profile/scope identity and native authority. `slime_ai_editor_plugin.{h,cpp}`: current-profile controls, one-run live authorization and dry-run status. `slime_ai_service_client.cpp`: refuses inherited provider-key variables in the editor child.
- `tests/editor/slime_ai/test_slime_ai_p05_provider_wire.cpp` and `tools/slime_ai/agent_service/tests/native_wire_fixture_service.ts`: provider-format HTTP/SSE fixtures through production adapters and the actual built-editor native preview/grant/apply/status/undo/redo boundary. `anthropic_messages.test.ts`, `chat_completions.test.ts`, and `provider.test.ts`: focused wire, failure, cancellation, routing, and accounting cases.
- `editor/slime_ai/slime_ai_save_regression_probe.{h,cpp}` and `tools/slime_ai/harness/run_save_regressions.ps1`: opt-in disposable built-editor normal save, Save As success, Save All, resource save/reload, undo/redo/save probes. Shared save code from P03 was reviewed but not changed in P05.
