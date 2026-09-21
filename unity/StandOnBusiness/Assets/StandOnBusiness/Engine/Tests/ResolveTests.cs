using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// The resolver against every recorded turn of every golden trace: from the recorded state before the turn and the
    /// two recorded plans, ResolveTurn must produce the recorded state after the turn and the recorded events, key for
    /// key. Each turn starts from the web engine's own prior state, so one wrong turn shows up alone instead of
    /// cascading through the rest of the match.
    /// </summary>
    public class ResolveTests
    {
        static ContentTable Content()
        {
            var text = Resources.Load<TextAsset>("content");
            Assert.IsNotNull(text, "Resources/content.json is missing: run `npm run export`");
            return ContentTable.Parse(text.text);
        }

        static JToken Ser<T>(T value) => JToken.Parse(Json.Write(value));

        [Test]
        public void EveryRecordedTurnResolvesAsTheWebEngineDid()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            int turns = 0;
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                GameState before = trace.Initial;
                foreach (var t in trace.Turns)
                {
                    var plans = new Dictionary<string, TurnPlan> { ["A"] = t.Plans["A"], ["B"] = t.Plans["B"] };
                    var output = Resolve.ResolveTurn(content, before, plans);
                    var d = JsonDiff.First(Ser(t.Events), Ser(output.Events), $"{file} turn {t.Turn} events");
                    Assert.IsNull(d, d);
                    d = JsonDiff.First(Ser(t.State), Ser(output.State), $"{file} turn {t.Turn} state");
                    Assert.IsNull(d, d);
                    before = t.State;
                    turns++;
                }
            }
            Assert.Greater(turns, 100);
        }

        [Test]
        public void ResolveTurnLeavesItsInputAlone()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            var file = (string)manifest["matches"][0]["file"];
            var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
            var before = Json.Write(trace.Initial);
            Resolve.ResolveTurn(content, trace.Initial, trace.Turns[0].Plans);
            Assert.AreEqual(before, Json.Write(trace.Initial), "the input state changed");
        }

        [Test]
        public void EveryMatchEndsAsTheWebEngineSaid()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                var last = trace.Turns[trace.Turns.Count - 1];
                var prior = trace.Turns.Count > 1 ? trace.Turns[trace.Turns.Count - 2].State : trace.Initial;
                var output = Resolve.ResolveTurn(content, prior, last.Plans);
                Assert.AreEqual("ended", output.State.Phase, $"{file}: final phase");
                var d = JsonDiff.First(Ser(trace.Result), Ser(output.State.Result), $"{file} result");
                Assert.IsNull(d, d);
            }
        }

        [Test]
        public void ViewHidesTheOpponentsHandAndDeck()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            var file = (string)manifest["matches"][0]["file"];
            var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
            var state = trace.Turns[0].State;
            var v = View.ViewFor(content, state, "A");
            Assert.AreEqual("A", v.ViewFor);
            Assert.AreEqual(0, v.Players["A"].Deck.Count);
            Assert.AreEqual(0, v.Players["B"].Deck.Count);
            Assert.AreEqual(0u, v.Rng.S);
            Assert.AreEqual(state.Players["B"].Hand.Count, v.Players["B"].Hand.Count);
            Assert.IsTrue(v.Players["B"].Hand.TrueForAll(id => id == "hidden"));
            CollectionAssert.AreEqual(state.Players["A"].Hand, v.Players["A"].Hand);
            Assert.IsNotNull(v.Players["A"].DeckEvents);
            Assert.IsNull(v.Players["B"].DeckEvents);
            foreach (var loc in v.Locations) if (!loc.Revealed && state.Players["A"].KnownNextReveal != loc.Index) Assert.AreEqual("unknown", loc.DefId);
            foreach (var e in v.LastEvents) Assert.IsTrue(e.PrivateTo == null || e.PrivateTo == "A");
            // The true state is untouched.
            Assert.Greater(state.Players["B"].Deck.Count, 0);
        }
    }
}
