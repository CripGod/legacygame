using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    public static partial class Resolve
    {
        sealed class ForceEntry
        {
            public Dictionary<string, int> Force = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
            public List<string> Assists = new List<string>();
            public List<JObject> Fighters = new List<JObject>();
        }

        sealed class NewChar
        {
            public string P;
            public CharacterInstance C;
            public PlayTarget Target;
            public bool? Enter;
        }

        sealed class EventPlay
        {
            public string P;
            public PlayAction Play;
        }

        /// <summary>Resolve a full turn. Never mutates input. Illegal plans are replaced by a pass.</summary>
        public static ResolveOutput ResolveTurn(ContentTable content, GameState input, Dictionary<string, TurnPlan> plansIn, ResolveOptions opts = null)
        {
            opts ??= new ResolveOptions();
            var state = CloneState(input);
            var events = new List<GameEvent>();
            if (state.Phase != Rules.PhasePlanning) throw new InvalidOperationException($"Cannot resolve in phase {state.Phase}");
            var plans = new Dictionary<string, TurnPlan> { [Rules.PlayerA] = plansIn[Rules.PlayerA], [Rules.PlayerB] = plansIn[Rules.PlayerB] };
            foreach (var p in Rules.Players)
            {
                var errs = Query.ValidatePlan(content, state, p, plans[p]);
                if (errs.Count > 0)
                {
                    events.Add(Ev("info", $"{state.Players[p].Handle}'s plan was illegal ({errs[0]}) and became a pass.", player: p));
                    var pass = TurnPlan.Empty();
                    pass.StepOff = plans[p].StepOff == true && state.Players[p].CannotStepOff != true;
                    plans[p] = pass;
                }
            }
            var order = Query.PlayerOrder(state);
            state.LastEvents = events;

            // ---- Replay trace: one snapshot per beat, only when asked for ----
            var steps = new List<TraceStep>();
            int mark = 0;
            var allEventPlays = new List<PendingEvent>();
            foreach (var p in Rules.Players) foreach (var pl in plans[p].Plays) if (content.EventById.ContainsKey(pl.CardId)) allEventPlays.Add(new PendingEvent { CardId = pl.CardId, Player = p, Location = pl.Location });
            var resolvedEvents = new HashSet<string>();
            void Trace(string kind, string label, List<string> uids = null, int? location = null, string player = null, string cardId = null, bool force = false)
            {
                if (!opts.Trace) return;
                if (events.Count == mark && !force) return;
                var snap = CloneState(state);
                snap.LastEvents = new List<GameEvent>();
                steps.Add(new TraceStep { Kind = kind, Label = label, State = snap, Events = events.Skip(mark).ToList(), PendingEvents = allEventPlays.Where(e => !resolvedEvents.Contains(e.CardId)).ToList(), Uids = uids, Location = location, Player = player, CardId = cardId });
                mark = events.Count;
            }

            // Count offered assists for analytics.
            foreach (var p in Rules.Players)
            {
                int offered = Query.LegalOptionsFor(content, state, p).Confronts.Count(c => c.Assist);
                state.Stats.Assists[p].Offered += offered;
            }

            // ---- 0. Sit Down / Stand on Business ----
            foreach (var p in order)
            {
                if (plans[p].StepOff == true)
                {
                    EndByStepOff(content, state, p, events);
                    return new ResolveOutput { State = state, Events = events };
                }
            }
            var raisers = order.Where(p => plans[p].StandOnBusiness == true).ToList();
            foreach (var p in raisers)
            {
                int from = Query.EffectiveStakes(state);
                state.Players[p].StandUsed = true;
                state.Players[p].CannotStepOff = true;
                state.PendingRaises.Add(new PendingRaise { By = p, DeclaredTurn = state.Turn });
                int to = Query.EffectiveStakes(state);
                int mult = Rules.StandMultiplier(state.Turn);
                state.Stats.StandTurns.Add(new StandTurn { Player = p, Turn = state.Turn, Proposed = to, Accepted = true });
                var o = Rules.Other(p);
                var escape = state.Players[o].CannotStepOff == true ? $"{state.Players[o].Handle} already stood, so there is no backing out." : $"{state.Players[o].Handle} has one turn to Sit Down for {state.Stakes}.";
                events.Add(Ev("stand", $"{state.Players[p].Handle} STANDS ON BUSINESS on Turn {state.Turn} (×{mult}): {from} → {to} Legacy after next turn. {escape}", player: p, data: D("from", from, "to", to, "mult", mult)));
                if (state.MaxTurns < Rules.ExtendedTurns)
                {
                    state.MaxTurns = Rules.ExtendedTurns;
                    events.Add(Ev("stand", $"The match is extended to {Rules.ExtendedTurns} turns.", data: D("maxTurns", Rules.ExtendedTurns)));
                }
            }
            if (raisers.Count > 0) Trace("stand", $"{string.Join(" and ", raisers.Select(p => state.Players[p].Handle))} stand{(raisers.Count > 1 ? "" : "s")} on business", player: raisers[0]);

            // ---- 1. Location reveal ----
            if (state.Turn <= 3 && state.RevealOrder.Count > 0)
            {
                int idx = state.RevealOrder[state.Turn - 1];
                RevealLocation(content, state, idx, events);
                Trace("reveal", $"{LocName(content, state, idx)} is revealed", location: idx);
            }
            foreach (var p in Rules.Players)
            {
                var ps = state.Players[p];
                if (ps.KnownNextReveal != null && state.Locations[ps.KnownNextReveal.Value].Revealed) ps.KnownNextReveal = null;
            }

            // ---- 2. Voluntary Relocations ----
            foreach (var p in order)
            {
                foreach (var r in plans[p].Relocations)
                {
                    if (!state.Characters.TryGetValue(r.Uid, out var c) || c.Owner != p) continue;
                    if (!Query.GateOpen(state, r.To, p) || state.Locations[r.To].Lost)
                    {
                        events.Add(Ev("info", $"{Name(content, state, c)} cannot relocate: the Gate at {LocName(content, state, r.To)} is full.", uid: c.Uid));
                        continue;
                    }
                    int from = c.Location;
                    bool wasGate = c.Zone == Rules.ZoneGate;
                    var fromLoc = state.Locations[from];
                    LocationDef fromDef = null;
                    if (fromLoc.Revealed) content.LocationById.TryGetValue(fromLoc.DefId, out fromDef);
                    var fromType = fromDef?.Effect?.Type ?? "";
                    bool outReady = (wasGate && c.Ready)
                        || Query.HasEstablished(content, state, p, from, "relocatedOutReady").Count > 0
                        || (fromLoc.Revealed && (fromType == "relocatedOutReady" || fromType == "hub" || fromType == "crossing"));
                    bool outInside = !wasGate && Query.HasEstablished(content, state, p, from, "relocatedOutInside").Count > 0 && Query.InsideOpen(content, state, r.To, p);
                    bool carried = wasGate && !IsInformant(content, c) && fromLoc.Revealed && fromType == "crossing";
                    c.Location = r.To;
                    c.Zone = Rules.ZoneGate;
                    c.Ready = (outReady || (state.Players[p].Legend ?? 0) >= Rules.LegendReady) && !IsInformant(content, c);
                    if (carried)
                    {
                        c.PermInfluence += 1;
                        events.Add(Ev("info", $"{Name(content, state, c)} came through the crossing: +1 Influence for good, what was carried across.", uid: c.Uid, player: p, location: r.To));
                    }
                    if (!wasGate) c.ArrivedTurn = state.Turn;
                    c.RelocatedTurn = state.Turn;
                    c.BlessedUid = null;
                    state.Stats.Relocations[p] += 1;
                    var dest = state.Locations[r.To];
                    LocationDef destDef = null;
                    if (dest.Revealed) content.LocationById.TryGetValue(dest.DefId, out destDef);
                    var destType = destDef?.Effect?.Type;
                    if (destType == "readyOnArrival" || destType == "relocatedInReady") ReadyUp(content, c);
                    dest.FirstRelocatedByOwner ??= new Dictionary<string, string>();
                    if (!dest.FirstRelocatedByOwner.ContainsKey(p) || string.IsNullOrEmpty(dest.FirstRelocatedByOwner[p]))
                    {
                        dest.FirstRelocatedByOwner[p] = c.Uid;
                        if (Query.HasEstablished(content, state, p, r.To, "readyRelocatedIn").Count > 0) ReadyUp(content, c);
                    }
                    if (Query.HasEstablished(content, state, p, r.To, "relocatedInReady").Count > 0) ReadyUp(content, c);
                    var tail = c.Ready ? (wasGate ? ", still Ready" : " and is Ready") : " and waits again";
                    events.Add(Ev("moved", $"{Name(content, state, c)} relocates from {(wasGate ? "the Gates of " : "")}{LocName(content, state, from)} to the Gates of {LocName(content, state, r.To)}{tail}.", uid: c.Uid, location: r.To, player: p, data: D("from", from, "to", r.To, "reason", "relocation")));
                    bool inInside = Query.HasEstablished(content, state, p, r.To, "relocatedInInside").Count > 0 && Query.InsideOpen(content, state, r.To, p);
                    if (outInside || inInside)
                    {
                        EnterInside(content, state, c, events, outInside ? "arrives Inside (Green Book) at" : "arrives Inside (Yemoja) at");
                    }
                    else if (destType == "firstRelocatedEnters" && string.IsNullOrEmpty(dest.FirstRelocatedThisTurn))
                    {
                        dest.FirstRelocatedThisTurn = c.Uid;
                        EnterInside(content, state, c, events, "enters immediately (Great Migration) at");
                    }
                    Trace("move", $"{CharDef(content, c.DefId).Name} relocates to {LocName(content, state, r.To)}", uids: new List<string> { c.Uid }, location: r.To, player: p);
                }
            }

            // ---- 3/4. New plays: placement first, then Reveal abilities in initiative order ----
            var pendingConfronts = new List<PendingConfront>();
            var newChars = new List<NewChar>();
            var eventPlays = new List<EventPlay>();
            var placementOrder = new List<EventPlay>();
            bool IsInformantCard(string id) => content.CharacterById.TryGetValue(id, out var d) && d.Keywords.Contains("INFORMANT");
            foreach (var p in order) foreach (var play in plans[p].Plays) if (!IsInformantCard(play.CardId)) placementOrder.Add(new EventPlay { P = p, Play = play });
            foreach (var p in order) foreach (var play in plans[p].Plays) if (IsInformantCard(play.CardId)) placementOrder.Add(new EventPlay { P = p, Play = play });
            foreach (var pp in placementOrder)
            {
                var p = pp.P;
                var play = pp.Play;
                var ps = state.Players[p];
                int idx = ps.Hand.IndexOf(play.CardId);
                if (idx < 0) continue;
                ps.Hand.RemoveAt(idx);
                if (ps.Discounts != null) ps.Discounts.Remove(play.CardId);
                state.Stats.Plays[p].Add(play.CardId);
                if (content.EventById.TryGetValue(play.CardId, out var edef))
                {
                    ps.Discard.Add(edef.Id);
                    eventPlays.Add(new EventPlay { P = p, Play = play });
                    continue;
                }
                var def = CharDef(content, play.CardId);
                bool informant = def.Keywords.Contains("INFORMANT");
                var side = informant ? Rules.Other(p) : p;
                if (!Query.GateOpen(state, play.Location, side) || state.Locations[play.Location].Lost)
                {
                    if (informant && ps.Hand.Count < Rules.MaxHand)
                    {
                        ps.Hand.Add(def.Id);
                        events.Add(Ev("info", $"{ps.Handle}'s {def.Name} found {state.Players[Rules.Other(p)].Handle}'s Gates at {LocName(content, state, play.Location)} full and goes back to hand.", player: p, location: play.Location));
                        continue;
                    }
                    ps.Discard.Add(def.Id);
                    events.Add(Ev("info", $"{ps.Handle}'s {def.Name} could not be placed and is discarded.", player: p));
                    continue;
                }
                var loc = state.Locations[play.Location];
                var c = new CharacterInstance
                {
                    Uid = $"c{state.NextUid++}",
                    DefId = def.Id,
                    Owner = informant ? Rules.Other(p) : p,
                    PlantedBy = informant ? p : null,
                    Location = play.Location,
                    Zone = Rules.ZoneGate,
                    Ready = !informant && (ps.Legend ?? 0) >= Rules.LegendReady,
                    ArrivedTurn = state.Turn,
                    PermInfluence = 0,
                    TempInfluence = 0,
                    WasHiddenAtCommit = !loc.Revealed || loc.RevealedTurn == state.Turn,
                    PlayedAt = play.Location,
                };
                state.Characters[c.Uid] = c;
                // Taytu: the treaty is torn the moment she lands, before any Event here resolves.
                if (!informant && def.Reveal?.Effect?.Type == "tearTreaty") loc.TreatyTorn = new TreatyTorn { By = p, Until = state.Turn + def.Reveal.Effect.Int("turns") - 1 };
                if (ps.NextCharacterDiscount != null && state.Turn > ps.NextCharacterDiscount.Since) ps.NextCharacterDiscount = null;
                foreach (var spider in Query.HasEstablished(content, state, Rules.Other(p), play.Location, "drawOnOpposingPlay"))
                {
                    Setup.DrawCard(content, state, spider.Owner, events);
                    events.Add(Ev("info", $"{CharDef(content, spider.DefId).Name} spins a story: {state.Players[spider.Owner].Handle} draws a card.", uid: spider.Uid, player: spider.Owner));
                }
                if (informant)
                {
                    events.Add(Ev("played", $"{ps.Handle} plants {def.Name} ({def.Influence}/{def.Force}) at {state.Players[Rules.Other(p)].Handle}'s Gates of {LocName(content, state, play.Location)}.", player: p, cardId: def.Id, uid: c.Uid, location: play.Location));
                    Trace("play", $"{ps.Handle} plants {def.Name} at {LocName(content, state, play.Location)}", uids: new List<string> { c.Uid }, location: play.Location, player: p, cardId: def.Id);
                    continue;
                }
                if (loc.Revealed && content.LocationById.TryGetValue(loc.DefId, out var ld0) && ld0.Effect?.Type == "readyOnArrival") ReadyUp(content, c);
                if (Query.HasEstablished(content, state, p, play.Location, "cookout").Count > 0) ReadyUp(content, c);
                newChars.Add(new NewChar { P = p, C = c, Target = play.Target, Enter = play.Enter });
                events.Add(Ev("played", $"{ps.Handle} plays {def.Name} ({def.Influence}/{def.Force}) at the Gates of {LocName(content, state, play.Location)}.", player: p, cardId: def.Id, uid: c.Uid, location: play.Location));
                var kw = def.Keywords;
                bool straightIn = false;
                if (kw.Contains("STRAIGHT_INSIDE") || (kw.Contains("DIRECT_ENTRY") && play.Enter == true))
                {
                    var blocked = Query.IsBlockedFromEntering(content, state, c);
                    if (blocked != null)
                    {
                        events.Add(Ev("blocked", $"{Name(content, state, c)} cannot enter {LocName(content, state, play.Location)}: {blocked}. It waits at the Gates.", uid: c.Uid, player: p, location: play.Location));
                        if (blocked.Contains("Patrol")) Setback(state, p, "entry blocked by Segregationist Patrol", events);
                    }
                    else
                    {
                        straightIn = EnterInside(content, state, c, events, kw.Contains("STRAIGHT_INSIDE") ? "goes straight Inside at" : "enters immediately (Direct Entry) at");
                        if (!straightIn) events.Add(Ev("blocked", $"{Name(content, state, c)} cannot enter: no room Inside.", uid: c.Uid));
                    }
                }
                Trace("play", $"{ps.Handle} plays {def.Name} {(straightIn ? "straight Inside" : "at")} {LocName(content, state, play.Location)}", uids: new List<string> { c.Uid }, location: play.Location, player: p, cardId: def.Id);
            }
            // First Location bonus: the prize for the blind guess on Turn 1.
            if (state.Turn == 1 && state.RevealOrder.Count > 0 && state.Locations[state.RevealOrder[0]].RevealedTurn == 1)
            {
                int first = state.RevealOrder[0];
                var guessed = newChars.Where(n => n.C.Location == first && !IsInformant(content, n.C)).ToList();
                foreach (var n in guessed)
                {
                    var l = state.Locations[first];
                    l.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                    l.PermInfluence[n.C.Owner] += 1;
                    events.Add(Ev("info", $"First Location bonus: {Name(content, state, n.C)} was played at {LocName(content, state, first)} before it was revealed: +1 Influence there for {state.Players[n.C.Owner].Handle} for the rest of the match.", uid: n.C.Uid, player: n.C.Owner, location: first, data: D("trail", "first", "amount", 1, "color", n.C.Owner)));
                }
                if (guessed.Count > 0) Trace("info", $"First Location bonus at {LocName(content, state, first)}", uids: guessed.Select(n => n.C.Uid).ToList(), location: first);
            }
            foreach (var ep in eventPlays)
            {
                var p = ep.P;
                var play = ep.Play;
                var torn = state.Locations[play.Location].TreatyTorn;
                var ename = content.EventById[play.CardId].Name;
                if (torn != null && torn.By == Rules.Other(p) && state.Turn <= torn.Until)
                {
                    events.Add(Ev("info", $"{state.Players[p].Handle}'s {ename} at {LocName(content, state, play.Location)} is torn up before it resolves: Taytu Betul will have no treaty here.", player: p, cardId: play.CardId, location: play.Location, data: D("torn", true)));
                    resolvedEvents.Add(play.CardId);
                    Trace("event", $"{state.Players[p].Handle}'s {ename} is torn up at {LocName(content, state, play.Location)}", location: play.Location, player: p, cardId: play.CardId, force: true);
                    continue;
                }
                PlayEvent(content, state, p, play, events);
                resolvedEvents.Add(play.CardId);
                Trace("event", $"{state.Players[p].Handle} plays {ename} at {LocName(content, state, play.Location)}", location: play.Location, player: p, cardId: play.CardId, force: true);
            }
            foreach (var n in newChars)
            {
                int before = events.Count;
                ResolveReveal(content, state, n.C, n.Target, events, pendingConfronts);
                if (events.Count > before)
                {
                    var said = events.Skip(before).FirstOrDefault(e => e.Type == "reveal");
                    var touched = events.Skip(before).Select(e => e.Uid).Where(u => !string.IsNullOrEmpty(u)).ToList();
                    var uids = new List<string> { n.C.Uid };
                    uids.AddRange(touched);
                    Trace("revealFx", said?.Text ?? $"{CharDef(content, n.C.DefId).Name} reveals", uids: uids, location: n.C.Location, player: n.C.Owner, cardId: n.C.DefId);
                }
            }

            // ---- 5/6. Gate -> Inside ----
            foreach (var p in order)
            {
                foreach (var uid in plans[p].Enters)
                {
                    if (!state.Characters.TryGetValue(uid, out var c) || c.Owner != p || c.Zone != Rules.ZoneGate || !c.Ready) continue;
                    var blocked = Query.IsBlockedFromEntering(content, state, c);
                    if (blocked != null)
                    {
                        events.Add(Ev("blocked", $"{Name(content, state, c)} cannot enter {LocName(content, state, c.Location)}: {blocked}.", uid: c.Uid, player: p));
                        if (blocked.Contains("Patrol")) Setback(state, p, "entry blocked by Segregationist Patrol", events);
                        continue;
                    }
                    if (!Query.InsideOpen(content, state, c.Location, p))
                    {
                        bool restricted = Query.InsideCapacity(content, state, c.Location) < 5;
                        events.Add(Ev("blocked", $"{Name(content, state, c)} cannot enter {LocName(content, state, c.Location)}: no room Inside.", uid: c.Uid, player: p));
                        if (restricted) Setback(state, p, "entry blocked by Housing Restriction", events);
                        continue;
                    }
                    EnterInside(content, state, c, events, "enters");
                    Trace("enter", $"{CharDef(content, c.DefId).Name} enters {LocName(content, state, c.Location)}", uids: new List<string> { c.Uid }, location: c.Location, player: p);
                }
            }

            // ---- 7. Team-ups ----
            foreach (var l in state.Locations)
            {
                foreach (var p in Rules.Players)
                {
                    foreach (var tu in content.TeamUps)
                    {
                        bool now = Query.TeamUpAssembled(state, tu, p, l.Index);
                        var pair = Query.CharsAt(state, l.Index, p, Rules.ZoneInside).Where(c => tu.Members.Contains(c.DefId)).ToList();
                        if (tu.Kind == "standing")
                        {
                            var list = l.TeamUps ?? new List<TeamUpAt>();
                            bool was = list.Any(x => x.Id == tu.Id && x.Owner == p);
                            if (now && !was)
                            {
                                l.TeamUps = new List<TeamUpAt>(list) { new TeamUpAt { Id = tu.Id, Owner = p } };
                                events.Add(Ev("info", $"Team-up, {tu.Name}: {string.Join(" and ", pair.Select(c => CharDef(content, c.DefId).Name))} stand together Inside {LocName(content, state, l.Index)}. {tu.Text} It holds while both remain.", player: p, location: l.Index, uid: pair.FirstOrDefault()?.Uid, data: D("teamUp", tu.Id, "formed", true)));
                                Trace("info", $"Team-up: {tu.Name}", uids: pair.Select(c => c.Uid).ToList(), location: l.Index, player: p);
                            }
                            else if (!now && was)
                            {
                                l.TeamUps = list.Where(x => !(x.Id == tu.Id && x.Owner == p)).ToList();
                                events.Add(Ev("info", $"{tu.Name} is broken at {LocName(content, state, l.Index)}: {state.Players[p].Handle}'s pair no longer stands together Inside.", player: p, location: l.Index, data: D("teamUp", tu.Id, "formed", false)));
                            }
                        }
                        else if (now && !state.TeamUps.ContainsKey(tu.Id))
                        {
                            state.TeamUps[tu.Id] = new TeamUpClaim { ClaimedBy = p, Turn = state.Turn, Location = l.Index };
                            events.Add(Ev("info", $"Team-up, {tu.Name}: {string.Join(" and ", pair.Select(c => CharDef(content, c.DefId).Name))} stand together Inside {LocName(content, state, l.Index)}, and {state.Players[p].Handle} claims it first. {tu.Text} Once a match: the window is closed.", player: p, location: l.Index, uid: pair.FirstOrDefault()?.Uid, data: D("teamUp", tu.Id, "once", true)));
                            ApplyTeamUpOnce(content, state, tu, p, l.Index, events);
                            Trace("info", $"Team-up: {tu.Name}", uids: pair.Select(c => c.Uid).ToList(), location: l.Index, player: p);
                        }
                    }
                }
            }

            // ---- 8/9. Threats: confrontations, then Threat actions ----
            var forceByThreat = new Dictionary<string, ForceEntry>();
            void AddForce(string uid, string threatUid, int bonus)
            {
                state.Characters.TryGetValue(uid, out var c);
                var loc = state.Locations.FirstOrDefault(l => l.Threats.Any(t => t.Uid == threatUid));
                var t = loc?.Threats.FirstOrDefault(x => x.Uid == threatUid);
                if (c == null || t == null || c.Location != t.Location) return;
                if (!forceByThreat.TryGetValue(threatUid, out var entry)) entry = new ForceEntry();
                int f = Query.ConfrontForce(content, state, c, t, bonus);
                entry.Force[c.Owner] += f;
                entry.Fighters.Add(D("uid", uid, "defId", c.DefId, "owner", c.Owner, "force", f));
                bool assist = Query.IsAssist(content, t, c.Owner);
                if (assist && !entry.Assists.Contains(uid)) entry.Assists.Add(uid);
                forceByThreat[threatUid] = entry;
                events.Add(Ev("threatActs", $"{Name(content, state, c)} confronts {ThreatName(content, state, t)} with {f} Force{(assist ? " (Assist)" : "")}.", uid: c.Uid, location: t.Location, player: c.Owner));
            }
            foreach (var p in order) foreach (var cf in plans[p].Confronts) AddForce(cf.Uid, cf.ThreatUid, 0);
            foreach (var pc in pendingConfronts) AddForce(pc.Uid, pc.ThreatUid, pc.Bonus);
            // The oath at Bois Caïman: everyone at a sworn Location fights its Threat, whether they planned to or not.
            foreach (var loc in state.Locations)
            {
                if (loc.Oath == null || !loc.Threats.Any(t => t.Uid == loc.Oath.ThreatUid)) continue;
                var already = new HashSet<string>(forceByThreat.TryGetValue(loc.Oath.ThreatUid, out var fe) ? fe.Fighters.Select(f => (string)f["uid"]) : Enumerable.Empty<string>());
                foreach (var c in Query.CharsAt(state, loc.Index)) if (!IsInformant(content, c) && !already.Contains(c.Uid)) AddForce(c.Uid, loc.Oath.ThreatUid, 0);
            }
            foreach (var loc in state.Locations)
            {
                var remaining = new List<ThreatInstance>();
                foreach (var t in loc.Threats)
                {
                    var def = content.ThreatById[t.DefId];
                    forceByThreat.TryGetValue(t.Uid, out var f);
                    bool cleared = false;
                    int needed = Query.ThreatForceNeeded(content, state, t);
                    int fA = f?.Force[Rules.PlayerA] ?? 0;
                    int fB = f?.Force[Rules.PlayerB] ?? 0;
                    if (f != null)
                    {
                        if (def.RequiresBoth == true) cleared = fA >= 1 && fB >= 1;
                        else cleared = fA + fB >= needed;
                    }
                    if (f != null)
                    {
                        events.Add(Ev("showdown", $"Showdown at {LocName(content, state, loc.Index)}: {fA + fB} Force against {ThreatName(content, state, t)}{(def.RequiresBoth == true ? " (both sides needed)" : $" (needs {needed})")}.", location: loc.Index,
                            data: D("threatUid", t.Uid, "defId", t.DefId, "needed", needed, "requiresBoth", def.RequiresBoth == true, "force", D("A", fA, "B", fB), "fighters", new JArray(f.Fighters), "cleared", cleared)));
                    }
                    if (!cleared)
                    {
                        if (f != null) events.Add(Ev("threatActs", $"{ThreatName(content, state, t)} at {LocName(content, state, loc.Index)} holds ({fA + fB}/{needed} Force).", location: loc.Index));
                        remaining.Add(t);
                        continue;
                    }
                    var by = Rules.Players.Where(p => f.Force[p] > 0).ToList();
                    events.Add(Ev("threatNeutralized", $"{ThreatName(content, state, t)} at {LocName(content, state, loc.Index)} is neutralized.", location: loc.Index, data: D("by", new JArray(by), "threatUid", t.Uid, "defId", t.DefId, "target", t.Target)));
                    // Word spreads.
                    var others = state.Locations.Where(l => l.Index != loc.Index && !l.Lost).ToList();
                    if (others.Count > 0 && by.Count > 0)
                    {
                        int top = by.Max(p => f.Force[p]);
                        foreach (var p in by)
                        {
                            int amount = f.Force[p] == top ? 2 : 1;
                            foreach (var l in others)
                            {
                                l.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                                l.PermInfluence[p] += amount;
                                var share = by.Count > 1 ? (amount == 2 ? (by.All(q => f.Force[q] == top) ? " (an equal share)" : " (the larger share)") : " (the smaller share)") : "";
                                events.Add(Ev("info", $"Word spreads: {state.Players[p].Handle} gains +{amount} lasting Influence at {LocName(content, state, l.Index)} for clearing {ThreatName(content, state, t)}{share}.", player: p, location: l.Index, data: D("trail", "legend", "amount", amount, "color", p, "threatUid", t.Uid)));
                            }
                        }
                        foreach (var p in by)
                        {
                            var ps = state.Players[p];
                            ps.Legend = (ps.Legend ?? 0) + 1;
                            if (ps.Legend == Rules.LegendReady) events.Add(Ev("info", $"{ps.Handle}'s legend has spread: from now on their Characters arrive at the Gates Ready. They have people everywhere.", player: p, data: D("legend", ps.Legend.Value)));
                        }
                    }
                    foreach (var uid in f.Assists)
                    {
                        if (!state.Characters.TryGetValue(uid, out var c)) continue;
                        state.Players[c.Owner].Solidarity += 1;
                        state.Stats.Assists[c.Owner].Taken += 1;
                        events.Add(Ev("info", $"{Name(content, state, c)} earns Solidarity.", uid: uid, player: c.Owner));
                    }
                    foreach (var p in Rules.Players)
                    {
                        foreach (var ida in Query.HasEstablished(content, state, p, loc.Index, "influenceOnThreatCleared"))
                        {
                            int amt = CharDef(content, ida.DefId).Established.Effect.Int("amount");
                            ida.PermInfluence += amt;
                            events.Add(Ev("info", $"{Name(content, state, ida)} gains +{amt} Influence.", uid: ida.Uid));
                        }
                        foreach (var house in Query.HasEstablished(content, state, p, loc.Index, "drawOnThreatCleared"))
                        {
                            int n = CharDef(content, house.DefId).Established.Effect.Int("count");
                            for (int i = 0; i < n; i++) Setup.DrawCard(content, state, p, events);
                            events.Add(Ev("info", $"{Name(content, state, house)}: the association pays out; {state.Players[p].Handle} draws {n} card{(n > 1 ? "s" : "")}.", uid: house.Uid, player: p));
                        }
                    }
                }
                loc.Threats = remaining;
                if (loc.Oath != null && !remaining.Any(t => t.Uid == loc.Oath.ThreatUid))
                {
                    events.Add(Ev("info", $"The oath at {LocName(content, state, loc.Index)} is kept: the Threat is broken and everyone may leave.", location: loc.Index, data: D("oath", false)));
                    loc.Oath = null;
                }
                Trace("showdown", $"Showdown at {LocName(content, state, loc.Index)}", location: loc.Index);
            }

            // ---- Joint Summon ----
            int? sA = plans[Rules.PlayerA].Summon?.Location;
            int? sB = plans[Rules.PlayerB].Summon?.Location;
            if (sA != null && sA == sB)
            {
                int at = sA.Value;
                var loc = state.Locations[at];
                var busy = new HashSet<string>(plans[Rules.PlayerA].Enters);
                foreach (var u in plans[Rules.PlayerB].Enters) busy.Add(u);
                foreach (var r in plans[Rules.PlayerA].Relocations) busy.Add(r.Uid);
                foreach (var r in plans[Rules.PlayerB].Relocations) busy.Add(r.Uid);
                var contrib = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                var pseudo = new ThreatInstance { Uid = "summon", DefId = "comfortable_complicity", Location = at, ForceRequired = content.Summon.Force, SpawnedTurn = state.Turn };
                foreach (var c in Query.CharsAt(state, at))
                {
                    if (busy.Contains(c.Uid)) continue;
                    contrib[c.Owner] += Query.ConfrontForce(content, state, c, pseudo);
                }
                int total = contrib[Rules.PlayerA] + contrib[Rules.PlayerB];
                bool success = contrib[Rules.PlayerA] >= content.Summon.MinEach && contrib[Rules.PlayerB] >= content.Summon.MinEach && total >= content.Summon.Force && !loc.Lost;
                events.Add(Ev("summon", $"Both players call on {content.Summon.Name} at {LocName(content, state, at)}: {state.Players[Rules.PlayerA].Handle} {contrib[Rules.PlayerA]} Force, {state.Players[Rules.PlayerB].Handle} {contrib[Rules.PlayerB]} Force ({total}/{content.Summon.Force}).", location: at, data: D("contrib", D("A", contrib[Rules.PlayerA], "B", contrib[Rules.PlayerB]), "success", success)));
                state.Stats.Summons.Add(new SummonRecord { Turn = state.Turn, Location = at, Success = success });
                if (success)
                {
                    loc.Sanctified = true;
                    loc.PactFailed = false;
                    foreach (var t in loc.Threats) events.Add(Ev("threatNeutralized", $"{ThreatName(content, state, t)} at {LocName(content, state, at)} dissolves before {content.Summon.Name}.", location: at));
                    loc.Threats = new List<ThreatInstance>();
                    foreach (var c in Query.CharsAt(state, at)) c.PermInfluence += 1;
                    foreach (var p in Rules.Players)
                    {
                        Setup.DrawCard(content, state, p, events);
                        state.Players[p].Solidarity += 1;
                    }
                    events.Add(Ev("summon", $"{content.Summon.Name} manifests at {LocName(content, state, at)}. Every Character there gains +1 Influence, both players draw a card, and this Location can never be Lost.", location: at, data: D("manifest", true)));
                }
                else
                {
                    loc.PactFailed = true;
                    events.Add(Ev("summon", $"The Summon at {LocName(content, state, at)} fails{(loc.Lost ? "" : $": it needed {content.Summon.Force} Force with at least {content.Summon.MinEach} from each player")}. If this Location is Lost, both players will pay for the broken pact.", location: at, data: D("manifest", false)));
                }
            }
            else if (sA != null || sB != null)
            {
                var by = sA != null ? Rules.PlayerA : Rules.PlayerB;
                int at = (sA ?? sB).Value;
                events.Add(Ev("summon", $"{state.Players[by].Handle} called for a Summon at {LocName(content, state, at)}, but {state.Players[Rules.Other(by)].Handle} did not join.", location: at, player: by));
            }

            Trace("summon", "Summon");

            // Threat actions. A Lost Location's Threats have done their work.
            foreach (var loc in state.Locations)
            {
                if (loc.Lost) continue;
                foreach (var t in loc.Threats.ToList())
                {
                    var def = content.ThreatById[t.DefId];
                    if (def.Effect == "zeroGateInfluence")
                    {
                        foreach (var p in Rules.Players)
                        {
                            if (t.Target != null && t.Target != p) continue;
                            if (Query.HasEstablished(content, state, p, loc.Index, "sanctuary").Count > 0) continue;
                            if (Query.CharsAt(state, loc.Index, p, Rules.ZoneGate).Count > 0) Setback(state, p, $"{def.Name} silences Gate Characters at {LocName(content, state, loc.Index)}", events);
                        }
                    }
                    if (def.Effect == "shipsAway")
                    {
                        var leader = Query.LeaderAt(content, state, loc.Index);
                        var fresh = Query.CharsAt(state, loc.Index, null, Rules.ZoneGate)
                            .Where(c => !c.Ready && !IsProtected(content, state, c) && !IsInformant(content, c))
                            .OrderBy(c => Query.CharInfluence(content, state, c)).ThenBy(c => c.Owner == leader ? 0 : 1).ThenBy(c => c.Uid, StringComparer.Ordinal)
                            .ToList();
                        var victim = fresh.FirstOrDefault();
                        if (victim != null)
                        {
                            var passage = state.Locations.FirstOrDefault(l => l.Revealed && !l.Lost && l.Index != loc.Index && content.LocationById.TryGetValue(l.DefId, out var pd) && pd.Effect?.Type == "crossing" && Query.GateOpen(state, l.Index, victim.Owner));
                            events.Add(Ev("threatActs", $"{def.Name} takes {Name(content, state, victim)}.", location: loc.Index, uid: victim.Uid));
                            if (Displace(content, state, victim, def.Name, events, passage?.Index))
                            {
                                Setback(state, victim.Owner, $"{def.Name} shipped {CharDef(content, victim.DefId).Name} away", events);
                                var note = passage != null && victim.Location == passage.Index ? $"The trade ships the lowest Waiting Gate Character here to The Middle Passage. A Setback for {state.Players[victim.Owner].Handle}." : $"The trade ships the lowest Waiting Gate Character here to a random Location. A Setback for {state.Players[victim.Owner].Handle}.";
                                Clash(content, state, events, Actor("threat", def.Id), victim, "displaced", loc.Index, to: victim.Location, note: note);
                            }
                        }
                    }
                    if (def.Effect == "banishAll" && state.Turn - t.SpawnedTurn + 1 >= (def.FiresAfterTurns ?? 2))
                    {
                        var victims = ByInfluenceDesc(content, state, Query.CharsAt(state, loc.Index).Where(c => !IsInformant(content, c) && !IsProtected(content, state, c)));
                        events.Add(Ev("threatActs", $"{def.Name} comes down at {LocName(content, state, loc.Index)}: {(victims.Count > 0 ? "everyone here is turned out" : "nobody here to turn out")}.", location: loc.Index, data: D("banishAll", true)));
                        int moved = 0;
                        foreach (var v in victims) if (Displace(content, state, v, def.Name, events)) moved++;
                        events.Add(Ev("threatNeutralized", $"{def.Name} at {LocName(content, state, loc.Index)} has run its course{(moved > 0 ? $" ({moved} displaced)" : "")}: the Location is open again.", location: loc.Index, data: D("threatUid", t.Uid, "defId", t.DefId, "target", t.Target, "lifted", true)));
                        loc.Threats = loc.Threats.Where(x => x.Uid != t.Uid).ToList();
                        Trace("threat", $"{def.Name} comes down at {LocName(content, state, loc.Index)}", location: loc.Index, uids: victims.Select(v => v.Uid).ToList());
                        continue;
                    }
                    if (def.Effect == "landOffice" && state.Turn - t.SpawnedTurn + 1 == (def.Window ?? 3))
                    {
                        var provers = Rules.Players.Where(p => Query.CharsAt(state, loc.Index, p, Rules.ZoneInside).Count >= 2).ToList();
                        if (provers.Count > 0)
                        {
                            foreach (var p in provers)
                            {
                                loc.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                                loc.PermInfluence[p] += 1;
                                events.Add(Ev("threatActs", $"{state.Players[p].Handle} proves up at {LocName(content, state, loc.Index)}: two of theirs held the ground while the office was open. +1 lasting Influence.", location: loc.Index, player: p, data: D("provedUp", true)));
                            }
                            events.Add(Ev("threatNeutralized", $"{def.Name} at {LocName(content, state, loc.Index)} closes with the land claimed: it lifts.", location: loc.Index, data: D("by", provers[0], "threatUid", t.Uid, "defId", t.DefId, "target", t.Target)));
                            loc.Threats = loc.Threats.Where(x => x.Uid != t.Uid).ToList();
                            Trace("threat", $"{def.Name} closes at {LocName(content, state, loc.Index)}: proved up", location: loc.Index);
                            continue;
                        }
                        events.Add(Ev("threatActs", $"{def.Name} at {LocName(content, state, loc.Index)} closes: all the land is spoken for. Nobody else enters until {t.ForceRequired} Force clears it.", location: loc.Index, data: D("spokenFor", true)));
                    }
                    if (def.Effect == "mobDisplace")
                    {
                        var leader = Query.LeaderAt(content, state, loc.Index);
                        if (leader != null)
                        {
                            var victim = ByInfluenceDesc(content, state, Query.CharsAt(state, loc.Index, leader).Where(c => !IsProtected(content, state, c))).FirstOrDefault();
                            if (victim != null)
                            {
                                events.Add(Ev("threatActs", $"{def.Name} targets {Name(content, state, victim)}.", location: loc.Index, uid: victim.Uid));
                                if (Displace(content, state, victim, def.Name, events))
                                {
                                    Setback(state, leader, $"{def.Name} displaced {CharDef(content, victim.DefId).Name}", events);
                                    Clash(content, state, events, Actor("threat", def.Id), victim, "displaced", loc.Index, to: victim.Location, note: $"{def.Name} goes after whoever leads this Location, picking their Character with the highest Influence. A Setback for {state.Players[leader].Handle}.");
                                }
                            }
                        }
                        if (def.LostAfterTurns != null && state.Turn - t.SpawnedTurn + 1 >= def.LostAfterTurns.Value && !loc.Lost && loc.Sanctified != true)
                        {
                            loc.Lost = true;
                            loc.LostTurn = state.Turn;
                            loc.LostReason = $"{def.Name} went unanswered for {def.LostAfterTurns.Value} turns (it needed {t.ForceRequired} Force in one turn, from either player or both).";
                            events.Add(Ev("locationLost", $"{LocName(content, state, loc.Index)} is LOST: {loc.LostReason} Neither player can win it.", location: loc.Index));
                            if (loc.PactFailed == true)
                            {
                                foreach (var other in state.Locations)
                                {
                                    if (other.Index == loc.Index) continue;
                                    other.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                                    foreach (var p in Rules.Players) other.PermInfluence[p] -= 1;
                                }
                                events.Add(Ev("summon", "Broken pact: both players lose 1 Influence at each of their other Locations.", location: loc.Index, data: D("penalty", true)));
                            }
                        }
                    }
                }
            }

            {
                var acted = events.Skip(mark).FirstOrDefault(e => e.Type == "threatActs" || e.Type == "locationLost");
                Trace("threat", acted?.Text ?? "Threats act", location: acted?.Location, uids: acted?.Uid != null ? new List<string> { acted.Uid } : null);
            }

            // ---- 10. Cleanup ----
            // Unstable Characters (Karen) may wander.
            foreach (var c in state.Characters.Values.ToList())
            {
                if (c.Unstable == true && c.ArrivedTurn < state.Turn && Rng.NextFloat(state.Rng) < 0.5)
                {
                    Displace(content, state, c, "unstable", events);
                    Trace("move", $"{CharDef(content, c.DefId).Name} wanders off", uids: new List<string> { c.Uid }, location: c.Location, player: c.Owner);
                }
            }
            // Gatherings earned this turn arrive before readiness is settled.
            CheckGatherings(content, state, events, "cleanup");
            Trace("spawn", events.Skip(mark).FirstOrDefault(e => e.Type == "spawned")?.Text ?? "An arrival");
            // Waiting -> Ready.
            foreach (var c in state.Characters.Values.ToList())
            {
                if (c.Zone != Rules.ZoneGate || c.Ready || IsInformant(content, c)) continue;
                var loc = state.Locations[c.Location];
                LocationDef ldef = null;
                if (loc.Revealed) content.LocationById.TryGetValue(loc.DefId, out ldef);
                var cut = Query.HasEstablished(content, state, Rules.Other(c.Owner), c.Location, "cutWater");
                if (cut.Count > 0 && c.ArrivedTurn < state.Turn)
                {
                    events.Add(Ev("info", $"{Name(content, state, c)} waits at {LocName(content, state, c.Location)}: the water is cut while {CharDef(content, cut[0].DefId).Name} holds the Inside.", uid: c.Uid, player: c.Owner, location: c.Location));
                    continue;
                }
                bool organized = Query.HasEstablished(content, state, c.Owner, c.Location, "freshReadyHere").Count > 0 || Query.HasEstablished(content, state, c.Owner, c.Location, "cookout").Count > 0 || Query.StandingAt(content, state, c.Owner, c.Location, "freshReadyHere").Count > 0;
                if (c.ArrivedTurn < state.Turn || organized || ldef?.Effect?.Type == "readyOnArrival")
                {
                    ReadyUp(content, c);
                    events.Add(Ev("ready", $"{Name(content, state, c)} is Ready to enter {LocName(content, state, c.Location)}.", uid: c.Uid, player: c.Owner));
                }
            }
            Trace("ready", "Waiting Characters are Ready");
            // Carver: the most expensive card in hand ripens.
            foreach (var p in Rules.Players)
            {
                var ps = state.Players[p];
                foreach (var farm in Query.HasEstablishedAnywhere(content, state, p, "ripen"))
                {
                    var best = ps.Hand.Where(id => Query.CardCost(content, id, state, p) > 0).OrderByDescending(id => Query.CardCost(content, id, state, p)).FirstOrDefault();
                    if (best == null) break;
                    ps.Discounts ??= new Dictionary<string, int>();
                    ps.Discounts[best] = (ps.Discounts.TryGetValue(best, out var d0) ? d0 : 0) + 1;
                    events.Add(Ev("info", $"{CharDef(content, farm.DefId).Name}: {Setup.CardName(content, best)} in {ps.Handle}'s hand now costs {Query.CardCost(content, best, state, p)}.", uid: farm.Uid, player: p, privateTo: p));
                }
            }
            // Tanner: every turn he stays Established, the Location keeps a little more of him.
            foreach (var p in Rules.Players)
            {
                foreach (var painter in Query.HasEstablishedAnywhere(content, state, p, "monumentEachTurn"))
                {
                    var eff = CharDef(content, painter.DefId).Established.Effect;
                    if (eff.Type != "monumentEachTurn") continue;
                    var l = state.Locations[painter.Location];
                    if (l.Lost) continue;
                    l.PermInfluence ??= new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                    l.PermInfluence[p] += eff.Int("amount");
                    events.Add(Ev("info", $"{CharDef(content, painter.DefId).Name}: {LocName(content, state, painter.Location)} gains +{eff.Int("amount")} lasting Influence for {state.Players[p].Handle}.", uid: painter.Uid, player: p, location: painter.Location));
                }
            }
            // Oshun: the river fills the shallowest cup.
            foreach (var p in Rules.Players)
            {
                foreach (var river in Query.HasEstablishedAnywhere(content, state, p, "growLowestHere"))
                {
                    var eff = CharDef(content, river.DefId).Established.Effect;
                    if (eff.Type != "growLowestHere") continue;
                    var low = ByInfluenceAsc(content, state, Query.CharsAt(state, river.Location, p).Where(x => x.Uid != river.Uid && !IsInformant(content, x))).FirstOrDefault();
                    if (low == null) continue;
                    low.PermInfluence += eff.Int("amount");
                    events.Add(Ev("info", $"{CharDef(content, river.DefId).Name}: {Name(content, state, low)} gains +{eff.Int("amount")} Influence for good.", uid: low.Uid, player: p, location: river.Location));
                }
            }
            // Energy banked by Reveals and Green's extra Relocations ride into next turn.
            foreach (var p in Rules.Players)
            {
                var ps = state.Players[p];
                ps.EnergyNextTurn = ps.EnergyBanked ?? 0;
                ps.EnergyBanked = 0;
                ps.RelocationsBonus = ps.RelocationsNextTurn ?? 0;
                ps.RelocationsNextTurn = 0;
            }
            foreach (var loc in state.Locations)
            {
                LocationDef ldef = null;
                if (loc.Revealed) content.LocationById.TryGetValue(loc.DefId, out ldef);
                if (ldef == null || ldef.Effect?.Type != "restEnergy" || loc.Lost) continue;
                foreach (var p in Rules.Players)
                {
                    if (Query.CharsAt(state, loc.Index, p, Rules.ZoneInside).Count < ldef.Effect.Int("count")) continue;
                    state.Players[p].EnergyNextTurn = (state.Players[p].EnergyNextTurn ?? 0) + ldef.Effect.Int("amount");
                    events.Add(Ev("info", $"{ldef.Name}: {state.Players[p].Handle} has {ldef.Effect.Int("count")}+ Characters Inside and gains +{ldef.Effect.Int("amount")} Energy next turn.", player: p, location: loc.Index));
                }
            }
            Trace("info", "End of turn");
            // The Middle Passage: the crossing takes about one in seven at these Gates; then everyone still there pays the toll.
            foreach (var loc in state.Locations)
            {
                LocationDef ldef = null;
                if (loc.Revealed) content.LocationById.TryGetValue(loc.DefId, out ldef);
                if (ldef == null || ldef.Effect?.Type != "crossing" || loc.Lost) continue;
                double mortality = (double)ldef.Effect.Args["mortality"];
                foreach (var c in Query.CharsAt(state, loc.Index, null, Rules.ZoneGate))
                {
                    if (IsInformant(content, c) || Rng.NextFloat(state.Rng) >= mortality) continue;
                    var cdef = CharDef(content, c.DefId);
                    var ps = state.Players[c.Owner];
                    RemoveCharacter(state, c.Uid);
                    ps.Discard.Add(cdef.Id);
                    (ps.LostAtSea ??= new List<string>()).Add(cdef.Id);
                    events.Add(Ev("moved", "", uid: c.Uid, location: loc.Index, player: c.Owner, data: D("from", loc.Index, "to", -1, "reason", "perished")));
                    Clash(content, state, events, Actor("location", ldef.Id), c, "perished", loc.Index, note: $"The crossing's own odds: about one in seven did not survive it. {cdef.Name} goes to {ps.Handle}'s discard. Marie Laveau calls the last one lost back to the hand.");
                    Trace("crossing", $"{ldef.Name} takes {cdef.Name}", location: loc.Index, uids: new List<string> { c.Uid }, player: c.Owner);
                }
                int toll = ldef.Effect.Int("toll");
                var paid = new List<string>();
                foreach (var c in Query.CharsAt(state, loc.Index, null, Rules.ZoneGate))
                {
                    if (IsInformant(content, c)) continue;
                    int floor = -CharDef(content, c.DefId).Influence;
                    if (c.PermInfluence <= floor) continue;
                    c.PermInfluence = Math.Max(floor, c.PermInfluence - toll);
                    paid.Add(Name(content, state, c));
                }
                if (paid.Count > 0) events.Add(Ev("info", $"{ldef.Name}: {string.Join(", ", paid)} lose{(paid.Count == 1 ? "s" : "")} {toll} Influence for good.", location: loc.Index));
            }
            // Sundown Town displaces Waiting Gate Characters.
            foreach (var loc in state.Locations)
            {
                if (!loc.Revealed || !content.LocationById.TryGetValue(loc.DefId, out var sd) || sd.Effect?.Type != "displaceFreshAtEnd") continue;
                if (loc.RevealedTurn == state.Turn) continue;
                var shelterLeft = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                foreach (var c in Query.CharsAt(state, loc.Index)) shelterLeft[c.Owner] += CharDef(content, c.DefId).Passive?.Shelter ?? 0;
                var atRisk = ByInfluenceDesc(content, state, Query.CharsAt(state, loc.Index, null, Rules.ZoneGate)
                    .Where(c => !c.Ready && !IsProtected(content, state, c) && CharDef(content, c.DefId).Passive?.CurfewImmune != true && !IsInformant(content, c)));
                foreach (var c in atRisk)
                {
                    if (shelterLeft[c.Owner] > 0)
                    {
                        shelterLeft[c.Owner] -= 1;
                        var host = Query.CharsAt(state, loc.Index, c.Owner).FirstOrDefault(h => (CharDef(content, h.DefId).Passive?.Shelter ?? 0) != 0);
                        events.Add(Ev("info", $"{CharDef(content, host?.DefId ?? c.DefId).Name} hides {CharDef(content, c.DefId).Name} overnight at {LocName(content, state, loc.Index)}.", uid: c.Uid, location: loc.Index, player: c.Owner));
                        continue;
                    }
                    int fromHere = loc.Index;
                    if (Displace(content, state, c, "Sundown Town", events))
                    {
                        Setback(state, c.Owner, "displaced by Sundown Town", events);
                        Clash(content, state, events, Actor("location", loc.DefId), c, "displaced", fromHere, to: c.Location, note: "Anyone still Waiting at these Gates at the end of the turn is run out of town. A Setback.");
                        Trace("sundown", $"Sundown Town runs {CharDef(content, c.DefId).Name} out", uids: new List<string> { c.Uid }, location: fromHere, player: c.Owner);
                    }
                }
            }

            // Charleston, 1822: the Waiting Gate Character here with the lowest Influence changes sides.
            foreach (var loc in state.Locations)
            {
                if (!loc.Revealed || loc.Lost || !content.LocationById.TryGetValue(loc.DefId, out var cd) || cd.Effect?.Type != "turncoatAtEnd") continue;
                if (loc.RevealedTurn == state.Turn) continue;
                var inf = Query.InfluenceAt(content, state, loc.Index);
                string leader = inf[Rules.PlayerA] == inf[Rules.PlayerB] ? null : inf[Rules.PlayerA] > inf[Rules.PlayerB] ? Rules.PlayerA : Rules.PlayerB;
                var fresh = Query.CharsAt(state, loc.Index, null, Rules.ZoneGate).Where(c => !c.Ready && !IsProtected(content, state, c)).ToList();
                if (fresh.Count == 0) continue;
                fresh = fresh.OrderBy(c => Query.CharInfluence(content, state, c)).ThenBy(c => c.Owner == leader ? 0 : 1).ThenBy(c => c.Uid, StringComparer.Ordinal).ToList();
                var t = fresh.FirstOrDefault(c => (c.PlantedBy != null && c.PlantedBy == Rules.Other(c.Owner)) || Query.GateOpen(state, loc.Index, Rules.Other(c.Owner)));
                if (t == null)
                {
                    events.Add(Ev("info", $"{LocName(content, state, loc.Index)}: {CharDef(content, fresh[0].DefId).Name} would change sides, but {state.Players[Rules.Other(fresh[0].Owner)].Handle}'s Gates here are full.", location: loc.Index));
                    continue;
                }
                int was = Query.CharInfluence(content, state, t);
                var from = t.Owner;
                if (t.PlantedBy != null && t.PlantedBy == Rules.Other(from))
                {
                    var home = state.Players[t.PlantedBy];
                    RemoveCharacter(state, t.Uid);
                    if (home.Hand.Count >= Rules.MaxHand)
                    {
                        home.Discard.Add(t.DefId);
                        events.Add(Ev("info", $"{LocName(content, state, loc.Index)}: {CharDef(content, t.DefId).Name} is sent back to {home.Handle}, whose hand is full: discarded.", location: loc.Index, player: t.PlantedBy));
                    }
                    else
                    {
                        home.Hand.Add(t.DefId);
                        events.Add(Ev("info", $"{LocName(content, state, loc.Index)}: {CharDef(content, t.DefId).Name} is found out and sent back to {home.Handle}'s hand.", location: loc.Index, player: t.PlantedBy, uid: t.Uid));
                    }
                    Clash(content, state, events, Actor("location", loc.DefId), t, "exposed", loc.Index, note: $"The Informant was the lowest Waiting Gate Character here ({was}). Found out, they go back to {home.Handle}'s hand and can be planted again.");
                    Trace("turncoat", $"{LocName(content, state, loc.Index)}: {CharDef(content, t.DefId).Name} is sent home", uids: new List<string> { t.Uid }, location: loc.Index, player: t.PlantedBy);
                    continue;
                }
                t.Owner = Rules.Other(from);
                t.ArrivedTurn = state.Turn;
                t.Ready = false;
                t.BlessedUid = null;
                events.Add(Ev("moved", "", uid: t.Uid, location: loc.Index, player: t.Owner, data: D("from", loc.Index, "to", loc.Index, "reason", "Charleston")));
                Clash(content, state, events, Actor("location", loc.DefId), t, "defected", loc.Index, note: $"The Waiting Gate Character here with the lowest Influence changes sides at the end of every turn; {CharDef(content, t.DefId).Name} ({was}) was the lowest. They can turn back later.");
                Trace("turncoat", $"{LocName(content, state, loc.Index)}: {CharDef(content, t.DefId).Name} changes sides", uids: new List<string> { t.Uid }, location: loc.Index, player: t.Owner);
            }

            // ---- 11. Influence update & analytics ----
            var leaders = state.Locations.Select(l => l.Lost ? null : Query.LeaderAt(content, state, l.Index)).ToList();
            var prev = state.LeadHistory.Count > 0 ? state.LeadHistory[state.LeadHistory.Count - 1] : null;
            if (prev != null)
            {
                for (int i = 0; i < 3; i++)
                {
                    if (prev.Leaders[i] != leaders[i] && prev.Leaders[i] != null && leaders[i] != null)
                    {
                        state.Stats.LeadChanges += 1;
                        if (state.Turn == state.MaxTurns) state.Stats.FinalTurnFlips += 1;
                    }
                }
            }
            state.LeadHistory.Add(new LeadRecord { Turn = state.Turn, Leaders = leaders });
            foreach (var c in state.Characters.Values)
            {
                if (c.Zone == Rules.ZoneGate) state.Stats.GateTurns += 1;
                else state.Stats.InsideTurns += 1;
            }
            foreach (var l in state.Locations)
            {
                var inf = Query.InfluenceAt(content, state, l.Index);
                events.Add(Ev("influence", $"{LocName(content, state, l.Index)}: {state.Players[Rules.PlayerA].Handle} {inf[Rules.PlayerA]} · {state.Players[Rules.PlayerB].Handle} {inf[Rules.PlayerB]}{(l.Lost ? " (LOST)" : "")}.", location: l.Index, data: D("A", inf[Rules.PlayerA], "B", inf[Rules.PlayerB])));
            }
            Trace("tally", $"Turn {state.Turn} is counted", force: true);

            // Raises declared on an earlier turn land now.
            var landing = state.PendingRaises.Where(r => r.DeclaredTurn < state.Turn).ToList();
            if (landing.Count > 0)
            {
                state.PendingRaises = state.PendingRaises.Where(r => r.DeclaredTurn >= state.Turn).ToList();
                int s = state.Stakes;
                foreach (var r in landing) s *= Rules.StandMultiplier(r.DeclaredTurn);
                state.Stakes = Math.Min(Rules.MaxStakes, s);
                events.Add(Ev("stakes", $"Nobody sat down. The match is now worth {state.Stakes} Legacy.", data: D("stakes", state.Stakes)));
                Trace("stakes", $"The match is now worth {state.Stakes} Legacy");
            }

            if (state.Turn >= state.MaxTurns)
            {
                Finalize(content, state, events);
            }
            else
            {
                ClearTemporary(state);
                Setup.StartTurn(content, state, events);
            }
            return new ResolveOutput { State = state, Events = events, Trace = opts.Trace ? steps : null };
        }
    }
}
