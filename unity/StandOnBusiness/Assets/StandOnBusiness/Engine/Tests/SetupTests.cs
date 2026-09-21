using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// CreateMatch against every golden trace: the same options must give the web engine's initial state, key for key,
    /// including the RNG's state after setup, the three Locations, the reveal order, both shuffled decks, the opening
    /// hands and the first turn's events.
    /// </summary>
    public class SetupTests
    {
        static ContentTable Content()
        {
            var text = Resources.Load<TextAsset>("content");
            Assert.IsNotNull(text, "Resources/content.json is missing: run `npm run export`");
            return ContentTable.Parse(text.text);
        }

        [Test]
        public void CreateMatchReproducesEveryTracesInitialState()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            int checkedCount = 0;
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                var expected = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)))["initial"];
                var state = Setup.CreateMatch(content, trace.Options);
                var actual = JToken.Parse(Json.Write(state));
                var d = JsonDiff.First(expected, actual, $"{file} initial");
                Assert.IsNull(d, d);
                checkedCount++;
            }
            Assert.Greater(checkedCount, 0);
        }

        [Test]
        public void RandomDecksValidateAndSeedsRepeat()
        {
            var content = Content();
            var opts = new MatchOptions { Seed = 99, DeckKeys = new System.Collections.Generic.Dictionary<string, string> { ["A"] = "random", ["B"] = "random" } };
            var a = Setup.CreateMatch(content, opts);
            var b = Setup.CreateMatch(content, opts);
            Assert.IsTrue(JToken.DeepEquals(JToken.Parse(Json.Write(a)), JToken.Parse(Json.Write(b))), "the same seed must give the same match");
            foreach (var p in Rules.Players)
            {
                var deck = new System.Collections.Generic.List<string>(a.Players[p].Deck);
                deck.AddRange(a.Players[p].Hand);
                Assert.AreEqual(Rules.DeckSize, deck.Count, $"player {p}: deck plus hand");
                Assert.IsEmpty(Setup.ValidateDeck(content, deck), $"player {p}: random deck validates");
            }
        }

        [Test]
        public void ADeckWithoutAMythicIsRefused()
        {
            var content = Content();
            var deck = new System.Collections.Generic.List<string>(content.Decks["railroad"].Cards);
            Assert.IsEmpty(Setup.ValidateDeck(content, deck), "the preset validates as it is");
            // Swap every Mythic for a historical Character the deck does not hold, so the only fault left is the missing Mythic.
            var spares = new System.Collections.Generic.Queue<string>();
            foreach (var c in content.Characters) if (c.Category == "historical" && !c.Hidden && c.Spawn == null && !deck.Contains(c.Id)) spares.Enqueue(c.Id);
            for (int i = 0; i < deck.Count; i++)
            {
                if (content.CharacterById.TryGetValue(deck[i], out var c) && c.Category == "mythic") deck[i] = spares.Dequeue();
            }
            var errs = Setup.ValidateDeck(content, deck);
            Assert.AreEqual(1, errs.Count, string.Join(" | ", errs));
            StringAssert.Contains("Mythic", errs[0]);
        }
    }
}
