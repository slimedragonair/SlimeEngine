# Slime AI status — P05 handoff

## Direct DeepSeek Flash live preflight (2026-09-24)

The first live target is fixed to direct DeepSeek Chat Completions, model `deepseek-flash`, base URL `https://api.deepseek.com`, Manual mode, and one disposable copied 2D fixture. The no-network preflight **passed**; actual live stages are **`not_run`** because the private credential check returned `missing` and the final bounded policy still needs explicit approval. No external provider request or billable action occurred. Exact payload, source/binary identity, $2 pilot reservation rule, stage states, and evidence are in `evidence/P05_DEEPSEEK_FLASH_LIVE_DEMO.md`. This work retained the P05 adapter, shared run manager, and native transaction path. Other providers remain live `not_run`.

Safe implementation source is `bda77699e8b99335f03fdcf236fa0b3d32a36938`; built editor SHA-256 `F7D20A4C95EA208ADC5175204F3D3178BDC53D0305A69729BDD01E52700C93FB`. Service 68/68, typecheck exit 0, native 41/41 cases and 512/512 assertions. The earlier parallel native failure is retained; the asynchronous test wait was corrected and a solo rerun passed. The current documentation/evidence commit does not change the source/build identity below.

## Earlier P05 handoff

P05 implementation source is commit `2fced2f7c06e6e8de29c88212cfcefc7cdec17cd` on `codex/slime-ai-p00-p03`. The editor built from it is `bin/godot.windows.editor.dev.x86_64.console.exe`, SHA-256 `1E16C51ACB85D91DBB4EA4E71A098C9916EA4ACAA651ED291E79AD01A0B52855` (`evidence/editor-build-20260924-032939-741-manifest.txt`). The service package lock SHA-256 is `B4B9EAF42178EC6F360C4FFD5230012658B7A9C43BAC8EB317FE85E32E01284A`. Documentation is committed separately after verification; that later HEAD changes no P05 source or binary identity.

| Dimension | P05 state | Evidence |
|---|---|---|
| Implementation | complete within one operation/one loaded scene | Five explicit profiles, three protocol families, one bounded run manager and native run controller. `PROVIDER_MATRIX.md`; `SOURCE_MAP.md`. |
| Offline wire conformance | passed for five profiles | Production adapters consumed provider-format HTTP/SSE fixtures; initial and linked continuation outbound requests were asserted in the built editor. Native 40/40 cases, 507/507 assertions; service 63/63; typecheck exit 0. `evidence/P05_WIRE_CONFORMANCE.md`. |
| Built-editor integration | passed for scoped offline fixtures | Five profile wire loops traversed native preview/grant/apply/undo/redo/dedup/status. Real-input dock review exercised scene inspection, profile selection, blocked live Start, offline task/status and prior P04 fake Execute/save/reopen. Input coverage and probe coverage are separate in `evidence/P05_OFFLINE_EDITOR_DEMO.md` and `evidence/P04_CONTROL_REVIEW.md`. |
| Ordinary save regression | passed for executed cases | Normal save, Save As success, Save All with two dirty tabs, resource save/reload, undo/redo/save; copied fixtures and binary identity in `evidence/p05-save-regressions-20260924-033050-d6249261/manifest.txt`. Save As cancellation and full upstream suite are `not_run`. |
| Live provider | not_run | No external API request, credential use, or billable action. DeepSeek `deepseek-flash` was entered only into the dry dock; unapproved Start returned `LIVE_AUTHORIZATION_REQUIRED`. `evidence/P05_LIVE_STATUS.md`. |

The P03 locked-save/recovery evidence remains valid. Earlier failed P05 wire and baseline smoke checkpoints remain in `evidence/`; later passes do not erase them. The four untracked user-supplied work-order/planning files were preserved, and nothing was pushed.

## Historical P04 handoff

As of 2026-09-23/24, the P03 denied-save closeout and bounded P04 implementation are built in the existing checkout. Source identity is local HEAD `b6112992a830487ba3a1f81c4cd125455eb8ff82` **plus the working-tree changes** listed by `git status --short`; the checkout was not reset or pushed. Final editor binary `bin/godot.windows.editor.dev.x86_64.console.exe` has SHA-256 `DD074DB9A8F501432CE8C2BC66B33E5091C072C24A01F122A534CBEF7BEBC6A5`. Final build evidence: `evidence/editor-build-20260924-002902-739-manifest.txt`. Exact commands and counts are in `TEST_MATRIX.md`.

| Gate | State | Evidence and meaning |
|---|---|---|
| P03 native closeout | passed | Real exclusive-lock save failed with error 20; old scene hash remained intact, editor edit stayed unsaved, duplicate delivery added no second node, explicit retry saved and reopened one effect. A separate deterministic injection passed. `evidence/P03_SAVE_FAILURE.md`. |
| Provider adapter | implemented, offline tested | One configured OpenAI Responses adapter, provider-neutral event accumulator, bounded serial service, credential status. Synthetic responses and 35 service tests pass. No live call was made. |
| Offline conformance | passed | Native 33/33 cases, 393/393 assertions; service 35/35; TypeScript typecheck exit 0; final binary build exit 0. |
| Built-editor integration | passed for programmed fixture flow | Visible GUI editor probe ran Discuss, Propose, trusted Execute, native grant/apply/undo/redo/save/reopen and unsaved ScriptEditor read on a copied 2D fixture. Manual P04 dock clicks and gameplay testing remain unrun. `evidence/P04_OFFLINE_DEMO.md`. |
| Live provider | not_run | No paid request, model selection, or credential supplied for an authorized live run. `evidence/P04_LIVE_DEMO.md`. |

Only one allowlisted operation per transaction in one loaded scene is enabled. Real-model writes use the existing native preview/grant/revision/apply/status/undo/recovery path. The model-facing P04 preview tool currently accepts only `create_child`; the broader P03 native allowlist and its test map are recorded in `TEST_MATRIX.md`. No generated-code execution, script writes, content recipes, or autonomous game-building feature was added.

Earlier P00–P03 acceptance, including the real GUI demonstration and killed-editor `present_unconfirmed` record, remains in `evidence/EDITOR_DEMO.md`. The first real locked-save attempt exposed a false success report, and its failed checkpoint remains in `evidence/p03-denied-save-first-*`. The fix now propagates the Windows safe-replace failure to `EditorInterface::save_scene()` and preserves the live unsaved scene. Three user-supplied untracked planning files remain untouched.
