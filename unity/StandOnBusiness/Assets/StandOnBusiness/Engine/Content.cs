using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine
{
    // The content tables, a port of the definition half of src/engine/types.ts, read from content.json
    // (npm run export). Every effect is a tagged object: Type says which, and the other fields ride along
    // untyped until the resolver that handles that effect is ported and reads them.

    public sealed class Effect
    {
        public string Type;
        [JsonExtensionData] public IDictionary<string, JToken> Args = new Dictionary<string, JToken>();

        public int Int(string key, int fallback = 0) => Args.TryGetValue(key, out var v) && v.Type != JTokenType.Null ? (int)v : fallback;
        public bool Bool(string key, bool fallback = false) => Args.TryGetValue(key, out var v) && v.Type != JTokenType.Null ? (bool)v : fallback;
        public string Str(string key, string fallback = null) => Args.TryGetValue(key, out var v) && v.Type != JTokenType.Null ? (string)v : fallback;
        public bool Has(string key) => Args.ContainsKey(key);
    }

    public sealed class HomeGround
    {
        public List<string> Locations = new List<string>();
        public string Why;
        public bool? Thematic;
    }

    public sealed class RevealDef
    {
        public string Text;
        public Effect Effect;
        public string NeedsTarget;
    }

    public sealed class EstablishedDef
    {
        public string Text;
        public Effect Effect;
    }

    public sealed class RegionBonus
    {
        public string Region;
        public int Influence;
    }

    public sealed class LocationBonus
    {
        public string LocationId;
        public int Influence;
    }

    public sealed class TagDiscount
    {
        public string Tag;
        public int Amount;
    }

    public sealed class PassiveDef
    {
        public string Text;
        public bool? Unstable;
        public int? LeaderPenalty;
        public RegionBonus RegionBonus;
        public LocationBonus LocationBonus;
        public TagDiscount TagDiscount;
        public bool? RisesAgain;
        public bool? CurfewImmune;
        public int? Shelter;
    }

    /// <summary>How a card that is never in a deck arrives: establishedAt, onReveal, setAt or insideAt.</summary>
    public sealed class SpawnRule
    {
        public string Type;
        public double? Chance;
        public string LocationId;
        public int? Count;
        public List<string> CardIds;
        public string Headline;
        public string Cta;
        public bool? Unique;
        public string Into;
    }

    public sealed class CharacterDef
    {
        public string Kind;
        public string Id;
        public string Name;
        public string Category;
        public HomeGround Home;
        public int Cost;
        public string Short;
        public string Summary;
        public int Influence;
        public int Force;
        public List<string> Tags = new List<string>();
        public List<string> Keywords = new List<string>();
        public bool Hidden;
        public RevealDef Reveal;
        public EstablishedDef Established;
        public PassiveDef Passive;
        public SpawnRule Spawn;
        public List<string> Identity = new List<string>();
        public string Era;
        public string Blurb;
        public string History;
    }

    public sealed class EventDef
    {
        public string Kind;
        public string Id;
        public string Name;
        public string Short;
        public int Cost;
        public string Summary;
        public string Text;
        public Effect Effect;
        public bool NeedsLocation;
        public string Blurb;
        public string History;
        public SpawnRule Spawn;
        public bool? Curse;
    }

    public sealed class Transform
    {
        public string Id;
        public int AfterTurns;
    }

    public sealed class LocationDef
    {
        public string Id;
        public string Name;
        public string Era;
        public string Rule;
        public string Short;
        public string Blurb;
        public Effect Effect;
        public string SpawnOnReveal;
        public TimedThreat TimedThreat;
        public double? Weight;
        public bool? NotInPool;
        public Transform TransformsInto;
        public bool? NoThreats;
        public string History;
        public List<string> ImmuneThreats;
        public string Region;
        public bool? Curfew;
        public bool? Hidden;
    }

    public sealed class ThreatDef
    {
        public string Id;
        public string Name;
        public string Family;
        public string Text;
        public bool Split;
        public int Force;
        public bool? RequiresBoth;
        public string Effect;
        public int? LostAfterTurns;
        public bool? Once;
        public int? FiresAfterTurns;
        public int? Window;
        public string Standing;
        public string Blurb;
        public string History;
    }

    public sealed class TeamUpDef
    {
        public string Id;
        public string Name;
        public List<string> Members = new List<string>();
        public string Kind;
        public Effect Effect;
        public string Text;
        public string Blurb;
    }

    public sealed class DeckDef
    {
        public string Key;
        public string Name;
        public string Style;
        public List<string> Cards = new List<string>();
    }

    public sealed class SummonDef
    {
        public string Id;
        public string Name;
        public int Force;
        public int MinEach;
        public string Text;
        public string Blurb;
    }

    public sealed class Reference
    {
        public string Title;
        public string Url;
        public string By;
        public string Note;
    }

    public sealed class ContentSource
    {
        public string Commit;
        public string Generator;
    }

    public sealed class ContentTable
    {
        public int Format;
        public ContentSource Source;
        public Dictionary<string, JToken> Constants = new Dictionary<string, JToken>();
        public List<CharacterDef> Characters = new List<CharacterDef>();
        public List<EventDef> Events = new List<EventDef>();
        public List<ThreatDef> Threats = new List<ThreatDef>();
        public List<string> RandomThreatPool = new List<string>();
        public List<LocationDef> Locations = new List<LocationDef>();
        public LocationDef UnknownLocation;
        public Dictionary<string, DeckDef> Decks = new Dictionary<string, DeckDef>();
        public List<TeamUpDef> TeamUps = new List<TeamUpDef>();
        public SummonDef Summon;
        public Dictionary<string, List<Reference>> References = new Dictionary<string, List<Reference>>();

        [JsonIgnore] public Dictionary<string, CharacterDef> CharacterById { get; private set; }
        [JsonIgnore] public Dictionary<string, EventDef> EventById { get; private set; }
        [JsonIgnore] public Dictionary<string, ThreatDef> ThreatById { get; private set; }
        [JsonIgnore] public Dictionary<string, LocationDef> LocationById { get; private set; }

        public static ContentTable Parse(string json)
        {
            var c = Json.Read<ContentTable>(json);
            c.Index();
            return c;
        }

        public void Index()
        {
            CharacterById = new Dictionary<string, CharacterDef>();
            foreach (var d in Characters) CharacterById[d.Id] = d;
            EventById = new Dictionary<string, EventDef>();
            foreach (var d in Events) EventById[d.Id] = d;
            ThreatById = new Dictionary<string, ThreatDef>();
            foreach (var d in Threats) ThreatById[d.Id] = d;
            LocationById = new Dictionary<string, LocationDef>();
            foreach (var d in Locations) LocationById[d.Id] = d;
            // The redacted placeholder is looked up by id too (LOCATION_BY_ID holds it in the web engine).
            if (UnknownLocation != null) LocationById[UnknownLocation.Id] = UnknownLocation;
        }
    }
}
