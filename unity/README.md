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
- **Next:** `Setup.CreateMatch` against every trace's `initial`, then `Query`, then `Resolve.ResolveTurn` against every turn's `state`.

## Porting order

`types` (the shapes, as C# records), `rng` (the seeded generator: its numbers must match the web engine's exactly, the traces will tell), `setup` (`createMatch`), `query` (influence, legality), `resolve` (`resolveTurn`), `view` (`viewFor`). The web tests in `tests/engine.test.ts` port alongside as NUnit. The AI comes last; the web Harborlight is its spec.
