# TRUE route candidate art handoff (2026-11-14)

All images below are 512×512 RGBA PNG. They are implementation candidates, not approved final sprites. Keep the approved Turn 1/2 originals intact. Compare them at 360×640 and 390×844 before adoption.

| State / event | Candidate file | Integration note |
| --- | --- | --- |
| Turn 3 empty animal basin | `public/assets/world/turn3/water-trough-empty-candidate.png` | The existing `water-trough.png` already contains blue water and is unsuitable for Turn 3. Use the empty candidate then switch to the existing filled image after Turn 4 carry event. Shape alignment needs visual confirmation. |
| Turn 3 dry channel | `public/assets/world/turn3/dry-riverbed.png` | Retain until water is selected. |
| Turn 4 freshwater channel | `public/assets/world/turn4/flowing-riverbed-candidate.png` | Wet counterpart; compare footprint and placement with dry sprite. Repaint or mask if registration is visibly off. |
| Turn 4 uphill spring and pond | `public/assets/world/turn4/spring-pond-candidate.png` | Place uphill between cave and plant plot, with outlet facing toward channel. Do not connect channel to animal pen. |
| Turn 4 shrine | `public/assets/world/turn4/cave-shrine-candidate.png` | Stage 4 cave furnishings, not a new cave building. |
| Turn 4 settlement | Reuse approved hut and candidate `hut-second.png` instances | Arrange four buildings with an explicit readable state change and safe pathing. Do not treat one texture as four separate asset approvals. |
| Epilogue guardian pair | `public/assets/world/turn3/guardian-parent.png`, `guardian-child.png` | Guard against scale mismatch and colored fringe. Transform from existing livestock parent and child only after TRUE check. |
| Human dig | `public/assets/human/actions/dig-a-candidate.png`, `dig-b-candidate.png` | Two-frame spade motion for the dry channel; match the feet baseline, spade tip and scene target before playback. |
| Human water carry | `public/assets/human/actions/water-carry-a-candidate.png`, `water-carry-b-candidate.png` | Two walking steps with a filled hand bucket, for spring to animal basin transport. Keep the water source distinct from the basin. |
| Other human actions | `public/assets/human/actions/` | Existing gather/build/carry are provisional three-frame sets. Choose two coherent frames where appropriate; do not silently relabel the JSON. |

The generated Turn 4 and human images were resized from 1254×1254 image-generation outputs to the 512×512 project canvas. Their exact silhouette, alpha edges, scale and placement remain unapproved. In particular, the spring pond reaches the left/bottom canvas edge and needs a scene-fit check. They must not overwrite approved art. The spring, channel and shrine need a composite scene review. Turn 3 parent/child are candidates, not the user's approved reference image.

The rule and delivery requirements are recorded at Notion `https://app.notion.com/p/41878fa91aa281a3837ede25bf48ecf8`. Local prototype `src/game/trueRoute.ts` is not wired to the presentation; inspect it rather than assume it is authoritative.

## Review cycle 1 note (human action candidates)

The ten `gather` / `build` / `carry` / `dig` / `water-carry` action PNGs were moved from `public/assets/human/actions/` to `art-source/true-route/human-action-candidates/` (with the two-frame `animation.json`, unchanged). Each bakes the human together with its tool or carried object, so it cannot satisfy the Notion requirement that the human, target object and effect are separate layers. They are NOT registered or shipped at runtime. The runtime crew uses the approved human sprites with separate, code-native provisional object and effect layers (`src/presentation/crew.ts`). Replacing those with separate object/effect art is a Human Review / art decision.
