using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using StandOnBusiness.Engine;
using UnityEngine;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>
    /// The query module against the answers the web engine recorded for every state in every golden trace
    /// (scripts/golden.ts snapshotQueries): Influence per Location and per Character with its parts, the itemised
    /// rows, capacities, locks, energy, costs and their breakdown, legal options, Threat arithmetic. The same document
    /// is built here from the C# answers and compared key for key. Recorded plans must also validate clean.
    /// </summary>
    public class QueryTests
    {
        static ContentTable Content()
        {
            var text = Resources.Load<TextAsset>("content");
            Assert.IsNotNull(text, "Resources/content.json is missing: run `npm run export`");
            return ContentTable.Parse(text.text);
        }

        static JToken Null => JValue.CreateNull();
        static JToken Str(string s) => s == null ? Null : new JValue(s);
        static JToken Ser<T>(T value) => value == null ? Null : JToken.Parse(Json.Write(value));

        static JObject Both(System.Func<string, JToken> f) => new JObject { ["A"] = f("A"), ["B"] = f("B") };

        static JObject Snapshot(ContentTable content, GameState state)
        {
            var locations = new JArray();
            foreach (var l in state.Locations)
            {
                var threats = new JArray();
                foreach (var t in l.Threats)
                {
                    var confront = new JObject();
                    foreach (var c in Query.CharsAt(state, l.Index)) confront[c.Uid] = Query.ConfrontForce(content, state, c, t);
                    threats.Add(new JObject
                    {
                        ["uid"] = t.Uid,
                        ["needed"] = Query.ThreatForceNeeded(content, state, t),
                        ["canConfront"] = Both(p => Query.CanConfront(content, state, t, p)),
                        ["assist"] = Both(p => Query.IsAssist(content, t, p)),
                        ["confront"] = confront,
                    });
                }
                locations.Add(new JObject
                {
                    ["influence"] = Ser(Query.InfluenceAt(content, state, l.Index)),
                    ["leader"] = Str(Query.LeaderAt(content, state, l.Index)),
                    ["winner"] = Str(Query.LocationWinner(content, state, l.Index)),
                    ["insideCapacity"] = Query.InsideCapacity(content, state, l.Index),
                    ["landOffice"] = Ser(Query.LandOfficeAt(content, state, l.Index)),
                    ["gateOpen"] = Both(p => Query.GateOpen(state, l.Index, p)),
                    ["insideOpen"] = Both(p => Query.InsideOpen(content, state, l.Index, p)),
                    ["rows"] = Both(p => Ser(Query.InfluenceRows(content, state, l.Index, p))),
                    ["threats"] = threats,
                });
            }
            var chars = new JObject();
            foreach (var c in state.Characters.Values)
            {
                chars[c.Uid] = new JObject
                {
                    ["influence"] = Query.CharInfluence(content, state, c),
                    ["parts"] = Ser(Query.CharInfluenceParts(content, state, c)),
                    ["lock"] = Ser(Query.LockKind(content, state, c)),
                    ["blocked"] = Str(Query.IsBlockedFromEntering(content, state, c)),
                    ["held"] = Query.IsHeldInside(content, state, c),
                    ["suppressed"] = Query.IsSuppressed(state, c),
                };
            }
            var players = new JObject();
            foreach (var p in Rules.Players)
            {
                var costs = new JObject();
                foreach (var id in state.Players[p].Hand.Where(id => id != "hidden").Distinct())
                {
                    costs[id] = new JObject { ["cost"] = Query.CardCost(content, id, state, p), ["breakdown"] = Ser(Query.CostBreakdown(content, state, p, id)) };
                }
                players[p] = new JObject
                {
                    ["energy"] = Query.EnergyFor(content, state, p),
                    ["relocationsAllowed"] = Query.RelocationsAllowed(content, state, p),
                    ["totalForce"] = Query.TotalForce(content, state, p),
                    ["costs"] = costs,
                    ["legal"] = Ser(Query.LegalOptionsFor(content, state, p)),
                };
            }
            return new JObject
            {
                ["isNight"] = Query.IsNight(state),
                ["effectiveStakes"] = Query.EffectiveStakes(state),
                ["playerOrder"] = new JArray(Query.PlayerOrder(state)),
                ["locations"] = locations,
                ["chars"] = chars,
                ["players"] = players,
            };
        }

        [Test]
        public void EveryRecordedStateAnswersAsTheWebEngineDid()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            int states = 0;
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                var d = JsonDiff.First(trace.InitialQueries, Snapshot(content, trace.Initial), $"{file} initial queries");
                Assert.IsNull(d, d);
                states++;
                foreach (var t in trace.Turns)
                {
                    d = JsonDiff.First(t.Queries, Snapshot(content, t.State), $"{file} turn {t.Turn} queries");
                    Assert.IsNull(d, d);
                    states++;
                }
            }
            Assert.Greater(states, 100);
        }

        [Test]
        public void RecordedPlansValidateAsTheWebEngineSaid()
        {
            var content = Content();
            var manifest = JObject.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, "manifest.json")));
            foreach (var row in manifest["matches"])
            {
                var file = (string)row["file"];
                var trace = GoldenTrace.Parse(File.ReadAllText(Path.Combine(GoldenTraceTests.Dir, file)));
                GameState before = trace.Initial;
                foreach (var t in trace.Turns)
                {
                    foreach (var p in Rules.Players)
                    {
                        var errors = Query.ValidatePlan(content, before, p, t.Plans[p]);
                        var expected = t.PlanErrors[p];
                        Assert.AreEqual(string.Join(" | ", expected), string.Join(" | ", errors), $"{file} turn {t.Turn} plan {p}");
                    }
                    before = t.State;
                }
            }
        }
    }
}
