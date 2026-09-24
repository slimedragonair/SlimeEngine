# Actual dock input review and probe limits

The editor was opened on disposable copied fixtures in the real built Windows GUI. This record separates mouse/keyboard observations from method-level probes; the latter do not certify usability.

| Control/flow | Actual input observation | Automated evidence / limit |
|---|---|---|
| Selected scene and service | Clicked scene inspection and local-service connect; reviewed the selected scene in the Slime AI dock. | P04 editor probe and native inspection tests. |
| Permission modes | Clicked Protected, Discuss, Propose, and prior Execute/review controls on a copied 2D fixture. Prior real-input walkthrough previewed, granted, applied, undid, redid, saved, and reopened one `AI_Marker`; disk held exactly one marker. | `P05_OFFLINE_EDITOR_DEMO.md`; only the fake provider performed this visible mutation flow. |
| Provider/model | Clicked DeepSeek profile, entered `deepseek-flash`, and entered read-only task text. Without one-run authorization, clicked Start; the dock displayed `LIVE_AUTHORIZATION_REQUIRED`. No external request occurred. Switched to offline fake and clicked Discuss/Start/status. | Native/service tests cover all five profiles, including their actual adapters and native boundaries. |
| Status | Clicked task/change status and observed state updates; the dock displays selected profile and active run separately. | Native run-state/status assertions cover stale callback and uncertain operation protection. |
| Pending switch and cancellation timing | not_run by visible input while a real request was pending. | Service and native tests exercise stale/cancelled callbacks, immutable snapshot, and unresolved profile switch. A method-level probe is not a visible timed control walkthrough. |
| Save As cancellation | not_run by visible input. | Save As success and other ordinary saves passed in a built-editor opt-in probe. |

The visible first walkthrough used a disposable copy under `%TEMP%`; no production scene was edited. The later DeepSeek blocked-Start review used `C:\Users\logan\AppData\Local\Temp\slime-ai-p05-final-ui-240c8b7ac43048599957c7525a279ce3`. No key was entered or stored. The final binary was rebuilt after the last cosmetic label correction; the wire/native/save and headless smoke tests were rerun on that final binary. No claim is made that every control was re-clicked after that correction.
