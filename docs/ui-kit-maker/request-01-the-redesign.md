# Request 01 to UI Kit Maker: redesign the game's UI, one board per screen

From Master Control, the coordinating session for Stand on Business: The Black History Card Battler.
The owner relays. This is a **redesign**: the game's current chrome (its fonts, colours and chamfered
frames) is not a target to match. You and the owner own the new look. This document tells you what to
build, what each piece must do, and the few things that are fixed. Reply with the questions in section 8
answered before building; a question beats a guess.

## 1. What is fixed, and what is yours

**Fixed (the game keeps these, do not redraw them):**

- **The cards.** Every card face, the ten ranked frames (Wood, Bronze, Silver, Emerald, Ruby, Diamond)
  and four finishes (Tiger's Eye, Turquoise, Amethyst, Onyx), the Event frame, the card back, and the
  Codex card that opens when a card is tapped. Screenshots come with this request. Everything you
  design sits next to these cards on the same screen, so their finish, weight and palette (gold frames,
  navy field, parchment panel, the green, gold and red medallions) are your anchor. Leave a hole the
  size of a card wherever the brief says "card".
- **The historical art**: portraits, Location banners, Threat and Event pictures. Leave a window.
- **The particles and flying pieces**: clash strikes, power trails, fireworks, the healing wave. The game
  draws them.
- **The words.** Copy on buttons and labels is given below and must stay as written; the game's copy is
  edited in one place, not in art.

**Yours (new, not inherited):** the look, the silhouettes, the fonts, the palette of the chrome, the
states, the layout of every screen on its board. Nothing from the current web build needs preserving
except the words and the behaviour.

## 2. The target

- Unity 6 LTS (6000.x), uGUI, TextMeshPro. Landscape only: every board is the 1920×1080 stage.
- Input: mouse and keyboard; touch on landscape tablets; 44 px minimum hit areas at 1x.
- Fonts: any family on your Google Fonts list, or one you add. They must be SIL Open Font License so
  they can ship inside the Unity build. Note the cards print their own text in Cinzel and Crimson Pro;
  if the new chrome face clashes with them, say so, and the game can change the card text faces to
  match (that text is live, so it is a cheap change on the game's side).
- States: your four (default, hover, pressed, disabled) on every interactive piece, plus the game's own
  states listed per piece, built however your engine prefers (a toggle, a saved variant).
- Colours baked into the pixels; a piece that comes in a player colour is exported twice (`-A`, `-B`).
- Idle motion off: no wipe shine, no edge shine. Nothing in the game loops except a slow breathe on a
  warning state, and the game draws that.
- Exports the game consumes: the engine kit (2x PNGs and `kit-manifest.json`), the Unity ZIP, and
  `settings.json` with the boards in it. The game reads the boards' item positions from `settings.json`
  to lay out the web version, so **the board is the layout spec**: place things where they should be.

## 3. The game in one paragraph, for the boards to make sense

Two players, three Locations across the middle of the board, eight turns. Each turn both players plan in
secret (cards from the hand go to a Location's Gates, Characters at the Gates walk Inside, some
confront Threats), then both Lock In and the turn plays out as a replay. Influence per Location decides
who wins it; Legacy is the stake, and the Stand on Business button multiplies it (an early Stand pays
and costs more). Sit Down retreats. The human is player A (gold), the AI, Harborlight, is player B
(blue). Legacy won buys card ranks and, later, finishes.

## 4. The boards

One board per screen, named exactly as below. Every board carries real words, every piece in its
default state, and a hole or a placeholder block for each thing the game draws itself.

### Board 1: `landing`

The first screen. Wordmark (the game's own, a script logo; leave a slot), a row of four big buttons,
a deck picker, the wallet, a settings gear, a row of the player's deck as cards (hole), and a teaser
scene the game animates (a large hole in the lower third).

| Piece | Words | States |
|---|---|---|
| `cta` ×4 | "Play", "Learn to play", "Cards", "Rules"; each with an icon slot | default, hover, pressed, disabled |
| `deck-picker` (segmented) | preset deck names, 3 to 5 entries | selected / not |
| `wallet` | "12 Legacy" | default; a pulse when it grows |
| `settings-btn` (gear) + `settings-menu` | rows "Music", "Sound effects", each with a hint line and a switch | menu closed / open; switch on / off |
| `link` | "Developer tools" | default, hover |

### Board 2: `match`

The main board. Top: the HUD. Middle: three Location panels side by side. Bottom: the fanned hand
(hole across the full width, about a fifth of the height) with Sit Down at the left and Lock In at the
right. Lower-left corner above Sit Down: the toast and replay banner stack.

| Piece | Words | States |
|---|---|---|
| `plate-A`, `plate-B` (profile plates, top left and top right, mirrored) with `avatar` (round portrait hole) | handle "You" / "Harborlight"; "5/7 in hand · 12 in deck" | default; `first` (a mark that this player resolves first this turn) |
| `legend-pill` inside each plate | "★ 2" | default; `spread` (lit) |
| `stand-btn` (top centre, the biggest button on the screen) | "Stand on Business" / "Standing ✓" | default, hover, pressed, disabled, `on` (latched) |
| `coin` (Legacy readout under the Stand button) | "4", "→8", "legacy" as three live fields | default; `raised` |
| `turn-panel` | "Turn 3 / 8" | default; last turn |
| `timer-bar` (thin, under the HUD) | none | fill 0–100%; warning near empty |
| `location` ×3 (each: a frame, a title bar with name and era, an Influence line, a 3:1 banner window, two rows of small tile holes for the Gates and Inside, a Threat tile hole, a one-line rule) | e.g. "Greenwood District · Tulsa, 1921"; "A 5 · B 3"; the rule line | default; hidden (face down, before reveal); won by A; won by B |
| `chip` row under each Location | "Curfew at night", "Threats never appear here" | default; `warn`; `good` |
| `lock-btn` (bottom right) | "Lock In" / "Locked" | default, hover, pressed, disabled, locked |
| `sit-down` (bottom left) | "Sit Down" | default, hover, pressed, disabled |
| `toast` | one line, e.g. "Not enough Energy for that card." | default; error |
| `replay-banner` | a kicker and one sentence, e.g. "CLASH · Harriet Tubman banishes the Paddy Roller to Harpers Ferry" | default; one colour per kind (clash, arrival, showdown, stand, reckoning); at the end it carries two buttons, "See the result" and "Stay on the board" |
| `chat-btn` on the player's plate + `bubble` | 💬; an emote line "I have people in Detroit" | default; bubble left / right |
| `stamp` (a verdict word stamped on a tile or a Location) | "BANISHED", "HOLDS", "SENT BACK", "WON" | one-shot pop-in |

### Board 3: `sheets`

The bottom sheets that open over the match, each on the board once, side by side or stacked.

| Piece | Words | States |
|---|---|---|
| `sheet` (the base: title bar, close ×, a scrim behind) | title | open |
| `confirm` | "Sit Down?", a body line, "Sit Down" (danger), "Cancel"; a cost line variant "Costs 12 Legacy" | default; `danger` |
| `threat-sheet` | Threat name, Force "3", a picture window, a rules paragraph | open |
| `location-sheet` | name, era, the rule of the place, a banner window, chips | open |
| `profile-sheet` | handle, avatar window, "Legend 2", deck count, a strip of small card holes (a peeked hand) | open |
| `log-sheet` | "Turn 3" heading, a scrolling list of one-line entries | open |
| `chat-sheet` | a grid of emote buttons, a "Summon" row with one button per Location, the chat history | open |

### Board 4: `result`

The end of a match. A verdict plate, three Location results, the Legacy line, the ledger (new), three
buttons.

| Piece | Words | States |
|---|---|---|
| `verdict` | "You won" / "Harborlight won" / "A draw"; under it "Legacy 8" | win, lose, draw |
| `location-result` ×3 | Location name, "A 5 · B 3", a winner mark | won by A, won by B, tied |
| `ledger` rows | "+8 Legacy · match won", "+1 · Threat cleared", "Balance 20" | default |
| `cta` ×3 | "Play again", "Rematch", "Menu" | default, hover, pressed |

### Board 5: `compendium`

The Cards screen: a chaptered catalogue of every card and Location. Chapter heads, filter row, a grid
of card holes, Location plates with a banner window, a rank ladder plate, and a References modal.

| Piece | Words | States |
|---|---|---|
| `chapter-head` with a kicker | "Plate III", "Locations" | default |
| `filter` (segmented) | "All", "Historical", "Mythic", "Artists", "Events" | selected / not |
| `plate` (a content plate with a title rule) | a title, a paragraph | default |
| `rank-ladder` | "Wood → Bronze 3 → Silver 8 → Emerald 14 → Ruby 20 → Diamond 30" as six steps | current step lit |
| `promote-btn` | "Promote to Silver · 8 Legacy" | default, hover, pressed, disabled ("You have 3") |
| `daynight` (a two-way control) | "Day", "Night" | selected / not |
| `refs-modal` | "References", a list of sources, × | open |
| `link` | "References" | default, hover |

### Board 6: `rules`

A long-read screen: a title, section heads, text plates, a back button. Two or three plates are enough to
set the pattern.

### Board 7: `settings`

The full settings sheet the game will grow into (today it has two switches).

| Piece | Words | States |
|---|---|---|
| `setrow` + `switch` ×3 | "Music", "Sound effects", "Reduce motion" | on / off |
| `setrow` + `slider` ×2 | "Music volume", "Effects volume" | 0–100 |
| `setrow` + `segmented` | "Text size": "Small", "Normal", "Large" | selected |
| `setrow` + `segmented` | "Colour-blind tints": "Off", "Deutan", "Protan", "Tritan" | selected |
| `cta` | "Done" | default, hover, pressed |

### Board 8: `tutorial`

The chrome the first-match guide uses over the match board: a coach bubble with a Next button, a
spotlight ring that sits around a piece, a lesson plate with a picture window.

| Piece | Words | States |
|---|---|---|
| `coach` (a speech plate with a tail) | two lines of guidance; "Next" | default |
| `spotlight` (a ring or frame that highlights one piece) | none | default; pulse |
| `lesson-plate` | a title, a picture window, a caption | default |

### Board 9: `deck-builder` (new screen)

Filters by era and archetype, a grid of card holes, a 24-slot tray along the bottom, a validity line.

| Piece | Words | States |
|---|---|---|
| `filter` (segmented) ×2 | eras; archetypes | selected / not |
| `tray-slot` ×24 | a number 1–24 | empty, filled (card hole), invalid |
| `validity` line | "24 of 24 · at most two Events · ready" / "Too many Events" | ok, error |
| `cta` ×2 | "Save deck", "Reset" | default, hover, pressed, disabled |
| `stepper` | a count with − and + | default, at min, at max |

### Board 10: `store` (new screen)

The finishes store and wallet. A balance pill, a grid of catalogue tiles (each: a card hole for the
preview, a name, a price, an equip toggle), an empty state, a confirm-with-cost.

| Piece | Words | States |
|---|---|---|
| `wallet` | "20 Legacy" | default |
| `catalogue-tile` | "Tiger's Eye", "12 Legacy", "Equip" | default, owned, equipped, cannot afford |
| `empty-state` | "Nothing here yet. Win a match to earn Legacy." | default |
| `confirm` with cost | "Buy Tiger's Eye?", "Costs 12 Legacy. You have 20.", "Buy", "Cancel" | default |

### Board 11: `history` (new screen)

Match history and profile: a profile plate (handle, avatar window, title, lifetime Legacy), a list of
match rows (opponent, result, Legacy, date), an empty state.

| Piece | Words | States |
|---|---|---|
| `profile-plate` | "Conductor" (a title), "Legacy 140", "12 wins · 5 losses" | default |
| `history-row` | "vs Harborlight · Won · +8 · 14 Sep" | won, lost, draw |
| `empty-state` | "No matches yet." | default |

## 5. Driven at runtime (live hooks in the prefabs)

Numbers and text the game sets: hand count, deck count, legend count, stakes (the coin's number and
its arrow target), turn and max turns, timer fraction, each Location's name, era, two Influence numbers
and rule line, each chip's text, the Stand button's latched and disabled flags, Lock In's disabled flag,
every switch and slider, the wallet, every ledger row, every history row, every catalogue tile's price
and owned/equipped flags, the coach's text. All live TextMeshPro or exposed fills, never baked.

## 6. Placeholders for what the game draws

Wherever the brief says "hole" or "window", ship a blank, transparent rect of the right proportion
named for its content (`card-hole`, `portrait-window`, `banner-window`, `tile-hole`, `hand-hole`) so the
scene and the web layout know where the game's own things go. Proportions: a card is 1103:1426; a
portrait window is square; a Location banner is 3:1; a Gate tile is roughly 5:3 landscape.

## 7. What done looks like

1. Every board above on one preview link, with real words, so the owner can tweak in the app.
2. After the owner's blessing: the engine kit, the Unity ZIP, and `settings.json` with the boards.
3. A one-line note per board on anything you were unsure about, and a list of any piece you built
   from scratch (a new component or silhouette) so the game knows it is staged until released.

## 8. Questions before you build

I read your exporter on `main` (2026-09-16): the manifest's per-part insets and shell boxes, the 1920×1080
board, four states, boards riding in `settings.json` with item positions. Correct me if stale. Open:

1. **Eleven boards in one kit.** Is that within what one kit, one export and one Unity ZIP handles
   comfortably, or should the screens split across two kits sharing one look?
2. **A latching button.** `stand-btn` stays lit after a press until pressed again. With four states,
   is that a `toggle` dressed as a button, or two saved variants with the same silhouette?
3. **Two colourways.** For `plate-A` / `plate-B` and the avatar frame: two saved components with
   different fills, or something better? Baked colours, no runtime tint.
4. **Panels with title bars.** A Location panel and a sheet both need a title bar that stretches with
   the body. Is that `panel` + `header` stacked, or does `dialog` carry it as one nine-slice?
5. **Fonts.** If the owner's chosen faces are not on your list, what does adding one take? (Read from
   the code: a `GAME_FONTS` entry plus baked static-instance metrics.)
6. **Board positions.** Confirm the web can rely on `settings.json`'s board items (`x`, `y`, `scale`,
   `rot`, `stretch`) as the layout spec, in 1920×1080 stage pixels.
7. **Scenes are yours after first import.** Since the importer never rewrites a generated scene, we
   plan to finish and bless every board before the first Unity import. Any reason not to?
