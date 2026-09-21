using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    /// <summary>
    /// Deterministic simultaneous-turn resolution, a port of src/engine/resolve.ts. The helpers, the Reveal abilities,
    /// the Events and the match's end live here; ResolveTurn itself is in ResolveTurn.cs (the same partial class).
    /// Two JavaScript semantics are kept on purpose: sorts are stable (LINQ OrderBy, never List.Sort) and a removed
    /// Character leaves the dictionary in its original order (RemoveCharacter rebuilds it), because the web engine's
    /// tie-breaks depend on both.
    /// </summary>
    public static partial class Resolve
    {
        // ---------- small helpers ----------

        public static GameState CloneState(GameState s) => s.Clone();

        /// <summary>An event data object; a null value is left out, as JSON.stringify leaves out undefined.</summary>
        internal static JObject D(params object[] kv)
        {
            var o = new JObject();
            for (int i = 0; i + 1 < kv.Length; i += 2)
            {
                var v = kv[i + 1];
                if (v == null) continue;
                o[(string)kv[i]] = v is JToken jt ? jt : JToken.FromObject(v);
            }
            return o;
        }

        internal static GameEvent Ev(string type, string text, string player = null, int? location = null, string uid = null, string cardId = null, string privateTo = null, JObject data = null)
        {
            return new GameEvent { Type = type, Text = text, Player = player, Location = location, Uid = uid, CardId = cardId, PrivateTo = privateTo, Data = data };
        }

        static CharacterDef CharDef(ContentTable content, string id) => Query.CharDef(content, id);

        static string Name(ContentTable content, GameState state, CharacterInstance c) => $"{CharDef(content, c.DefId).Name} ({state.Players[c.Owner].Handle})";

        public static string ThreatName(ContentTable content, GameState state, ThreatInstance t)
        {
            var def = content.ThreatById[t.DefId];
            return t.Target != null ? $"{def.Name} (hunting {state.Players[t.Target].Handle})" : def.Name;
        }

        static string LocName(ContentTable content, GameState state, int index) => Setup.LocName(content, state, index);

        static void Setback(GameState state, string p, string reason, List<GameEvent> events)
        {
            state.Players[p].Setbacks += 1;
            events.Add(Ev("setback", $"Setback for {state.Players[p].Handle}: {reason}.", player: p));
        }

        /// <summary>Delete a Character, keeping the others in their order (a JavaScript object keeps insertion order across deletes).</summary>
        internal static void RemoveCharacter(GameState state, string uid)
        {
            if (!state.Characters.ContainsKey(uid)) return;
            var next = new Dictionary<string, CharacterInstance>();
            foreach (var kv in state.Characters) if (kv.Key != uid) next[kv.Key] = kv.Value;
            state.Characters = next;
        }

        static List<CharacterInstance> ByInfluenceDesc(ContentTable content, GameState state, IEnumerable<CharacterInstance> xs) => xs.OrderByDescending(x => Query.CharInfluence(content, state, x)).ToList();
        static List<CharacterInstance> ByInfluenceAsc(ContentTable content, GameState state, IEnumerable<CharacterInstance> xs) => xs.OrderBy(x => Query.CharInfluence(content, state, x)).ToList();

        static bool IsProtected(ContentTable content, GameState state, CharacterInstance c)
        {
            if (Query.SwornAt(content, state, c.Owner, c.Location)) return true;
            if (state.Players[c.Owner].DefendedTurn == state.Turn) return true;
            if (c.ProtectedTurn == state.Turn) return true;
            var loc = state.Locations[c.Location];
            if (loc.Revealed && content.LocationById.TryGetValue(loc.DefId, out var ld) && ld.Effect?.Type == "noDisplace") return true;
            if (Query.HasEstablished(content, state, c.Owner, c.Location, "noDisplaceHere").Count > 0) return true;
            if (Query.HasEstablished(content, state, c.Owner, c.Location, "sanctuary").Count > 0) return true;
            if (c.RelocatedTurn == state.Turn && Query.HasEstablishedAnywhere(content, state, c.Owner, "relocatedNoDisplace").Count > 0) return true;
            return false;
        }

        /// <summary>Nanny of the Maroons: opposing Reveal abilities cannot single out your Characters here.</summary>
        static bool Shielded(ContentTable content, GameState state, CharacterInstance c)
        {
            return Query.HasEstablished(content, state, c.Owner, c.Location, "shieldHere").Count > 0 || Query.SwornAt(content, state, c.Owner, c.Location);
        }

        /// <summary>Nehanda: a Character that rises again leaves the board for the hand instead of being displaced, and costs 0 next time.</summary>
        static bool RiseAgain(ContentTable content, GameState state, CharacterInstance c, string reason, List<GameEvent> events)
        {
            var def = CharDef(content, c.DefId);
            if (def.Passive?.RisesAgain != true) return false;
            var ps = state.Players[c.Owner];
            RemoveCharacter(state, c.Uid);
            if (ps.Hand.Count >= Rules.MaxHand)
            {
                ps.Discard.Add(def.Id);
                events.Add(Ev("info", $"{Name(content, state, c)} would rise again, but {ps.Handle}'s hand is full: she is discarded ({reason}).", uid: c.Uid, player: c.Owner, location: c.Location));
                return true;
            }
            ps.Hand.Add(def.Id);
            ps.Discounts ??= new Dictionary<string, int>();
            ps.Discounts[def.Id] = def.Cost;
            events.Add(Ev("moved", $"{Name(content, state, c)} rises again: instead of being displaced ({reason}) she returns to {ps.Handle}'s hand and costs 0 the next time.", uid: c.Uid, player: c.Owner, location: c.Location, data: D("from", c.Location, "to", -1, "reason", "risesAgain")));
            return true;
        }

        public static bool IsInformant(ContentTable content, CharacterInstance c) => CharDef(content, c.DefId).Keywords.Contains("INFORMANT") && c.Amnestied != true;

        /// <summary>Mark a Gate Character Ready, unless it is an Informant (they wait forever).</summary>
        static void ReadyUp(ContentTable content, CharacterInstance c)
        {
            if (!IsInformant(content, c)) c.Ready = true;
        }

        sealed class ClashActor
        {
            public string Kind;
            public string Id;
            public string Owner;
            public int? Force;
            public JObject ToJson() => D("kind", Kind, "id", Id, "owner", Owner, "force", Force);
        }

        static ClashActor Actor(string kind, string id, string owner = null, int? force = null) => new ClashActor { Kind = kind, Id = id, Owner = owner, Force = force };

        /// <summary>Anansi's trick: the opposing Ready Gate Character here with the highest Influence waits again.</summary>
        static bool TrickGate(ContentTable content, GameState state, List<GameEvent> events, string p, int loc, CharacterDef def)
        {
            var opp = Rules.Other(p);
            var targets = Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && x.Ready && !Shielded(content, state, x));
            var target = ByInfluenceDesc(content, state, targets).FirstOrDefault();
            if (target == null || IsProtected(content, state, target)) return false;
            target.Ready = false;
            target.ArrivedTurn = state.Turn;
            events.Add(Ev("reveal", $"{def.Name} tricks {CharDef(content, target.DefId).Name} into waiting again.", player: p, location: loc, uid: target.Uid));
            Clash(content, state, events, Actor("character", def.Id, p, def.Force), target, "tricked", loc, note: "They were Ready; now they are Waiting and wait a turn before they can enter.");
            return true;
        }

        /// <summary>A once-only team-up fires for whoever assembled it first.</summary>
        static void ApplyTeamUpOnce(ContentTable content, GameState state, TeamUpDef tu, string p, int loc, List<GameEvent> events)
        {
            var eff = tu.Effect;
            var ps = state.Players[p];
            var here = state.Locations[loc];
            switch (eff.Type)
            {
                case "breakThreatsHere":
                    foreach (var t in here.Threats) events.Add(Ev("threatNeutralized", $"{ThreatName(content, state, t)} at {LocName(content, state, loc)} is broken at {tu.Name}.", location: loc, data: D("by", p, "threatUid", t.Uid, "defId", t.DefId, "target", t.Target)));
                    here.Threats = new List<ThreatInstance>();
                    break;
                case "energyNext":
                    ps.EnergyNextTurn = (ps.EnergyNextTurn ?? 0) + eff.Int("amount");
                    break;
                case "foundOutEverywhere":
                    foreach (var spy in state.Characters.Values.ToList())
                    {
                        if (spy.Owner != p || !IsInformant(content, spy) || spy.PlantedBy == null) continue;
                        var home = state.Players[spy.PlantedBy];
                        var sdef = CharDef(content, spy.DefId);
                        RemoveCharacter(state, spy.Uid);
                        if (home.Hand.Count < Rules.MaxHand) home.Hand.Add(sdef.Id);
                        else home.Discard.Add(sdef.Id);
                        events.Add(Ev("moved", $"{tu.Name}: {sdef.Name} is found out at {LocName(content, state, spy.Location)} and sent back to {home.Handle}.", uid: spy.Uid, location: spy.Location, player: spy.PlantedBy, data: D("from", spy.Location, "to", -1, "reason", "exposed")));
                    }
                    break;
                case "permInfluenceEverywhere":
                    foreach (var l in state.Locations)
                    {
                        l.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                        l.PermInfluence[p] += eff.Int("amount");
                    }
                    break;
                case "weakenThreatsHere":
                    foreach (var t in here.Threats) t.ForceRequired = Math.Max(1, t.ForceRequired - eff.Int("amount"));
                    break;
                case "permInfluenceOthersHere":
                    foreach (var c in Query.CharsAt(state, loc, p)) if (!tu.Members.Contains(c.DefId) && !IsInformant(content, c)) c.PermInfluence += eff.Int("amount");
                    break;
                case "draw":
                    for (int i = 0; i < eff.Int("count"); i++) Setup.DrawCard(content, state, p, events);
                    break;
                default:
                    break;
            }
        }

        static void Clash(ContentTable content, GameState state, List<GameEvent> events, ClashActor actor, CharacterInstance victim, string outcome, int location, int? theirForce = null, int? from = null, int? to = null, string note = null, string intent = null)
        {
            var vdef = CharDef(content, victim.DefId);
            bool alive = state.Characters.ContainsKey(victim.Uid);
            var o = outcome == "displaced" && !alive ? "rose" : outcome;
            string who;
            if (actor.Kind == "character") who = CharDef(content, actor.Id).Name;
            else if (actor.Kind == "threat") who = content.ThreatById.TryGetValue(actor.Id, out var td) ? td.Name : actor.Id;
            else if (actor.Kind == "location") who = content.LocationById.TryGetValue(actor.Id, out var ld) ? ld.Name : actor.Id;
            else who = content.EventById[actor.Id].Name;
            var vs = actor.Force != null && theirForce != null ? $" ({actor.Force} Force against {theirForce})" : "";
            string verb;
            switch (o)
            {
                case "displaced": verb = $"beats {vdef.Name}{vs} and knocks them away to the Gates of {(to != null ? LocName(content, state, to.Value) : "another Location")}"; break;
                case "held": verb = $"is held off by {vdef.Name}{vs}: nothing moves"; break;
                case "blocked": verb = $"blocks {vdef.Name}: they cannot go Inside this turn"; break;
                case "sentBack": verb = $"beats {vdef.Name}{vs}: they lose their seat Inside and wait at the Gates again, Waiting"; break;
                case "suppressed": verb = $"silences {vdef.Name}: no Influence and no abilities until the end of next turn"; break;
                case "tricked": verb = $"tricks {vdef.Name}: they were Ready to go Inside, now they wait another turn"; break;
                case "hexed": verb = $"hexes {vdef.Name}: −{theirForce ?? 2} Influence for the rest of the match"; break;
                case "defected": verb = $"turns {vdef.Name}: they change sides"; break;
                case "exposed": verb = $"finds {vdef.Name} out: back to the hand of whoever planted them"; break;
                case "arrested": verb = $"arrests {vdef.Name}: off the board for good"; break;
                case "perished": verb = $"takes {vdef.Name}: they did not survive the crossing and leave the match"; break;
                case "amnestied": verb = $"hears {vdef.Name} out in full and grants amnesty: they stay at these Gates, Waiting, as {state.Players[victim.Owner].Handle}'s own Character from now on"; break;
                default: verb = $"beats {vdef.Name}{vs} and knocks them off the board. {vdef.Name}'s own power: instead of landing at another Location, they go back to {state.Players[victim.Owner].Handle}'s hand and cost nothing the next time they are played"; break;
            }
            var data = D(
                "actor", actor.ToJson(),
                "victim", D("uid", victim.Uid, "defId", victim.DefId, "owner", victim.Owner, "force", vdef.Force),
                "outcome", o,
                "from", from ?? location,
                "to", to,
                "theirForce", theirForce,
                "note", note,
                "intent", intent);
            events.Add(Ev("clash", $"{who} {verb}.", location: location, uid: victim.Uid, player: actor.Owner, data: data));
        }

        /// <summary>Move a Character to another Location's Gate (a random open one). False if nowhere to go.</summary>
        static bool Displace(ContentTable content, GameState state, CharacterInstance c, string reason, List<GameEvent> events, int? to = null)
        {
            if (RiseAgain(content, state, c, reason, events)) return true;
            var options = state.Locations.Where(l => l.Index != c.Location && !l.Lost && Query.GateOpen(state, l.Index, c.Owner)).Select(l => l.Index).ToList();
            if (options.Count == 0)
            {
                events.Add(Ev("info", $"{Name(content, state, c)} could not be displaced: no open Gate.", uid: c.Uid));
                return false;
            }
            int dest = to != null && options.Contains(to.Value) ? to.Value : Rng.Pick(state.Rng, options);
            int from = c.Location;
            c.Location = dest;
            c.Zone = Rules.ZoneGate;
            c.Ready = false;
            c.ArrivedTurn = state.Turn;
            c.BlessedUid = null;
            events.Add(Ev("moved", $"{Name(content, state, c)} is displaced from {LocName(content, state, from)} to the Gates of {LocName(content, state, dest)} ({reason}).", uid: c.Uid, location: dest, data: D("from", from, "to", dest, "reason", reason)));
            return true;
        }

        static bool EnterInside(ContentTable content, GameState state, CharacterInstance c, List<GameEvent> events, string how = "enters")
        {
            if (IsInformant(content, c)) return false;
            if (!Query.InsideOpen(content, state, c.Location, c.Owner)) return false;
            c.Zone = Rules.ZoneInside;
            foreach (var pulpit in Query.HasEstablished(content, state, c.Owner, c.Location, "drawOnEnterHere"))
            {
                if (pulpit.Uid == c.Uid) continue;
                Setup.DrawCard(content, state, c.Owner, events);
                events.Add(Ev("info", $"{CharDef(content, pulpit.DefId).Name}: the congregation grows; {state.Players[c.Owner].Handle} draws a card.", uid: pulpit.Uid, player: c.Owner, location: c.Location));
            }
            c.Ready = false;
            c.ArrivedTurn = state.Turn;
            events.Add(Ev("entered", $"{Name(content, state, c)} {how} {LocName(content, state, c.Location)}.", uid: c.Uid, location: c.Location, player: c.Owner));
            // Enter effect: Mansa Musa blesses the next Character established here.
            foreach (var m in Query.HasEstablished(content, state, c.Owner, c.Location, "blessNextEstablished"))
            {
                if (m.Uid != c.Uid && string.IsNullOrEmpty(m.BlessedUid))
                {
                    m.BlessedUid = c.Uid;
                    events.Add(Ev("info", $"{CharDef(content, m.DefId).Name} grants +1 Influence to {CharDef(content, c.DefId).Name}.", uid: c.Uid));
                    break;
                }
            }
            return true;
        }

        /// <summary>A Gathering arrives on its own. Null when there is no room.</summary>
        static CharacterInstance SpawnGathering(ContentTable content, GameState state, string p, CharacterDef def, int location, List<GameEvent> events, string prefer = "inside")
        {
            var ps = state.Players[p];
            if (ps.Spawned.Contains(def.Id)) return null;
            var loc = state.Locations[location];
            if (loc.Lost) return null;
            bool canInside = prefer == "inside" && Query.InsideOpen(content, state, location, p) && Query.IsBlockedFromEntering(content, state, new CharacterInstance { Owner = p, Location = location }) == null;
            bool canGate = Query.GateOpen(state, location, p);
            if (!canInside && !canGate) return null;
            var zone = canInside ? Rules.ZoneInside : Rules.ZoneGate;
            var c = new CharacterInstance
            {
                Uid = $"c{state.NextUid++}",
                DefId = def.Id,
                Owner = p,
                Location = location,
                Zone = zone,
                Ready = true,
                ArrivedTurn = state.Turn,
                PermInfluence = 0,
                TempInfluence = 0,
                WasHiddenAtCommit = false,
            };
            state.Characters[c.Uid] = c;
            ps.Spawned.Add(def.Id);
            var where = zone == Rules.ZoneInside ? "Inside" : "at the Gates of";
            var text = $"{def.Name} arrives {where} {LocName(content, state, location)} for {ps.Handle}. {def.Spawn?.Headline ?? ""}".Trim();
            events.Add(Ev("spawned", text, player: p, cardId: def.Id, uid: c.Uid, location: location, data: D("zone", zone)));
            return c;
        }

        /// <summary>Gatherings whose condition is met arrive now. Called after reveals and at cleanup.</summary>
        static void CheckGatherings(ContentTable content, GameState state, List<GameEvent> events, string trigger, int? revealedIndex = null)
        {
            bool Rolled(string id, SpawnRule rule) => rule.Chance == null || (state.SpawnRolls != null && state.SpawnRolls.TryGetValue(id, out var r) && r);
            foreach (var def in content.Characters.Where(c => c.Spawn != null))
            {
                var rule = def.Spawn;
                if (!Rolled(def.Id, rule)) continue;
                foreach (var p in Rules.Players)
                {
                    if (rule.Type == "onReveal" && trigger == "reveal" && revealedIndex != null && state.Locations[revealedIndex.Value].DefId == rule.LocationId)
                    {
                        SpawnGathering(content, state, p, def, revealedIndex.Value, events, "gate");
                    }
                }
                if (rule.Type == "establishedAt" && trigger == "cleanup")
                {
                    var loc = state.Locations.FirstOrDefault(l => l.Revealed && l.DefId == rule.LocationId);
                    if (loc == null) continue;
                    if (rule.Unique == true && Rules.Players.Any(q => state.Players[q].Spawned.Contains(def.Id))) continue;
                    var earned = Rules.Players.Where(q => Query.CharsAt(state, loc.Index, q, Rules.ZoneInside).Count(c => CharDef(content, c.DefId).Category != "gathering") >= (rule.Count ?? 0)).ToList();
                    foreach (var q in earned) SpawnGathering(content, state, q, def, loc.Index, events);
                }
                if (rule.Type == "setAt" && trigger == "cleanup")
                {
                    var loc = state.Locations.FirstOrDefault(l => l.Revealed && l.DefId == rule.LocationId);
                    if (loc == null) continue;
                    foreach (var q in Rules.Players)
                    {
                        var here = Query.CharsAt(state, loc.Index, q, Rules.ZoneInside).Select(c => c.DefId).ToList();
                        if (rule.CardIds.All(id => here.Contains(id))) SpawnGathering(content, state, q, def, loc.Index, events);
                    }
                }
            }
            // Cards that come to the hand rather than the board.
            if (trigger == "cleanup")
            {
                foreach (var def in content.Events)
                {
                    var rule = def.Spawn;
                    if (rule == null || rule.Type != "insideAt" || !Rolled(def.Id, rule)) continue;
                    var loc = state.Locations.FirstOrDefault(l => l.Revealed && l.DefId == rule.LocationId);
                    if (loc == null) continue;
                    foreach (var q in Rules.Players)
                    {
                        var ps = state.Players[q];
                        if (ps.Spawned.Contains(def.Id)) continue;
                        if (Query.CharsAt(state, loc.Index, q, Rules.ZoneInside).Count < (rule.Count ?? 0)) continue;
                        ps.Spawned.Add(def.Id);
                        ps.Hand.Add(def.Id);
                        events.Add(Ev("spawned", $"{def.Name} come to {ps.Handle}. {rule.Headline}", player: q, cardId: def.Id, location: loc.Index, privateTo: q, data: D("zone", "hand")));
                    }
                }
            }
        }

        static void RevealLocation(ContentTable content, GameState state, int index, List<GameEvent> events)
        {
            var loc = state.Locations[index];
            if (loc.Revealed) return;
            loc.Revealed = true;
            loc.RevealedTurn = state.Turn;
            content.LocationById.TryGetValue(loc.DefId, out var def);
            events.Add(Ev("locationRevealed", $"Location {index + 1} is revealed: {def?.Name ?? "Unknown"}.", location: index, data: D("defId", loc.DefId)));
            if (def == null) return;
            if (def.SpawnOnReveal != null) Setup.SpawnThreat(content, state, index, def.SpawnOnReveal, events);
            if (def.Effect?.Type == "readyOnArrival")
            {
                foreach (var c in Query.CharsAt(state, index, null, Rules.ZoneGate))
                {
                    if (!c.Ready && !IsInformant(content, c))
                    {
                        ReadyUp(content, c);
                        events.Add(Ev("ready", $"{Name(content, state, c)} is Ready ({def.Name}).", uid: c.Uid));
                    }
                }
            }
            CheckGatherings(content, state, events, "reveal", index);
            foreach (var c in Query.CharsAt(state, index))
            {
                if (c.PendingRevealBonus != null && c.PendingRevealBonus.Value != 0)
                {
                    c.PermInfluence += c.PendingRevealBonus.Value;
                    events.Add(Ev("info", $"{Name(content, state, c)} gains +{c.PendingRevealBonus.Value} Influence as {def.Name} reveals.", uid: c.Uid));
                    c.PendingRevealBonus = 0;
                }
            }
            // Timed threats scheduled for this turn or earlier fire on reveal.
            if (def.TimedThreat != null && def.TimedThreat.Turn <= state.Turn) Setup.SpawnThreat(content, state, index, def.TimedThreat.ThreatId, events);
        }

        sealed class PendingConfront
        {
            public string Uid;
            public string ThreatUid;
            public int Bonus;
        }

        /// <summary>John Brown's pick: your own split Threat first, then a shared one, then an Assist.</summary>
        static ThreatInstance OwnThreatFirst(ContentTable content, GameState state, int loc, string p)
        {
            var all = state.Locations[loc].Threats;
            var threats = all.Where(t => !content.ThreatById[t.DefId].Split || t.Target == p || !all.Any(o => o.DefId == t.DefId && o.Target == p)).ToList();
            return threats.FirstOrDefault(t => !Query.IsAssist(content, t, p)) ?? threats.FirstOrDefault();
        }

        static void ResolveReveal(ContentTable content, GameState state, CharacterInstance c, PlayTarget revealTarget, List<GameEvent> events, List<PendingConfront> confronts)
        {
            var def = CharDef(content, c.DefId);
            if (def.Passive?.Unstable == true) c.Unstable = true;
            if (def.Reveal == null) return;
            var p = c.Owner;
            var opp = Rules.Other(p);
            int loc = c.Location;
            var eff = def.Reveal.Effect;
            void Say(string text) => events.Add(Ev("reveal", $"{def.Name}: {text}", uid: c.Uid, player: p, location: loc));
            CharacterInstance TargetChar(PlayTarget t) => t?.CharUid != null && state.Characters.TryGetValue(t.CharUid, out var x) ? x : null;
            string CName(CharacterInstance x) => CharDef(content, x.DefId).Name;
            switch (eff.Type)
            {
                case "none":
                    break;
                case "moveFriendlyGate":
                {
                    var t = revealTarget;
                    var target = TargetChar(t);
                    if (target == null || target.Owner != p || target.Zone != Rules.ZoneGate || target.Uid == c.Uid || t?.Location == null || t.Location.Value == target.Location)
                    {
                        Say("no Gate Character chosen to move.");
                        break;
                    }
                    var held = Query.LockReason(content, state, target);
                    if (held != null)
                    {
                        Say($"cannot move {CName(target)}: {held}.");
                        break;
                    }
                    int dest = t.Location.Value;
                    if (!Query.GateOpen(state, dest, p) || state.Locations[dest].Lost)
                    {
                        Say($"the Gate at {LocName(content, state, dest)} is not open.");
                        break;
                    }
                    int from = target.Location;
                    target.Location = dest;
                    target.RelocatedTurn = state.Turn;
                    target.BlessedUid = null;
                    if (content.LocationById.TryGetValue(state.Locations[dest].DefId, out var dd) && dd.Effect?.Type == "readyOnArrival" && state.Locations[dest].Revealed) ReadyUp(content, target);
                    Say($"moves {CName(target)} from {LocName(content, state, from)} to the Gates of {LocName(content, state, dest)}{(target.Ready ? ", still Ready" : ", waiting progress kept")}.");
                    events.Add(Ev("moved", "", uid: target.Uid, location: dest, data: D("from", from, "to", dest, "reason", "Smalls")));
                    break;
                }
                case "conductor":
                {
                    var t = revealTarget;
                    var target = TargetChar(t);
                    if (target == null || target.Owner != p || target.Uid == c.Uid || t?.Location == null || t.Location.Value == target.Location)
                    {
                        Say("nobody chosen to conduct.");
                        break;
                    }
                    int dest = t.Location.Value;
                    var moved = target.ShallowCopy();
                    moved.Location = dest;
                    bool roomInside = Query.InsideOpen(content, state, dest, p) && Query.IsBlockedFromEntering(content, state, moved) == null;
                    if (state.Locations[dest].Lost || (!roomInside && !Query.GateOpen(state, dest, p)))
                    {
                        Say($"{LocName(content, state, dest)} has no room for {CName(target)}.");
                        break;
                    }
                    int from = target.Location;
                    var held = Query.LockReason(content, state, target);
                    target.Location = dest;
                    target.RelocatedTurn = state.Turn;
                    target.BlessedUid = null;
                    target.ArrivedTurn = state.Turn;
                    var via = held != null ? $"out of {LocName(content, state, from)} ({held}) " : $"from {LocName(content, state, from)} ";
                    if (roomInside)
                    {
                        target.Zone = Rules.ZoneInside;
                        target.Ready = false;
                        Say($"conducts {CName(target)} {via}straight Inside {LocName(content, state, dest)}.");
                        events.Add(Ev("entered", $"{Name(content, state, target)} arrives Inside (Harriet) at {LocName(content, state, dest)}.", uid: target.Uid, location: dest, player: p));
                    }
                    else
                    {
                        target.Zone = Rules.ZoneGate;
                        ReadyUp(content, target);
                        Say($"conducts {CName(target)} {via}to the Gates of {LocName(content, state, dest)}, Ready: the Inside is full.");
                    }
                    events.Add(Ev("moved", "", uid: target.Uid, location: dest, data: D("from", from, "to", dest, "reason", "Harriet", "freed", held != null, "inside", roomInside)));
                    break;
                }
                case "tempInfluenceOther":
                {
                    var others = Query.CharsAt(state, loc, p).Where(x => x.Uid != c.Uid).ToList();
                    if (others.Count == 0)
                    {
                        Say("no other friendly Character here.");
                        break;
                    }
                    var best = ByInfluenceDesc(content, state, others)[0];
                    best.TempInfluence += eff.Int("amount");
                    Say($"{CName(best)} gains +{eff.Int("amount")} Influence this turn.");
                    break;
                }
                case "tempInfluenceAllOthersHere":
                {
                    var others = Query.CharsAt(state, loc, p).Where(x => x.Uid != c.Uid).ToList();
                    foreach (var o in others) o.TempInfluence += eff.Int("amount");
                    Say(others.Count > 0 ? $"{others.Count} friendly Character(s) here gain +{eff.Int("amount")} Influence this turn." : "no other friendly Character here.");
                    break;
                }
                case "confrontThreat":
                {
                    var own = OwnThreatFirst(content, state, loc, p);
                    if (own == null)
                    {
                        Say("no Threat here to confront.");
                        break;
                    }
                    confronts.Add(new PendingConfront { Uid = c.Uid, ThreatUid = own.Uid, Bonus = eff.Int("bonus") });
                    Say($"confronts {ThreatName(content, state, own)} with +{eff.Int("bonus")} Force.");
                    break;
                }
                case "peekNextReveal":
                {
                    int? next = null;
                    foreach (var i in state.RevealOrder.Skip(state.Turn)) if (!state.Locations[i].Revealed) { next = i; break; }
                    if (next == null)
                    {
                        Setup.DrawCard(content, state, p, events);
                        Say("nothing left to foretell: every Location is open by the end of this turn. He draws a card instead.");
                        break;
                    }
                    state.Players[p].KnownNextReveal = next;
                    var nn = content.LocationById.TryGetValue(state.Locations[next.Value].DefId, out var nd) ? nd.Name : "a Location";
                    events.Add(Ev("reveal", $"{def.Name}: privately learns that {nn} opens at Location {next.Value + 1} at the end of next turn (its name shows on the board for you).", uid: c.Uid, player: p, privateTo: p, data: D("next", next.Value)));
                    break;
                }
                case "clubHere":
                {
                    int maxCost = eff.Int("maxCost");
                    var kids = Query.CharsAt(state, loc, p).Where(k => k.Uid != c.Uid && !IsInformant(content, k) && CharDef(content, k.DefId).Cost <= maxCost).ToList();
                    if (kids.Count == 0)
                    {
                        Say($"nobody here costs {maxCost} or less, so the club has no members yet.");
                        break;
                    }
                    foreach (var k in kids) k.PermInfluence += eff.Int("amount");
                    Say($"signs up {string.Join(", ", kids.Select(k => Name(content, state, k)))}: +{eff.Int("amount")} Influence each.");
                    break;
                }
                case "hiddenBonus":
                {
                    if (c.WasHiddenAtCommit != true)
                    {
                        Say("was played into a known Location.");
                        break;
                    }
                    if (state.Locations[loc].Revealed)
                    {
                        c.PermInfluence += eff.Int("amount");
                        Say($"gains +{eff.Int("amount")} Influence as the Location reveals.");
                    }
                    else
                    {
                        c.PendingRevealBonus = eff.Int("amount");
                        Say($"will gain +{eff.Int("amount")} Influence when this Location reveals.");
                    }
                    break;
                }
                case "holdSeat":
                    c.ProtectedTurn = state.Turn;
                    Say("keeps her seat: she cannot be displaced this turn.");
                    break;
                case "draw":
                    for (int i = 0; i < eff.Int("count"); i++) Setup.DrawCard(content, state, p, events);
                    Say($"{state.Players[p].Handle} draws a card.");
                    break;
                case "tutor":
                {
                    var ps = state.Players[p];
                    var ids = eff.Args["cardIds"].Select(x => (string)x).ToList();
                    var got = new List<string>();
                    foreach (var id in ids)
                    {
                        int at = ps.Deck.IndexOf(id);
                        if (at < 0) continue;
                        if (ps.Hand.Count >= Rules.MaxHand) break;
                        ps.Deck.RemoveAt(at);
                        ps.DeckCount = ps.Deck.Count;
                        ps.Hand.Add(id);
                        got.Add(id);
                        events.Add(Ev("draw", $"{ps.Handle} draws {Setup.CardName(content, id)}.", player: p, cardId: id, privateTo: p));
                    }
                    var missing = ids.Where(id => !got.Contains(id)).ToList();
                    if (got.Count == 0) Say(ps.Hand.Count >= Rules.MaxHand ? $"calls the congregation, but {ps.Handle}'s hand is full." : "calls the congregation, but nobody named is left in the deck.");
                    else Say($"calls the congregation: {string.Join(" and ", got.Select(id => Setup.CardName(content, id)))} {(got.Count > 1 ? "come" : "comes")} to {ps.Handle}'s hand{(missing.Count > 0 && ps.Hand.Count >= Rules.MaxHand ? " (the hand is full)" : "")}.");
                    break;
                }
                case "blockOneOpposingGate":
                {
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && x.Ready && !Shielded(content, state, x));
                    var target = ByInfluenceDesc(content, state, targets).FirstOrDefault();
                    if (target != null)
                    {
                        target.BlockedEnterTurn = state.Turn;
                        Say($"{CName(target)} cannot enter this turn.");
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), target, "blocked", loc, note: "Her Reveal picks the opposing Ready Character here with the highest Influence.");
                    }
                    else Say("no opposing Ready Character to block.");
                    c.Unstable = true;
                    break;
                }
                case "blockOpposingGatesHere":
                {
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && !Shielded(content, state, x)).ToList();
                    foreach (var t in targets)
                    {
                        t.BlockedEnterTurn = state.Turn;
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), t, "blocked", loc, note: "His Reveal blocks every opposing Gate Character here this turn.");
                    }
                    Say(targets.Count > 0 ? $"{targets.Count} opposing Gate Character(s) cannot enter this turn." : "no opposing Gate Characters here.");
                    break;
                }
                case "readyFriendly":
                {
                    var here = Query.CharsAt(state, loc, p, Rules.ZoneGate).Where(x => x.Uid != c.Uid && !x.Ready && !IsInformant(content, x)).ToList();
                    var anywhere = Query.CharsOf(state, p).Where(x => x.Zone == Rules.ZoneGate && x.Uid != c.Uid && !x.Ready && !IsInformant(content, x)).ToList();
                    var target = here.FirstOrDefault() ?? anywhere.FirstOrDefault();
                    if (target != null)
                    {
                        ReadyUp(content, target);
                        Say($"{CName(target)} becomes Ready.");
                        events.Add(Ev("ready", "", uid: target.Uid));
                    }
                    else Say("no Waiting friendly Character to organize.");
                    break;
                }
                case "weakenThreat":
                {
                    var all = state.Locations[loc].Threats;
                    var threats = all.Where(t => !content.ThreatById[t.DefId].Split || t.Target == p).OrderByDescending(t => t.ForceRequired).ToList();
                    var t = threats.FirstOrDefault() ?? all.FirstOrDefault();
                    if (t != null)
                    {
                        t.ForceRequired = Math.Max(1, t.ForceRequired - eff.Int("amount"));
                        Say($"{content.ThreatById[t.DefId].Name} now needs {t.ForceRequired} Force.");
                    }
                    else Say("no Threat here to expose.");
                    break;
                }
                case "challengeGate":
                {
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && !Shielded(content, state, x));
                    var target = targets.OrderByDescending(x => CharDef(content, x.DefId).Force).FirstOrDefault();
                    if (target == null)
                    {
                        Say("no opposing Gate Character to challenge.");
                        break;
                    }
                    int myForce = def.Force;
                    int theirForce = CharDef(content, target.DefId).Force;
                    var intent = $"{def.Name} arrived to challenge the opposing Gate Character here with the most Force, {CName(target)}: with more Force, {def.Name} knocks them to another Location.";
                    if (myForce > theirForce && !IsProtected(content, state, target))
                    {
                        Say($"challenges {CName(target)} ({myForce} vs {theirForce}) and displaces them.");
                        Displace(content, state, target, "Nzinga", events);
                        Clash(content, state, events, Actor("character", def.Id, p, myForce), target, "displaced", loc, theirForce: theirForce, to: target.Location, intent: intent, note: $"Force decides: {myForce} against {theirForce}.");
                    }
                    else
                    {
                        target.BlockedEnterTurn = state.Turn;
                        Say($"challenges {CName(target)} ({myForce} vs {theirForce}): not enough to move them, but they are held at the Gates this turn.");
                        var note = myForce <= theirForce ? $"Force decides: {myForce} is not more than {theirForce}, so {CName(target)} stays put, but the challenge holds them at the Gates: they cannot enter this turn." : $"{CName(target)} is protected this turn, so nothing can move them, but they are held at the Gates and cannot enter.";
                        Clash(content, state, events, Actor("character", def.Id, p, myForce), target, "blocked", loc, theirForce: theirForce, intent: intent, note: note);
                    }
                    break;
                }
                case "challengeInside":
                {
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneInside).Where(x => !Shielded(content, state, x));
                    var target = ByInfluenceDesc(content, state, targets).FirstOrDefault();
                    if (target == null)
                    {
                        Say("no opposing Established Character to challenge.");
                        break;
                    }
                    int myForce = def.Force;
                    int theirForce = CharDef(content, target.DefId).Force;
                    var intent = $"{def.Name} arrived to challenge the opposing Established Character here with the most Influence, {CName(target)}: with more Force, {def.Name} sends them back to the Gates, Waiting, and their Influence stops counting Inside.";
                    if (myForce > theirForce && !IsProtected(content, state, target) && Query.GateOpen(state, loc, opp))
                    {
                        target.Zone = Rules.ZoneGate;
                        target.Ready = false;
                        target.ArrivedTurn = state.Turn;
                        target.BlessedUid = null;
                        Say($"challenges {CName(target)} ({myForce} vs {theirForce}); they return to the Gates, Waiting.");
                        events.Add(Ev("moved", "", uid: target.Uid, location: loc, data: D("from", loc, "to", loc, "reason", "Toussaint")));
                        Clash(content, state, events, Actor("character", def.Id, p, myForce), target, "sentBack", loc, theirForce: theirForce, intent: intent, note: $"Force decides: {myForce} against {theirForce}. They lose their seat Inside and wait at the Gates again.");
                    }
                    else
                    {
                        Say($"challenges {CName(target)} ({myForce} vs {theirForce}) and is held off.");
                        var why = myForce <= theirForce ? $"Force decides: {myForce} is not more than {theirForce}, so {CName(target)} keeps the seat." : IsProtected(content, state, target) ? $"{CName(target)} is protected this turn, so nothing can move them." : $"{state.Players[opp].Handle}'s Gates here are full, so there is nowhere to send {CName(target)}.";
                        Clash(content, state, events, Actor("character", def.Id, p, myForce), target, "held", loc, theirForce: theirForce, intent: intent, note: why);
                    }
                    break;
                }
                case "challengeAllInside":
                {
                    var targets = ByInfluenceDesc(content, state, Query.CharsAt(state, loc, opp, Rules.ZoneInside).Where(x => !Shielded(content, state, x)));
                    if (targets.Count == 0)
                    {
                        Say("no opposing Established Character to challenge.");
                        break;
                    }
                    int myForce = def.Force;
                    int sent = 0;
                    foreach (var target in targets)
                    {
                        int theirForce = CharDef(content, target.DefId).Force;
                        var intent = $"{def.Name} arrived to challenge every opposing Established Character here: each with less Force than {myForce} is sent back to the Gates, Waiting, while their Gates have room.";
                        if (myForce > theirForce && !IsProtected(content, state, target) && Query.GateOpen(state, loc, opp))
                        {
                            target.Zone = Rules.ZoneGate;
                            target.Ready = false;
                            target.ArrivedTurn = state.Turn;
                            target.BlessedUid = null;
                            target.ProtectedTurn = state.Turn;
                            sent += 1;
                            events.Add(Ev("moved", "", uid: target.Uid, location: loc, data: D("from", loc, "to", loc, "reason", "Toussaint")));
                            Clash(content, state, events, Actor("character", def.Id, p, myForce), target, "sentBack", loc, theirForce: theirForce, intent: intent, note: $"Force decides: {myForce} against {theirForce}. They lose their seat Inside and wait at the Gates again.");
                        }
                        else
                        {
                            var why = myForce <= theirForce ? $"Force decides: {myForce} is not more than {theirForce}, so {CName(target)} keeps the seat." : IsProtected(content, state, target) ? $"{CName(target)} is protected this turn, so nothing can move them." : $"{state.Players[opp].Handle}'s Gates here are full, so there is nowhere to send {CName(target)}.";
                            Clash(content, state, events, Actor("character", def.Id, p, myForce), target, "held", loc, theirForce: theirForce, intent: intent, note: why);
                        }
                    }
                    Say(sent > 0 ? $"challenges everyone Inside here: {sent} of {targets.Count} return{(sent == 1 ? "s" : "")} to the Gates, Waiting." : $"challenges everyone Inside here ({myForce} Force) and is held off by all {targets.Count}.");
                    break;
                }
                case "siegeInside":
                {
                    int amount = eff.Int("amount", 1);
                    var targets = ByInfluenceDesc(content, state, Query.CharsAt(state, loc, opp, Rules.ZoneInside).Where(x => !Shielded(content, state, x) && !IsProtected(content, state, x)));
                    if (targets.Count == 0)
                    {
                        Say("no opposing Established Character here to besiege.");
                        break;
                    }
                    foreach (var target in targets)
                    {
                        target.PermInfluence -= amount;
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), target, "hexed", loc, theirForce: amount, intent: $"{def.Name} arrived to besiege every opposing Established Character here.", note: "The siege does not lift. Only protection stops it.");
                    }
                    Say($"besieges {string.Join(", ", targets.Select(x => CName(x)))}: −{amount} Influence each for the rest of the match.");
                    break;
                }
                case "tearTreaty":
                {
                    int until = state.Locations[loc].TreatyTorn?.Until ?? state.Turn;
                    Say($"Wuchale: no treaty. Any Event {state.Players[opp].Handle} plays at {LocName(content, state, loc)} {(until > state.Turn ? "this turn or next" : "this turn")} is torn up before it resolves.");
                    break;
                }
                case "foundOut":
                {
                    var spy = Query.CharsAt(state, loc, p, Rules.ZoneGate)
                        .Where(x => IsInformant(content, x) && x.PlantedBy != null && x.PlantedBy != p)
                        .OrderBy(x => Query.CharInfluence(content, state, x)).ThenBy(x => x.Uid, StringComparer.Ordinal)
                        .FirstOrDefault();
                    var fallback = eff.Str("fallback");
                    var handle = state.Players[p].Handle;
                    if (spy == null)
                    {
                        if (fallback == "draw")
                        {
                            Setup.DrawCard(content, state, p, events);
                            Say($"no Informant at {handle}'s Gates here to name. The names go to press anyway: {handle} draws a card.");
                        }
                        else if (fallback == "hold")
                        {
                            var held = Query.CharsAt(state, loc, p).Where(x => !IsInformant(content, x)).ToList();
                            foreach (var x in held) x.ProtectedTurn = state.Turn;
                            Say($"no Informant at these Gates to send packing. The house holds: {handle}'s {held.Count} Character{(held.Count == 1 ? "" : "s")} here cannot be displaced or turned this turn.");
                        }
                        else
                        {
                            var own = OwnThreatFirst(content, state, loc, p);
                            if (own == null)
                            {
                                Say("no Informant at these Gates and no Threat here to confront.");
                                break;
                            }
                            confronts.Add(new PendingConfront { Uid = c.Uid, ThreatUid = own.Uid, Bonus = 1 });
                            Say($"no Informant at these Gates: the league confronts {ThreatName(content, state, own)} with +1 Force instead.");
                        }
                        break;
                    }
                    var planter = spy.PlantedBy;
                    var home = state.Players[planter];
                    var sdef = CharDef(content, spy.DefId);
                    int was = Query.CharInfluence(content, state, spy);
                    if (eff.Str("mode") == "amnesty")
                    {
                        spy.Amnestied = true;
                        spy.PlantedBy = null;
                        spy.Ready = false;
                        spy.ArrivedTurn = state.Turn;
                        int now = Query.CharInfluence(content, state, spy);
                        Say($"hears {sdef.Name} (−{-was}) out in full and grants amnesty: they stay at {handle}'s Gates here, Waiting, as {handle}'s own Character, worth {now} from now on.");
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), spy, "amnestied", loc, note: $"The Commission's terms: tell everything, and the past is not held against you. {sdef.Name} now counts {now} for {handle} and can go Inside like anyone else.");
                        break;
                    }
                    bool arrested = eff.Str("mode") == "arrest";
                    bool kept = !arrested && home.Hand.Count < Rules.MaxHand;
                    RemoveCharacter(state, spy.Uid);
                    if (kept) home.Hand.Add(sdef.Id);
                    else home.Discard.Add(sdef.Id);
                    Say(arrested
                        ? $"finds {sdef.Name} (−{-was}) out and has them arrested: out of the match, into {home.Handle}'s discard."
                        : kept
                            ? $"finds {sdef.Name} (−{-was}) out and sends them back to {home.Handle}'s hand: it costs them again to plant."
                            : $"finds {sdef.Name} (−{-was}) out and sends them back to {home.Handle}, whose hand is full: discarded.");
                    events.Add(Ev("moved", "", uid: spy.Uid, location: loc, player: planter, data: D("from", loc, "to", -1, "reason", arrested ? "arrested" : "exposed")));
                    Clash(content, state, events, Actor("character", def.Id, p, def.Force), spy, arrested ? "arrested" : "exposed", loc, note: arrested
                        ? $"The Informant at your Gates here that counted most against you is arrested and leaves the match: it goes to {home.Handle}'s discard, not their hand."
                        : kept
                            ? $"The Informant at your Gates here that counted most against you is found out. Back in {home.Handle}'s hand, it costs Energy and one of your open slots to plant again."
                            : $"The Informant at your Gates here is found out and would go back to {home.Handle}'s hand, but that hand is full ({Rules.MaxHand}): discarded.");
                    if (eff.Bool("leave"))
                    {
                        if (Displace(content, state, c, $"{def.Name} could not stay", events)) Say($"cannot stay: he moves on to the Gates of {LocName(content, state, c.Location)}, Waiting.");
                        else Say("has nowhere to move on to: every other Gate is full or Lost, so he stays.");
                    }
                    break;
                }
                case "suppressInside":
                {
                    if (Query.HasEstablished(content, state, opp, loc, "noSuppressHere").Count > 0)
                    {
                        Say("the opposing Characters here cannot be Suppressed.");
                        break;
                    }
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneInside).Where(x => !Shielded(content, state, x));
                    var target = ByInfluenceDesc(content, state, targets).FirstOrDefault();
                    if (target != null)
                    {
                        target.SuppressedUntilTurn = state.Turn + 1;
                        Say($"suppresses {CName(target)} until the end of next turn.");
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), target, "suppressed", loc, note: "Her Reveal picks the opposing Established Character here with the highest Influence.");
                    }
                    else Say("no opposing Established Character to suppress.");
                    break;
                }
                case "retell":
                {
                    Setup.DrawCard(content, state, p, events);
                    var inf = Query.InfluenceAt(content, state, loc);
                    bool behind = inf[opp] > inf[p];
                    if (behind && Setup.RetellLocation(content, state, loc, p, events))
                    {
                        var nn = content.LocationById.TryGetValue(state.Locations[loc].DefId, out var nd) ? nd.Name : "another place";
                        Say($"draws a card and, behind here, retells this Location: it is now {nn}, webbed.");
                    }
                    else if (!TrickGate(content, state, events, p, loc, def))
                    {
                        Say(behind ? "draws a card. This story cannot be retold." : "draws a card. Ahead here, he keeps the place as it is.");
                    }
                    break;
                }
                case "refreshOpposingGate":
                    Setup.DrawCard(content, state, p, events);
                    if (!TrickGate(content, state, events, p, loc, def)) Say("draws a card.");
                    break;
                case "readyFriendlyWhereBehind":
                {
                    var behind = state.Locations.Where(l => !l.Lost && Query.InfluenceAt(content, state, l.Index)[opp] > Query.InfluenceAt(content, state, l.Index)[p]).Select(l => l.Index).ToList();
                    var targets = Query.CharsOf(state, p).Where(x => x.Zone == Rules.ZoneGate && x.Uid != c.Uid && !x.Ready && !IsInformant(content, x) && behind.Contains(x.Location)).ToList();
                    foreach (var t in targets)
                    {
                        ReadyUp(content, t);
                        events.Add(Ev("ready", "", uid: t.Uid));
                    }
                    Say(targets.Count > 0 ? $"Proclamation: {targets.Count} Character{(targets.Count > 1 ? "s" : "")} where they lead become{(targets.Count > 1 ? "" : "s")} Ready." : "Proclamation: nowhere you trail has a Waiting Character waiting.");
                    break;
                }
                case "weakenAllThreatsHere":
                {
                    var ts = state.Locations[loc].Threats;
                    if (ts.Count == 0)
                    {
                        Say("no Threat here to legislate against.");
                        break;
                    }
                    foreach (var t in ts) t.ForceRequired = Math.Max(1, t.ForceRequired - eff.Int("amount"));
                    Say($"every Threat here needs {eff.Int("amount")} less Force, for good ({string.Join(", ", ts.Select(t => $"{content.ThreatById[t.DefId].Name} {t.ForceRequired}"))}).");
                    break;
                }
                case "permInfluenceAllOthersHere":
                {
                    var others = ByInfluenceDesc(content, state, Query.CharsAt(state, loc, p).Where(x => x.Uid != c.Uid && !IsInformant(content, x))).Take(eff.Int("max")).ToList();
                    foreach (var o in others) o.PermInfluence += eff.Int("amount");
                    Say(others.Count > 0 ? $"{string.Join(", ", others.Select(o => CName(o)))} gain{(others.Count > 1 ? "" : "s")} +{eff.Int("amount")} Influence for the rest of the match." : "no other friendly Character here.");
                    break;
                }
                case "challengeAllGates":
                {
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && !Shielded(content, state, x)).ToList();
                    int hits = 0;
                    foreach (var t in targets)
                    {
                        int tf = CharDef(content, t.DefId).Force;
                        if (def.Force > tf && !IsProtected(content, state, t) && Displace(content, state, t, "Shango", events))
                        {
                            hits++;
                            Clash(content, state, events, Actor("character", def.Id, p, def.Force), t, "displaced", loc, theirForce: tf, to: t.Location, note: $"Thunder: {def.Force} Force against {tf}.");
                        }
                    }
                    Say(hits > 0 ? $"thunder displaces {hits} opposing Gate Character{(hits > 1 ? "s" : "")}." : "thunder rolls, but nobody here is weaker.");
                    break;
                }
                case "permInfluenceOther":
                {
                    var best = ByInfluenceDesc(content, state, Query.CharsAt(state, loc, p).Where(x => x.Uid != c.Uid)).FirstOrDefault();
                    if (best != null)
                    {
                        best.PermInfluence += eff.Int("amount");
                        Say($"{CName(best)} gains +{eff.Int("amount")} Influence permanently.");
                    }
                    else Say("no other friendly Character here.");
                    break;
                }
                case "moveFriendlyInsideHere":
                {
                    var t = TargetChar(revealTarget);
                    if (t == null || t.Owner != p || t.Zone != Rules.ZoneInside || t.Location == loc)
                    {
                        Say("no Character to bring across.");
                        break;
                    }
                    int from = t.Location;
                    var moved = t.ShallowCopy();
                    moved.Location = loc;
                    bool roomInside = Query.InsideOpen(content, state, loc, p) && Query.IsBlockedFromEntering(content, state, moved) == null;
                    bool roomGate = Query.GateOpen(state, loc, p);
                    t.Location = loc;
                    t.RelocatedTurn = state.Turn;
                    t.BlessedUid = null;
                    if (roomInside)
                    {
                        t.Zone = Rules.ZoneInside;
                        t.ArrivedTurn = state.Turn;
                        Say($"brings {CName(t)} across from {LocName(content, state, from)}, straight Inside.");
                    }
                    else if (roomGate)
                    {
                        t.Zone = Rules.ZoneGate;
                        ReadyUp(content, t);
                        t.ArrivedTurn = state.Turn;
                        Say($"brings {CName(t)} across from {LocName(content, state, from)} to the Gates, Ready.");
                    }
                    else
                    {
                        t.Location = from;
                        Say($"could not bring {CName(t)} across: no room here.");
                        break;
                    }
                    events.Add(Ev("moved", "", uid: t.Uid, location: loc, data: D("from", from, "to", loc, "reason", "Yemoja")));
                    break;
                }
                case "confrontAllThreats":
                {
                    var threats = state.Locations[loc].Threats.Where(t => !content.ThreatById[t.DefId].Split || t.Target == p).ToList();
                    if (threats.Count == 0)
                    {
                        Say("no Threat here to confront.");
                        break;
                    }
                    foreach (var t in threats) confronts.Add(new PendingConfront { Uid = c.Uid, ThreatUid = t.Uid, Bonus = eff.Int("bonus") });
                    Say($"confronts every Threat here with +{eff.Int("bonus")} Force.");
                    break;
                }
                case "displaceOpposingGate":
                {
                    var targets = Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && !Shielded(content, state, x));
                    var target = ByInfluenceDesc(content, state, targets).FirstOrDefault();
                    if (target != null && !IsProtected(content, state, target))
                    {
                        Say($"lures {CName(target)} away.");
                        Displace(content, state, target, "Mami Wata", events);
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), target, "displaced", loc, to: target.Location, note: "Her Reveal lures the opposing Gate Character here with the highest Influence. No Force check.");
                    }
                    else Say("nobody here to lure.");
                    break;
                }
                case "massEnter":
                {
                    int n = 0;
                    foreach (var x in Query.CharsOf(state, p))
                    {
                        if (x.Uid == c.Uid || x.Zone != Rules.ZoneGate || state.Locations[x.Location].Lost) continue;
                        if (Query.IsBlockedFromEntering(content, state, x) != null) continue;
                        if (EnterInside(content, state, x, events, "rises and enters (Boukman) at")) n++;
                    }
                    Say(n > 0 ? $"uprising: {n} Character{(n > 1 ? "s" : "")} at your Gates enter{(n > 1 ? "" : "s")} at once, Ready or not." : "calls for an uprising, but nobody is waiting at any Gate (or every Inside is full or blocked).");
                    break;
                }
                case "hexGate":
                {
                    var target = ByInfluenceDesc(content, state, Query.CharsAt(state, loc, opp, Rules.ZoneGate).Where(x => !IsInformant(content, x) && !Shielded(content, state, x) && !IsProtected(content, state, x))).FirstOrDefault();
                    if (target == null) Say("no opposing Gate Character here to hex.");
                    else
                    {
                        int amount = eff.Int("amount");
                        target.PermInfluence -= amount;
                        Say($"hexes {CName(target)}: −{amount} Influence for the rest of the match.");
                        Clash(content, state, events, Actor("character", def.Id, p, def.Force), target, "hexed", loc, theirForce: amount, intent: $"{def.Name} arrived to hex the opposing Gate Character here with the most Influence, {CName(target)}.", note: "Gris-gris does not wear off. Only protection stops it.");
                    }
                    // The healer: the last of the player's Characters the crossing took comes back to the hand.
                    if (eff.Bool("recall"))
                    {
                        var ps = state.Players[p];
                        var back = ps.LostAtSea != null && ps.LostAtSea.Count > 0 ? ps.LostAtSea[ps.LostAtSea.Count - 1] : null;
                        if (back != null && ps.Hand.Count >= Rules.MaxHand) Say($"would call {CharDef(content, back).Name} back from the crossing, but the hand is full ({Rules.MaxHand}).");
                        else if (back != null)
                        {
                            ps.LostAtSea.RemoveAt(ps.LostAtSea.Count - 1);
                            int i = ps.Discard.LastIndexOf(back);
                            if (i >= 0) ps.Discard.RemoveAt(i);
                            ps.Hand.Add(back);
                            Say($"calls {CharDef(content, back).Name} back from the crossing: the card returns to {ps.Handle}'s hand.");
                            events.Add(Ev("spawned", $"{CharDef(content, back).Name} comes back from the crossing to {ps.Handle}'s hand: {def.Name} called them home.", player: p, cardId: back, location: loc, data: D("zone", "hand", "recalled", true)));
                        }
                    }
                    break;
                }
                case "returnFriendlyToHand":
                {
                    var target = TargetChar(revealTarget);
                    if (target == null || target.Owner != p || target.Zone != Rules.ZoneInside || target.Uid == c.Uid)
                    {
                        Say("no Established Character chosen to bring home.");
                        break;
                    }
                    var tdef = CharDef(content, target.DefId);
                    var ps = state.Players[p];
                    RemoveCharacter(state, target.Uid);
                    if (ps.Hand.Count >= Rules.MaxHand)
                    {
                        ps.Discard.Add(tdef.Id);
                        Say($"writes home for {tdef.Name}, but the hand is full: the card is discarded.");
                        break;
                    }
                    ps.Hand.Add(tdef.Id);
                    ps.Discounts ??= new Dictionary<string, int>();
                    ps.Discounts[tdef.Id] = tdef.Cost;
                    Setup.DrawCard(content, state, p, events);
                    Say($"brings {tdef.Name} home from {LocName(content, state, target.Location)}: back in hand and free to play again. {ps.Handle} draws a card.");
                    events.Add(Ev("moved", "", uid: target.Uid, location: target.Location, player: p, data: D("from", target.Location, "to", -1, "reason", "Diallo")));
                    break;
                }
                case "peekHand":
                {
                    var ids = state.Players[opp].Hand.Where(id => id != "hidden").ToList();
                    var names = ids.Select(id => Setup.CardName(content, id)).ToList();
                    events.Add(Ev("info", $"{def.Name}: {state.Players[opp].Handle} is holding {(names.Count > 0 ? string.Join(", ", names) : "nothing")}.", uid: c.Uid, player: p, location: loc, privateTo: p, data: D("peekHand", new JArray(ids))));
                    break;
                }
                case "reduceHandCost":
                {
                    var ps = state.Players[p];
                    var best = ps.Hand.Where(id => Query.CardCost(content, id, state, p) > 0).OrderByDescending(id => Query.CardCost(content, id, state, p)).FirstOrDefault();
                    if (best == null)
                    {
                        Say("no card in hand left to make cheaper.");
                        break;
                    }
                    ps.Discounts ??= new Dictionary<string, int>();
                    ps.Discounts[best] = (ps.Discounts.TryGetValue(best, out var d0) ? d0 : 0) + eff.Int("amount");
                    events.Add(Ev("reveal", $"{def.Name}: {Setup.CardName(content, best)} in {ps.Handle}'s hand now costs {eff.Int("amount")} less ({Query.CardCost(content, best, state, p)}).", uid: c.Uid, player: p, location: loc, privateTo: p));
                    break;
                }
                case "monument":
                {
                    void Mark(int index, int amount, string why)
                    {
                        var l = state.Locations[index];
                        l.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                        l.PermInfluence[p] += amount;
                        events.Add(Ev("info", $"{def.Name}: {LocName(content, state, index)} gains +{amount} lasting Influence for {state.Players[p].Handle} ({why}). It stays even if {def.Short} leaves.", uid: c.Uid, player: p, location: index, data: D("trail", "landscape", "amount", amount, "color", "artist")));
                    }
                    if (eff.Bool("everywhereEstablished"))
                    {
                        var spots = state.Locations.Where(l => l.Revealed && !l.Lost && Query.CharsAt(state, l.Index, p, Rules.ZoneInside).Count > 0).ToList();
                        if (spots.Count == 0)
                        {
                            Say("no Location where you are Established to paint.");
                            break;
                        }
                        foreach (var l in spots) Mark(l.Index, eff.Int("amount"), "a landscape of every place you have settled");
                        break;
                    }
                    int amt = eff.Int("amount");
                    bool perOther = eff.Bool("perOtherHere");
                    if (perOther)
                    {
                        int others = Query.CharsAt(state, loc, p).Count(x => x.Uid != c.Uid);
                        amt = Math.Min(eff.Has("max") ? eff.Int("max") : 99, eff.Int("amount") * others);
                        if (amt <= 0)
                        {
                            Say("nobody here to stitch into the quilt: no lasting Influence.");
                            break;
                        }
                    }
                    int underdog = eff.Int("underdogBonus");
                    if (underdog != 0 && Query.InfluenceAt(content, state, loc)[p] < Query.InfluenceAt(content, state, loc)[Rules.Other(p)]) amt += underdog;
                    Mark(loc, amt, perOther ? "one square per Character beside her" : underdog != 0 && amt > eff.Int("amount") ? "the prize they tried to take back" : "a work that outlasts its maker");
                    break;
                }
                case "dig":
                {
                    var ps = state.Players[p];
                    var top = ps.Deck.Take(eff.Int("count")).ToList();
                    if (top.Count == 0)
                    {
                        Say("the deck is empty.");
                        break;
                    }
                    var keep = top.OrderByDescending(id => Query.CardCost(content, id, state, p)).First();
                    ps.Deck = ps.Deck.Skip(top.Count).ToList();
                    ps.Deck.AddRange(top.Where(id => id != keep));
                    if (ps.Hand.Count >= Rules.MaxHand)
                    {
                        ps.Discard.Add(keep);
                        events.Add(Ev("info", $"{ps.Handle}'s hand is full ({Rules.MaxHand}): {Setup.CardName(content, keep)} is discarded.", player: p));
                    }
                    else ps.Hand.Add(keep);
                    ps.DeckCount = ps.Deck.Count;
                    var s = top.Count > 1 ? "s" : "";
                    events.Add(Ev("reveal", $"{def.Name}: looks at the top {top.Count} card{s} of the deck, keeps {Setup.CardName(content, keep)} and puts the rest on the bottom.", uid: c.Uid, player: p, location: loc, privateTo: p, data: D("dig", D("seen", new JArray(top), "keep", keep, "hidden", false))));
                    events.Add(Ev("reveal", $"{def.Name}: looks at the top {top.Count} card{s} of the deck, keeps one and puts the rest on the bottom.", uid: c.Uid, player: p, location: loc, privateTo: Rules.Other(p), data: D("dig", D("seen", new JArray(top.Select(_ => "hidden")), "keep", "hidden", "hidden", true))));
                    break;
                }
                case "energyNext":
                    state.Players[p].EnergyBanked = (state.Players[p].EnergyBanked ?? 0) + eff.Int("amount");
                    Say($"+{eff.Int("amount")} Energy next turn.");
                    break;
                case "nextCharacterDiscount":
                    state.Players[p].NextCharacterDiscount = new NextCharacterDiscount { Amount = eff.Int("amount"), Since = state.Turn };
                    Say($"the next Character {state.Players[p].Handle} plays costs {eff.Int("amount")} less.");
                    break;
                case "relocationNextTurn":
                    state.Players[p].RelocationsNextTurn = (state.Players[p].RelocationsNextTurn ?? 0) + eff.Int("amount");
                    Say($"next turn {state.Players[p].Handle} may make {eff.Int("amount")} extra Relocation{(eff.Int("amount") > 1 ? "s" : "")}.");
                    break;
                case "drawPerFriendHere":
                {
                    int n = Math.Min(eff.Int("max"), Query.CharsAt(state, loc, p).Count(x => x.Uid != c.Uid));
                    if (n == 0)
                    {
                        Say("nobody else here to recruit: no cards drawn.");
                        break;
                    }
                    for (int i = 0; i < n; i++) Setup.DrawCard(content, state, p, events);
                    Say($"recruits: draws {n} card{(n > 1 ? "s" : "")}, one per friend here.");
                    break;
                }
                case "sanctuaryReveal":
                {
                    int n = 0;
                    foreach (var x in Query.CharsAt(state, loc))
                    {
                        if (x.BlockedEnterTurn == state.Turn || (x.SuppressedUntilTurn != null && x.SuppressedUntilTurn.Value >= state.Turn)) n++;
                        x.BlockedEnterTurn = null;
                        x.SuppressedUntilTurn = null;
                        if (x.Zone == Rules.ZoneGate && !x.Ready)
                        {
                            if (IsInformant(content, x)) continue;
                            ReadyUp(content, x);
                            n++;
                        }
                    }
                    Say(n > 0 ? $"sanctuary: {n} Character{(n > 1 ? "s" : "")} freed or made Ready." : "sanctuary settles over the Location.");
                    break;
                }
            }
        }

        static void PlayEvent(ContentTable content, GameState state, string p, PlayAction play, List<GameEvent> events)
        {
            var def = content.EventById[play.CardId];
            var ps = state.Players[p];
            int at = play.Location;
            var here = state.Locations[at];
            LocationDef hereDef = null;
            if (here.Revealed) content.LocationById.TryGetValue(here.DefId, out hereDef);
            var eff = def.Effect;
            events.Add(Ev("eventPlayed", $"{ps.Handle} plays {def.Name} at {LocName(content, state, at)}.", player: p, cardId: def.Id, location: at));
            switch (eff.Type)
            {
                case "reparations":
                {
                    int baseAmt = Math.Min(eff.Int("max"), ps.Setbacks);
                    var bonus = eff.Args["bonus"];
                    int home = hereDef?.Region == (string)bonus["region"] ? (int)bonus["influence"] : 0;
                    if (baseAmt + home == 0)
                    {
                        events.Add(Ev("info", $"{def.Name}: no Setbacks this match, and {LocName(content, state, at)} is not in the Americas.", player: p, location: at));
                        break;
                    }
                    here.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                    here.PermInfluence[p] += baseAmt + home;
                    events.Add(Ev("info", $"{def.Name}: +{baseAmt + home} lasting Influence at {LocName(content, state, at)} ({ps.Setbacks} Setback{(ps.Setbacks == 1 ? "" : "s")}{(home != 0 ? $", +{home} in the Americas" : "")}). It counts at the end no matter when it was played.", player: p, location: at));
                    break;
                }
                case "ancestors":
                {
                    var bonus = eff.Args["bonus"];
                    int home = hereDef?.Region == (string)bonus["region"] ? (int)bonus["influence"] : 0;
                    if (home != 0) here.TempInfluence[p] += home;
                    events.Add(Ev("info", $"{def.Name}: {ps.Handle} has been warned.{(home != 0 ? $" In Africa: +{home} Influence at {LocName(content, state, at)} this turn." : "")}", player: p, location: at));
                    break;
                }
                case "draw":
                {
                    int hereCount = Query.CharsAt(state, at, p).Count;
                    var bonus = eff.Args["bonus"];
                    int crowdN = (int)bonus["crowd"];
                    int extra = (int)bonus["extra"];
                    bool crowd = hereCount >= crowdN;
                    int n = eff.Int("count") + (crowd ? extra : 0);
                    for (int i = 0; i < n; i++) Setup.DrawCard(content, state, p, events);
                    events.Add(Ev("info", $"{def.Name}: {ps.Handle} draws {n} card{(n > 1 ? "s" : "")} ({hereCount} of {ps.Handle}'s Characters at {LocName(content, state, at)}{(crowd ? "" : $"; {crowdN} would draw {eff.Int("count") + extra}")}).", player: p, location: at));
                    break;
                }
                case "oath":
                {
                    var t = here.Threats.FirstOrDefault();
                    if (t == null)
                    {
                        events.Add(Ev("info", $"{def.Name}: no Threat at {LocName(content, state, at)} to swear against. Nothing happens.", player: p, location: at));
                        break;
                    }
                    here.Oath = new Oath { ThreatUid = t.Uid, By = p };
                    events.Add(Ev("info", $"{def.Name}: the oath is sworn at {LocName(content, state, at)}. Until {ThreatName(content, state, t)} is broken, everyone here, both sides, confronts it every turn, and nobody leaves.", player: p, location: at, data: D("oath", true, "threatUid", t.Uid)));
                    break;
                }
                case "communityDefense":
                    ps.DefendedLocation = play.Location;
                    ps.DefendedTurn = state.Turn;
                    events.Add(Ev("info", $"{def.Name}: none of {ps.Handle}'s Characters can be blocked or displaced this turn, and those at {LocName(content, state, play.Location)} confront with +{eff.Int("force")} Force.", player: p, location: play.Location));
                    break;
            }
        }

        static void Finalize(ContentTable content, GameState state, List<GameEvent> events)
        {
            var locationWinners = state.Locations.Select(l => Query.LocationWinner(content, state, l.Index)).ToList();
            var influence = new Dictionary<string, List<int>> { [Rules.PlayerA] = new List<int>(), [Rules.PlayerB] = new List<int>() };
            foreach (var l in state.Locations)
            {
                var inf = Query.InfluenceAt(content, state, l.Index);
                influence[Rules.PlayerA].Add(inf[Rules.PlayerA]);
                influence[Rules.PlayerB].Add(inf[Rules.PlayerB]);
            }
            var won = new Dictionary<string, int> { [Rules.PlayerA] = locationWinners.Count(w => w == Rules.PlayerA), [Rules.PlayerB] = locationWinners.Count(w => w == Rules.PlayerB) };
            string winner = null;
            string reason = "draw";
            if (won[Rules.PlayerA] >= 2 || won[Rules.PlayerB] >= 2 || won[Rules.PlayerA] != won[Rules.PlayerB])
            {
                winner = won[Rules.PlayerA] > won[Rules.PlayerB] ? Rules.PlayerA : Rules.PlayerB;
                reason = "locations";
            }
            else
            {
                int totA = influence[Rules.PlayerA].Sum();
                int totB = influence[Rules.PlayerB].Sum();
                if (totA != totB)
                {
                    winner = totA > totB ? Rules.PlayerA : Rules.PlayerB;
                    reason = "tiebreak-influence";
                }
                else
                {
                    int fA = Query.TotalForce(content, state, Rules.PlayerA);
                    int fB = Query.TotalForce(content, state, Rules.PlayerB);
                    if (fA != fB)
                    {
                        winner = fA > fB ? Rules.PlayerA : Rules.PlayerB;
                        reason = "tiebreak-force";
                    }
                }
            }
            bool sweep = winner != null && won[winner] == 3;
            int bonus = sweep ? Rules.SweepBonus(state.Stakes) : 0;
            state.Result = new MatchResult { Winner = winner, Reason = reason, LocationWinners = locationWinners, Influence = influence, Stakes = state.Stakes, Sweep = sweep, Bonus = bonus, Payout = state.Stakes + bonus, Turn = state.Turn };
            state.Phase = Rules.PhaseEnded;
            var text = winner != null ? $"{state.Players[winner].Handle} wins the match ({won[winner]} Locations).{(sweep ? $" A clean sweep: +{bonus} Legacy." : "")}" : "The match is a draw.";
            events.Add(Ev("ended", text, data: D("result", JToken.Parse(Json.Write(state.Result)))));
        }

        static void EndByStepOff(ContentTable content, GameState state, string p, List<GameEvent> events)
        {
            var locationWinners = state.Locations.Select(l => Query.LocationWinner(content, state, l.Index)).ToList();
            var influence = new Dictionary<string, List<int>>
            {
                [Rules.PlayerA] = state.Locations.Select(l => Query.InfluenceAt(content, state, l.Index)[Rules.PlayerA]).ToList(),
                [Rules.PlayerB] = state.Locations.Select(l => Query.InfluenceAt(content, state, l.Index)[Rules.PlayerB]).ToList(),
            };
            state.Result = new MatchResult { Winner = Rules.Other(p), Reason = "stepOff", LocationWinners = locationWinners, Influence = influence, Stakes = state.Stakes, Sweep = false, Bonus = 0, Payout = state.Stakes, Turn = state.Turn };
            state.Phase = Rules.PhaseEnded;
            state.Stats.StepOffTurn = new StepOffTurn { Player = p, Turn = state.Turn };
            foreach (var r in state.PendingRaises)
            {
                var rec = state.Stats.StandTurns.LastOrDefault(x => x.Player == r.By && x.Turn == r.DeclaredTurn);
                if (rec != null) rec.Accepted = false;
            }
            state.PendingRaises = new List<PendingRaise>();
            events.Add(Ev("stepOff", $"{state.Players[p].Handle} steps off. {state.Players[Rules.Other(p)].Handle} wins {state.Stakes} Legacy.", player: p));
        }

        /// <summary>Sit Down: a retreat. The match ends at once and the other side takes the current Legacy. Never mutates input.</summary>
        public static ResolveOutput Retreat(ContentTable content, GameState input, string p)
        {
            var state = CloneState(input);
            var events = new List<GameEvent>();
            if (state.Phase != Rules.PhasePlanning) throw new InvalidOperationException($"Cannot retreat in phase {state.Phase}");
            if (state.Players[p].CannotStepOff == true) return new ResolveOutput { State = state, Events = events };
            state.LastEvents = events;
            EndByStepOff(content, state, p, events);
            return new ResolveOutput { State = state, Events = events };
        }

        static void ClearTemporary(GameState state)
        {
            foreach (var c in state.Characters.Values) c.TempInfluence = 0;
            foreach (var l in state.Locations) l.TempInfluence = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
        }
    }
}
