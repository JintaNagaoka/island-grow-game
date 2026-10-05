# Island Grow Game AI Development Workflow

## Current scope

- This repository is in initial setup. The game technology stack has not been selected.
- Do not introduce npm, Phaser, TypeScript, a game framework, or stack-specific CI without an approved Issue and a human decision.
- Keep the AI workflow lightweight. Do not build a generic game engine or speculative infrastructure.

## Source of Truth

- Notion is the Source of Truth for game rules, game design, progression, content, and intended player experience.
- GitHub Issues translate an identified slice of the Notion specification into implementation scope and acceptance criteria. They do not override Notion.
- Code and tests implement and verify the approved specification. Existing code is not proof that an undocumented game rule is intended.
- If Notion is unavailable, ambiguous, internally inconsistent, or conflicts with an Issue or the repository, stop the affected design decision and ask the human. Do not invent or silently resolve game specifications.
- Each implementation Issue should identify the relevant Notion page or supplied specification context. Include only the minimum authoritative details needed for the task; never copy secrets or unrelated private content.

## Role separation

### Codex: Supervisor / Planner / independent Reviewer

Codex is responsible for:

- checking the relevant Notion specification and repository state
- turning approved scope into a focused GitHub Issue with testable acceptance criteria
- delegating investigation, implementation, and tests to Claude Code
- reviewing Claude Code's report, the actual changed-file list, and the actual diff
- independently checking test evidence and running or verifying appropriate tests
- requesting fixes for material findings
- deciding PR and merge readiness

Codex should not directly edit production code or test code unless the human explicitly asks it to. This restriction does not prevent Codex from maintaining AI-workflow documentation and configuration such as this file.

### Claude Code: Investigator / Implementer

Claude Code is responsible for:

- investigating the Issue and relevant code
- identifying the root cause or implementation seam
- implementing only the approved scope
- adding or updating appropriate tests
- running focused tests and relevant regression checks
- reporting the implementation and evidence to Codex

Claude Code does not give final approval and must not invent missing game design. It should surface ambiguity, architecture risk, visual judgment, and incomplete acceptance criteria as blockers or questions.

### Human: product and experience authority

Human judgment is required for:

- game feel and tuning
- final visual and animation quality
- playtesting conclusions
- unclear or missing game design
- large architecture or technology-stack decisions

AI agents may prepare evidence and options for these decisions, but must not silently make them.

## Delegation-first Issue workflow

For implementation work, use this sequence:

1. Codex confirms the relevant Notion specification and inspects the repository state.
2. Codex creates or refines one focused Issue with scope, non-goals, acceptance criteria, human-review needs, and the relevant Notion reference or supplied context.
3. Codex delegates repository investigation, design within the approved scope, implementation, tests, and the implementation summary to Claude Code.
4. Claude Code implements the change and reports the required evidence below.
5. Codex reviews the Issue, authoritative specification, Claude Code report, changed-file list, actual diff, and test results.
6. Codex independently runs or verifies the appropriate tests. Failed, inconsistent, or insufficient evidence returns to Claude Code for correction.
7. Codex declares READY only when all applicable readiness conditions are satisfied. Human-only judgments remain explicitly pending until a human completes them.

Codex must always inspect the actual diff before declaring READY. Summaries and reported test results are evidence, not substitutes for independent review.

## Claude Code implementation report

Claude Code must report:

- root cause or implementation approach, with relevant file and symbol references
- chosen design and meaningful rejected alternatives
- files changed
- tests added or changed
- focused test commands and exact results
- relevant regression commands and exact results
- compatibility, state-management, rendering, animation, and playback-speed considerations when applicable
- assumptions, unresolved risks, known limitations, and decisions requiring human review
- confirmation that unrelated files and pre-existing untracked changes were left untouched

## Review and merge readiness

Codex may declare a change READY only when all applicable conditions are met:

- the change matches the cited Notion specification and Issue acceptance criteria
- Codex has reviewed the actual diff and found no unresolved BLOCKER or MAJOR findings
- focused tests pass
- relevant regression tests pass
- the full test suite passes when a full suite exists and is applicable
- CI passes when project CI exists and is applicable
- no unresolved merge conflicts or unrelated tracked changes exist
- no secrets or credentials are included
- required human review for game feel, visuals, animation, playtesting, or architecture is complete

Do not claim that an automated test validates game feel or visual quality. Record those as human verification steps.

## Game architecture guardrails

Unless an approved specification explicitly requires otherwise:

- Keep Stage, Event, and Flag as separate concepts with explicit boundaries defined by the Notion specification. Do not let one silently encode or substitute for another.
- Do not implement the 24 order permutations as 24 independent large `if`/`switch` branches. Model shared rules and transitions explicitly and data-drive order-specific expectations.
- Treat the future 24-permutation table as expected-results data and a test oracle, not as the runtime architecture.
- Gameplay state is authoritative. Animation and rendering consume state; they must not become the source of truth for gameplay outcomes.
- Keep time-dependent behavior compatible with a future global playback-speed control. Avoid scattering fixed real-time delays or coupling rules to animation completion.
- Build only the abstractions needed by current approved specifications. Do not create a generalized engine prematurely.

## Security and repository safety

Never read, display, copy, commit, or expose:

- `.env` or `.env.*`
- API keys or access tokens
- private keys
- credentials or credential stores
- `.claude/settings.local.json`

Also:

- preserve unrelated user changes and existing untracked files
- do not rewrite Git history, force-push, or run destructive cleanup without explicit human approval
- do not weaken security boundaries or secret exclusions without explicit human approval and appropriate verification
- do not copy local or secret-bearing configuration from another repository

## Human escalation

Ask the human before proceeding with:

- an ambiguous or missing game-design decision
- a final game-feel, visual, animation, or playtest judgment
- a large architecture or technology-stack change
- a destructive or irreversible operation
- a security-boundary change or any need to access credentials
- a material expansion beyond the current Issue scope

Normal in-scope investigation, Claude Code delegation, implementation, testing, and independent review do not require routine confirmation.
