# Work order 01 for the game session

From Master Control, 2026-09-18. Six items the owner sent to the UI Kit Maker chat that belong here,
plus two that start the roadmap's lanes. Main has moved since the roadmap was drafted (Jungle and six
more finishes, the end-of-match panel on the board, "+N floats and twin rings", the plaza backdrop
video); read each item against current `main` before acting.

## From the owner, via UI Kit Maker's reply

1. **Jungle finish frame.** Done by Master Control on 2026-09-18 (the owner handed the PNG to that
   session): `public/art/frames/character-jungle.webp` and `character-sm-jungle.webp` replaced. The new
   export's window was already knocked out (the forest photograph sits only in colour data under zero
   alpha, so the reply's worry did not apply). The frame was fitted onto the shared 1103×1426 geometry
   by aligning its three medallion centres to the previous frame's, so the printed cost, Influence and
   Force land where they did; checked on Anansi at hand and Codex size in the running app.
2. **Landing settings button: a speaker glyph instead of the gear** in
   `src/ui/components/SettingsMenu.tsx`. The menu holds only Music and Sound effects, so the icon should
   say sound. The match HUD copy of the same button follows (one component, one icon) unless the owner
   says otherwise.
3. **Organizer's references.** `src/engine/content/references.ts` has no `organizer` entry. Add the
   Wikipedia pages of the women the card's history names (Ella Baker, Fannie Lou Hamer) and the
   Montgomery bus boycott for the unnamed thousands, with the same `wiki()` helper as the other cards.
   Run `scripts/refs-check.ts` after.
4. **Influence feedback on the board.** The owner: "I don't like the terms 'planned' and 'fresh' … we
   need better terms, like 'waiting'. Then we need a '+1' to float up towards the circle that reads out
   your Influence score in the Location. Make sure to play that out. Same when a shockwave lands at a
   Location: we need that '+1' huge and jumping into that circle." Commit 71ba82a ("+N floats and twin
   rings") landed after the owner said this; check what it already does and finish the rest: the two
   state words the player can see (the Event tile's `planned` and the Threat tile's `fresh` are the
   class names; find where they surface as words) become plain words such as "Waiting"; every +N rides
   its landing up into the Location's Influence readout; the Word-spreads wave's +N is the big one.
   Landed by Master Control on 2026-09-18, from the owner's report that the wave "said +1 but did not add
   the point": the beat's snapshot already carried the payout, so the score rose two seconds before the
   wave arrived and then sat still as the +1 landed. The paid Locations now hold their old score until the
   wave reaches each one, then bump (`hold` in `BoardFx`). The rest of this item (the words, the +N riding
   into the readout, the big one on a wave) is still open.
5. **Taney's beat.** The owner: "We weren't able to stop Taney in time, so everybody got pushed out. We
   need to show the Taney card slamming down, like a gavel, and all of the cards being cast out. We
   need some evil laugh audio when this happens." Roger Taney (`src/engine/content/characters.ts`) is
   an Ally whose reveal stops the highest-Influence opposing Ready Character entering; when it lands, a
   staged beat: his card slams down (a gavel), the cast-out tiles fly off the panel one after another,
   and a new cue `taney.laugh` in `SFX_EVENTS` with a clip in `public/audio/sfx`. One system per
   meaning: the slam is a stand-style slam, the cast-outs use the existing fly path off the board.

## From the roadmap

6. **Start the C# engine port now** (roadmap phase 4). A plain C# class library, no Unity dependency,
   under `unity/Engine/` with a .NET test project beside it, built and tested with the .NET SDK in the
   container. Order: port `tests/engine.test.ts` first as the spec, then `types`, `rng`, `setup`,
   `query`, `resolve`, `view`. Same seed, same plans, same state. Then the parity harness: a script
   that plays N seeded matches in TypeScript and C# and compares a hash of every turn's state. Nothing
   in Unity is trusted until the harness is green on a thousand matches.
7. **The kit importer, week 3.** `scripts/kit.ts`: reads a kit ZIP's `assets/` and `kit-manifest.json`,
   emits `src/ui/kit.css` (`border-image` from each part's `nineSlice` and `shell`) and a layout table
   per board from the manifest's `boards` (`cx`, `cy`, `w`, `h` as percentages of 1920×1080). A
   `?kit=1` flag loads it after `theme.css`. Write it against the draft export of the match board that
   UI Kit Maker sends in week 3 (`docs/ui-kit-maker/what-the-exporter-does.md` has the schema).
8. **Capture mode, later (week 14).** Noted now so nothing is built against it: a fixed seed and
   scripted plans per turn, a clean-HUD toggle, and a 60 fps 1920×1080 recording path, for the trailer.
