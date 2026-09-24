# P04 shared-save regression closeout at P05

P03 changed the shared `EditorInterface::save_scene`, `EditorNode::_save_scene`, Windows safe-replace close, and text-resource writer paths. P05 reviewed those changes and ran ordinary saves in the built editor without a connected service, each on a disposable copied 2D fixture. The command was `powershell -NoProfile -ExecutionPolicy Bypass -File tools/slime_ai/harness/run_save_regressions.ps1`, exit 0. Full result and per-case JSON/stdio are in `p05-save-regressions-20260924-033050-d6249261/`; its manifest records source `2fced2f7c0`, binary SHA-256 `1E16C51ACB85D91DBB4EA4E71A098C9916EA4ACAA651ED291E79AD01A0B52855`, fixture paths, and hashes of shared save sources.

| Case | Result | Observed boundary |
|---|---|---|
| SV01 normal save/reopen | passed | Scene file and reopened node state match. |
| SV02 Save As success/reopen | passed | New path opens with the intended state. |
| SV02 dialog cancellation | not_run | Probe has no test-owned cancel callback. |
| SV03 Save All, two dirty tabs | passed | Both scenes persisted and reopened. |
| SV04/SV05 real denied save/retry | passed previously | Exclusive Windows lock, old disk hash, live unsaved state, one-effect retry: `P03_SAVE_FAILURE.md`. |
| SV06 AI-disabled ordinary save | passed within SV01/SV03 | Probe never connects a service. |
| SV07 resource save/reload | passed | `.tres` content survives reopen. |
| SV08 undo/redo/save/reopen | passed | Reopened scene matches final redo state. |

The full upstream Godot editor/resource suite was `not_run`; the native focused test filter skipped 1429 non-SlimeAI cases. Save As cancellation remains an explicit gap. The first P03 denied-save failure checkpoint remains retained in `p03-denied-save-first-*`.
