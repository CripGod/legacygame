using System;
using System.IO;
using Newtonsoft.Json.Linq;
using StandOnBusiness.Engine;
using StandOnBusiness.Engine.Tests;

static class AiCheck
{
    static JToken Ser<T>(T v) => JToken.Parse(Json.Write(v));

    /// <summary>Every recorded plan, both seats: Harborlight given the same redacted view must choose the same plan.</summary>
    public static int Run(int max)
    {
        var content = Program.LoadContent();
        var manifest = JObject.Parse(File.ReadAllText(Program.Golden + "manifest.json"));
        int fails = 0, plans = 0;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        foreach (var row in manifest["matches"])
        {
            var file = (string)row["file"];
            var trace = GoldenTrace.Parse(File.ReadAllText(Program.Golden + file));
            GameState before = trace.Initial;
            foreach (var t in trace.Turns)
            {
                foreach (var p in Rules.Players)
                {
                    plans++;
                    string d = null;
                    try
                    {
                        var view = View.ViewFor(content, before, p);
                        var got = Harborlight.PlanTurn(content, view, p).Plan;
                        d = JsonDiff.First(Ser(t.Plans[p]), Ser(got), $"{file} turn {t.Turn} plan {p}");
                        if (d != null) d += "\n   expected " + Json.Write(t.Plans[p]) + "\n   got      " + Json.Write(got);
                    }
                    catch (Exception e) { d = $"{file} turn {t.Turn} plan {p}: EXCEPTION {e.GetType().Name}: {e.Message}\n{e.StackTrace}"; }
                    if (d != null) { Console.WriteLine(d); if (++fails >= max) { Console.WriteLine("..."); return 1; } }
                }
                before = t.State;
            }
        }
        Console.WriteLine($"{plans} plans, {fails} differ, {sw.ElapsedMilliseconds}ms");
        return fails == 0 ? 0 : 1;
    }

    /// <summary>Ieee754.Exp over a list of inputs (one decimal per line) as hex bit patterns, to diff against Node's Math.exp (see check.sh).</summary>
    public static void ExpDump(string inPath, string outPath)
    {
        using var w = new StreamWriter(outPath);
        foreach (var line in File.ReadAllLines(inPath))
        {
            double x = double.Parse(line, System.Globalization.CultureInfo.InvariantCulture);
            w.WriteLine(BitConverter.DoubleToInt64Bits(Ieee754.Exp(x)).ToString("x16"));
        }
    }
}
