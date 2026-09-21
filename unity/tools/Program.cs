// The C# engine checked without Unity: compiles the engine assembly with Roslyn under Mono and replays the golden
// traces through it (every turn, every Harborlight plan). See unity/tools/README.md; run it with check.sh.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using StandOnBusiness.Engine;
using StandOnBusiness.Engine.Tests;

static class Program
{
    public static string Root => Path.GetFullPath(Environment.GetEnvironmentVariable("SOB_ASSETS") ?? "unity/StandOnBusiness/Assets/StandOnBusiness") + "/";
    public static string Golden => Root + "Engine/Tests/Golden/";
    public static ContentTable LoadContent() => ContentTable.Parse(File.ReadAllText(Root + "Resources/content.json"));

    static JToken Ser<T>(T v) => JToken.Parse(Json.Write(v));

    static int Main(string[] args)
    {
        var cmd = args.Length > 0 ? args[0] : "turns";
        int max = args.Length > 1 && int.TryParse(args[1], out var m) ? m : 10;
        switch (cmd)
        {
            case "turns": return Turns(max);
            case "ai": return AiCheck.Run(max);
            case "dump": Dump.Run(args[1], int.Parse(args[2])); return 0;
            case "exp": AiCheck.ExpDump(args[1], args[2]); return 0;
            default: Console.WriteLine("usage: harness turns [max] | ai [max] | dump <trace.json> <turn> | exp <in> <out>"); return 2;
        }
    }

    /// <summary>Every recorded turn from the web engine's own prior state: the state and events must match key for key.</summary>
    static int Turns(int max)
    {
        var content = LoadContent();
        var manifest = JObject.Parse(File.ReadAllText(Golden + "manifest.json"));
        int fails = 0, turns = 0;
        foreach (var row in manifest["matches"])
        {
            var file = (string)row["file"];
            var trace = GoldenTrace.Parse(File.ReadAllText(Golden + file));
            GameState before = trace.Initial;
            foreach (var t in trace.Turns)
            {
                turns++;
                string d = null;
                try
                {
                    var o = Resolve.ResolveTurn(content, before, t.Plans);
                    d = JsonDiff.First(Ser(t.Events), Ser(o.Events), $"{file} turn {t.Turn} events")
                        ?? JsonDiff.First(Ser(t.State), Ser(o.State), $"{file} turn {t.Turn} state");
                }
                catch (Exception e) { d = $"{file} turn {t.Turn}: EXCEPTION {e.GetType().Name}: {e.Message}\n{e.StackTrace}"; }
                if (d != null) { Console.WriteLine(d); if (++fails >= max) { Console.WriteLine("..."); return 1; } }
                before = t.State;
            }
        }
        Console.WriteLine($"{turns} turns, {fails} differ");
        return fails == 0 ? 0 : 1;
    }
}
