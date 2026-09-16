# The Legacy economy

## Built: card frames, ranked and finished

Sixteen frames, one geometry, from the same hand: the ladder and the finishes.

**The ladder** (bought with Legacy): **Wood** → **Bronze** (3) → **Silver** (8) → **Gold** (12) → **Emerald** (16) →
**Ruby** (22) → **Diamond** (30). A card's printed cost sets where it starts: 0 and 1 at Wood, 2 at Bronze, 3 at
Silver, 4 at Gold, 5 at Emerald, 6 and up at Ruby. Nothing starts at Diamond, so every card has a rank still to earn, with one card outside the ladder altogether: **Black Jesus only comes in Wood** (`FIXED_RANK` in `legacy.ts`: never promoted, never wears a finish).
Diamond carries a glare that sweeps the frame every five seconds. **The frame never outranks the card:** the ladder
frame shown is exactly the rank held (bought, or the starting rank), never a step above it.

**The finishes** (cosmetic, for the store later): **Tiger's Eye**, **Turquoise**, **Amethyst**, **Onyx**, **Marble**,
**Ice**, **Camouflage**, **Lava**, **Stars and Stripes**. A finish is worn in place of the rank's frame; the rank is
still there underneath and still climbs, and a finish says nothing about rank (a player is assumed to have won it,
been granted it, or bought it). Until finishes are owned and equipped, every fourth Character of each preset deck (in deck order) wears the next
finish in the list, each deck starting two further along, so every deck shows a few and every finish is worn by two
or three cards; cards outside the decks fall to a stable hash, about one in five. Stars and Stripes is restricted to American political figures (`USA_POLITICAL` in `legacy.ts`: Lincoln, Stevens, Sumner, Smalls, Turner, Taney, Douglass); a card that would have drawn it takes the next finish instead, and at least two eligible cards wear it. Camouflage is reserved the same way for the military, militant and war-involved: any card tagged Military, Soldier, Rebellion, Revolution, Defense, Spy or Maroon, plus John Brown, Harriet Tubman, Robert Smalls, Henry McNeal Turner, Lewis Hayden, Ogun, Shango, Mary Seacole and Lincoln (`MILITARY_TAGS` / `MILITARY_IDS`).

Every frame is the same 1047×1411 export fitted into the card's 1103×1426 box, so one set of positions serves all
sixteen. **Events are exempt** for now: they keep their own frame, take no rank, and show no rank row in the Codex.
The Compendium opens with Chapter I, "Reading a card": the three orbs, the ladder and the finishes.

- **Earning.** A match won pays its Legacy to the winner (1 for a plain win, 4 to 16 behind an early Stand). The
  tutorial pays nothing. Losing takes nothing.
- **Spending.** Open a card (the Codex, from the landing row or the Cards screen) and promote it; the button says
  the price and what you have. The landing corner shows the wallet.
- **Where it lives.** `src/ui/legacy.ts`: the ledger (`banked`, `spent`, `ranks` by card id, a short log) in
  localStorage under `bhcb.legacy.v1`, with `bank`, `promote`, `rankOf`, `finishOf`, `frameOf` and a `useLedger`
  hook. `CardFace` reads the frame for the image and the accents; `CodexSheet` shows the rank (and the finish) and
  the button; `MatchScreen` banks a win.
- **Dev.** `?dev=1&legacy=20` grants 20 Legacy once per page load, to review ranks without playing.
- **Unity.** The ledger is a save-file shape (an int, an int, a dictionary of card id to rank, a list of entries);
  the frames are sixteen sprites sharing one layout; the rank badge and the promote button are the same two controls on
  the card view. The rule that a rank changes nothing in the engine holds there too: the engine never reads the
  ledger.

## The rest (design note, not built)

Legacy is what a match is worth, and the plan is for it to become the currency of everything around the match: the
Legacy you win buys the things that make your side of the board yours. Nothing here is coded. This note is the brief
for when it is, so the engine, the profile and the Unity port grow toward it instead of around it.

## Principles

- **Legacy is earned, only.** It comes from play (matches won at their Legacy, Legend built by clearing Threats,
  first clears, streaks). No purchase creates Legacy; a store, if there is ever one, sells cosmetics for money and
  never Legacy.
- **Nothing you buy changes a result.** Everything in the economy is cosmetic or ceremonial: how a card looks, what a
  Location sounds like, how your Stand explodes. Force, Influence, Energy and the deck rules are the same for everyone.
- **History first.** Every cosmetic is a way into the record. A card variant is a different photograph or painting of
  the same person, with its own caption and source. A Location theme is another year of the same place. A sound pack
  is another room the sound was recorded in. Unlocking a thing should teach a thing.
- **Spend is a choice, never a chore.** No daily timers, no energy for playing, no loot boxes. Prices are visible and
  fixed, and everything can be previewed on the board before it is bought.
- **The wallet is server truth.** Legacy balances and entitlements live with the account (see "Not built"), the
  client only shows them. Offline play still pays out, reconciled on reconnect, capped per day to keep it honest.

## Sources

| Source | Legacy | Notes |
|---|---|---|
| Winning a match | the match's Legacy (1 to 16) | the Stand multiplier is the main lever: the earlier the Stand, the more a win pays and a loss costs |
| Losing a match | 0 | nothing is taken from the wallet; the Legacy at stake was never yours. Sitting Down early keeps the other side's payout small |
| A Threat cleared | +1 per Legend earned | the same counter that makes arrivals Ready at `LEGEND_READY` |
| First time a Location is won | +2 once per Location | sixteen Locations, so a modest tour bonus |
| Daily first win | +2 | the only calendar hook, and a soft one |
| Tutorial and Compendium reads | +1 each for the first read of every card's history | learning is paid, once |

## Sinks (consumables and cosmetics)

| Kind | Examples | Price band | Where it shows |
|---|---|---|---|
| **Card variants** | a second portrait of Harriet Tubman (the 1868 Benjamin Powelson carte de visite), a woodcut Toussaint, a Duncanson self-portrait | 8–20 | the hand, the Codex, the Compendium; the opponent sees your variant |
| **Card backs and plates** | a Black Star line ticket, a Pullman porter's badge, a Greenwood storefront sign | 6–15 | the deck plate in the HUD, hidden Location backs |
| **Location themes** | Harpers Ferry in winter, The Stroll by day in 1925, the Tabernacle at Easter | 10–25 | the Location panel art and, where recorded, its own place sound |
| **Special animations** | a Stand burst in your deck's colours, fireworks in the Pan-African tricolour only, a Word-spreads wave that rings church bells, an entrance flourish per Home | 12–30 | the effects library systems (`README` "Effects library"): each cosmetic is a palette, a sprite set or a sound layer on an existing system, never a new mechanic |
| **Sound packs** | a second recording of each place, a brass-band Stand, a gospel Reckoning | 10–20 | `SFX_PLACES` and the cue layers, swapped per profile |
| **Emotes and voice lines** | period-correct lines read by voice actors, "I have people in Detroit" | 3–8 | the chat bubbles |
| **Titles and frames** | "Conductor", "Griot", "Stood on Turn 1 and won" | 5–10 | the profile plate and the result screen |

Ceremonial consumables (spent per use, cheap, purely for show): a one-match Stand burst upgrade, a fireworks encore
after a win, a "word spreads" that also pays a friend a message. These are the only consumables; everything else is
owned once.

## How it plugs in

- **Profile.** The profile gains `legacy: number` (wallet), `owned: string[]` (entitlement ids) and `equipped:
  Record<Slot, string>` (`cardVariant:<cardId>`, `cardBack`, `locationTheme:<locId>`, `fx:stand`, `fx:fireworks`,
  `fx:wave`, `sfxPack`, `title`, `frame`). Matches carry both players' `equipped` in the setup so the opponent sees
  your variants; the engine never reads it.
- **Catalogue.** One data file, `src/economy/catalog.ts`: `{ id, kind, name, price, unlock?, preview, history: { caption,
  source } }`. Unity mirrors it as ScriptableObjects generated from the same file.
- **Payout.** `recordMatch` (analytics) already sees the result and its Legacy; the wallet write happens next to it.
- **Rendering.** Variants are alternate `Art` ids (`<cardId>__<variant>`), themes alternate Location art and place
  clips, animation cosmetics are parameters on the existing systems (`TRAIL_COLORS`, the fireworks palette, the wave's
  sprite and cue), so no cosmetic adds a code path in the replay.
- **Unity.** Wallet and entitlements behind one `IEconomy` interface with a local fake for offline play; cosmetics
  resolve to prefabs, sprites and AudioClips through the catalogue ids.

## Open questions

- Whether Legend (the per-match counter) should also accrue to a lifetime "Legend" that gates the rarest variants,
  or stay a match mechanic only.
- Whether a lost match should ever pay a small consolation (probably not: Sitting Down early is the consolation).
- Trading or gifting (probably not in the first version: it makes the wallet a target).
- Which historical images are clear for use as variants (the same public-domain line the cards follow: nothing of a
  living person, sources cited on the card).
