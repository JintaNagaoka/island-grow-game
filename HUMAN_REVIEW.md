# Smartphone Human Review workflow

Game feel, visual quality, animation readability and mobile layout are approved on a real smartphone. Automated tests and desktop inspection are prerequisites and supporting evidence; they never substitute for this review.

## Standard flow

1. Implement the focused GitHub Issue in its branch or worktree.
2. Run focused tests and the applicable regression checks, including the full suite, typecheck, production build and `git diff --check`.
3. Codex independently reviews the authoritative specification, Issue, changed-file list, actual diff and test evidence. BLOCKER or MAJOR findings return to implementation before deployment.
4. Commit the reviewed candidate and push its branch to GitHub. Do not deploy uncommitted local state as the review candidate.
5. Wait for the Cloudflare Pages check on the PR to complete successfully.
6. Record all of the following before review:
   - commit SHA
   - branch name and PR
   - deployment-specific Preview URL
   - stable Branch Preview URL
   - Cloudflare check result
7. Open the Preview URL on the real smartphone and complete the Issue-specific checklist at both target viewport classes.
8. Report results against the exact commit. Give each finding a scene/turn, expected result, actual result and screenshot or video when useful.
9. If fixes are required, repeat from step 2. The Branch Preview URL updates after the next push; the deployment-specific URL remains evidence for the reviewed commit.
10. Codex may declare READY only after the required human judgments are explicitly complete and all automated readiness conditions still pass.

## Deployment rules

- Prefer the repository's Cloudflare Git integration and its PR preview. A push to a non-production branch must create or update only a preview deployment, not production.
- Use the deployment-specific URL as immutable review evidence and the Branch Preview URL as the convenient re-review link.
- Confirm that the Cloudflare comment/check names the same commit that was pushed. A successful build for an older commit is not valid evidence.
- Confirm the preview returns HTTP 200 before handing it to the reviewer.
- Preview URLs are normally public unless Cloudflare Access is enabled. Do not put secrets, credentials, `.env` content or private user data in the build, URL, Issue or review evidence.
- Direct Upload or Wrangler is a fallback only when Git integration is unavailable. If used, record the local commit and confirm the uploaded `dist/` was built from it.

## Smartphone pass

Run the complete playable route rather than checking only isolated screens.

- Review at approximately 360×640 and 390×844 in portrait orientation.
- Check safe areas, clipping, scale, touch targets, overlays, text, the END panel and Retry.
- Watch transitions at normal speed. Use accelerated playback only as an additional determinism/regression check.
- Confirm character feet, target contacts, sprite size and facing do not jump between frames.
- Confirm causal order is readable: travel → work → visible result.
- Confirm persistent results remain visible after their Wave and at END when required.
- Confirm population, buildings and named entities are neither duplicated nor missing.
- Confirm candidates do not overlap stale art, reveal neighboring-image fragments or obscure unrelated terrain/UI.
- Continue through ending transformation, END and Retry. Retry must restore the initial presentation and allow the route to replay.
- Note browser/device/OS and whether the browser console showed errors when console access is practical.

Each Issue adds its own acceptance criteria. For Issue #26 the pass includes:

- build body movement, direction, hammer contact and debris
- completed furnace distinct from the cooking fire and persistent at END
- plant stages 1–5 at one anchored plot, with no old/new farm overlap
- population 3→6, homes 2→4 and readable parallel division of labour
- water collected at the spring, visibly carried and poured into the animal trough, without a pen channel
- cave entry before the exterior changes, no visible interior scene, and a single shrine exterior without doubled cave rock or stale cargo overlays
- guardian transformation, TRUE END and Retry

## Review record template

```md
### Smartphone Human Review

- Commit: `<sha>`
- Branch / PR: `<branch>` / `<PR URL>`
- Deployment URL: `<deployment-specific URL>`
- Branch Preview URL: `<stable branch URL>`
- Cloudflare status: success / failure
- Device / OS / browser: `<details>`
- Viewport class: 360×640 / 390×844 / other
- Route completed through Retry: yes / no

#### Result

- Visual quality: approved / changes requested
- Animation and game feel: approved / changes requested
- Mobile layout and touch: approved / changes requested
- Candidate assets: approved / changes requested / still pending

#### Findings

1. Scene or turn:
   - Expected:
   - Actual:
   - Evidence:
   - Severity:

#### Decision

- Human Review complete: yes / no
- Remaining decisions or follow-up Issue:
```

## Current Issue #26 preview example

- Commit: `41f69ab`
- Branch: `ai/issue-24-true-route-complete`
- PR: <https://github.com/JintaNagaoka/island-grow-game/pull/25>
- Deployment: <https://9a9e0d56.island-grow-game.pages.dev>
- Branch Preview: <https://ai-issue-24-true-route-compl.island-grow-game.pages.dev>
- Cloudflare Pages status: successful

This example records where to review that commit; it does not record human approval.
