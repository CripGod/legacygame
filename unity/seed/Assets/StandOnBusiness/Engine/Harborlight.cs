using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace StandOnBusiness.Engine
{
    // Harborlight, the AI opponent: a port of src/ai/harborlight.ts. It only ever receives a redacted view
    // (View.ViewFor) and evaluates candidate plans by running the real engine on that view with the opponent passing.

    public sealed class AiCandidate
    {
        public string Label;
        public TurnPlan Plan;
        public double Score;
        public List<string> Reasons = new List<string>();
    }

    public sealed class AiDebug
    {
        public int Turn;
        public string Player;
        public List<AiCandidate> Considered = new List<AiCandidate>();
        public string Chosen;
        public string PrimaryReason;
        /// <summary>"best", "sensible" or "imperfect".</summary>
        public string Tier;
        public double WinEstimate;
        public string StandDecision;
        public long ElapsedMs;
    }

    public sealed class AiDecision
    {
        public TurnPlan Plan;
        public AiDebug Debug;
    }

    public sealed class AiTuning
    {
        public double BestPick = 0.7;
        public double SensiblePick = 0.2;
        public double StandThreshold = 0.84;
        public double StrongStandThreshold = 0.94;
        public double BluffRate = 0.02;
        public double ContinueThreshold = 0.2;

        public static readonly AiTuning Default = new AiTuning();
    }

    public static class Harborlight
    {
        static readonly Dictionary<string, double> EstablishedValue = new Dictionary<string, double>
        {
            ["bridleHere"] = 0.8, ["drawOnEnterHere"] = 0.9, ["drawOnThreatCleared"] = 0.4, ["growLowestHere"] = 1.1,
            ["monumentEachTurn"] = 1.4, ["auraInfluenceOthersHere"] = 1.6, ["readyRelocatedIn"] = 0.8, ["relocatedInReady"] = 1.0,
            ["recordInformantsHere"] = 0.4, ["assistForceBonus"] = 0.3, ["relocatedNoDisplace"] = 0.4, ["blessNextEstablished"] = 0.9,
            ["gateInfluenceHere"] = 0.8, ["extraRelocation"] = 0.9, ["extraEnergy"] = 1.6, ["opposingGateInfluence"] = 0.9,
            ["influenceOnThreatCleared"] = 0.7, ["forceAuraHere"] = 0.5, ["noDisplaceHere"] = 0.5, ["relocatedOutReady"] = 0.7,
            ["noBlockHere"] = 0.5, ["noSuppressHere"] = 0.3, ["relocatedOutInside"] = 1.2, ["drawOnOpposingPlay"] = 0.9,
            ["confrontForceHere"] = 0.5, ["freshReadyHere"] = 1.0, ["relocatedInInside"] = 1.1, ["weakenThreatsHere"] = 0.5,
            ["sanctuary"] = 1.2, ["cookout"] = 1.8, ["freeDeparture"] = 0.6, ["allyBonus"] = 0.7, ["discountCharacters"] = 1.5,
            ["discountEvents"] = 0.4, ["discountTag"] = 0.8, ["ripen"] = 0.9, ["shieldHere"] = 0.8,
        };

        static double Sigmoid(double x) => 1 / (1 + Ieee754.Exp(-x));

        static CharacterDef CharDef(ContentTable content, string id) => Query.CharDef(content, id);
        static bool IsCharacter(ContentTable content, string cardId) => content.CharacterById.ContainsKey(cardId);
        static string Pct(double x) => Math.Round(x * 100, MidpointRounding.AwayFromZero).ToString(System.Globalization.CultureInfo.InvariantCulture);

        /// <summary>Probability-ish that p wins each Location, given current Influence and turns left.</summary>
        static List<double> LocationProbabilities(ContentTable content, GameState state, string p)
        {
            var opp = Rules.Other(p);
            double k = 0.2 + 0.08 * Math.Min(state.Turn, state.MaxTurns);
            var outList = new List<double>();
            foreach (var l in state.Locations)
            {
                if (l.Lost) { outList.Add(0); continue; }
                var inf = Query.InfluenceAt(content, state, l.Index);
                int diff = inf[p] - inf[opp];
                if (state.Result != null) { outList.Add(diff > 0 ? 1 : diff < 0 ? 0 : 0.5); continue; }
                outList.Add(Sigmoid(diff * k));
            }
            return outList;
        }

        static double WinProbability(List<double> probs)
        {
            double a = probs[0], b = probs[1], c = probs[2];
            return a * b + a * c + b * c - 2 * a * b * c;
        }

        public static double EstimateWinChance(ContentTable content, GameState state, string p)
        {
            if (state.Result != null) return state.Result.Winner == p ? 1 : state.Result.Winner == null ? 0.5 : 0;
            return WinProbability(LocationProbabilities(content, state, p));
        }

        sealed class Evaluation
        {
            public double Score;
            public List<string> Reasons = new List<string>();
        }

        static Evaluation Evaluate(ContentTable content, GameState state, string p)
        {
            var opp = Rules.Other(p);
            var reasons = new List<string>();
            int remaining = Math.Max(0, state.MaxTurns - state.Turn);
            double score = 0;

            if (state.Result != null)
            {
                double r = state.Result.Winner == p ? 100 : state.Result.Winner == null ? 50 : 0;
                score += r;
                reasons.Add($"final result {r}");
            }
            else
            {
                var probs = LocationProbabilities(content, state, p);
                double pw = WinProbability(probs);
                score += 100 * pw;
                reasons.Add($"win chance {Pct(pw)}%");
            }

            foreach (var l in state.Locations)
            {
                if (l.Lost) continue;
                var inf = Query.InfluenceAt(content, state, l.Index);
                int diff = inf[p] - inf[opp];
                score += 1.5 * Math.Max(-8, Math.Min(8, diff));
                if (diff > 7)
                {
                    score -= 0.6 * (diff - 7);
                    reasons.Add($"overcommitted at L{l.Index + 1}");
                }
                foreach (var t in l.Threats)
                {
                    var def = content.ThreatById[t.DefId];
                    var mine = Query.CharsAt(state, l.Index, p);
                    if (mine.Count == 0) continue;
                    switch (def.Effect)
                    {
                        case "blockEntry":
                            if (t.Target == p && mine.Any(c => c.Zone == Rules.ZoneGate)) score -= 2;
                            break;
                        case "zeroGateInfluence":
                            if (t.Target == null || t.Target == p) score -= 1.5 * mine.Count(c => c.Zone == Rules.ZoneGate);
                            break;
                        case "capacity":
                            score -= 1;
                            break;
                        case "mobDisplace":
                        {
                            var leader = Query.LeaderAt(content, state, l.Index);
                            score -= leader == p ? 5 : 1.5;
                            if (leader == p) reasons.Add($"Mob threatens my lead at L{l.Index + 1}");
                            break;
                        }
                        case "shipsAway":
                            if (mine.Any(c => c.Zone == Rules.ZoneGate && !c.Ready)) score -= 2;
                            break;
                        case "leaderBonus":
                            break;
                    }
                }
            }

            // Projected Established value and readiness.
            foreach (var c in Query.CharsOf(state, p))
            {
                var def = CharDef(content, c.DefId);
                if (c.Zone == Rules.ZoneInside)
                {
                    score += 0.6;
                    if (def.Established != null) score += (EstablishedValue.TryGetValue(def.Established.Effect.Type, out var v) ? v : 0.5) * Math.Min(remaining, 3) * 0.5;
                }
                else if (c.Zone == Rules.ZoneGate && c.Ready)
                {
                    score += 0.2;
                }
            }
            // CROWD: a full Gate means no new plays there; the opponent's full Gate is their problem.
            foreach (var l in state.Locations)
            {
                if (l.Lost) continue;
                if (Query.CharsAt(state, l.Index, p, Rules.ZoneGate).Count >= 2)
                {
                    score -= 1.5;
                    reasons.Add($"Gate full at L{l.Index + 1}");
                }
                if (Query.CharsAt(state, l.Index, opp, Rules.ZoneGate).Count >= 2) score += 1.0;
            }
            // Card economy.
            score += 0.25 * state.Players[p].Hand.Count;
            // HELD: a Character that cannot leave is a liability, more so at the Gates.
            foreach (var c in Query.CharsOf(state, p))
            {
                if (Query.LockReason(content, state, c) == null) continue;
                score -= c.Zone == Rules.ZoneGate ? 1.0 : 0.6;
                reasons.Add("held");
            }
            // Reparations potential.
            if (state.Players[p].Hand.Contains("reparations")) score += 0.4 * Math.Min(4, state.Players[p].Setbacks);
            return new Evaluation { Score = score, Reasons = reasons };
        }

        static string LabelPlan(ContentTable content, GameState state, TurnPlan plan)
        {
            var parts = new List<string>();
            if (plan.Plays.Count > 0) parts.Add("play " + string.Join(" + ", plan.Plays.Select(pl => $"{Setup.CardName(content, pl.CardId)}\u2192L{pl.Location + 1}")));
            else parts.Add("hold");
            if (plan.Enters.Count > 0) parts.Add("enter " + string.Join(",", plan.Enters.Select(u => CharDef(content, state.Characters[u].DefId).Short)));
            if (plan.Relocations.Count > 0) parts.Add("move " + string.Join(",", plan.Relocations.Select(r => $"{CharDef(content, state.Characters[r.Uid].DefId).Short}\u2192L{r.To + 1}")));
            if (plan.Confronts.Count > 0) parts.Add($"confront\u00d7{plan.Confronts.Count}");
            if (plan.StandOnBusiness == true) parts.Add("STAND");
            return string.Join(" \u00b7 ", parts);
        }

        static GameState Simulate(ContentTable content, GameState view, string p, TurnPlan plan)
        {
            var plans = new Dictionary<string, TurnPlan> { [Rules.PlayerA] = TurnPlan.Empty(), [Rules.PlayerB] = TurnPlan.Empty() };
            plans[p] = plan;
            return Resolve.ResolveTurn(content, view, plans).State;
        }

        sealed class Scored
        {
            public CharacterInstance C;
            public int F;
        }

        /// <summary>Decide confrontations heuristically (before the plan search).</summary>
        static List<Confront> DecideConfronts(ContentTable content, GameState view, string p, Func<double> rand, List<string> reasons, HashSet<string> busy)
        {
            var opts = Query.LegalOptionsFor(content, view, p);
            var confronts = new List<Confront>();
            var opp = Rules.Other(p);
            var order = new List<int>();
            var byLocation = new Dictionary<int, List<ConfrontOption>>();
            foreach (var o in opts.Confronts)
            {
                if (!byLocation.ContainsKey(o.Location)) { byLocation[o.Location] = new List<ConfrontOption>(); order.Add(o.Location); }
                byLocation[o.Location].Add(o);
            }

            foreach (var location in order)
            {
                var options = byLocation[location];
                var leader = Query.LeaderAt(content, view, location);
                var inf = Query.InfluenceAt(content, view, location);
                int lead = inf[p] - inf[opp];
                foreach (var o in options)
                {
                    var threat = view.Locations[location].Threats.First(t => t.Uid == o.ThreatUid);
                    var def = content.ThreatById[threat.DefId];
                    var available = o.Chars
                        .Where(u => !busy.Contains(u))
                        .Select(u => view.Characters[u])
                        .Select(c => new Scored { C = c, F = Query.ConfrontForce(content, view, c, threat) })
                        .OrderByDescending(x => x.F)
                        .ToList();
                    if (available.Count == 0) continue;
                    int total = available.Sum(x => x.F);

                    if (o.Assist)
                    {
                        // Helping the opponent clear their own Threat: only when it costs little.
                        bool spare = lead >= 3;
                        double chance = spare ? 0.6 : 0.15;
                        if (total >= threat.ForceRequired && rand() < chance)
                        {
                            int acc = 0;
                            foreach (var x in available)
                            {
                                if (acc >= threat.ForceRequired) break;
                                confronts.Add(new Confront { Uid = x.C.Uid, ThreatUid = threat.Uid });
                                busy.Add(x.C.Uid);
                                acc += x.F;
                            }
                            reasons.Add($"assists vs {def.Name} at L{location + 1}");
                        }
                        continue;
                    }

                    if (def.RequiresBoth == true)
                    {
                        // Comfortable Complicity: the beneficiary usually leaves it alone.
                        bool benefits = leader == p;
                        if (!benefits || rand() < 0.25)
                        {
                            var x = available[available.Count - 1];
                            confronts.Add(new Confront { Uid = x.C.Uid, ThreatUid = threat.Uid });
                            busy.Add(x.C.Uid);
                            reasons.Add($"contributes vs {def.Name} at L{location + 1}");
                        }
                        continue;
                    }

                    int harmsMe =
                        def.Effect == "mobDisplace" ? (leader == p ? 3 : 1)
                        : def.Effect == "shipsAway" ? (Query.CharsAt(view, threat.Location, p, Rules.ZoneGate).Any(c => !c.Ready) ? 2 : 1)
                        : def.Effect == "capacity" ? 1
                        : def.Effect == "blockEntry" ? 2
                        : def.Effect == "zeroGateInfluence" ? 2
                        : 1;
                    bool canAlone = total >= threat.ForceRequired;
                    bool worthTrying = !def.Split && total >= threat.ForceRequired / 2.0 && harmsMe >= 2;
                    if (canAlone || worthTrying)
                    {
                        int acc = 0;
                        foreach (var x in available)
                        {
                            if (acc >= threat.ForceRequired) break;
                            confronts.Add(new Confront { Uid = x.C.Uid, ThreatUid = threat.Uid });
                            busy.Add(x.C.Uid);
                            acc += x.F;
                        }
                        reasons.Add($"{(canAlone ? "clears" : "pushes on")} {def.Name} at L{location + 1}");
                    }
                }
            }
            return confronts;
        }

        static List<PlayAction> PlayVariants(ContentTable content, GameState view, string p)
        {
            var opts = Query.LegalOptionsFor(content, view, p);
            var outList = new List<PlayAction>();
            foreach (var o in opts.Plays)
            {
                foreach (var location in o.Locations)
                {
                    if (o.NeedsTarget == "friendlyCharAndLocation")
                    {
                        var gateChars = Query.CharsOf(view, p).Where(c => !(CharDef(content, c.DefId).Keywords.Contains("INFORMANT") && c.Amnestied != true)).ToList();
                        bool added = false;
                        foreach (var c in gateChars)
                        {
                            foreach (var dest in view.Locations)
                            {
                                if (dest.Index == c.Location || dest.Lost) continue;
                                int gate = Query.CharsAt(view, dest.Index, p, Rules.ZoneGate).Count;
                                if (gate >= 2 && !Query.InsideOpen(content, view, dest.Index, p)) continue;
                                outList.Add(new PlayAction { CardId = o.CardId, Location = location, Target = new PlayTarget { CharUid = c.Uid, Location = dest.Index } });
                                added = true;
                            }
                        }
                        if (!added) outList.Add(new PlayAction { CardId = o.CardId, Location = location });
                    }
                    else if (o.NeedsTarget == "friendlyInsideChar")
                    {
                        var insideChars = Query.CharsOf(view, p).Where(c => c.Zone == Rules.ZoneInside && c.Location != location).ToList();
                        foreach (var c in insideChars) outList.Add(new PlayAction { CardId = o.CardId, Location = location, Target = new PlayTarget { CharUid = c.Uid } });
                        if (insideChars.Count == 0) outList.Add(new PlayAction { CardId = o.CardId, Location = location });
                    }
                    else
                    {
                        outList.Add(new PlayAction { CardId = o.CardId, Location = location });
                        if (o.DirectEntry) outList.Add(new PlayAction { CardId = o.CardId, Location = location, Enter = true });
                    }
                }
            }
            return outList;
        }

        static int ForceOf(ContentTable content, GameState view, int location, string owner) => Query.CharsAt(view, location, owner).Sum(c => CharDef(content, c.DefId).Force);

        /// <summary>Would Harborlight propose a Summon this turn, and where? null for no.</summary>
        public static int? AiSummonProposal(ContentTable content, GameState view, string p)
        {
            var opts = Query.LegalOptionsFor(content, view, p);
            var rng = Rng.Make(Rng.HashSeed($"{view.Seed}:{view.Turn}:{p}:summon"));
            foreach (var i in opts.Summonable)
            {
                var loc = view.Locations[i];
                bool dangerous = loc.Threats.Any(t => content.ThreatById[t.DefId].LostAfterTurns != null);
                int myForce = ForceOf(content, view, i, p);
                int theirForce = ForceOf(content, view, i, Rules.Other(p));
                if (myForce < 1 || theirForce < 1) continue;
                if (dangerous || (myForce + theirForce >= 6 && Rng.NextFloat(rng) < 0.35)) return i;
            }
            return null;
        }

        /// <summary>Should Harborlight accept a proposed Summon?</summary>
        public static bool AiAcceptSummon(ContentTable content, GameState view, string p, int location)
        {
            var opts = Query.LegalOptionsFor(content, view, p);
            if (!opts.Summonable.Contains(location)) return false;
            var loc = view.Locations[location];
            var rng = Rng.Make(Rng.HashSeed($"{view.Seed}:{view.Turn}:{p}:accept:{location}"));
            bool dangerous = loc.Threats.Any(t => content.ThreatById[t.DefId].LostAfterTurns != null);
            int myForce = ForceOf(content, view, location, p);
            int theirForce = ForceOf(content, view, location, Rules.Other(p));
            if (myForce + theirForce < 6) return Rng.NextFloat(rng) < 0.15; // long shot, rarely
            if (dangerous) return true;
            return Rng.NextFloat(rng) < 0.6;
        }

        static TurnPlan MakePlan(List<PlayAction> plays, List<string> enters, List<Relocation> relocations, List<Confront> confronts)
            => new TurnPlan { Plays = plays, Enters = enters, Relocations = relocations, Confronts = confronts };

        /// <summary>Fits: Gate slots per Location, every Character takes one; Events have their own slot, one per Location.</summary>
        static bool Fits(ContentTable content, GameState view, string p, List<PlayAction> set)
        {
            var chars = new Dictionary<int, int>();
            var planted = new Dictionary<int, int>();
            var evs = new Dictionary<int, int>();
            void Bump(Dictionary<int, int> d, int k) => d[k] = (d.TryGetValue(k, out var n) ? n : 0) + 1;
            int Get(Dictionary<int, int> d, int k) => d.TryGetValue(k, out var n) ? n : 0;
            foreach (var x in set)
            {
                if (!IsCharacter(content, x.CardId)) Bump(evs, x.Location);
                else if (CharDef(content, x.CardId).Keywords.Contains("INFORMANT")) Bump(planted, x.Location);
                else Bump(chars, x.Location);
            }
            foreach (var x in set)
            {
                if (Get(chars, x.Location) > Query.GateRoom(view, x.Location, p)) return false;
                if (Get(planted, x.Location) > Query.GateRoom(view, x.Location, Rules.Other(p))) return false;
                if (Get(evs, x.Location) > 1) return false;
            }
            return true;
        }

        public static AiDecision PlanTurn(ContentTable content, GameState view, string p, AiTuning tuning = null, int? agreedSummon = null)
        {
            tuning ??= AiTuning.Default;
            var watch = Stopwatch.StartNew();
            var rng = Rng.Make(Rng.HashSeed($"{view.Seed}:{view.Turn}:{p}:ai"));
            double Rand() => Rng.NextFloat(rng);
            var globalReasons = new List<string>();
            var busy = new HashSet<string>();
            var confronts = DecideConfronts(content, view, p, Rand, globalReasons, busy);
            var opts = Query.LegalOptionsFor(content, view, p);
            bool summonAgreed = agreedSummon != null && opts.Summonable.Contains(agreedSummon.Value);
            if (summonAgreed)
            {
                foreach (var c in Query.CharsOf(view, p)) if (c.Location == agreedSummon.Value) busy.Add(c.Uid);
                globalReasons.Add($"joins the Summon at L{agreedSummon.Value + 1}");
            }

            var readyUids = opts.Enters.Where(u => !busy.Contains(u)).ToList();
            var enterVariants = new List<List<string>> { new List<string>() };
            if (readyUids.Count > 0) enterVariants.Add(readyUids);
            if (readyUids.Count > 1) foreach (var u in readyUids) enterVariants.Add(new List<string> { u });

            var relocVariants = new List<List<Relocation>> { new List<Relocation>() };
            foreach (var r in opts.Relocations)
            {
                if (busy.Contains(r.Uid)) continue;
                foreach (var to in r.Destinations) relocVariants.Add(new List<Relocation> { new Relocation { Uid = r.Uid, To = to } });
            }

            var plays = PlayVariants(content, view, p);
            var hiddenBonus = new Dictionary<int, double>();
            foreach (var l in view.Locations)
            {
                if (l.Revealed) continue;
                double bonus = Query.CharsAt(view, l.Index, p).Count == 0 ? 0.8 : 0;
                if (view.Players[p].KnownNextReveal == l.Index) bonus += 0.5;
                bonus += (Rand() - 0.5) * 1.5; // gamble noise: no hidden knowledge
                hiddenBonus[l.Index] = bonus;
            }

            AiCandidate ScoreOf(TurnPlan plan)
            {
                var next = Simulate(content, view, p, plan);
                var ev = Evaluate(content, next, p);
                double score = ev.Score;
                var reasons = new List<string>(ev.Reasons);
                foreach (var pl in plan.Plays)
                {
                    if (!IsCharacter(content, pl.CardId) || CharDef(content, pl.CardId).Keywords.Contains("INFORMANT")) continue;
                    if (hiddenBonus.TryGetValue(pl.Location, out var hb))
                    {
                        score += hb;
                        reasons.Add("hidden gamble");
                    }
                }
                // Harriet's rescue: pulling a held Character out is worth more than the plain move the simulation sees.
                foreach (var pl in plan.Plays)
                {
                    if (!IsCharacter(content, pl.CardId)) continue;
                    var def = CharDef(content, pl.CardId);
                    if (def.Reveal?.Effect?.Type != "conductor" || pl.Target?.CharUid == null) continue;
                    if (view.Characters.TryGetValue(pl.Target.CharUid, out var t) && Query.LockReason(content, view, t) != null)
                    {
                        score += 1.5;
                        reasons.Add("rescue");
                    }
                }
                int spent = Query.PlanCost(content, plan, view, p);
                double cheapestLeft = double.PositiveInfinity;
                foreach (var o in opts.Plays)
                {
                    if (plan.Plays.Any(pl => pl.CardId == o.CardId)) continue;
                    cheapestLeft = Math.Min(cheapestLeft, Query.CardCost(content, o.CardId, view, p));
                }
                if (opts.Energy - spent >= cheapestLeft)
                {
                    score -= 1.2 * (opts.Energy - spent);
                    reasons.Add("unspent Energy");
                }
                return new AiCandidate { Label = LabelPlan(content, view, plan), Plan = plan, Score = score, Reasons = reasons };
            }

            // Stage 1: single plays with the default "enter everything" posture.
            var defaultEnters = enterVariants[enterVariants.Count > 1 ? 1 : 0];
            var affordable = plays.Where(play => Query.CardCost(content, play.CardId, view, p) <= opts.Energy).ToList();
            var singles = affordable.Select(play => ScoreOf(MakePlan(new List<PlayAction> { play }, defaultEnters, new List<Relocation>(), confronts))).ToList();
            singles = singles.OrderByDescending(c => c.Score).ToList();
            var playSets = new List<List<PlayAction>> { new List<PlayAction>() };
            playSets.AddRange(singles.Take(6).Select(c => c.Plan.Plays));
            {
                var top = singles.Take(7).Select(c => c.Plan.Plays[0]).ToList();
                for (int i = 0; i < top.Count; i++)
                {
                    for (int j = i + 1; j < top.Count; j++)
                    {
                        var a = top[i];
                        var b = top[j];
                        if (a.CardId == b.CardId) continue;
                        if (Query.CardCost(content, a.CardId, view, p) + Query.CardCost(content, b.CardId, view, p) > opts.Energy) continue;
                        if (!Fits(content, view, p, new List<PlayAction> { a, b })) continue;
                        playSets.Add(new List<PlayAction> { a, b });
                        // A third card when Energy allows and Gates are open for it (drawn from the strongest singles only).
                        if (opts.Energy < 3) continue;
                        for (int k = j + 1; k < Math.Min(top.Count, 5); k++)
                        {
                            var c = top[k];
                            if (c.CardId == a.CardId || c.CardId == b.CardId) continue;
                            if (Query.CardCost(content, a.CardId, view, p) + Query.CardCost(content, b.CardId, view, p) + Query.CardCost(content, c.CardId, view, p) > opts.Energy) continue;
                            if (!Fits(content, view, p, new List<PlayAction> { a, b, c })) continue;
                            playSets.Add(new List<PlayAction> { a, b, c });
                        }
                    }
                }
            }
            var stage1 = playSets.Select(ps => ScoreOf(MakePlan(ps, defaultEnters, new List<Relocation>(), confronts))).OrderByDescending(c => c.Score).ToList();
            var topPlays = stage1.Take(5).Select(c => c.Plan.Plays).ToList();

            // Stage 2: cross top play sets with enter/relocation variants.
            var candidates = new List<AiCandidate>();
            foreach (var ps in topPlays)
            {
                foreach (var enters in enterVariants)
                {
                    foreach (var relocations in relocVariants)
                    {
                        if (relocations.Any(r => enters.Contains(r.Uid))) continue;
                        candidates.Add(ScoreOf(MakePlan(ps, enters, relocations, confronts)));
                    }
                }
            }
            candidates = candidates.OrderByDescending(c => c.Score).ToList();
            var best = candidates[0];

            // Controlled imperfection: 70% best, 20% sensible alternative, 10% imperfect-but-legal.
            double roll = Rand();
            string tier = "best";
            var chosen = best;
            var sensible = candidates.Skip(1).Take(3).Where(c => c.Score >= best.Score - 12).ToList();
            var imperfect = candidates.Skip(1).Where(c => c.Score >= best.Score - 35).ToList();
            if (roll > tuning.BestPick && roll <= tuning.BestPick + tuning.SensiblePick && sensible.Count > 0)
            {
                tier = "sensible";
                chosen = sensible[(int)Math.Floor(Rand() * sensible.Count)];
            }
            else if (roll > tuning.BestPick + tuning.SensiblePick && imperfect.Count > 0)
            {
                tier = "imperfect";
                chosen = imperfect[(int)Math.Floor(Rand() * imperfect.Count)];
            }

            // Stand on Business.
            double winEstimate = EstimateWinChance(content, view, p);
            string standDecision = "no";
            bool standOnBusiness = false;
            // Standing is a confident call: from Turn 5 on a clear lead; earlier, when it moves the Legacy x3 or x4 both
            // ways, only from an overwhelming one.
            int earliest = winEstimate >= tuning.StrongStandThreshold + 0.1 ? 3 : 5;
            if (opts.CanStand && view.Turn >= earliest)
            {
                if (winEstimate >= tuning.StrongStandThreshold)
                {
                    standOnBusiness = true;
                    standDecision = $"stands (strong, {Pct(winEstimate)}%)";
                }
                else if (winEstimate >= tuning.StandThreshold && Rand() < 0.5)
                {
                    standOnBusiness = true;
                    standDecision = $"stands (confident, {Pct(winEstimate)}%)";
                }
                else if (winEstimate > 0.42 && winEstimate < 0.58 && Rand() < tuning.BluffRate)
                {
                    standOnBusiness = true;
                    standDecision = $"BLUFF ({Pct(winEstimate)}%)";
                }
                else
                {
                    standDecision = $"holds ({Pct(winEstimate)}%)";
                }
            }

            // The opponent Stood on Business: this is the one cheap turn to Sit Down. Stay when the board is worth playing.
            bool stepOff = false;
            bool raisedOnMe = view.PendingRaises.Any(r => r.By != p);
            if (raisedOnMe && opts.CanStepOff && view.Turn < view.MaxTurns)
            {
                // An early Stand moves more: staying at x3 or x4 the price wants a better board.
                double ratio = (double)opts.PendingStakes / Math.Max(1, opts.StepOffCost);
                double need = tuning.ContinueThreshold + (ratio >= 4 ? 0.08 : ratio >= 3 ? 0.04 : 0);
                if (winEstimate < need)
                {
                    stepOff = true;
                    standDecision = $"steps off ({Pct(winEstimate)}%, pays {opts.StepOffCost})";
                }
                else
                {
                    standDecision += $" \u00b7 stays at {opts.PendingStakes}";
                }
            }

            var plan = new TurnPlan
            {
                Plays = chosen.Plan.Plays,
                Enters = chosen.Plan.Enters,
                Relocations = chosen.Plan.Relocations,
                Confronts = chosen.Plan.Confronts,
                StandOnBusiness = standOnBusiness,
                StepOff = stepOff,
                Summon = summonAgreed ? new SummonCommit { Location = agreedSummon.Value } : null,
            };
            var primary = globalReasons.Concat(chosen.Reasons).Take(3).ToList();
            var debug = new AiDebug
            {
                Turn = view.Turn,
                Player = p,
                Considered = candidates.Take(12).ToList(),
                Chosen = LabelPlan(content, view, plan),
                PrimaryReason = primary.Count > 0 ? string.Join("; ", primary) : "best available board",
                Tier = tier,
                WinEstimate = winEstimate,
                StandDecision = standDecision,
                ElapsedMs = watch.ElapsedMilliseconds,
            };
            return new AiDecision { Plan = plan, Debug = debug };
        }
    }
}
