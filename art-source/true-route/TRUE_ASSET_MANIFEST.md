# TRUE route candidate art handoff (2026-11-14)

All images below are 512×512 RGBA PNG. They are implementation candidates, not approved final sprites. Keep the approved Turn 1/2 originals intact. Compare them at 360×640 and 390×844 before adoption.

| State / event | Candidate file | Integration note |
| --- | --- | --- |
| Turn 3 empty animal basin | `public/assets/world/turn3/water-trough-empty-candidate.png` | The existing `water-trough.png` already contains blue water and is unsuitable for Turn 3. Use the empty candidate then switch to the existing filled image after Turn 4 carry event. Shape alignment needs visual confirmation. |
| Turn 3 dry channel | `public/assets/world/turn3/dry-riverbed.png` | Retain until water is selected. |
| Turn 4 freshwater channel | `public/assets/world/turn4/flowing-riverbed-candidate.png` | Wet counterpart; compare footprint and placement with dry sprite. Repaint or mask if registration is visibly off. |
| Turn 4 uphill spring and pond | `public/assets/world/turn4/spring-pond-candidate.png` | Place uphill between cave and plant plot, with outlet facing toward channel. Do not connect channel to animal pen. |
| Turn 4 shrine (superseded) | `art-source/true-route/superseded/cave-shrine-candidate.png` | Removed from runtime by Issue #26; the supplied whole-hill exterior below replaces this cargo-only overlay. |
| Turn 4 settlement | Reuse approved hut and candidate `hut-second.png` instances | Arrange four buildings with an explicit readable state change and safe pathing. Do not treat one texture as four separate asset approvals. |
| Epilogue guardian pair | `public/assets/world/turn3/guardian-parent.png`, `guardian-child.png` | Guard against scale mismatch and colored fringe. Transform from existing livestock parent and child only after TRUE check. |
| Human dig | `public/assets/human/actions/dig-a-candidate.png`, `dig-b-candidate.png` | Two-frame spade motion for the dry channel; match the feet baseline, spade tip and scene target before playback. |
| Human water carry | `public/assets/human/actions/water-carry-a-candidate.png`, `water-carry-b-candidate.png` | Two walking steps with a filled hand bucket, for spring to animal basin transport. Keep the water source distinct from the basin. |
| Other human actions | `public/assets/human/actions/` | Existing gather/build/carry are provisional two-frame sets. Preserve the supplied frame names and the 300 ms/frame logical timing. |

The generated Turn 4 and human images were resized from 1254×1254 image-generation outputs to the 512×512 project canvas. Their exact silhouette, alpha edges, scale and placement remain unapproved. In particular, the spring pond reaches the left/bottom canvas edge and needs a scene-fit check. They must not overwrite approved art. The spring, channel and shrine need a composite scene review. Turn 3 parent/child are candidates, not the user's approved reference image.

The rule and delivery requirements are recorded at Notion `https://app.notion.com/p/41878fa91aa281a3837ede25bf48ecf8`. Local prototype `src/game/trueRoute.ts` is not wired to the presentation; inspect it rather than assume it is authoritative.

## Review fix v2 (Issue #26, package `true-route-review-fix-v2`, 2026-11-15) — inventory

Everything below is a **candidate**: none of it has human visual approval. "Existing" = already in the repository; "supplied" = byte-identical to the review package; "new (code)" = drawn by code, no PNG.

| Use | File / symbol | Status |
| --- | --- | --- |
| Build / gather / carry / dig / water-carry body poses (10 frames) | `public/assets/human/actions/*.png`, byte copies of `art-source/true-route/human-action-candidates/*.png` | existing, unedited; now used at runtime as composite work sprites (`src/presentation/humanActions.ts`) |
| Plant stages 1-5 | `public/assets/world/plants/plant-stage-{1-sprouts,2-saplings,3-red-fruit,4-blossoms,5-golden-fruit}.png` | supplied, unedited, candidate |
| Shrine cave exterior (whole hill) | `public/assets/world/turn4/cave-shrine-exterior.png` | supplied, unedited, candidate; fitted over the baked cave mouth by scale and position only |
| Stone furnace | `src/presentation/furnaceDraw.ts` (Phaser Graphics) | new (code), provisional; no furnace art exists in the repository or the package |
| Practical-cave furnishings (Turn 3 cave stage) | `public/assets/world/turn3/cave-practical.png` | existing, unchanged |
| Second hut art for the two added homes | `public/assets/world/turn3/hut-second.png` | existing, unchanged (same texture, drawn at 0.8x) |
| Superseded, removed from runtime | `art-source/true-route/superseded/{mature-farm,cave-shrine-candidate}.png` | existing, moved (not edited) |

No derived PNG was made. The per-frame anchors, scales and contact points of the action frames and the plant frames are measured from the PNGs and checked by `humanActions.test.ts` and `plantGrowth.test.ts`.

## Review cycle 1 note (human action candidates) — historical, superseded

Before Issue #26, the ten `gather` / `build` / `carry` / `dig` / `water-carry` action PNGs were kept only in `art-source/true-route/human-action-candidates/` because each bakes the human together with its tool or carried object. Issue #26 explicitly requires the existing body poses at runtime and permits a reported composite work sprite, so they are now also copied byte-for-byte to `public/assets/human/actions/`. Buildings, world state and effects remain separate; replacing the provisional composite frames with approved separated art is still a Human Review / art decision.
