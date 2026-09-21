using System.Collections.Generic;

namespace StandOnBusiness.Engine
{
    // One golden trace (npm run golden): the match options, the state after setup, and every turn's plans, state and events.

    public sealed class TraceTurn
    {
        public int Turn;
        public Dictionary<string, TurnPlan> Plans = new Dictionary<string, TurnPlan>();
        public GameState State;
        public List<GameEvent> Events = new List<GameEvent>();
    }

    public sealed class GoldenTrace
    {
        public int Format;
        public ContentSource Source;
        public MatchOptions Options;
        public GameState Initial;
        public List<TraceTurn> Turns = new List<TraceTurn>();
        public MatchResult Result;

        public static GoldenTrace Parse(string json) => Json.Read<GoldenTrace>(json);
    }
}
