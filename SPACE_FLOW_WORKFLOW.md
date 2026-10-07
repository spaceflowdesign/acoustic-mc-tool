# SPACE FLOW DESIGN — Execution Workflow

This file is the persistent operating contract for AI-assisted work in this repository.

## Authority
- The product owner has final decision authority.
- Do not turn an undecided point into a decided specification.
- Do not reinterpret a settled decision unless the owner explicitly asks to revisit it.

## Default flow
Before doing work, separate the state into:
1. Goal
2. Current state
3. Already completed / already verified
4. Settled decisions
5. Remaining work
6. Undecided items
7. Do-not-change scope
8. Acceptance criteria

Then execute only what is necessary to move from the current state to the requested goal.

## Anti-rework rules
- Do not repeat work merely because it is safer or more familiar.
- Do not ask the owner to repeat a check that is already recorded as completed unless the new change can reasonably invalidate that result.
- Reuse existing evidence from code, tests, PRs, logs, device checks, and documentation.
- Distinguish automated regression checks from owner/device checks. Re-run automation when technically justified; do not casually re-request physical-device verification that is unrelated to the change.

## Scope discipline
- Prefer the smallest safe change.
- Do not perform unrelated refactors, renames, dependency upgrades, UI polishing, architecture changes, or cleanup.
- If an unrelated defect or improvement is found, report it separately instead of fixing it.
- If the requested change cannot be made safely without broader structural work, stop before expanding scope and explain why.

## Completion standard
Do not stop at "implemented".
Where available, finish the task through verification and report:
- what changed,
- why it changed,
- affected files/areas,
- tests/checks performed,
- results,
- anything not verified,
- any owner decision still required.

## ChatGPT Work
When Work is used on this repository:
- treat this file as the operating contract;
- prioritize the shortest valid path over broad investigation;
- inspect existing project evidence before asking for more information;
- do not reopen settled product decisions;
- do not modify product behavior unless the task explicitly requires it;
- surface only decisions that genuinely require the owner.

## Codex
Codex must also follow the repository AGENTS.md. The intended division of responsibility is:
- Owner: vision and final decisions.
- Chat: orchestration, state tracking, task framing, and review.
- Work: research, browser/file operations, large-scale inspection and execution.
- Codex: minimal-diff implementation and verification.


## Platform / API direction
SPACE FLOW DESIGN is being developed toward a reusable tool-infrastructure business, not only a collection of standalone apps.

Apply these rules when shaping new shared capabilities:
- Prefer reusable domain boundaries and stable internal interfaces when the same capability is likely to serve multiple SPACE FLOW DESIGN products.
- Do not build a public API prematurely. First prove the capability inside one or more first-party products, then extract the stable common part.
- Keep product-specific UI and workflow separate from reusable core logic/data contracts where practical.
- When shared entities such as account, Project, Room, Session, calibration, analysis results, or reports are involved, avoid unnecessary incompatible schemas between products.
- Preserve local-first/privacy constraints where they are part of the product promise; infrastructure reuse does not automatically justify cloud transfer.
- Treat external API exposure, billing/metering, third-party authentication, rate limits, SDKs, SLAs, and public versioning as separate product decisions requiring owner approval.
- Prefer versionable contracts and identifiers so a proven internal capability can later become an external API without forcing needless rewrites.
- The business goal is to let first-party and eventually third-party tools consume proven SPACE FLOW DESIGN capabilities, creating infrastructure/API revenue where it is economically justified.
