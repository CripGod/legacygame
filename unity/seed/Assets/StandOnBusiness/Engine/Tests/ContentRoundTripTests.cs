using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>The content types against content.json: typed in, written out, the same document; and the indexes.</summary>
    public class ContentRoundTripTests
    {
        static string Text()
        {
            var text = Resources.Load<TextAsset>("content");
            Assert.IsNotNull(text, "Resources/content.json is missing: run `npm run export`");
            return text.text;
        }

        [Test]
        public void ContentRoundTrips()
        {
            var original = JObject.Parse(Text());
            var typed = ContentTable.Parse(Text());
            var back = JObject.Parse(Json.Write(typed));
            foreach (var section in new[] { "format", "source", "constants", "characters", "events", "threats", "randomThreatPool", "locations", "unknownLocation", "decks", "teamUps", "summon", "references" })
            {
                Assert.IsTrue(JToken.DeepEquals(original[section], back[section]), $"content.{section} changed in the round trip");
            }
        }

        [Test]
        public void IndexesAndEffectsRead()
        {
            var c = ContentTable.Parse(Text());
            Assert.AreEqual(c.Characters.Count, c.CharacterById.Count);
            Assert.AreEqual(c.Locations.Count, c.LocationById.Count);
            var allen = c.CharacterById["richard_allen"];
            Assert.AreEqual("tutor", allen.Reveal.Effect.Type);
            Assert.AreEqual(2, allen.Reveal.Effect.Args["cardIds"].Count());
            Assert.AreEqual("drawOnEnterHere", allen.Established.Effect.Type);
            var greenwood = c.LocationById["greenwood"];
            Assert.AreEqual("insideInfluence", greenwood.Effect.Type);
            Assert.AreEqual(1, greenwood.Effect.Int("amount"));
            Assert.AreEqual(4, greenwood.TimedThreat.Turn);
            Assert.AreEqual(Rules.DeckSize, (int)c.Constants["DECK_SIZE"]);
            Assert.AreEqual(Rules.StandMultipliers.Length, c.Constants["STAND_MULTIPLIERS"].Count());
        }
    }
}
