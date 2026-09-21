using Newtonsoft.Json.Linq;
using NUnit.Framework;
using System.IO;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// The golden traces (npm run golden) are seeded matches from the web engine: the options, the
    /// state after setup, and for every turn both plans, the state after the turn and the events.
    /// Today these tests prove the corpus is present and well formed. As the port lands, each
    /// stage adds its own check against the same files: createMatch against `initial`, then
    /// resolveTurn against each turn's `state`, key for key.
    /// </summary>
    public class GoldenTraceTests
    {
        public static string Dir => Path.Combine(Application.dataPath, "StandOnBusiness/Engine/Tests/Golden");

        static JObject Manifest()
        {
            var path = Path.Combine(Dir, "manifest.json");
            Assert.IsTrue(File.Exists(path), "Golden/manifest.json is missing: run `npm run golden` in the repo root.");
            return JObject.Parse(File.ReadAllText(path));
        }

        [Test]
        public void ManifestListsTraces()
        {
            var m = Manifest();
            Assert.AreEqual(2, (int)m["format"]);
            Assert.Greater(((JArray)m["matches"]).Count, 0);
        }

        [Test]
        public void EveryTraceParsesAndMatchesItsManifestRow()
        {
            var m = Manifest();
            foreach (var row in m["matches"])
            {
                var path = Path.Combine(Dir, (string)row["file"]);
                Assert.IsTrue(File.Exists(path), $"{row["file"]} is listed but missing");
                var trace = JObject.Parse(File.ReadAllText(path));
                Assert.AreEqual((int)row["seed"], (int)trace["options"]["seed"], $"{row["file"]}: seed");
                var turns = (JArray)trace["turns"];
                Assert.AreEqual((int)row["turns"], turns.Count, $"{row["file"]}: turn count");
                Assert.AreEqual("planning", (string)trace["initial"]["phase"], $"{row["file"]}: initial phase");
                Assert.AreEqual("ended", (string)turns[turns.Count - 1]["state"]["phase"], $"{row["file"]}: final phase");
                foreach (var t in turns)
                {
                    Assert.IsNotNull(t["plans"]["A"], $"{row["file"]}: plan A");
                    Assert.IsNotNull(t["plans"]["B"], $"{row["file"]}: plan B");
                    Assert.IsNotNull(t["state"]["players"], $"{row["file"]}: state");
                }
            }
        }
    }
}
