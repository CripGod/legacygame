using System.Collections.Generic;
using Newtonsoft.Json;

namespace StandOnBusiness.Engine
{
    /// <summary>
    /// The match RNG (mulberry32), a port of src/engine/rng.ts. Its state lives inside GameState, so a match replays
    /// from its seed and plans. Every operation is 32-bit unsigned arithmetic, which is what JavaScript's Math.imul
    /// and >>> compute, so the numbers match the web engine bit for bit; the tests check that against rng.json.
    /// </summary>
    public sealed class RngState
    {
        [JsonProperty("s")] public uint S;

        public RngState() { }
        public RngState(uint s) { S = s; }
        public RngState Clone() => new RngState(S);
    }

    public static class Rng
    {
        public static RngState Make(long seed)
        {
            // (seed >>> 0) || 0x9e3779b9: ToUint32 of the seed, and the golden ratio constant when that is zero.
            uint s = unchecked((uint)seed);
            return new RngState(s != 0 ? s : 0x9e3779b9u);
        }

        /// <summary>Advances the RNG and returns a double in [0, 1).</summary>
        public static double NextFloat(RngState r)
        {
            unchecked
            {
                r.S += 0x6d2b79f5u;
                uint t = r.S;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        /// <summary>Integer in [0, n).</summary>
        public static int NextInt(RngState r, int n)
        {
            return (int)System.Math.Floor(NextFloat(r) * n);
        }

        public static T Pick<T>(RngState r, IReadOnlyList<T> arr)
        {
            return arr[NextInt(r, arr.Count)];
        }

        /// <summary>Fisher-Yates from the top, exactly as the web engine does it, on a copy.</summary>
        public static List<T> Shuffle<T>(RngState r, IReadOnlyList<T> arr)
        {
            var o = new List<T>(arr);
            for (int i = o.Count - 1; i > 0; i--)
            {
                int j = NextInt(r, i + 1);
                (o[i], o[j]) = (o[j], o[i]);
            }
            return o;
        }

        /// <summary>FNV-1a over the string's UTF-16 code units, into a 32-bit seed (sub-seeds are derived from strings).</summary>
        public static uint HashSeed(string str)
        {
            unchecked
            {
                uint h = 2166136261u;
                for (int i = 0; i < str.Length; i++)
                {
                    h ^= str[i];
                    h *= 16777619u;
                }
                return h;
            }
        }
    }
}
