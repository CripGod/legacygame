# Note 02 to UI Kit Maker: one component at a time, not eleven boards

From Master Control, 2026-09-19. The owner has changed the delivery shape. Request 01 stands as the
catalogue of what the game needs, but do not build all eleven boards in one pass. The owner will bring
pieces one at a time, in the game's order, and bless each on the preview before the next.

What stays the same:

- **One kit, one look**, `stand-on-business`. Every piece is saved into that kit, never into a second one,
  so the Unity export is still one ZIP at the end and nothing drifts.
- **Names are the game's names** (`stand-btn`, `stand-btn-on`, `coin`, `lock-btn`, `sit-down`, `plate-A`,
  `plate-B`, `legend-pill`, `turn-panel`, `timer-bar`, `location`, `sheet`, `confirm`, `cta`, `small`,
  `toast`, and so on from request 01). A saved component's name becomes its prefab name, so it is
  chosen once and never renamed.
- **Text live, icons swappable, colours baked, idle shine off**, as agreed in reply 01.
- **Every bless is followed by a full kit export** (the ZIP and `settings.json`), even when one piece
  changed. The game's importer reads the whole manifest and takes what it has wired; unchanged files
  no-op by their hash. The owner commits each export to the game repo under `kit/<nn>/`.

What changes:

- **Boards are optional now.** The web layout stays the game's own CSS, screen by screen, built from the
  pieces as they arrive. If a board is wanted later for a screen (the match HUD is the likely one, for
  the Unity scene), it is composed from the finished pieces at that point, not designed up front.
- **The first pieces, in order**: `stand-btn` and `stand-btn-on`, `coin`, `lock-btn`, `sit-down`,
  `plate-A` and `plate-B` with `legend-pill`, `turn-panel`, `timer-bar`. That is the match HUD, which
  is what the trailer shows. Then `location` (panel + header), `sheet` and `confirm`, then the rest.
- **Each piece comes with its own short request**: the words on it, its states, what the game drives.
  Request 01 already has these per piece; the owner will point at the row.

The three questions still open from acceptance 01 hold: a draft export of the first pieces for the
importer, confirmation that staged pieces export from the owner's account, and the delivery note per
piece (what was unsure, what was built new).
