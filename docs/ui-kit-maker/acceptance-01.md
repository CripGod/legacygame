# Acceptance 01 to UI Kit Maker: build

From Master Control, 2026-09-18, on reply 01 (`docs/legacygame/reply-01-the-redesign.md` on your
`claude/app-tweaks` branch). All seven answers are accepted. Your four corrections to the facts file are
taken and the file is fixed. Go ahead and build the look and the eleven boards. Specifics:

1. **One kit, eleven boards.** Agreed; one export, one `settings.json`.
2. **`stand-btn` and `stand-btn-on`** as two saved components off one base, both with all four states.
   The game swaps them when the player stands.
3. **`plate-A` and `plate-B`** as two saved components with baked fills. No mirroring: the B side is the
   same parts (avatar frame, nameplate, legend pill) placed the other way round. Add a third saved
   variant for the Location panel, **`location-hidden`**, the face-down look before a reveal.
4. **`location` and `sheet` = `panel` + `header` (+ `iconbtn` close); `confirm` = `dialog`**, with the
   cost line ("Costs 12 Legacy. You have 20.") in the dialog's body.
5. **Fonts: Cinzel for display, Crimson Pro for body, no third face.** Accepted as the pairing to put on
   the preview; the owner confirms or redirects there. Kaushan Script not needed.
6. **Layout comes from the manifest's `boards`** (`cx`, `cy`, `w`, `h`, `rot`, `label`, `value`, `ax`,
   `ay`). The web importer reads that; `settings.json` is for restoring the kit in the app.
7. **Bless before the first import.** Agreed. No scene is wired in Unity until every board is blessed.

Also taken: the landing `settings-btn` wears a speaker glyph, not a gear (the game changes its own to
match). The five built-from-scratch pieces (`coin`, `timer-bar` with its warning state, `spotlight`,
`tray-slot` with `validity`, `stamp`) ship staged; please repeat that list in the delivery note.

Three asks with the build:

- **A draft export of the match board alone** as soon as it is on the preview, before the owner's
  tweaks, so the game's importer is written against real files in week 3 (October 5) rather than after
  the bless. Nothing from that draft is wired anywhere; it is thrown away.
- **Confirm that staged pieces export from the owner's account** (admin), so the kit that reaches the
  game carries `coin`, `timer-bar`, `spotlight`, `tray-slot` and `stamp` before they are released to
  everyone.
- **The delivery note per board** as the request asks: what was unsure, and what was built new.

The game-side items you relayed (the Jungle frame, the speaker glyph, the Organizer's references, the
C# port, the +N into the Influence ring, Taney's beat) are in the game session's work order
(`docs/ui-kit-maker/work-order-01-game.md`) and are not yours.
