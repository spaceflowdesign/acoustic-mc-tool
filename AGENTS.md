# AGENTS.md — Acoustic M.C Tool

Read `SPACE_FLOW_WORKFLOW.md` before making changes. Its authority, anti-rework, scope, and completion rules are mandatory.

## Repository-specific rules
- This is the Acoustic M.C Tool Web product. Treat current production behavior and recorded decisions as constraints, not suggestions.
- The supported target is iPhone Safari. Android and PC are outside the guaranteed support target unless a task explicitly expands scope.
- Preserve the product principle: local audio/file processing. Do not add upload/cloud processing or external audio transfer unless explicitly approved.
- Preserve A/B comparison semantics, synchronization, GAIN MATCH behavior, DIFF/display behavior, MEMO/reference behavior, and authentication/privacy behavior unless the task explicitly targets them.
- Do not introduce automatic sound correction. The Tool compares and visualizes; it does not auto-correct the user's audio.
- Do not reintroduce horizontal-swipe page navigation.
- Do not claim physical-iPhone verification from desktop/browser automation.
- Existing real-device evidence recorded in project docs is valid until a relevant change invalidates it. Do not ask the owner to repeat unaffected checks.

## Implementation discipline
- Inspect the relevant current code, merged PR history when needed, and `TESTING.md` before changing behavior.
- Make the smallest safe diff. No opportunistic refactors, dependency changes, naming cleanups, or visual changes.
- If generated/standalone output depends on maintained source modules, rebuild using the repository's existing build path rather than editing generated output inconsistently.
- Run the relevant existing automated tests after code changes. Use `TESTING.md` as the current source of truth for required suites and acceptance evidence; do not hard-code an old pass-count into future claims.
- For Firebase/Auth/Firestore/terms/privacy/account-deletion changes, preserve the documented release ordering and do not loosen rules or data handling beyond the explicit request.
- Never mark an unresolved device-only issue as fixed without corresponding device evidence.

## Decision boundary
If a task would change product scope, data handling, supported environments, audio-analysis meaning, authentication semantics, pricing/licensing, or release policy, do not decide it yourself. Return the decision to the owner.
