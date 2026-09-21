# Checking the C# engine without Unity

`check.sh` compiles the engine assembly (`unity/StandOnBusiness/Assets/StandOnBusiness/Engine`) with the Roslyn compiler
under Mono and replays the golden traces through it, the same checks the Unity EditMode tests make, so a change to the
engine can be verified from a terminal (or a cloud session) before anyone opens Unity.

    unity/tools/check.sh          # compile, then every recorded turn and every Harborlight plan
    unity/tools/check.sh turns    # the turns only (fast)
    unity/tools/check.sh ai       # the plans only (a minute or two)
    unity/tools/check.sh dump seed-0026.json 4   # one turn side by side, for reading a difference
    unity/tools/check.sh exp      # Ieee754.Exp against Node's Math.exp, bit for bit

It needs Mono (`apt-get install mono-devel`), curl, unzip, and node for `exp`. The compiler
(Microsoft.Net.Compilers.Toolset) and Newtonsoft.Json come from nuget.org into `unity/tools/.cache` on the first run;
the cache is ignored by git.

The board (`Game/`) is not compiled here: it needs Unity's own assemblies. The Unity Test Runner remains the final word.

Syncing the web engine into Unity after a rules or card change:

1. `npm run export` (content.json) and `npm run golden -- 40 1` (the traces and rng.json).
2. `unity/tools/check.sh`. A new effect type shows up as a turn that differs or throws; port it in `Engine/Resolve.cs`.
3. Pull in Unity and Run All in the Test Runner.
