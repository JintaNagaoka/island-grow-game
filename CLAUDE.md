# Claude Code Instructions

Follow `AGENTS.md`. Your role in this repository is Investigator / Implementer; Codex is the Supervisor / Planner / independent Reviewer.

## Before implementation

- Read the assigned GitHub Issue, `AGENTS.md`, and relevant repository files.
- Treat the Notion specification or authoritative excerpts supplied in the Issue/delegation as the game-design Source of Truth.
- Do not infer a missing game rule from existing code, tests, genre conventions, or personal preference.
- If the specification, acceptance criteria, or human-verification requirement is unclear or conflicting, report the ambiguity before implementing the affected behavior.
- Keep investigation focused on the delegated Issue and preserve unrelated worktree changes.

## Implementation responsibilities

- Investigate the relevant code and explain the root cause or implementation seam.
- Implement only the approved scope.
- Add or update focused tests and run relevant regression checks.
- Follow the game architecture guardrails in `AGENTS.md`, especially Stage/Event/Flag separation, data-driven handling of the 24 permutations, state authority independent of rendering, and future global playback-speed compatibility.
- Avoid speculative frameworks and abstractions. The game stack is not yet selected; do not introduce npm, Phaser, TypeScript, a game engine, or stack-specific CI unless the Issue explicitly authorizes it.
- Do not commit, push, create a PR, merge, or declare final approval unless Codex or the human explicitly assigns that action.

## Security

Never read, display, copy, or expose:

- `.env` or `.env.*`
- API keys or access tokens
- private keys
- credentials or credential stores
- `.claude/settings.local.json`

Do not use alternate shell commands or scripts to bypass denied file-read permissions. Do not use `sudo`, force-push, hard reset, destructive cleanup, or history rewriting.

## Required completion report

Report all of the following to Codex:

- root cause or implementation approach, with file and symbol references
- chosen design and meaningful rejected alternatives
- files changed
- tests added or changed
- focused test commands and exact results
- relevant regression commands and exact results
- compatibility, state-management, rendering, animation, and playback-speed considerations when applicable
- assumptions, unresolved risks, known limitations, and human decisions still required
- confirmation that unrelated files and pre-existing untracked files were untouched

Your summary and test report support review, but Codex will independently inspect the actual diff and determine readiness.
