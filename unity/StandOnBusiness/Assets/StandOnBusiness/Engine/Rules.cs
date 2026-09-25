using System;

namespace StandOnBusiness.Engine
{
    /// <summary>The rule constants of src/engine/types.ts. content.json carries the same numbers under "constants".</summary>
    public static class Rules
    {
        public const string PlayerA = "A";
        public const string PlayerB = "B";
        public static readonly string[] Players = { PlayerA, PlayerB };
        public static string Other(string p) => p == PlayerA ? PlayerB : PlayerA;

        public const string ZoneGate = "gate";
        public const string ZoneInside = "inside";
        public const string PhasePlanning = "planning";
        public const string PhaseEnded = "ended";

        public const int Turns = 8;
        public const int ExtendedTurns = 9;
        public const int InsideInfluenceBonus = 1;
        public static readonly int[] EnergyCurve = { 1, 2, 3, 4, 5, 6, 7, 8 };
        public const int EnergyCap = 8;
        public const int LastWordEnergy = 10;
        public const int MaxEnergy = 12;
        public const int LastWordDraw = 1;
        public const int WebSmall = 2;
        public const int WebLarge = 1;
        public const int ReconstructionTurns = 2;
        public const int GateCapacity = 3;
        public const int InsideCapacity = 5;
        public const int StartingHand = 4;
        public const int DeckSize = 24;
        public const int MaxHand = 7;
        public const int LegendReady = 2;
        public const int MaxEvents = 2;
        public const int PlanningSeconds = 90;
        public const int MaxStakes = 16;
        public static readonly int[] StandMultipliers = { 4, 4, 3, 3, 3, 2, 2, 2, 2 };
        public const int WaveFromTurn = 3;
        public const double LaterWaveChance = 0.45;

        /// <summary>A clean sweep pays half the Legacy again on top of the stakes, rounded up.</summary>
        public static int SweepBonus(int stakes) => (stakes + 1) / 2;

        /// <summary>Stand on Business multiplies the Legacy by how early it is called: index turn - 1, clamped.</summary>
        public static int StandMultiplier(int turn)
        {
            return StandMultipliers[Math.Min(StandMultipliers.Length, Math.Max(1, turn)) - 1];
        }
    }
}
