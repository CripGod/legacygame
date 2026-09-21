using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace StandOnBusiness.Engine
{
    /// <summary>
    /// How the engine's data reads and writes JSON: camelCase keys, and an absent key for every null, which is what the
    /// web engine writes for an undefined optional field. Fields that the web engine writes as an explicit null carry
    /// their own NullValueHandling.Include (MatchResult.Winner).
    /// </summary>
    public static class Json
    {
        public static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            // Members are camelCase; dictionary keys ("A", "B", card ids, uids) are written as they are.
            ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false, OverrideSpecifiedNames = false } },
            NullValueHandling = NullValueHandling.Ignore,
            Formatting = Formatting.None,
        };

        public static string Write<T>(T value) => JsonConvert.SerializeObject(value, Settings);
        public static T Read<T>(string json) => JsonConvert.DeserializeObject<T>(json, Settings);
    }
}
