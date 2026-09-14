# The Legacy economy (design note, not built)

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
