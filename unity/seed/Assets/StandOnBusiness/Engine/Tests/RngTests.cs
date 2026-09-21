using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// The RNG against rng.json, which the web engine recorded: for each seed the state after Make, sixteen floats,
    /// sixteen ints in [0, 6), a shuffle of eight, and the state after the sixteen floats; plus string hashes.
    /// Bit-for-bit agreement here is what lets every later stage of the port replay the golden traces.
    /// </summary>
    public class RngTests
    {
        static JObject Fixture()
        {
            var path = Path.Combine(GoldenTraceTests.Dir, "rng.json");
            Assert.IsTrue(File.Exists(path), "Golden/rng.json is missing");
            return JObject.Parse(File.ReadAllText(path));
        }

        [Test]
        public void FloatsMatchTheWebEngine()
        {
            foreach (var row in Fixture()["seeds"])
            {
                long seed = (long)row["seed"];
                var r = Rng.Make(seed);
                Assert.AreEqual((uint)row["initial"], r.S, $"seed {seed}: initial state");
                var floats = (JArray)row["floats"];
                for (int i = 0; i < floats.Count; i++)
                {
                    Assert.AreEqual((double)floats[i], Rng.NextFloat(r), 0.0, $"seed {seed}: float {i}");
                }
                Assert.AreEqual((uint)row["afterSixteen"], r.S, $"seed {seed}: state after sixteen");
            }
        }

        [Test]
        public void IntsAndShufflesMatchTheWebEngine()
        {
            foreach (var row in Fixture()["seeds"])
            {
                long seed = (long)row["seed"];
                var r = Rng.Make(seed);
                var ints = (JArray)row["intsOfSix"];
                for (int i = 0; i < ints.Count; i++) Assert.AreEqual((int)ints[i], Rng.NextInt(r, 6), $"seed {seed}: int {i}");
                var r2 = Rng.Make(seed);
                var order = Rng.Shuffle(r2, new List<string> { "a", "b", "c", "d", "e", "f", "g", "h" });
                var want = (JArray)row["shuffleOfEight"];
                for (int i = 0; i < want.Count; i++) Assert.AreEqual((string)want[i], order[i], $"seed {seed}: shuffle slot {i}");
            }
        }

        [Test]
        public void HashSeedMatchesTheWebEngine()
        {
            foreach (var row in Fixture()["hashes"])
            {
                Assert.AreEqual((uint)row["hash"], Rng.HashSeed((string)row["input"]), $"hash of \"{row["input"]}\"");
            }
        }

        [Test]
        public void ZeroSeedFallsBackToTheGoldenRatio()
        {
            Assert.AreEqual(0x9e3779b9u, Rng.Make(0).S);
            Assert.AreEqual(0xffffffffu, Rng.Make(-1).S);
        }
    }
}
