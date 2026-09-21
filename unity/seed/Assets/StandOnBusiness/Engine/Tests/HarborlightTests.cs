using System;
using System.IO;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// Harborlight against the golden traces. Both seats' plans in every trace came from the web Harborlight, given the
    /// redacted view of the state before the turn; the C# Harborlight, given the same view, must choose the same plan
    /// every time. The exponential the win estimate runs through is checked against the web runtime's bits, since a
    /// score a last bit apart can flip which plan wins.
    /// </summary>
    public class HarborlightTests
    {
        static ContentTable Content()
        {
            var text = Resources.Load<TextAsset>("content");
            Assert.IsNotNull(text, "Resources/content.json is missing: run `npm run export`");
            return ContentTable.Parse(text.text);
        }

        static JToken Ser<T>(T value) => JToken.Parse(Json.Write(value));

        [Test]
        public void ExpMatchesTheWebRuntimeBitForBit()
        {
            Assert.AreEqual(0x4005BF0A8B145769L, BitConverter.DoubleToInt64Bits(Ieee754.Exp(1)), "exp(1)");
            Assert.AreEqual(0x3FF0000000000000L, BitConverter.DoubleToInt64Bits(Ieee754.Exp(0)), "exp(0)");
            Assert.AreEqual(0x3FE82F61628CD3D9L, BitConverter.DoubleToInt64Bits(Ieee754.Exp(-0.28)), "exp(-0.28)");
            Assert.AreEqual(0x4043D2BD0A7D0388L, BitConverter.DoubleToInt64Bits(Ieee754.Exp(3.68)), "exp(3.68)");
            Assert.AreEqual(0x3EB10A1A9CA5A41AL, BitConverter.DoubleToInt64Bits(Ieee754.Exp(-13.8)), "exp(-13.8)");
            Assert.AreEqual(0x3FF8D7E3863C4F1CL, BitConverter.DoubleToInt64Bits(Ieee754.Exp(0.44)), "exp(0.44)");
        }

        [Test]
        public void EveryRecordedPlanIsWhatHarborlightChooses()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            int plans = 0;
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                GameState before = trace.Initial;
                foreach (var t in trace.Turns)
                {
                    foreach (var p in Rules.Players)
                    {
                        var view = View.ViewFor(content, before, p);
                        var decision = Harborlight.PlanTurn(content, view, p);
                        var d = JsonDiff.First(Ser(t.Plans[p]), Ser(decision.Plan), $"{file} turn {t.Turn} plan {p}");
                        Assert.IsNull(d, d);
                        Assert.IsNotNull(decision.Debug.Chosen);
                        plans++;
                    }
                    before = t.State;
                }
            }
            Assert.Greater(plans, 200);
        }

        [Test]
        public void HarborlightPlansOnlyFromAView()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            var file = (string)manifest["matches"][0]["file"];
            var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
            var view = View.ViewFor(content, trace.Initial, "B");
            var before = Json.Write(view);
            var decision = Harborlight.PlanTurn(content, view, "B");
            Assert.AreEqual(before, Json.Write(view), "planning changed the view");
            Assert.IsTrue(decision.Debug.Considered.Count > 0);
            Assert.AreEqual(0, Query.ValidatePlan(content, trace.Initial, "B", decision.Plan).Count, "the plan is legal on the true state");
        }
    }
}
