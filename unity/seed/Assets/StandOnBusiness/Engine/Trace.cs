using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    // One golden trace (npm run golden): the match options, the state after setup, and every turn's plans, state and events.

    public sealed class TraceTurn
    {
        public int Turn;
        public Dictionary<string, TurnPlan> Plans = new Dictionary<string, TurnPlan>();
        /// <summary>validatePlan on the state the plans were made on; empty for a legal plan.</summary>
        public Dictionary<string, List<string>> PlanErrors = new Dictionary<string, List<string>>();
        public GameState State;
        public List<GameEvent> Events = new List<GameEvent>();
        /// <summary>The query module's answers about State (see scripts/golden.ts snapshotQueries), kept raw.</summary>
        public JToken Queries;
    }

    public sealed class GoldenTrace
    {
        public int Format;
        public ContentSource Source;
        public MatchOptions Options;
        public GameState Initial;
        public JToken InitialQueries;
        public List<TraceTurn> Turns = new List<TraceTurn>();
        public MatchResult Result;

        public static GoldenTrace Parse(string json) => Json.Read<GoldenTrace>(json);
    }
}
