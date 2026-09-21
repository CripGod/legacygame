using Newtonsoft.Json.Linq;

namespace StandOnBusiness.Engine.Tests
{
    /// <summary>The first difference between two JSON documents, as a path and the two values, or null when they match.</summary>
    public static class JsonDiff
    {
        public static string First(JToken a, JToken b, string path)
        {
            if (JToken.DeepEquals(a, b)) return null;
            if (a is JObject oa && b is JObject ob)
            {
                foreach (var p in oa.Properties())
                {
                    if (ob[p.Name] == null) return $"{path}.{p.Name}: missing ({p.Value.ToString(Newtonsoft.Json.Formatting.None)})";
                    var d = First(p.Value, ob[p.Name], $"{path}.{p.Name}");
                    if (d != null) return d;
                }
                foreach (var p in ob.Properties()) if (oa[p.Name] == null) return $"{path}.{p.Name}: unexpected ({p.Value.ToString(Newtonsoft.Json.Formatting.None)})";
                return $"{path}: objects differ";
            }
            if (a is JArray aa && b is JArray ab)
            {
                if (aa.Count != ab.Count) return $"{path}: {aa.Count} items expected, {ab.Count} found";
                for (int i = 0; i < aa.Count; i++)
                {
                    var d = First(aa[i], ab[i], $"{path}[{i}]");
                    if (d != null) return d;
                }
                return $"{path}: arrays differ";
            }
            return $"{path}: expected {a.ToString(Newtonsoft.Json.Formatting.None)}, found {b.ToString(Newtonsoft.Json.Formatting.None)}";
        }
    }
}
