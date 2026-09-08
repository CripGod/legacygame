# Black History Card Battler — Systems Prototype (v0.2)

A fast, replayable 1v1 card battler about Influence on history. Human vs Harborlight (AI), responsive web, no backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (add ?dev=1 for developer tools)
npm test           # engine + AI tests (vitest)
npm run sim -- 200 # headless Harborlight-vs-Harborlight balance run
npm run build      # production build to dist/
```

## Layout of the code

```
src/engine/      Pure TypeScript game engine. No React. Deterministic, seeded.
  types.ts         GameState, cards, plans, events
  content/         Data-driven Characters, Locations, Threats, Events, preset decks
  setup.ts         createMatch(seed), turn start, threat spawning
  query.ts         Influence, Force, capacity, legal-action API, plan validation
  resolve.ts       resolveTurn(state, {A, B}) → next state + ordered events; pending Stand on Business raises land here
  view.ts          viewFor(state, player): the redacted view every player (human UI and AI) receives
src/ai/          Harborlight. Plans from the redacted view only; simulates candidates with the real engine.
src/ui/          React presentation. Renders views, collects a TurnPlan, animates the event feed.
src/analytics/   Local playtest metrics (localStorage JSON, export from the dev panel)
tests/           Engine, redaction, abilities, threats, stakes, AI smoke tests
scripts/         sim.ts (batch balance), trace.ts (one match, full log)
```

The engine never imports React. The UI never touches the true `GameState` except in the controller that owns it; every screen renders `viewFor(state, player)`. Harborlight consumes exactly that same view. PvP later means replacing the AI plan provider with a remote player's submitted `TurnPlan`.

## Playing

- **Plan**: drag a card onto a Location, drag a Ready Character from your Gates into the Location, drag an Established Character to another Location, drag any Character onto a Threat. Tapping opens the same actions in a sheet. Then **Lock It In**. Two minutes per turn; timeout locks whatever you had.
- **Tutorial**: the start screen's *Tutorial* button plays seed 7 with Railroad vs Black Star, stops the clock, and walks the first five turns one lesson at a time: reading lessons modal the board out behind a card, doing lessons spotlight the exact card, tile, Threat or button and wait for it (Energy, Gates, entering, Threats, Stand on Business). After Turn 5 the regular coach takes over; the clock stays stopped for the rest of the match. Script: `src/ui/tutorial.ts`.
- **Watch**: after both players lock in, the turn plays out one beat at a time (Hearthstone/Snap style): each play, Event, Reveal, entry, move, clash and Showdown gets its own banner and spotlight, and the Location tally lands last. Events sit face-up in the Event slot they were played into (the opponent's face-down) until their beat, then flip and flare. Skip ▸▸ jumps to the settled board. `resolveTurn(state, plans, { trace: true })` returns the same beats as `TraceStep`s.
- **Win**: lead Influence at two of the three Locations after Turn 7.
- **Legacy** is what the match is worth. Stand on Business once per player to double it (1 → 2 → 4). It also adds an 8th turn, and whoever stood can no longer Sit Down. The raise lands one turn later, Marvel Snap style: the other side gets a full turn to Sit Down at the old price, keep playing, or Stand back.

Developer tools (`?dev=1` or the button on the start screen): fixed seeds, AI reasoning log (every candidate plan, score, chosen plan and tier), analytics summary/export, full event log, the true state, generic placeholder names (Test A), and a local two-player pass-the-device mode (Phase 2).

## Decisions made where the brief left room

- **Energy**: every card has a cost (0 to 7). Each turn a player gets Energy equal to the turn number, plus +1 per Established Organizer or Denmark Vesey, plus +1 the turn after holding two Inside at Oak Bluffs; unspent Energy is lost. Cheap cards early, the big names later. Gate capacity (two per Location) is the other limit on how much you can drop at once.
- **Discounts**: costs are computed live (`cardCost(id, state, player)`), so a card can get cheaper while it sits in your hand. Established discounters (Booker T. Washington: all Characters −1; Cécile Fatiman: Rebellion −1; Omar ibn Said: Events −1), earned per-card discounts stored on the player (`discounts`, from Fatiman's Reveal, Carver's end-of-turn Rotation, Diallo's Letter home and Nehanda's return), and Boukman Dutty's own passive (−1 per Rebellion Character on your board) all stack, never below 0. Boukman's printed 7 is the payoff at the end of that flow: his Uprising sends every Gate Character you have Inside at once, Ready or Fresh; only blocks and full Insides stop one.

- **Seven turns** (eight after Stand on Business) with 18-card decks: four in the opening hand and one draw every turn. Hands hold at most 7 cards; a draw into a full hand is discarded (logged in the turn log).

- **Every card is somebody, or something, that existed, with two deliberate exceptions.** The invented people are gone: the Newsboy is John Russwurm (Freedom's Journal, 1827), the Barber is Alonzo Herndon, the Block Captain is Callie House, the Neighbor Kid is Bud Billiken (the Chicago Defender's 1923 mascot), Karen is Roger Taney, the Pullman Porter is the Sleeping Car Porters (the 1925 Brotherhood) and the Cookout is the Bud Billiken Parade (1929). Brand characters and institutions count as long as they are real history. The Organizer and the OG stay by request as archetypes (no single person is meant). Chairteenth stays too: it is the Montgomery riverfront brawl of 5 August 2023, real but recent and with living participants, so nobody is named on the card. The public-domain line is otherwise people dead before about 1930; Henry Ossawa Tanner (d. 1937) and George Washington Carver (d. 1943) are the flagged exceptions. Threats and Events are conditions, not people, and keep their names.
- **Variety pass.** Duplicated powers were split up: Zora digs (top two cards, keep the dearer), Madam C.J. Walker banks +2 Energy for next turn, Daniel Payne's next Character costs 1 less, Victor Hugo Green grants an extra Relocation next turn, Denmark Vesey draws a card per other friend at his Location (max 2), Richard Allen draws whenever one of yours goes Inside at Mother Bethel, Callie House draws 2 when a Threat at her Location is cleared, and Oshun grows your weakest Character at her Location by +1 every turn. Pure "draw a card" now belongs to John Russwurm alone.
- **Artists.** A new category: Edmonia Lewis, Henry Ossawa Tanner, Robert Duncanson, Edward Bannister, Harriet Powers and David Drake (Dave the Potter). Their work outlasts them: an artist's Reveal (or Tanner's standing ability, every turn) adds *lasting Influence to the Location itself* for that player, which stays when the artist leaves or is knocked away. Lewis +2, Drake +1, Bannister +1 (+2 if you are behind there when he lands), Powers +1 per other friendly Character there (max 3), Duncanson +1 at every Location where you are Established.
- **The Middle Passage and the DeWolf Trade.** A Location with no Inside: every Character at its Gates loses 1 Influence for good each turn, Threats never appear there, and whoever leaves arrives Ready. The DeWolf Trade is a Threat (5 Force) that ships the lowest Fresh Gate Character at its Location to The Middle Passage when it is in play, otherwise to a random Location, with a Setback either way.
- **Informants and Charleston, 1822.** Persuade is gone. Four Informant Characters take its place: Peter Prioleau and George Wilson (the Vesey plot, 1822), Pharoah and Tom, and Ben Woolfolk (Gabriel's rising, 1800). An Informant is played onto the opponent's Gates at a Location with one of their slots open: it is theirs, its negative Influence counts against them there, it takes one of their Gate slots, and it never becomes Ready or goes Inside. They can relocate it (their Relocation), slide it with Robert Smalls, or let a Threat knock it away; Harriet will not conduct one, no Reveal targets it (it is not the opponent's), and it never confronts. Informants are placed after every regular Character, so they never win a slot race against the holder's own plays; one that finds the Gates full goes back to your hand. Charleston, 1822 is a Location where, at the end of every turn, the Fresh Gate Character with the lowest Influence changes sides if the other side has a Gate slot for it (a tie goes against the leader); an Informant there is found out and returns to its planter's hand, and a Character played there is at risk unless something lower is beside it. Sundown Town leaves Informants alone. Marie Laveau's Reveal is now a hex: the strongest opposing Gate Character at her Location loses 2 Influence for the rest of the match.
- **Sundown Town and allies.** Curfew never holds Harriet Tubman herself. John Brown does not experience the town's rules: no curfew, never run out, and while he is at that Location one friendly Character who would be run out at the end of the turn (the highest Influence first) hides with him overnight instead.
- **Gate wait timing.** A Character played on turn N is Fresh through turn N+1's planning and becomes Ready at the end of N+1, so it can enter on N+2. This is the reading that makes "becomes Ready immediately" effects (Harriet, Organizer, Juneteenth) worth a full turn. If playtesting says the wait is too long, the one-line change is in the cleanup step of `resolve.ts`.
- **Stand on Business** adds an 8th turn and removes Sit Down for the player who stood. The raise is part of the hidden plan and takes effect at the end of the *following* turn. Nobody is forced into a yes/no modal: the other player plans a normal turn with a banner showing the pending raise, and Sitting Down during that turn costs only the old Legacy. Standing back doubles again (max 4). A Stand on turn 7 adds turn 8 and lands with the final result.
- **Day and night**: odd turns are day, even turns are night (`isNight`). A curfew is a condition of a Location, not a Threat: Sundown Town (`curfew: true`) lets nobody relocate out at night. The Justice System's two-turn hold is a separate rule. `lockReason(state, c)` is the one gate for both. Only curfew Locations show the time of day: a DAY or NIGHT tag on the panel, and at night `locations/<id>_night.jpg` when it exists, otherwise the day art darkened. The rest of the board looks the same day or night.
- **Harriet Tubman** (Conductor) is the only card that ignores locks: her Reveal moves any friendly Character, Gate or Inside, straight Inside another Location when there is room, otherwise to its Gates Ready. Free and before entries.
- **Relocation** works from both zones. Inside → Gates arrives Fresh (the committed zone pays to leave). Gates → Gates keeps Ready status (the mobile zone): a Ready Character held at the Gates can be committed late wherever it is needed. One Relocation per turn, plus Porters, Lagos and Herndon exceptions.
- **Confrontation** is a planned action: commit Characters at a Threat's Location; they cannot enter or relocate that turn. Shared Threats sum both players' Force in one turn; split Threats need the owner first, then Assist is offered.
- **"History moves"**: at the start of Turn 3 one random Threat (Patrol, Complicity or Housing Restriction) appears at a revealed Location without one. Greenwood spawns a Mob on Turn 4. Harpers Ferry reveals with Paddy Rollers.
- **Setback**: a loss suffered at the hands of injustice, meaning a Threat or a hostile Location working against you. The opponent's cards never cause one. **Reparations** converts Setbacks into lasting Influence on a Location: it counts at the end no matter when it is played.
- **The Justice System** Location holds anyone who goes Inside for two turns: no relocating out.
- **The Tabernacle** protects your Characters from displacement. Establish the church set there (Richard Allen, Absalom Jones, Daniel Payne) and **Black Jesus** appears: sanctuary at his Location and +1 Influence to every Character you control. He is never in a deck.
- **The Ancestors** are never in a deck either: in 25% of matches (rolled at setup), holding three Characters Inside at Accra, Ghana brings the card to your hand once. Chairteenth has the same 25% roll and arrives when Montgomery, Alabama reveals. Played while planning, it shows Harborlight's plan for the turn (the AI plans deterministically, so peeking changes nothing) and every timed danger on the board.
- **Straight Inside** (Sleeping Car Porters) always goes Inside the turn it is played. **Direct Entry** (Bessie Coleman) may: the planned move carries a Gates/Inside toggle. Nobody else skips the Gates.
- **The Mob** closes a Location after four unanswered turns.
- **Energy** shows as a Hearthstone-style crystal bar under the timer: lit crystals are unspent this turn, dim ones spent, hollow ones arrive on later turns.
- `npm run docs` regenerates `docs/copy.md` (every player-facing string, for copy editing) and `docs/art-spec.md` (image specs plus the missing-art list).
- **Events** are played into the purple Event slot beside your Gates at a Location: one per Location per player per turn, and the Gates can be full. Each works everywhere and gets a bonus from where it lands: Reparations +1 in the Americas, The Ancestors +1 Influence in Africa, Word of Mouth draws 2 with a crowd, Community Defense +2 Force at its Location. Decks carry at most two.
- **Gatherings** are Characters that are never in a deck. **The Bud Billiken Parade** (2/1) arrives at Great Migration, Inside if there is room, once you have three Established Characters there, and only in about half of matches (rolled when the match is created); its other Established friends get +1 Influence and your arrivals there are Ready at once. **Chairteenth** (1/3, +1 Force to friendly confronters) arrives Ready at both players' Gates the moment Juneteenth is revealed. Each arrival opens a fanfare card. If a card ever returns a Gathering to hand, it can be replayed like any Character.
- **Location scoring with two ties or a Lost Location**: whoever won more Locations wins; if equal, the brief's tiebreaks apply.
- **Katherine Johnson's** private reveal is stored per player and redacted from the opponent's view; the AI is allowed to use it exactly as a human would.
- **Victor Hugo Green** (the Green Book) lets relocations out of his Location arrive Inside, the interior-to-interior answer to Sundown Town. **Sojourner Truth** replaces the "selected additional historical figures" slot to give the pool a Suppress effect. **Ida B. Wells, Queen Nzinga, Toussaint Louverture, Marcus Garvey, Bessie Coleman** round out the sixteen.
- **Sundown Town** is drawn about a third as often as other Locations and does nothing on the turn it reveals. **Gary, Indiana** (Steel and Soul) joins the pool. **Paddy Roller** is one shared Threat "in the area" rather than one per player.
- Player Gates are shown under each Location panel (the wireframe omitted them; the brief requires them).

## Harborlight

Harborlight receives `viewFor(state, 'B')`: no opponent hand, no unrevealed Location identities, no draw order, no RNG. It decides confrontations heuristically, then enumerates plays × entries × relocations, simulates each with `resolveTurn` (opponent passing) and scores the resulting board (win probability from per-Location Influence gaps that steepen toward the final turn, projected Established value, Threat exposure, Gate crowding). It picks the best plan ~70% of the time, a sensible alternative ~20%, and an imperfect legal plan ~10%. Stand on Business triggers above ~65% / ~80% estimated win chance with a ~7% bluff rate near even. Tuning constants are in `DEFAULT_TUNING`.

A 200-match self-play run currently gives roughly 54% / 45% split for the two preset decks, 2.3 Location lead changes per match and 0.6 final-turn flips.

## Mythic and the Summon

Characters carry a category: historical, archetype or mythic. Mythic cards (Anansi, Shango, Oshun, Yemoja, Ogun, Mami Wata, Black Jesus) are fantasy drawn from African cosmology and diaspora spirituality, labelled as such on the card. The joint **Summon** is cooperative: both players commit at a Location with a Threat via quick chat; enough combined Force manifests Obatala (Threats cleared, the Location can never be Lost, +1 Influence to everyone there, both draw). A failed Summon followed by that Location being Lost costs both players 1 Influence at their other Locations.

## Not built (by design)

Backend, accounts, matchmaking, collection, shop, progression, chat, production VFX. See the brief's §112.
