using Newtonsoft.Json.Linq;
using NUnit.Framework;
using System.Collections.Generic;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// The content tables come from the web engine (npm run export) as Resources/content.json.
    /// These tests prove the file is where the port expects it, parses, and hangs together: every
    /// deck is full and names only cards that exist, every Location carries a rule.
    /// </summary>
    public class ContentTests
    {
        static JObject Load()
        {
            var text = Resources.Load<TextAsset>("content");
            Assert.IsNotNull(text, "Resources/content.json is missing: run `npm run export` in the repo root.");
            return JObject.Parse(text.text);
        }

        [Test]
        public void ContentParsesAndIsFormatOne()
        {
            var c = Load();
            Assert.AreEqual(1, (int)c["format"]);
            Assert.Greater(((JArray)c["characters"]).Count, 70);
            Assert.AreEqual(19, ((JArray)c["locations"]).Count);
            Assert.AreEqual(24, (int)c["constants"]["DECK_SIZE"]);
        }

        [Test]
        public void EveryDeckIsFullAndNamesRealCards()
        {
            var c = Load();
            var ids = new HashSet<string>();
            foreach (var ch in c["characters"]) ids.Add((string)ch["id"]);
            foreach (var ev in c["events"]) ids.Add((string)ev["id"]);
            int deckSize = (int)c["constants"]["DECK_SIZE"];
            foreach (var deck in ((JObject)c["decks"]).Properties())
            {
                var cards = (JArray)deck.Value["cards"];
                Assert.AreEqual(deckSize, cards.Count, $"deck {deck.Name} has {cards.Count} cards");
                foreach (var id in cards) Assert.IsTrue(ids.Contains((string)id), $"deck {deck.Name} names unknown card {id}");
            }
        }

        [Test]
        public void EveryLocationHasARuleAndAnEffect()
        {
            var c = Load();
            foreach (var loc in c["locations"])
            {
                Assert.IsFalse(string.IsNullOrEmpty((string)loc["rule"]), $"{loc["id"]} has no rule");
                Assert.IsNotNull(loc["effect"]?["type"], $"{loc["id"]} has no effect type");
            }
        }
    }
}
