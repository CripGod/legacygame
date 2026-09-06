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
  resolve.ts       resolveTurn(state, {A, B}) → next state + ordered events; Stand on Business response
  view.ts          viewFor(state, player): the redacted view every player (human UI and AI) receives
src/ai/          Harborlight. Plans from the redacted view only; simulates candidates with the real engine.
src/ui/          React presentation. Renders views, collects a TurnPlan, animates the event feed.
src/analytics/   Local playtest metrics (localStorage JSON, export from the dev panel)
tests/           Engine, redaction, abilities, threats, stakes, AI smoke tests
scripts/         sim.ts (batch balance), trace.ts (one match, full log)
```

The engine never imports React. The UI never touches the true `GameState` except in the controller that owns it; every screen renders `viewFor(state, player)`. Harborlight consumes exactly that same view. PvP later means replacing the AI plan provider with a remote player's submitted `TurnPlan`.

## Playing

- **Plan**: tap a card, tap a Location. Tap a Ready Character at your Gates to send it Inside. Tap an Established Character to relocate it. Tap a Threat to commit Force. Then **Lock It In**. 30 seconds per turn; timeout locks whatever you had.
- **Win**: lead Influence at two of the three Locations after Turn 6.
- **Stakes**: Stand on Business once per player to double the match (1 → 2 → 4). The other side Continues or Steps Off.

Developer tools (`?dev=1` or the button on the start screen): fixed seeds, AI reasoning log (every candidate plan, score, chosen plan and tier), analytics summary/export, full event log, the true state, generic placeholder names (Test A), and a local two-player pass-the-device mode (Phase 2).

## Decisions made where the brief left room

- **Gate wait timing.** A Character played on turn N is Fresh through turn N+1's planning and becomes Ready at the end of N+1, so it can enter on N+2. This is the reading that makes "becomes Ready immediately" effects (Harriet, Organizer, Juneteenth) worth a full turn. If playtesting says the wait is too long, the one-line change is in the cleanup step of `resolve.ts`.
- **Stand on Business response** happens after the turn resolves (the raise is part of the hidden plan), so the responder decides with the new board in view. A raise on Turn 6 is answered before the result is final.
- **Confrontation** is a planned action: commit Characters at a Threat's Location; they cannot enter or relocate that turn. Shared Threats sum both players' Force in one turn; split Threats need the owner first, then Assist is offered.
- **"History moves"**: at the start of Turn 3 one random Threat (Patrol, Complicity or Housing Restriction) appears at a revealed Location without one. Greenwood spawns a Supremacist Mob on Turn 4. Harpers Ferry reveals with Slave Catchers.
- **Reparations** counts for final scoring when played on Turn 6 (temporary Influence is scored before cleanup).
- **Location scoring with two ties or a Lost Location**: whoever won more Locations wins; if equal, the brief's tiebreaks apply.
- **Katherine Johnson's** private reveal is stored per player and redacted from the opponent's view; the AI is allowed to use it exactly as a human would.
- **Sojourner Truth** replaces the "selected additional historical figures" slot to give the pool a Suppress effect. **Ida B. Wells, Queen Nzinga, Toussaint Louverture, Marcus Garvey, Bessie Coleman** round out the sixteen.
- Player Gates are shown under each Location panel (the wireframe omitted them; the brief requires them).

## Harborlight

Harborlight receives `viewFor(state, 'B')`: no opponent hand, no unrevealed Location identities, no draw order, no RNG. It decides confrontations heuristically, then enumerates plays × entries × relocations, simulates each with `resolveTurn` (opponent passing) and scores the resulting board (win probability from per-Location Influence gaps that steepen toward Turn 6, projected Established value, Threat exposure, Gate crowding). It picks the best plan ~70% of the time, a sensible alternative ~20%, and an imperfect legal plan ~10%. Stand on Business triggers above ~65% / ~80% estimated win chance with a ~7% bluff rate near even. Tuning constants are in `DEFAULT_TUNING`.

A 200-match self-play run currently gives roughly 54% / 45% split for the two preset decks, 2.3 Location lead changes per match and 0.6 final-turn flips.

## Not built (by design)

Backend, accounts, matchmaking, collection, shop, progression, chat, production VFX. See the brief's §112.
