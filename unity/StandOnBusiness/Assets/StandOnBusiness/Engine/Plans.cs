using System.Collections.Generic;

namespace StandOnBusiness.Engine
{
    // Plans and match options, a port of the rest of src/engine/types.ts and MatchOptions from setup.ts.

    public sealed class PlayTarget
    {
        public string CharUid;
        public int? Location;
    }

    public sealed class PlayAction
    {
        public string CardId;
        public int Location;
        public PlayTarget Target;
        /// <summary>Direct Entry only: go Inside this turn instead of waiting at the Gates.</summary>
        public bool? Enter;
    }

    public sealed class Relocation
    {
        public string Uid;
        public int To;
    }

    public sealed class Confront
    {
        public string Uid;
        public string ThreatUid;
    }

    public sealed class SummonCommit
    {
        public int Location;
    }

    public sealed class TurnPlan
    {
        public List<PlayAction> Plays = new List<PlayAction>();
        public List<string> Enters = new List<string>();
        public List<Relocation> Relocations = new List<Relocation>();
        public List<Confront> Confronts = new List<Confront>();
        public bool? StandOnBusiness;
        public bool? StepOff;
        public SummonCommit Summon;

        public static TurnPlan Empty() => new TurnPlan();
    }

    public sealed class MatchOptions
    {
        public long Seed;
        public Dictionary<string, string> Handles;
        public Dictionary<string, string> Avatars;
        public Dictionary<string, List<string>> Decks;
        /// <summary>Preset keys ("railroad", "blackstar", "mirror", "random"); used when Decks is absent.</summary>
        public Dictionary<string, string> DeckKeys;
    }

    public sealed class ResolveOptions
    {
        /// <summary>Record a TraceStep after every beat. Costs clones; the AI never asks for it.</summary>
        public bool Trace;
    }

    public sealed class PendingEvent
    {
        public string CardId;
        public string Player;
        public int Location;
    }

    /// <summary>One beat of a turn's resolution, for the UI to replay: the board as it stood right after this beat.</summary>
    public sealed class TraceStep
    {
        public string Kind;
        public string Label;
        public GameState State;
        public List<GameEvent> Events = new List<GameEvent>();
        public List<string> Uids;
        public int? Location;
        public string Player;
        public string CardId;
        public List<PendingEvent> PendingEvents;
    }

    public sealed class ResolveOutput
    {
        public GameState State;
        public List<GameEvent> Events = new List<GameEvent>();
        public List<TraceStep> Trace;
    }
}
