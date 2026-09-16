# Component inventory: the chrome on screen today

Every piece of UI Kit Maker-shaped chrome in the web game as of 2026-09-16 (main at "Tutorial: lessons point
at the exact thing"), named by its CSS class, which is the name the kit must export it under. States use the
kit's words: idle, hover, pressed, disabled, plus the game's own.

**Not in the kit, on purpose:** the cards (`card`, `CardFace`, the Codex card, the card back, the ten
ranked frames and four finishes in `public/art/frames`), the gate and inside tiles that show a card's
portrait (`gate-slot.filled`, `gate-slot.reserved`, `slot`), the Event slot, the Threat tile, the fanned
hand, the particles and flying clones, and the historical art. All of that is the game's own.

## Match screen (`MatchScreen`, `Hud`, `Battlefield`)

| Name | What it is | Words on it | States | Driven at runtime |
|---|---|---|---|---|
| `plate` | The profile plate beside each avatar; two exports, `plate-A` gold and `plate-B` blue, mirrored | handle; "5/7 in hand · 12 in deck · you" | idle; `first` (has initiative) | hand count, deck count, initiative |
| `legend-pill` | Small pill inside the plate | "★ 2" | idle; `spread` (at LEGEND_READY, glows) | legend count |
| `stand-btn` | The Stand on Business button, centre of the HUD | "Stand on Business" / "Standing ✓" | idle, hover, pressed, disabled, `on`, `slam` (a one-shot press), `ftue-flash` (tutorial pulse) | on/off, disabled |
| `coin` | The Legacy readout under the Stand button | "4 →8 legacy" as three live fields | idle; `raised` (a raise is pending); `flip` (one-shot coin flip) | stakes, proposed stakes |
| `lock-btn` | Lock In, the turn commit | "Lock In" / "Locked" | idle, hover, pressed, disabled, locked | disabled while the plan is invalid |
| `sit-down` (class `danger`) | The retreat button, lower left | "Sit Down" | idle, hover, pressed, disabled | |
| `turn-panel` | The turn counter panel | "Turn 3 / 8" | idle; last turn | turn, max turns |
| `timer-bar` | The plan timer, a thin bar with a fill | none | fill 0–100%, warning breathe near zero | fraction |
| `location` | A Location panel (three across): the gold frame, title bar, Influence meter, rule line, over a 3:1 banner that is the game's art | name, era, "A 5 · B 3", the rule of the place | idle; hidden; `lost-tag` (a stamp); winner stamp at the Reckoning | name, era, two Influence numbers, ownership |
| `chip` | The in-effect chips row (which powers are live) | short labels | idle; `warn`; `good` | list |
| `replay-banner` | The corner banner during the replay | one sentence; kind kicker ("Clash", "Arrival") | idle; per kind colour; offers "See the result" / "Stay on the board" at the end | text, kind |
| `stamp` / `verdict` | The verdict stamp on a tile (BANISHED, HOLDS, SENT BACK…) and on a Location | the verdict word | one-shot pop-in | word |
| toast | Status toast, lower left on wide screens | one line | in, hold, out; error tint | text |
| `small` button | Secondary buttons everywhere (Log, Chat, Rules, deck picks) | short label | idle, hover, pressed, disabled, `primary` (selected), `ghost` (outline only) | |
| `chat-btn` | The quick-chat glyph button on the profile | 💬 | idle, hover, pressed | |
| bubble | The chat bubble beside a profile | an emote line | in, hold, out; left/right | text |
| `settings-btn` + `settings-menu` + `settings-row` + `switch` | The gear (landing corner and under the Stand button) and its menu of switch rows | "Music", "Sound effects", a hint line each | closed, open; row idle, hover; switch on/off | on/off per row |

## Sheets (`Sheets.tsx`, `RefsModal.tsx`)

| Name | What it is | Words on it | States |
|---|---|---|---|
| `sheet` + `scrim` | Bottom sheet with a title bar and a close (×); the base for all below | title, body, "×" | in, open, out |
| `ConfirmSheet` | Confirm with an optional danger tint | title, body, confirm label, "Cancel" | idle; `danger` |
| `ThreatSheet`, `LocationSheet`, `ProfileSheet`, `LogSheet`, `ChatSheet`, `TallySheet` | Content sheets on the base | as named | open |
| `RefsModal` | The References list at the end of every history | a list of sources, "×" | open |
| Codex promote button | "Promote to Silver · 8 Legacy" on the Codex card (the card itself is the game's) | price and what you have | idle, hover, pressed, disabled (cannot afford), at Diamond |

## Start, Result, Cards, Rules and Compendium screens

| Name | What it is | Words on it | States |
|---|---|---|---|
| `cta` (+ `cta-ico`) | The big landing buttons: Play, Learn to play, Cards, Rules | label + an icon | idle, hover, pressed, disabled |
| `link` | Text-only link buttons | "Developer tools", "References" | idle, hover |
| deck picker (`small` `primary`) | Segmented choice of preset decks | deck names | selected / not |
| wallet | The Legacy balance in the landing corner | "12 Legacy" | idle; a bank pulse when it grows |
| `verdict` + `fanfare` | The result plate | "You won" / "Harborlight won", Legacy earned | win, lose, draw |
| `score` / `stats` | The result tallies | numbers | idle |
| `cx-frame` / `cx-oct`, `cx-chapter-head`, `cx-kicker`, `cx-plate-no`, `cx-chip`, `cx-medal`, `cx-ctl` | The Compendium's plates, chapter heads, chips, medals and the day/night control | as named | idle; chip `warn` / `good`; control selected |
| Cards screen filters | Filter buttons over the card grid (the tiles are the game's cards) | filter labels | idle, selected |

## Not yet on screen, wanted (from the game's own brief and `docs/economy.md`)

Settings beyond sound (motion, text size, colour-blind tints: switch, slider, segmented control, stepper),
toast stack, confirm-with-cost dialog, an empty state, catalogue tile for the finishes store (preview,
price, equip toggle), earned-this-match ledger rows, deck-builder tray and validity message,
match-history row, profile plate, Compendium timeline strip and sources footer.
