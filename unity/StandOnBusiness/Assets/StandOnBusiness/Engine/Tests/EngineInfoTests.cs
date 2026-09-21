using NUnit.Framework;
using StandOnBusiness.Engine;

namespace StandOnBusiness.Engine.Tests
{
    public class EngineInfoTests
    {
        [Test]
        public void EngineAssemblyCompilesAndTestsRun()
        {
            Assert.AreEqual("0.0.0", EngineInfo.Version);
        }
    }
}
