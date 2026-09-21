using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    // The match state, a port of the state half of src/engine/types.ts. Plain data: every field round-trips through
    // JSON key for key with the web engine (StateRoundTripTests checks every recorded turn of every golden trace).
    // Optional fields are nullable and absent when null; strings stand in for the string unions (PlayerId, Zone, Phase).

    public sealed class CharacterInstance
    {
        public string Uid;
        public string DefId;
        public string Owner;
        public string PlantedBy;
        public bool? Amnestied;
        public int Location;
        public string Zone;
        public bool Ready;
        public int ArrivedTurn;
        public int? RelocatedTurn;
        public int PermInfluence;
        public int TempInfluence;
        public int? BlockedEnterTurn;
        public int? SuppressedUntilTurn;
        public bool? Unstable;
        public string BlessedUid;
        public bool? WasHiddenAtCommit;
        public int? PlayedAt;
        public int? PendingRevealBonus;
        public int? ProtectedTurn;
    }

    public sealed class ThreatInstance
    {
        public string Uid;
        public string DefId;
        public int Location;
        public string Target;
        public int ForceRequired;
        public int SpawnedTurn;
    }

    public sealed class TimedThreat
    {
        public int Turn;
        public string ThreatId;
    }

    public sealed class Oath
    {
        public string ThreatUid;
        public string By;
    }

    public sealed class TeamUpAt
    {
        public string Id;
        public string Owner;
    }

    public sealed class TreatyTorn
    {
        public string By;
        public int Until;
    }

    public sealed class LocationState
    {
        public int Index;
        public string DefId;
        public bool Revealed;
        public int? RevealedTurn;
        public List<ThreatInstance> Threats = new List<ThreatInstance>();
        public bool Lost;
        public string LostReason;
        public int? LostTurn;
        public bool? Rebuilt;
        public int? RebuiltTurn;
        public TimedThreat PendingTimedThreat;
        public Oath Oath;
        public List<TeamUpAt> TeamUps;
        public TreatyTorn TreatyTorn;
        public bool? Webbed;
        public string WebbedBy;
        public string RetoldFrom;
        public string FirstRelocatedThisTurn;
        public Dictionary<string, string> FirstRelocatedByOwner;
        public Dictionary<string, int> TempInfluence = new Dictionary<string, int>();
        public Dictionary<string, int> PermInfluence;
        public bool? Sanctified;
        public bool? PactFailed;
    }

    public sealed class NextCharacterDiscount
    {
        public int Amount;
        public int Since;
    }

    public sealed class PlayerState
    {
        public string Id;
        public string Handle;
        public string AvatarDefId;
        public List<string> Deck = new List<string>();
        public int DeckCount;
        public int? DeckEvents;
        public List<string> Hand = new List<string>();
        public List<string> Discard = new List<string>();
        public List<string> LostAtSea;
        public int Setbacks;
        public bool StandUsed;
        public List<string> Spawned = new List<string>();
        public int? EnergyBonus;
        public int? EnergyNextTurn;
        public int? EnergyBanked;
        public NextCharacterDiscount NextCharacterDiscount;
        public int? RelocationsNextTurn;
        public int? RelocationsBonus;
        public Dictionary<string, int> Discounts;
        public bool? CannotStepOff;
        public int Solidarity;
        public int? Legend;
        public int? KnownNextReveal;
        public int? DefendedLocation;
        public int? DefendedTurn;
        public int? ChairLocation;
    }

    public sealed class MatchResult
    {
        /// <summary>null is a draw, and the web engine writes the null, so it stays in the JSON.</summary>
        [JsonProperty(NullValueHandling = NullValueHandling.Include)] public string Winner;
        public string Reason;
        /// <summary>Per Location: a player, null for nobody, or "lost".</summary>
        public List<string> LocationWinners = new List<string>();
        public Dictionary<string, List<int>> Influence = new Dictionary<string, List<int>>();
        public int Stakes;
        public bool Sweep;
        public int Bonus;
        public int Payout;
        public int Turn;
    }

    public sealed class GameEvent
    {
        public string Type;
        public string Text;
        public string Player;
        public int? Location;
        public string Uid;
        public string CardId;
        public string PrivateTo;
        /// <summary>Free-form per event type; the UI keys animations off it. Kept as JSON until the port needs it typed.</summary>
        public JObject Data;
    }

    public sealed class LeadRecord
    {
        public int Turn;
        /// <summary>Per Location: the leader, or null for a tie.</summary>
        public List<string> Leaders = new List<string>();
    }

    public sealed class PendingRaise
    {
        public string By;
        public int DeclaredTurn;
    }

    public sealed class TeamUpClaim
    {
        public string ClaimedBy;
        public int Turn;
        public int Location;
    }

    public sealed class AssistStat
    {
        public int Offered;
        public int Taken;
    }

    public sealed class StandTurn
    {
        public string Player;
        public int Turn;
        public int Proposed;
        public bool Accepted;
    }

    public sealed class SummonRecord
    {
        public int Turn;
        public int Location;
        public bool Success;
    }

    public sealed class StepOffTurn
    {
        public string Player;
        public int Turn;
    }

    public sealed class MatchStats
    {
        public Dictionary<string, List<string>> Plays = new Dictionary<string, List<string>>();
        public Dictionary<string, int> Relocations = new Dictionary<string, int>();
        public Dictionary<string, AssistStat> Assists = new Dictionary<string, AssistStat>();
        public int LeadChanges;
        public int FinalTurnFlips;
        public List<StandTurn> StandTurns = new List<StandTurn>();
        public List<SummonRecord> Summons = new List<SummonRecord>();
        public StepOffTurn StepOffTurn;
        public int GateTurns;
        public int InsideTurns;
    }

    public sealed class GameState
    {
        public long Seed;
        public RngState Rng = new RngState();
        public int Turn;
        public string Phase;
        public Dictionary<string, PlayerState> Players = new Dictionary<string, PlayerState>();
        public List<LocationState> Locations = new List<LocationState>();
        public List<int> RevealOrder = new List<int>();
        public Dictionary<string, TeamUpClaim> TeamUps = new Dictionary<string, TeamUpClaim>();
        public Dictionary<string, CharacterInstance> Characters = new Dictionary<string, CharacterInstance>();
        public string Initiative;
        public int Stakes;
        public int MaxTurns;
        public List<PendingRaise> PendingRaises = new List<PendingRaise>();
        public Dictionary<string, bool> SpawnRolls = new Dictionary<string, bool>();
        public List<string> ThreatsSeen;
        public MatchResult Result;
        public List<LeadRecord> LeadHistory = new List<LeadRecord>();
        public int NextUid;
        public List<GameEvent> LastEvents = new List<GameEvent>();
        public MatchStats Stats = new MatchStats();
        public string ViewFor;

        /// <summary>A deep copy through JSON: the web engine clones the same way, so nothing is shared.</summary>
        public GameState Clone() => Json.Read<GameState>(Json.Write(this));
    }
}
