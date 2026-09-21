using System;
using System.IO;
using StandOnBusiness.Engine;

/// <summary>One turn side by side: the recorded events, the C# engine's events, the plans. For reading a difference.</summary>
static class Dump
{
    public static void Run(string file, int turn)
    {
        var content = Program.LoadContent();
        var trace = GoldenTrace.Parse(File.ReadAllText(Program.Golden + file));
        var before = turn == 1 ? trace.Initial : trace.Turns[turn - 2].State;
        var t = trace.Turns[turn - 1];
        var o = Resolve.ResolveTurn(content, before, t.Plans);
        Console.WriteLine("EXPECTED"); foreach (var e in t.Events) Console.WriteLine("  " + Json.Write(e));
        Console.WriteLine("ACTUAL"); foreach (var e in o.Events) Console.WriteLine("  " + Json.Write(e));
        Console.WriteLine("PLANS " + Json.Write(t.Plans));
    }
}
