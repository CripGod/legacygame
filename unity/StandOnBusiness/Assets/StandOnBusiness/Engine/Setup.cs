using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    /// <summary>
    /// A port of src/engine/setup.ts: creating a match, drawing, spawning Threats, the Location draw, retelling and
    /// transforming Locations, and starting a turn. The RNG is consumed in exactly the web engine's order, so a match
    /// created from the same options is the same match (SetupTests checks every golden trace's initial state).
    /// </summary>
    public static class Setup
    {
        const string DefaultHandleA = "Silverlake Slayer";
        const string DefaultHandleB = "Harborlight";
        const string DefaultAvatarA = "frederick_douglass";
        const string DefaultAvatarB = "marcus_garvey";
        const string DefaultDeckA = "railroad";
        const string DefaultDeckB = "blackstar";

        static PlayerState MakePlayer(string id, string handle, string avatar, List<string> deck)
        {
            return new PlayerState
            {
                Id = id,
                Handle = handle,
                AvatarDefId = avatar,
                Deck = deck,
                DeckCount = deck.Count,
                Hand = new List<string>(),
                Discard = new List<string>(),
                Setbacks = 0,
                StandUsed = false,
                Spawned = new List<string>(),
                Solidarity = 0,
                Legend = 0,
            };
        }

        static string Get(Dictionary<string, string> d, string key, string fallback) => d != null && d.TryGetValue(key, out var v) && v != null ? v : fallback;

        /// <summary>Create a new match. Turn 1 is started immediately (hands dealt, first draw taken).</summary>
        public static GameState CreateMatch(ContentTable content, MatchOptions opts)
        {
            var rng = Rng.Make(opts.Seed);
            var keyA = Get(opts.DeckKeys, Rules.PlayerA, DefaultDeckA);
            var keyB = Get(opts.DeckKeys, Rules.PlayerB, DefaultDeckB);
            List<string> FromKey(string k)
            {
                if (k == "random") return RandomDeck(content, n => Rng.NextInt(rng, n));
                var deck = content.Decks.TryGetValue(k, out var d) ? d : content.Decks[DefaultDeckA];
                return new List<string>(deck.Cards);
            }
            var decks = new Dictionary<string, List<string>>();
            if (opts.Decks != null)
            {
                decks[Rules.PlayerA] = new List<string>(opts.Decks[Rules.PlayerA]);
                decks[Rules.PlayerB] = new List<string>(opts.Decks[Rules.PlayerB]);
            }
            else
            {
                // The object literal evaluates A before B, so a random deck for A draws from the RNG first.
                decks[Rules.PlayerA] = FromKey(keyA);
                decks[Rules.PlayerB] = FromKey(keyB);
            }
            foreach (var p in Rules.Players)
            {
                var errs = ValidateDeck(content, decks[p]);
                if (errs.Count > 0) throw new ArgumentException($"Deck {p} invalid: {string.Join(" ", errs)}");
            }
            var handleA = Get(opts.Handles, Rules.PlayerA, DefaultHandleA);
            var handleB = Get(opts.Handles, Rules.PlayerB, DefaultHandleB);
            var avatarA = Get(opts.Avatars, Rules.PlayerA, DefaultAvatarA);
            var avatarB = Get(opts.Avatars, Rules.PlayerB, DefaultAvatarB);

            // Weighted draw without replacement (rare Locations appear less often).
            var chosen = new List<LocationDef>();
            while (chosen.Count < 3)
            {
                var next = DrawLocationDef(content, rng, chosen.Select(l => l.Id).ToList());
                if (next == null) break;
                chosen.Add(next);
            }
            var locations = new List<LocationState>();
            for (int index = 0; index < chosen.Count; index++)
            {
                locations.Add(new LocationState
                {
                    Index = index,
                    DefId = chosen[index].Id,
                    Revealed = false,
                    Threats = new List<ThreatInstance>(),
                    Lost = false,
                    TempInfluence = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 },
                });
            }
            var revealOrder = Rng.Shuffle(rng, new List<int> { 0, 1, 2 });

            var players = new Dictionary<string, PlayerState>
            {
                [Rules.PlayerA] = MakePlayer(Rules.PlayerA, handleA, avatarA, Rng.Shuffle(rng, decks[Rules.PlayerA])),
            };
            players[Rules.PlayerB] = MakePlayer(Rules.PlayerB, handleB, avatarB, Rng.Shuffle(rng, decks[Rules.PlayerB]));
            var initiative = Rng.NextInt(rng, 2) == 0 ? Rules.PlayerA : Rules.PlayerB;

            // Once-per-match dice for arrivals that only happen some matches, each from its own seed.
            var spawnRolls = new Dictionary<string, bool>();
            var seedText = opts.Seed.ToString(CultureInfo.InvariantCulture);
            foreach (var c in content.Characters)
            {
                if (c.Spawn?.Chance == null) continue;
                spawnRolls[c.Id] = Rng.NextFloat(Rng.Make(Rng.HashSeed($"{seedText}:arrival:{c.Id}"))) < c.Spawn.Chance.Value;
            }
            foreach (var e in content.Events)
            {
                if (e.Spawn?.Chance == null) continue;
                spawnRolls[e.Id] = Rng.NextFloat(Rng.Make(Rng.HashSeed($"{seedText}:arrival:{e.Id}"))) < e.Spawn.Chance.Value;
            }

            var state = new GameState
            {
                Seed = opts.Seed,
                Rng = rng,
                Turn = 0,
                Phase = Rules.PhasePlanning,
                Players = players,
                Locations = locations,
                RevealOrder = revealOrder,
                TeamUps = new Dictionary<string, TeamUpClaim>(),
                Characters = new Dictionary<string, CharacterInstance>(),
                Initiative = initiative,
                Stakes = 1,
                PendingRaises = new List<PendingRaise>(),
                ThreatsSeen = new List<string>(),
                SpawnRolls = spawnRolls,
                MaxTurns = Rules.Turns,
                LeadHistory = new List<LeadRecord>(),
                NextUid = 1,
                LastEvents = new List<GameEvent>(),
                Stats = new MatchStats
                {
                    Plays = new Dictionary<string, List<string>> { [Rules.PlayerA] = new List<string>(), [Rules.PlayerB] = new List<string>() },
                    Relocations = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 },
                    Assists = new Dictionary<string, AssistStat> { [Rules.PlayerA] = new AssistStat(), [Rules.PlayerB] = new AssistStat() },
                    LeadChanges = 0,
                    FinalTurnFlips = 0,
                    StandTurns = new List<StandTurn>(),
                    Summons = new List<SummonRecord>(),
                    GateTurns = 0,
                    InsideTurns = 0,
                },
            };

            foreach (var p in Rules.Players)
            {
                for (int i = 0; i < Rules.StartingHand; i++) DrawCard(content, state, p, null);
                // Turn 1 grants 1 Energy: make sure the opening hand holds a 1-cost Character when the deck has one
                // (any 1-cost card failing that), so the first turn is never a forced pass.
                var ps = state.Players[p];
                bool Cheap(string id) => CardCost(content, id) <= 1;
                bool CheapChar(string id) => Cheap(id) && content.CharacterById.ContainsKey(id);
                if (!ps.Hand.Any(CheapChar))
                {
                    int i = ps.Deck.FindIndex(CheapChar);
                    if (i < 0 && !ps.Hand.Any(Cheap)) i = ps.Deck.FindIndex(Cheap);
                    if (i >= 0)
                    {
                        var swapOut = ps.Hand[ps.Hand.Count - 1];
                        ps.Hand[ps.Hand.Count - 1] = ps.Deck[i];
                        ps.Deck[i] = swapOut;
                    }
                }
            }
            var events = new List<GameEvent>();
            StartTurn(content, state, events);
            state.LastEvents = events;
            return state;
        }

        /// <summary>The printed cost of a card, 0 for an id the content does not know (as CARD_BY_ID[id]?.cost ?? 0).</summary>
        public static int CardCost(ContentTable content, string id)
        {
            if (content.CharacterById.TryGetValue(id, out var c)) return c.Cost;
            if (content.EventById.TryGetValue(id, out var e)) return e.Cost;
            return 0;
        }

        public static string CardName(ContentTable content, string id)
        {
            if (content.CharacterById.TryGetValue(id, out var c)) return c.Name;
            if (content.EventById.TryGetValue(id, out var e)) return e.Name;
            return id;
        }

        /// <summary>A seeded random deck: DECK_SIZE - 2 distinct Characters (one Mythic first) and two Events.</summary>
        public static List<string> RandomDeck(ContentTable content, Func<int, int> pick)
        {
            var mythics = content.Characters.Where(c => c.Category == "mythic" && c.Spawn == null).Select(c => c.Id).ToList();
            var first = mythics[pick(mythics.Count)];
            var pool = content.Characters.Where(c => c.Category != "gathering" && c.Spawn == null && !c.Hidden && c.Id != first).Select(c => c.Id).ToList();
            var chosen = new List<string> { first };
            while (chosen.Count < Rules.DeckSize - 2)
            {
                int i = pick(pool.Count);
                chosen.Add(pool[i]);
                pool.RemoveAt(i);
            }
            var ev = content.Events.Where(e => e.Spawn == null).Select(e => e.Id).ToList();
            var picked = new List<string>();
            while (picked.Count < 2)
            {
                int i = pick(ev.Count);
                picked.Add(ev[i]);
                ev.RemoveAt(i);
            }
            chosen.AddRange(picked);
            return chosen;
        }

        public static List<string> ValidateDeck(ContentTable content, List<string> cards)
        {
            var errors = new List<string>();
            if (cards.Count != Rules.DeckSize) errors.Add($"Deck must have {Rules.DeckSize} cards (has {cards.Count}).");
            var seen = new HashSet<string>();
            int events = 0;
            foreach (var id in cards)
            {
                if (content.CharacterById.TryGetValue(id, out var def))
                {
                    if (def.Category == "gathering" || def.Spawn != null) errors.Add($"{def.Name} arrives on its own and cannot be put in a deck.");
                    if (def.Hidden) errors.Add($"{def.Name} is not in the game right now.");
                    if (seen.Contains(id)) errors.Add($"Duplicate Character {def.Name}.");
                    seen.Add(id);
                }
                else if (content.EventById.ContainsKey(id))
                {
                    events++;
                }
                else
                {
                    errors.Add($"Unknown card {id}.");
                }
            }
            if (events > 2) errors.Add($"Maximum 2 Event cards (has {events}).");
            if (!cards.Any(id => content.CharacterById.TryGetValue(id, out var c) && c.Category == "mythic")) errors.Add("Every deck carries at least one Mythic.");
            return errors;
        }

        /// <summary>Draw one card. A full hand (MAX_HAND) burns the draw to the discard pile; events, when given, get the explanation.</summary>
        public static string DrawCard(ContentTable content, GameState state, string p, List<GameEvent> events)
        {
            var ps = state.Players[p];
            bool full = ps.Hand.Count >= Rules.MaxHand;
            string card = null;
            if (ps.Deck.Count > 0)
            {
                card = ps.Deck[0];
                ps.Deck.RemoveAt(0);
            }
            if (card != null)
            {
                ps.DeckCount = ps.Deck.Count;
                if (full)
                {
                    ps.Discard.Add(card);
                    events?.Add(new GameEvent { Type = "info", Text = $"{ps.Handle}'s hand is full ({Rules.MaxHand}): {CardName(content, card)} is discarded.", Player = p, CardId = card, PrivateTo = p });
                    return null;
                }
                ps.Hand.Add(card);
            }
            else if (ps.DeckCount > 0 && ps.Deck.Count == 0)
            {
                // Redacted view: deck contents unknown; just decrement the count.
                ps.DeckCount--;
                if (!full) ps.Hand.Add("hidden");
            }
            return card;
        }

        /// <summary>force: a Threat already on its way (a Mob carried into a retold Location) ignores the new story's protections.</summary>
        public static void SpawnThreat(ContentTable content, GameState state, int location, string threatId, List<GameEvent> events, bool force = false)
        {
            content.ThreatById.TryGetValue(threatId, out var def);
            var loc = state.Locations[location];
            if (def == null || loc.Lost || loc.Sanctified == true) return;
            content.LocationById.TryGetValue(loc.DefId, out var locDef);
            if (!force && loc.Revealed && locDef?.NoThreats == true) return;
            if (!force && locDef?.ImmuneThreats != null && locDef.ImmuneThreats.Contains(threatId)) return;
            ThreatInstance Make(string target) => new ThreatInstance
            {
                Uid = $"t{state.NextUid++}",
                DefId = threatId,
                Location = location,
                Target = target,
                ForceRequired = def.Force,
                SpawnedTurn = state.Turn,
            };
            if (def.Split)
            {
                foreach (var p in Rules.Players)
                {
                    if (loc.Threats.Any(t => t.DefId == threatId && t.Target == p)) continue;
                    loc.Threats.Add(Make(p));
                }
            }
            else
            {
                if (loc.Threats.Any(t => t.DefId == threatId)) return;
                loc.Threats.Add(Make(null));
            }
            (state.ThreatsSeen ??= new List<string>()).Add(threatId);
            events.Add(new GameEvent
            {
                Type = "threatSpawned",
                Text = $"{def.Name} appears at {LocName(content, state, location)}.",
                Location = location,
                Data = new JObject { ["threatId"] = threatId },
            });
        }

        /// <summary>One weighted draw from the Location pool, skipping ids already in the match. Uses the match RNG, so it replays identically.</summary>
        public static LocationDef DrawLocationDef(ContentTable content, RngState rng, List<string> exclude)
        {
            var pool = content.Locations.Where(l => l.NotInPool != true && !exclude.Contains(l.Id)).ToList();
            if (pool.Count == 0) return null;
            double total = 0;
            foreach (var l in pool) total += l.Weight ?? 1;
            double r = Rng.NextFloat(rng) * total;
            int idx = 0;
            for (; idx < pool.Count - 1; idx++)
            {
                r -= pool[idx].Weight ?? 1;
                if (r <= 0) break;
            }
            return pool[idx];
        }

        /// <summary>Anansi retells a Location: it becomes a random Location not in this match, with his web spun over it.</summary>
        public static bool RetellLocation(ContentTable content, GameState state, int index, string by, List<GameEvent> events)
        {
            var loc = state.Locations[index];
            content.LocationById.TryGetValue(loc.DefId, out var from);
            if (!loc.Revealed || loc.Lost || loc.Webbed == true) return false;
            var into = DrawLocationDef(content, state.Rng, state.Locations.Select(l => l.DefId).ToList());
            if (into == null) return false;
            if (from?.TimedThreat != null && from.TimedThreat.Turn > state.Turn && !loc.Threats.Any(t => t.DefId == from.TimedThreat.ThreatId)) loc.PendingTimedThreat = from.TimedThreat;
            else if (into.TimedThreat != null && into.TimedThreat.Turn > state.Turn) loc.PendingTimedThreat = into.TimedThreat;
            loc.RetoldFrom = loc.DefId;
            loc.DefId = into.Id;
            loc.RevealedTurn = state.Turn;
            loc.Webbed = true;
            loc.WebbedBy = by;
            events.Add(new GameEvent
            {
                Type = "locationTransformed",
                Text = $"Anansi retells {from?.Name ?? "the Location"}: it is now {into.Name}, with his web over it. The small grow here and the large shrink.",
                Location = index,
                Data = new JObject { ["from"] = from?.Id, ["to"] = into.Id, ["retold"] = true, ["webbed"] = true },
            });
            return true;
        }

        public static string LocName(ContentTable content, GameState state, int index)
        {
            var loc = state.Locations[index];
            if (!loc.Revealed) return $"Location {index + 1}";
            return content.LocationById.TryGetValue(loc.DefId, out var d) ? d.Name : $"Location {index + 1}";
        }

        /// <summary>The web engine leaves an undefined target out of the event data; a null must not become a JSON null.</summary>
        static JObject WithTarget(JObject data, string target, JObject more)
        {
            if (target != null) data["target"] = target;
            if (more != null) foreach (var p in more.Properties()) data[p.Name] = p.Value;
            return data;
        }

        static bool IsInformantDef(ContentTable content, string defId) => content.CharacterById.TryGetValue(defId, out var d) && d.Keywords.Contains("INFORMANT");

        /// <summary>The Black Star arrives: the Location becomes its destination and everyone aboard benefits.</summary>
        public static void TransformLocation(ContentTable content, GameState state, int index, string intoId, List<GameEvent> events)
        {
            var loc = state.Locations[index];
            content.LocationById.TryGetValue(loc.DefId, out var from);
            if (!content.LocationById.TryGetValue(intoId, out var into)) return;
            loc.DefId = intoId;
            loc.RevealedTurn = state.Turn;
            events.Add(new GameEvent
            {
                Type = "locationTransformed",
                Text = $"{from?.Name ?? "The Location"} arrives: it is now {into.Name}.",
                Location = index,
                Data = new JObject { ["from"] = from?.Id, ["to"] = intoId },
            });
            foreach (var t in loc.Threats)
            {
                var tn = content.ThreatById.TryGetValue(t.DefId, out var td) ? td.Name : "The Threat";
                events.Add(new GameEvent
                {
                    Type = "threatNeutralized",
                    Text = $"{tn} at {into.Name} is left behind on the dock: nobody broke it, and nobody is paid for it.",
                    Location = index,
                    Data = WithTarget(new JObject { ["threatUid"] = t.Uid, ["defId"] = t.DefId }, t.Target, new JObject { ["leftBehind"] = true }),
                });
            }
            loc.Threats = new List<ThreatInstance>();
            var aboard = state.Characters.Values.Where(c => c.Location == index).ToList();
            foreach (var c in aboard) c.PermInfluence += 1;
            if (aboard.Count > 0) events.Add(new GameEvent { Type = "info", Text = $"Everyone aboard gains +1 Influence ({aboard.Count} Character{(aboard.Count > 1 ? "s" : "")}).", Location = index });
            var order = state.Initiative == Rules.PlayerA ? new[] { Rules.PlayerA, Rules.PlayerB } : new[] { Rules.PlayerB, Rules.PlayerA };
            foreach (var p in order)
            {
                foreach (var c in aboard.Where(x => x.Owner == p && x.Zone == Rules.ZoneGate && !IsInformantDef(content, x.DefId)).ToList())
                {
                    int inside = state.Characters.Values.Count(x => x.Owner == p && x.Location == index && x.Zone == Rules.ZoneInside);
                    if (inside >= 5) break;
                    c.Zone = Rules.ZoneInside;
                    c.Ready = false;
                    c.ArrivedTurn = state.Turn;
                    var cn = content.CharacterById.TryGetValue(c.DefId, out var cd) ? cd.Name : c.DefId;
                    events.Add(new GameEvent { Type = "entered", Text = $"{cn} ({state.Players[p].Handle}) walks straight into {into.Name}.", Uid = c.Uid, Location = index, Player = p });
                }
            }
        }

        /// <summary>Begin a new turn: advance the counter, draw, timed Threats, reset per-turn fields.</summary>
        public static void StartTurn(ContentTable content, GameState state, List<GameEvent> events)
        {
            state.Turn += 1;
            state.Phase = Rules.PhasePlanning;
            events.Add(new GameEvent { Type = "turnStart", Text = $"Turn {state.Turn} begins.", Data = new JObject { ["turn"] = state.Turn } });
            if (state.Turn > 1) state.Initiative = state.Initiative == Rules.PlayerA ? Rules.PlayerB : Rules.PlayerA;
            // The Last Word: the ninth turn, reached only by Standing on Business. Everything comes out.
            bool lastWord = state.Turn == Rules.ExtendedTurns && state.MaxTurns == Rules.ExtendedTurns;
            if (lastWord)
            {
                var draw = Rules.LastWordDraw == 1 ? "an extra card" : $"{Rules.LastWordDraw} extra cards";
                events.Add(new GameEvent
                {
                    Type = "lastWord",
                    Text = $"THE LAST WORD. Turn {Rules.ExtendedTurns} exists because somebody stood on business: {Rules.LastWordEnergy} Energy and {draw} for both sides. Whatever stands after this turn is the legacy.",
                    Data = new JObject { ["energy"] = Rules.LastWordEnergy, ["draw"] = Rules.LastWordDraw },
                });
            }
            foreach (var p in Rules.Players)
            {
                if (lastWord) for (int i = 0; i < Rules.LastWordDraw; i++) DrawCard(content, state, p, events);
                var card = DrawCard(content, state, p, events);
                if (card == null) continue;
                events.Add(new GameEvent { Type = "draw", Text = $"{state.Players[p].Handle} draws a card.", Player = p, CardId = card, PrivateTo = p });
                state.Players[p].DefendedLocation = null;
                state.Players[p].DefendedTurn = null;
                state.Players[p].ChairLocation = null;
            }
            // Reconstruction: a Lost Location comes back when the people who stayed rebuild it.
            foreach (var loc in state.Locations)
            {
                if (!loc.Lost || loc.LostTurn == null || state.Turn - loc.LostTurn.Value < Rules.ReconstructionTurns) continue;
                loc.Lost = false;
                loc.LostReason = null;
                loc.Rebuilt = true;
                loc.RebuiltTurn = state.Turn;
                foreach (var t in loc.Threats)
                {
                    var tn = content.ThreatById.TryGetValue(t.DefId, out var td) ? td.Name : "The Threat";
                    events.Add(new GameEvent { Type = "threatNeutralized", Text = $"{tn} at {LocName(content, state, loc.Index)} has moved on.", Location = loc.Index, Data = WithTarget(new JObject { ["threatUid"] = t.Uid, ["defId"] = t.DefId }, t.Target, null) });
                }
                loc.Threats = new List<ThreatInstance>();
                var stayed = state.Characters.Values.Where(c => c.Location == loc.Index && !IsInformantDef(content, c.DefId)).ToList();
                foreach (var c in stayed) c.PermInfluence += 1;
                var tail = stayed.Count > 0 ? $", and everyone here gains +1 Influence ({stayed.Count} Character{(stayed.Count > 1 ? "s" : "")})" : "";
                events.Add(new GameEvent { Type = "locationRebuilt", Text = $"{LocName(content, state, loc.Index)} is REBUILT: the people who stayed put it back up. It is back in play{tail}.", Location = loc.Index, Data = new JObject { ["stayed"] = stayed.Count } });
            }
            foreach (var loc in state.Locations)
            {
                content.LocationById.TryGetValue(loc.DefId, out var before);
                if (loc.Revealed && !loc.Lost && before?.TransformsInto != null && loc.RevealedTurn != null && state.Turn >= loc.RevealedTurn.Value + before.TransformsInto.AfterTurns)
                {
                    TransformLocation(content, state, loc.Index, before.TransformsInto.Id, events);
                }
            }
            foreach (var loc in state.Locations)
            {
                loc.FirstRelocatedThisTurn = null;
                loc.FirstRelocatedByOwner = new Dictionary<string, string>();
                loc.TempInfluence = new Dictionary<string, int> { [Rules.PlayerA] = 0, [Rules.PlayerB] = 0 };
                content.LocationById.TryGetValue(loc.DefId, out var def);
                if (loc.Revealed && def?.TimedThreat != null && def.TimedThreat.Turn == state.Turn)
                {
                    SpawnThreat(content, state, loc.Index, def.TimedThreat.ThreatId, events);
                }
                if (loc.PendingTimedThreat != null && loc.PendingTimedThreat.Turn == state.Turn)
                {
                    SpawnThreat(content, state, loc.Index, loc.PendingTimedThreat.ThreatId, events, true);
                    loc.PendingTimedThreat = null;
                }
            }
            // History moves: Turn 3 a random neutral Threat at a revealed Location without one, and on every turn after,
            // to the last, in most turns. The roll is taken only after Turn 3, as the web engine's short-circuit does.
            bool wave = state.Turn == Rules.WaveFromTurn
                || (state.Turn > Rules.WaveFromTurn && Rng.NextFloat(state.Rng) < Rules.LaterWaveChance);
            if (wave && state.RevealOrder.Count > 0)
            {
                var candidates = state.Locations.Where(l => l.Revealed && !l.Lost && l.Threats.Count == 0).ToList();
                if (candidates.Count > 0)
                {
                    var loc = Rng.Pick(state.Rng, candidates);
                    // A once-per-match Threat that has already come up is out of the pool; the others may repeat.
                    var seen = state.ThreatsSeen ?? new List<string>();
                    var pool = content.RandomThreatPool.Where(id => !(content.ThreatById.TryGetValue(id, out var td) && td.Once == true && seen.Contains(id))).ToList();
                    var threatId = Rng.Pick(state.Rng, pool.Count > 0 ? pool : content.RandomThreatPool);
                    SpawnThreat(content, state, loc.Index, threatId, events);
                }
            }
        }
    }
}
