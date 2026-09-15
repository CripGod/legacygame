# Component inventory: the chrome on screen today

Every piece of UI Kit Maker-shaped chrome in the web game as of 2026-09-15, named by its CSS class, which is
the name the kit must export it under. Art, particles, flying clones and the fanned hand are not chrome
and are not listed. States use the kit's words: idle, hover, pressed, disabled, plus the game's own.

## Match screen (`MatchScreen`, `Hud`, `Battlefield`)

| Name | What it is | Words on it | States | Driven at runtime |
|---|---|---|---|---|
| `plate` | The profile plate beside each avatar | handle; "5/7 in hand · 12 in deck · you" | idle; tinted A gold or B blue; `first` (has initiative) | hand count, deck count, initiative |
| `legend-pill` | Small pill inside the plate | "★ 2" | idle; `spread` (at LEGEND_READY, glows) | legend count |
| `stand-btn` | The Stand on Business button, centre of the HUD | "Stand on Business" / "Standing ✓" | idle, hover, pressed, disabled, `on`, `slam` (a one-shot press), `ftue-flash` (tutorial pulse) | on/off, disabled |
| `coin` | The Legacy readout under the Stand button | "4 →8 legacy" | idle; `raised` (a raise is pending); `flip` (one-shot coin flip) | stakes, proposed stakes |
| `lock-btn` | Lock In, the turn commit | "Lock In" / "Locked" | idle, hover, pressed, disabled, locked | disabled while planning is invalid |
| `danger` (Sit Down) | The retreat button, lower left | "Sit Down" | idle, hover, pressed, disabled | |
| `turn-panel` | The turn counter panel | "Turn 3 / 8" | idle; last turn | turn, max turns |
| `timer-bar` | The plan timer, a thin bar with a fill | none | fill 0–100%, warning breathe near zero | fraction |
| `location` | A Location panel (three across), gold frame over a 3:1 banner | Location name, era, Influence "A 5 · B 3" | idle; revealed/hidden; `lost-tag` (a stamp, the loser's); winner stamp at the Reckoning | name, era, two Influence numbers, ownership tint |
| `gate-slot` | A Character's slot at the Gates (small chamfer, 8 px) | Force number, name | `empty`, `filled`, `reserved`, `leaving`, `foreseen`; tinted A or B | occupant, Force |
| `event-slot` | The purple Event slot beside the Gates | Event name | empty, filled | occupant |
| `force-bar` | The Threat's Force bar | "Force 3" | fill; neutralized flash red; holds flash green | force, fill fraction |
| `chip` | The in-effect chips row (which powers are live) | short labels | idle | list |
| `replay-banner` | The corner banner during the replay | one sentence; kind kicker ("Clash", "Arrival") | idle; per kind colour; offers "See the result" / "Stay on the board" at the end | text, kind |
| `stamp` / `verdict` | The verdict stamp on a tile (BANISHED, HOLDS, SENT BACK…) | the verdict word | one-shot pop-in | word |
| toast | Status toast, lower left on wide screens, top on phones | one line | in, hold, out; error tint | text |
| `small` button | Secondary buttons everywhere (Log, Chat, Rules, deck picks) | short label | idle, hover, pressed, disabled, `primary` (selected), `ghost` (outline only) | |
| `chat-btn` | The quick-chat glyph button on the profile | 💬 | idle, hover, pressed | |
| bubble | The chat bubble beside a profile | an emote line | in, hold, out; left/right | text |

## Sheets (`Sheets.tsx`)

| Name | What it is | Words on it | States |
|---|---|---|---|
| `sheet` + `scrim` | Bottom sheet with a title bar and a close (×); the base for all below | title, body, "×" | in, open, out; phone full-width, desktop centred |
| `ConfirmSheet` | Confirm with an optional danger tint | title, body, confirm label, "Cancel" | idle; `danger` |
| `CardSheet` / `CharSheet` | The Codex card: the 3D card with its history | name, era, Force, Influence, ability, history, sources | reading; playable / not playable with a reason line |
| `ThreatSheet`, `LocationSheet`, `ProfileSheet`, `LogSheet`, `ChatSheet`, `TallySheet` | Content sheets on the base | as named | open |

## Start, Result, Cards and Rules screens

| Name | What it is | Words on it | States |
|---|---|---|---|
| `cta` (+ `cta-ico`) | The big landing buttons: Play, Learn to play, Cards, Rules | label + an icon | idle, hover, pressed, disabled ("Desktop only for now") |
| `link` | Text-only link buttons | "Developer tools" | idle, hover |
| deck picker (`small` `primary`) | Segmented choice of preset decks | deck names | selected / not |
| `verdict` + `fanfare` | The result plate | "You won" / "Harborlight won", Legacy earned | win, lose, draw |
| `score` / `stats` | The result tallies | numbers | idle |
| Cards screen grid | Card tiles with filters | filters, card names | idle, hover, selected, filtered-out |

## Not yet on screen, wanted (from the game's own brief)

Settings sheet (toggle, slider, segmented control, stepper), toast stack, confirm-with-cost dialog, an empty
state, wallet balance pill, shop catalogue tile (preview, price, equip toggle), earned-this-match ledger
rows, deck-builder tray and validity message, match-history row, profile plate, Compendium timeline strip
and sources footer.
