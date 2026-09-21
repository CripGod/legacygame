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

## What comes next (in the repo, no Unity needed)

- `npm run export` writes the content tables (Characters, Events, Threats, Locations, decks, homes, references) as JSON for the port to load.
- `npm run golden` records seeded AI-vs-AI matches (plans, state and events per turn) as the C# engine's acceptance tests.
