# Stand on Business: Unity

The Unity port lives here, beside the web prototype, so the rules and the port move in one commit. Decisions made once:

- **Unity 6 LTS** (6000.x), the **Universal 2D** template.
- **Canvas UI** (uGUI) with sprites and a tweening library for the board: this game is cards flying, flipping and settling.
- **Three assemblies.** `StandOnBusiness.Engine` is the rules, a plain C# class library with no UnityEngine reference (a server can run it). `StandOnBusiness.Engine.Tests` is NUnit against the golden traces the web engine records. `StandOnBusiness.Game` is everything that draws.
- **Text serialization, visible meta files, Git LFS for binaries** (`.gitattributes` at the repo root; `.gitignore` in this folder).

## Creating the project (once, on your machine)

1. Install **Unity Hub**, then in Hub install **Unity 6 LTS** with the modules you build for (Windows/Mac build support; add WebGL later if wanted).
2. In Hub: New project → **Universal 2D** → project name `StandOnBusiness` → location: this folder (`unity/`), so the project is `unity/StandOnBusiness`. Create.
3. In the editor: Edit → Project Settings → Editor: **Asset Serialization: Force Text**; Version Control: **Visible Meta Files** (both are the defaults in Unity 6; confirm).
4. Window → Package Manager: confirm **Test Framework** is installed (it is by default); add **Newtonsoft Json** (`com.unity.nuget.newtonsoft-json`, "Add package by name") for the content and trace JSON.
5. Close the editor. Copy `unity/seed/Assets/StandOnBusiness` into `unity/StandOnBusiness/Assets/` (so you have `Assets/StandOnBusiness/Engine`, `.../Engine/Tests`, `.../Game`). Reopen the project: Unity generates the `.meta` files.
6. Window → General → **Test Runner** → EditMode → Run All. One test passes (`EngineInfoTests`). That proves the engine assembly compiles without UnityEngine and the test assembly sees it.
7. Install **Git LFS** if you have not (`git lfs install` once per machine), then commit `unity/StandOnBusiness` (Assets, Packages, ProjectSettings and their `.meta` files; Library and the rest are ignored).

Tweening: DOTween (Asset Store, free) or PrimeTween (OpenUPM). Add it when the board starts, not before.

## The content and the traces (generated in the repo root, no Unity needed)

- `npm run export` writes `Assets/StandOnBusiness/Resources/content.json`: every Character, Event, Threat and Location, the preset decks, team-ups, the summon, the references and the rule constants, straight from `src/engine/content`. The port loads it at startup (`Resources.Load<TextAsset>("content")`). Rerun it whenever the content changes; the file carries the commit it came from.
- `npm run golden -- 40 1` writes `Assets/StandOnBusiness/Engine/Tests/Golden/`: forty seeded matches, Harborlight planning both seats, every preset deck in both seats. Each file holds the match options, the state after setup, and for every turn both plans, the state after the turn and the events. `manifest.json` indexes them. These are the C# engine's acceptance tests: same options and same plans must give the same states, key for key. Rerun after any engine change and commit the result with the change.
- `ContentTests` and `GoldenTraceTests` (EditMode) prove both are present and well formed today. As the port lands, each stage of the engine adds its own comparison against the same files: `createMatch` against `initial`, then `resolveTurn` against every turn's `state`.

## Where the port stands

- **Done:** `Rng` (mulberry32 and the string hash, bit for bit: `RngTests` against `Golden/rng.json`), `Rules` (the constants, the sweep bonus, the stand multiplier), the state, plan, event, content and trace types (`State.cs`, `Plans.cs`, `Content.cs`, `Trace.cs`; `StateRoundTripTests` reads every recorded state, plan and event of every golden trace into the types and writes it back unchanged, `ContentRoundTripTests` does the same for content.json). `Json.cs` holds the one serializer setting: camelCase members, dictionary keys untouched, nulls absent, `MatchResult.Winner`'s null kept.
- **Done:** `Setup` (all of setup.ts: `CreateMatch`, drawing, the Location draw, spawning Threats, retelling and transforming Locations, `StartTurn`); `SetupTests` creates every golden trace's match from its options and requires the web engine's initial state, key for key.
- **Done:** `Query` (all of query.ts: Influence and its parts and rows, capacities, locks, Force, energy, costs, team-ups, legal options, plan validation). The traces (format 2) record the web engine's answers for every state (`initialQueries`, `turns[].queries`) and the validation of every plan (`turns[].planErrors`); `QueryTests` rebuilds the same document from the C# answers and compares it key for key.
- **Done:** `Resolve` (all of resolve.ts across `Resolve.cs` and `ResolveTurn.cs`: stepping off and standing, relocations, placement, Events, Reveals, entering, team-ups, confrontations, summoning, Threat actions, cleanup, the end of the match, `Retreat`); `ResolveTests` replays every recorded turn of every trace from the web engine's own prior state and requires the recorded state and events, key for key. `View` (view.ts: `ViewFor`, `FilterEvents`).
- **Done:** `Harborlight` (all of src/ai/harborlight.ts: the board evaluation, confrontation heuristics, play variants, the two-stage plan search, controlled imperfection, Standing and Sitting Down, the Summon calls). `Ieee754.Exp` is the web runtime's own exponential (V8's fdlibm port), so the win estimate, and therefore every plan, is the same bit for bit on every platform. `HarborlightTests` gives the C# Harborlight the same redacted view the web one had for every turn of every trace, both seats, and requires the recorded plan; it takes a minute or two.
- **Started:** the board. `Game/MatchScreen.cs` draws a match against Harborlight with UI Toolkit, entirely from the engine's state and legal options (`Resources/board.uss` styles it). Plays, Direct Entry, targets, entering, relocations, confrontations, Standing and Sitting Down are all there; every edit to the plan is validated by the engine before it stays, so the board cannot lock in an illegal turn. No art yet: names, numbers and buttons.
- **Done:** the board's look, reused from the web as-is. `Resources/art` holds the same pictures public/art ships (portraits, Locations, Threats, Events as JPEG; the card frames, gate frames, Location plates and the Brightside kit converted from WebP to PNG, which Unity reads and WebP it does not), `Resources/fonts` the web's Cinzel and Crimson Pro. `Game/Art.cs` wraps them (textures, fonts, nine-sliced kit buttons, the theme's colours); `MatchScreen` lays the board out with the web's measurements: cards on their frames (CardFace.tsx, the `.card.tpl` rules), portraits in the gate frames with the three badges, Location plates with the title band, Influence line, Inside seats, Threat tiles and the rule, the turn count on the ribbon. The pictures are plain git blobs, the same bytes as public/art, so git stores them once; the LFS rules came out of .gitattributes.
- **Next:** the turn replay (the trace steps as beats, the way the web plays a turn back), then sound.

## Checking the engine without Unity

`unity/tools/check.sh` compiles the engine with Roslyn under Mono and replays every golden trace through it (every turn, every Harborlight plan), the same checks the EditMode tests make. `unity/tools/README.md` has the steps for syncing a web change into Unity.

## Running the board

Once, in the Unity project:

1. In the Project window, right-click `Assets/StandOnBusiness`, then Create > UI Toolkit > Panel Settings Asset. Name it `PanelSettings`. In its Inspector set Scale Mode to Scale With Screen Size and the Reference Resolution to 1920 x 1080.
2. Open `Assets/Scenes/SampleScene`. In the menu, GameObject > UI Toolkit > UI Document. In the new object's Inspector, set Panel Settings to the asset from step 1.
3. With that object still selected, Add Component > Match Screen. Seed 0 means a random match; the deck fields take `railroad`, `blackstar`, `caiman`, `pantheon`, `mirror` or `random`.
4. Press Play.

If the buttons do not react to the mouse, add an Event System (GameObject > UI > Event System) to the scene; Unity will offer to switch it to the Input System module, say yes.

## Porting order

`types` (the shapes, as C# records), `rng` (the seeded generator: its numbers must match the web engine's exactly, the traces will tell), `setup` (`createMatch`), `query` (influence, legality), `resolve` (`resolveTurn`), `view` (`viewFor`). The web tests in `tests/engine.test.ts` port alongside as NUnit. The AI comes last; the web Harborlight is its spec.
