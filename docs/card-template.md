# The universal card template

The frame the designer supplied (`docs/card-template/card-template.png`, 1103 × 1426) is the one card face for every
kind of card, in the game since build 174 (`src/ui/components/CardFace.tsx`, the `.card.tpl` rules in `theme.css`, the
frame exported as WebP at 1103 and 552 px in `public/art/frames`): Characters, Mythics, Artists, Informants, Events and Curses. This note records how it is
cut up, what goes where, and how it would be built, so the eventual `CardFace` v2 (and the Unity prefab) follow the
same measurements. `docs/card-template/mock.html` is the working sketch: open it in a browser (it reads the art from
`public/art`) and it lays out three cards on the frame, one at a time, with the rules scrolling; `mock-*.png` are
its renders. Every measurement is in `cqw` (percent of the card's width), so the one layout holds at any size.

## The layers, bottom to top

1. **Art.** The portrait, cover-fitted to the window (face at about 18% from the top).
2. **Frame.** `card-frame.png`: the designer's PNG with the window knocked out (supplied that way), so the portrait
   shows through it and the cost medallion and ribbon, painted across the window's corner, sit over the art as part
   of the frame. (`card-template.png` is the first export with the blue still in.) `card-back.png` (1086 × 1448) is
   the card back: a gold Africa under a compass star, broken chains, laurels, an open book and the red, green and
   gold ribbon.
3. **Marks and text.** Numbers in the medallions, the kind icon in the ribbon, the name, the tag pill, the era, the
   rules (which scroll when they run long, like the current big card), the quote. The motto pennant at the top right
   is a reward players win, so it is hidden for now; its slot stays reserved.

## Slot geometry (px on the 1103 × 1426 template; percentages for CSS or Unity anchors)

| Slot | Box or centre (px) | As % of width × height | Content |
|---|---|---|---|
| Art window | x 140–958, y 82–648 | left 12.7%, top 5.8%, width 74.2%, height 39.7% | the portrait, cover, top-weighted |
| Cost medallion (green) | centre (182, 130), r ≈ 64 | 16.5%, 9.1% | cost, Cinzel 800, ~92px |
| Kind pennant (navy ribbon under the cost) | centre (182, 252) | 16.5%, 17.7% | a 60px icon: book = historical, bolt = mythic, palette = artist, mask = informant, star = event |
| Motto pennant (added, not in the PNG) | x 853–1003, y 18–368 | right 9%, top 1.3%, 13.6% × 24.5% | an emblem and a three-to-five-word motto, Cinzel 700, 20px, tracked |
| Name banner (navy) | x 150–950, y 676–753 | 13.6%, 47.4%, 72.5% × 5.4% | the name, Cinzel 800, 66px; 54px over 15 characters, 44px over 22 |
| Tag pill | centred, y 742 (overlapping the banner's bottom edge) | 50%, 52% | one word: the most specific tag, or Mythic / Artist / Informant / Event / Curse |
| Era line | y 812, centred | 57% | dates or place, Cinzel 700, 30px, ink |
| Rules box (parchment) | x 160–953, y 858–1154 | 14.5%, 60.2%, 71.9% × 20.8% | Crimson Pro 500, 46px, line 1.22, scrolling when it overflows (like the big card today); keyword labels in Cinzel 800 navy; a diamond rule between abilities; the blurb in italics under a dotted rule |
| Quote strip (navy, bottom) | x 270–833, y 1240–1296 | 24.5%, 87%, 51% × 3.9% | a short quotation, Crimson Pro italic, 28px, parchment |
| Influence medallion (gold) | centre (152, 1252), r ≈ 72 | 13.8%, 87.8% | Influence, Cinzel 800, 100px |
| Force medallion (red) | centre (945, 1252), r ≈ 72 | 85.7%, 87.8% | Force, Cinzel 800, 100px |

The three medallion colours already match the game's code (green cost, gold Influence, red Force), so nothing on the
board has to be relearned.

## Per-kind variants

- **Character** (historical): as above. The tag pill is royal blue.
- **Mythic**: the tag pill goes red (Shango's colours); the kind icon is the bolt. Otherwise identical: the point of
  one template is that Shango and David Ruggles sit in the same frame.
- **Artist**: palette icon, green pill (the artist's trail colour on the board).
- **Informant**: mask icon, a slate pill; the name banner could take a faint hatched texture so an Informant reads
  as one at arm's length.
- **Event**: the purple frame (`docs/card-template/card-frame-event.png`, 1086 × 1448, fitted into the 1103 × 1426
  box centred with 17px side margins), a purple cost medallion, laurels instead of the bottom medallions, star icon,
  one rules block led by "PLAY:". Every other slot sits where the Character frame's does, so the one layout serves
  both frames.
- **Curse**: the Event layout with the parchment tinted violet and the pill dark; the frame stays gold.

## Data the template wants that the cards do not have yet

- `motto` (three to five words for the pennant: "Truth organizes freedom").
- `quote` (a short quotation for the bottom strip, sourced like the history text; the sketch borrows a clause from
  the blurb where none exists, which is a placeholder, not copy).
- A `kindIcon` is derived from category and keywords, no new field.
All copy rules apply: real words from or about the person, no editorializing, sources in the history text.

## How it would be built

- **Web**: `CardFace` v2 is one `<div>` with `aspect-ratio: 1103 / 1426`, the frame as an `<img>` filling it, and
  every slot positioned in percentages from the table, so the same component renders at hand size (`--card-w`,
  ~130px wide) and at Codex size (~600px). At hand size the rules text is unreadable at any font, so the small card
  shows the art, the name banner, the pill and the three numbers, and hides the rules, era, quote and pennant; the
  Codex shows everything. Numbers use `font-size` in `cqw` units (container query width) so they scale with the card.
- **Assets**: the supplied `card-template.png` at 1103 × 1426 (1.7 MB as PNG; ship it as WebP with alpha, ~250 KB,
  plus a 400px version for the hand).
- **Unity**: a prefab with the same four layers: a full-bleed `SpriteRenderer` (portrait, blurred by a material),
  the portrait in a `SpriteMask` for the window, the frame sprite, and TextMeshPro fields anchored at the table's
  percentages in a 1103 × 1426 rect. The percentages are the contract between the two builds.

## What is not decided

- Whether the motto pennant is part of the frame PNG (one export with it drawn) or stays a drawn element.
- The card back is supplied (`card-back.png`); whether the hidden Location backs use it too.
