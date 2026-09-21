namespace StandOnBusiness.Engine
{
    /// <summary>
    /// The rules will live in this assembly and nowhere else. It never references UnityEngine
    /// (see noEngineReferences in the asmdef), so it can be tested headless and reused by a server.
    /// </summary>
    public static class EngineInfo
    {
        public const string Version = "0.0.0";
    }
}
