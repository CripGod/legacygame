using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// The state, plan and event types against every recorded turn of every golden trace: read the web engine's JSON
    /// into the C# types, write it back, and the two must be the same document. A field the types miss, a wrong
    /// nullability, a key the naming strategy bends, all show up here as a named difference.
    /// </summary>
    public class StateRoundTripTests
    {
        static void RoundTrip<T>(JToken original, string what)
        {
            var typed = original.ToObject<T>(Newtonsoft.Json.JsonSerializer.Create(Json.Settings));
            var back = JToken.Parse(Json.Write(typed));
            var d = JsonDiff.First(original, back, what);
            Assert.IsNull(d, d);
        }

        [Test]
        public void EveryRecordedStatePlanAndEventRoundTrips()
        {
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            int states = 0;
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                RoundTrip<MatchOptions>(trace["options"], $"{file} options");
                RoundTrip<GameState>(trace["initial"], $"{file} initial");
                states++;
                foreach (var t in trace["turns"])
                {
                    var turn = (int)t["turn"];
                    RoundTrip<GameState>(t["state"], $"{file} turn {turn} state");
                    RoundTrip<TurnPlan>(t["plans"]["A"], $"{file} turn {turn} plan A");
                    RoundTrip<TurnPlan>(t["plans"]["B"], $"{file} turn {turn} plan B");
                    int i = 0;
                    foreach (var e in t["events"]) RoundTrip<GameEvent>(e, $"{file} turn {turn} event {i++}");
                    states++;
                }
            }
            Assert.Greater(states, 100, "the corpus is smaller than expected");
        }

        [Test]
        public void WholeTraceParsesTyped()
        {
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            var first = (string)manifest["matches"][0]["file"];
            var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, first)));
            Assert.AreEqual(1, trace.Format);
            Assert.AreEqual("planning", trace.Initial.Phase);
            Assert.AreEqual(3, trace.Initial.Locations.Count);
            Assert.AreEqual(2, trace.Initial.Players.Count);
            // The opening hand plus the first turn's draw: setup deals STARTING_HAND, then turn 1 begins.
            Assert.AreEqual(Rules.StartingHand + 1, trace.Initial.Players["A"].Hand.Count);
            Assert.AreEqual("ended", trace.Turns[trace.Turns.Count - 1].State.Phase);
            var clone = trace.Initial.Clone();
            Assert.AreNotSame(trace.Initial, clone);
            Assert.IsTrue(JToken.DeepEquals(JToken.Parse(Json.Write(trace.Initial)), JToken.Parse(Json.Write(clone))));
        }
    }
}
