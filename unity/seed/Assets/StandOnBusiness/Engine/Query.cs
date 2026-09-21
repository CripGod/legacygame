using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    public sealed class LockInfo
    {
        public string Kind;
        public string Reason;
    }

    /// <summary>One line of an Influence sum: what it is and how much it adds (or takes).</summary>
    public sealed class InfluencePart
    {
        public string Why;
        public int Amount;
        public InfluencePart() { }
        public InfluencePart(string why, int amount) { Why = why; Amount = amount; }
    }

    /// <summary>One row of a Location's Influence sum for one player.</summary>
    public sealed class InfluenceRow
    {
        public string Label;
        public int Amount;
        public string Uid;
        public List<InfluencePart> Parts;
    }

    public sealed class InfluenceSum
    {
        public List<InfluenceRow> Rows = new List<InfluenceRow>();
        public int Total;
    }

    public sealed class LandOffice
    {
        public ThreatInstance Threat;
        public int ClosesTurn;
        public bool Closed;
    }

    public sealed class PlayOption
    {
        public string CardId;
        public string Kind;
        public List<int> Locations = new List<int>();
        public bool NeedsLocation;
        public string NeedsTarget;
        public bool DirectEntry;
        public bool? StraightInside;
    }

    public sealed class ConfrontOption
    {
        public string ThreatUid;
        public int Location;
        public List<string> Chars = new List<string>();
        public bool Assist;
    }

    public sealed class RelocationOption
    {
        public string Uid;
        public List<int> Destinations = new List<int>();
    }

    public sealed class LegalOptions
    {
        public List<PlayOption> Plays = new List<PlayOption>();
        public List<string> Enters = new List<string>();
        public List<RelocationOption> Relocations = new List<RelocationOption>();
        public int RelocationsAllowed;
        public int Energy;
        public List<ConfrontOption> Confronts = new List<ConfrontOption>();
        public bool CanStand;
        public bool CanStepOff;
        public int ProposedStakes;
        public int PendingStakes;
        public int StepOffCost;
        public List<int> Summonable = new List<int>();
    }

    /// <summary>
    /// Read-only queries over a GameState, a port of src/engine/query.ts: Influence, Force, capacity, legal actions.
    /// Every function takes the content it reads definitions from. QueryTests checks every one of these against the
    /// answers the web engine recorded for every state in the golden traces.
    /// </summary>
    public static class Query
    {
        // ---------- definitions ----------

        public static CharacterDef CharDef(ContentTable content, string id)
        {
            if (content.CharacterById.TryGetValue(id, out var d)) return d;
            throw new KeyNotFoundException($"Unknown character: {id}");
        }

        static bool IsInformantDef(CharacterDef def) => def.Keywords.Contains("INFORMANT");

        static int AmountOf(CharacterDef def) => def.Established?.Effect?.Int("amount") ?? 0;
        static int AmountOf(ContentTable content, CharacterInstance c) => AmountOf(CharDef(content, c.DefId));
        static int TeamUpAmount(TeamUpDef t) => t.Effect?.Int("amount") ?? 0;

        // ---------- time, locks, stakes ----------

        /// <summary>Even turns are night. Curfews bite at night.</summary>
        public static bool IsNight(GameState state) => state.Turn % 2 == 0;

        /// <summary>What keeps a Character from relocating out: a curfew at night, an opposing siege, a Location that holds anyone Inside, or the oath. Harriet ignores them.</summary>
        public static LockInfo LockKind(ContentTable content, GameState state, CharacterInstance c)
        {
            if (CharDef(content, c.DefId).Passive?.CurfewImmune == true) return null;
            var loc = state.Locations[c.Location];
            LocationDef def = null;
            if (loc.Revealed) content.LocationById.TryGetValue(loc.DefId, out def);
            if (def?.Curfew == true && IsNight(state)) return new LockInfo { Kind = "curfew", Reason = $"{def.Name} is under curfew until morning" };
            var bridle = HasEstablished(content, state, Rules.Other(c.Owner), c.Location, "bridleHere").FirstOrDefault();
            if (bridle != null)
            {
                var name = CharDef(content, bridle.DefId).Name;
                return new LockInfo { Kind = "besieged", Reason = $"{name} holds this Location: nobody relocates out against {(name == "Tom Bass" ? "him" : "her")}" };
            }
            if (c.Zone == Rules.ZoneInside && IsHeldInside(content, state, c)) return new LockInfo { Kind = "held", Reason = $"{def?.Name ?? "this Location"} holds anyone Inside for two turns" };
            var oath = loc.Oath != null ? loc.Threats.FirstOrDefault(t => t.Uid == loc.Oath.ThreatUid) : null;
            if (oath != null) return new LockInfo { Kind = "oath", Reason = $"the oath at Bois Caïman holds everyone here until {content.ThreatById[oath.DefId].Name} is broken" };
            return null;
        }

        public static string LockReason(ContentTable content, GameState state, CharacterInstance c) => LockKind(content, state, c)?.Reason;

        public static bool IsHeldInside(ContentTable content, GameState state, CharacterInstance c)
        {
            if (c.Zone != Rules.ZoneInside) return false;
            var loc = state.Locations[c.Location];
            if (!loc.Revealed) return false;
            content.LocationById.TryGetValue(loc.DefId, out var def);
            var eff = def?.Effect;
            return eff?.Type == "lockInside" && state.Turn - c.ArrivedTurn <= eff.Int("turns");
        }

        /// <summary>The Legacy once every pending Stand has landed: each multiplies by how early it was called.</summary>
        public static int EffectiveStakes(GameState state)
        {
            int s = state.Stakes;
            foreach (var r in state.PendingRaises) s *= Rules.StandMultiplier(r.DeclaredTurn);
            return Math.Min(Rules.MaxStakes, s);
        }

        public static LocationDef LocDef(ContentTable content, GameState state, int index)
        {
            var loc = state.Locations[index];
            var id = loc.Revealed ? loc.DefId : "unknown";
            return content.LocationById.TryGetValue(id, out var d) ? d : content.UnknownLocation;
        }

        // ---------- characters on the board ----------

        public static List<CharacterInstance> CharsAt(GameState state, int location, string owner = null, string zone = null)
        {
            return state.Characters.Values.Where(c => c.Location == location && (owner == null || c.Owner == owner) && (zone == null || c.Zone == zone)).ToList();
        }

        public static List<CharacterInstance> CharsOf(GameState state, string owner)
        {
            return state.Characters.Values.Where(c => c.Owner == owner).ToList();
        }

        public static bool IsSuppressed(GameState state, CharacterInstance c) => c.SuppressedUntilTurn != null && c.SuppressedUntilTurn.Value >= state.Turn;

        /// <summary>Inside, unsuppressed Characters of owner at location with an Established effect of type.</summary>
        public static List<CharacterInstance> HasEstablished(ContentTable content, GameState state, string owner, int location, string type)
        {
            return CharsAt(state, location, owner, Rules.ZoneInside).Where(c => !IsSuppressed(state, c) && CharDef(content, c.DefId).Established?.Effect?.Type == type).ToList();
        }

        /// <summary>Established effects that apply globally for a player.</summary>
        public static List<CharacterInstance> HasEstablishedAnywhere(ContentTable content, GameState state, string owner, string type)
        {
            return CharsOf(state, owner).Where(c => c.Zone == Rules.ZoneInside && !IsSuppressed(state, c) && CharDef(content, c.DefId).Established?.Effect?.Type == type).ToList();
        }

        public static List<ThreatInstance> ActiveThreats(GameState state, int location) => state.Locations[location].Threats;

        public static bool ThreatActiveFor(ContentTable content, GameState state, int location, string effect, string player)
        {
            return state.Locations[location].Threats.Any(t =>
            {
                var def = content.ThreatById[t.DefId];
                return def.Effect == effect && (!def.Split || t.Target == player);
            });
        }

        public static int InsideCapacity(ContentTable content, GameState state, int location)
        {
            var loc = state.Locations[location];
            if (loc.Revealed && content.LocationById.TryGetValue(loc.DefId, out var ld) && ld.Effect?.Type == "crossing") return 0;
            int cap = ThreatActiveFor(content, state, location, "capacity", Rules.PlayerA) ? 2 : Rules.InsideCapacity;
            // The Land Office: one seat fewer per turn it stands; none once the office has closed.
            foreach (var t in loc.Threats)
            {
                var def = content.ThreatById[t.DefId];
                if (def.Effect != "landOffice") continue;
                int standing = state.Turn - t.SpawnedTurn;
                cap = Math.Min(cap, standing >= (def.Window ?? 3) ? 0 : Math.Max(0, Rules.InsideCapacity - standing));
            }
            return cap;
        }

        /// <summary>The Land Office: seats left this turn, and the turn it closes.</summary>
        public static LandOffice LandOfficeAt(ContentTable content, GameState state, int location)
        {
            var t = state.Locations[location].Threats.FirstOrDefault(x => content.ThreatById[x.DefId].Effect == "landOffice");
            if (t == null) return null;
            int closesTurn = t.SpawnedTurn + (content.ThreatById[t.DefId].Window ?? 3) - 1;
            return new LandOffice { Threat = t, ClosesTurn = closesTurn, Closed = state.Turn > closesTurn };
        }

        public static bool GateOpen(GameState state, int location, string owner) => CharsAt(state, location, owner, Rules.ZoneGate).Count < Rules.GateCapacity;

        public static bool InsideOpen(ContentTable content, GameState state, int location, string owner) => CharsAt(state, location, owner, Rules.ZoneInside).Count < InsideCapacity(content, state, location);

        // ---------- influence ----------

        static List<string> ShowcaseTags(Effect eff)
        {
            var tag = eff.Args.TryGetValue("tag", out var v) ? v : null;
            if (tag == null) return new List<string>();
            return tag.Type == JTokenType.Array ? tag.Select(x => (string)x).ToList() : new List<string> { (string)tag };
        }

        /// <summary>Where a Character's Influence comes from, line by line. CharInfluence is the sum, floored at 0 (an Informant is capped at 0).</summary>
        public static List<InfluencePart> CharInfluenceParts(ContentTable content, GameState state, CharacterInstance c)
        {
            var def = CharDef(content, c.DefId);
            bool informant = IsInformantDef(def) && c.Amnestied != true;
            var parts = new List<InfluencePart> { new InfluencePart(informant ? "printed (an Informant counts against you)" : "printed", informant ? def.Influence : Math.Abs(def.Influence)) };
            if (c.PermInfluence != 0) parts.Add(new InfluencePart("lasting changes to this Character", c.PermInfluence));
            if (c.TempInfluence != 0) parts.Add(new InfluencePart("this turn only", c.TempInfluence));
            var loc = state.Locations[c.Location];
            content.LocationById.TryGetValue(loc.Revealed ? loc.DefId : "unknown", out var ldef);
            if (ldef?.Effect?.Type == "steelAndSoul" && CharsAt(state, c.Location, c.Owner).Count >= 5) parts.Add(new InfluencePart($"{ldef.Name}: five Characters here", ldef.Effect.Int("fiveBonus")));
            var home = def.Passive?.RegionBonus;
            if (home != null && ldef?.Region == home.Region) parts.Add(new InfluencePart("home region", home.Influence));
            // Home ground: +1 where the story happened. An Informant is worth one more against its holder there.
            if (def.Home != null && loc.Revealed && def.Home.Locations.Contains(loc.DefId)) parts.Add(new InfluencePart("home ground", informant ? -1 : 1));
            var spot = def.Passive?.LocationBonus;
            if (spot != null && loc.Revealed && loc.DefId == spot.LocationId) parts.Add(new InfluencePart($"at {ldef?.Name ?? "this Location"}", spot.Influence));
            foreach (var j in HasEstablishedAnywhere(content, state, c.Owner, "sanctuary"))
            {
                var jd = CharDef(content, j.DefId);
                int b = jd.Established.Effect.Int("blessing");
                if (b != 0) parts.Add(new InfluencePart($"{jd.Name}'s blessing", b));
            }
            // Anansi's web: the small against the large.
            if (loc.Webbed == true && !informant)
            {
                if (def.Cost <= 1) parts.Add(new InfluencePart("Anansi's web (costs 1 or less)", Rules.WebSmall));
                else if (def.Cost >= 3) parts.Add(new InfluencePart("Anansi's web (costs 3 or more)", -Rules.WebLarge));
            }
            // Bud Billiken's club: while he is Established where he was played, your other cheap Characters there count more.
            if (!informant)
            {
                foreach (var b in HasEstablished(content, state, c.Owner, c.Location, "clubFounded"))
                {
                    var bd = CharDef(content, b.DefId);
                    var eff = bd.Established.Effect;
                    if (b.Uid != c.Uid && b.PlayedAt == c.Location && def.Cost <= eff.Int("maxCost")) parts.Add(new InfluencePart($"{bd.Name}'s club", eff.Int("amount")));
                }
            }
            if (c.Zone == Rules.ZoneInside)
            {
                parts.Add(new InfluencePart("Inside", Rules.InsideInfluenceBonus));
                if (ldef?.Effect?.Type == "insideInfluence") parts.Add(new InfluencePart($"{ldef.Name}: Inside", ldef.Effect.Int("amount")));
                if (ldef?.Effect?.Type == "nightInside" && IsNight(state)) parts.Add(new InfluencePart($"{ldef.Name}: Inside at night", ldef.Effect.Int("amount")));
                if (ldef?.Effect?.Type == "showcase")
                {
                    var tags = ShowcaseTags(ldef.Effect);
                    parts.Add(new InfluencePart($"{ldef.Name}: Inside", ldef.Effect.Int("amount") + (def.Tags.Any(t => tags.Contains(t)) ? ldef.Effect.Int("tagBonus") : 0)));
                }
                foreach (var d in HasEstablished(content, state, c.Owner, c.Location, "auraInfluenceOthersHere"))
                {
                    if (d.Uid != c.Uid) parts.Add(new InfluencePart($"{CharDef(content, d.DefId).Name}, Established here", AmountOf(content, d)));
                }
                foreach (var m in HasEstablished(content, state, c.Owner, c.Location, "blessNextEstablished"))
                {
                    if (m.BlessedUid == c.Uid) parts.Add(new InfluencePart($"{CharDef(content, m.DefId).Name}'s blessing", AmountOf(content, m)));
                }
                foreach (var k in HasEstablished(content, state, c.Owner, c.Location, "cookout"))
                {
                    if (k.Uid != c.Uid) parts.Add(new InfluencePart($"{CharDef(content, k.DefId).Name}'s cookout", AmountOf(content, k)));
                }
                foreach (var m in HasEstablished(content, state, c.Owner, c.Location, "allyBonus"))
                {
                    if (m.Uid == c.Uid && CharsAt(state, c.Location, c.Owner).Count >= 2) parts.Add(new InfluencePart("with an ally here", AmountOf(content, m)));
                }
            }
            else
            {
                if (ThreatActiveFor(content, state, c.Location, "zeroGateInfluence", c.Owner) && HasEstablished(content, state, c.Owner, c.Location, "sanctuary").Count == 0)
                {
                    return new List<InfluencePart> { new InfluencePart("Paddy Roller in the area: Gate Characters count 0", 0) };
                }
                // William Still's record: an Informant at your Gates here is written down and counts 0 against the side that holds it.
                if (informant && HasEstablished(content, state, c.Owner, c.Location, "recordInformantsHere").Count > 0) return new List<InfluencePart> { new InfluencePart("written down in William Still's record: counts 0", 0) };
                foreach (var z in HasEstablished(content, state, c.Owner, c.Location, "gateInfluenceHere")) parts.Add(new InfluencePart($"{CharDef(content, z.DefId).Name}, Established here (Gates)", AmountOf(content, z)));
                foreach (var o in HasEstablished(content, state, Rules.Other(c.Owner), c.Location, "opposingGateInfluence")) parts.Add(new InfluencePart($"{state.Players[Rules.Other(c.Owner)].Handle}'s {CharDef(content, o.DefId).Name} (Gates)", -AmountOf(content, o)));
            }
            return parts;
        }

        /// <summary>Influence contributed by a single Character, including auras.</summary>
        public static int CharInfluence(ContentTable content, GameState state, CharacterInstance c)
        {
            var def = CharDef(content, c.DefId);
            bool informant = IsInformantDef(def) && c.Amnestied != true;
            int v = CharInfluenceParts(content, state, c).Sum(p => p.Amount);
            return informant ? Math.Min(0, v) : Math.Max(0, v);
        }

        static bool GatesUncounted(ContentTable content, LocationState l) => l.Revealed && content.LocationById.TryGetValue(l.DefId, out var d) && d.Effect?.Type == "gatesUncounted";

        /// <summary>Raw Influence per player at a Location, before leader-based modifiers.</summary>
        public static int RawInfluence(ContentTable content, GameState state, int location, string p)
        {
            var l = state.Locations[location];
            int v = (l.TempInfluence != null && l.TempInfluence.TryGetValue(p, out var t) ? t : 0) + (l.PermInfluence != null && l.PermInfluence.TryGetValue(p, out var pe) ? pe : 0);
            bool uncounted = GatesUncounted(content, l);
            foreach (var c in CharsAt(state, location, p))
            {
                if (uncounted && c.Zone == Rules.ZoneGate) continue;
                v += CharInfluence(content, state, c);
            }
            return Math.Max(0, v);
        }

        /// <summary>Final Influence for both players at a Location, including Karen and Comfortable Complicity.</summary>
        public static Dictionary<string, int> InfluenceAt(ContentTable content, GameState state, int location)
        {
            var raw = new Dictionary<string, int> { [Rules.PlayerA] = RawInfluence(content, state, location, Rules.PlayerA), [Rules.PlayerB] = RawInfluence(content, state, location, Rules.PlayerB) };
            if (raw[Rules.PlayerA] == raw[Rules.PlayerB]) return raw;
            var leader = raw[Rules.PlayerA] > raw[Rules.PlayerB] ? Rules.PlayerA : Rules.PlayerB;
            int mod = 0;
            foreach (var c in CharsAt(state, location))
            {
                var pen = CharDef(content, c.DefId).Passive?.LeaderPenalty;
                if (pen != null && pen.Value != 0) mod -= pen.Value;
            }
            if (state.Locations[location].Threats.Any(t => content.ThreatById[t.DefId].Effect == "leaderBonus")) mod += 1;
            raw[leader] = Math.Max(0, raw[leader] + mod);
            return raw;
        }

        /// <summary>A player's Influence at a Location, itemised. Sums to InfluenceAt(state, location)[p].</summary>
        public static InfluenceSum InfluenceRows(ContentTable content, GameState state, int location, string p)
        {
            var rows = new List<InfluenceRow>();
            var l = state.Locations[location];
            bool uncounted = GatesUncounted(content, l);
            foreach (var c in CharsAt(state, location, p))
            {
                var name = CharDef(content, c.DefId).Name;
                if (uncounted && c.Zone == Rules.ZoneGate)
                {
                    rows.Add(new InfluenceRow { Label = name, Amount = 0, Uid = c.Uid, Parts = new List<InfluencePart> { new InfluencePart($"{content.LocationById[l.DefId].Name}: the Gates are not counted", 0) } });
                    continue;
                }
                rows.Add(new InfluenceRow { Label = name, Amount = CharInfluence(content, state, c), Uid = c.Uid, Parts = CharInfluenceParts(content, state, c) });
            }
            int perm = l.PermInfluence != null && l.PermInfluence.TryGetValue(p, out var pe) ? pe : 0;
            if (perm != 0) rows.Add(new InfluenceRow { Label = "Lasting Influence here (First Location bonus, Word spreads, pacts)", Amount = perm });
            int temp = l.TempInfluence != null && l.TempInfluence.TryGetValue(p, out var te) ? te : 0;
            if (temp != 0) rows.Add(new InfluenceRow { Label = "This turn only (Reparations and the like)", Amount = temp });
            int raw = rows.Sum(r => r.Amount);
            if (raw < 0) rows.Add(new InfluenceRow { Label = "Influence cannot go below 0", Amount = -raw });
            var final = InfluenceAt(content, state, location);
            int mine = Math.Max(0, raw);
            if (final[p] != mine)
            {
                foreach (var c in CharsAt(state, location))
                {
                    var cd = CharDef(content, c.DefId);
                    var pen = cd.Passive?.LeaderPenalty;
                    if (pen != null && pen.Value != 0) rows.Add(new InfluenceRow { Label = $"{cd.Name}: the leader loses {pen.Value}", Amount = -pen.Value });
                }
                if (l.Threats.Any(t => content.ThreatById[t.DefId].Effect == "leaderBonus")) rows.Add(new InfluenceRow { Label = "Comfortable Complicity: the leader gains 1", Amount = 1 });
                int summed = rows.Sum(r => r.Amount);
                if (summed != final[p]) rows.Add(new InfluenceRow { Label = "Influence cannot go below 0", Amount = final[p] - summed });
            }
            return new InfluenceSum { Rows = rows, Total = final[p] };
        }

        public static string LeaderAt(ContentTable content, GameState state, int location)
        {
            var inf = InfluenceAt(content, state, location);
            if (inf[Rules.PlayerA] == inf[Rules.PlayerB]) return null;
            return inf[Rules.PlayerA] > inf[Rules.PlayerB] ? Rules.PlayerA : Rules.PlayerB;
        }

        /// <summary>A player, null for nobody, or "lost".</summary>
        public static string LocationWinner(ContentTable content, GameState state, int location)
        {
            if (state.Locations[location].Lost) return "lost";
            return LeaderAt(content, state, location);
        }

        // ---------- force and threats ----------

        /// <summary>Confronting a split Threat that targets the opponent is an Assist.</summary>
        public static bool IsAssist(ContentTable content, ThreatInstance threat, string p)
        {
            var def = content.ThreatById[threat.DefId];
            return def.Split && threat.Target != null && threat.Target != p;
        }

        /// <summary>Force a Character contributes when confronting threat this turn.</summary>
        public static int ConfrontForce(ContentTable content, GameState state, CharacterInstance c, ThreatInstance threat, int extra = 0)
        {
            var def = CharDef(content, c.DefId);
            int f = def.Force + extra;
            var ldef = LocDef(content, state, c.Location);
            if (ldef.Effect?.Type == "confrontForce") f += ldef.Effect.Int("amount");
            if (ldef.Effect?.Type == "steelAndSoul") f += ldef.Effect.Int("force");
            foreach (var n in HasEstablished(content, state, c.Owner, c.Location, "forceAuraHere")) f += AmountOf(content, n);
            foreach (var n in HasEstablished(content, state, c.Owner, c.Location, "confrontForceHere")) f += AmountOf(content, n);
            if (state.Players[c.Owner].DefendedLocation == c.Location) f += 2;
            foreach (var t in StandingAt(content, state, c.Owner, c.Location, "forceHere")) f += TeamUpAmount(t);
            if (IsAssist(content, threat, c.Owner) && c.Zone == Rules.ZoneInside && !IsSuppressed(state, c) && def.Established?.Effect?.Type == "assistForceBonus")
            {
                f += def.Established.Effect.Int("amount");
            }
            return f;
        }

        /// <summary>Can p confront this threat at all? Split threats: own first, then assist once own is clear.</summary>
        public static bool CanConfront(ContentTable content, GameState state, ThreatInstance threat, string p)
        {
            var def = content.ThreatById[threat.DefId];
            if (!def.Split) return true;
            if (threat.Target == p) return true;
            var own = state.Locations[threat.Location].Threats.FirstOrDefault(t => t.DefId == threat.DefId && t.Target == p);
            return own == null;
        }

        /// <summary>Energy this turn: the curve by turn (capped), plus bonuses, never more than MAX_ENERGY.</summary>
        public static int EnergyFor(ContentTable content, GameState state, string p)
        {
            bool lastWord = state.Turn == Rules.ExtendedTurns && state.MaxTurns == Rules.ExtendedTurns;
            int idx = state.Turn - 1;
            int baseEnergy = idx >= 0 && idx < Rules.EnergyCurve.Length ? Rules.EnergyCurve[idx] : Rules.EnergyCap;
            var ps = state.Players[p];
            int n = (lastWord ? Rules.LastWordEnergy : Math.Min(baseEnergy, Rules.EnergyCap)) + (ps.EnergyBonus ?? 0) + (ps.EnergyNextTurn ?? 0);
            foreach (var c in HasEstablishedAnywhere(content, state, p, "extraEnergy")) n += AmountOf(content, c);
            foreach (var t in StandingAnywhere(content, state, p, "extraEnergy")) n += TeamUpAmount(t);
            return Math.Min(n, Rules.MaxEnergy);
        }

        /// <summary>Energy cost of a card. With a state and player, every discount that applies right now is taken off (never below 0).</summary>
        public static int CardCost(ContentTable content, string cardId, GameState state = null, string p = null)
        {
            content.CharacterById.TryGetValue(cardId, out var cdef);
            content.EventById.TryGetValue(cardId, out var edef);
            if (cdef == null && edef == null) return 0;
            int n = cdef != null ? cdef.Cost : edef.Cost;
            if (state != null && p != null)
            {
                var ps = state.Players[p];
                n -= ps.Discounts != null && ps.Discounts.TryGetValue(cardId, out var disc) ? disc : 0;
                if (cdef != null)
                {
                    if (ps.NextCharacterDiscount != null && state.Turn > ps.NextCharacterDiscount.Since) n -= ps.NextCharacterDiscount.Amount;
                    foreach (var c in HasEstablishedAnywhere(content, state, p, "discountCharacters")) n -= AmountOf(content, c);
                    foreach (var t in StandingAnywhere(content, state, p, "discountCharacters")) n -= TeamUpAmount(t);
                    foreach (var c in HasEstablishedAnywhere(content, state, p, "discountTag"))
                    {
                        var eff = CharDef(content, c.DefId).Established.Effect;
                        if (cdef.Tags.Contains(eff.Str("tag"))) n -= eff.Int("amount");
                    }
                    var td = cdef.Passive?.TagDiscount;
                    if (td != null) n -= td.Amount * CharsOf(state, p).Count(x => CharDef(content, x.DefId).Tags.Contains(td.Tag));
                }
                else
                {
                    foreach (var c in HasEstablishedAnywhere(content, state, p, "discountEvents")) n -= AmountOf(content, c);
                }
            }
            return Math.Max(0, n);
        }

        /// <summary>Why a card costs less than printed right now, for the UI. Empty when it costs full price.</summary>
        public static List<string> CostBreakdown(ContentTable content, GameState state, string p, string cardId)
        {
            var o = new List<string>();
            content.CharacterById.TryGetValue(cardId, out var cdef);
            content.EventById.TryGetValue(cardId, out var edef);
            if (cdef == null && edef == null) return o;
            var ps = state.Players[p];
            int earned = ps.Discounts != null && ps.Discounts.TryGetValue(cardId, out var disc) ? disc : 0;
            if (earned != 0) o.Add($"−{earned} earned while in hand");
            if (cdef != null)
            {
                foreach (var c in HasEstablishedAnywhere(content, state, p, "discountCharacters")) o.Add($"−{AmountOf(content, c)} {CharDef(content, c.DefId).Name}");
                foreach (var c in HasEstablishedAnywhere(content, state, p, "discountTag"))
                {
                    var eff = CharDef(content, c.DefId).Established.Effect;
                    if (cdef.Tags.Contains(eff.Str("tag"))) o.Add($"−{eff.Int("amount")} {CharDef(content, c.DefId).Name} ({eff.Str("tag")})");
                }
                var td = cdef.Passive?.TagDiscount;
                if (td != null)
                {
                    int n = CharsOf(state, p).Count(x => CharDef(content, x.DefId).Tags.Contains(td.Tag));
                    if (n != 0) o.Add($"−{td.Amount * n} for {n} {td.Tag} Character{(n > 1 ? "s" : "")} on the board");
                }
            }
            else
            {
                foreach (var c in HasEstablishedAnywhere(content, state, p, "discountEvents")) o.Add($"−{AmountOf(content, c)} {CharDef(content, c.DefId).Name}");
            }
            return o;
        }

        /// <summary>Total Energy a plan spends on plays, with discounts when a state and player are given.</summary>
        public static int PlanCost(ContentTable content, TurnPlan plan, GameState state = null, string p = null) => plan.Plays.Sum(pl => CardCost(content, pl.CardId, state, p));

        /// <summary>Open Gate slots for p at a Location, after planned Characters already committed there.</summary>
        public static int GateRoom(GameState state, int location, string p, int planned = 0) => Rules.GateCapacity - CharsAt(state, location, p, Rules.ZoneGate).Count - planned;

        /// <summary>Force a Threat needs this turn, after Ogun-style reductions from either player.</summary>
        public static int ThreatForceNeeded(ContentTable content, GameState state, ThreatInstance t)
        {
            int n = t.ForceRequired;
            foreach (var p in Rules.Players) foreach (var o in HasEstablished(content, state, p, t.Location, "weakenThreatsHere")) n -= AmountOf(content, o);
            return Math.Max(1, n);
        }

        public static int RelocationsAllowed(ContentTable content, GameState state, string p)
        {
            int n = 1 + (state.Players[p].RelocationsBonus ?? 0);
            foreach (var c in HasEstablishedAnywhere(content, state, p, "extraRelocation")) n += AmountOf(content, c);
            foreach (var t in StandingAnywhere(content, state, p, "extraRelocation")) n += TeamUpAmount(t);
            return n;
        }

        // ---------- team-ups ----------

        /// <summary>Both members Established at location for owner.</summary>
        public static bool TeamUpAssembled(GameState state, TeamUpDef tu, string owner, int location)
        {
            var inside = CharsAt(state, location, owner, Rules.ZoneInside).Select(c => c.DefId).ToList();
            return tu.Members.All(m => inside.Contains(m));
        }

        public static List<TeamUpDef> StandingAt(ContentTable content, GameState state, string owner, int location, string type)
        {
            return content.TeamUps.Where(t => t.Kind == "standing" && t.Effect?.Type == type && TeamUpAssembled(state, t, owner, location)).ToList();
        }

        public static List<TeamUpDef> StandingAnywhere(ContentTable content, GameState state, string owner, string type)
        {
            return content.TeamUps.Where(t => t.Kind == "standing" && t.Effect?.Type == type && state.Locations.Any(l => TeamUpAssembled(state, t, owner, l.Index))).ToList();
        }

        public static bool SwornAt(ContentTable content, GameState state, string owner, int location) => StandingAt(content, state, owner, location, "sworn").Count > 0;

        public static string IsBlockedFromEntering(ContentTable content, GameState state, CharacterInstance c)
        {
            if (SwornAt(content, state, c.Owner, c.Location)) return null;
            if (HasEstablished(content, state, c.Owner, c.Location, "noBlockHere").Count > 0) return null;
            if (HasEstablished(content, state, c.Owner, c.Location, "sanctuary").Count > 0) return null;
            if (state.Players[c.Owner].DefendedTurn == state.Turn) return null;
            if (c.BlockedEnterTurn == state.Turn) return "blocked by an opposing Character";
            var door = state.Locations[c.Location].Threats.FirstOrDefault(t => content.ThreatById[t.DefId].Effect == "blockEntry" && (!content.ThreatById[t.DefId].Split || t.Target == c.Owner));
            if (door != null) return $"blocked by {content.ThreatById[door.DefId].Name}";
            return null;
        }

        // ---------- legal options ----------

        public static LegalOptions LegalOptionsFor(ContentTable content, GameState state, string p)
        {
            var ps = state.Players[p];
            var plays = new List<PlayOption>();
            var seen = new HashSet<string>();
            foreach (var cardId in ps.Hand)
            {
                if (cardId == "hidden" || seen.Contains(cardId)) continue;
                seen.Add(cardId);
                if (content.CharacterById.TryGetValue(cardId, out var def))
                {
                    // Informants are planted on the other side: they need one of the opponent's Gate slots.
                    var side = IsInformantDef(def) ? Rules.Other(p) : p;
                    var locs = state.Locations.Where(l => !l.Lost && GateOpen(state, l.Index, side)).Select(l => l.Index).ToList();
                    if (locs.Count > 0)
                    {
                        plays.Add(new PlayOption
                        {
                            CardId = cardId,
                            Kind = "character",
                            Locations = locs,
                            NeedsLocation = true,
                            NeedsTarget = def.Reveal?.NeedsTarget,
                            DirectEntry = def.Keywords.Contains("DIRECT_ENTRY"),
                            StraightInside = def.Keywords.Contains("STRAIGHT_INSIDE"),
                        });
                    }
                }
                else if (content.EventById.TryGetValue(cardId, out var edef))
                {
                    plays.Add(new PlayOption
                    {
                        CardId = cardId,
                        Kind = "event",
                        // Events go in the Event slot under a Location. The oath needs a Threat to swear against.
                        Locations = state.Locations.Where(l => !l.Lost && (edef.Effect?.Type != "oath" || l.Threats.Count > 0)).Select(l => l.Index).ToList(),
                        NeedsLocation = true,
                        DirectEntry = false,
                    });
                }
                else
                {
                    throw new KeyNotFoundException($"Unknown card: {cardId}");
                }
            }
            var mine = CharsOf(state, p);
            bool Informant(CharacterInstance c) => IsInformantDef(CharDef(content, c.DefId)) && c.Amnestied != true;
            var enters = mine.Where(c => c.Zone == Rules.ZoneGate && c.Ready && !state.Locations[c.Location].Lost && InsideCapacity(content, state, c.Location) > 0 && !Informant(c)).Select(c => c.Uid).ToList();
            // Inside Characters relocate and arrive Waiting; Gate Characters relocate too and stay as Ready as they were.
            var relocations = mine
                .Where(c => !state.Locations[c.Location].Lost && LockReason(content, state, c) == null)
                .Select(c => new RelocationOption
                {
                    Uid = c.Uid,
                    Destinations = state.Locations.Where(l => l.Index != c.Location && !l.Lost && GateOpen(state, l.Index, p)).Select(l => l.Index).ToList(),
                })
                .Where(r => r.Destinations.Count > 0)
                .ToList();
            var confronts = new List<ConfrontOption>();
            foreach (var loc in state.Locations)
            {
                foreach (var t in loc.Threats)
                {
                    if (!CanConfront(content, state, t, p)) continue;
                    var chars = mine.Where(c => c.Location == loc.Index && !Informant(c)).Select(c => c.Uid).ToList();
                    if (chars.Count == 0) continue;
                    confronts.Add(new ConfrontOption { ThreatUid = t.Uid, Location = loc.Index, Chars = chars, Assist = IsAssist(content, t, p) });
                }
            }
            int effective = EffectiveStakes(state);
            bool canStand = !ps.StandUsed && effective < Rules.MaxStakes && (state.Turn < state.MaxTurns || state.MaxTurns < Rules.ExtendedTurns);
            return new LegalOptions
            {
                Plays = plays,
                Enters = enters,
                Relocations = relocations,
                RelocationsAllowed = RelocationsAllowed(content, state, p),
                Energy = EnergyFor(content, state, p),
                Confronts = confronts,
                CanStand = canStand,
                Summonable = state.Locations.Where(l => l.Revealed && !l.Lost && l.Sanctified != true && l.Threats.Count > 0 && mine.Any(c => c.Location == l.Index)).Select(l => l.Index).ToList(),
                CanStepOff = ps.CannotStepOff != true,
                ProposedStakes = Math.Min(Rules.MaxStakes, effective * Rules.StandMultiplier(state.Turn)),
                PendingStakes = effective,
                StepOffCost = state.Stakes,
            };
        }

        /// <summary>Returns a list of problems; an empty list means the plan is legal.</summary>
        public static List<string> ValidatePlan(ContentTable content, GameState state, string p, TurnPlan plan)
        {
            var errors = new List<string>();
            var opts = LegalOptionsFor(content, state, p);
            int cost = PlanCost(content, plan, state, p);
            if (cost > opts.Energy) errors.Add($"Not enough Energy: this plan costs {cost} and you have {opts.Energy}.");
            var usedCards = new HashSet<string>();
            var gateUse = new Dictionary<int, int>();
            var eventUse = new Dictionary<int, int>();
            var oppGateUse = new Dictionary<int, int>();
            // Gate slots the plan's own Character cards take, per Location, counted up front for the room checks below.
            var plannedGates = new Dictionary<int, int>();
            int Bump(Dictionary<int, int> d, int k) { d[k] = (d.TryGetValue(k, out var v) ? v : 0) + 1; return d[k]; }
            int At(Dictionary<int, int> d, int k) => d.TryGetValue(k, out var v) ? v : 0;
            foreach (var play in plan.Plays)
            {
                if (content.CharacterById.TryGetValue(play.CardId, out var d) && !IsInformantDef(d)) Bump(plannedGates, play.Location);
            }
            foreach (var play in plan.Plays)
            {
                content.CharacterById.TryGetValue(play.CardId, out var pd);
                if (play.Enter == true)
                {
                    if (pd == null || !pd.Keywords.Contains("DIRECT_ENTRY")) errors.Add("Only a Direct Entry Character can enter the turn it is played.");
                }
                if (usedCards.Contains(play.CardId)) errors.Add("A card can only be played once.");
                usedCards.Add(play.CardId);
                var opt = opts.Plays.FirstOrDefault(o => o.CardId == play.CardId);
                if (opt == null)
                {
                    errors.Add("That card cannot be played.");
                    continue;
                }
                if (opt.NeedsLocation && !opt.Locations.Contains(play.Location)) errors.Add("That Location is not available for this card.");
                if (opt.Kind == "character" && pd != null && IsInformantDef(pd))
                {
                    int n = Bump(oppGateUse, play.Location);
                    if (GateRoom(state, play.Location, Rules.Other(p), n - 1) <= 0) errors.Add("An Informant needs one of the opponent's Gate slots open at that Location.");
                }
                else if (opt.Kind == "character")
                {
                    int n = Bump(gateUse, play.Location);
                    if (GateRoom(state, play.Location, p, n - 1) <= 0) errors.Add("No open Gate slot for that card.");
                }
                else
                {
                    int n = Bump(eventUse, play.Location);
                    if (n > 1) errors.Add("One Event per Location per turn: that Event slot is taken.");
                }
                if (opt.NeedsTarget == "friendlyCharAndLocation" && play.Target?.CharUid != null)
                {
                    state.Characters.TryGetValue(play.Target.CharUid, out var c);
                    if (c == null || c.Owner != p) errors.Add("Invalid target Character.");
                    else if (IsInformantDef(CharDef(content, c.DefId)) && pd?.Reveal?.Effect?.Type == "conductor") errors.Add("Harriet will not conduct an Informant.");
                    if (play.Target.Location != null && state.Locations[play.Target.Location.Value].Lost) errors.Add("That Location is Lost.");
                    if (play.Target.Location == null || play.Target.Location.Value == c?.Location) errors.Add("Choose a different destination.");
                    else if (c != null && !state.Locations[play.Target.Location.Value].Lost)
                    {
                        // Room where it is going, after the cards played there this turn: the Gates, or Inside for Harriet's passenger.
                        int dest = play.Target.Location.Value;
                        var rev = pd?.Reveal?.Effect?.Type;
                        bool gatesLeft = GateRoom(state, dest, p, At(plannedGates, dest)) > 0;
                        var moved = c.ShallowCopy();
                        moved.Location = dest;
                        bool insideOk = rev == "conductor" && InsideOpen(content, state, dest, p) && IsBlockedFromEntering(content, state, moved) == null;
                        if (!gatesLeft && !insideOk) errors.Add($"No room at that Location for {CharDef(content, c.DefId).Name}.");
                    }
                }
                if (opt.NeedsTarget == "friendlyInsideChar" && play.Target?.CharUid != null)
                {
                    state.Characters.TryGetValue(play.Target.CharUid, out var c);
                    if (c == null || c.Owner != p || c.Zone != Rules.ZoneInside || c.Location == play.Location) errors.Add("Invalid target Character.");
                }
            }
            foreach (var uid in plan.Enters)
            {
                if (!opts.Enters.Contains(uid)) errors.Add("A Character selected to enter is not Ready.");
            }
            int counted = plan.Relocations.Count(r =>
            {
                state.Characters.TryGetValue(r.Uid, out var c);
                return !(c != null && (LocDef(content, state, c.Location).Effect?.Type == "hub" || HasEstablished(content, state, c.Owner, c.Location, "freeDeparture").Count > 0));
            });
            if (counted > opts.RelocationsAllowed) errors.Add($"Only {opts.RelocationsAllowed} Relocation(s) allowed this turn (Lagos departures are free).");
            foreach (var r in plan.Relocations)
            {
                var opt = opts.Relocations.FirstOrDefault(o => o.Uid == r.Uid);
                if (opt == null || !opt.Destinations.Contains(r.To)) errors.Add("Invalid Relocation.");
                if (plan.Enters.Contains(r.Uid)) errors.Add("A Character cannot enter and relocate in the same turn.");
            }
            var busy = new HashSet<string>(plan.Enters);
            foreach (var r in plan.Relocations) busy.Add(r.Uid);
            var seenConfront = new HashSet<string>();
            foreach (var c in plan.Confronts)
            {
                var opt = opts.Confronts.FirstOrDefault(o => o.ThreatUid == c.ThreatUid);
                if (opt == null || !opt.Chars.Contains(c.Uid)) errors.Add("Invalid confrontation.");
                if (busy.Contains(c.Uid)) errors.Add("A Character cannot confront and move in the same turn.");
                if (seenConfront.Contains(c.Uid)) errors.Add("A Character can only confront one Threat per turn.");
                seenConfront.Add(c.Uid);
            }
            if (plan.StandOnBusiness == true && !opts.CanStand) errors.Add("Stand on Business is not available.");
            if (plan.StepOff == true && !opts.CanStepOff) errors.Add("You Stood on Business: you cannot Sit Down.");
            if (plan.Summon != null && !opts.Summonable.Contains(plan.Summon.Location)) errors.Add("No Summon is possible there.");
            return errors;
        }

        public static int TotalForce(ContentTable content, GameState state, string p) => CharsOf(state, p).Sum(c => CharDef(content, c.DefId).Force);

        public static string[] PlayerOrder(GameState state) => state.Initiative == Rules.PlayerA ? new[] { Rules.PlayerA, Rules.PlayerB } : new[] { Rules.PlayerB, Rules.PlayerA };
    }
}
