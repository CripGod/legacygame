using System.Collections.Generic;
using System.Linq;

namespace StandOnBusiness.Engine
{
    /// <summary>
    /// Redacted views (view.ts). Everything a player (the board or the AI) is allowed to see comes through here; the AI
    /// consumes exactly this, never the true GameState.
    /// </summary>
    public static class View
    {
        public static GameState ViewFor(ContentTable content, GameState state, string p)
        {
            var v = Resolve.CloneState(state);
            var opp = Rules.Other(p);
            v.ViewFor = p;
            // Hidden draw order and RNG. You still know how many of your own Events are left to draw.
            v.Players[p].DeckEvents = state.Players[p].Deck.Count(id => content.EventById.ContainsKey(id));
            v.Players[opp].DeckEvents = null;
            v.Players[Rules.PlayerA].Deck = new List<string>();
            v.Players[Rules.PlayerB].Deck = new List<string>();
            v.Rng = new RngState { S = 0 };
            // Opponent hand.
            v.Players[opp].Hand = v.Players[opp].Hand.Select(_ => "hidden").ToList();
            v.Players[opp].KnownNextReveal = null;
            // Unrevealed Locations, except the one Dunbar foretold for this player: its name is theirs to see.
            foreach (var loc in v.Locations)
            {
                if (!loc.Revealed && v.Players[p].KnownNextReveal != loc.Index) loc.DefId = "unknown";
            }
            v.RevealOrder = new List<int>();
            v.SpawnRolls = new Dictionary<string, bool>();
            // Characters committed to hidden Locations are public once placed (they are at the Gates).
            foreach (var c in v.Characters.Values)
            {
                if (c.Owner == opp) c.WasHiddenAtCommit = null;
            }
            v.LastEvents = FilterEvents(v.LastEvents, p);
            return v;
        }

        public static List<GameEvent> FilterEvents(List<GameEvent> events, string p)
        {
            var outList = new List<GameEvent>();
            foreach (var e in events)
            {
                if (e.PrivateTo != null && e.PrivateTo != p) continue;
                if (e.Type == "draw" && e.Player != p)
                {
                    outList.Add(new GameEvent { Type = e.Type, Text = e.Text, Player = e.Player, Location = e.Location, Uid = e.Uid, CardId = null, PrivateTo = e.PrivateTo, Data = e.Data });
                }
                else outList.Add(e);
            }
            return outList;
        }
    }
}
